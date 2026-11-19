// "Confirm your email" reminder for signed-in accounts that haven't confirmed yet.
import { auth, errorText } from './auth.js';
import { busy, toast, icon, esc } from './ui.js';

/** Builds the strip shown at the top of the landing page. */
export function verifyStrip(account) {
  const el = document.createElement('div');
  el.className = 'verify-strip';
  el.setAttribute('role', 'status');
  el.innerHTML = `
    <div class="wrap">
      ${icon('info', 15)}
      <span class="grow">Confirm your email<span class="hide-xs"> — we sent a link to <b>${esc(account.user.email)}</b></span>.</span>
      <button class="btn sm" type="button">Send again</button>
    </div>`;
  el.querySelector('button').addEventListener('click', (e) => busy(e.currentTarget, resend));
  return el;
}

export async function resend() {
  try {
    await auth.resendVerification();
    toast('Link sent — check your inbox');
  } catch (err) { toast(errorText(err), 'error'); }
}

/** Calls onVerified once the address is confirmed (e.g. the link was opened in another tab). */
export function watchVerified(onVerified) {
  const check = async () => {
    if (document.visibilityState !== 'visible') return;
    try {
      const acc = await auth.session();
      if (acc?.user.emailVerified) { stop(); onVerified(acc); }
    } catch { /* offline: try again next time */ }
  };
  const stop = () => { removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
}
