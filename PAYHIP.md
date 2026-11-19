# Payhip checkout — free-to-start setup

Payhip's **Free Forever** plan has no monthly fee and includes hosted checkout, subscriptions, license keys, webhooks, coupons and unlimited products. Payhip charges 5% per sale plus the payment processor's normal fees. This is the recommended first checkout for Wicked Imgui because it can also issue software license keys.

## 1. What I need from you

**Safe to paste here (public links):**

1. Monthly product direct link — `https://payhip.com/buy?link=...`
2. Yearly product direct link — `https://payhip.com/buy?link=...`
3. Optional store/portal URL — your Payhip store or product page

**Do not paste here (secret):**

- Payhip API key from **Settings → Developer**
- `LICENSE_SECRET`, `ADMIN_TOKEN`, or any webhook secret

Put secrets in `wicked-imgui\.env` on this machine. The server reads it automatically.

## 2. Create the products in Payhip

1. Sign up at <https://payhip.com/> and connect Stripe (cards) or PayPal.
2. Create **Wicked Imgui Pro — Monthly**:
   - Price: `$10`
   - Billing: recurring, every month
   - Product type: digital product / software
   - Enable automatic license-key generation if you want Payhip to deliver a key with each sale
3. Create **Wicked Imgui Pro — Yearly**:
   - Price: `$108`
   - Billing: recurring, every year
4. On each product's edit page, copy the product key from the URL (`https://payhip.com/b/KEY`).
5. Build the direct checkout links:
   - `https://payhip.com/buy?link=MONTHLY_KEY`
   - `https://payhip.com/buy?link=YEARLY_KEY`

The dashboard already appends `metadata[wicked_email]=<signed-in email>` to Payhip links in live mode, so the webhook upgrades the correct account even if the buyer types a different email in Payhip.

## 3. Put the public links in `.env`

```powershell
cd C:\Users\Wick\wicked-imgui
copy .env.example .env
notepad .env
```

Fill these lines and leave the secrets empty until step 5:

```ini
BILLING_PROVIDER=payhip
CHECKOUT_URL_MONTHLY=https://payhip.com/buy?link=YOUR_MONTHLY_KEY
CHECKOUT_URL_YEARLY=https://payhip.com/buy?link=YOUR_YEARLY_KEY
CHECKOUT_PORTAL_URL=https://payhip.com/YOUR_STORE
```

Then regenerate the static links:

```powershell
node tools\set-checkout-urls.js
```

That rewrites `js\checkout-links.js`. Refresh the dashboard: the Upgrade buttons now open Payhip instead of showing the preview notice.

**Static-only limitation:** if the dashboard has no account server, payments still work at Payhip, but the dashboard cannot auto-upgrade the account to Pro. You would deliver the license key manually. Full auto-upgrade needs the webhook below.

## 4. Host the account server

For automatic Pro activation, `server\server.js` must be reachable over public HTTPS. Use the included `render.yaml`, `Dockerfile`, or any Node 18+ host. On that host set:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `BIND_HOST` | `0.0.0.0` |
| `BILLING_PROVIDER` | `payhip` |
| `PAYHIP_API_KEY` | your Payhip API key |
| `LICENSE_SECRET` | long random hex |
| `ADMIN_TOKEN` | long random hex |
| `ALLOWED_ORIGINS` | your dashboard origin |
| `COOKIE_SECURE` | `1` |
| `COOKIE_SAMESITE` | `None` if the site and API are on different domains |
| `DATA_FILE`, `ACCOUNTS_FILE` | persistent paths |

`/health` must return `200` before configuring the webhook.

## 5. Configure the Payhip webhook

In Payhip: **Settings → Developer**:

- Webhook endpoint: `https://YOUR_API_HOST/v1/billing/webhook`
- Events: `paid`, `refunded`, `subscription.created`, `subscription.deleted`
- Copy the API key into `PAYHIP_API_KEY` in `.env` locally, or into the host's secret store.

Payhip signs webhooks with `signature = sha256(API key)` in the JSON body. The server verifies that in constant time. It never trusts an unsigned or mismatched body.

What happens:

| Payhip event | Dashboard result |
|---|---|
| `paid`, `subscription.created` | Pro turns on; invoice appears under Billing |
| `subscription.deleted` | Pro stays until the paid period ends, then stops renewing |
| `refunded` | Account returns to Free |

If the buyer's email does not match a dashboard account and no `metadata[wicked_email]` was passed, the server answers `ignored: 'no_account'`. No account is guessed or created.

## 6. Verify locally

```powershell
cd C:\Users\Wick\wicked-imgui
node --check server\server.js
node server\test.js
node --check tools\set-checkout-urls.js
node --check js\dashboard.js
```

`server\test.js` includes a Payhip-mode instance with signed `paid`, `subscription.deleted`, and `refunded` events.

## 7. Optional alternative providers

If Payhip is unavailable in your country, the same `CHECKOUT_URL_MONTHLY` / `CHECKOUT_URL_YEARLY` fields accept Polar, Gumroad, or Ko-fi links. Polar Starter is the closest substitute: free, 5% + 50¢, hosted checkout links, subscriptions, webhooks and merchant-of-record tax handling. Keep `BILLING_PROVIDER` as `generic` for those unless a provider-specific adapter is added.

No Lemon Squeezy.
