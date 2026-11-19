// Keeps the mailto links on the static pages in sync with CONFIG.contact.
// A correct href is also written into the HTML, so the links still work if JS is blocked.
import { CONFIG } from './config.js';

const contacts = {
  legal: CONFIG.contact.legal,
  support: CONFIG.contact.support,
  billing: CONFIG.contact.billing,
};

document.querySelectorAll('[data-contact]').forEach((el) => {
  const email = contacts[el.dataset.contact];
  if (!email) return;
  el.href = 'mailto:' + email;
  if (!el.textContent.trim()) el.textContent = email;
});

document.querySelectorAll('[data-contact-text]').forEach((el) => {
  const email = contacts[el.dataset.contactText];
  if (email) el.textContent = email;
});
