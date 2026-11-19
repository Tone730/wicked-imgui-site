// Account client. With CONFIG.apiBase set it talks to the Wicked Imgui account server (see README.md → API);
// without it the site runs in preview mode and keeps accounts in this browser's localStorage.
import { CONFIG } from './config.js';
import { ApiError } from './api-error.js';

export { ApiError };
export const isPreview = !CONFIG.apiBase;

const MESSAGES = {
  invalid_credentials: 'Wrong email or password.',
  email_taken: 'An account with this email already exists. Log in instead?',
  invalid_email: 'Enter a valid email address.',
  weak_password: 'Use at least 10 characters for your password.',
  wrong_password: 'That password isn’t correct.',
  rate_limited: 'Too many attempts. Wait a minute and try again.',
  unauthorized: 'Your session has ended. Log in again.',
  network: 'Can’t reach the Wicked Imgui server. Check your connection and try again.',
  server_error: 'Something went wrong on our side. Try again in a moment.',
  invalid_token: 'This link has expired or was already used. Ask for a new one.',
  invalid_request: 'Something in the form isn’t right. Check it and try again.',
  already_pro: 'You already have Wicked Pro.',
  already_subscribed: 'Your Wicked Pro subscription is already running. Manage it under Billing.',
  no_subscription: 'There’s no subscription on this account.',
  billing_unavailable: 'Payments aren’t available right now. Try again later.',
  bad_origin: 'Reload the page and try again.',
  not_found: 'That no longer exists. Reload the page.',
  account_disabled: 'This account has been disabled. Contact wick777@engineer.com.',
  wrong_code: 'That code isn’t right. Wait for the next one and try again.',
  admin_locked: 'Admin mode has ended. Enter a new code.',
  totp_not_set: 'No 2-step code is set up for this account. Run “npm run admin -- grant” on the server.',
  not_an_exe: 'That file isn’t a Windows program (.exe).',
  invalid_version: 'Use a version like 1.2.0.',
  release_unsigned: 'This version isn’t signed with your release key yet. Add its .sig file (npm run release:sign) first.',
  bad_release_signature: 'That signature doesn’t match this file and version, or wasn’t made with your release key. Sign the exact file you uploaded.',
  release_key_not_configured: 'The server has no RELEASE_PUBLIC_KEY in its .env, so nothing can be published. See SETUP.md §13.',
  bad_sig_file: 'That isn’t a .sig file from npm run release:sign.',
  sig_mismatch: 'That .sig belongs to a different version or file.',
  release_published: 'This version is published — its file can’t be replaced. Use a new version number.',
  too_big: 'The file is too big (2 GB max).',
  downloads_not_configured: 'DOWNLOADS_DIR isn’t set on the server.',
  cannot_disable_self: 'You can’t disable your own account.',
  invalid_key: 'That license key isn’t valid. Check it and try again.',
  key_used: 'This license key has already been used on another account.',
  already_redeemed: 'You already redeemed this key.',
  key_expired: 'This license key has expired.',
  license_in_use: 'This key has been redeemed — revoke it instead of deleting it.',
  days_required: 'Enter how many days of Pro the key gives.',
  date_in_past: 'The redeem-by date is in the past.',
  confirm_mismatch: 'The email you typed doesn’t match the account.',
  cannot_delete_admin: 'Admin accounts can’t be deleted here. Revoke admin on the server first.',
  already_verified: 'This email is already confirmed.',
};
export function errorText(e) {
  return MESSAGES[e?.code] || e?.message || MESSAGES.server_error;
}

// ---------------------------------------------------------------- server
async function call(method, path, body) {
  let res;
  try {
    res = await fetch(CONFIG.apiBase.replace(/\/$/, '') + path, {
      method,
      credentials: 'include', // session cookie (HttpOnly, Secure, SameSite=Lax) set by the server
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('network');
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || (res.status === 401 ? 'unauthorized' : res.status === 429 ? 'rate_limited' : 'server_error'), data.message, res.status);
  return data;
}

export { call as apiCall };

const server = {
  register: (b) => call('POST', '/v1/auth/register', b),
  login: (b) => call('POST', '/v1/auth/login', b),
  logout: () => call('POST', '/v1/auth/logout'),
  logoutEverywhere: () => call('POST', '/v1/auth/logout-all'),
  requestReset: (b) => call('POST', '/v1/auth/password-reset', b),
  confirmReset: (b) => call('POST', '/v1/auth/password-reset/confirm', b),
  verifyEmail: (b) => call('POST', '/v1/auth/verify-email', b),
  resendVerification: () => call('POST', '/v1/auth/resend-verification'),
  account: () => call('GET', '/v1/account'),
  session: async () => { const a = await call('GET', '/v1/auth/session'); return a.user ? a : null; },
  updateProfile: (b) => call('PATCH', '/v1/account', b),
  changePassword: (b) => call('POST', '/v1/account/password', b),
  deleteAccount: (b) => call('DELETE', '/v1/account', b),
  revokeDevice: (id) => call('DELETE', '/v1/devices/' + encodeURIComponent(id)),
  releases: () => call('GET', '/v1/releases'),
  status: () => call('GET', '/v1/status'),
  checkout: (interval = 'month') => call('POST', '/v1/billing/checkout', { interval }),
  portal: () => call('POST', '/v1/billing/portal'),
  redeem: (b) => call('POST', '/v1/account/redeem', b),
};

// ---------------------------------------------------------------- preview mode (browser only)
// Without a server the demo implementation is loaded from auth-preview.js; the real site never loads it.
const previewMod = isPreview ? await import('./auth-preview.js') : null;

export const auth = isPreview ? previewMod.preview : server;

/** Current account, or null when signed out. */
export async function session() {
  if (!isPreview) return server.session();
  if (!previewMod.hasLocalSession()) return null;
  try { return await auth.account(); } catch (e) { if (e.code === 'unauthorized') return null; throw e; }
}
