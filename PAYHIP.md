# Payhip checkout — free-to-start setup

Payhip's **Free Forever** plan has no monthly fee and includes hosted checkout, subscriptions, license keys, webhooks, coupons and unlimited products. Payhip charges 5% per sale plus the payment processor's normal fees.

**Important Payhip rule:** recurring subscriptions are available for **Membership, Bundle, Course and Coaching** products, and only when **Stripe is connected**. `Digital Product` is a one-time sale. A membership gets a direct checkout URL **per pricing plan** (`https://payhip.com/order?link=KEY&pricing_plan=PLAN_ID`) plus a general product page (`https://payhip.com/b/KEY`). Use the per-plan URLs for the dashboard buttons so buyers land on the right plan with no extra click.

## 1. What I need from you

**Current live links (WicksLab, product `i28og`):**

1. Monthly checkout — `https://payhip.com/order?link=i28og&pricing_plan=lNzMad9Oz7` ($25/month)
2. Yearly checkout — `https://payhip.com/order?link=i28og&pricing_plan=Q9zOyg98Gx` ($108/year)
3. Product/manage page — `https://payhip.com/b/i28og`
4. Store — `https://payhip.com/WicksLab`

To find the per-plan URLs: **product → Pricing → Copy URL** in each plan's row.

**Do not paste here (secret):**

- Payhip API key from **Settings → Developer**
- `LICENSE_SECRET`, `ADMIN_TOKEN`, or any webhook secret

Put secrets in `wicked-imgui\.env` on this machine. The server reads it automatically.

## 2. Create the products in Payhip

1. Sign up at <https://payhip.com/> and connect **Stripe** under **Account → Payment Details**. Recurring billing requires Stripe; PayPal alone is not enough. Payhip refuses to add a subscription plan until Stripe is connected. Note: Stripe may show a "not able to accept live payments" warning right after connecting; if it clears after Stripe review, disconnect and reconnect in Payhip.
2. Click **Add new product → Membership** and name it **Wicked Imgui Pro**.
3. Open the product's **Pricing** tab and click **Add Pricing Plan** twice:
   - **Wicked Imgui Pro Monthly** — Subscription, `$25`, **every month**
   - **Wicked Imgui Pro Yearly** — Subscription, `$108`, **every year**
4. In each plan's row click **Copy URL** to get its direct checkout URL.
5. Open the **Publish** tab, set **Published** + **Visible**, and Save. A DRAFT product cannot take payments.

One Membership product with two plans is fine. Note that **posts are not pricing plans** — plan names typed into posts do not enable checkout. The published sales page still has Payhip's placeholder copy ("Membership Title", "Example Text") that should be replaced in the **Store Builder** before promoting the product.

Ask buyers to use the **same email** on Payhip as their Wicked Imgui account so the webhook can match the subscription to the right account. The dashboard also appends `metadata[wicked_email]` to any Payhip checkout URL in live mode, which helps match the account if the buyer uses a different email.

## 3. Put the public links in `.env`

```powershell
cd C:\Users\Wick\wicked-imgui
copy .env.example .env
notepad .env
```

Fill these lines and leave the secrets empty until step 5:

```ini
BILLING_PROVIDER=payhip
CHECKOUT_URL_MONTHLY=https://payhip.com/order?link=KEY&pricing_plan=MONTHLY_PLAN_ID
CHECKOUT_URL_YEARLY=https://payhip.com/order?link=KEY&pricing_plan=YEARLY_PLAN_ID
CHECKOUT_PORTAL_URL=https://payhip.com/b/KEY
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

If the buyer's email does not match a dashboard account and no `metadata[wicked_email]` was passed, the server answers `ignored: 'no_account'`. No account is guessed or created. The dashboard appends `metadata[wicked_email]` to every Payhip checkout URL in live mode, so an account created in the dashboard is matched automatically.

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
