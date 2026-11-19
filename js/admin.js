// Stand-alone admin panel. It uses an admin account cookie by default; the ADMIN_TOKEN
// fallback is pasted into this page at runtime and kept only in sessionStorage.
// Nothing in this file contains a token, a password, or a secret.
import { apiCall, isPreview, errorText } from './auth.js';
import { CONFIG } from './config.js';
import { $, $$, icon, esc, busy, formError, toast, confirmDialog, fmtDate, ago } from './ui.js';

const TOKEN_KEY = 'swi.admin.token';
let token = '';
try { token = sessionStorage.getItem(TOKEN_KEY) || ''; } catch { /* storage blocked */ }
let who = null;
let tab = 'overview';
let users = [];
let keys = [];
let sales = [];
let audit = [];
try { token = token.trim(); } catch { /* ignore */ }

async function api(method, path, body) {
  return apiCall(method, path, body, { token: token || undefined });
}
function fd(form) { return Object.fromEntries(new FormData(form)); }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }
function chip(text, kind = '') { return `<span class="chip ${kind}">${esc(text)}</span>`; }

function showGate(message) {
  $('#admin-shell').hidden = true;
  $('#admin-gate').hidden = false;
  const notice = $('#gate-notice');
  notice.hidden = !message;
  notice.textContent = message || '';
}
function showPanel() {
  $('#admin-gate').hidden = true;
  $('#admin-shell').hidden = false;
  $('#admin-who').textContent = `${who.mode === 'token' ? 'Token access' : who.actor} · ${who.role}`;
  loadTab();
}
async function unlock(value, save) {
  token = String(value || '').trim();
  try {
    who = await api('GET', '/admin/api/session');
    if (save) { try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* storage blocked */ } }
    showPanel();
    return true;
  } catch (err) {
    token = '';
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
    throw err;
  }
}

function setTab(next) {
  tab = next;
  $$('#admin-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === next));
  $$('.admin-panel').forEach((p) => { p.hidden = p.id !== 'tab-' + next; });
  loadTab();
}
async function loadTab() {
  const root = $('#tab-' + tab);
  try {
    if (tab === 'overview') renderOverview(await api('GET', '/admin/api/overview'));
    else if (tab === 'users') renderUsers(await api('GET', '/admin/api/users'));
    else if (tab === 'keys') renderKeys(await api('GET', '/admin/api/keys'));
    else if (tab === 'sales') renderSales(await api('GET', '/admin/api/manual-sales'));
    else if (tab === 'announcement') renderAnnouncement(await api('GET', '/admin/api/announcement'));
    else if (tab === 'audit') {
      const q = new URLSearchParams({
        limit: $('#audit-limit')?.value || '100',
        action: $('#audit-action')?.value || '',
        actor: $('#audit-actor')?.value || '',
        q: $('#audit-q')?.value || '',
      });
      renderAudit(await api('GET', '/admin/api/audit?' + q));
    }
  } catch (err) {
    if (err.code === 'unauthorized' || err.code === 'admin_unconfigured') { showGate(errorText(err)); return; }
    root.innerHTML = `<div class="notice warn">${esc(errorText(err))}</div>`;
  }
}

function tile(label, value, note = '') {
  return `<div class="card"><div class="label">${esc(label)}</div><div class="stat-value">${esc(value)}</div>${note ? `<span class="delta">${esc(note)}</span>` : ''}</div>`;
}
function renderOverview(d) {
  $('#tab-overview').innerHTML = `
    <div class="panel-head"><h2>Overview</h2><span class="grow"></span><span class="small">Live counts from the account server</span></div>
    <div class="cards four">
      ${tile('Accounts', d.accounts, `${d.pro} Pro · ${d.free} Free · ${d.admins} admin`)}
      ${tile('Recorded revenue', d.revenue, `${d.manualSales} manual sales`)}
      ${tile('License keys', d.keys, `${d.activeKeys} active · ${d.devices} devices`)}
      ${tile('Sessions', d.sessions, `${d.pendingGrants} pending grants`)}
      ${tile('Access credits', d.accessCredits, `${CONFIG.credits?.accessDays || 30} days each`)}
      ${tile('AI credits', d.aiCredits, 'Unspent balance')}
    </div>
    <div class="card" style="margin-top:18px"><div class="card-head">${icon('chart', 16)}<h3>Recent activity</h3></div>
      ${d.events?.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Result</th></tr></thead><tbody>${d.events.map((e) => `<tr><td class="small">${esc(fmtDate(e.at))}</td><td><span class="ev ${String(e.action).startsWith('admin') ? 'ev-admin' : ''}">${esc(e.action)}</span></td><td class="small">${esc(e.actor)}</td><td class="small">${esc(e.target || '—')}</td><td class="small">${esc(e.result)}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">No activity recorded yet.</div>`}
    </div>`;
}

function renderUsers(list) {
  users = list || [];
  const filtered = () => {
    const q = ($('#user-q')?.value || '').trim().toLowerCase();
    return users.filter((u) => !q || `${u.email} ${u.name} ${u.plan} ${u.role}`.toLowerCase().includes(q));
  };
  const rows = () => filtered().map((u) => `<tr>
    <td><b>${esc(u.name || u.email)}</b><br><span class="small">${esc(u.email)}</span></td>
    <td>${chip(u.plan, u.plan === 'pro' ? 'pro' : 'free')} ${u.role === 'admin' ? chip('admin') : ''} ${u.disabled ? chip('disabled', 'warn') : ''}</td>
    <td class="small">${esc(u.credits?.access || 0)} access<br>${esc(u.credits?.ai || 0)} AI</td>
    <td class="small">${esc(u.devices || 0)} devices<br>${esc(u.sessions || 0)} sessions</td>
    <td class="small">${esc(u.proUntil ? fmtDate(u.proUntil) : '—')}<br>${esc(u.lastSeen ? ago(new Date(u.lastSeen).toISOString()) : 'never')}</td>
    <td class="r"><button class="btn sm" type="button" data-user="${esc(u.email)}">Manage</button></td>
  </tr>`).join('');
  $('#tab-users').innerHTML = `
    <div class="panel-head"><h2>Users</h2><span class="grow"></span>
      <div class="search">${icon('search')}<input class="input" id="user-q" placeholder="Search email, name, plan…"></div>
      <button class="btn sm primary" type="button" id="user-create">${icon('user', 14)} Create account</button>
    </div>
    <div class="card"><div class="table-wrap"><table class="table users-table">
      <thead><tr><th>Account</th><th>Status</th><th>Credits</th><th>Usage</th><th>Pro until / last seen</th><th></th></tr></thead>
      <tbody id="user-rows">${rows()}</tbody>
    </table></div></div>`;
  $('#user-q').addEventListener('input', () => { $('#user-rows').innerHTML = rows(); });
  $$('[data-user]').forEach((b) => b.addEventListener('click', () => openUserModal(b.dataset.user)));
  $('#user-create').addEventListener('click', openCreateModal);
}

function renderKeys(list) {
  keys = list || [];
  $('#tab-keys').innerHTML = `
    <div class="panel-head"><h2>License keys</h2><span class="grow"></span><span class="small">Keys carry their own device, redemption and AI-credit limits.</span></div>
    <div class="card" style="margin-bottom:18px">
      <form id="key-form" class="admin-form-grid">
        <div class="field"><label for="key-email">Account email</label><input class="input" id="key-email" name="email" type="email" placeholder="buyer@example.com" required></div>
        <div class="field"><label for="key-plan">Plan</label><select class="input" id="key-plan" name="plan"><option value="pro">Pro</option><option value="free">Free</option></select></div>
        <div class="field"><label for="key-days">Days</label><input class="input" id="key-days" name="days" type="number" min="1" max="36500" value="30" required></div>
        <div class="field"><label for="key-count">How many</label><input class="input" id="key-count" name="count" type="number" min="1" max="50" value="1"></div>
        <div class="field"><label for="key-devices">Device seats</label><input class="input" id="key-devices" name="maxDevices" type="number" min="1" max="10" value="3"></div>
        <div class="field"><label for="key-redemptions">Redemptions (0 = unlimited)</label><input class="input" id="key-redemptions" name="maxRedemptions" type="number" min="0" max="100" value="1"></div>
        <div class="field"><label for="key-ai">AI credits per key</label><input class="input" id="key-ai" name="aiCredits" type="number" min="0" max="100000" value="0"></div>
        <div class="field"><label for="key-note">Internal note</label><input class="input" id="key-note" name="note" maxlength="200" placeholder="Giveaway, refund replacement…"></div>
        <div class="admin-form-foot"><div class="form-error"><span></span></div><button class="btn primary" type="submit">${icon('key', 15)} Generate keys</button></div>
      </form>
      <div id="key-result"></div>
    </div>
    <div class="card"><div class="table-wrap"><table class="table keys-table">
      <thead><tr><th>Key</th><th>Account</th><th>Plan / expires</th><th>Limits</th><th>Source</th><th></th></tr></thead>
      <tbody>${keys.map((k) => `<tr>
        <td class="small"><button class="key-copy" type="button" data-copy-key="${esc(k.key)}">${esc(k.key)}</button>${k.revoked ? '<br>' + chip('revoked', 'warn') : ''}</td>
        <td class="small">${esc(k.email)}</td>
        <td class="small">${esc(k.plan)}<br>${esc(fmtDate(k.expires))}</td>
        <td class="small">${esc(k.maxDevices)} seats · ${esc(k.maxRedemptions || '∞')} uses<br>${esc(k.aiCredits || 0)} AI credits · ${esc(k.devices)} devices</td>
        <td class="small">${esc(k.source || '—')}<br>${esc(k.issuedBy || '')}</td>
        <td class="r">${k.revoked ? '' : `<button class="btn sm danger" type="button" data-revoke="${esc(k.key)}">Revoke</button>`}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty">No keys yet.</td></tr>'}</tbody>
    </table></div></div>`;
  $('#key-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const b = fd(form);
    busy($('[type=submit]', form), async () => {
      try {
        formError(form, '');
        const out = await api('POST', '/admin/api/key/issue', {
          email: b.email, plan: b.plan, days: num(b.days, 30), count: num(b.count, 1),
          maxDevices: num(b.maxDevices, 3), maxRedemptions: num(b.maxRedemptions, 1),
          aiCredits: num(b.aiCredits), note: b.note,
        });
        $('#key-result').innerHTML = `<div class="result-box"><b>${out.keys.length} key${out.keys.length === 1 ? '' : 's'} generated</b><textarea class="input" rows="4" readonly id="new-keys">${esc(out.keys.map((k) => k.key).join('\n'))}</textarea><button class="btn sm" type="button" id="copy-keys">${icon('copy', 14)} Copy all</button></div>`;
        $('#copy-keys').addEventListener('click', async () => {
          try { await navigator.clipboard.writeText(out.keys.map((k) => k.key).join('\n')); toast('Keys copied'); } catch { toast('Select and copy the keys manually', 'error'); }
        });
        toast('Keys generated');
        loadTab();
      } catch (err) { formError(form, errorText(err)); }
    });
  });
  $$('[data-copy-key]').forEach((b) => b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(b.dataset.copyKey); toast('Key copied'); } catch { toast('Select and copy the key manually', 'error'); }
  }));
  $$('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Revoke this key?', danger: true, confirm: 'Revoke key',
      text: `<b>${esc(b.dataset.revoke)}</b> will stop working immediately, including on computers already activated.`,
      action: () => api('POST', '/admin/api/key/revoke', { key: b.dataset.revoke, note: 'Revoked from admin panel' }),
    });
    if (ok) { toast('Key revoked'); loadTab(); }
  }));
}

function renderSales(list) {
  sales = list || [];
  $('#tab-sales').innerHTML = `
    <div class="panel-head"><h2>Manual sales</h2><span class="grow"></span><span class="small">For payments received by cash, bank, crypto or anywhere else.</span></div>
    <div class="card" style="margin-bottom:18px">
      <form id="sale-form" class="admin-form-grid">
        <div class="field"><label for="sale-email">Customer email</label><input class="input" id="sale-email" name="email" type="email" required></div>
        <div class="field"><label for="sale-name">Name</label><input class="input" id="sale-name" name="name"></div>
        <div class="field"><label for="sale-amount">Amount received (USD)</label><input class="input" id="sale-amount" name="amount" type="number" min="0" step="0.01" value="0"></div>
        <div class="field"><label for="sale-method">Method</label><select class="input" id="sale-method" name="method"><option value="cash">Cash</option><option value="bank transfer">Bank transfer</option><option value="crypto">Crypto</option><option value="other">Other</option></select></div>
        <div class="field"><label for="sale-days">Pro days</label><input class="input" id="sale-days" name="days" type="number" min="0" max="3650" value="30"></div>
        <div class="field"><label for="sale-access">Access credits</label><input class="input" id="sale-access" name="accessCredits" type="number" min="0" max="100000" value="0"></div>
        <div class="field"><label for="sale-ai">AI credits</label><input class="input" id="sale-ai" name="aiCredits" type="number" min="0" max="100000" value="0"></div>
        <div class="field"><label for="sale-seats">Device seats (with Pro days)</label><input class="input" id="sale-seats" name="maxDevices" type="number" min="1" max="10" value="3"></div>
        <div class="field full"><label for="sale-note">Note</label><input class="input" id="sale-note" name="note" maxlength="200" placeholder="Invoice reference, who paid, why the grant was made…"></div>
        <div class="admin-form-foot"><div class="form-error"><span></span></div><button class="btn primary" type="submit">${icon('card', 15)} Record payment</button></div>
      </form>
      <div id="sale-result"></div>
    </div>
    <div class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>Receipt</th><th>Customer</th><th>Amount</th><th>Grant</th><th>Recorded by</th><th></th></tr></thead>
      <tbody>${sales.map((s) => `<tr>
        <td class="small">${esc(s.id)}<br>${esc(fmtDate(s.created))}</td>
        <td class="small"><b>${esc(s.name || s.email)}</b><br>${esc(s.email)}</td>
        <td class="small">$${esc(Number(s.amount || 0).toFixed(2))} · ${esc(s.method)}</td>
        <td class="small">${esc(s.days || 0)} days · ${esc(s.accessCredits || 0)} access · ${esc(s.aiCredits || 0)} AI</td>
        <td class="small">${esc(s.actor)}<br>${s.accountExists ? 'Applied to account' : 'Waiting for account'}</td>
        <td class="small notes-cell">${esc(s.note || '')}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty">No manual sales recorded.</td></tr>'}</tbody>
    </table></div></div>`;
  $('#sale-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const b = fd(form);
    busy($('[type=submit]', form), async () => {
      try {
        formError(form, '');
        const out = await api('POST', '/admin/api/manual-sale', {
          email: b.email, name: b.name, amount: num(b.amount), method: b.method,
          days: num(b.days), accessCredits: num(b.accessCredits), aiCredits: num(b.aiCredits),
          maxDevices: num(b.maxDevices, 3), note: b.note,
        });
        $('#sale-result').innerHTML = `<div class="result-box"><b>Recorded ${esc(out.sale.id)}</b><span class="small">${out.sale.accountExists ? 'Applied to the existing account.' : 'No account yet — the grants will apply when they sign up with this email.'}</span>${out.sale.codes.length ? `<textarea class="input" rows="2" readonly>${esc(out.sale.codes.join('\n'))}</textarea>` : ''}</div>`;
        toast('Manual sale recorded');
        loadTab();
      } catch (err) { formError(form, errorText(err)); }
    });
  });
}

function renderAnnouncement(a) {
  const v = a || { text: '', level: 'info', enabled: false };
  $('#tab-announcement').innerHTML = `
    <div class="panel-head"><h2>Announcement</h2><span class="grow"></span><span class="small">A bar shown at the top of every dashboard page.</span></div>
    <div class="cards two">
      <div class="card">
        <form id="ann-form" class="field">
          <label for="ann-text">Message</label>
          <textarea class="input" id="ann-text" name="text" rows="4" maxlength="300" placeholder="Maintenance tonight at 9 PM…">${esc(v.text || '')}</textarea>
          <label for="ann-level">Style</label>
          <select class="input" id="ann-level" name="level"><option value="info" ${v.level !== 'warning' ? 'selected' : ''}>Information</option><option value="warning" ${v.level === 'warning' ? 'selected' : ''}>Warning</option></select>
          <label class="check"><input type="checkbox" id="ann-enabled" name="enabled" ${v.enabled ? 'checked' : ''}> Show this announcement</label>
          <div class="form-error"><span></span></div>
          <div class="row"><button class="btn primary" type="submit">Save announcement</button><button class="btn danger" type="button" id="ann-clear">Clear</button></div>
        </form>
      </div>
      <div class="card">
        <div class="card-head">${icon('bell', 16)}<h3>Preview</h3></div>
        <div class="ann-preview"><div class="announce ${v.level === 'warning' ? 'warning' : ''}"><div class="wrap">${icon(v.level === 'warning' ? 'info' : 'bell', 16)}<span>${esc(v.enabled && v.text ? v.text : 'No announcement is currently shown.')}</span></div></div></div>
        ${v.updatedAt ? `<p class="small" style="margin-top:18px">Last changed ${esc(fmtDate(v.updatedAt))}${v.updatedBy ? ' by ' + esc(v.updatedBy) : ''}.</p>` : ''}
      </div>
    </div>`;
  $('#ann-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const b = fd(form);
    busy($('[type=submit]', form), async () => {
      try {
        formError(form, '');
        await api('POST', '/admin/api/announcement', { text: b.text || '', level: b.level, enabled: !!b.enabled });
        toast('Announcement saved');
        loadTab();
      } catch (err) { formError(form, errorText(err)); }
    });
  });
  $('#ann-clear').addEventListener('click', () => busy($('#ann-clear'), async () => {
    try {
      await api('POST', '/admin/api/announcement', { text: '', level: 'info', enabled: false });
      toast('Announcement cleared');
      loadTab();
    } catch (err) { toast(errorText(err), 'error'); }
  }));
}

function renderAudit(list) {
  audit = list || [];
  $('#tab-audit').innerHTML = `
    <div class="panel-head"><h2>Activity log</h2><span class="grow"></span><span class="small">Newest first. Passwords, tokens and full keys are never written.</span></div>
    <div class="card" style="margin-bottom:18px"><div class="row">
      <div class="search">${icon('search')}<input class="input" id="audit-q" placeholder="Search action, actor, target, detail…" value="${esc($('#audit-q')?.value || '')}"></div>
      <input class="input" id="audit-action" style="max-width:170px" placeholder="Action contains" value="${esc($('#audit-action')?.value || '')}">
      <input class="input" id="audit-actor" style="max-width:170px" placeholder="Actor contains" value="${esc($('#audit-actor')?.value || '')}">
      <select class="input" id="audit-limit" style="max-width:110px"><option ${$('#audit-limit')?.value === '50' ? 'selected' : ''}>50</option><option ${!$('#audit-limit') || $('#audit-limit').value === '100' ? 'selected' : ''}>100</option><option ${$('#audit-limit')?.value === '500' ? 'selected' : ''}>500</option></select>
      <button class="btn sm" type="button" id="audit-load">Apply filters</button>
    </div></div>
    <div class="card"><div class="table-wrap"><table class="table">
      <thead><tr><th>When</th><th>Action</th><th>Actor</th><th>Target</th><th>Detail</th><th>Result</th></tr></thead>
      <tbody>${audit.map((e) => `<tr>
        <td class="small">${esc(fmtDate(e.at))}<br><span class="small">${esc(ago(e.at))}</span></td>
        <td><span class="ev ${String(e.action).startsWith('admin') ? 'ev-admin' : /fail|bad|invalid/.test(e.result) ? 'ev-bad' : ''}">${esc(e.action)}</span></td>
        <td class="small">${esc(e.actor)}</td><td class="small">${esc(e.target || '—')}</td>
        <td class="log-json" title="${esc(JSON.stringify(e.detail || {}))}">${esc(JSON.stringify(e.detail || {}))}</td>
        <td class="small">${esc(e.result)}</td>
      </tr>`).join('') || '<tr><td colspan="6" class="empty">No matching events.</td></tr>'}</tbody>
    </table></div></div>`;
  $('#audit-load').addEventListener('click', () => busy($('#audit-load'), loadTab));
  $('#audit-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#audit-load').click(); });
}

function modal(html) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal admin-modal" role="dialog" aria-modal="true">${html}</div>`;
  document.body.appendChild(back);
  const close = () => { back.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  $$('[data-close]', back).forEach((b) => b.addEventListener('click', close));
  return { back, close };
}

function openUserModal(email) {
  const u = users.find((x) => x.email === email);
  if (!u) return;
  const m = modal(`
    <div class="row"><h3 style="flex:1">${esc(u.name || u.email)}</h3><button class="icon-btn" type="button" data-close aria-label="Close">${icon('x', 16)}</button></div>
    <p class="small">${esc(u.email)} · joined ${esc(fmtDate(u.created))} · ${chip(u.plan, u.plan === 'pro' ? 'pro' : 'free')} ${u.role === 'admin' ? chip('admin') : ''}</p>
    <hr>
    <h4>Plan &amp; seats</h4>
    <form data-action="plan" class="admin-form-grid">
      <div class="field"><label>Plan</label><select class="input" name="plan"><option value="pro" ${u.plan === 'pro' ? 'selected' : ''}>Pro</option><option value="free" ${u.plan !== 'pro' ? 'selected' : ''}>Free</option></select></div>
      <div class="field"><label>Days (Pro)</label><input class="input" name="days" type="number" min="1" max="36500" value="30"></div>
      <div class="field"><label>Device seats</label><input class="input" name="maxDevices" type="number" min="1" max="10" value="${esc(u.maxDevices || 3)}"></div>
      <div class="field" style="align-self:end"><button class="btn primary" type="submit">Apply plan</button></div>
    </form>
    <hr>
    <h4>Credits</h4>
    <form data-action="credits" class="admin-form-grid">
      <div class="field"><label>Balance</label><select class="input" name="kind"><option value="access">Access (${esc(u.credits?.access || 0)})</option><option value="ai">AI (${esc(u.credits?.ai || 0)})</option></select></div>
      <div class="field"><label>Amount (use − to remove)</label><input class="input" name="value" type="number" min="-100000" max="100000" value="1" required></div>
      <div class="field span2"><label>Note</label><input class="input" name="note" maxlength="200"></div>
      <div class="admin-form-foot"><button class="btn" type="submit">Adjust credits</button></div>
    </form>
    <hr>
    <h4>Role</h4>
    <form data-action="role" class="row">
      <select class="input" name="role" style="max-width:180px"><option value="user" ${u.role !== 'admin' ? 'selected' : ''}>User</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select>
      <button class="btn sm" type="submit">Set role</button>
    </form>
    <hr>
    <h4>Issue a personal key</h4>
    <form data-action="key" class="admin-form-grid">
      <div class="field"><label>Days</label><input class="input" name="days" type="number" min="1" max="36500" value="30"></div>
      <div class="field"><label>Seats</label><input class="input" name="maxDevices" type="number" min="1" max="10" value="${esc(u.maxDevices || 3)}"></div>
      <div class="field"><label>Redemptions</label><input class="input" name="maxRedemptions" type="number" min="0" max="100" value="1"></div>
      <div class="field"><label>AI credits</label><input class="input" name="aiCredits" type="number" min="0" max="100000" value="0"></div>
      <div class="field span2"><label>Note</label><input class="input" name="note" maxlength="200"></div>
      <div class="admin-form-foot"><button class="btn" type="submit">Generate key</button></div>
    </form>
    <div id="user-key-result"></div>
    <hr>
    <h4>Reset password</h4>
    <form data-action="password" class="row">
      <input class="input" name="password" type="password" minlength="10" placeholder="New password (10+ characters)" required>
      <button class="btn sm danger" type="submit">Reset &amp; sign out everywhere</button>
    </form>
    <hr>
    <div class="row"><button class="btn sm ${u.disabled ? '' : 'danger'}" type="button" id="user-disable">${u.disabled ? 'Enable account' : 'Disable account'}</button></div>`);

  $$('form[data-action]', m.back).forEach((form) => form.addEventListener('submit', (e) => {
    e.preventDefault();
    const action = form.dataset.action;
    const b = fd(form);
    const routes = {
      plan: ['/admin/api/user/plan', { email, plan: b.plan, days: num(b.days, 30), maxDevices: num(b.maxDevices, 3) }],
      credits: ['/admin/api/user/credits', { email, kind: b.kind, value: num(b.value), note: b.note }],
      role: ['/admin/api/user/role', { email, role: b.role }],
      password: ['/admin/api/user/password', { email, password: b.password }],
      key: ['/admin/api/user/key', { email, plan: 'pro', days: num(b.days, 30), maxDevices: num(b.maxDevices, 3), maxRedemptions: num(b.maxRedemptions, 1), aiCredits: num(b.aiCredits), note: b.note }],
    };
    const [path, body] = routes[action];
    busy($('[type=submit]', form), async () => {
      try {
        const out = await api('POST', path, body);
        if (action === 'key') {
          $('#user-key-result', m.back).innerHTML = `<div class="result-box"><b>Key generated</b><textarea class="input" rows="2" readonly>${esc(out.key)}</textarea></div>`;
          toast('Key generated');
        } else {
          m.close();
          toast('Account updated');
          loadTab();
        }
      } catch (err) { toast(errorText(err), 'error'); }
    });
  }));
  $('#user-disable', m.back).addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: u.disabled ? 'Enable this account?' : 'Disable this account?',
      danger: !u.disabled,
      confirm: u.disabled ? 'Enable' : 'Disable',
      text: esc(u.email) + (u.disabled ? ' will be able to sign in again.' : ' will be signed out everywhere immediately.'),
      action: () => api('POST', '/admin/api/user/disable', { email, disabled: !u.disabled }),
    });
    if (ok) { m.close(); toast('Account updated'); loadTab(); }
  });
}

function openCreateModal() {
  const m = modal(`
    <div class="row"><h3 style="flex:1">Create account</h3><button class="icon-btn" type="button" data-close aria-label="Close">${icon('x', 16)}</button></div>
    <p class="small">Use this for someone who paid outside the site. Grants can also wait for them if the account does not exist yet.</p>
    <form id="create-form" class="admin-form-grid" style="margin-top:16px">
      <div class="field span2"><label>Name</label><input class="input" name="name"></div>
      <div class="field span2"><label>Email</label><input class="input" name="email" type="email" required></div>
      <div class="field span2"><label>Temporary password (10+ characters)</label><input class="input" name="password" type="password" minlength="10" required></div>
      <div class="field"><label>Plan</label><select class="input" name="plan"><option value="free">Free</option><option value="pro">Pro</option></select></div>
      <div class="field"><label>Pro days</label><input class="input" name="days" type="number" min="1" max="36500" value="30"></div>
      <div class="admin-form-foot"><div class="form-error"><span></span></div><button class="btn primary" type="submit">Create account</button></div>
    </form>`);
  $('#create-form', m.back).addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const b = fd(form);
    busy($('[type=submit]', form), async () => {
      try {
        formError(form, '');
        await api('POST', '/admin/api/user/create', { ...b, days: num(b.days, 30) });
        m.close(); toast('Account created'); loadTab();
      } catch (err) { formError(form, errorText(err)); }
    });
  });
}

$('#gate-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  busy($('[type=submit]', form), async () => {
    try {
      formError(form, '');
      await unlock($('#admin-token').value, true);
    } catch (err) {
      formError(form, errorText(err));
      $('#admin-token').focus();
    }
  });
});
$('#admin-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(b.dataset.tab);
});
$('#admin-refresh').addEventListener('click', (e) => busy(e.currentTarget, loadTab));
$('#admin-forget').addEventListener('click', async () => {
  token = '';
  try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
  who = null;
  try { if (!isPreview) await api('POST', '/v1/auth/logout'); } catch { /* cookie may not exist */ }
  showGate('Token forgotten. Sign in with an admin account, or enter the token again.');
});

if (isPreview) {
  showGate('This is the local preview build. Admin tools need a connected account server; no real accounts or payments exist here.');
  $('#gate-form').hidden = true;
} else {
  try { who = await api('GET', '/admin/api/session'); showPanel(); }
  catch (err) { showGate(token ? errorText(err) : 'Sign in with an admin account, or use the server’s ADMIN_TOKEN.'); }
}
