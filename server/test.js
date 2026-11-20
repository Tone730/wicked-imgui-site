// Smoke test: node test.js  (starts its own server on port 8788, no dependencies)
// Covers the license service and the account/session/billing API.
'use strict';
const { spawn } = require('node:child_process');
const http = require('node:http');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const PORT = 8788;
let BASE = `http://127.0.0.1:${PORT}`;
const prefix = path.join(os.tmpdir(), `wicki-server-test-${process.pid}`);
const dataFile = prefix + '-licenses.json';
const accountsFile = prefix + '-accounts.json';
const spawned = [];
// Explicit empties stop a local .env from sending real email during the test suite.
const NO_MAIL = { RESEND_API_KEY: '', MAIL_WEBHOOK_URL: '', MAIL_FROM: '', SITE_URL: '' };

const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: {
    ...process.env,
    ...NO_MAIL,
    PORT: String(PORT),
    LICENSE_SECRET: 'test-secret-do-not-use',
    ADMIN_TOKEN: 'test-admin',
    DATA_FILE: dataFile,
    ACCOUNTS_FILE: accountsFile,
    AUDIT_FILE: prefix + '-audit.jsonl',
    ADMIN_EMAILS: 'admin@example.com',
    ALLOWED_ORIGINS: 'http://localhost:8124',
    BILLING_PROVIDER: 'generic', // ignore a local .env when running the suite
    // Explicit empties override real URLs in a local .env so the "unconfigured"
    // billing checks stay deterministic. Real env vars still win over these.
    CHECKOUT_URL_MONTHLY: '',
    CHECKOUT_URL_YEARLY: '',
    CHECKOUT_PORTAL_URL: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
spawned.push(child);
child.stderr.on('data', (d) => process.stderr.write(d));

async function request(p, options = {}) {
  const { method = 'GET', body, token, cookie, origin, headers = {} } = options;
  const r = await fetch(BASE + p, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const text = await r.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch { /* static text */ }
  const setCookie = r.headers.get('set-cookie') || '';
  return {
    status: r.status,
    body: parsed,
    cookie: setCookie.split(';')[0],
    allowCredentials: r.headers.get('access-control-allow-credentials'),
    allowOrigin: r.headers.get('access-control-allow-origin'),
  };
}
const post = (p, body, token, cookie) => request(p, { method: 'POST', body, token, cookie });
const authPost = (p, body, cookie) => post(p, body, undefined, cookie);
const TERMS = { accepted: true, version: '2026-11-19', privacyVersion: '2026-11-19' };
const register = (email, password, extra = {}) => post('/v1/auth/register', { name: 'Test User', email, password, terms: TERMS, ...extra });

(async () => {
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const results = [];
  const check = (name, pass, detail = '') => {
    results.push({ name, pass, detail });
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  };

  // ---- license service (the original 12 checks)
  const health = await request('/health');
  check('health', health.body.ok === true);

  const badAuth = await post('/issue', { email: 'a@b.com', plan: 'pro', days: 30 });
  check('issue requires admin token', badAuth.status === 401);

  const issued = await post('/issue', { email: 'tester@example.com', plan: 'pro', days: 30 }, 'test-admin');
  const key = issued.body.key;
  check('issue signed key', /^SWI-PRO-.{8}-.{8}-.{8}-.{8}$/.test(key || ''), key);

  const valid = await post('/validate', { key });
  check('validate key', valid.body.valid === true, valid.body.plan);

  const bad = await post('/validate', { key: 'SWI-PRO-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD' });
  check('reject unknown key', bad.body.valid === false);

  for (let i = 0; i < 3; i++) {
    const r = await post('/activate', { key, device: 'dev_' + i, name: 'PC ' + i, os: 'Windows 11' });
    check('activate device ' + (i + 1), r.body.ok === true, `${r.body.used}/${r.body.max}`);
  }
  const full = await post('/activate', { key, device: 'dev_4' });
  check('block 4th device', full.status === 409, full.body.error);

  const deact = await post('/deactivate', { key, device: 'dev_1' });
  check('deactivate device', deact.body.ok === true && deact.body.used === 2);

  const react = await post('/activate', { key, device: 'dev_4' });
  check('activate after freeing a slot', react.body.ok === true);

  const stats = await request('/stats', { token: 'test-admin' });
  check('stats', stats.body.licenses === 1);

  const csp = await request('/v1/account', {
    method: 'OPTIONS',
    origin: 'http://localhost:8124',
    headers: { 'Access-Control-Request-Method': 'PATCH' },
  });
  check('CORS allows credentialed origin', csp.status === 204 && csp.allowCredentials === 'true' && csp.allowOrigin === 'http://localhost:8124');

  const config = await request('/js/config.js');
  check('static config uses same-origin API', config.status === 200 && /apiBase:\s*'\/'/.test(config.body), 'apiBase: /');

  const signedOut = await request('/v1/auth/session');
  check('signed-out session is 200 with user:null', signedOut.status === 200 && signedOut.body.user === null);

  const weak = await register('weak@example.com', 'short', { name: 'Weak' });
  check('weak password rejected', weak.status === 400 && weak.body.error === 'weak_password');

  const noTerms = await post('/v1/auth/register', { name: 'No Terms', email: 'noterms@example.com', password: 'correct-horse-battery' });
  check('legal acceptance required', noTerms.status === 422 && noTerms.body.error === 'terms_required');

  const reg = await register('User@Example.com', 'correct-horse-battery');
  let cookie = reg.cookie;
  check('register creates session', reg.status === 200 && /^swi_session=/.test(cookie));
  check('account shape matches preview', reg.body.user?.email === 'user@example.com' && reg.body.user?.plan === 'free' && Array.isArray(reg.body.devices) && Array.isArray(reg.body.invoices) && !!reg.body.license?.key);
  check('account exposes empty credit balances', reg.body.credits?.access === 0 && reg.body.credits?.ai === 0 && reg.body.credits?.accessDays === 30);
  check('register grants one web device', reg.body.devices.length === 1, reg.body.devices[0]?.name);

  const dupe = await register('user@example.com', 'correct-horse-battery', { name: 'Other' });
  check('duplicate email rejected', dupe.status === 409 && dupe.body.error === 'email_taken');

  // ---- admin auth: role from ADMIN_EMAILS, token fallback, and no public bypass
  const adminReg = await register('admin@example.com', 'admin-long-password', { name: 'Admin' });
  const adminCookie = adminReg.cookie;
  check('ADMIN_EMAILS grants the admin role', adminReg.body.user?.role === 'admin');
  const adminByRole = await request('/admin/api/session', { cookie: adminCookie });
  const adminByToken = await request('/admin/api/session', { token: 'test-admin' });
  const adminDenied = await request('/admin/api/session', { cookie });
  check('admin session accepts role and token, denies users', adminByRole.status === 200 && adminByRole.body.mode === 'account' && adminByToken.status === 200 && adminByToken.body.mode === 'token' && adminDenied.status === 401);

  const annSet = await post('/admin/api/announcement', { text: 'Scheduled maintenance tonight', level: 'warning', enabled: true }, undefined, adminCookie);
  const annPublic = await request('/v1/status');
  check('admin announcement appears in public status', annSet.status === 200 && annPublic.body.announcement?.text === 'Scheduled maintenance tonight' && annPublic.body.announcement?.level === 'warning');
  const annClear = await post('/admin/api/announcement', { text: '', enabled: false }, undefined, adminCookie);
  const annGone = await request('/v1/status');
  check('admin can clear announcement', annClear.status === 200 && annGone.body.announcement === null);

  const wrongPw = await post('/v1/auth/login', { email: 'user@example.com', password: 'nope' });
  check('wrong password rejected', wrongPw.status === 401 && wrongPw.body.error === 'invalid_credentials');

  const session = await request('/v1/auth/session', { cookie });
  check('session cookie authenticates', session.status === 200 && session.body.user?.email === 'user@example.com');

  const profile = await request('/v1/account', { method: 'PATCH', body: { name: 'Renamed User' }, cookie });
  check('profile update', profile.body.user?.name === 'Renamed User');

  const badChange = await authPost('/v1/account/password', { current: 'wrong', next: 'another-long-password' }, cookie);
  check('password change requires current password', badChange.status === 400 && badChange.body.error === 'wrong_password');

  const change = await authPost('/v1/account/password', { current: 'correct-horse-battery', next: 'another-long-password' }, cookie);
  check('password change', change.status === 200);

  const resend = await authPost('/v1/auth/resend-verification', {}, cookie);
  check(
    'no fake verification prompt when mail is unconfigured',
    session.body.user?.emailVerified === true && resend.status === 400 && resend.body.error === 'already_verified',
    `verified=${session.body.user?.emailVerified} resend=${resend.status}/${resend.body.error}`
  );

  const badToken = await post('/v1/auth/verify-email', { token: 'not-a-token' });
  check('bad verification token rejected', badToken.status === 400 && badToken.body.error === 'invalid_token');

  const reset = await post('/v1/auth/password-reset', { email: 'user@example.com' });
  const resetUnknown = await post('/v1/auth/password-reset', { email: 'nobody@example.com' });
  check('password reset hides account existence', reset.status === 200 && resetUnknown.status === 200 && reset.body.ok === true && resetUnknown.body.ok === true);

  const checkout = await authPost('/v1/billing/checkout', { interval: 'month' }, cookie);
  check('checkout unavailable without URL', checkout.status === 503 && checkout.body.error === 'billing_unavailable');

  const portal = await authPost('/v1/billing/portal', {}, cookie);
  check('portal unavailable without URL', portal.status === 503 && portal.body.error === 'billing_unavailable');

  const badOrigin = await post('/v1/auth/login', { email: 'user@example.com', password: 'definitely-wrong-password' }, undefined, undefined);
  const csrf = await fetch(BASE + '/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' },
    body: JSON.stringify({ email: 'user@example.com', password: 'another-long-password' }),
  });
  check('bad origin blocked', csrf.status === 403 && badOrigin.status === 401, `csrf=${csrf.status} control=${badOrigin.status}`);

  const invalidRedeem = await authPost('/v1/account/redeem', { key: 'SWI-PRO-AAAAAAAA-BBBBBBBB-CCCCCCCC-DDDDDDDD' }, cookie);
  check('redeem rejects invalid key', invalidRedeem.status === 400 && invalidRedeem.body.error === 'invalid_key');

  const redeemKey = await post('/issue', { email: 'giveaway@example.com', plan: 'pro', days: 60 }, 'test-admin');
  const redeemed = await authPost('/v1/account/redeem', { key: redeemKey.body.key }, cookie);
  check('redeem grants Pro', redeemed.status === 200 && redeemed.body.user.plan === 'pro' && !!redeemed.body.license.proUntil);

  // ---- credits: manual payment, redeem, limited key mint, metered AI spend
  const manual = await post('/admin/api/manual-sale', {
    email: 'user@example.com', name: 'Test User', amount: 25, method: 'cash',
    days: 0, accessCredits: 3, aiCredits: 20, note: 'Paid at the desk',
  }, undefined, adminCookie);
  const afterManual = await request('/v1/account', { cookie });
  const balance = await request('/v1/credits', { cookie });
  check('manual payment records an invoice', manual.status === 200 && manual.body.sale.codes.length === 2 && afterManual.body.invoices.some((i) => i.id === manual.body.sale.id));
  check('manual payment grants both balances', balance.body.credits.access === 3 && balance.body.credits.ai === 20 && balance.body.credits.accessDays === 30);

  const redeemedAccess = await authPost('/v1/credits/redeem', { credits: 2 }, cookie);
  const afterAccess = await request('/v1/credits', { cookie });
  check('access credits buy Pro days', redeemedAccess.status === 200 && redeemedAccess.body.days === 60 && afterAccess.body.credits.access === 1 && afterAccess.body.credits.ai === 20);

  const minted = await authPost('/v1/credits/key', { credits: 1, maxDevices: 1 }, cookie);
  const mintedCheck = await post('/validate', { key: minted.body.key });
  const afterMint = await request('/v1/credits', { cookie });
  check('access credits mint a limited key', minted.status === 200 && mintedCheck.body.valid === true && mintedCheck.body.max === 1 && mintedCheck.body.maxRedemptions === 1 && afterMint.body.credits.access === 0);

  const aiOnce = await authPost('/v1/ai/usage', { units: 5, idempotencyKey: 'test-idempotency-001' }, cookie);
  const aiTwice = await authPost('/v1/ai/usage', { units: 5, idempotencyKey: 'test-idempotency-001' }, cookie);
  const aiTooMuch = await authPost('/v1/ai/usage', { units: 999, idempotencyKey: 'test-idempotency-002' }, cookie);
  const afterAi = await request('/v1/credits', { cookie });
  check('AI credits spend once per idempotency key', aiOnce.status === 200 && aiOnce.body.remaining === 15 && aiTwice.body.cached === true && aiTwice.body.remaining === 15 && aiTooMuch.status === 402 && afterAi.body.credits.ai === 15);

  const second = await register('second@example.com', 'another-long-password', { name: 'Second' });
  const reused = await authPost('/v1/account/redeem', { key: redeemKey.body.key }, second.cookie);
  check('redeemed key cannot be reused', reused.status === 409 && reused.body.error === 'key_used');

  const mintedRedeem = await authPost('/v1/account/redeem', { key: minted.body.key }, second.cookie);
  const mintedTwice = await authPost('/v1/account/redeem', { key: minted.body.key }, cookie);
  check('minted key allows one redemption', mintedRedeem.status === 200 && mintedRedeem.body.license.maxDevices === 1 && mintedTwice.status === 409 && mintedTwice.body.error === 'key_used');

  const adminKey = await post('/admin/api/user/key', {
    email: 'second@example.com', plan: 'pro', days: 7, maxDevices: 1,
    maxRedemptions: 1, aiCredits: 5, note: 'Admin test key',
  }, undefined, adminCookie);
  const adminKeyCheck = await post('/validate', { key: adminKey.body.key });
  const revokedKey = await post('/admin/api/key/revoke', { key: adminKey.body.key, note: 'Test revoke' }, undefined, adminCookie);
  const revokedCheck = await post('/validate', { key: adminKey.body.key });
  check('admin key limits and revoke work', adminKeyCheck.body.max === 1 && adminKeyCheck.body.maxRedemptions === 1 && adminKeyCheck.body.usedAccounts === 0 && revokedKey.body.ok === true && revokedCheck.body.valid === false && revokedCheck.body.revoked === true);

  const roleChange = await post('/admin/api/user/role', { email: 'second@example.com', role: 'admin' }, undefined, adminCookie);
  const users = await request('/admin/api/users', { cookie: adminCookie });
  const secondRow = users.body.find((u) => u.email === 'second@example.com');
  const planChange = await post('/admin/api/user/plan', { email: 'second@example.com', plan: 'pro', days: 10, maxDevices: 1 }, undefined, adminCookie);
  const auditRows = await request('/admin/api/audit?limit=100&action=credits', { cookie: adminCookie });
  check('admin can change roles, plans and read logs', roleChange.body.role === 'admin' && secondRow?.role === 'admin' && planChange.body.plan === 'pro' && planChange.body.proUntil && auditRows.body.some((e) => String(e.action).startsWith('credits.')));

  const device = redeemed.body.devices[0];
  const revoked = await request('/v1/devices/' + encodeURIComponent(device.id), { method: 'DELETE', cookie });
  check('revoke device', revoked.status === 200 && !revoked.body.devices.some((d) => d.id === device.id));

  const loggedOut = await authPost('/v1/auth/logout', {}, cookie);
  const stale = await request('/v1/account', { cookie });
  check('logout invalidates cookie', loggedOut.status === 200 && stale.status === 401);

  const relogin = await post('/v1/auth/login', { email: 'user@example.com', password: 'another-long-password' });
  cookie = relogin.cookie;
  const everywhere = await authPost('/v1/auth/logout-all', {}, cookie);
  const staleAgain = await request('/v1/account', { cookie });
  check('logout everywhere invalidates session', everywhere.status === 200 && staleAgain.status === 401);

  const third = await post('/v1/auth/login', { email: 'user@example.com', password: 'another-long-password' });
  cookie = third.cookie;
  const badDelete = await request('/v1/account', { method: 'DELETE', body: { password: 'wrong' }, cookie });
  check('delete account requires password', badDelete.status === 400 && badDelete.body.error === 'wrong_password');

  const webhook = await post('/v1/billing/webhook', { type: 'payment.succeeded' });
  check('webhook disabled without secret', webhook.status === 503 && webhook.body.error === 'billing_unavailable');

  const deleted = await request('/v1/account', { method: 'DELETE', body: { password: 'another-long-password' }, cookie });
  const afterDelete = await post('/v1/auth/login', { email: 'user@example.com', password: 'another-long-password' });
  check('delete account', deleted.status === 200 && afterDelete.status === 401);

  const finalStats = await request('/stats', { token: 'test-admin' });
  check('stats counts accounts', typeof finalStats.body.accounts === 'number');

  // ---- admin is never public when neither auth method is configured
  const port4 = 8790;
  const files4 = [dataFile + '.noadmin', accountsFile + '.noadmin'];
  const child4 = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      ...NO_MAIL,
      PORT: String(port4),
      LICENSE_SECRET: 'test-secret-do-not-use',
      ADMIN_TOKEN: '',
      ADMIN_EMAILS: '',
      DATA_FILE: files4[0],
      ACCOUNTS_FILE: files4[1],
      AUDIT_FILE: prefix + '-audit-noadmin.jsonl',
      BILLING_PROVIDER: 'generic',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  spawned.push(child4);
  child4.stderr.on('data', (d) => process.stderr.write(d));
  BASE = `http://127.0.0.1:${port4}`;
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const noAdmin = await request('/admin/api/session', { token: 'anything' });
  check('admin routes locked when unconfigured', noAdmin.status === 503 && noAdmin.body.error === 'admin_unconfigured');
  BASE = `http://127.0.0.1:${PORT}`;

  // ---- second instance: configured checkout + signed provider-neutral webhook
  const port2 = 8789;
  const files2 = [dataFile + '.webhook', accountsFile + '.webhook'];
  const child2 = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      ...NO_MAIL,
      PORT: String(port2),
      LICENSE_SECRET: 'test-secret-do-not-use',
      DATA_FILE: files2[0],
      ACCOUNTS_FILE: files2[1],
      BILLING_PROVIDER: 'generic',
      BILLING_WEBHOOK_SECRET: 'test-webhook-secret',
      CHECKOUT_URL_MONTHLY: 'https://example.com/checkout/month',
      CHECKOUT_PORTAL_URL: 'https://example.com/portal',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  spawned.push(child2);
  child2.stderr.on('data', (d) => process.stderr.write(d));
  BASE = `http://127.0.0.1:${port2}`;
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const buyer = await register('buyer@example.com', 'a-very-long-password', { name: 'Buyer' });
  const configured = await authPost('/v1/billing/checkout', { interval: 'month' }, buyer.cookie);
  check('configured checkout returns provider URL', configured.status === 200 && configured.body.url === 'https://example.com/checkout/month');

  const event = JSON.stringify({
    type: 'payment.succeeded',
    data: { email: 'buyer@example.com', interval: 'month', amount: 1000, invoiceId: 'INV-TEST-1', description: 'Wicked Pro — monthly' },
  });
  const signature = crypto.createHmac('sha256', 'test-webhook-secret').update(event).digest('hex');
  const webhookOK = await fetch(BASE + '/v1/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': 'sha256=' + signature },
    body: event,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  check('signed webhook accepted', webhookOK.status === 200 && webhookOK.body.ok === true, webhookOK.body.account || '');

  const afterPay = await request('/v1/account', { cookie: buyer.cookie });
  check('webhook upgrades account and stores invoice', afterPay.body.user?.plan === 'pro' && afterPay.body.invoices?.[0]?.id === 'INV-TEST-1' && afterPay.body.invoices[0].amount === '$10.00');

  const replay = await fetch(BASE + '/v1/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': 'sha256=' + signature },
    body: event,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const afterReplay = await request('/v1/account', { cookie: buyer.cookie });
  check(
    'webhook replay is idempotent',
    replay.status === 200 && replay.body.duplicate === true && afterReplay.body.invoices?.length === 1 && afterReplay.body.subscription?.renewsAt === afterPay.body.subscription?.renewsAt,
    `duplicate=${replay.body.duplicate} invoices=${afterReplay.body.invoices?.length}`
  );

  const badSig = await fetch(BASE + '/v1/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-webhook-signature': 'sha256=deadbeef' },
    body: event,
  });
  check('bad webhook signature rejected', badSig.status === 401);

  const portalConfigured = await authPost('/v1/billing/portal', {}, buyer.cookie);
  check('configured portal opens for subscriber', portalConfigured.status === 200 && portalConfigured.body.url === 'https://example.com/portal');

  // ---- third instance: Payhip checkout links + Payhip's body-signature format
  const port3 = 8791;
  const files3 = [dataFile + '.payhip', accountsFile + '.payhip'];
  const child3 = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      ...NO_MAIL,
      PORT: String(port3),
      LICENSE_SECRET: 'test-secret-do-not-use',
      DATA_FILE: files3[0],
      ACCOUNTS_FILE: files3[1],
      BILLING_PROVIDER: 'payhip',
      PAYHIP_API_KEY: 'test-payhip-key',
      CHECKOUT_URL_MONTHLY: 'https://payhip.com/b/MONTHLYKEY',
      CHECKOUT_URL_YEARLY: 'https://payhip.com/b/YEARLYKEY',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  spawned.push(child3);
  child3.stderr.on('data', (d) => process.stderr.write(d));
  BASE = `http://127.0.0.1:${port3}`;
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const phBuyer = await register('payhip@example.com', 'a-very-long-password', { name: 'Payhip Buyer' });
  const phCheckout = await authPost('/v1/billing/checkout', { interval: 'year' }, phBuyer.cookie);
  check('Payhip checkout URL returned', phCheckout.status === 200 && phCheckout.body.url === 'https://payhip.com/b/YEARLYKEY');

  const phSig = crypto.createHash('sha256').update('test-payhip-key').digest('hex');
  const sendPayhip = async (event) => fetch(BASE + '/v1/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...event, signature: phSig }),
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const paid = await sendPayhip({
    type: 'paid',
    id: 'PH-123',
    email: 'different@example.com',
    metadata: { wicked_email: 'payhip@example.com' },
    price: 1000,
    date: 1703693218,
    items: [{ product_name: 'Wicked Imgui Pro — Monthly' }],
  });
  check('signed Payhip paid event accepted', paid.status === 200 && paid.body.ok === true, `${paid.status} ${JSON.stringify(paid.body)}`);
  const phPaid = await request('/v1/account', { cookie: phBuyer.cookie });
  const expectedDate = new Date(1703693218 * 1000).toISOString().slice(0, 10);
  check('Payhip metadata picks the account and normalises the invoice', phPaid.body.user?.plan === 'pro' && phPaid.body.invoices?.[0]?.id === 'PH-123' && phPaid.body.invoices[0].amount === '$10.00' && phPaid.body.invoices[0].date === expectedDate, phPaid.body.invoices?.[0]?.date);

  const badPh = await fetch(BASE + '/v1/billing/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'paid', id: 'PH-BAD', email: 'payhip@example.com', signature: 'deadbeef' }),
  });
  check('bad Payhip signature rejected', badPh.status === 401);

  const cancelled = await sendPayhip({ type: 'subscription.deleted', subscription_id: 'PH-SUB-1', customer_email: 'payhip@example.com' });
  const phCancelled = await request('/v1/account', { cookie: phBuyer.cookie });
  check('Payhip subscription.deleted cancels renewal', cancelled.status === 200 && phCancelled.body.subscription?.status === 'cancelled' && phCancelled.body.subscription?.renews === false);

  const refunded = await sendPayhip({ type: 'refunded', id: 'PH-REFUND-1', email: 'payhip@example.com', amount_refunded: 1000, date_refunded: 1703693410 });
  const phRefunded = await request('/v1/account', { cookie: phBuyer.cookie });
  check('Payhip refund returns account to Free', refunded.status === 200 && phRefunded.body.user?.plan === 'free' && phRefunded.body.subscription === null);

  // ---- email delivery: webhook transport, usable links, no fake "sent" claims
  const mailPort = 8792;
  const sinkPort = 8793;
  const capturedMail = [];
  const sink = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try { capturedMail.push(JSON.parse(raw)); } catch { /* ignore malformed */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((resolve) => sink.listen(sinkPort, '127.0.0.1', resolve));
  const files5 = [dataFile + '.mail', accountsFile + '.mail'];
  const mailBase = `http://127.0.0.1:${mailPort}`;
  const mailSite = mailBase + '/';
  const child5 = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: {
      ...process.env,
      ...NO_MAIL,
      PORT: String(mailPort),
      LICENSE_SECRET: 'test-secret-do-not-use',
      DATA_FILE: files5[0],
      ACCOUNTS_FILE: files5[1],
      BILLING_PROVIDER: 'generic',
      MAIL_WEBHOOK_URL: `http://127.0.0.1:${sinkPort}/mail`,
      SITE_URL: mailSite,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  spawned.push(child5);
  child5.stderr.on('data', (d) => process.stderr.write(d));
  BASE = mailBase;
  for (let i = 0; i < 60; i++) {
    try { await fetch(BASE + '/health'); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const waitForMail = async (n) => {
    for (let i = 0; i < 50 && capturedMail.length < n; i++) await new Promise((r) => setTimeout(r, 50));
  };

  const mailUser = await register('mailer@example.com', 'a-very-long-password');
  check('mail configured marks new email unverified', mailUser.body.user?.emailVerified === false, `status=${mailUser.status} verified=${mailUser.body.user?.emailVerified}`);
  await waitForMail(1);
  const verifyMail = capturedMail.find((m) => m.type === 'verify');
  check(
    'signup delivers verification link',
    !!verifyMail && verifyMail.link.startsWith(mailSite + 'confirm.html?type=verify&token=') && verifyMail.text.includes(verifyMail.link) && verifyMail.subject.includes('Confirm'),
    verifyMail?.link || 'no mail captured'
  );
  const verifyToken = new URL(verifyMail.link).searchParams.get('token');
  const verified = await post('/v1/auth/verify-email', { token: verifyToken });
  const mailSession = await request('/v1/auth/session', { cookie: mailUser.cookie });
  check('emailed verification token works', verified.status === 200 && mailSession.body.user?.emailVerified === true);

  await post('/v1/auth/password-reset', { email: 'mailer@example.com' });
  await waitForMail(2);
  const resetMail = capturedMail.find((m) => m.type === 'reset');
  check(
    'reset email delivers a usable link',
    !!resetMail && resetMail.link.startsWith(mailSite + 'confirm.html?type=reset&token=') && resetMail.text.includes(resetMail.link) && resetMail.html.includes('type=reset&amp;token=') && resetMail.subject.includes('Reset'),
    resetMail?.link || 'no mail captured'
  );
  const resetToken = new URL(resetMail.link).searchParams.get('token');
  const confirmReset = await post('/v1/auth/password-reset/confirm', { token: resetToken, password: 'a-brand-new-password' });
  const mailRelogin = await post('/v1/auth/login', { email: 'mailer@example.com', password: 'a-brand-new-password' });
  check('emailed reset token sets a new password', confirmReset.status === 200 && mailRelogin.status === 200);
  const resetReused = await post('/v1/auth/password-reset/confirm', { token: resetToken, password: 'yet-another-password' });
  check('reset token cannot be reused', resetReused.status === 400 && resetReused.body.error === 'invalid_token');
  sink.close();

  // ---- managed persistence: an account survives a full server restart
  const dbPort = 8794;
  const remoteRows = new Map();
  const dbSink = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/rest/v1/wicked_state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify([...remoteRows.entries()].map(([id, data]) => ({ id, data }))));
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/wicked_state') {
      let raw = '';
      req.on('data', (chunk) => { raw += chunk; });
      req.on('end', () => {
        try {
          for (const row of JSON.parse(raw)) remoteRows.set(String(row.id), row.data || {});
          res.writeHead(201, { 'Content-Type': 'application/json' });
          res.end('[]');
        } catch { res.writeHead(400); res.end('{}'); }
      });
      return;
    }
    res.writeHead(404); res.end('{}');
  });
  await new Promise((resolve) => dbSink.listen(dbPort, '127.0.0.1', resolve));
  const remoteEnv = {
    ...process.env,
    ...NO_MAIL,
    LICENSE_SECRET: 'test-secret-do-not-use',
    BILLING_PROVIDER: 'generic',
    STORAGE_BACKEND: 'supabase',
    SUPABASE_URL: `http://127.0.0.1:${dbPort}`,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  };
  const spawnRemote = (port, suffix) => {
    const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      env: {
        ...remoteEnv,
        PORT: String(port),
        DATA_FILE: dataFile + suffix,
        ACCOUNTS_FILE: accountsFile + suffix,
        AUDIT_FILE: prefix + '-audit' + suffix + '.jsonl',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    spawned.push(child);
    child.stderr.on('data', (d) => process.stderr.write(d));
    return child;
  };
  const waitForHealth = async (base) => {
    for (let i = 0; i < 60; i++) {
      try { await fetch(base + '/health'); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
  };
  const remoteA = spawnRemote(8795, '.remote-a');
  const remoteBaseA = 'http://127.0.0.1:8795';
  await waitForHealth(remoteBaseA);
  BASE = remoteBaseA;
  const persisted = await register('persist@example.com', 'a-long-persistent-password');
  check('managed store accepts registration', persisted.status === 200 && persisted.body.user?.email === 'persist@example.com');
  await new Promise((r) => setTimeout(r, 400));
  check('managed store holds account snapshot', remoteRows.has('accounts') && !!remoteRows.get('accounts')?.users?.['persist@example.com']);
  remoteA.kill();
  await new Promise((r) => setTimeout(r, 300));
  const remoteB = spawnRemote(8796, '.remote-b');
  const remoteBaseB = 'http://127.0.0.1:8796';
  await waitForHealth(remoteBaseB);
  BASE = remoteBaseB;
  const afterRestart = await post('/v1/auth/login', { email: 'persist@example.com', password: 'a-long-persistent-password' });
  check('account survives a full server restart', afterRestart.status === 200 && afterRestart.body.user?.email === 'persist@example.com', `${afterRestart.status}/${afterRestart.body.error || ''}`);
  dbSink.close();
  BASE = `http://127.0.0.1:${PORT}`;

  for (const c of spawned) c.kill();
  for (const f of [dataFile, accountsFile, ...files2, ...files3, ...files4, ...files5,
    dataFile + '.remote-a', accountsFile + '.remote-a', dataFile + '.remote-b', accountsFile + '.remote-b']) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  for (const f of [prefix + '-audit.jsonl', prefix + '-audit-noadmin.jsonl']) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); for (const c of spawned) c.kill(); process.exit(1); });
