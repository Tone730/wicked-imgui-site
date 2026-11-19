# Wicked Imgui — deployment runbook

Everything here is **configuration and code**. It does not pretend accounts, payments or email are live: with no server URL and no checkout URLs the dashboard remains in the explicit browser-only preview (`test / test` = Pro, `free / free` = Free).

The release ZIP and update feed are already published on [GitHub Releases](https://github.com/Tone730/wicked-imgui-releases/releases/tag/v2.2.1). This document covers the **account server**, **static hosting**, **payments** and the remaining operational pieces.

---

## Shape A — one origin (simplest, recommended)

`server/server.js` serves both the JSON API and this folder's static files. When it serves `js/config.js`, it replaces `apiBase: ''` with `apiBase: '/'`, so the browser calls the same origin and cookies work with the default `SameSite=Lax`.

```powershell
cd C:\Users\Wick\wicked-imgui
$env:LICENSE_SECRET = (node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
$env:ADMIN_TOKEN   = (node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
$env:BIND_HOST     = '0.0.0.0'      # only when exposing it on the network
node server/server.js
```

Open `http://127.0.0.1:8787/health`, then the dashboard at `http://127.0.0.1:8787/`. Sign up with a real email/password — the demo accounts only exist in preview mode.

For the public internet, put it behind Caddy/nginx/TLS and use `NODE_ENV=production` (sets `Secure` cookies and binds `0.0.0.0`). A [Dockerfile](Dockerfile) and [Procfile](Procfile) are included for hosts that expect them.

## Shape B — static site + separate API

Use this when the dashboard is on GitHub Pages / Cloudflare Pages and the API is on Render/Railway.

1. Push this folder to a repo with Pages enabled. The included [`.github/workflows/pages.yml`](.github/workflows/pages.yml) builds and deploys `main` automatically.
2. In GitHub **Settings → Pages → Repository variables**, set `API_BASE` to your API origin (for example `https://wicked-imgui.onrender.com`). Leave it unset to deploy the preview build.
3. Deploy `server/` with [`render.yaml`](render.yaml) (Render Blueprint) or any Node 18+ host running `node server/server.js`.
4. On the API host set:

| Variable | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | Secure cookies, `0.0.0.0` bind |
| `BIND_HOST` | `0.0.0.0` | Hosts that require explicit binding |
| `LICENSE_SECRET` | long random hex | Signs license keys and webhook data |
| `ADMIN_TOKEN` | long random hex | Guards `/issue` and `/stats` |
| `ALLOWED_ORIGINS` | `https://OWNER.github.io` (comma-separated if more) | Only these origins may use credentialed requests |
| `COOKIE_SECURE` | `1` | Required for cross-site cookies |
| `COOKIE_SAMESITE` | `None` | `Lax` is intentionally stricter but blocks cross-site fetch |
| `ACCOUNTS_FILE`, `DATA_FILE` | persistent paths | Session/user and key stores |
| `CHECKOUT_URL_MONTHLY`, `CHECKOUT_URL_YEARLY`, `CHECKOUT_PORTAL_URL` | Payhip/Polar links | Enable server-side checkout/portal intents |
| `BILLING_PROVIDER` | `payhip` or `generic` | Chooses webhook verification and payload normalisation |
| `PAYHIP_API_KEY` | Payhip API key | Verifies Payhip webhook signatures; keep it secret |

Without a persistent disk, accounts and keys are lost on redeploy — that is a limitation of the free plan, not of the code. Render disks are a paid add-on; if you do not add one, say so plainly on your support page rather than implying accounts are permanent.

`PUBLIC_API_BASE` is only needed when the API also serves the static files but the browser should call an external origin instead. The Pages workflow normally handles the URL at build time.

---

## Accounts and licensing

The server implements exactly the endpoints `js/auth.js` already calls: register, login, logout, logout-all, password reset/confirm, email verification, session, account read/update/delete, password change, device revocation, redeem, releases, status, checkout/portal and the webhook. The response shape matches `js/auth-preview.js`, so no live-only UI branches were needed.

- Passwords are salted and hashed with `scrypt` — never stored in plaintext.
- Sessions are opaque random tokens in an `HttpOnly` cookie, stored server-side with a 30-day expiry (`SESSION_DAYS`).
- `GET /v1/auth/session` returns `{user:null}` when signed out; the dashboard redirects to `login.html`.
- Redeem checks the HMAC signature, expiry and previous owner of a `SWI-*` key before granting Pro.
- Email delivery is **not built in**. Without `MAIL_WEBHOOK_URL`, new accounts are marked verified so the UI never claims it sent a confirmation link. Password-reset still answers generically but sends nothing. With a webhook configured, reset/verification tokens are generated and passed to it; if a legacy account is still unverified while no webhook is configured, resend reports `delivery: 'not_configured'` honestly. Set `DEV_MAIL_TOKENS=1` locally only to print tokens to the console while testing.

Tests: `cd server && node test.js` — 52 checks covering the original license service, accounts, sessions, CORS/CSRF, static config injection, checkout states, generic + Payhip signed webhooks, invoice creation, subscription cancellation and refunds.

---

## Payments

Two independent, deliberate preview-states exist:

1. **Client links** — direct provider URLs in `js/checkout-links.js`. Copy `.env.example` to `.env`, fill in the URLs, then regenerate:
   ```powershell
   copy .env.example .env
   notepad .env          # CHECKOUT_URL_MONTHLY / CHECKOUT_URL_YEARLY / CHECKOUT_PORTAL_URL
   node tools\set-checkout-urls.js
   ```
   The generator reads `.env` (real environment variables still win). Every value left empty stays hidden / preview-only. No Lemon Squeezy anywhere.
2. **Server intents** — set `CHECKOUT_URL_MONTHLY`, `CHECKOUT_URL_YEARLY`, `CHECKOUT_PORTAL_URL` on the API host. `POST /v1/billing/checkout {interval}` and `/v1/billing/portal` then return `{url}`. With no URL they return `billing_unavailable` (503) instead of a fake checkout.

**Payhip is the recommended first provider.** Full setup is in [PAYHIP.md](PAYHIP.md): create two **Membership** products (monthly/yearly, Stripe connected), paste their two product-page URLs into `.env`, set `BILLING_PROVIDER=payhip` and `PAYHIP_API_KEY` on the API host, then subscribe to `paid`, `refunded`, `subscription.created` and `subscription.deleted` webhooks. Membership products have no direct checkout links, so buyers select the plan on the Payhip product page and should use the same email as their Wicked Imgui account.

### Webhook verification

`POST /v1/billing/webhook` supports two modes:

- `BILLING_PROVIDER=generic` (default): HMAC-SHA256 of the raw body in `x-webhook-signature: sha256=<hex>`, keyed by `BILLING_WEBHOOK_SECRET`.
- `BILLING_PROVIDER=payhip`: Payhip's documented `signature = sha256(PAYHIP_API_KEY)` field inside the JSON body, compared in constant time. Payhip event names, unix timestamps and `price` cents are normalised before the account is updated.

Events are mapped by type, not by vendor name:

- `payment.succeeded` / `paid` / `*active` / `*created` / `*renewed` → Pro + invoice
- `*canceled` / `subscription.deleted` / `*expired` / `past_due` → Pro until `endsAt`, then no renewal
- `*refunded` / `*chargeback` → Free

The generic payload can be `{type, data:{email, interval, amount, invoiceId, description}}` or provider-style `{type, data:{object:{...}}}`. `amount` as a number is treated as minor units (`1000` → `$10.00`). Test the generic mode with:

```powershell
$body = '{"type":"payment.succeeded","data":{"email":"buyer@example.com","interval":"month","amount":1000,"invoiceId":"INV-TEST"}}'
$sig  = node -e "const c=require('node:crypto');process.stdout.write(c.createHmac('sha256','YOUR_SECRET').update(process.argv[1]).digest('hex'))" $body
# POST $body to /v1/billing/webhook with header: x-webhook-signature: sha256=$sig
```

Point your provider's webhook at `https://YOUR_API/v1/billing/webhook`, keep secrets only on the server or in `.env` (which is gitignored), and verify that `invoice.html?id=...` renders after a test payment. Configure the provider's sandbox first where available.

---

## Verification before you announce anything live

```powershell
cd C:\Users\Wick\wicked-imgui
node --check server\server.js
node --check tools\set-api-host.js
node --check tools\set-checkout-urls.js
node server\test.js
cd C:\Users\Wick\WickedImguiMaker
python validate.py
node test-updater.js
```

Then in the browser: fresh profile → preview mode works; live origin → signup, login, logout, reset (shows "not configured" unless mail is wired), redeem, billing buttons, invoice rendering, and mobile menu. Check that no page says "Say", no fake checkout happens, and the Discord link is still `https://discord.gg/YwNQdu5pyh`.

---

## Remaining external inputs

- Payment provider account(s) and their real URLs + webhook secret.
- A host with persistent storage if you want accounts to survive redeploys.
- An email delivery endpoint if you want reset/verification links to actually arrive.
- A code-signing certificate (see [SIGNING.md](../WickedImguiMaker/SIGNING.md)) and a lawyer's review (see [LEGAL-REVIEW.md](LEGAL-REVIEW.md)).

None of these are faked by this repository.
