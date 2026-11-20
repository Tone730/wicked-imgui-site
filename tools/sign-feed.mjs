// sign-feed.mjs — sign the self-hosted update feed for update authenticity.
//
//   node tools/sign-feed.mjs --generate [--force]
//   node tools/sign-feed.mjs [--feed downloads/latest.json]
//   node tools/sign-feed.mjs --verify [--feed downloads/latest.json]
//
// Signs version + sha256 + bytes with Ed25519 into `signatureV2`. The field is
// deliberately named differently from the legacy `signature` so older pinned
// builds (which only check `signature`) keep updating normally, while current
// builds require a valid signatureV2 and fail closed on a missing/tampered one.
//
// The private key NEVER belongs in either repository. It is read from
// WICKED_RELEASE_SIGNING_KEY (PEM) or WICKED_RELEASE_KEY_FILE, defaulting to
// ~/.config/wicked-imgui/release-signing.key. Only the public key is embedded
// in the app. Fully offline — no network calls.

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(name);

const feedPath = arg('--feed', join(root, 'downloads', 'latest.json'));
const keyFile = process.env.WICKED_RELEASE_KEY_FILE || join(homedir(), '.config', 'wicked-imgui', 'release-signing.key');

// Public key pinned in app/main.cjs. Change both together when rotating keys.
const PUBLIC_KEY = process.env.WICKED_RELEASE_PUBLIC_KEY || 'qW7bkoHH7TgJRpnmKQRt3ViWwL5DVzWxR4ajJ6S6fn8';

const signedMessage = (r) =>
  'wicked-release-v3\n' + String(r.version) + '\n' + String(r.sha256 || '').toLowerCase() + '\n' + String(r.bytes);

function privateKey() {
  if (process.env.WICKED_RELEASE_SIGNING_KEY) return createPrivateKey(process.env.WICKED_RELEASE_SIGNING_KEY);
  if (!existsSync(keyFile)) throw new Error('signing key not found: ' + keyFile);
  return createPrivateKey(readFileSync(keyFile, 'utf8'));
}

if (has('--generate')) {
  if (existsSync(keyFile) && !has('--force')) throw new Error('key already exists (use --force to replace): ' + keyFile);
  const { publicKey: pub, privateKey: priv } = generateKeyPairSync('ed25519');
  mkdirSync(dirname(keyFile), { recursive: true });
  writeFileSync(keyFile, priv.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const x = pub.export({ format: 'jwk' }).x;
  console.log('sign-feed: wrote private key to ' + keyFile);
  console.log('sign-feed: public key = ' + x);
  console.log('sign-feed: update PUBLIC_KEY here and RELEASE_PUBLIC_KEY in app/main.cjs together');
  process.exit(0);
}

const feed = JSON.parse(readFileSync(feedPath, 'utf8'));

if (has('--verify')) {
  if (!feed.signatureV2) { console.error('sign-feed: FAIL — feed has no signatureV2'); process.exit(1); }
  let key;
  try { key = createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: PUBLIC_KEY }, format: 'jwk' }); }
  catch (e) { console.error('sign-feed: FAIL — bad public key: ' + e.message); process.exit(1); }
  const ok = verify(null, Buffer.from(signedMessage(feed)), key, Buffer.from(feed.signatureV2, 'base64url'));
  if (!ok) { console.error('sign-feed: FAIL — signatureV2 does not match feed'); process.exit(1); }
  console.log('sign-feed: PASS — signatureV2 valid for ' + feed.version);
  process.exit(0);
}

feed.signatureV2 = sign(null, Buffer.from(signedMessage(feed)), privateKey()).toString('base64url');
writeFileSync(feedPath, JSON.stringify(feed, null, 4) + '\n', 'utf8');
console.log('sign-feed: signed ' + feed.version + ' in ' + feedPath);
