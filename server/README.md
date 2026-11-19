# Wicked Imgui — free account + license server

A small, dependency-free Node.js service with two jobs: the original signed-license API (HMAC keys, 3-device limit) and the account API that `js/auth.js` already expects (scrypt passwords, HttpOnly sessions, profile/devices, billing intents and a signed webhook). It also serves the static dashboard when you want one origin. See `../DEPLOY.md` for the full runbook.

## Run locally

```
cd C:\Users\Wick\wicked-imgui\server
npm start
```

→ `http://127.0.0.1:8787/health`

Test it with `npm test` (spawns its own server on port 8788, uses a temporary data file, and cleans up).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | Listening port |
| `BIND_HOST` | `127.0.0.1` (prod: `0.0.0.0`) | Bind address |
| `LICENSE_SECRET` | dev default | HMAC secret for keys and webhook data. **Set a long random string in production.** |
| `ADMIN_TOKEN` | empty | If set, `/issue` and `/stats` require `Authorization: Bearer <token>` |
| `MAX_DEVICES` | `3` | Device slots per key |
| `DATA_FILE` | `data/licenses.json` | License JSON store |
| `ACCOUNTS_FILE` | `data/accounts.json` | Users, sessions and token JSON store |
| `SITE_DIR` | dashboard root | Static folder served by this process |
| `PUBLIC_API_BASE` | empty | Override the injected `apiBase` in `/js/config.js` |
| `ALLOWED_ORIGINS` | empty | Comma-separated origins allowed for credentialed CORS (loopback always allowed) |
| `COOKIE_SECURE` | prod: on | Adds `Secure` to the session cookie |
| `COOKIE_SAMESITE` | `Lax` | Use `None` **with** `COOKIE_SECURE=1` for a split static/API deploy |
| `SESSION_DAYS` | `30` | Session lifetime |
| `MAIL_WEBHOOK_URL` | empty | Generic JSON sink for reset/verification tokens. Without it, new accounts are marked verified and no fake verification email is implied; legacy unverified accounts get `delivery: 'not_configured'` |
| `DEV_MAIL_TOKENS` | off | Print tokens to console for local testing only |
| `CHECKOUT_URL_MONTHLY` / `CHECKOUT_URL_YEARLY` / `CHECKOUT_PORTAL_URL` | empty | Enable `/v1/billing/checkout` and `/portal`; otherwise 503 `billing_unavailable` |
| `BILLING_PROVIDER` | `generic` | `generic` = HMAC header webhook; `payhip` = Payhip body signature + event normalisation |
| `BILLING_WEBHOOK_SECRET` | empty | HMAC secret for generic `POST /v1/billing/webhook` |
| `PAYHIP_API_KEY` | empty | Payhip API key; its SHA-256 is compared with the webhook `signature` field |

The server also reads `../.env` (copy `.env.example` to `.env`) so secrets never need to live in source or shell history. Real environment variables override `.env`.

Generate a secret: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`

## API

| Method | Path | Body | Notes |
|---|---|---|---|
| GET | `/health` | — | `{ ok, service, devSecret }` |
| POST | `/issue` | `{ email, plan, days }` | Needs admin token. Returns `{ key, plan, expires, maxDevices }` |
| POST | `/validate` | `{ key }` | `{ valid, plan, email, expires, used, max }` |
| POST | `/activate` | `{ key, device, name, os }` | Adds a computer; 409 when full |
| POST | `/deactivate` | `{ key, device }` | Frees a slot |
| GET | `/stats` | — | Needs admin token; also counts accounts/sessions |

Account endpoints (cookie-based session; exact shapes in `../js/auth.js`):

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/auth/register`, `/login`, `/logout`, `/logout-all` | scrypt hash, HttpOnly `swi_session` cookie |
| POST | `/v1/auth/password-reset`, `/password-reset/confirm` | Always 200 for reset; tokens only sent if `MAIL_WEBHOOK_URL` is set |
| POST | `/v1/auth/verify-email`, `/resend-verification` | Same token store; resend returns `already_verified` when no mail service is configured |
| GET | `/v1/auth/session` | `{user:null}` when signed out |
| GET/PATCH/DELETE | `/v1/account` | Read/update/delete (delete checks password) |
| POST | `/v1/account/password`, `/v1/account/redeem` | Change password; redeem a signed key |
| DELETE | `/v1/devices/:id` | Sign one computer out |
| POST | `/v1/billing/checkout`, `/billing/portal` | `{url}` only when configured |
| POST | `/v1/billing/webhook` | HMAC-SHA256 `x-webhook-signature`, plan + invoice updates |

Keys look like `SWI-PRO-XXXXXXXX-XXXXXXXX-XXXXXXXX-HMACSIG`. The signature covers email, plan, expiry and nonce, so a key cannot be forged without `LICENSE_SECRET`.

## Connect the dashboard

In `js/config.js`:

```js
license: {
  mode: 'remote',
  url: 'http://127.0.0.1:8787',
},
```

The Redeem form will then call `/validate` and `/activate` before granting Pro. `js/license.js` is the browser client. In `preview` mode nothing is sent.

For accounts, leave `apiBase: ''` when opening the folder directly. If you run `node server/server.js` from the dashboard root, the server serves the static files and rewrites `/js/config.js` to `apiBase: '/'`, so login/signup use the same origin with `SameSite=Lax`. For split hosting, use `node ../tools/set-api-host.js --api https://your-api` and the cookie/CORS settings above.

## Deploying

The server needs somewhere to persist `licenses.json`. Options:

- **Render / Railway free tier** — easiest; set the env vars in the dashboard. Free tiers may sleep, so allow a few seconds for the first request.
- **Any cheap VPS** ($3–5/mo) — run `node server.js` behind nginx/Caddy with HTTPS. Best reliability.
- **Oracle Cloud Always Free ARM VM** — genuinely free, no time limit, but more setup.
- **Cloudflare Workers** — the free tier is generous, but this file uses `node:http.listen()`, which Workers does not support. Port the four handlers to a `fetch()` handler, or use Keygen CE instead (below).

If you expose it publicly: set `LICENSE_SECRET` and `ADMIN_TOKEN`, put it behind HTTPS, and set `ALLOWED_ORIGINS` explicitly. CORS is no longer `*` — credentialed requests require an allowed origin, and state-changing requests also check `Origin` against that list. See `../DEPLOY.md` for Render/Pages/Docker specifics.

## Free alternatives

- **Keygen Dev tier** — free cloud API, up to 100 active licensed users and 10 releases. Good if you do not want to run a server. https://keygen.sh/pricing/
- **Keygen CE** — free to self-host, full licensing API. https://github.com/keygen-sh/keygen-api
- **Keygate** — open-source, self-hosted alternative with subscriptions, trials and Stripe support. https://github.com/tabloy/keygate
