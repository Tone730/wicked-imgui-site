#!/usr/bin/env node
// One-time import of local JSON stores into the Supabase `wicked_state` table.
// Usage:  node tools/import-state.js [--force]
// Reads ../.env (or real environment variables). Never prints credentials.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

(function loadEnv() {
  for (const file of [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', 'server', '.env')]) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const at = t.indexOf('=');
      if (at < 0) continue;
      const key = t.slice(0, at).trim();
      if (!/^[A-Z0-9_]+$/.test(key) || Object.prototype.hasOwnProperty.call(process.env, key)) continue;
      let value = t.slice(at + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[key] = value;
    }
  }
})();

const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const table = process.env.SUPABASE_TABLE || 'wicked_state';
const root = path.join(__dirname, '..');
const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const dataFile = process.env.DATA_FILE || path.join(root, 'server', 'data', 'licenses.json');
const accountsFile = process.env.ACCOUNTS_FILE || path.join(path.dirname(dataFile), 'accounts.json');
const auditFile = process.env.AUDIT_FILE || path.join(path.dirname(dataFile), 'audit.jsonl');

if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before importing.');
  process.exit(1);
}
const rows = [
  { id: 'licenses', data: readJson(dataFile, { keys: {} }) },
  { id: 'accounts', data: readJson(accountsFile, {}) },
  { id: 'audit', data: { lines: fs.existsSync(auditFile) ? fs.readFileSync(auditFile, 'utf8').split('\n').filter(Boolean) : [] } },
];
const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };

(async () => {
  const existing = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?select=id`, { headers })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Supabase read failed: ' + r.status))));
  if (existing.length && !process.argv.includes('--force')) {
    console.error(`The table already has rows (${existing.map((r) => r.id).join(', ')}). Re-run with --force to overwrite them.`);
    process.exit(1);
  }
  const r = await fetch(`${url}/rest/v1/${encodeURIComponent(table)}?on_conflict=id`, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) {
    console.error('Import failed:', r.status, (await r.text()).slice(0, 300));
    process.exit(1);
  }
  console.log(`Imported ${rows.length} collections (licenses, accounts, audit).`);
})().catch((err) => { console.error(err.message); process.exit(1); });
