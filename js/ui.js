// Small helpers shared by the account pages: buttons with a busy state, form errors, toasts, confirm dialogs.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const icon = (id, size) => `<svg class="icon"${size ? ` style="width:${size}px;height:${size}px"` : ''}><use href="assets/icons.svg#${id}"/></svg>`;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Puts a spinner in a button while `fn` runs and keeps it from being pressed twice. */
export async function busy(btn, fn) {
  if (btn.disabled) return;
  const html = btn.innerHTML;
  btn.style.width = btn.offsetWidth + 'px';
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>';
  if (!btn.classList.contains('primary')) btn.querySelector('.spinner').style.cssText = 'border-color:var(--line-2);border-top-color:var(--text)';
  try { return await fn(); } finally {
    btn.disabled = false;
    btn.innerHTML = html;
    btn.style.width = '';
  }
}

export function formError(form, text) {
  const box = $('.form-error', form);
  if (!box) return;
  box.querySelector('span').textContent = text || '';
  box.classList.toggle('show', !!text);
}

/** Show/hide buttons next to password inputs. */
export function passwordToggles(root = document) {
  $$('.pw button', root).forEach((b) => b.addEventListener('click', () => {
    const input = b.previousElementSibling;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.innerHTML = icon(show ? 'eye-off' : 'eye', 17);
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    input.focus();
  }));
}

/** 0–4, rough but honest: length matters most, then variety. */
export function passwordScore(pw) {
  if (!pw) return 0;
  let s = pw.length >= 10 ? 2 : 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (pw.length >= 12 && kinds >= 3) s++;
  if (pw.length >= 16 || (pw.length >= 12 && kinds === 4)) s++;
  if (/^(.)\1+$/.test(pw) || /^(password|qwerty|12345)/i.test(pw)) s = 1;
  return Math.min(4, s);
}

let host;
export function toast(text, kind = 'ok') {
  host ||= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast-host' }));
  host.setAttribute('role', 'status');
  const el = document.createElement('div');
  el.className = 'site-toast' + (kind === 'error' ? ' error' : '');
  el.innerHTML = `<i></i><span>${esc(text)}</span>`;
  host.appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .25s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 260); }, 3200);
}

/**
 * Confirm dialog. With `password: true` it asks for the password and resolves with it;
 * `action(password)` runs inside the dialog so its errors can be shown in place.
 */
export function confirmDialog({ title, text, confirm = 'Confirm', danger = false, password = false, action }) {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = `
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" novalidate>
        <h3 id="modal-title">${esc(title)}</h3>
        <p>${text}</p>
        ${password ? `<div class="field" style="margin-top:18px"><label for="modal-pw">Password</label>
          <div class="pw"><input class="input" id="modal-pw" type="password" autocomplete="current-password" required>
          <button type="button" aria-label="Show password">${icon('eye', 17)}</button></div></div>` : ''}
        <div class="form-error" role="alert" style="margin-top:14px">${icon('info', 15)}<span></span></div>
        <div class="row">
          <button class="btn" type="button" data-cancel>Cancel</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" type="submit">${esc(confirm)}</button>
        </div>
      </form>`;
    document.body.appendChild(back);
    const form = $('form', back);
    const prevFocus = document.activeElement;
    passwordToggles(back);
    const close = (v) => {
      back.remove();
      removeEventListener('keydown', onKey);
      prevFocus?.focus?.();
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    addEventListener('keydown', onKey);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
    $('[data-cancel]', back).addEventListener('click', () => close(null));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = password ? $('#modal-pw', back).value : true;
      if (password && !pw) { formError(form, 'Enter your password to confirm.'); return; }
      if (!action) { close(pw); return; }
      formError(form, '');
      try {
        await busy($('[type=submit]', form), () => action(pw));
        close(pw);
      } catch (err) {
        formError(form, err.userText || err.message);
      }
    });
    ($('#modal-pw', back) || $('[type=submit]', back)).focus();
  });
}

export function initials(name, email) {
  const src = (name || email || '?').trim();
  const parts = src.split(/[\s@._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[1][0] : '')).toUpperCase();
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const fmtDate = (iso) => {
  if (!iso) return '—';
  // Date-only values are calendar dates, not UTC instants. Parse them locally so
  // they do not shift backwards in time zones west of UTC.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : DATE.format(date);
};
export function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (s < 90) return 'Active now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const days = Math.round(s / 86400);
  if (days < 30) return days === 1 ? 'Yesterday' : `${days} days ago`;
  return fmtDate(iso);
}
