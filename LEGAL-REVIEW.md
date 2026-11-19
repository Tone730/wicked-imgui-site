# Legal review checklist

**This is a checklist, not legal advice.** The text in `privacy.html` was written in good faith for a US/Florida individual developer, but it has not been reviewed by a lawyer. Do not treat it as legally complete until each item below is checked by a qualified professional.

## Facts the current copy asserts

| Item | Current value / location |
|---|---|
| Operator | Wicked Imgui, operated by an individual developer / sole developer (`js/config.js` → `legal.operator`, `privacy.html` §1) |
| Governing law | State of Florida, United States (`privacy.html` §25, `js/config.js` → `legal.state`) |
| Support / account email | `wick777@engineer.com` |
| Billing / refund email | `wickz77r@gmail.com` |
| Legal / privacy email | `leakz15@programmer.net` |
| Plans | Free $0; Pro $25/month or $108/year (`js/config.js`) |
| Refund statement | Final sale, no discretionary refunds (`privacy.html` §1B and §14); statutory rights and provider chargebacks preserved |
| Confidentiality | NDA in `privacy.html` §1A, accepted at signup |
| Legal versioning | `termsVersion` / `privacyVersion` sent by signup and stored with `acceptedAt` on each account |
| Credits | Access credits (Pro time or a limited key) and AI credits (server-mediated AI actions only) |
| Admin logging | All admin actions appended to `AUDIT_FILE`; no passwords, tokens or full keys logged |
| Payment processors | Payhip (primary), Polar, Gumroad, Ko-fi, GitHub Sponsors, PayPal.me — described as merchant-of-record or not, per provider |
| AI providers | Wicked Local (offline), Google Gemini, AiHubMix, OpenRouter, NVIDIA, Ollama, Anthropic Claude, OpenAI — user supplies their own keys. The full-access build never spends hosted AI credits. |
| Downloads | Portable ZIP with published SHA-256/SHA-512; no silent install |
| Children | Not directed at under-13s (`privacy.html` §26) |

## Reviewer checklist

- [ ] **Entity identity.** Is "individual developer / sole developer" accurate for tax and contracting? If a US LLC or trade name is used, update `js/config.js` → `legal.operator`, `privacy.html`, `invoice.html` and the store pages.
- [ ] **Florida jurisdiction.** Confirm that Florida law/venue is appropriate and that the clause is enforceable for customers in the EU/UK, California and elsewhere.
- [ ] **Terms formation.** Does the signup checkbox (`signup.html`) clearly accept Terms (including the NDA and final-sale clause) and Privacy? Confirm `js/config.js` → `legal.termsVersion` / `legal.privacyVersion` match the server's `TERMS_VERSION` / `PRIVACY_VERSION`, are bumped together with `legal.updated` when text changes, and are stored with `acceptedAt` on each account.
- [ ] **Final sale and NDA.** Lawyer-check the final-sale/no-refund clause (`privacy.html` §1B), the NDA (§1A), the statutory-rights and chargeback carve-outs, cancellation timing, renewal disclosure, price-change notice and "Pro stays until end of paid period" wording in `privacy.html` §14 and `faq.html`. Confirm the wording is enforceable in Florida and in customer jurisdictions (especially EU/UK and California).
- [ ] **Merchant of record.** Confirm each enabled provider's actual tax/refund responsibility. Do not claim a provider handles VAT if it does not. Remove providers that are not configured.
- [ ] **Data inventory.** Verify the list in `privacy.html` §19–22 matches what the account server actually stores: email, name, scrypt hash, session tokens, devices, invoices, subscription state, license keys, legal acceptance versions, access/AI credit balances and ledger entries, pending grants, manual sales and the audit log. See `server/server.js` and `server/README.md`.
- [ ] **Retention and deletion.** `DELETE /v1/account` removes user, sessions and tokens. Define a concrete retention period for invoices (tax records) and license keys, and confirm it matches `privacy.html`.
- [ ] **Email / reset flow.** If `MAIL_WEBHOOK_URL` is added, name the email processor and add it to the privacy policy. Until then, keep the honest `delivery: 'not_configured'` wording.
- [ ] **AI disclosure.** Confirm external AI providers receive only what the user sends with their own key, and that the offline provider makes no network calls. Confirm the AI-credit wording is honest: only Wicked-hosted, server-mediated actions spend AI credits (`POST /v1/ai/usage`); the local full-access build uses the user's own keys and never does. See `WickedImguiMaker/app/src/main/account.cjs`, the renderer provider code and `js/dashboard.js` → Credits.
- [ ] **Telemetry.** Confirm there is no hidden analytics. If analytics are added later, update §19 and add consent where required.
- [ ] **California / children.** Review §27 and the California section against current law and actual practice.
- [ ] **Contact emails.** Confirm all three inboxes are controlled by you and monitored. Update `js/config.js` → `contact` and every `data-contact` link together.
- [ ] **Code signing policy.** Have `code-signing-policy.html` reviewed before publishing it as a binding commitment. Do not claim signed builds until `WickedImguiMaker/sign.ps1` has actually been used on a published EXE.
- [ ] **Copyright / license.** The app is `UNLICENSED`. Decide whether to publish source under a license, and reconcile that choice with `FREE-STACK.md` §3 and any SignPath application.
- [ ] **Accessibility of notices.** Confirm privacy/terms are reachable from login, signup, dashboard and footer on mobile.

## Sign-off

| Field | Value |
|---|---|
| Reviewer | ______________________________ |
| Qualification / jurisdiction | ______________________________ |
| Date | ______________________________ |
| Version reviewed (`legal.updated`) | ______________________________ |
| Changes required | ______________________________ |
| Approved for publication | ☐ Yes ☐ No |
