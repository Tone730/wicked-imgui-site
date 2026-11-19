import { auth, session, errorText, isPreview } from './auth.js';
import { $, $$, busy, formError, passwordToggles } from './ui.js';

// only ever redirect to one of our own pages (no open redirects through ?next=)
// The original site used `dashboard#view` here; this local remake serves it as `index.html#view`.
const next = new URLSearchParams(location.search).get('next') || '';
const match = /^(?:dashboard|admin|index\.html)(\?[^#]*)?(#[a-z]+)?$/.exec(next);
const target = match ? 'index.html' + (match[1] || '') + (match[2] || '') : 'index.html';

$$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
session().then((s) => { if (s) location.replace(target); }).catch(() => {});
passwordToggles();

const form = $('#login-form');
const email = $('#email');
const password = $('#password');

if (isPreview) {
  $('[data-preview]').hidden = false;
  $$('[data-fill]').forEach((b) => b.addEventListener('click', () => {
    email.value = password.value = b.dataset.fill;
    form.requestSubmit();
  }));
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  formError(form, '');
  email.classList.toggle('invalid', !email.value.trim());
  password.classList.toggle('invalid', !password.value);
  if (!email.value.trim() || !password.value) {
    formError(form, 'Enter your email and password.');
    (email.value.trim() ? password : email).focus();
    return;
  }
  busy($('[type=submit]', form), async () => {
    try {
      await auth.login({ email: email.value.trim(), password: password.value, remember: form.remember.checked });
      location.replace(target);
    } catch (err) {
      formError(form, errorText(err));
      if (err.code === 'invalid_credentials') { password.select(); password.classList.add('invalid'); }
    }
  });
});
[email, password].forEach((i) => i.addEventListener('input', () => i.classList.remove('invalid')));

// ---- password reset
const loginView = $('#login-view');
const resetView = $('#reset-view');
const resetForm = $('#reset-form');
function showReset(on) {
  loginView.hidden = on;
  resetView.hidden = !on;
  resetForm.hidden = false;
  $('#reset-done').hidden = true;
  if (on) {
    if (/@/.test(email.value)) $('#reset-email').value = email.value.trim();
    $('#reset-email').focus();
  } else email.focus();
}
$('#forgot').addEventListener('click', (e) => { e.preventDefault(); history.replaceState(null, '', '#reset'); showReset(true); });
$$('[data-back]').forEach((b) => b.addEventListener('click', () => { history.replaceState(null, '', location.pathname + location.search); showReset(false); }));
if (location.hash === '#reset') showReset(true);

resetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = $('#reset-email').value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) { formError(resetForm, 'Enter the email address of your account.'); return; }
  formError(resetForm, '');
  busy($('[type=submit]', resetForm), async () => {
    try {
      await auth.requestReset({ email: value });
      $('#reset-to').textContent = value;
      resetForm.hidden = true;
      $('#reset-done').hidden = false;
    } catch (err) { formError(resetForm, errorText(err)); }
  });
});
