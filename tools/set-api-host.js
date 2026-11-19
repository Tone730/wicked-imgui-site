#!/usr/bin/env node
// Point the static dashboard at a remote account server for a static-only deploy
// (e.g. GitHub Pages). The server can also do this at runtime by serving /js/config.js.
//   node tools/set-api-host.js --api https://api.example.com
//   node tools/set-api-host.js --clear        (back to browser-only preview)
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const clear = args.includes('--clear');
const i = args.indexOf('--api');
const value = clear ? '' : (i >= 0 ? args[i + 1] : '');
if (!clear && (!value || !/^https:\/\//i.test(value))) {
  throw new Error('Usage: node tools/set-api-host.js --api https://your-account-server  (or --clear)');
}
const target = path.resolve(__dirname, '..', 'js', 'config.js');
const source = fs.readFileSync(target, 'utf8');
const replaced = source.replace(/apiBase:\s*'[^']*'/, "apiBase: '" + value.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'");
if (replaced === source) throw new Error('Could not find the apiBase setting in js/config.js');
fs.writeFileSync(target, replaced);
console.log(`apiBase = ${value || '(preview mode)'}`);
console.log('Remember: a cross-site API needs ALLOWED_ORIGINS, COOKIE_SAMESITE=None and COOKIE_SECURE=1 on the server.');
