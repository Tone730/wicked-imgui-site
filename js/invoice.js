// Invoice page. Preview mode reads the demo account from localStorage; a live site
// reads the same invoice list through the account API (js/auth.js → GET /v1/account).
import { auth, isPreview, errorText } from './auth.js';

document.getElementById('year').textContent = new Date().getFullYear();
document.getElementById('print').addEventListener('click', () => print());

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const read = (k, f) => { try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } };
const paper = document.getElementById('paper');
const id = new URLSearchParams(location.search).get('id') || '';

function pickInvoice(invoices) {
  return (invoices || []).find((i) => i.id === id) || (id ? null : invoices?.[0]);
}
function empty(message) {
  paper.innerHTML = `<div class="empty"><p>${esc(message)}</p><p><a class="btn" href="./#billing">Back to billing</a></p></div>`;
}
function render(account, invoice) {
  if (!invoice) return empty('That invoice could not be found.');
  const date = new Date(invoice.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  document.title = `${invoice.id} — Wicked Imgui`;
  paper.innerHTML = `
    <div class="invoice-top">
      <a class="brand" href="./"><img src="assets/logo-mark.svg" alt="">Wicked Imgui</a>
      <div style="text-align:right">
        <div class="label mono">Invoice</div>
        <div class="mono">${esc(invoice.id)}</div>
      </div>
    </div>
    <h1>Thank you.</h1>
    <p>Payment receipt for ${esc(account.name)} &lt;${esc(account.email)}&gt;.</p>
    <div class="cards two" style="margin-top:24px">
      <div><div class="label">Issued</div><div style="margin-top:4px">${esc(date)}</div></div>
      <div><div class="label">Status</div><div style="margin-top:4px;color:var(--accent)">Paid</div></div>
    </div>
    <table class="table">
      <thead><tr><th>Item</th><th class="r">Amount</th></tr></thead>
      <tbody><tr><td><b>${esc(invoice.description)}</b><br><span class="hint">${esc(account.email)}</span></td><td class="r"><b>${esc(invoice.amount)}</b></td></tr></tbody>
    </table>
    <div class="invoice-total"><span>Total paid</span><b>${esc(invoice.amount)}</b></div>
    <p class="hint" style="margin-top:28px">Questions about this invoice? Write to <a href="mailto:wickz77r@gmail.com" data-contact="billing">wickz77r@gmail.com</a>.</p>`;
}

async function boot() {
  if (isPreview) {
    const email = sessionStorage.getItem('swi.site.session') || read('swi.site.session', null);
    const users = read('swi.site.users', {});
    const account = email ? users[email] : null;
    return render(account, pickInvoice(account?.invoices));
  }
  try {
    const acc = await auth.account();
    return render(acc.user, pickInvoice(acc.invoices));
  } catch (err) {
    if (err.code === 'unauthorized') return empty('Sign in to see your invoices.');
    return empty(errorText(err));
  }
}
boot();
