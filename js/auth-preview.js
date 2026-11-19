// Preview mode: the website without an account server keeps demo accounts in this browser's
// localStorage (test / test = Pro, free / free = Free). Loaded only when CONFIG.apiBase is empty,
// so the real site never downloads this file's code.
import { CONFIG } from './config.js';
import { ApiError } from './api-error.js';
import { RELEASE } from './release.js';

const USERS = 'swi.site.users';
const SESSION = 'swi.site.session';
const wait = (ms = 380) => new Promise((r) => setTimeout(r, ms));
const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } },
};
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPassword(password, saltHex) {
  if (!crypto.subtle) return 'plain:' + password; // non-secure context (e.g. plain http on a LAN IP)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 210000 }, key, 256));
}

function licenseKey() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const chars = [...bytes].map((b) => A[b % A.length]).join('');
  return 'SWI-' + chars.match(/.{5}/g).join('-');
}

function thisDevice() {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Unknown OS';
  return { id: 'dev_' + randomHex(6), name: os === 'Windows' ? 'This PC' : 'This computer', os, lastSeen: new Date().toISOString(), current: true };
}

async function seed() {
  const users = store.get(USERS, {});
  if (users.test && users.free) return users;
  for (const [email, plan, name] of [['test', 'pro', 'Test Pro'], ['free', 'free', 'Test Free']]) {
    if (users[email]) continue;
    const salt = randomHex(16);
    users[email] = {
      id: 'usr_' + randomHex(8), name, email, plan, salt, hash: await hashPassword(email, salt), created: '2026-09-14T10:00:00Z',
      licenseKey: licenseKey(),
      invoices: plan === 'pro' ? [{ id: 'INV-2026-0412', date: '2026-09-14', amount: CONFIG.pro.price, description: 'Wicked Pro — monthly subscription', url: 'invoice.html?id=INV-2026-0412' }] : [],
      subscription: plan === 'pro' ? { status: 'active' } : null,
      devices: plan === 'pro' ? [
        { id: 'dev_' + randomHex(6), name: 'STUDIO-PC', os: 'Windows 11', lastSeen: new Date(Date.now() - 3600e3 * 26).toISOString() },
        { id: 'dev_' + randomHex(6), name: 'LAPTOP-7K2', os: 'Windows 10', lastSeen: new Date(Date.now() - 3600e3 * 24 * 9).toISOString() },
      ] : [],
    };
  }
  store.set(USERS, users);
  return users;
}

function currentEmail() {
  try { return sessionStorage.getItem(SESSION) || store.get(SESSION, null); } catch { return null; }
}
function publicAccount(u) {
  return {
    user: { id: u.id, name: u.name, email: u.email, plan: u.plan, created: u.created, emailVerified: true, role: 'user' },
    license: { key: u.licenseKey, plan: u.plan, maxDevices: u.maxDevices || CONFIG.maxDevices, updatesUntil: u.plan === 'pro' ? nextMonth() : null, proUntil: u.subscription ? nextMonth() : null },
    credits: { access: 0, ai: 0, accessDays: CONFIG.credits?.accessDays || 30 },
    entitlement: { maxDevices: u.maxDevices || CONFIG.maxDevices, source: 'preview' },
    subscription: u.subscription ? { status: u.subscription.status, renews: u.subscription.status === 'active', renewsAt: u.subscription.interval === 'year' ? addYear(new Date().toISOString()) : nextMonth(), endsAt: null, interval: u.subscription.interval || 'month' } : null,
    yearlyAvailable: !!CONFIG.proYearly,
    devices: u.devices,
    // Older demo accounts stored '#' as the invoice URL; point them at the local invoice page.
    invoices: (u.invoices || []).map((i) => ({ ...i, url: i.url && i.url !== '#' ? i.url : 'invoice.html?id=' + encodeURIComponent(i.id) })),
  };
}
function nextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}
function addYear(iso) {
  const d = new Date(iso);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString();
}
function requireUser() {
  const users = store.get(USERS, {});
  const u = users[currentEmail()];
  if (!u) throw new ApiError('unauthorized', null, 401);
  return { users, u };
}

export const preview = {
  async register({ name, email, password }) {
    await wait();
    const users = await seed();
    email = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError('invalid_email');
    if (String(password).length < 10) throw new ApiError('weak_password');
    if (users[email]) throw new ApiError('email_taken');
    const salt = randomHex(16);
    users[email] = { id: 'usr_' + randomHex(8), name: String(name).trim(), email, plan: 'free', salt, hash: await hashPassword(password, salt), created: new Date().toISOString(), licenseKey: licenseKey(), devices: [] };
    store.set(USERS, users);
    store.set(SESSION, email);
    return publicAccount(users[email]);
  },
  async login({ email, password, remember }) {
    await wait();
    const users = await seed();
    email = String(email).trim().toLowerCase();
    const u = users[email];
    if (!u || (await hashPassword(password, u.salt)) !== u.hash) throw new ApiError('invalid_credentials', null, 401);
    if (!u.devices.some((d) => d.current)) { u.devices.unshift(thisDevice()); store.set(USERS, users); }
    try { localStorage.removeItem(SESSION); sessionStorage.removeItem(SESSION); } catch { /* ignore */ }
    if (remember) store.set(SESSION, email); else sessionStorage.setItem(SESSION, email);
    return publicAccount(u);
  },
  async logout() {
    try { localStorage.removeItem(SESSION); sessionStorage.removeItem(SESSION); } catch { /* ignore */ }
    return {};
  },
  async logoutEverywhere() { return preview.logout(); },
  async requestReset() { await wait(); return {}; }, // the server always answers the same, whether the account exists or not
  // links from emails only exist with a real server
  async confirmReset() { await wait(); throw new ApiError('invalid_token'); },
  async verifyEmail() { await wait(); throw new ApiError('invalid_token'); },
  async resendVerification() { await wait(); return {}; },
  async session() { return currentEmail() ? publicAccount(requireUser().u) : null; },
  async account() { await wait(120); return publicAccount(requireUser().u); },
  async updateProfile({ name }) {
    await wait();
    const { users, u } = requireUser();
    u.name = String(name).trim() || u.name;
    store.set(USERS, users);
    return publicAccount(u);
  },
  async changePassword({ current, next }) {
    await wait();
    const { users, u } = requireUser();
    if ((await hashPassword(current, u.salt)) !== u.hash) throw new ApiError('wrong_password');
    if (String(next).length < 10) throw new ApiError('weak_password');
    u.salt = randomHex(16);
    u.hash = await hashPassword(next, u.salt);
    store.set(USERS, users);
    return {};
  },
  async deleteAccount({ password }) {
    await wait();
    const { users, u } = requireUser();
    if ((await hashPassword(password, u.salt)) !== u.hash) throw new ApiError('wrong_password');
    delete users[u.email];
    store.set(USERS, users);
    return preview.logout();
  },
  async revokeDevice(id) {
    await wait(250);
    const { users, u } = requireUser();
    u.devices = u.devices.filter((d) => d.id !== id);
    store.set(USERS, users);
    return publicAccount(u);
  },
  async status() { return { announcement: null }; },
  async releases() {
    await wait(150);
    const latest = {
      version: RELEASE.version,
      date: RELEASE.date,
      size: RELEASE.attached ? RELEASE.size : '—',
      bytes: RELEASE.bytes || 0,
      sha256: RELEASE.sha256,
      sha512: RELEASE.sha512 || '',
      channel: RELEASE.channel || CONFIG.updates?.channel || 'stable',
      feedUrl: RELEASE.feedUrl || CONFIG.updates?.feedUrl || '',
      electronFeedUrl: RELEASE.electronFeedUrl || CONFIG.updates?.electronFeedUrl || '',
      notes: RELEASE.notes,
      file: RELEASE.file,
      url: (() => {
        const host = String(globalThis.location?.hostname || '');
        const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(host);
        const base = isLocal ? '' : String(CONFIG.updates?.baseUrl || '').replace(/\/+$/, '');
        return base ? `${base}/${RELEASE.file}` : `downloads/${RELEASE.file}`;
      })(),
      attached: RELEASE.attached,
      kind: RELEASE.kind || 'Installer',
      changes: RELEASE.changes || [],
    };
    return { releases: [latest, ...RELEASE.older] };
  },
  async redeem({ key }) {
    await wait();
    const { users, u } = requireUser();
    if (!/^SWI-PRO-([A-Z2-9]{5}-){3}[A-Z2-9]{5}$/.test(String(key).trim().toUpperCase())) throw new ApiError('invalid_key');
    u.plan = 'pro';
    u.proSince ||= new Date().toISOString();
    store.set(USERS, users);
    return publicAccount(u);
  },
  async checkout(interval = 'month') {
    await wait();
    const { users, u } = requireUser();
    const year = interval === 'year' && !!CONFIG.proYearly;
    u.plan = 'pro';
    u.proSince = new Date().toISOString();
    u.subscription = { status: 'active', interval: year ? 'year' : 'month' };
    const invId = 'INV-' + new Date().getFullYear() + '-' + randomHex(2).toUpperCase();
    u.invoices = [{ id: invId, date: new Date().toISOString().slice(0, 10), amount: year ? CONFIG.proYearly.price : CONFIG.pro.price, description: year ? 'Wicked Pro — yearly subscription' : 'Wicked Pro — monthly subscription', url: 'invoice.html?id=' + invId }, ...(u.invoices || [])];
    store.set(USERS, users);
    return { upgraded: true };
  },
  async portal() {
    await wait();
    const { u } = requireUser();
    if (!u.subscription) throw new ApiError('no_subscription');
    return { url: '#billing' }; // the real site opens the configured provider's portal
  },
  // Credits are server-side. Preview exposes an empty read-only shape so the view can
  // explain the difference without pretending a local grant is a real purchase.
  async credits() {
    await wait(80);
    const c = publicAccount(requireUser().u).credits;
    return { ...c, ledger: [], pending: [] };
  },
  async claimCredit() { await wait(); throw new ApiError('preview_only'); },
  async redeemCredits() { await wait(); throw new ApiError('preview_only'); },
  async mintCreditKey() { await wait(); throw new ApiError('preview_only'); },
  async spendAi() { await wait(); throw new ApiError('preview_only'); },
};


export const hasLocalSession = () => !!currentEmail();
