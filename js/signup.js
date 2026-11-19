import { auth, session, errorText, isPreview } from './auth.js';
import { $, $$, busy, formError, passwordToggles, passwordScore } from './ui.js';
import { CONFIG } from './config.js';

$$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
const params = new URLSearchParams(location.search);
const wantsPro = params.get('plan') === 'pro';
const yearly = wantsPro && params.get('billing') === 'yearly' && !!CONFIG.proYearly;
const target = wantsPro ? (yearly ? 'index.html?billing=yearly#billing' : 'index.html#billing') : 'index.html';
session().then((s) => { if (s) location.replace(target); }).catch(() => {});
passwordToggles();
if (isPreview) $('[data-preview]').hidden = false;
if (wantsPro) $('#signup-lead').textContent = `Create your account first — you’ll get Wicked Pro (${yearly ? `${CONFIG.proYearly.price} a year` : `${CONFIG.pro.price} a month`}) on the next step.`;

const form = $('#signup-form');
const { name, email, password, terms } = form;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

password.addEventListener('input', () => {
  $('.strength').dataset.s = passwordScore(password.value);
  password.classList.remove('invalid');
});
email.addEventListener('blur', () => {
  const bad = email.value.trim() && !EMAIL.test(email.value.trim());
  email.classList.toggle('invalid', !!bad);
  $('#email-err').textContent = bad ? 'That doesn’t look like an email address.' : '';
});
email.addEventListener('input', () => { email.classList.remove('invalid'); $('#email-err').textContent = ''; });
name.addEventListener('input', () => name.classList.remove('invalid'));

form.addEventListener('submit', (e) => {
  e.preventDefault();
  formError(form, '');
  const problems = [
    [name, !name.value.trim(), 'Tell us your name.'],
    [email, !EMAIL.test(email.value.trim()), 'Enter a valid email address.'],
    [password, password.value.length < 10, 'Use at least 10 characters for your password.'],
    [terms, !terms.checked, 'Please accept the Terms to continue.'],
  ].filter(([, bad]) => bad);
  for (const [el] of problems) if (el !== terms) el.classList.add('invalid');
  if (problems.length) {
    formError(form, problems[0][2]);
    problems[0][0].focus();
    return;
  }
  busy($('[type=submit]', form), async () => {
    try {
      await auth.register({ name: name.value.trim(), email: email.value.trim(), password: password.value });
      location.replace(target + (target.includes('#') ? '' : '#welcome'));
    } catch (err) {
      formError(form, errorText(err));
      if (err.code === 'email_taken' || err.code === 'invalid_email') email.classList.add('invalid');
      if (err.code === 'weak_password') password.classList.add('invalid');
    }
  });
});
