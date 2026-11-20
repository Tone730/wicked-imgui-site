// Handles links emailed by the account server:
//   confirm.html?type=verify&token=...  → confirm the address (automatic)
//   confirm.html?type=reset&token=...   → choose a new password
import { auth, errorText, isPreview } from './auth.js';
import { $, busy, formError, passwordToggles, passwordScore } from './ui.js';

document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

const params = new URLSearchParams(location.search);
const type = params.get('type');
const token = params.get('token') || '';
const title = $('#confirm-title');
const lead = $('#confirm-lead');
const status = $('#confirm-status');
const form = $('#reset-form');

function message(html, kind = 'info') {
  status.className = 'notice' + (kind === 'error' ? ' warn' : '');
  status.innerHTML = html;
  status.hidden = false;
}

function bad(text) {
  title.textContent = 'Link problem';
  lead.textContent = text;
  message('Ask for a fresh email from the <a class="link" href="login.html">login page</a>.');
}

if (isPreview) {
  bad('Confirmation links need the connected account server. This is the local preview build.');
} else if (!token || (type !== 'verify' && type !== 'reset')) {
  bad('This confirmation link is incomplete.');
} else if (type === 'verify') {
  title.textContent = 'Confirming your email';
  lead.textContent = 'One moment…';
  try {
    await auth.verifyEmail({ token });
    title.textContent = 'Email confirmed';
    lead.textContent = 'Your address is verified. You can use all account features now.';
    message('<a class="btn primary" href="index.html">Go to dashboard</a>');
  } catch (err) {
    title.textContent = 'Could not confirm';
    lead.textContent = errorText(err);
    message('Open the login page and use <b>Send again</b> to get a fresh link.');
  }
} else {
  title.textContent = 'Choose a new password';
  lead.textContent = 'Pick a password of at least 10 characters.';
  form.hidden = false;
  passwordToggles();
  const pw = $('#new-password');
  pw.addEventListener('input', () => { $('.strength', form)?.setAttribute('data-s', passwordScore(pw.value)); pw.classList.remove('invalid'); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (pw.value.length < 10) { formError(form, 'Use at least 10 characters.'); pw.classList.add('invalid'); return; }
    formError(form, '');
    busy($('[type=submit]', form), async () => {
      try {
        await auth.confirmReset({ token, password: pw.value });
        form.hidden = true;
        title.textContent = 'Password updated';
        lead.textContent = 'You can log in with your new password. Other devices have been signed out.';
        message('<a class="btn primary" href="login.html">Log in</a>');
      } catch (err) {
        formError(form, errorText(err));
      }
    });
  });
}
