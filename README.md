# Wicked Imgui — Dashboard Remake

An offline-capable dashboard built as **Wicked Imgui**. Every page and flow in this folder works locally.

**Zero-cost launch options** (payments, hosting, signing, licensing, analytics) are collected in [FREE-STACK.md](FREE-STACK.md). No vendor is hard-coded — everything is configured in `js/config.js`.

## Run

```
cd C:\Users\Wick\wicked-imgui
start.bat
```

or manually:

```
python -m http.server 8124
```

Then open <http://127.0.0.1:8124/#downloads>. ES modules require HTTP (not `file://`).

## Pages

| File | What it does |
|---|---|
| `index.html` | Dashboard — Overview, License, Downloads, Devices, Billing, Settings (hash routes) |
| `login.html` | Log in, demo fill buttons, password-reset view |
| `signup.html` | Create an account, password strength meter, terms checkbox |
| `privacy.html` | Terms of Service + Privacy Policy (anchors `#terms`, `#privacy`, etc.) |
| `faq.html` | 15 expandable help questions (incl. free alternatives), support and Discord links |
| `invoice.html` | Printable receipt from the Billing invoice links |

Every internal link on every page resolves (53/53 checked). No console errors and no failed network requests.

## What was rebuilt

| Area | Wicked Imgui |
|---|---|
| Page title / brand | `Wicked Imgui` |
| Plan names | `Wicked Pro` / `Wicked Free` |
| License keys | `SWI-XXXXX-XXXXX-...` |
| Storage keys | `swi.site.users`, `swi.site.session`, etc. |
| Contact emails | your three real inboxes (see below) |
| Legal identity | individual / sole developer, United States |
| Discord | `https://discord.gg/YwNQdu5pyh` |
| Logo / favicon | `assets/logo-mark.svg`, `assets/favicon.svg` |
| Installer names | `WickedImgui-Setup-<version>.exe` |

## Contact details and legal pages

`privacy.html` now contains full, production-ready **Terms of Service** and **Privacy Policy** copy for a US-based individual developer. It is not a placeholder any more.

| Purpose | Address | Where it is used |
|---|---|---|
| Technical support & account help | `wick777@engineer.com` | `CONFIG.supportEmail`, FAQ, invoice, account errors, dashboard support links |
| Billing, invoices & refunds | `wickz77r@gmail.com` | `CONFIG.billingEmail`, FAQ, invoice page, billing section of the policy |
| Legal, privacy & data requests | `leakz15@programmer.net` | `CONFIG.legal.email`, policy header, rights, California and contact sections |

All static-page links are written with a correct `mailto:` fallback and hydrated from `js/config.js` by `js/contact.js`. Change an inbox in **one** place (`CONFIG.contact`) and every page follows.

Governing law is set to **Florida** in both `CONFIG.legal.state` and `privacy.html` §15. If you move or want a different jurisdiction, change both places together.

## Attaching your portable build

The Downloads page reads from **`js/release.js`** — the single source of truth.

### 1. Persistent (recommended)

1. Copy your built portable ZIP into the `downloads\` folder.
2. Run:
   ```
   powershell -NoProfile -ExecutionPolicy Bypass -File tools\attach-release.ps1 -Zip "downloads\WickedImgui-Portable-2.2.0.zip" -Version "2.2.0" -Notes "What changed in this build"
   ```
3. Reload the page. The button, file size, date and SHA-256 all update automatically.

### 2. Quick session-only

Drop your portable ZIP on the Downloads dropzone (or click it). The page computes the checksum and makes a `blob:` download link that lasts only for the current tab.

## Editing a release manually

`js/release.js`:

```js
export const RELEASE = {
  attached: true,                       // set true to enable the download button
  version: '2.2.0',
  date: '2026-11-18',
  bytes: 168474152,
  size: '160.7 MB',
  sha256: 'f6682ef716f4a6c71c299c87992122fdc14c9e061675305ebeaa360871d6983d',
  sha512: 'xWdwBByzeUN8oCzTpK8Ae5EFIWXBbPJnesI99/A7SZG4QV2I9mEqvJqIuEdOWwT0HcNvSU88mBv5rDpQMqhdzQ==', // base64 SHA-512
  channel: 'stable',
  feedUrl: 'downloads/latest.json',
  electronFeedUrl: 'downloads/latest.yml',
  notes: 'What changed in this build.',
  file: 'WickedImgui-Portable-2.2.0.zip',
  kind: 'Portable ZIP — extract and run Wicked Imgui Maker.exe',
  changes: [['Tag', 'Description']],
  older: [],                            // previous releases, newest first
};
```

## Attached local full-access build and live release

`js/release.js` describes the rebuilt **Wicked Imgui Maker 2.2.0** portable ZIP, generated from
`C:\Users\Wick\WickedImguiMaker\dist`. The build starts as Wicked Local Pro, needs no sign-in or key,
ships a built-in offline AI provider, includes C++/C#/Rust runtime sources for source export, and
contains all unlocked widgets, themes, effects, templates, and workflow tools. Account actions and
usage are fully local with zero network calls, and Settings discloses that native builds need your
own ImGui backend.

The package is attached locally at `downloads\WickedImgui-Portable-2.2.0.zip` and published publicly at:

- Release page: <https://github.com/Tone730/wicked-imgui-releases/releases/tag/v2.2.0>
- Download: <https://github.com/Tone730/wicked-imgui-releases/releases/download/v2.2.0/WickedImgui-Portable-2.2.0.zip>
- Dashboard feed: <https://github.com/Tone730/wicked-imgui-releases/releases/download/v2.2.0/latest.json>
- App feed: <https://github.com/Tone730/wicked-imgui-releases/releases/download/v2.2.0/latest.yml>
- Rebuilt app source / build pipeline: <https://github.com/Tone730/wicked-imgui-app>
- Dashboard source: <https://github.com/Tone730/wicked-imgui-site>
- Live dashboard: <https://tone730.github.io/wicked-imgui-site/>

Size: 168,474,152 bytes (160.7 MB). SHA-256:
`f6682ef716f4a6c71c299c87992122fdc14c9e061675305ebeaa360871d6983d`.
The Downloads page renders the live download button, checksum, and “What’s new” panel from
`js/release.js`; the app has the public feed URL baked in.

To regenerate the package and refresh its SHA-256:

```
powershell -NoProfile -ExecutionPolicy Bypass -File tools\set-update-host.ps1 `
  -BaseUrl 'https://github.com/Tone730/wicked-imgui-releases/releases/download/v2.2.0'
```

This rebuilds the app with the public feed URL, copies `dist\` into
`downloads\WickedImgui-Portable-<version>.zip`, adds `README-FIRST.txt`, and updates `js/release.js`,
`latest.json`, and `latest.yml`. The Downloads page renders the release `changes` list as a
“What’s new” panel. For a new version, change the tag in the URL and delete/recreate the GitHub
release assets with the new filenames.

## Demo account / auth

Preview mode (no server). The dashboard opens directly with the Pro demo account on a fresh browser. Demo credentials: `test / test` (Pro), `free / free` (Free).

- Log out → `login.html`. Logging out deliberately suppresses the auto sign-in, so the login page actually stays put.
- Login, signup, password reset, redeem, upgrade, device sign-out, profile save, password change, sign-out-everywhere and delete-account dialogs were all exercised in-browser.

### Real account server (still opt-in)

`server/server.js` now implements the live half of `js/auth.js`: scrypt password hashes, HttpOnly session cookies, account/session/profile/password/delete endpoints, devices, redeem, billing intents, generic + Payhip signed webhooks, and the original signed-license API. It reads `.env` automatically (copy `.env.example`). See [DEPLOY.md](DEPLOY.md) and [PAYHIP.md](PAYHIP.md).

```powershell
cd server
node test.js        # 52/52 checks
node server.js      # http://127.0.0.1:8787 — also serves this dashboard
```

When the server serves the static folder it rewrites `js/config.js` in the response so `apiBase` becomes `/`. Opening the folder directly with `python -m http.server` still uses preview mode. For a separate static host, run `node tools/set-api-host.js --api https://your-api` before uploading.

## Files

- `index.html`, `login.html`, `signup.html`, `privacy.html`, `faq.html`, `invoice.html`
- `css/site.css` — original shared styles; `css/attach.css` — attachment UI
- `js/release.js` — **edit this** to attach your build
- `js/auth.js` / `js/auth-preview.js` — live client / browser-only demo accounts
- `js/invoice.js` — invoice page; works in preview and with the live account API
- `js/checkout-links.js` — generated provider URLs (empty = honest preview)
- `js/dashboard.js` — six views, routing, download/dropzone, all interactions
- `js/login.js`, `js/signup.js` — account page logic (targets adapted to local filenames)
- `server/` — dependency-free account, session, billing and license server (`node server/test.js`)
- `DEPLOY.md` — static + API deployment runbook; `render.yaml`, `Dockerfile`, `Procfile`, `.github/workflows/pages.yml`
- `PAYHIP.md` — free checkout setup; `.env.example` — local secrets template (copy to `.env`)
- `LEGAL-REVIEW.md`, `code-signing-policy.html` — review checklist and signing policy draft
- `tools/attach-release.ps1` — copies your portable ZIP, hashes it and updates `release.js`
- `tools/set-api-host.js`, `tools/set-checkout-urls.js` — build-time config generators
- `downloads/` — put portable ZIPs here
- `downloads.png` — REA screenshot of the Downloads page

## Going live 1: portable build

The download system is already built. You only need a real build and a distribution URL.

1. **Package the rebranded app.** Run `tools\package-app.ps1`; it stages `C:\Users\Wick\WickedImguiMaker\dist`, adds `README-FIRST.txt`, and creates `downloads\WickedImgui-Portable-<version>.zip`. No installer or admin rights are needed.
2. **Optionally build a signed installer.** Inno Setup (single `.exe`) or WiX/MSI is best for corporate deployment. SignPath Foundation is free for qualifying open-source projects; otherwise an OV/EV certificate costs roughly $250–$700/year. Without signing, expect SmartScreen warnings and antivirus false positives.
3. **Host it for free** on one of:
   - **GitHub Releases** — no total storage or bandwidth quota, 2 GiB per file. Best starting point.
   - **Cloudflare R2** — 10 GB storage + 1M reads/month free, zero egress fees.
   - **itch.io / SourceForge** — free mirrors with no monthly fee.
4. **Attach it here.** Drop the file in `downloads\`, run `tools\attach-release.ps1`, and the page shows size + SHA-256 automatically. If you host it externally, set `file` in `js/release.js` to the full HTTPS URL.
5. **Publish the update feed.** The same script writes `downloads\latest.json` (dashboard + app) and `downloads\latest.yml` (generic feed). Set `CONFIG.updates.baseUrl` here and the app's update URL to the **same public folder**. Keep the previous 1–2 versions downloadable. Bake the app URL with `powershell -File C:\Users\Wick\WickedImguiMaker\build.ps1 -UpdateFeedUrl "https://your-host/downloads/latest.json"`.

### One-command public update host

`tools\set-update-host.ps1` does the whole chain: normalizes the URL, updates `CONFIG.updates.baseUrl`,
rebuilds the app with the baked feed URL, repackages the ZIP, regenerates both manifests with public
URLs, verifies size/hash consistency, and prints the three files to upload.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools\set-update-host.ps1 `
  -BaseUrl 'https://your-host/downloads/'
```

Use `-SkipBuild` or `-SkipPackage` only for dry-running the config/manifest steps. The base URL must
be an HTTPS URL ending in `/downloads` or a GitHub Releases tag URL such as
`https://github.com/OWNER/REPO/releases/download/TAG` (loopback `http://` is allowed for local testing).

### Auto-update feed

`tools\attach-release.ps1` generates both manifests on every build:

- `downloads\latest.json` — `version`, `date`, `channel`, `bytes`, `sha256`, `sha512`, `file`, `url`, `notes`. The dashboard uses it for "Check for updates".
- `downloads\latest.yml` — `version`, `releaseDate`, `path`, `sha512`, `size`. This is the standard generic-provider manifest for Electron updaters.

The app reads the feed from the self-hosted URL configured in its build (`app\update-feed.json`, or `WICKED_UPDATE_URL` at runtime). The current shipped build has the public GitHub Releases feed URL baked in: `https://github.com/Tone730/wicked-imgui-releases/releases/download/v2.2.0/latest.json`. Run `tools\set-update-host.ps1 -BaseUrl <public-url>` to bake a different feed URL into the next package.

Because the release is a portable ZIP, the app verifies the published SHA-256/SHA-512 and opens the download folder for manual extraction; it does not claim a silent background install. A future signed installer with an Ed25519 signature can use the existing Wicked Update launcher for one-click install. The dashboard shows the channel, current version and update status honestly in preview mode. Run `node C:\Users\Wick\WickedImguiMaker\test-updater.js` to exercise the app updater against the attached release.

## Going live 2: payments

**Lemon Squeezy is closed to new signups and shuts down 31 Mar 2027 — do not use it.** The dashboard now reads its checkout providers from `js/config.js`, so no single vendor is hard-coded. See [FREE-STACK.md](FREE-STACK.md) for the full comparison. Current recommendation: **Payhip Free** as primary (no monthly fee, 5% + processor, hosted subscriptions and license keys), with **Polar** or **Ko-fi** as a second option. Step-by-step setup is in [PAYHIP.md](PAYHIP.md).

| Provider | Fees | Who handles VAT/sales tax, refunds, chargebacks | Best for |
|---|---|---|---|
| **Polar Starter** (recommended) | $0/mo, 5% + 50¢ | Yes — Merchant of Record | Software subscriptions with license keys and no tax admin |
| **Payhip Free** | $0/mo, 5% + processor | EU/UK VAT handled | Selling from your own Stripe/PayPal account |
| Ko-fi / Gumroad | $0/mo, 5–10% | Gumroad yes, Ko-fi no | Tip jars and simple one-off sales |
| Gumroad | ~10% | They do | Simplest possible setup, one-off products |
| GitHub Sponsors / PayPal.me | $0/mo, 0% or standard fees | No | Recurring community support / buyers who prefer PayPal |

**Polar setup steps**

1. Create a store and a **Wicked Pro** product with two variants: Monthly `$10`, Yearly `$108`.
2. Enable **license keys** on the product. The app already has a Redeem field and a license model.
3. Put the three checkout URLs (monthly, yearly, portal) into `js/config.js` → `CONFIG.checkout`, or set `CHECKOUT_URL_MONTHLY`, `CHECKOUT_URL_YEARLY`, `CHECKOUT_PORTAL_URL` on the server.
4. Add webhooks for `order_created`, `subscription_created`, `subscription_updated` and `subscription_cancelled` so your server can flip a user between Free and Pro and store invoices.
5. Validate license keys server-side with the included free server (`server/`, see `server/README.md`) or Keygen Dev/CE. Never trust a key checked only in the browser.
6. Serve this folder from your account server so `CONFIG.apiBase` becomes `/`, then test with the provider's sandbox/test mode before taking real payments.

The current buttons are deliberate preview stubs — they show a notice instead of charging anyone. Adding a URL in `CONFIG.checkout` or `CONFIG.alternatives` makes that button open the real provider immediately.

Two supported ways to go live, both honest when unconfigured:

- **Static links:** `node tools\set-checkout-urls.js` regenerates `js/checkout-links.js` from `CHECKOUT_URL_MONTHLY`, `CHECKOUT_URL_YEARLY`, `CHECKOUT_PORTAL_URL`, `PAYHIP_URL`, `GUMROAD_URL`, `KOFI_URL`, `SPONSORS_URL` and `PAYPAL_URL`.
- **Server intents:** set the same three `CHECKOUT_*` variables on the API host. `/v1/billing/checkout` and `/v1/billing/portal` return a provider URL, or `billing_unavailable` (503) with no fake checkout.

`POST /v1/billing/webhook` supports two modes: generic HMAC-SHA256 (`BILLING_WEBHOOK_SECRET`, header `x-webhook-signature: sha256=<hex>`) and `BILLING_PROVIDER=payhip`, which verifies Payhip's documented `signature = sha256(PAYHIP_API_KEY)` body field and normalises its events/invoice dates. Both flip plans and store invoices from `type` + `data`. Full contract and setup in [DEPLOY.md](DEPLOY.md) and [PAYHIP.md](PAYHIP.md).

## Going live 3: licensing (free)

The included `server/` is a dependency-free Node.js service that now handles accounts, sessions, billing (generic + Payhip webhooks) and HMAC-signed license keys with the 3-device limit. `node server/test.js` passes 52/52 checks. Enable it with:

```js
// js/config.js
license: { mode: 'remote', url: 'http://127.0.0.1:8787' },
```

Then the Redeem form validates and activates keys through `js/license.js`. Other free options: Keygen Dev (100 active users), Keygen CE (self-hosted) and Keygate (open source). Full details in [FREE-STACK.md](FREE-STACK.md) §4.

## What I still need from you

1. **Checkout URLs / provider account** — Payhip (see [PAYHIP.md](PAYHIP.md)), Polar, Ko-fi or another provider from [FREE-STACK.md](FREE-STACK.md), if you want the preview payment buttons to go live.
2. **A hosted account server** — the code exists (`server/`); it still needs a host with persistent storage and your secrets. The local preview and full-access build need none of this.
3. **Email delivery endpoint** — without one, new accounts are marked verified and no confirmation email is faked; reset tokens are generated but not sent until `MAIL_WEBHOOK_URL` is configured.
4. **A code-signing certificate** — see [SIGNING.md](../WickedImguiMaker/SIGNING.md) and the draft [code signing policy](code-signing-policy.html). Current builds are intentionally unsigned.
5. **Lawyer review** — [LEGAL-REVIEW.md](LEGAL-REVIEW.md) lists every clause that needs checking before publication.
6. ~~**Public hosting** —~~ Done. The ZIP, `latest.json`, and `latest.yml` are published on [GitHub Releases](https://github.com/Tone730/wicked-imgui-releases/releases/tag/v2.2.0). To move hosts later, run `tools\set-update-host.ps1 -BaseUrl <new-url>` and upload the three printed files.
7. ~~**Public update-feed URL** —~~ Done. `CONFIG.updates.baseUrl` and the app build both point at the public GitHub Releases feed for v2.2.0.

## Verification

- REA `capture_browser_scenario` confirmed the rendered accessibility tree for the Dashboard and Downloads pages.
- In-app browser: all 6 pages load with zero console errors; 53/53 internal links resolve; zero failed network requests.
- All 6 dashboard views, login, signup, reset, upgrade, redeem, device sign-out, settings forms, dialogs, menu, FAQ accordion, privacy anchors, invoice rendering and file attach were tested successfully.
- The account + license server passes 52/52 smoke tests (`cd server && node test.js`), including Payhip webhooks.
- Preview mode is unchanged; all live behaviour is opt-in via `apiBase`, checkout links or server env vars.

## One-command publish

```
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\publish.ps1
```

Rebuilds the app with the public feed URL from `CONFIG.updates.baseUrl`, smoke-tests it,
syntax-checks all app/dashboard JS, repackages the portable ZIP, refreshes `js/release.js`
+ `downloads/latest.json` / `latest.yml` with the same public base URL, verifies every hash,
and appends `downloads/build-history.jsonl`. Entirely local: no network, installer, or VCS.
After running it, re-upload the three printed files to the GitHub Release (or bump the tag for
a new version). Options: `-Bump patch|minor|major`, `-Version x.y.z`, `-Notes "..."`,
`-SkipSmoke`, `-Watch` (auto-rebuild on source changes).
