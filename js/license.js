// Client for the free self-hosted license server in ../server (see FREE-STACK.md).
// In preview mode nothing is sent — CONFIG.license.mode is 'preview'.
import { CONFIG } from './config.js';

const enabled = () => CONFIG.license?.mode === 'remote' && !!CONFIG.license.url;

async function call(path, body) {
  if (!enabled()) throw new Error('License server is not configured');
  let res;
  try {
    res = await fetch(CONFIG.license.url.replace(/\/$/, '') + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Can’t reach the license server. Is it running?');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'License request failed');
  return data;
}

/** A cheap, stable identifier for this browser. Not a security boundary — the server is. */
export function deviceId() {
  let id;
  try { id = localStorage.getItem('swi.device'); } catch { /* storage blocked */ }
  if (!id) {
    const seed = [navigator.userAgent, navigator.language, screen.width + 'x' + screen.height, String(Date.now())].join('|');
    id = 'dev_' + seed.length + Math.abs(hash(seed)).toString(16).padStart(8, '0');
    try { localStorage.setItem('swi.device', id); } catch { /* storage blocked */ }
  }
  return id;
}

function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export const licenseHealth = () => call('/health');
export const validateKey = (key) => call('/validate', { key });
export const activateKey = (key, extra = {}) => call('/activate', { key, device: deviceId(), ...extra });
export const deactivateKey = (key, device = deviceId()) => call('/deactivate', { key, device });
/** Only useful from the admin side — protect this endpoint in production. */
export const issueKey = (body) => call('/issue', body);
