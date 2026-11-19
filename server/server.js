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
//
//   POST /issue      {email,plan,days} create a signed key (needs ADMIN_TOKEN if set)
//   POST /validate   {key}             check signature, expiry and device count
//   POST /activate   {key,device,name,os} add a computer (max 3)
//   POST /deactivate {key,device}      free a computer
//   GET  /stats                        counts (needs ADMIN_TOKEN if set)
//
// Set LICENSE_SECRET and ADMIN_TOKEN to long random values in production. When this
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
const isDev = SECRET.startsWith('wicked-imgui-DEV');

if (isDev) console.warn('⚠  LICENSE_SECRET is the dev default. Set a real secret before exposing this server.');
fs.mkdirSync(path.dirname(DATA), { recursive: true });
fs.mkdirSync(path.dirname(ACCOUNTS_FILE), { recursive: true });

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
const readAccounts = () => readFile(ACCOUNTS_FILE, { users: {}, sessions: {}, tokens: {} });
const writeAccounts = (db) => writeFile(ACCOUNTS_FILE, db);

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
function adminOK(req) {
  return !ADMIN || req.headers.authorization === 'Bearer ' + ADMIN;
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

function newUser({ name, email, password, plan = 'free' }) {
  const emailKey = normalEmail(email);
  const issued = issue({ email: emailKey, plan, days: 3650 });
  return {
    id: 'usr_' + crypto.randomBytes(8).toString('hex'),
    name: String(name || '').trim() || emailKey.split('@')[0],
    email: emailKey,
    plan,
    hash: hashPassword(password),
    created: new Date().toISOString(),
    // With no email delivery configured, do not claim a link was sent or gate the UI on it.
    emailVerified: !MAIL_WEBHOOK_URL,
    licenseKey: issued.key,
    invoices: [],
    subscription: null,
    devices: [],
    redeemed: [],
  };
}

/** The response shape js/auth-preview.js uses, so the dashboard needs no live-mode branches. */
function publicAccount(u) {
  const sub = u.subscription || null;
  return {
    user: {
      id: u.id, name: u.name, email: u.email, plan: u.plan,
      created: u.created, emailVerified: u.emailVerified !== false,
    },
    license: {
      key: u.licenseKey,
      plan: u.plan,
      maxDevices: MAX_DEVICES,
      updatesUntil: u.proUntil || (sub ? sub.renewsAt : null) || (u.plan === 'pro' ? addMonths(new Date().toISOString(), 1) : null),
      proUntil: u.proUntil || null,
    },
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
  const u = db.users[session.email];
  if (!u) throw fail('unauthorized', 401, 'Sign in to continue.');
  if (u.disabled) throw fail('account_disabled', 403, 'This account has been disabled.');
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

// ---------------------------------------------------------------- license keys
function issue({ email, plan = 'pro', days = 365 }) {
  if (!validEmail(normalEmail(email))) throw fail('invalid_request', 400, 'A valid email is required');
  if (!['free', 'pro'].includes(plan)) throw fail('invalid_request', 400, 'plan must be free or pro');
  const emailKey = normalEmail(email);
  const nonce = crypto.randomBytes(12).toString('hex').toUpperCase();
  const expires = new Date(Date.now() + Number(days) * 86400000).toISOString();
  const sig = sign([emailKey, plan, expires, nonce]);
  const key = `SWI-${plan.toUpperCase()}-${nonce.slice(0, 8)}-${nonce.slice(8, 16)}-${nonce.slice(16, 24)}-${sig}`;
  const db = read();
  db.keys[key] = { email: emailKey, plan, expires, nonce, sig, devices: {}, created: new Date().toISOString() };
  write(db);
  return { key, plan, expires, maxDevices: MAX_DEVICES };
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
  if (new Date(rec.expires).getTime() < Date.now()) return { valid: false, error: 'This license key has expired.', expired: true };
  return { valid: true, plan: rec.plan, email: rec.email, expires: rec.expires, devices: Object.values(rec.devices), used: Object.keys(rec.devices).length, max: MAX_DEVICES };
}
function activate({ key, device, name = 'This PC', os = '' }) {
  const hit = lookup(key);
  if (!hit) throw fail('invalid_key', 404, 'That license key isn’t valid.');
  if (!device) throw fail('invalid_request', 400, 'A device id is required.');
  const { db, rec } = hit;
  if (!rec.devices[device] && Object.keys(rec.devices).length >= MAX_DEVICES) throw fail('license_in_use', 409, 'All device slots are used. Sign one out first.');
  rec.devices[device] = { device, name: String(name).slice(0, 80), os: String(os).slice(0, 80), lastSeen: new Date().toISOString() };
  write(db);
  return { ok: true, used: Object.keys(rec.devices).length, max: MAX_DEVICES };
}
function deactivate({ key, device }) {
  const hit = lookup(key);
  if (!hit) throw fail('invalid_key', 404, 'That license key isn’t valid.');
  const { db, rec } = hit;
  delete rec.devices[String(device)];
  write(db);
  return { ok: true, used: Object.keys(rec.devices).length, max: MAX_DEVICES };
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

// ---------------------------------------------------------------- API router
async function api(req, res, p, body, raw) {
  // license service (unchanged contract)
  if (p === '/issue') {
    if (!adminOK(req)) throw fail('unauthorized', 401, 'Unauthorized');
    return issue(body);
  }
  if (p === '/validate') return validate(body);
  if (p === '/activate') return activate(body);
  if (p === '/deactivate') return deactivate(body);
  if (p === '/stats') {
    if (!adminOK(req)) throw fail('unauthorized', 401, 'Unauthorized');
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
  if (req.method === 'GET' && p === '/v1/status') return { announcement: null, updates: true };
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
    const db = readAccounts();
    if (db.users[email]) throw fail('email_taken', 409, 'An account with this email already exists.');
    const u = newUser({ name: body.name, email, password: body.password });
    rememberDevice(u, req);
    db.users[email] = u;
    startSession(res, db, email);
    return publicAccount(u);
  }
  if (p === '/v1/auth/login') {
    rateLimit(req, 'login');
    const email = normalEmail(body.email);
    const db = readAccounts();
    const u = db.users[email];
    if (!u || !verifyPassword(body.password, u.hash)) throw fail('invalid_credentials', 401, 'Wrong email or password.');
    if (u.disabled) throw fail('account_disabled', 403, 'This account has been disabled.');
    rememberDevice(u, req);
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
    const u = s && new Date(s.expires).getTime() >= Date.now() ? db.users[s.email] : null;
    return u ? publicAccount(u) : { user: null };
  }

  // everything below requires a cookie
  const { db, token, u } = requireUser(req);

  if (p === '/v1/account' && req.method === 'GET') return publicAccount(u);
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
    if (!check.valid) throw fail(check.expired ? 'key_expired' : 'invalid_key', 400, check.error);
    const lic = read();
    const rec = lic.keys[key];
    if (rec.account && rec.account !== u.email) throw fail('key_used', 409, 'This license key has already been used on another account.');
    if ((u.redeemed || []).includes(key)) throw fail('already_redeemed', 409, 'You already redeemed this key.');
    rec.account = u.email;
    write(lic);
    u.plan = 'pro';
    u.licenseKey = key;
    u.proUntil = rec.expires;
    u.redeemed = [...(u.redeemed || []), key];
    writeAccounts(db);
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
    if (p.startsWith('/v1/') || ['/issue', '/validate', '/activate', '/deactivate', '/stats'].includes(p)) {
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
