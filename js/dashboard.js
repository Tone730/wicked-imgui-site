// Account dashboard: overview, license, downloads, devices, billing and settings, routed by the URL hash.
import { auth, session, errorText, isPreview } from './auth.js';
import { CONFIG } from './config.js';
import { $, $$, icon, esc, busy, formError, passwordToggles, passwordScore, toast, confirmDialog, initials, fmtDate, ago } from './ui.js';
import { resend, watchVerified } from './verify.js';
import { showAnnouncement } from './announce.js';
import { hasLocalSession, preview as previewAuth } from './auth-preview.js';
import { validateKey, activateKey } from './license.js';

const VIEWS = { overview: 'Overview', license: 'License', downloads: 'Downloads', devices: 'Devices', billing: 'Billing', credits: 'Credits', settings: 'Settings', changelog: 'Changelog' };
const PRO_PERKS = ['Local full-access build — no sign-in or license key', 'Build & Run (F5) to a real .exe', 'Wicked Local offline AI: edit projects by chat with no key or network', 'C++, C# and Rust, with source export', 'Two-way code sync and custom code', 'All widgets, templates, effects and backgrounds', `Up to ${CONFIG.maxDevices} computers, commercial use`];

let acc = null;
let creditData = null;
let releases = [];
let keyShown = false;
let updateState = { status: 'idle', manifest: null, message: 'Update feed ready — check any time.' };
let buildHistory = [];

const semver = (s) => String(s || '0').replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
function newerVersion(a, b) {
  const x = semver(a), y = semver(b);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
function updateBadge() {
  if (updateState.status === 'available') return `<span class="chip new">UPDATE v${esc(updateState.manifest?.version || '')}</span>`;
  if (updateState.status === 'current') return '<span class="chip ok">UP TO DATE</span>';
  if (updateState.status === 'checking') return '<span class="chip">CHECKING…</span>';
  return '';
}
async function checkForUpdates(manual = false) {
  const current = releases[0]?.version;
  updateState = { status: 'checking', manifest: null, message: 'Checking the update feed…' };
  if (manual) renderDownloads();
  try {
    const res = await fetch(CONFIG.updates.feedUrl, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const m = await res.json();
    const found = m.version || m.tag_name;
    if (!found) throw new Error('feed has no version');
    const available = newerVersion(found, current);
    updateState = {
      status: available ? 'available' : 'current',
      manifest: m,
      message: available ? `v${found} is available — download it below.` : `You’re on the latest version (v${current}).`,
    };
    if (manual) toast(available ? `Update available: v${found}` : 'You’re up to date');
  } catch (err) {
    updateState = { status: 'error', manifest: null, message: `Could not check the update feed (${err.message}).` };
    if (manual) toast('Update check failed: ' + err.message, 'error');
  }
  renderOverview();
  renderDownloads();
  renderChangelog();
}

const isPro = () => acc.user.plan === 'pro';
const sub = () => acc.subscription;
/** Pro from a subscription (also while cancelled but paid until the end of the month / year). */
const isSub = () => isPro() && ['on_trial', 'active', 'past_due', 'cancelled'].includes(sub()?.status);
const isTimed = () => isPro() && !!acc.license.proUntil && !isSub(); // time-limited key
const yearlySub = () => sub()?.interval === 'year';
const canYearly = () => !!(CONFIG.proYearly && acc.yearlyAvailable);
// the billing period picked on the upgrade card (?billing=yearly from the pricing page preselects it)
let billPick = new URLSearchParams(location.search).get('billing') === 'yearly' ? 'year' : 'month';
/** One line about how the subscription goes on. */
const subLine = () => sub().status === 'cancelled' ? `Cancelled — Pro until ${fmtDate(acc.license.proUntil)}`
  : sub().status === 'past_due' ? 'Payment failed — update your card'
  : `Renews on ${fmtDate(sub().renewsAt)}`;
/** "Lifetime" for keys that give updates forever (stored as 2099-12-31). */
const until = (iso) => (iso && new Date(iso).getFullYear() >= 2099 ? 'Lifetime' : iso ? fmtDate(iso) : '—');
const firstName = () => (acc.user.name || '').split(' ')[0] || 'there';
const maskKey = (k) => k.split('-').map((g, i, all) => (i === 0 || i === all.length - 1 ? g : '·····')).join('-');

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast('Copy failed — select the text and press Ctrl+C', 'error'); }
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// ---------------------------------------------------------------- views
const year = () => canYearly() && billPick === 'year';
function upgradeCard(compact) {
  return `
    <div class="card full upgrade">
      <div class="upgrade-text">
        <span class="chip pro">PRO</span>
        <h3>${compact ? 'Build it. Ship it.' : 'Turn your designs into real apps'}</h3>
        <p>${isTimed() ? `Your Pro ends on ${fmtDate(acc.license.proUntil)}. Subscribe to keep it.` : 'You’re on the Free plan: design and test everything, then go Pro to build native executables.'}</p>
        <ul class="perks">${PRO_PERKS.map((p) => `<li>${icon('check')}${esc(p)}</li>`).join('')}</ul>
      </div>
      <div class="upgrade-buy">
        ${canYearly() ? `<div class="bill-toggle" role="radiogroup" aria-label="Billing period">
          <button type="button" role="radio" aria-checked="${billPick === 'month'}" data-bill="month">Monthly</button>
          <button type="button" role="radio" aria-checked="${billPick === 'year'}" data-bill="year">Yearly <span class="save">−${esc(CONFIG.proYearly.save)}</span></button>
        </div>` : ''}
        <div class="price"><b data-up-price>${esc(year() ? CONFIG.proYearly.price : CONFIG.pro.price)}</b><span data-up-period>${esc(year() ? CONFIG.proYearly.period : CONFIG.pro.period)}</span></div>
        <span class="hint" data-up-note>${year() ? esc(`${CONFIG.proYearly.perMonth} a month, billed once a year.`) : ''}</span>
        <button class="btn primary lg block" type="button" data-upgrade>Upgrade to Pro ${icon('arrow-right')}</button>
        <span class="hint">Secure checkout by ${esc(CONFIG.checkout.provider)}. ${esc(CONFIG.checkout.note)}. Cancel any time.</span>
      </div>
    </div>`;
}

function renderOverview() {
  const rel = releases[0];
  const used = acc.devices.length;
  const max = acc.license.maxDevices;
  const steps = [
    [true, 'Get the full-access build', 'Download the portable ZIP from the Downloads page.'],
    [true, 'Run Wicked Imgui Maker', `Extract it and launch <span class="mono">Wicked Imgui Maker.exe</span>. ${rel ? esc(rel.size) : ''}`],
    [true, 'You are already Pro', 'The app starts as <b>Wicked Local Pro</b>. No sign-in or license key is required.'],
    [true, 'Build your first .exe', 'Pick a template, press <span class="kbd">F5</span>, or export C++, C#, or Rust source.'],
  ];
  $('#view-overview').innerHTML = `
    <div><h2>${greeting()}, ${esc(firstName())}</h2><p class="sub" style="margin-top:6px">Here’s your Wicked Imgui account at a glance.</p></div>
    <div class="cards">
      <div class="card">
        <span class="label">Plan</span>
        <div class="big">${isPro() ? 'Wicked Pro' : 'Free'}</div>
        <p style="margin-top:6px">${isSub() ? `<a class="link" href="#billing">${esc(subLine())}</a>` : isTimed() ? `Pro until ${fmtDate(acc.license.proUntil)}` : isPro() ? `Updates: ${until(acc.license.updatesUntil)}` : '<a class="link" href="#billing">See what Pro adds →</a>'}</p>
      </div>
      <div class="card">
        <span class="label">Devices</span>
        <div class="big">${used} <span class="dim" style="font-size:16px;font-weight:500">/ ${max}</span></div>
        <div class="meter"><i style="width:${Math.min(100, (used / max) * 100)}%"></i></div>
        <p style="margin-top:10px"><a class="link" href="#devices">Manage computers →</a></p>
      </div>
      <div class="card">
        <span class="label">Latest version</span>
        <div class="big">${rel ? 'v' + esc(rel.version) : '—'} ${updateBadge()}</div>
        <p style="margin-top:6px">${rel ? `Released ${fmtDate(rel.date)} · <a class="link" href="#downloads">Download</a> · <a class="link" href="#changelog">Changes</a>` : 'No release yet'}</p>
      </div>
      <div class="card full">
        <div class="card-head"><h3>Local full-access build</h3><span class="chip pro" style="margin-left:8px">READY</span></div>
        <p>This portable build is already unlocked: Wicked Local Pro, all feature gates open, built-in offline AI, and runtime sources for source export. It never contacts a license server.</p>
        <p class="dim small" style="margin-top:10px">${rel ? `Current package: <span class="mono">${esc(rel.file)}</span> · ${esc(rel.kind || 'Portable ZIP')}` : 'Attach a build on the Downloads page to see package details.'}</p>
      </div>
      ${isPro() ? '' : upgradeCard(true)}
      <div class="card wide">
        <div class="card-head"><h3>Getting started</h3><span class="grow"></span><span class="dim mono" style="font-size:12px">${steps.filter((s) => s[0]).length}/${steps.length}</span></div>
        <ol class="steps-list">${steps.map(([done, t, d]) => `<li class="${done ? 'done' : ''}"><span class="tick">${done ? icon('check') : ''}</span><div><b>${t}</b><span>${d}</span></div></li>`).join('')}</ol>
      </div>
      <div class="card">
        <div class="card-head"><h3>License key</h3></div>
        <div class="license-key" style="font-size:13px"><span class="grow">${esc(maskKey(acc.license.key))}</span></div>
        <p style="margin-top:12px">You can also activate Wicked Imgui offline with this key. <a class="link" href="#license">Details →</a></p>
      </div>
    </div>`;
}

function renderLicense() {
  const l = acc.license;
  const rows = [
    ['Plan', isPro() ? '<span class="chip pro">PRO</span>' : '<span class="chip free">FREE</span>'],
    ['Status', '<span class="status"><i></i>Active</span>'],
    ['Licensed to', `<b>${esc(acc.user.name)}</b> · ${esc(acc.user.email)}`],
    ['Activations', `${acc.devices.length} of ${l.maxDevices} computers`],
    ...(isTimed() ? [['Pro until', fmtDate(l.proUntil) + ' — then back to Free']] : []),
    ...(isSub() ? [['Subscription', `Monthly · ${esc(subLine())}`]] : []),
    ['Updates', isSub() ? 'Included while you’re subscribed' : isPro() ? (until(l.updatesUntil) === 'Lifetime' ? 'Lifetime' : `Included until ${until(l.updatesUntil)}`) : 'Free plan updates'],
    ['Issued', fmtDate(acc.user.created)],
  ];
  $('#view-license').innerHTML = `
    <div><h2>License</h2><p class="sub" style="margin-top:6px">Your key is tied to your account. Keep it private — anyone with it can use one of your activations.</p></div>
    <div class="card">
      <div class="card-head"><h3>License key</h3><span class="grow"></span>
        <button class="btn sm ghost" type="button" data-reveal>${icon(keyShown ? 'eye-off' : 'eye', 15)}${keyShown ? 'Hide' : 'Reveal'}</button>
        <button class="btn sm" type="button" data-copy-key>${icon('copy', 15)}Copy</button>
      </div>
      <div class="license-key"><span class="grow" id="key-text">${esc(keyShown ? l.key : maskKey(l.key))}</span></div>
      <table class="table kv" style="margin-top:18px"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="card">
      <div class="card-head"><h3>Activate Wicked Imgui</h3></div>
      <ol class="how">
        <li>The downloadable full-access build needs no activation: it starts signed in as <b>Wicked Local Pro</b>.</li>
        <li>Extract the portable ZIP and run <span class="mono">Wicked Imgui Maker.exe</span>; every feature is already unlocked locally.</li>
        <li>The hosted account and key flows below remain available for the website and future online builds. This local package never needs them.</li>
      </ol>
    </div>`;
  $('[data-reveal]').onclick = () => { keyShown = !keyShown; renderLicense(); };
  $('[data-copy-key]').onclick = () => copy(l.key, 'License key');
}

let localBuildUrl = null;

function humanSize(bytes) {
  if (!bytes) return '—';
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return Math.max(1, Math.round(bytes / 1024)) + ' KB';
}

async function attachFile(file) {
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (localBuildUrl) URL.revokeObjectURL(localBuildUrl);
    localBuildUrl = URL.createObjectURL(file);
    releases[0] = {
      ...releases[0],
      attached: true,
      url: localBuildUrl,
      file: file.name,
      size: humanSize(file.size),
      sha256: sha,
      date: new Date().toISOString().slice(0, 10),
    };
    renderDownloads();
    toast('Build attached for this browser session');
  } catch (err) {
    toast('Could not attach that file: ' + (err?.message || 'unknown error'), 'error');
  }
}

function renderDownloads() {
  const [latest, ...older] = releases;
  const ready = !!(latest && latest.attached);
  const name = esc(latest?.file || 'WickedImgui-Portable.zip');
  const hashText = esc(latest?.sha256 || 'Not available until a build is attached');

  $('#view-downloads').innerHTML = `
    <div><h2>Downloads</h2><p class="sub" style="margin-top:6px">Wicked Imgui Maker for Windows 10 and 11 (64-bit). The local full-access build is portable: extract it and run the executable.</p></div>

    <div class="card update-card">
      <div class="card-head"><h3>Auto updates</h3><span class="chip">${esc((latest?.channel || CONFIG.updates.channel || 'stable').toUpperCase())}</span></div>
      <p>Wicked Imgui Maker checks a self-hosted feed at <span class="mono">${esc(CONFIG.updates.baseUrl)}</span> on launch. Update files are verified with their published SHA-512 before install.</p>
      <div class="update-status ${esc(updateState.status)}">${icon(updateState.status === 'error' ? 'info' : 'check', 16)}<span>${esc(updateState.message)}</span></div>
      <div class="update-actions">
        <button class="btn sm" type="button" data-check-updates>Check for updates</button>
        <a class="btn sm" href="#changelog">View changelog</a>
        ${updateState.status === 'available' && updateState.manifest?.url ? `<a class="btn sm primary" href="${esc(updateState.manifest.url)}" download>Download v${esc(updateState.manifest.version)}</a>` : ''}
      </div>
      <p class="dim small" style="margin-top:10px">Feed files: <span class="mono">latest.yml</span> for the app and <span class="mono">latest.json</span> for this page — both written by the build script.</p>
    </div>

    ${ready ? '' : `
    <div class="notice verify-bar" style="display:flex">
      ${icon('info')}
      <span class="grow"><b>No build attached yet.</b> Drop the portable ZIP into the <span class="mono">downloads</span> folder and run the attach script, or pick a file here for this browser session.</span>
    </div>`}

    ${latest ? `
    <div class="card release">
      <div class="release-main">
        <img src="assets/logo-mark.svg" alt="" width="48" height="48">
        <div class="grow">
          <h3>Wicked Imgui ${esc(latest.version)} <span class="chip" style="margin-left:6px">${ready ? 'LATEST' : 'PENDING'}</span> ${updateBadge()}</h3>
          <p>Windows x64 · ${esc(latest.kind || 'Portable build')} · ${esc(latest.size)} · ${fmtDate(latest.date)}</p>
        </div>
        ${ready
          ? `<a class="btn primary lg" href="${esc(latest.url)}" download="${name}">${icon('download')}Download for Windows</a>`
          : `<button class="btn lg" type="button" disabled>${icon('download')}Awaiting build</button>`}
      </div>
      <p class="notes">${esc(latest.notes)}</p>
      <div class="hash">
        <span class="label">SHA-256</span>
        <code class="mono" title="${hashText}">${hashText}</code>
        ${ready ? `<button class="icon-btn" type="button" data-copy-hash aria-label="Copy checksum">${icon('copy', 15)}</button>` : ''}
      </div>
    </div>` : '<div class="card empty">No release configured.</div>'}

    ${latest?.changes?.length ? `
    <div class="card">
      <div class="card-head"><h3>What&rsquo;s new in v${esc(latest.version)}</h3><span class="grow"></span><span class="dim" style="font-size:12.5px">Local full-access build</span></div>
      <ul class="release-changes">
        ${latest.changes.map(([tag, text]) => `<li><b>${esc(tag)}</b><span>${esc(text)}</span></li>`).join('')}
      </ul>
    </div>` : ''}

    <div class="card attach-card">
      <div class="card-head"><h3>Attach a build</h3><span class="grow"></span><span class="dim" style="font-size:12.5px">For the person building this site</span></div>
      <div class="attach-grid">
        <div>
          <h4>Persistent (recommended)</h4>
          <ol class="how">
            <li>Copy your portable ZIP into <span class="mono">downloads\\</span>.</li>
            <li>Run <span class="mono">powershell -File tools\\attach-release.ps1 -Zip "downloads\\your-build.zip"</span>.</li>
            <li>Reload this page — the download card, checksum and update manifests update automatically.</li>
          </ol>
        </div>
        <div>
          <h4>Quick (this browser session)</h4>
          <div class="dropzone" data-dropzone tabindex="0" role="button" aria-label="Choose or drop a portable ZIP">
            ${icon('download', 22)}
            <div><b>Drop your portable ZIP here</b><br><span class="dim">or click to choose a file</span></div>
            <input type="file" accept=".exe,.msi,.zip" data-file hidden>
          </div>
          <p class="dim small" style="margin:10px 0 0">Session-only: the file stays on your machine and the link expires when you close the tab. Use the script above for a permanent download.</p>
        </div>
      </div>
    </div>

    ${(CONFIG.hosting || []).length ? `
    <div class="card">
      <div class="card-head"><h3>Free places to host this portable build</h3><span class="grow"></span><span class="dim" style="font-size:12.5px">No monthly fee</span></div>
      <p>Upload the portable ZIP to one of these, then set <span class="mono">file</span> in <span class="mono">js/release.js</span> to the public URL. The checksum above stays the source of truth.</p>
      <div class="support-links">${CONFIG.hosting.map((h) => `
        <a class="support-link" href="${esc(h.url)}" target="_blank" rel="noopener">
          <b>${esc(h.name)}</b><span>${esc(h.note)}</span>${icon('external', 14)}
        </a>`).join('')}</div>
    </div>` : ''}

    <div class="cards two">
      <div class="card">
        <div class="card-head"><h3>Requirements</h3></div>
        <ul class="spec">
          <li><span>System</span><b>Windows 10 or 11, 64-bit</b></li>
          <li><span>Graphics</span><b>DirectX 11</b></li>
          <li><span>Disk</span><b>About 450 MB</b></li>
          <li><span>Runtime</span><b>Self-contained portable</b></li>
          <li><span>Install</span><b>Extract ZIP, no admin rights needed</b></li>
          <li><span>Updates</span><b class="mono">${esc(CONFIG.updates.baseUrl)}</b></li>
        </ul>
      </div>
      <div class="card">
        <div class="card-head"><h3>Verify the download</h3></div>
        <p>Check the downloaded ZIP against the SHA-256 shown above — in your browser or with PowerShell:</p>
        <div class="license-key" style="margin-top:12px;font-size:12.5px;letter-spacing:0"><span class="grow">Get-FileHash .\\${name}</span><button class="icon-btn" type="button" data-copy-verify aria-label="Copy verification command">${icon('copy', 15)}</button></div>
        <label class="btn sm" style="margin-top:12px;display:inline-flex">${icon('shield', 15)}Check a file
          <input type="file" accept=".zip" data-verify-file hidden>
        </label>
        <div class="dim small" data-verify-result style="margin-top:8px">No file selected yet.</div>
      </div>
    </div>
    ${older.length ? `
    <div class="card">
      <div class="card-head"><h3>Previous versions</h3></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Version</th><th>Released</th><th class="col-sm-hide">Changes</th><th class="r"></th></tr></thead>
        <tbody>${older.map((r) => `<tr><td><b>${esc(r.version)}</b></td><td>${fmtDate(r.date)}</td><td class="col-sm-hide">${esc(r.notes)}</td><td class="r"><a class="btn sm" href="${esc(r.url)}" download>${icon('download', 14)}${esc(r.size)}</a></td></tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <div class="card" id="build-history-card">
      <div class="card-head"><h3>Recent builds</h3><span class="grow"></span><span class="dim" style="font-size:12.5px">Written by publish.ps1</span></div>
      ${buildHistory.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>When</th><th>Version</th><th>Size</th><th>SHA-256</th></tr></thead>
        <tbody>${buildHistory.slice(-8).reverse().map((b) => `<tr><td>${esc(fmtDate(b.timestamp))}</td><td><b>${esc(b.version)}</b></td><td>${esc(b.bytes ? humanSize(b.bytes) : '—')}</td><td class="mono" style="font-size:11px">${esc((b.sha256 || '').slice(0, 16))}&hellip;</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="dim">No publish history recorded yet. Run <span class="mono">tools\\publish.ps1</span> to add the first entry.</p>'}
    </div>`;

  $('[data-copy-hash]')?.addEventListener('click', () => copy(latest.sha256, 'Checksum'));
  $('[data-copy-verify]')?.addEventListener('click', () => copy(`Get-FileHash .\\${latest?.file || 'WickedImgui-Portable.zip'}`, 'Verification command'));
  $('[data-check-updates]')?.addEventListener('click', (e) => busy(e.currentTarget, () => checkForUpdates(true)));

  $('[data-verify-file]')?.addEventListener('change', async (e) => {
    const file = e.currentTarget.files?.[0];
    const out = $('[data-verify-result]');
    if (!file || !out) return;
    out.textContent = `Hashing ${file.name} (${humanSize(file.size)})…`;
    try {
      const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
      const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const expected = (latest?.sha256 || '').toLowerCase();
      const match = !!expected && sha === expected;
      out.innerHTML = match
        ? `<b style="color:var(--ok,#22c55e)">✓ Checksum matches the published build.</b>`
        : `<b style="color:var(--danger,#ef4444)">✗ Checksum does not match.</b> <span class="mono">${esc(sha)}</span>`;
    } catch (err) {
      out.textContent = 'Could not read that file: ' + (err?.message || 'unknown error');
    }
  });

  const zone = $('[data-dropzone]', $('#view-downloads'));
  const input = $('[data-file]', $('#view-downloads'));
  if (zone && input) {
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('drag'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('drag'); attachFile(e.dataTransfer.files[0]); });
    input.addEventListener('change', () => attachFile(input.files[0]));
  }
}

async function loadBuildHistory() {
  try {
    const res = await fetch('downloads/build-history.jsonl', { cache: 'no-store' });
    if (!res.ok) return;
    const text = await res.text();
    buildHistory = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
    if (location.hash.slice(1) === 'downloads') renderDownloads();
  } catch { /* history is optional */ }
}

function renderChangelog() {
  const all = releases.filter((r) => r && r.attached !== false);
  $('#view-changelog').innerHTML = `
    <div><h2>Changelog</h2><p class="sub" style="margin-top:6px">Every released build of Wicked Imgui Maker, newest first. Checksums are published so you can verify any download.</p></div>
    ${all.length ? all.map((r, i) => `
      <div class="card changelog-item">
        <div class="card-head">
          <h3>v${esc(r.version)} ${i === 0 ? '<span class="chip pro">LATEST</span>' : ''}</h3>
          <span class="grow"></span><span class="dim mono" style="font-size:12px">${fmtDate(r.date)}</span>
          <span class="chip" style="margin-left:8px">${esc(r.channel || CONFIG.updates.channel || 'stable')}</span>
        </div>
        <p class="notes">${esc(r.notes)}</p>
        ${r.changes?.length ? `<ul class="release-changes">${r.changes.map(([tag, text]) => `<li><b>${esc(tag)}</b><span>${esc(text)}</span></li>`).join('')}</ul>` : ''}
        <div class="hash"><span class="label">SHA-256</span><code class="mono">${esc(r.sha256 || '—')}</code></div>
        ${r.url ? `<div style="margin-top:12px"><a class="btn sm" href="${esc(r.url)}" download>Download · ${esc(r.size || '')}</a></div>` : ''}
      </div>`).join('') : '<div class="card empty">No release notes yet.</div>'}`;
}

function renderDevices() {
  const used = acc.devices.length;
  const max = acc.license.maxDevices;
  $('#view-devices').innerHTML = `
    <div><h2>Devices</h2><p class="sub" style="margin-top:6px">Computers signed in to Wicked Imgui with your account. Sign one out to free a slot — it will ask for a sign-in next time it starts.</p></div>
    <div class="card">
      <div class="card-head"><h3>${used} of ${max} computers</h3><span class="grow"></span><span class="dim" style="font-size:13px">${max - used} free</span></div>
      <div class="meter" style="margin:0 0 18px"><i style="width:${Math.min(100, (used / max) * 100)}%"></i></div>
      ${used ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Computer</th><th>Last active</th><th class="col-sm-hide">Status</th><th class="r"></th></tr></thead>
        <tbody>${acc.devices.map((d) => `
          <tr>
            <td><div class="device">${icon('monitor')}<div><b>${esc(d.name)}</b><span>${esc(d.os)}</span></div></div></td>
            <td>${ago(d.lastSeen)}</td>
            <td class="col-sm-hide">${d.current ? '<span class="status"><i></i>This computer</span>' : '<span class="status off"><i></i>Signed in</span>'}</td>
            <td class="r"><button class="btn sm" type="button" data-revoke="${esc(d.id)}">Sign out</button></td>
          </tr>`).join('')}</tbody>
      </table></div>` : `<div class="empty">${icon('devices')}<p>No computers yet. Install Wicked Imgui and sign in — it will show up here.</p></div>`}
    </div>`;
  $$('[data-revoke]').forEach((b) => b.addEventListener('click', async () => {
    const d = acc.devices.find((x) => x.id === b.dataset.revoke);
    const ok = await confirmDialog({
      title: `Sign out ${d.name}?`,
      text: 'Wicked Imgui on that computer will ask for a sign-in the next time it checks its license. Your projects on it are not touched.',
      confirm: 'Sign out computer',
      danger: true,
      action: async () => {
        try { await auth.revokeDevice(d.id); acc = await auth.account(); } catch (e) { e.userText = errorText(e); throw e; }
      },
    });
    if (!ok) return;
    toast(`${d.name} was signed out`);
    renderAll();
  }));
}

/** Optional no-monthly-fee providers from CONFIG.alternatives (only those with a URL). */
function supportCard() {
  const links = (CONFIG.alternatives || []).filter((p) => p.url && /^https:\/\//.test(p.url));
  if (!links.length) return '';
  return `
    <div class="card">
      <div class="card-head"><h3>Other ways to pay &amp; support</h3></div>
      <p>Prefer a different provider? All of these work without a monthly commitment.</p>
      <div class="support-links">${links.map((p) => `
        <a class="support-link" href="${esc(p.url)}" target="_blank" rel="noopener">
          <b>${esc(p.name)}</b><span>${esc(p.note)}</span>${icon('external', 14)}
        </a>`).join('')}</div>
    </div>`;
}

let lastMintedKey = '';

async function refreshCredits() {
  try {
    creditData = await auth.credits();
    if (acc && creditData?.credits) acc.credits = creditData.credits;
  } catch (err) {
    toast(errorText(err), 'error');
    return;
  }
  renderCredits();
}

function renderCredits() {
  const data = creditData || { credits: acc.credits || { access: 0, ai: 0, accessDays: CONFIG.credits?.accessDays || 30 }, ledger: [], pending: [] };
  const c = data.credits || {};
  const days = Number(c.accessDays || CONFIG.credits?.accessDays || 30);
  const ledger = data.ledger || [];
  const pending = data.pending || [];
  const actionLabel = (e) => ({
    'credit.redeem': 'Redeemed Pro time', 'credit.key': 'Minted a Pro key', 'credit.grant': 'Credits added',
    'credit.adjust': 'Credits adjusted', 'ai.spend': 'AI usage', 'grant.claim': 'Claimed a grant', 'key.credits': 'Key credits',
  }[e.action] || e.action);
  $('#view-credits').innerHTML = `
    <div><h2>Credits</h2><p class="sub" style="margin-top:6px">Two separate balances: access credits buy Pro time or a limited Pro key. AI credits are consumed by Wicked-hosted AI actions.</p></div>
    ${isPreview ? `<div class="notice warn" style="margin-bottom:18px;max-width:960px">${icon('info', 15)}<span>Preview mode — these balances are empty demo data. Nothing here spends money or contacts a server.</span></div>` : ''}
    <div class="cards two" style="margin-bottom:18px">
      <div class="card">
        <div class="card-head">${icon('star', 16)}<h3>Access credits</h3></div>
        <div class="label">Available</div><div class="big">${Number(c.access || 0)}</div>
        <p class="small" style="margin-top:10px">One credit = ${days} days of Pro. Redeem for your own account, or mint a one-person Pro key with your seat limit.</p>
        <div class="row" style="margin-top:14px">
          <div class="field" style="width:110px"><label for="credit-redeem">Redeem</label><input class="input" id="credit-redeem" type="number" min="1" max="${Number(c.access || 0)}" value="1" ${!c.access || isPreview ? 'disabled' : ''}></div>
          <button class="btn sm primary" type="button" data-credit-redeem-btn ${!c.access || isPreview ? 'disabled' : ''}>Add Pro time</button>
          <div class="field" style="width:110px"><label for="credit-key">Mint key</label><input class="input" id="credit-key" type="number" min="1" max="${Number(c.access || 0)}" value="1" ${!c.access || isPreview ? 'disabled' : ''}></div>
          <div class="field" style="width:110px"><label for="credit-key-devices">Seats</label><select class="input" id="credit-key-devices" ${!c.access || isPreview ? 'disabled' : ''}>${Array.from({ length: Math.min(CONFIG.credits?.maxKeyDevices || 5, Number(acc.entitlement?.maxDevices) || CONFIG.maxDevices) }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}</select></div>
          <button class="btn sm" type="button" data-credit-key-btn ${!c.access || isPreview ? 'disabled' : ''}>Create key</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head">${icon('brain', 16)}<h3>AI credits</h3></div>
        <div class="label">Available</div><div class="big">${Number(c.ai || 0)}</div>
        <p class="small" style="margin-top:10px">Used by Wicked-hosted AI actions and charged only when an action completes. Repeating the same request with the same idempotency key will not charge twice.</p>
        <p class="small">The local full-access build stays offline and uses your own provider keys, so it does not spend this balance.</p>
        <a class="btn sm" href="faq.html">How AI credits work</a>
      </div>
    </div>
    ${lastMintedKey ? `<div class="gen-done" style="margin-bottom:18px"><b>Your limited Pro key</b><span class="small">Give this to someone once. It is valid for the days shown in your receipt and uses the seat limit you chose.</span><textarea class="input" rows="3" readonly id="minted-key">${esc(lastMintedKey)}</textarea><div class="row"><button class="btn sm" type="button" data-copy-minted>${icon('copy', 14)} Copy key</button></div></div>` : ''}
    ${pending.length ? `<div class="card" style="margin-bottom:18px"><div class="card-head">${icon('key', 16)}<h3>Ready to claim</h3></div><p class="small">These grants were issued to your email. Claim them to add the balance now.</p><div class="table-wrap"><table class="table"><thead><tr><th>Code</th><th>Grant</th><th>Amount</th><th></th></tr></thead><tbody>${pending.map((g) => `<tr><td class="small">${esc(g.code)}</td><td>${esc(g.kind)}</td><td>${esc(g.days ? `${g.days} days` : g.value)}</td><td class="r"><button class="btn sm" type="button" data-claim="${esc(g.code)}" ${isPreview ? 'disabled' : ''}>Claim</button></td></tr>`).join('')}</tbody></table></div><div class="row" style="margin-top:12px"><input class="input" id="credit-code" placeholder="Or paste a credit code" style="max-width:280px"><button class="btn sm" type="button" data-claim-btn ${isPreview ? 'disabled' : ''}>Claim code</button></div></div>` : ''}
    <div class="card">
      <div class="card-head">${icon('chart', 16)}<h3>Credit activity</h3></div>
      ${ledger.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>When</th><th>Activity</th><th>Change</th><th>Reference</th></tr></thead><tbody>${ledger.map((e) => `<tr><td class="small">${esc(fmtDate(e.at))}</td><td>${esc(actionLabel(e))}</td><td class="small">${esc(e.kind || '')} ${e.value > 0 ? '+' : ''}${esc(e.value ?? '')}${e.days ? ` · ${esc(e.days)} days` : ''}</td><td class="small notes-cell">${esc(e.ref || e.reason || '')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="empty">No credit activity yet.</div>`}
    </div>`;

  const redeemBtn = $('[data-credit-redeem-btn]');
  if (redeemBtn) redeemBtn.addEventListener('click', () => busy(redeemBtn, async () => {
    try {
      const res = await auth.redeemCredits(Number($('#credit-redeem').value));
      lastMintedKey = '';
      await refreshCredits();
      renderLicense(); renderBilling();
      toast(`${res.days} days of Wicked Pro added`);
    } catch (err) { toast(errorText(err), 'error'); }
  }));
  const keyBtn = $('[data-credit-key-btn]');
  if (keyBtn) keyBtn.addEventListener('click', () => busy(keyBtn, async () => {
    try {
      const res = await auth.mintCreditKey({ credits: Number($('#credit-key').value), maxDevices: Number($('#credit-key-devices').value) });
      lastMintedKey = res.key;
      await refreshCredits();
      toast('Limited Pro key created');
    } catch (err) { toast(errorText(err), 'error'); }
  }));
  const claimBtn = $('[data-claim-btn]');
  if (claimBtn) claimBtn.addEventListener('click', () => busy(claimBtn, async () => {
    try {
      await auth.claimCredit($('#credit-code').value);
      await refreshCredits();
      renderLicense(); renderBilling();
      toast('Credits claimed');
    } catch (err) { toast(errorText(err), 'error'); }
  }));
  $$('[data-claim]').forEach((b) => b.addEventListener('click', () => busy(b, async () => {
    try {
      await auth.claimCredit(b.dataset.claim);
      await refreshCredits();
      renderLicense(); renderBilling();
      toast('Credits claimed');
    } catch (err) { toast(errorText(err), 'error'); }
  })));
  const copyBtn = $('[data-copy-minted]');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(lastMintedKey); toast('Key copied'); } catch { toast('Select and copy the key manually', 'error'); }
  });
}

function renderBilling() {
  const inv = acc.invoices || [];
  $('#view-billing').innerHTML = `
    <div><h2>Billing</h2><p class="sub" style="margin-top:6px">${isSub() ? (yearlySub() ? 'Wicked Pro is billed yearly. Cancel any time — Pro stays until the end of the year you paid for.' : 'Wicked Pro is billed monthly. Cancel any time — Pro stays until the end of the month you paid for.') : `Wicked Free costs nothing. Pro is ${esc(CONFIG.pro.price)} a month${canYearly() ? ` or ${esc(CONFIG.proYearly.price)} a year (${esc(CONFIG.proYearly.save)} off)` : ''}, cancel any time.`}</p></div>
    ${isSub() && sub().status === 'past_due' ? `<div class="notice verify-bar" style="display:flex">${icon('info')}<span class="grow">Your last payment didn’t go through. Update your card to keep Wicked Pro.</span><button class="btn sm" type="button" data-portal>Update card</button></div>` : ''}
    ${isSub() ? `
    <div class="card">
      <div class="card-head"><h3>Your subscription</h3><span class="grow"></span><button class="btn sm" type="button" data-portal>${icon('external', 15)}Manage subscription</button></div>
      <div class="plan-now">
        <div><span class="label">Plan</span><b>Wicked Pro · ${yearlySub() ? 'yearly' : 'monthly'}</b></div>
        <div><span class="label">${sub().status === 'cancelled' ? 'Pro until' : 'Next payment'}</span><b>${sub().status === 'cancelled' ? fmtDate(acc.license.proUntil) : sub().status === 'past_due' ? 'Retrying' : fmtDate(sub().renewsAt)}</b></div>
        <div><span class="label">Price</span><b>${esc(inv[0]?.amount || (yearlySub() ? CONFIG.proYearly?.price : CONFIG.pro.price) || CONFIG.pro.price)} / ${yearlySub() ? 'year' : 'month'}</b></div>
        <div><span class="label">Computers</span><b>${acc.license.maxDevices}</b></div>
      </div>
      <p class="dim small" style="margin-top:14px">Change your card, cancel or resume on ${esc(CONFIG.checkout.provider)}’s secure page. ${sub().status === 'cancelled' ? 'Resume there and nothing changes for you.' : `If you cancel, Pro keeps working until the end of the paid ${yearlySub() ? 'year' : 'month'}.`}</p>
    </div>` : isPro() ? `
    <div class="card">
      <div class="card-head"><h3>Current plan</h3></div>
      <div class="plan-now">
        <div><span class="label">Plan</span><b>${isTimed() ? 'Wicked Pro (time-limited)' : 'Wicked Pro'}</b></div>
        <div><span class="label">${isTimed() ? 'Pro until' : 'From'}</span><b>${isTimed() ? fmtDate(acc.license.proUntil) : 'License key'}</b></div>
        <div><span class="label">Updates until</span><b>${until(acc.license.updatesUntil)}</b></div>
        <div><span class="label">Computers</span><b>${acc.license.maxDevices}</b></div>
      </div>
    </div>` : ''}
    ${!isPro() || isTimed() ? upgradeCard(false) : ''}
    <div class="card">
      <div class="card-head"><h3>Redeem a license key</h3></div>
      <p>Got a key from a giveaway, a reseller or support? It looks like <span class="mono">SWI-PRO-XXXXX-…</span></p>
      <form class="redeem" id="redeem-form" novalidate>
        <input class="input mono" id="redeem-key" placeholder="SWI-PRO-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" spellcheck="false" maxlength="60">
        <button class="btn primary" type="submit">Redeem</button>
      </form>
      <div class="form-error" role="alert" style="margin-top:12px">${icon('info', 15)}<span></span></div>
    </div>
    <div class="card">
      <div class="card-head"><h3>Invoices</h3></div>
      ${inv.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Invoice</th><th>Date</th><th class="col-sm-hide">Description</th><th>Amount</th><th class="r"></th></tr></thead>
        <tbody>${inv.map((i) => `<tr><td class="mono">${esc(i.id)}</td><td>${fmtDate(i.date)}</td><td class="col-sm-hide">${esc(i.description)}</td><td><b>${esc(i.amount)}</b></td><td class="r"><a class="btn sm ghost" href="${esc(i.url)}">PDF</a></td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">No invoices yet.</div>'}
    </div>
    ${supportCard()}`;
  const form = $('#redeem-form');
  const box = form.parentElement;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = $('#redeem-key').value.trim();
    formError(box, '');
    if (!key) return formError(box, 'Paste your license key.');
    busy($('[type=submit]', form), async () => {
      try {
        // With the free license server connected, verify the key server-side before granting access.
        if (CONFIG.license?.mode === 'remote') {
          const check = await validateKey(key);
          if (!check.valid) throw new Error(check.error || 'That license key isn’t valid.');
          await activateKey(key);
        }
        acc = await auth.redeem({ key });
        renderAll();
        toast(isTimed() ? `Wicked Pro is active until ${fmtDate(acc.license.proUntil)}` : 'Wicked Pro is active — thank you!');
        location.hash = 'overview';
      } catch (err) {
        formError(box, err.code === 'already_pro' ? 'You already have Wicked Pro — this key only gives time-limited Pro.' : errorText(err));
      }
    });
  });
}

function renderSettings() {
  $('#view-settings').innerHTML = `
    <div><h2>Settings</h2><p class="sub" style="margin-top:6px">Account details and security.</p></div>
    <div class="settings-grid">
      <div class="card">
        <div class="card-head"><h3>Profile</h3></div>
        <form id="profile-form" novalidate>
          <div class="form-error" role="alert">${icon('info', 15)}<span></span></div>
          <div class="field"><label for="set-name">Name</label><input class="input" id="set-name" name="name" maxlength="80" autocomplete="name" value="${esc(acc.user.name)}"></div>
          <div class="field"><label for="set-email">Email</label><input class="input" id="set-email" value="${esc(acc.user.email)}" disabled><span class="hint">To change your email, contact support from this address.</span></div>
          <div class="row"><button class="btn primary" type="submit">Save</button></div>
        </form>
      </div>
      <div class="card">
        <div class="card-head"><h3>Password</h3></div>
        <form id="password-form" novalidate>
          <div class="form-error" role="alert">${icon('info', 15)}<span></span></div>
          <input type="text" autocomplete="username" value="${esc(acc.user.email)}" hidden>
          <div class="field"><label for="pw-current">Current password</label>
            <div class="pw"><input class="input" id="pw-current" name="current" type="password" autocomplete="current-password"><button type="button" aria-label="Show password">${icon('eye', 17)}</button></div></div>
          <div class="field"><label for="pw-next">New password</label>
            <div class="pw"><input class="input" id="pw-next" name="next" type="password" autocomplete="new-password" minlength="10"><button type="button" aria-label="Show password">${icon('eye', 17)}</button></div>
            <div class="strength" data-s="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div></div>
          <div class="row"><button class="btn primary" type="submit">Change password</button></div>
        </form>
      </div>
      <div class="card">
        <div class="card-head"><h3>Sessions</h3></div>
        <p>Signed in somewhere you don’t recognise? Sign out of the website and the app on every computer. You’ll need to sign in again here too.</p>
        <div class="row" style="margin-top:16px"><button class="btn" type="button" data-logout-all>${icon('log-out', 15)}Sign out everywhere</button></div>
      </div>
      <div class="card danger-zone">
        <div class="card-head"><h3>Delete account</h3></div>
        <p>Removes your account, license and devices for good. ${isPro() ? 'Your Pro license is not refunded.' : ''} Projects on your computers are not deleted.</p>
        <div class="row" style="margin-top:16px"><button class="btn danger" type="button" data-delete>${icon('trash', 15)}Delete account</button></div>
      </div>
    </div>`;

  passwordToggles($('#view-settings'));
  const pf = $('#profile-form');
  pf.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = pf.name.value.trim();
    if (!name) { formError(pf, 'Your name can’t be empty.'); return; }
    formError(pf, '');
    busy($('[type=submit]', pf), async () => {
      try { acc = await auth.updateProfile({ name }); fillUser(); toast('Profile saved'); } catch (err) { formError(pf, errorText(err)); }
    });
  });

  const pw = $('#password-form');
  pw.next.addEventListener('input', () => { $('.strength', pw).dataset.s = passwordScore(pw.next.value); });
  pw.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!pw.current.value) { formError(pw, 'Enter your current password.'); pw.current.focus(); return; }
    if (pw.next.value.length < 10) { formError(pw, 'Use at least 10 characters for the new password.'); pw.next.focus(); return; }
    if (pw.next.value === pw.current.value) { formError(pw, 'The new password is the same as the current one.'); return; }
    formError(pw, '');
    busy($('[type=submit]', pw), async () => {
      try {
        await auth.changePassword({ current: pw.current.value, next: pw.next.value });
        pw.reset();
        $('.strength', pw).dataset.s = 0;
        toast('Password changed. Other computers were signed out.');
      } catch (err) { formError(pw, errorText(err)); }
    });
  });

  $('[data-logout-all]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Sign out everywhere?',
      text: 'Every computer and browser signed in to your account will be signed out, including this one.',
      confirm: 'Sign out everywhere',
      action: async () => { try { await auth.logoutEverywhere(); } catch (e) { e.userText = errorText(e); throw e; } },
    });
    if (ok) { signOutLocal(); location.replace('login.html'); }
  });

  $('[data-delete]').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Delete your account?',
      text: `This can’t be undone. Enter the password for <b>${esc(acc.user.email)}</b> to confirm.`,
      confirm: 'Delete account',
      danger: true,
      password: true,
      action: async (password) => { try { await auth.deleteAccount({ password }); } catch (e) { e.userText = errorText(e); throw e; } },
    });
    if (ok) { signOutLocal(); location.replace('login.html'); }
  });
}

// Remake-only: remember that the user deliberately left the dashboard, so boot() does not
// silently sign the demo account back in when the dashboard is opened again.
function signOutLocal() {
  try { sessionStorage.setItem('swi.authTouched', '1'); } catch { /* storage blocked */ }
}

// ---------------------------------------------------------------- shell
function fillUser() {
  $('#me-name').textContent = acc.user.name;
  $('#me-email').textContent = acc.user.email;
  $('#me-avatar').textContent = initials(acc.user.name, acc.user.email);
  const chip = $('#me-plan');
  chip.textContent = isPro() ? 'PRO' : 'FREE';
  chip.className = 'chip ' + (isPro() ? 'pro' : 'free');
  $('[data-verify]').hidden = acc.user.emailVerified !== false;
  $('#verify-to').textContent = acc.user.email;
  const adminLink = $('[data-admin-link]');
  if (adminLink) adminLink.hidden = isPreview || acc.user.role !== 'admin';
}
$('[data-resend]').addEventListener('click', (e) => busy(e.currentTarget, resend));

function renderAll() {
  fillUser();
  renderOverview();
  renderLicense();
  renderDownloads();
  renderChangelog();
  renderDevices();
  renderBilling();
  renderCredits();
  renderSettings();
  $$('[data-upgrade]').forEach((b) => b.addEventListener('click', () => busy(b, upgrade)));
  $$('[data-portal]').forEach((b) => b.addEventListener('click', () => busy(b, manage)));
  // monthly / yearly on the upgrade cards: every card follows the same pick
  $$('.upgrade [data-bill]').forEach((b) => b.addEventListener('click', () => { billPick = b.dataset.bill; paintBill(); }));
  // waiting for a payment's confirmation: no second checkout meanwhile
  if (payPending) $$('[data-upgrade]').forEach((b) => { b.disabled = true; b.innerHTML = '<span class="spinner" aria-hidden="true"></span> Confirming payment…'; });
}

function paintBill() {
  const y = year();
  $$('.upgrade [data-bill]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.bill === billPick)));
  $$('[data-up-price]').forEach((el) => { el.textContent = y ? CONFIG.proYearly.price : CONFIG.pro.price; });
  $$('[data-up-period]').forEach((el) => { el.textContent = y ? CONFIG.proYearly.period : CONFIG.pro.period; });
  $$('[data-up-note]').forEach((el) => { el.textContent = y ? `${CONFIG.proYearly.perMonth} a month, billed once a year.` : ''; });
}

// Payhip can pass metadata through checkout to its webhook. Adding the signed-in
// account email makes the upgrade land on the right account even if the buyer uses
// a different email at the processor. Never send demo emails in preview mode.
function checkoutUrl(url) {
  try {
    if (isPreview || !/^https:\/\/(www\.)?payhip\.com\//i.test(url) || !acc?.user?.email) return url;
    const u = new URL(url);
    u.searchParams.set('metadata[wicked_email]', acc.user.email);
    return u.toString();
  } catch { return url; }
}

// "Manage subscription": the configured provider's customer portal (card, cancel, resume, invoices)
async function manage() {
  const direct = CONFIG.checkout?.portal;
  if (direct && /^https:\/\//.test(direct)) { window.open(checkoutUrl(direct), '_blank', 'noopener'); return; }
  try {
    const { url } = await auth.portal();
    if (url && /^https:\/\//.test(url)) window.open(checkoutUrl(url), '_blank', 'noopener');
    else if (url) toast(`Preview mode — the real site opens ${CONFIG.checkout.provider} here`);
  } catch (err) { toast(errorText(err), 'error'); }
}

async function upgrade() {
  const period = year() ? 'year' : 'month';
  const direct = CONFIG.checkout?.[period];
  if (direct && /^https:\/\//.test(direct)) { location.href = checkoutUrl(direct); return; }
  try {
    const res = await auth.checkout(period);
    if (res.url) { location.href = checkoutUrl(res.url); return; } // hosted checkout (Polar / Payhip / Gumroad / Stripe)
    acc = await auth.account();
    renderAll();
    location.hash = 'overview';
    toast('Welcome to Wicked Pro');
  } catch (err) { toast(errorText(err), 'error'); }
}

function route() {
  let id = location.hash.slice(1);
  if (id === 'welcome') { toast('Account created — welcome to Wicked Imgui'); history.replaceState(null, '', '#overview'); id = 'overview'; }
  if (!VIEWS[id]) id = 'overview';
  $$('.view').forEach((v) => v.classList.toggle('on', v.id === 'view-' + id));
  $$('.dash-nav a').forEach((a) => {
    const on = a.dataset.view === id;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  $('#view-title').textContent = VIEWS[id];
  document.title = `${VIEWS[id]} — Wicked Imgui`;
  menu(false);
  scrollTo(0, 0);
}

const dash = $('.dash');
const scrim = $('.dash-scrim');
function menu(open) {
  dash.classList.toggle('menu-open', open);
  scrim.hidden = !open;
  $('.dash-menu').setAttribute('aria-expanded', String(open));
}
$('.dash-menu').addEventListener('click', () => menu(!dash.classList.contains('menu-open')));
scrim.addEventListener('click', () => menu(false));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { menu(false); return; }
  const tag = (e.target?.tagName || '').toLowerCase();
  if (['input', 'textarea', 'select'].includes(tag) || e.target?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
  const shortcuts = { '1': 'overview', '2': 'license', '3': 'downloads', '4': 'devices', '5': 'billing', '6': 'credits', '7': 'settings', 'c': 'changelog' };
  const view = shortcuts[e.key.toLowerCase()];
  if (view && VIEWS[view]) { e.preventDefault(); location.hash = view; }
});

$('[data-logout]').addEventListener('click', async () => {
  try { await auth.logout(); } catch { /* signed out locally either way */ }
  signOutLocal();
  location.replace('login.html');
});
$$('[data-support]').forEach((el) => { el.href = 'mailto:' + CONFIG.supportEmail; });

async function boot() {
  // Remake-only: land directly on the dashboard with the Pro demo account — unless the user
  // has just logged out or deleted the account, in which case show the login page.
  let authTouched = false;
  try { authTouched = sessionStorage.getItem('swi.authTouched') === '1'; } catch { /* storage blocked */ }
  if (isPreview && !authTouched && !hasLocalSession()) {
    try { await previewAuth.login({ email: 'test', password: 'test', remember: true }); } catch { /* stay signed out */ }
  }
  try {
    acc = await session();
  } catch (err) {
    document.body.innerHTML = `<div class="empty" style="margin-top:20vh">${esc(errorText(err))}<p style="margin-top:14px"><a class="btn" href="">Try again</a></p></div>`;
    return;
  }
  if (!acc) {
    const back = 'index.html' + (VIEWS[location.hash.slice(1)] ? location.hash : '');
    location.replace('login.html?next=' + encodeURIComponent(back));
    return;
  }
  try { sessionStorage.removeItem('swi.authTouched'); } catch { /* storage blocked */ }
  creditData = await auth.credits().catch(() => null);
  releases = (await auth.releases().catch(() => ({ releases: [] }))).releases || [];
  loadBuildHistory();
  if (isPreview) $('[data-preview]').hidden = false;
  renderAll();
  dash.hidden = false;
  showAnnouncement();
  route();
  if (CONFIG.updates.checkOnLaunch) setTimeout(() => checkForUpdates(false), 800);
  if (acc.user.emailVerified === false) watchVerified((fresh) => { acc = fresh; renderAll(); toast('Email confirmed'); });
  addEventListener('hashchange', route);
  waitForPro();
}

// Back from the payment provider's checkout (index.html?paid=1). Their webhook usually arrives within seconds but
// can be retried for minutes, so a banner says what is going on and the page keeps checking — also after a
// reload (the start time is kept for this tab).
const PAY_KEY = 'swi.payPending';
const PAY_SLOW = 2 * 60e3, PAY_GIVE_UP = 30 * 60e3;
let payPending = false;
let payWake = null;
const payStart = () => { try { const t = Number(sessionStorage.getItem(PAY_KEY)); return t && Date.now() - t < PAY_GIVE_UP ? t : 0; } catch { return 0; } };
const setPayStart = (t) => { try { if (t) sessionStorage.setItem(PAY_KEY, String(t)); else sessionStorage.removeItem(PAY_KEY); } catch { /* private mode */ } };
/** The subscription (or a lifetime key) is on the account; a time-limited key alone doesn't count. */
const proArrived = () => isSub() || (isPro() && !acc.license.proUntil);
/** Sleeps, but wakes up early when the tab comes back into view. */
const nap = (ms) => new Promise((r) => { const t = setTimeout(r, ms); payWake = () => { clearTimeout(t); r(); }; });
addEventListener('focus', () => payWake?.());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') payWake?.(); });

function payBar(state) {
  const bar = $('[data-paybar]');
  const support = `<a href="mailto:${esc(CONFIG.supportEmail)}">${esc(CONFIG.supportEmail)}</a>`;
  bar.className = 'notice pay-bar' + (state === 'slow' || state === 'late' ? ' slow' : '');
  bar.innerHTML = {
    wait: `<span class="spinner" aria-hidden="true"></span><span class="grow"><b>Thank you! Waiting for the payment confirmation…</b>
      ${esc(CONFIG.checkout.provider)} is confirming your payment. This usually takes a few seconds — Pro turns on here by itself, no need to refresh.</span>`,
    slow: `<span class="spinner" aria-hidden="true"></span><span class="grow"><b>Still waiting for the confirmation…</b>
      Sometimes it takes a few minutes. Your payment is safe and Pro turns on by itself as soon as it's confirmed — keep this page open or come back later. Not there after 30 minutes? Write to ${support}.</span>`,
    late: `${icon('info')}<span class="grow"><b>The confirmation hasn't arrived yet</b>
      If you were charged, Pro turns on as soon as it does. Write to ${support} with the email you paid with and we'll sort it out.</span>
      <button class="btn sm" type="button" data-pay-retry>Check again</button>`,
    done: `${icon('check')}<span class="grow"><b>Wicked Pro is active — thank you!</b>
      Sign in to the Wicked Imgui app with ${esc(acc.user.email)} and Pro unlocks there too.</span>
      <a class="btn sm primary" href="#downloads">Download Wicked Imgui</a>`,
  }[state];
  bar.dataset.state = state;
  bar.hidden = false;
  $('[data-pay-retry]', bar)?.addEventListener('click', () => { setPayStart(Date.now()); waitForPro(); });
  if (state === 'done') setTimeout(() => { if (bar.dataset.state === 'done') bar.hidden = true; }, 30000);
}

function payDone() {
  payPending = false;
  setPayStart(0);
  renderAll();
  route();
  payBar('done');
}

async function waitForPro() {
  if (new URLSearchParams(location.search).has('paid')) {
    history.replaceState(null, '', 'dashboard' + location.hash);
    if (!payStart()) setPayStart(Date.now());
  }
  const start = payStart();
  if (!start || payPending) return;
  if (proArrived()) return payDone();
  payPending = true;
  renderAll();
  route();
  let shown = Date.now() - start > PAY_SLOW ? 'slow' : 'wait';
  payBar(shown);
  while (Date.now() - start < PAY_GIVE_UP) {
    await nap(Date.now() - start < 60e3 ? 3000 : 10000);
    if (shown === 'wait' && Date.now() - start > PAY_SLOW) payBar(shown = 'slow');
    if (document.visibilityState === 'hidden') continue;
    try { acc = await auth.account(); } catch { continue; } // offline for a moment: next round
    if (proArrived()) return payDone();
  }
  payPending = false;
  setPayStart(0);
  renderAll();
  route();
  payBar('late');
}
boot();
