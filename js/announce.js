// The announcement set in the admin panel (maintenance, outages…): a full-width bar pinned to the top
// of every page. It can be closed; it comes back when the text changes.
import { auth } from './auth.js';
import { icon, esc } from './ui.js';

const KEY = 'swi.announce.closed';

export async function showAnnouncement() {
  let a;
  try { ({ announcement: a } = await auth.status()); } catch { return; } // the page works without it
  if (!a) return;
  try { if (sessionStorage.getItem(KEY) === a.text) return; } catch { /* storage blocked */ }
  const el = document.createElement('div');
  el.className = 'announce global ' + (a.level === 'warning' ? 'warning' : 'info');
  el.setAttribute('role', a.level === 'warning' ? 'alert' : 'status');
  el.innerHTML = `<div class="wrap">${icon(a.level === 'warning' ? 'info' : 'bell', 16)}<span class="grow">${esc(a.text)}</span>
    <button class="icon-btn" type="button" aria-label="Close">${icon('x', 15)}</button></div>`;
  document.body.prepend(el);
  // the sticky header / dashboard sidebar sit below it
  const root = document.documentElement;
  const sync = () => root.style.setProperty('--ann-h', el.isConnected ? el.offsetHeight + 'px' : '0px');
  new ResizeObserver(sync).observe(el);
  sync();
  el.querySelector('button').addEventListener('click', () => {
    el.remove();
    sync();
    try { sessionStorage.setItem(KEY, a.text); } catch { /* storage blocked */ }
  });
}
