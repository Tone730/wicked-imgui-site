#!/usr/bin/env node
// Wicked Imgui — free, dependency-free account + license server.
// Node 18+ only. Run: node server.js   →   http://127.0.0.1:8787
//
// JSON endpoints:
//   GET  /health                       service check
//   GET  /v1/status                    announcement / update status for the dashboard
//   GET  /v1/releases                  update feed from downloads/latest.json
//
//   POST /v1/auth/register             {name,email,password,remember}
//   POST /v1/auth/login                {email,password,remember}
//   POST /v1/auth/logout               (clears the session cookie)
//   POST /v1/auth/logout-all
//   POST /v1/auth/password-reset       {email}  (always answers the same)
//   POST /v1/auth/password-reset/confirm {token,password}
//   POST /v1/auth/verify-email         {token}
//   POST /v1/auth/resend-verification
//   GET  /v1/auth/session              {user:null} or the account
//   GET  /v1/account                   full account
//   PATCH /v1/account                  {name}
//   POST /v1/account/password          {current,next}
//   DELETE /v1/account                 {password}
//   DELETE /v1/devices/:id             sign one computer out
//   POST /v1/account/redeem            {key}
//   POST /v1/billing/checkout          {interval:'month'|'year'} → {url} when configured
//   POST /v1/billing/portal            → {url} when configured
//   POST /v1/billing/webhook           generic HMAC or Payhip-signed event sink
//   GET  /v1/credits                   balances, limits and recent credit ledger
//   POST /v1/credits/claim             {code} claim access / AI credits granted by admin
//   POST /v1/credits/redeem            {credits} turn access credits into Pro time
//   POST /v1/credits/key               {credits,maxDevices} mint your own limited Pro key
//   POST /v1/ai/usage                  {units,idempotencyKey} spend AI credits
//
//   POST /issue      {email,plan,days} create a signed key (admin only)
//   POST /validate   {key}             check signature, expiry and device count
//   POST /activate   {key,device,name,os} add a computer (key's device limit)
//   POST /deactivate {key,device}      free a computer
//   GET  /stats                        counts (admin only)
//   /admin/api/*                       web admin panel (admin role or ADMIN_TOKEN)
//     GET  session, overview, users, keys, manual-sales, audit
//     POST user/*, key/*, manual-sale
//
// Admin access is either an account in ADMIN_EMAILS (role=admin) or a Bearer
// ADMIN_TOKEN. If neither is configured every admin route is denied. When this
// server also serves the static folder, GET /js/config.js is rewritten so the browser
// uses apiBase:'/' — no separate build step is needed for the simplest deployment.
// See README.md here and DEPLOY.md in the dashboard root.

'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// Dependency-free .env loader. Real environment variables always win. Secrets stay
// out of the source tree; copy ../.env.example to ../.env and fill it locally.
(function loadEnv() {
  for (const file of [path.join(__dirname, '..', '.env'), path.join(__dirname, '.env')]) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const at = trimmed.indexOf('=');
      if (at < 0) continue;
      const key = trimmed.slice(0, at).trim();
      if (!/^[A-Z0-9_]+$/.test(key) || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
      let value = trimmed.slice(at + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[key] = value;
    }
  }
})();

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.BIND_HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');
const SECRET = process.env.LICENSE_SECRET || 'wicked-imgui-DEV-secret-change-me';
const ADMIN = process.env.ADMIN_TOKEN || '';
const MAX_DEVICES = Number(process.env.MAX_DEVICES || 3);
const DATA = process.env.DATA_FILE || path.join(__dirname, 'data', 'licenses.json');
const ACCOUNTS_FILE = process.env.ACCOUNTS_FILE || path.join(path.dirname(DATA), 'accounts.json');
const SITE_DIR = path.resolve(process.env.SITE_DIR || path.join(__dirname, '..'));
const PUBLIC_API_BASE = process.env.PUBLIC_API_BASE || '';
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean));
const COOKIE = 'swi_session';
const COOKIE_SECURE = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production';
const SAMESITE = process.env.COOKIE_SAMESITE || 'Lax';
const SESSION_DAYS = Number(process.env.SESSION_DAYS || 30);
const DEV_MAIL_TOKENS = process.env.DEV_MAIL_TOKENS === '1';
const MAIL_WEBHOOK_URL = process.env.MAIL_WEBHOOK_URL || '';
const BILLING_PROVIDER = (process.env.BILLING_PROVIDER || 'generic').toLowerCase();
const BILLING_WEBHOOK_SECRET = process.env.BILLING_WEBHOOK_SECRET || '';
const PAYHIP_API_KEY = process.env.PAYHIP_API_KEY || '';
const CHECKOUT = {
  month: process.env.CHECKOUT_URL_MONTHLY || '',
  year: process.env.CHECKOUT_URL_YEARLY || '',
  portal: process.env.CHECKOUT_PORTAL_URL || '',
};
// Admin access can be granted by email (role on the account) and/or by the single token.
// Both are optional by design, but an admin route must never be open when neither exists.
const ADMIN_EMAILS = new Set((process.env.ADMIN_EMAILS || '').split(',').map((s) => String(s).trim().toLowerCase()).filter(Boolean));
const AUDIT_FILE = process.env.AUDIT_FILE || path.join(path.dirname(DATA), 'audit.jsonl');
const ACCESS_CREDIT_DAYS = Math.max(1, Number(process.env.ACCESS_CREDIT_DAYS || 30));
const MAX_KEY_DEVICES = Math.min(10, Math.max(1, Number(process.env.MAX_KEY_DEVICES || 5)));
// Keep these in step with js/config.js → CONFIG.legal. The server records what the client accepted.
const TERMS_VERSION = process.env.TERMS_VERSION || '2026-11-19';
const PRIVACY_VERSION = process.env.PRIVACY_VERSION || '2026-11-19';
const isDev = SECRET.startsWith('wicked-imgui-DEV');

if (isDev) console.warn('⚠  LICENSE_SECRET is the dev default. Set a real secret before exposing this server.');
fs.mkdirSync(path.dirname(DATA), { recursive: true });
fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });
fs.mkdirSync(path.dirname(AUDIT_FILE), { recursive: true });

// ---------------------------------------------------------------- storage
function readFile(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeFile(file, db) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}
const read = () => readFile(DATA, { keys: {} });
const write = (db) => writeFile(DATA, db);
const readAccounts = () => {
  const db = readFile(ACCOUNTS_FILE, {});
  db.users ||= {}; db.sessions ||= {}; db.tokens ||= {};
  db.grants ||= {}; db.manualSales ||= []; db.ledger ||= []; db.aiSpend ||= {};
  db.announcement ||= { text: '', level: 'info', enabled: false, updatedAt: null };
  return db;
};
const writeAccounts = (db) => writeFile(ACCOUNTS_FILE, db);

/** Older accounts predate credits and entitlements — fill them in on every read. */
function ensureAccountShape(u) {
  if (!u) return u;
  u.credits ||= { access: 0, ai: 0 };
  u.entitlement ||= { maxDevices: MAX_DEVICES, source: 'subscription' };
  u.invoices ||= []; u.devices ||= []; u.redeemed ||= [];
  return u;
}
function ledger(db, entry) {
  db.ledger ||= [];
  db.ledger.unshift({ at: new Date().toISOString(), ...entry });
  db.ledger = db.ledger.slice(0, 5000);
}
const maskKey = (value) => {
  const s = String(value || '');
  return s.length > 18 ? s.slice(0, 12) + '…' + s.slice(-5) : s;
};

// Append-only audit log. Secrets (passwords, tokens, hashes, signatures) are never written.
let auditLines = 0;
function audit(action, detail = {}, req, actor = 'system') {
  try {
    const clean = {};
    for (const [k, v] of Object.entries(detail)) {
      if (['actor', 'target', 'result', 'password', 'token', 'hash', 'sig', 'cookie', 'authorization', 'apiKey'].includes(k)) continue;
      if (typeof v === 'string') clean[k] = v.slice(0, 300);
      else if (typeof v === 'number' || typeof v === 'boolean') clean[k] = v;
    }
    const entry = {
      at: new Date().toISOString(), action,
      actor: detail.actor || actor,
      target: String(detail.target || '').slice(0, 200),
      result: detail.result || 'ok',
      detail: clean,
      ip: req?.socket?.remoteAddress || '',
      ua: String(req?.headers?.['user-agent'] || '').slice(0, 160),
    };
    fs.appendFileSync(AUDIT_FILE, JSON.stringify(entry) + '\n');
    if (++auditLines % 200 === 0) {
      const lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean);
      if (lines.length > 5000) fs.writeFileSync(AUDIT_FILE, lines.slice(-5000).join('\n') + '\n');
    }
  } catch (err) {
    console.warn('Audit write failed:', err.message);
  }
}
function readAudit({ limit = 100, action = '', actor = '', q = '' } = {}) {
  let lines;
  try { lines = fs.readFileSync(AUDIT_FILE, 'utf8').split('\n').filter(Boolean); } catch { return []; }
  const needle = String(q || '').trim().toLowerCase();
  const rows = [];
  for (let i = lines.length - 1; i >= 0 && rows.length < limit; i--) {
    let e;
    try { e = JSON.parse(lines[i]); } catch { continue; }
    if (action && !String(e.action || '').toLowerCase().includes(String(action).toLowerCase())) continue;
    if (actor && !String(e.actor || '').toLowerCase().includes(String(actor).toLowerCase())) continue;
    if (needle && !JSON.stringify(e).toLowerCase().includes(needle)) continue;
    rows.push(e);
  }
  return rows;
}

function sign(parts) {
  return crypto.createHmac('sha256', SECRET).update(parts.join('|')).digest('hex').slice(0, 8).toUpperCase();
}
function eq(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function fail(code, status, message) {
  return Object.assign(new Error(message || code), { code, status });
}

// ---------------------------------------------------------------- responses
function corsHeaders(req) {
  const origin = req.headers.origin;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
  const loopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
  if (origin && (ALLOWED_ORIGINS.has(origin) || loopback.test(origin))) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE, OPTIONS';
  }
  return headers;
}
function reply(res, status, body) {
  res.writeHead(status, corsHeaders(res.wickedReq || { headers: {} }));
  res.end(JSON.stringify(body));
}
function originOK(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin navigation / server-to-server
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 262144) {
        reject(fail('too_big', 413, 'Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}
function isAdminUser(u) {
  return !!u && (u.role === 'admin' || ADMIN_EMAILS.has(u.email));
}
/** Admin panel and license tools accept either a configured account session or the token. */
function adminAuth(req) {
  if (ADMIN && req.headers.authorization === 'Bearer ' + ADMIN) return { mode: 'token', actor: 'token' };
  const token = cookieToken(req);
  const db = readAccounts();
  const session = db.sessions[token];
  const u = session && new Date(session.expires).getTime() >= Date.now() ? ensureAccountShape(db.users[session.email]) : null;
  if (u && !u.disabled && isAdminUser(u)) return { mode: 'account', actor: u.email, db, u };
  if (!ADMIN && ADMIN_EMAILS.size === 0) {
    throw fail('admin_unconfigured', 503, 'Admin access is not configured. Set ADMIN_EMAILS or ADMIN_TOKEN on the server.');
  }
  throw fail('unauthorized', 401, 'Admin access required.');
}

// ---------------------------------------------------------------- accounts
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password, stored) {
  const [kind, salt, hash] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !salt || !hash) return false;
  const actual = crypto.scryptSync(String(password), Buffer.from(salt, 'hex'), 64);
  return eq(actual.toString('hex'), hash);
}
const normalEmail = (email) => String(email || '').trim().toLowerCase();
const validEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const addMonths = (iso, n) => { const d = new Date(iso); d.setMonth(d.getMonth() + n); return d.toISOString(); };
const addDays = (n) => new Date(Date.now() + n * 86400000).toISOString();
const addYear = (iso) => { const d = new Date(iso); d.setFullYear(d.getFullYear() + 1); return d.toISOString(); };

function newUser({ name, email, password, plan = 'free', terms = null }) {
  const emailKey = normalEmail(email);
  const issued = issue({ email: emailKey, plan, days: 3650, source: 'registration' });
  return {
    id: 'usr_' + crypto.randomBytes(8).toString('hex'),
    name: String(name || '').trim() || emailKey.split('@')[0],
    email: emailKey,
    plan,
    role: ADMIN_EMAILS.has(emailKey) ? 'admin' : 'user',
    hash: hashPassword(password),
    created: new Date().toISOString(),
    // With no email delivery configured, do not claim a link was sent or gate the UI on it.
    emailVerified: !MAIL_WEBHOOK_URL,
    licenseKey: issued.key,
    invoices: [],
    subscription: null,
    devices: [],
    redeemed: [],
    credits: { access: 0, ai: 0 },
    entitlement: { maxDevices: MAX_DEVICES, source: 'registration' },
    // Versioned acceptance, recorded at the moment the account is created.
    terms: terms ? {
      version: String(terms.version || '').slice(0, 32),
      privacyVersion: String(terms.privacyVersion || '').slice(0, 32),
      acceptedAt: new Date().toISOString(),
      text: 'signup-checkbox',
    } : null,
    disabled: false,
  };
}

/** The response shape js/auth-preview.js uses, so the dashboard needs no live-mode branches. */
function publicAccount(u) {
  const sub = u.subscription || null;
  return {
    user: {
      id: u.id, name: u.name, email: u.email, plan: u.plan,
      created: u.created, emailVerified: u.emailVerified !== false,
      role: isAdminUser(u) ? 'admin' : 'user',
    },
    license: {
      key: u.licenseKey,
      plan: u.plan,
      maxDevices: (u.entitlement && u.entitlement.maxDevices) || MAX_DEVICES,
      updatesUntil: u.proUntil || (sub ? sub.renewsAt : null) || (u.plan === 'pro' ? addMonths(new Date().toISOString(), 1) : null),
      proUntil: u.proUntil || null,
    },
    credits: { access: u.credits?.access || 0, ai: u.credits?.ai || 0, accessDays: ACCESS_CREDIT_DAYS },
    entitlement: u.entitlement || { maxDevices: MAX_DEVICES, source: 'registration' },
    subscription: sub,
    yearlyAvailable: true,
    devices: u.devices || [],
    invoices: (u.invoices || []).map((i) => ({ ...i, url: i.url || 'invoice.html?id=' + encodeURIComponent(i.id) })),
  };
}

function cookieToken(req) {
  const raw = String(req.headers.cookie || '');
  for (const part of raw.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE) return decodeURIComponent(rest.join('='));
  }
  return '';
}
function setCookie(res, token, clear = false) {
  const parts = [`${COOKIE}=${token}`, 'Path=/', 'HttpOnly', `SameSite=${SAMESITE}`, `Max-Age=${clear ? 0 : SESSION_DAYS * 86400}`];
  if (COOKIE_SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}
function startSession(res, db, email) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.sessions[token] = { email, created: new Date().toISOString(), expires: addDays(SESSION_DAYS) };
  writeAccounts(db);
  setCookie(res, token);
  return token;
}
function requireUser(req) {
  const token = cookieToken(req);
  const db = readAccounts();
  const session = db.sessions[token];
  if (!session || new Date(session.expires).getTime() < Date.now()) throw fail('unauthorized', 401, 'Sign in to continue.');
  const u = ensureAccountShape(db.users[session.email]);
  if (!u) throw fail('unauthorized', 401, 'Sign in to continue.');
  if (u.disabled) throw fail('account_disabled', 403, 'This account has been disabled.');
  if (applyPendingGrants(db, u, req, 'request')) writeAccounts(db);
  return { db, token, u };
}
function rememberDevice(u, req) {
  const ua = String(req.headers['user-agent'] || 'unknown');
  const id = 'web_' + crypto.createHash('sha256').update(ua).digest('hex').slice(0, 12);
  if (!u.devices) u.devices = [];
  const found = u.devices.find((d) => d.id === id);
  if (found) found.lastSeen = new Date().toISOString();
  else u.devices.unshift({
    id,
    name: /Windows/i.test(ua) ? 'Web browser · Windows' : /Mac/i.test(ua) ? 'Web browser · macOS' : /Linux/i.test(ua) ? 'Web browser · Linux' : 'Web browser',
    os: /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Unknown OS',
    lastSeen: new Date().toISOString(),
  });
}

const limits = new Map();
function rateLimit(req, name) {
  const ip = req.socket.remoteAddress || 'unknown';
  const key = ip + ':' + name;
  const now = Date.now();
  const hit = limits.get(key) || { n: 0, reset: now + 600000 };
  if (hit.reset < now) { hit.n = 0; hit.reset = now + 600000; }
  hit.n += 1;
  limits.set(key, hit);
  if (hit.n > 20) throw fail('rate_limited', 429, 'Too many attempts. Wait a minute and try again.');
}

async function deliverToken(db, type, email, ttl) {
  const token = crypto.randomBytes(24).toString('base64url');
  db.tokens[token] = { email, type, expires: new Date(Date.now() + ttl).toISOString() };
  writeAccounts(db);
  if (DEV_MAIL_TOKENS) console.log(`${type} token for ${email}: ${token}`);
  if (!MAIL_WEBHOOK_URL) return { token, delivery: 'not_configured' };
  try {
    await fetch(MAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: email, type, token, app: 'Wicked Imgui' }),
      signal: AbortSignal.timeout(5000),
    });
    return { token, delivery: 'sent' };
  } catch {
    return { token, delivery: 'failed' };
  }
}
function useToken(db, token, type) {
  const rec = db.tokens[String(token || '')];
  if (!rec || rec.type !== type || new Date(rec.expires).getTime() < Date.now()) throw fail('invalid_token', 400, 'This link has expired or was already used.');
  delete db.tokens[String(token)];
  return rec;
}

// ---------------------------------------------------------------- credits and grants
/**
 * Two separate balances:
 *  - access: prepaid Pro days. One credit = ACCESS_CREDIT_DAYS, redeemable for your own
 *    Pro time or spendable to mint a transferable, limited Pro key.
 *  - ai: metered units for AI actions. The local full-access build stays offline; this
 *    ledger is authoritative for anything wired to the account API.
 * Grants can be issued before an account exists and are claimed automatically on login.
 */
function createGrant(db, { email, kind, value = 0, days = 0, maxDevices = 0, source = 'manual', note = '', actor = 'admin' }) {
  const code = 'WI-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  db.grants[code] = {
    code, email: normalEmail(email), kind, value: Number(value) || 0, days: Number(days) || 0,
    maxDevices: Number(maxDevices) || 0, source: String(source).slice(0, 80),
    note: String(note || '').slice(0, 200), created: new Date().toISOString(),
    claimedAt: null, claimedBy: null, actor: String(actor).slice(0, 120),
  };
  return db.grants[code];
}
function applyGrant(db, u, grant) {
  if (grant.claimedAt) return false;
  ensureAccountShape(u);
  if (grant.kind === 'access') u.credits.access += Number(grant.value) || 0;
  else if (grant.kind === 'ai') u.credits.ai += Number(grant.value) || 0;
  else if (grant.kind === 'pro') {
    const span = Math.max(1, Number(grant.days) || 30);
    const until = Date.now() + span * 86400000;
    const previous = new Date(u.proUntil || 0).getTime() || 0;
    u.plan = 'pro';
    u.proUntil = new Date(Math.max(Date.now(), previous, until)).toISOString();
    if (Number(grant.maxDevices) > 0) u.entitlement.maxDevices = Math.max(u.entitlement.maxDevices || 0, Math.min(MAX_KEY_DEVICES, Number(grant.maxDevices)));
    u.entitlement.source = String(grant.source || 'manual');
  } else return false;
  grant.claimedAt = new Date().toISOString();
  grant.claimedBy = u.email;
  ledger(db, { action: 'grant.claim', email: u.email, kind: grant.kind, value: grant.value || grant.days, ref: grant.code });
  return true;
}
function applyPendingGrants(db, u, req, source) {
  let count = 0;
  for (const grant of Object.values(db.grants)) {
    if (!grant.claimedAt && grant.email === u.email && applyGrant(db, u, grant)) count++;
  }
  if (count) audit('credits.grant_auto', { target: u.email, count, source }, req);
  return count;
}

// ---------------------------------------------------------------- license keys
/** Keys carry their own limits. Older keys without those fields keep the global defaults. */
const keyMax = (rec) => Math.min(MAX_KEY_DEVICES, Math.max(1, Number(rec?.maxDevices) || MAX_DEVICES));
function issue({ email, plan = 'pro', days = 365, maxDevices, maxRedemptions = 0, aiCredits = 0, note = '', source = 'admin', issuedBy = 'system' }) {
  if (!validEmail(normalEmail(email))) throw fail('invalid_request', 400, 'A valid email is required');
  if (!['free', 'pro'].includes(plan)) throw fail('invalid_request', 400, 'plan must be free or pro');
  const span = Number(days);
  if (!Number.isFinite(span) || span < 1 || span > 36500) throw fail('invalid_request', 400, 'days must be between 1 and 36500');
  const devices = Math.min(MAX_KEY_DEVICES, Math.max(1, Number(maxDevices) || MAX_DEVICES));
  const redemptions = Math.min(100, Math.max(0, Number(maxRedemptions) || 0));
  const credits = Math.min(100000, Math.max(0, Number(aiCredits) || 0));
  const emailKey = normalEmail(email);
  const nonce = crypto.randomBytes(12).toString('hex').toUpperCase();
  const expires = new Date(Date.now() + span * 86400000).toISOString();
  const sig = sign([emailKey, plan, expires, nonce]);
  const key = `SWI-${plan.toUpperCase()}-${nonce.slice(0, 8)}-${nonce.slice(8, 16)}-${nonce.slice(16, 24)}-${sig}`;
  const db = read();
  db.keys[key] = {
    email: emailKey, plan, expires, nonce, sig, devices: {}, created: new Date().toISOString(),
    maxDevices: devices, maxRedemptions: redemptions, redeemedBy: [],
    aiCredits: credits, note: String(note || '').slice(0, 200), source, issuedBy: String(issuedBy).slice(0, 120), revoked: false,
  };
  write(db);
  audit('key.issue', { target: emailKey, key: maskKey(key), plan, days: span, maxDevices: devices, maxRedemptions: redemptions, aiCredits: credits, source }, null, issuedBy);
  return { key, plan, expires, maxDevices: devices, maxRedemptions: redemptions };
}
function lookup(key) {
  const db = read();
  const clean = String(key || '').trim().toUpperCase();
  const rec = db.keys[clean];
  return rec ? { db, key: clean, rec } : null;
}
function validate({ key }) {
  const hit = lookup(key);
  if (!hit) return { valid: false, error: 'That license key isn’t valid.' };
  const { rec } = hit;
  if (!eq(rec.sig, sign([rec.email, rec.plan, rec.expires, rec.nonce]))) return { valid: false, error: 'That license key isn’t valid.' };
  if (rec.revoked) return { valid: false, error: 'This license key was revoked.', revoked: true };
  if (new Date(rec.expires).getTime() < Date.now()) return { valid: false, error: 'This license key has expired.', expired: true };
  const usedAccounts = (rec.redeemedBy || []).length;
  if (rec.maxRedemptions && usedAccounts >= rec.maxRedemptions) return { valid: false, error: 'This license key has already been redeemed.', used: true };
  return {
    valid: true, plan: rec.plan, email: rec.email, expires: rec.expires,
    devices: Object.values(rec.devices || {}), used: Object.keys(rec.devices || {}).length,
    max: keyMax(rec), maxRedemptions: rec.maxRedemptions || 0, usedAccounts,
  };
}
function activate({ key, device, name = 'This PC', os = '' }) {
  const hit = lookup(key);
  if (!hit) throw fail('invalid_key', 404, 'That license key isn’t valid.');
  if (!device) throw fail('invalid_request', 400, 'A device id is required.');
  const { db, rec } = hit;
  const max = keyMax(rec);
  rec.devices ||= {};
  if (!rec.devices[device] && Object.keys(rec.devices).length >= max) throw fail('license_in_use', 409, 'All device slots are used. Sign one out first.');
  rec.devices[device] = { device, name: String(name).slice(0, 80), os: String(os).slice(0, 80), lastSeen: new Date().toISOString() };
  write(db);
  audit('key.activate', { target: rec.email, key: maskKey(key), device: String(device).slice(0, 80) });
  return { ok: true, used: Object.keys(rec.devices).length, max };
}
function deactivate({ key, device }) {
  const hit = lookup(key);
  if (!hit) throw fail('invalid_key', 404, 'That license key isn’t valid.');
  const { db, rec } = hit;
  rec.devices ||= {};
  delete rec.devices[String(device)];
  write(db);
  audit('key.deactivate', { target: rec.email, key: maskKey(key), device: String(device).slice(0, 80) });
  return { ok: true, used: Object.keys(rec.devices).length, max: keyMax(rec) };
}

// ---------------------------------------------------------------- billing events
function money(value) {
  if (typeof value === 'number') return '$' + (value / 100).toFixed(2);
  const text = String(value ?? CONFIG_PRICE_FALLBACK);
  return /^\$/.test(text) ? text : '$' + text;
}
const CONFIG_PRICE_FALLBACK = '10';

// Payhip sends unix seconds and its own event names; normalise those into the
// provider-neutral shape used by applyBillingEvent(). Other providers pass through.
function isoDate(value) {
  if (typeof value === 'number') {
    const d = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
  }
  return value ? String(value).slice(0, 10) : new Date().toISOString().slice(0, 10);
}
function isoTime(value, fallback) {
  if (typeof value === 'number') {
    const d = new Date(value < 1e12 ? value * 1000 : value);
    return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
  }
  return value || fallback;
}
function normalizeBillingEvent(event) {
  if (BILLING_PROVIDER !== 'payhip') return event;
  const type = String(event.type || '').toLowerCase();
  const raw = event.data?.object || event.data || event;
  const name = String(raw.plan_name || raw.product_name || raw.items?.[0]?.product_name || '');
  const interval = /year|annual|12\s*month/i.test(name) ? 'year' : 'month';
  // Prefer the account email the dashboard appended to the checkout link; buyers
  // sometimes pay with a different address than the one they registered with.
  const email = raw.metadata?.wicked_email || raw.metadata?.account_email || raw.email || raw.customer_email || raw.customer?.email;
  return {
    type: type === 'subscription.deleted' ? 'subscription.canceled' : type,
    data: {
      email,
      interval,
      amount: raw.price ?? raw.amount ?? raw.amount_refunded,
      invoiceId: raw.id || raw.subscription_id || raw.transaction_id,
      date: isoDate(raw.date ?? raw.date_created ?? raw.date_subscription_started),
      renewsAt: raw.current_period_end ? isoTime(raw.current_period_end, addDays(30)) : undefined,
      endsAt: raw.ends_at ? isoTime(raw.ends_at, addDays(30)) : undefined,
      description: name || 'Wicked Imgui Pro — subscription',
    },
  };
}
function verifyWebhook(req, raw, event) {
  if (BILLING_PROVIDER === 'payhip') {
    const key = PAYHIP_API_KEY || BILLING_WEBHOOK_SECRET;
    if (!key) throw fail('billing_unavailable', 503, 'Payhip webhook is not configured.');
    // Payhip documents signature = sha256(API key) in the JSON body. It is not an
    // HMAC of the payload, so keep the API key secret and compare in constant time.
    if (!eq(event?.signature, crypto.createHash('sha256').update(key).digest('hex'))) {
      throw fail('invalid_request', 401, 'Payhip signature did not match.');
    }
    return;
  }
  if (!BILLING_WEBHOOK_SECRET) throw fail('billing_unavailable', 503, 'Billing webhook is not configured.');
  const supplied = String(req.headers['x-webhook-signature'] || '').replace(/^sha256=/, '');
  const expected = crypto.createHmac('sha256', BILLING_WEBHOOK_SECRET).update(raw).digest('hex');
  if (!eq(supplied, expected)) throw fail('invalid_request', 401, 'Webhook signature did not match.');
}

function addInvoice(u, data) {
  const id = String(data.invoiceId || data.invoice_id || data.id || ('INV-' + Date.now().toString(36).toUpperCase()));
  if (!u.invoices) u.invoices = [];
  if (u.invoices.some((i) => i.id === id)) return;
  u.invoices.unshift({
    id,
    date: isoDate(data.date || data.date_created || data.date_subscription_started),
    amount: money(data.amount),
    description: String(data.description || 'Wicked Pro — subscription'),
    url: 'invoice.html?id=' + encodeURIComponent(id),
  });
}
function applyBillingEvent(event) {
  const type = String(event.type || '').toLowerCase();
  const data = event.data?.object || event.data || event;
  const email = normalEmail(data.email || data.customer_email || data.metadata?.wicked_email || data.metadata?.account_email || data.customer?.email);
  if (!email) return { ignored: 'no_email' };
  const db = readAccounts();
  const u = db.users[email];
  if (!u) return { ignored: 'no_account' };
  if (/refund|chargeback/.test(type)) {
    u.plan = 'free';
    u.subscription = null;
    u.proUntil = null;
  } else if (/cancel|expired|past_due|deleted|unrenewed/.test(type)) {
    const endsAt = data.endsAt || data.current_period_end || addDays(30);
    u.subscription = {
      status: /past_due/.test(type) ? 'past_due' : 'cancelled',
      renews: false,
      renewsAt: null,
      endsAt,
      interval: data.interval || u.subscription?.interval || 'month',
    };
    u.proUntil = endsAt;
  } else if (/active|created|succeeded|paid|renew/.test(type)) {
    const interval = data.interval || data.price?.recurring?.interval || 'month';
    const renewsAt = data.renewsAt || data.current_period_end || (interval === 'year' ? addYear(new Date().toISOString()) : addDays(30));
    u.plan = 'pro';
    u.proUntil = null;
    u.subscription = { status: 'active', renews: true, renewsAt, endsAt: null, interval };
    addInvoice(u, data);
  } else {
    return { ignored: 'unknown_type' };
  }
  writeAccounts(db);
  return { ok: true, account: email };
}

// ---------------------------------------------------------------- static files
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.jsonl': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
};
function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
  const full = path.resolve(SITE_DIR, '.' + rel);
  if (full !== SITE_DIR && !full.startsWith(SITE_DIR + path.sep)) return reply(res, 403, { error: 'Forbidden' });
  let stat;
  try { stat = fs.statSync(full); } catch { return reply(res, 404, { error: 'Not found' }); }
  if (stat.isDirectory()) return serveStatic(req, res, new URL(url.pathname.replace(/\/?$/, '/index.html'), 'http://localhost'));
  const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
  if (req.method === 'HEAD') { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); return res.end(); }
  if (full === path.join(SITE_DIR, 'js', 'config.js')) {
    let source = fs.readFileSync(full, 'utf8');
    const target = PUBLIC_API_BASE || '/';
    source = source.replace(/apiBase:\s*'[^']*'/, "apiBase: '" + target.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'");
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(source);
  }
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  fs.createReadStream(full).pipe(res);
}

// ---------------------------------------------------------------- admin API
/** All /admin/api/* routes. Authorised by an admin account session or the admin token. */
async function adminApi(req, p, body) {
  const who = adminAuth(req);
  const actor = who.actor;
  const db = readAccounts();

  if (req.method === 'GET' && p === '/admin/api/session') return { ok: true, mode: who.mode, actor, role: 'admin' };

  if (req.method === 'GET' && p === '/admin/api/announcement') return db.announcement || { text: '', level: 'info', enabled: false };
  if (req.method === 'POST' && p === '/admin/api/announcement') {
    const text = String(body.text || '').trim().slice(0, 300);
    const enabled = !!body.enabled && !!text;
    db.announcement = {
      text: enabled ? text : '',
      level: body.level === 'warning' ? 'warning' : 'info',
      enabled,
      updatedAt: new Date().toISOString(),
      updatedBy: actor,
    };
    writeAccounts(db);
    audit('announcement.set', { text, level: db.announcement.level, enabled }, req, actor);
    return { ok: true, announcement: db.announcement };
  }

  if (req.method === 'GET' && p === '/admin/api/overview') {
    const lic = read();
    const users = Object.values(db.users).map(ensureAccountShape);
    const revenue = (db.manualSales || []).reduce((n, s) => n + (Number(s.amount) || 0), 0);
    return {
      accounts: users.length,
      pro: users.filter((u) => u.plan === 'pro').length,
      free: users.filter((u) => u.plan !== 'pro').length,
      admins: users.filter(isAdminUser).length,
      sessions: Object.keys(db.sessions).length,
      keys: Object.keys(lic.keys).length,
      activeKeys: Object.values(lic.keys).filter((k) => !k.revoked && new Date(k.expires).getTime() > Date.now()).length,
      devices: Object.values(lic.keys).reduce((n, k) => n + Object.keys(k.devices || {}).length, 0),
      manualSales: (db.manualSales || []).length,
      revenue: '$' + revenue.toFixed(2),
      accessCredits: users.reduce((n, u) => n + (u.credits.access || 0), 0),
      aiCredits: users.reduce((n, u) => n + (u.credits.ai || 0), 0),
      pendingGrants: Object.values(db.grants).filter((g) => !g.claimedAt).length,
      events: readAudit({ limit: 6 }),
    };
  }

  if (req.method === 'GET' && p === '/admin/api/users') {
    return Object.values(db.users).map(ensureAccountShape).map((u) => {
      const seen = (u.devices || []).map((d) => new Date(d.lastSeen || 0).getTime()).filter(Number).sort((a, b) => b - a)[0] || 0;
      return {
        email: u.email, name: u.name, plan: u.plan, role: isAdminUser(u) ? 'admin' : 'user',
        disabled: !!u.disabled, created: u.created, proUntil: u.proUntil || null,
        credits: { ...u.credits }, maxDevices: u.entitlement.maxDevices,
        source: u.entitlement.source || '', devices: (u.devices || []).length,
        sessions: Object.values(db.sessions).filter((s) => s.email === u.email).length,
        invoices: (u.invoices || []).length, lastSeen: seen || null,
        termsVersion: u.terms?.version || null,
      };
    }).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  }

  const targetOf = (body) => normalEmail(body.email);
  const findUser = (email) => {
    const u = ensureAccountShape(db.users[email]);
    if (!u) throw fail('not_found', 404, 'No account with that email.');
    return u;
  };

  if (req.method === 'POST' && p === '/admin/api/user/create') {
    const email = normalEmail(body.email);
    if (!validEmail(email)) throw fail('invalid_email', 400, 'Enter a valid email address.');
    if (String(body.password || '').length < 10) throw fail('weak_password', 400, 'Use at least 10 characters.');
    if (db.users[email]) throw fail('email_taken', 409, 'That email already has an account.');
    const u = newUser({ name: body.name, email, password: body.password, plan: 'free' });
    if (body.plan === 'pro') {
      u.plan = 'pro';
      u.proUntil = addDays(Math.min(36500, Math.max(1, Number(body.days) || 30)));
      u.entitlement.source = 'admin';
    }
    db.users[email] = u;
    applyPendingGrants(db, u, req, 'admin_create');
    writeAccounts(db);
    audit('admin.user_create', { target: email, plan: u.plan }, req, actor);
    return { ok: true, email };
  }

  if (req.method === 'POST' && p === '/admin/api/user/role') {
    const email = targetOf(body);
    if (email === who.actor) throw fail('cannot_change_self', 400, 'Use another admin account to change your own role.');
    const u = findUser(email);
    const next = body.role === 'admin' ? 'admin' : 'user';
    if (next === 'user' && ADMIN_EMAILS.has(email)) throw fail('invalid_request', 400, 'This admin is configured by ADMIN_EMAILS on the server. Remove it there first.');
    u.role = next;
    writeAccounts(db);
    audit('admin.user_role', { target: email, role: next }, req, actor);
    return { ok: true, role: next };
  }

  if (req.method === 'POST' && p === '/admin/api/user/plan') {
    const email = targetOf(body);
    const u = findUser(email);
    const plan = body.plan === 'free' ? 'free' : 'pro';
    u.plan = plan;
    u.proUntil = plan === 'pro' ? addDays(Math.min(36500, Math.max(1, Number(body.days) || 30))) : null;
    u.entitlement.maxDevices = Math.min(MAX_KEY_DEVICES, Math.max(1, Number(body.maxDevices) || MAX_DEVICES));
    u.entitlement.source = 'admin';
    writeAccounts(db);
    audit('admin.user_plan', { target: email, plan, days: body.days || 0, maxDevices: u.entitlement.maxDevices }, req, actor);
    return { ok: true, plan: u.plan, proUntil: u.proUntil };
  }

  if (req.method === 'POST' && p === '/admin/api/user/disable') {
    const email = targetOf(body);
    if (email === who.actor) throw fail('cannot_disable_self', 400, 'You cannot disable your own admin account.');
    const u = findUser(email);
    u.disabled = !!body.disabled;
    if (u.disabled) for (const t of Object.keys(db.sessions)) if (db.sessions[t].email === email) delete db.sessions[t];
    writeAccounts(db);
    audit('admin.user_disable', { target: email, disabled: u.disabled }, req, actor);
    return { ok: true, disabled: u.disabled };
  }

  if (req.method === 'POST' && p === '/admin/api/user/password') {
    const email = targetOf(body);
    const u = findUser(email);
    if (String(body.password || '').length < 10) throw fail('weak_password', 400, 'Use at least 10 characters.');
    u.hash = hashPassword(body.password);
    for (const t of Object.keys(db.sessions)) if (db.sessions[t].email === email) delete db.sessions[t];
    writeAccounts(db);
    audit('admin.user_password', { target: email }, req, actor);
    return { ok: true };
  }

  if (req.method === 'POST' && p === '/admin/api/user/credits') {
    const email = targetOf(body);
    const u = findUser(email);
    const kind = body.kind === 'access' ? 'access' : 'ai';
    const value = Math.floor(Number(body.value));
    if (!Number.isFinite(value) || value === 0 || Math.abs(value) > 100000) throw fail('invalid_request', 400, 'Enter an amount between -100000 and 100000, excluding 0.');
    if (value < 0 && u.credits[kind] + value < 0) throw fail('insufficient_credits', 402, 'That account does not have enough credits to remove.');
    u.credits[kind] += value;
    ledger(db, { action: value > 0 ? 'credit.grant' : 'credit.adjust', email, kind, value, reason: String(body.note || '').slice(0, 200), actor });
    writeAccounts(db);
    audit('credits.adjust', { target: email, kind, value, note: body.note || '' }, req, actor);
    return { ok: true, credits: u.credits };
  }

  if (req.method === 'POST' && p === '/admin/api/user/key') {
    const email = targetOf(body);
    findUser(email);
    const out = issue({
      email, plan: body.plan === 'free' ? 'free' : 'pro', days: body.days,
      maxDevices: body.maxDevices, maxRedemptions: body.maxRedemptions,
      aiCredits: body.aiCredits, note: body.note, source: 'admin_panel', issuedBy: actor,
    });
    return { ok: true, ...out };
  }

  if (req.method === 'GET' && p === '/admin/api/keys') {
    const lic = read();
    return Object.entries(lic.keys).map(([key, k]) => ({
      key, email: k.email, plan: k.plan, expires: k.expires, created: k.created,
      maxDevices: keyMax(k), devices: Object.keys(k.devices || {}).length,
      maxRedemptions: k.maxRedemptions || 0, redeemed: (k.redeemedBy || []).length,
      aiCredits: k.aiCredits || 0, note: k.note || '', source: k.source || '',
      issuedBy: k.issuedBy || '', revoked: !!k.revoked,
    })).sort((a, b) => String(b.created).localeCompare(String(a.created)));
  }

  if (req.method === 'POST' && p === '/admin/api/key/issue') {
    const count = Math.min(50, Math.max(1, Number(body.count) || 1));
    const keys = [];
    for (let i = 0; i < count; i++) {
      keys.push(issue({
        email: body.email, plan: body.plan, days: body.days, maxDevices: body.maxDevices,
        maxRedemptions: body.maxRedemptions, aiCredits: body.aiCredits,
        note: body.note, source: 'admin_batch', issuedBy: actor,
      }));
    }
    return { ok: true, keys };
  }

  if (req.method === 'POST' && p === '/admin/api/key/revoke') {
    const key = String(body.key || '').trim().toUpperCase();
    const lic = read();
    const rec = lic.keys[key];
    if (!rec) throw fail('invalid_key', 404, 'That key does not exist.');
    rec.revoked = true;
    write(lic);
    audit('key.revoke', { target: rec.email, key: maskKey(key), note: body.note || '' }, req, actor);
    return { ok: true };
  }

  if (req.method === 'GET' && p === '/admin/api/manual-sales') return (db.manualSales || []).slice(0, 500);

  if (req.method === 'POST' && p === '/admin/api/manual-sale') {
    const email = normalEmail(body.email);
    if (!validEmail(email)) throw fail('invalid_email', 400, 'Enter a valid email address.');
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1000000) throw fail('invalid_request', 400, 'Enter a valid amount.');
    const method = String(body.method || 'other').trim().slice(0, 60) || 'other';
    const days = Math.min(3650, Math.max(0, Math.floor(Number(body.days) || 0)));
    const access = Math.min(100000, Math.max(0, Math.floor(Number(body.accessCredits) || 0)));
    const ai = Math.min(100000, Math.max(0, Math.floor(Number(body.aiCredits) || 0)));
    if (!days && !access && !ai) throw fail('invalid_request', 400, 'Give at least some Pro days or credits.');
    const note = String(body.note || '').slice(0, 200);
    const id = 'MS-' + Date.now().toString(36).toUpperCase() + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
    const codes = [];
    if (days) codes.push(createGrant(db, { email, kind: 'pro', days, maxDevices: body.maxDevices, source: method, note, actor }).code);
    if (access) codes.push(createGrant(db, { email, kind: 'access', value: access, source: method, note, actor }).code);
    if (ai) codes.push(createGrant(db, { email, kind: 'ai', value: ai, source: method, note, actor }).code);
    const u = ensureAccountShape(db.users[email]);
    if (u) {
      for (const code of codes) applyGrant(db, u, db.grants[code]);
      if (amount > 0) {
        addInvoice(u, {
          invoiceId: id, date: isoDate(new Date().toISOString()), amount: '$' + amount.toFixed(2),
          description: `Wicked Pro — manual payment (${method})`,
        });
      }
    }
    const sale = {
      id, email, name: String(body.name || '').slice(0, 80), amount,
      currency: String(body.currency || 'USD').slice(0, 8).toUpperCase(), method,
      days, accessCredits: access, aiCredits: ai, note, codes,
      accountExists: !!u, created: new Date().toISOString(), actor,
    };
    db.manualSales.unshift(sale);
    db.manualSales = db.manualSales.slice(0, 2000);
    writeAccounts(db);
    audit('manual_sale.create', { target: email, amount, method, days, access, ai, codes: codes.join(',') }, req, actor);
    return { ok: true, sale };
  }

  if (req.method === 'GET' && p === '/admin/api/audit') {
    const limit = Math.min(500, Math.max(1, Number(new URL(req.url, 'http://localhost').searchParams.get('limit')) || 100));
    const q = new URL(req.url, 'http://localhost').searchParams;
    return readAudit({ limit, action: q.get('action') || '', actor: q.get('actor') || '', q: q.get('q') || '' });
  }

  return undefined;
}

// ---------------------------------------------------------------- customer credit routes
function creditsView(db, u) {
  ensureAccountShape(u);
  return {
    credits: { ...u.credits, accessDays: ACCESS_CREDIT_DAYS },
    entitlement: u.entitlement || { maxDevices: MAX_DEVICES, source: 'registration' },
    ledger: (db.ledger || []).filter((e) => e.email === u.email).slice(0, 30),
    pending: Object.values(db.grants || {})
      .filter((g) => !g.claimedAt && g.email === u.email)
      .map((g) => ({ code: g.code, kind: g.kind, value: g.value, days: g.days, note: g.note })),
  };
}
function claimCredit(db, u, code) {
  const grant = db.grants[String(code || '').trim().toUpperCase()];
  if (!grant || grant.email !== u.email) throw fail('invalid_key', 400, 'That credit code is not valid for this account.');
  if (grant.claimedAt) throw fail('already_redeemed', 409, 'That credit code was already claimed.');
  if (!applyGrant(db, u, grant)) throw fail('invalid_request', 400, 'That credit code cannot be claimed.');
  writeAccounts(db);
  audit('credits.claim', { target: u.email, code: grant.code, kind: grant.kind, value: grant.value || grant.days }, null, u.email);
  return creditsView(db, u);
}
function redeemAccess(db, u, value) {
  const credits = Math.floor(Number(value));
  if (!Number.isFinite(credits) || credits < 1) throw fail('invalid_request', 400, 'Enter at least one access credit.');
  if (credits > u.credits.access) throw fail('insufficient_credits', 402, 'You do not have that many access credits.');
  const days = credits * ACCESS_CREDIT_DAYS;
  const base = Math.max(Date.now(), new Date(u.proUntil || 0).getTime() || 0);
  u.credits.access -= credits;
  u.plan = 'pro';
  u.entitlement ||= { maxDevices: MAX_DEVICES, source: 'access_credits' };
  u.entitlement.source = 'access_credits';
  u.proUntil = new Date(base + days * 86400000).toISOString();
  ledger(db, { action: 'credit.redeem', email: u.email, kind: 'access', value: -credits, days });
  writeAccounts(db);
  audit('credits.redeem', { target: u.email, credits, days }, null, u.email);
  return { ok: true, days, proUntil: u.proUntil, credits: { ...u.credits, accessDays: ACCESS_CREDIT_DAYS } };
}
function mintKeyFromCredits(db, u, value, maxDevices) {
  const credits = Math.floor(Number(value));
  if (!Number.isFinite(credits) || credits < 1) throw fail('invalid_request', 400, 'Enter at least one access credit.');
  if (credits > u.credits.access) throw fail('insufficient_credits', 402, 'You do not have that many access credits.');
  const allowed = (u.entitlement && u.entitlement.maxDevices) || MAX_DEVICES;
  const devices = Math.min(allowed, MAX_KEY_DEVICES, Math.max(1, Number(maxDevices) || 1));
  const out = issue({
    email: u.email, plan: 'pro', days: credits * ACCESS_CREDIT_DAYS,
    maxDevices: devices, maxRedemptions: 1,
    note: 'Minted from access credits', source: 'access_credits', issuedBy: u.email,
  });
  u.credits.access -= credits;
  ledger(db, { action: 'credit.key', email: u.email, kind: 'access', value: -credits, ref: out.key });
  writeAccounts(db);
  audit('credits.key_mint', { target: u.email, credits, maxDevices: devices }, null, u.email);
  return { ok: true, ...out, credits: { ...u.credits, accessDays: ACCESS_CREDIT_DAYS } };
}
function spendAiCredits(db, u, { units, idempotencyKey }) {
  const amount = Math.floor(Number(units));
  if (!Number.isFinite(amount) || amount < 1 || amount > 10000) throw fail('invalid_request', 400, 'units must be between 1 and 10000.');
  const idem = String(idempotencyKey || '').trim();
  if (idem.length < 8 || idem.length > 120) throw fail('invalid_request', 400, 'An idempotencyKey of 8–120 characters is required.');
  const marker = u.email + '|' + idem;
  const prior = db.aiSpend[marker];
  if (prior) return { ok: true, ...prior, cached: true };
  if (u.credits.ai < amount) throw fail('insufficient_credits', 402, 'Not enough AI credits. Add more before trying again.');
  u.credits.ai -= amount;
  const result = { units: amount, remaining: u.credits.ai, at: new Date().toISOString() };
  db.aiSpend[marker] = result;
  const markers = Object.keys(db.aiSpend);
  if (markers.length > 10000) for (const old of markers.slice(0, markers.length - 10000)) delete db.aiSpend[old];
  ledger(db, { action: 'ai.spend', email: u.email, kind: 'ai', value: -amount, ref: idem });
  writeAccounts(db);
  audit('ai.spend', { target: u.email, units: amount, remaining: u.credits.ai }, null, u.email);
  return { ok: true, ...result, cached: false };
}

// ---------------------------------------------------------------- API router
async function api(req, res, p, body, raw) {
  if (p.startsWith('/admin/api/')) return adminApi(req, p, body);

  // license service (same routes, now admin-only)
  if (p === '/issue') {
    adminAuth(req);
    return issue(body);
  }
  if (p === '/validate') return validate(body);
  if (p === '/activate') return activate(body);
  if (p === '/deactivate') return deactivate(body);
  if (p === '/stats') {
    adminAuth(req);
    const db = read();
    const accounts = readAccounts();
    return {
      licenses: Object.keys(db.keys).length,
      devices: Object.values(db.keys).reduce((n, k) => n + Object.keys(k.devices).length, 0),
      accounts: Object.keys(accounts.users).length,
      sessions: Object.keys(accounts.sessions).length,
    };
  }

  // Payment provider webhook. Verification uses the raw body for generic HMAC
  // providers, or Payhip's documented signature field when BILLING_PROVIDER=payhip.
  if (p === '/v1/billing/webhook') {
    let event;
    try { event = JSON.parse(raw); } catch { throw fail('invalid_request', 400, 'Webhook body is not JSON.'); }
    verifyWebhook(req, raw, event);
    return applyBillingEvent(normalizeBillingEvent(event));
  }

  // public status/feed (also served to signed-out browsers)
  if (req.method === 'GET' && p === '/v1/status') {
    const a = readAccounts().announcement;
    return { announcement: a?.enabled && a?.text ? { text: a.text, level: a.level || 'info' } : null, updates: true };
  }
  if (req.method === 'GET' && p === '/v1/releases') {
    const manifestPath = process.env.RELEASE_MANIFEST || path.join(__dirname, '..', 'downloads', 'latest.json');
    const manifest = readFile(manifestPath, {});
    return { releases: manifest && manifest.version ? [manifest] : [] };
  }

  // anonymous auth endpoints
  if (p === '/v1/auth/register') {
    rateLimit(req, 'register');
    const email = normalEmail(body.email);
    if (!validEmail(email)) throw fail('invalid_email', 400, 'Enter a valid email address.');
    if (String(body.password || '').length < 10) throw fail('weak_password', 400, 'Use at least 10 characters.');
    const terms = body.terms || {};
    if (!terms.accepted || String(terms.version || '') !== TERMS_VERSION || String(terms.privacyVersion || '') !== PRIVACY_VERSION) {
      throw fail('terms_required', 422, 'Accept the current Terms and Privacy Policy to create an account.');
    }
    const db = readAccounts();
    if (db.users[email]) throw fail('email_taken', 409, 'An account with this email already exists.');
    const u = newUser({ name: body.name, email, password: body.password, terms });
    rememberDevice(u, req);
    db.users[email] = u;
    applyPendingGrants(db, u, req, 'registration');
    startSession(res, db, email);
    return publicAccount(u);
  }
  if (p === '/v1/auth/login') {
    rateLimit(req, 'login');
    const email = normalEmail(body.email);
    const db = readAccounts();
    const u = ensureAccountShape(db.users[email]);
    if (!u || !verifyPassword(body.password, u.hash)) throw fail('invalid_credentials', 401, 'Wrong email or password.');
    if (u.disabled) throw fail('account_disabled', 403, 'This account has been disabled.');
    rememberDevice(u, req);
    applyPendingGrants(db, u, req, 'login');
    writeAccounts(db);
    startSession(res, db, email);
    return publicAccount(u);
  }
  if (p === '/v1/auth/password-reset') {
    rateLimit(req, 'reset');
    const db = readAccounts();
    if (db.users[normalEmail(body.email)]) await deliverToken(db, 'reset', normalEmail(body.email), 3600000);
    return { ok: true }; // never reveal whether the account exists
  }
  if (p === '/v1/auth/password-reset/confirm') {
    rateLimit(req, 'reset-confirm');
    if (String(body.password || '').length < 10) throw fail('weak_password', 400, 'Use at least 10 characters.');
    const db = readAccounts();
    const rec = useToken(db, body.token, 'reset');
    const u = db.users[rec.email];
    if (!u) throw fail('invalid_token', 400, 'This link has expired or was already used.');
    u.hash = hashPassword(body.password);
    for (const token of Object.keys(db.sessions)) if (db.sessions[token].email === rec.email) delete db.sessions[token];
    writeAccounts(db);
    return { ok: true };
  }
  if (p === '/v1/auth/verify-email') {
    const db = readAccounts();
    const rec = useToken(db, body.token, 'verify');
    const u = db.users[rec.email];
    if (!u) throw fail('invalid_token', 400, 'This link has expired or was already used.');
    if (u.emailVerified) throw fail('already_verified', 400, 'This email is already confirmed.');
    u.emailVerified = true;
    writeAccounts(db);
    return { ok: true };
  }

  // A signed-out session check is a normal 200 answer: auth.js turns {user:null} into null.
  if (p === '/v1/auth/session') {
    const token = cookieToken(req);
    const db = readAccounts();
    const s = db.sessions[token];
    const u = s && new Date(s.expires).getTime() >= Date.now() ? ensureAccountShape(db.users[s.email]) : null;
    if (!u) return { user: null };
    if (applyPendingGrants(db, u, req, 'session')) writeAccounts(db);
    return publicAccount(u);
  }

  // everything below requires a cookie
  const { db, token, u } = requireUser(req);

  if (p === '/v1/account' && req.method === 'GET') return publicAccount(u);

  if (req.method === 'GET' && p === '/v1/credits') return creditsView(db, u);
  if (req.method === 'POST' && p === '/v1/credits/claim') return claimCredit(db, u, body.code);
  if (req.method === 'POST' && p === '/v1/credits/redeem') return redeemAccess(db, u, body.credits);
  if (req.method === 'POST' && p === '/v1/credits/key') return mintKeyFromCredits(db, u, body.credits, body.maxDevices);
  if (req.method === 'POST' && p === '/v1/ai/usage') return spendAiCredits(db, u, body);

  if (p === '/v1/auth/logout') {
    delete db.sessions[token];
    writeAccounts(db);
    setCookie(res, '', true);
    return { ok: true };
  }
  if (p === '/v1/auth/logout-all') {
    for (const t of Object.keys(db.sessions)) if (db.sessions[t].email === u.email) delete db.sessions[t];
    writeAccounts(db);
    setCookie(res, '', true);
    return { ok: true };
  }
  if (p === '/v1/auth/resend-verification') {
    if (u.emailVerified) throw fail('already_verified', 400, 'This email is already confirmed.');
    const out = await deliverToken(db, 'verify', u.email, 86400000);
    return { ok: true, delivery: out.delivery };
  }
  if (p === '/v1/account' && req.method === 'PATCH') {
    const name = String(body.name || '').trim();
    if (!name) throw fail('invalid_request', 400, 'Name cannot be empty.');
    u.name = name.slice(0, 80);
    writeAccounts(db);
    return publicAccount(u);
  }
  if (p === '/v1/account/password') {
    if (!verifyPassword(body.current, u.hash)) throw fail('wrong_password', 400, 'That password isn’t correct.');
    if (String(body.next || '').length < 10) throw fail('weak_password', 400, 'Use at least 10 characters.');
    u.hash = hashPassword(body.next);
    for (const t of Object.keys(db.sessions)) if (db.sessions[t].email === u.email && t !== token) delete db.sessions[t];
    writeAccounts(db);
    return { ok: true };
  }
  if (p === '/v1/account' && req.method === 'DELETE') {
    if (!verifyPassword(body.password, u.hash)) throw fail('wrong_password', 400, 'That password isn’t correct.');
    delete db.users[u.email];
    for (const t of Object.keys(db.sessions)) if (db.sessions[t].email === u.email) delete db.sessions[t];
    for (const t of Object.keys(db.tokens)) if (db.tokens[t].email === u.email) delete db.tokens[t];
    writeAccounts(db);
    if (u.licenseKey) {
      const lic = read();
      if (lic.keys[u.licenseKey]) { delete lic.keys[u.licenseKey].account; write(lic); }
    }
    setCookie(res, '', true);
    return { ok: true };
  }
  const deviceMatch = /^\/v1\/devices\/([^/]+)$/.exec(p);
  if (deviceMatch && req.method === 'DELETE') {
    const id = decodeURIComponent(deviceMatch[1]);
    u.devices = (u.devices || []).filter((d) => d.id !== id);
    writeAccounts(db);
    if (u.licenseKey) {
      const lic = read();
      if (lic.keys[u.licenseKey]?.devices?.[id]) { delete lic.keys[u.licenseKey].devices[id]; write(lic); }
    }
    return publicAccount(u);
  }
  if (p === '/v1/account/redeem') {
    const key = String(body.key || '').trim().toUpperCase();
    const check = validate({ key });
    if (!check.valid) {
      const code = check.used ? 'key_used' : check.expired ? 'key_expired' : 'invalid_key';
      throw fail(code, check.used ? 409 : 400, check.error);
    }
    const lic = read();
    const rec = lic.keys[key];
    if (rec.account && rec.account !== u.email) throw fail('key_used', 409, 'This license key has already been used on another account.');
    if ((u.redeemed || []).includes(key)) throw fail('already_redeemed', 409, 'You already redeemed this key.');
    if (rec.maxRedemptions && (rec.redeemedBy || []).length >= rec.maxRedemptions) throw fail('key_used', 409, 'This license key has reached its redemption limit.');
    rec.account = u.email;
    rec.redeemedBy = [...(rec.redeemedBy || []), u.email];
    write(lic);
    u.plan = 'pro';
    u.licenseKey = key;
    u.proUntil = rec.expires;
    u.redeemed = [...(u.redeemed || []), key];
    u.entitlement ||= { maxDevices: MAX_DEVICES, source: 'key' };
    u.entitlement.maxDevices = keyMax(rec);
    u.entitlement.source = 'key';
    if (rec.aiCredits > 0) {
      u.credits.ai += rec.aiCredits;
      ledger(db, { action: 'key.credits', email: u.email, kind: 'ai', value: rec.aiCredits, ref: key });
    }
    writeAccounts(db);
    audit('key.redeem', { target: u.email, key: maskKey(key), aiCredits: rec.aiCredits || 0 }, req, u.email);
    return publicAccount(u);
  }
  if (p === '/v1/billing/checkout') {
    const url = CHECKOUT[body.interval === 'year' ? 'year' : 'month'];
    if (!url) throw fail('billing_unavailable', 503, 'Payments are not configured on this server.');
    return { url };
  }
  if (p === '/v1/billing/portal') {
    if (!CHECKOUT.portal) throw fail('billing_unavailable', 503, 'Payments are not configured on this server.');
    if (!u.subscription || u.subscription.status !== 'active') throw fail('no_subscription', 400, 'There’s no subscription on this account.');
    return { url: CHECKOUT.portal };
  }
  return undefined;
}

// ---------------------------------------------------------------- server
const server = http.createServer(async (req, res) => {
  res.wickedReq = req;
  try {
    if (req.method === 'OPTIONS') return reply(res, 204, {});
    const url = new URL(req.url, 'http://localhost');
    const p = url.pathname;

    if (req.method === 'GET' && p === '/health') {
      return reply(res, 200, { ok: true, service: 'wicked-imgui-server', version: 2, devSecret: isDev, accounts: true });
    }
    // The payment webhook authenticates with its own HMAC signature, so it has no browser
    // Origin to check. Everything else rejects state-changing cross-site requests.
    if (p !== '/v1/billing/webhook' && ['POST', 'PATCH', 'DELETE'].includes(req.method) && !originOK(req)) {
      return reply(res, 403, { error: 'bad_origin', message: 'Cross-origin request rejected.' });
    }

    const raw = await readBody(req);
    let body = {};
    if (raw) {
      try { body = JSON.parse(raw); } catch { throw fail('invalid_request', 400, 'Body must be JSON.'); }
    }
    if (p.startsWith('/v1/') || p.startsWith('/admin/api/') || ['/issue', '/validate', '/activate', '/deactivate', '/stats'].includes(p)) {
      const out = await api(req, res, p, body, raw);
      if (out === undefined) return reply(res, 404, { error: 'not_found', message: 'Not found' });
      return reply(res, 200, out);
    }
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, url);
    return reply(res, 404, { error: 'not_found', message: 'Not found' });
  } catch (err) {
    if (!res.headersSent) reply(res, err.status || 400, { error: err.code || 'invalid_request', message: err.message });
    else res.end();
  }
});

server.listen(PORT, HOST, () => console.log(`Wicked Imgui account + license server → http://${HOST}:${PORT}`));
