# Update feed signing (Ed25519)

The self-hosted update feed (`downloads/latest.json`) is signed so a tampered or
compromised feed cannot push a malicious update. This is **offline** — no key
service, no remote backend, no network calls during signing.

## How it works

- `tools/sign-feed.mjs` signs `version + sha256 + bytes` into a new feed field
  called **`signatureV2`** (Ed25519, base64url).
- The field name is deliberately different from the legacy `signature` so that
  **already-shipped builds keep updating**: old builds ignore `signatureV2` and
  see no legacy `signature`, so they continue with checksum-only verification.
- New builds pin a public key in `app/main.cjs` (`RELEASE_PUBLIC_KEY`) and
  **fail closed**: `updater.cjs` rejects a feed with a missing/invalid
  `signatureV2`. A signed feed is required, not optional.
- `attach-release.ps1` signs and verifies the feed automatically on every
  packaging run, so an unsigned feed can never be produced accidentally.
- `tools/verify_release.py` re-checks `signatureV2` in the release gate.

## Key storage — NEVER commit the private key

The private key lives **outside both repositories**:

```
~/.config/wicked-imgui/release-signing.key
```

On this machine that is:

```
C:\Users\Wick\.config\wicked-imgui\release-signing.key
```

Back this file up securely (e.g. an encrypted vault). If it is lost, you cannot
sign future feeds and must rotate the key (below).

Overrides via environment variable (useful in CI):

- `WICKED_RELEASE_KEY_FILE` — path to the PEM private key.
- `WICKED_RELEASE_SIGNING_KEY` — the PEM text itself.

## Current public key (pinned in app/main.cjs)

```
qW7bkoHH7TgJRpnmKQRt3ViWwL5DVzWxR4ajJ6S6fn8
```

Fingerprint (SHA-256 of raw key bytes, first 16 hex): `c495a8214bff0172`.

## Commands

```powershell
# Generate a fresh keypair (only if none exists; --force replaces it)
node tools/sign-feed.mjs --generate

# Sign the current feed (done automatically by attach-release.ps1)
node tools/sign-feed.mjs

# Verify the signature without changing anything
node tools/sign-feed.mjs --verify

# Full release gate (includes signatureV2 check)
node tools/verify-release.mjs 2.9.1 --remote
```

## Key rotation

A key rotation requires the new public key to reach users, so it can only take
effect in a **new release**:

1. `node tools/sign-feed.mjs --generate --force` (backs up the old key first).
2. Copy the printed public key into `app/main.cjs` (`RELEASE_PUBLIC_KEY`).
3. Sign the feed: `node tools/sign-feed.mjs`.
4. Ship a release so the new public key is embedded in the app.
5. Update the "Current public key" block in this file.

Until step 4 ships, do **not** switch the feed to the new key — older pinned
builds still expect the old key. Because the fail-closed check only exists in
new builds and old builds ignore `signatureV2`, a rotation is safe as long as
the feed always carries a valid `signatureV2` for the latest shipped key.
