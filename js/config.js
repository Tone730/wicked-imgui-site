// Site settings — the only file you need to touch to go live.
import { CHECKOUT_LINKS } from './checkout-links.js';

export const CONFIG = {
  // Where the account server is. Empty = preview mode (accounts stored in this browser only).
  // When the Wicked Imgui account server (../server) hosts this folder it sets this to '/' by itself.
  apiBase: '',
  // Release metadata now lives in js/release.js — the Downloads page reads from there.
  version: '2.9.1',
  releaseDate: '2026-11-19',
  // ---------------------------------------------------------------- updates
  // Self-hosted generic update feed (free). tools\attach-release.ps1 writes both
  // manifests into downloads\ on every build. The app reads latest.yml through
  // electron-updater; this dashboard reads latest.json for the human-friendly UI.
  // Change baseUrl to your public host before going live; keep it here and in the
  // app's update config identical.
  updates: {
    channel: 'stable',
    feedUrl: 'downloads/latest.json',
    electronFeedUrl: 'downloads/latest.yml',
    baseUrl: 'https://github.com/Tone730/wicked-imgui-releases/releases/latest/download/',
    checkOnLaunch: true,
  },
  pro: { price: '$25', period: 'per month' },
  // a year paid at once: $108 vs $25 x 12 = $300, so 64% cheaper
  proYearly: { price: '$108', period: 'per year', perMonth: '$9', save: '64%' },
  free: { price: '$0', period: 'forever' },
  maxDevices: 3,
  // One access credit buys this many days of Pro. Admin keys can set their own seat limits.
  credits: { accessDays: 30, maxKeyDevices: 5 },
  // Wicked AI (Pro): the AI providers you can pick in the app (each needs the user's own API key).
  // free: the ones with free models (or, for Ollama, running on the user's PC)
  ai: { providers: ['Wicked Local (offline)', 'Google Gemini', 'AiHubMix', 'OpenRouter', 'NVIDIA', 'Ollama', 'Anthropic Claude', 'OpenAI'], free: ['Wicked Local (offline)', 'Google Gemini', 'AiHubMix', 'OpenRouter', 'NVIDIA', 'Ollama'] },

  // ---------------------------------------------------------------- payments (free-first)
  // Lemon Squeezy is CLOSED to new signups and shuts down 31 Mar 2027 — do not use it.
  // Every provider below has a $0/month entry plan. Paste your checkout URLs to make the
  // buttons live; leave them empty and the buttons stay in preview mode.
  checkout: {
    provider: 'Payhip',
    note: 'Free forever · 5% + your processor · cards/PayPal · subscriptions and license keys',
    monthly: CHECKOUT_LINKS.monthly, // e.g. https://payhip.com/order?link=KEY&pricing_plan=MONTHLY
    yearly: CHECKOUT_LINKS.yearly,   // e.g. https://payhip.com/order?link=KEY&pricing_plan=YEARLY
    portal: CHECKOUT_LINKS.portal,   // customer portal / manage subscription URL
  },
  // Extra ways to pay or support the project. Shown on Billing; empty URLs are hidden.
  alternatives: [
    { id: 'payhip',    name: 'Payhip',           note: 'Free plan · 5% + your processor · EU/UK VAT handled', url: CHECKOUT_LINKS.alternatives.payhip },
    { id: 'gumroad',   name: 'Gumroad',          note: 'No monthly fee · 10% + 50¢ · handles tax',          url: CHECKOUT_LINKS.alternatives.gumroad },
    { id: 'kofi',      name: 'Ko-fi',            note: 'Tips 0% · shop 5% · paid straight to your account', url: CHECKOUT_LINKS.alternatives.kofi },
    { id: 'sponsors',  name: 'GitHub Sponsors',  note: '0% platform fee · recurring support',              url: CHECKOUT_LINKS.alternatives.sponsors },
    { id: 'paypal',    name: 'PayPal.me',        note: 'No monthly fee · familiar to buyers',              url: CHECKOUT_LINKS.alternatives.paypal },
  ],
  // Server-side env vars to set when you go live (see FREE-STACK.md):
  //   CHECKOUT_URL_MONTHLY, CHECKOUT_URL_YEARLY, CHECKOUT_PORTAL_URL

  // ---------------------------------------------------------------- download hosting
  // Free places to publish a portable build. These are informational links (their setup
  // docs); once a release URL is set in js/release.js it becomes the download above.
  hosting: [
    { id: 'github', name: 'GitHub Releases', note: 'No storage or bandwidth quota · 2 GiB per file · stable URLs', url: 'https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases' },
    { id: 'r2',     name: 'Cloudflare R2',   note: '10 GB storage + 1M reads free · zero egress fees',          url: 'https://developers.cloudflare.com/r2/' },
    { id: 'itch',   name: 'itch.io',          note: 'Free to host · indie-friendly audience',                     url: 'https://itch.io/' },
  ],

  // ---------------------------------------------------------------- licensing (free option)
  // 'preview' = browser-only demo. 'remote' = use the free self-hosted license server in ../server.
  license: {
    mode: 'preview',
    url: 'http://127.0.0.1:8787',   // base URL of server/server.js
  },

  // Contact addresses. js/contact.js copies these into every [data-contact] link on the
  // static pages, so this is the one place to edit if an inbox changes.
  contact: {
    legal:   'leakz15@programmer.net', // legal notices, privacy and data requests
    support: 'wick777@engineer.com',   // technical help and account issues
    billing: 'wickz77r@gmail.com',     // payments, invoices and refunds
  },
  // Kept for the interaction code in dashboard.js / auth.js.
  supportEmail: 'wick777@engineer.com',
  billingEmail: 'wickz77r@gmail.com',

  // Shown on privacy.html and in the account server.
  legal: {
    country: 'United States',
    state: 'Florida',
    operator: 'Wicked Imgui, operated by an individual developer',
    email: 'leakz15@programmer.net',
    updated: '2026-11-19',   // change when you change the terms or the privacy policy
    // Sent by signup and stored with the acceptance timestamp by the account server.
    termsVersion: '2026-11-19',
    privacyVersion: '2026-11-19',
  },
};
