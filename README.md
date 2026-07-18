# Nuvamin

Research-peptide ecommerce storefront. Editorial, minimal, evidence-led —
with an invoice-first order workflow, manual payment verification, designed
transactional email and a Google Sheets fulfilment board.

## Stack

- **Frontend** — static HTML + CSS + vanilla JS. No build step. Self-hosted
  fonts (Space Grotesk, Fraunces, Inter), real product photography (webp).
- **Backend** — Node.js (≥20) + Express in `server/`. The active flow creates
  an awaiting-payment order and emails configurable Zelle, Cash App, PayPal
  and crypto instructions. Stripe Checkout remains in the codebase behind
  `CHECKOUT_MODE=stripe`, but is inactive by default.
- **Order store** — Upstash Redis in production (`ORDER_STORE=redis`), JSON
  file for local development (`ORDER_STORE=file`).

See [PAYMENTS.md](PAYMENTS.md) for the full payment architecture, order
lifecycle, and Stripe go-live checklist.

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Homepage: signature vial hero, featured compounds, verification story |
| `shop.html` | Full catalogue with category filters |
| `product.html?id=<id>` | Compound detail: specs, accordions, quantity + add to cart |
| `about.html` | Standards, process, founder note |
| `contact.html` | Contact form, FAQ |
| `cart.html` | Cart + delivery details + **Place order** |
| `order-placed.html` | Awaiting-payment result page |
| `confirmation.html` / `failed.html` | Paid confirmation / retained Stripe failure page |
| `privacy.html` / `terms.html` / `shipping-returns.html` | Privacy, terms of sale, shipping and returns policies |
| `404.html`, `robots.txt`, `sitemap.xml` | Standard site furniture |

Product data lives in `assets/js/products.js` (display) and
`server/catalog.js` (authoritative prices — the server never trusts client
prices); shared behaviour in `assets/js/main.js`; all styling in
`assets/css/style.css`.

## Run locally

```sh
npm install
cp .env.example .env      # defaults: CHECKOUT_MODE=invoice, ORDER_STORE=file
npm start                 # site + API on http://localhost:3000
```

Add items → Cart → fill delivery details → Place order. In local development,
emails and the Sheet row print to the console when those integrations are not
configured. Stripe/mock testing remains available by setting
`CHECKOUT_MODE=stripe` and `PAYMENT_PROVIDER=mock`.

## Deploy on Vercel (production setup)

The repo is pre-wired to run **entirely on Vercel**: static pages on the CDN,
the Express API as a serverless function (`api/index.js` + `vercel.json`).

1. **Import the repo** into Vercel (framework preset: *Other*). `vercel.json`
   already routes `/api/*`, `/checkout/*`, `/admin/*` to the function and
   serves everything else statically. Server code, order data and configs are
   never exposed as static files.
2. **Add the Upstash Redis integration** (Vercel → your project → *Storage* →
   *Upstash Redis*, free tier). This injects `UPSTASH_REDIS_REST_URL` /
   `UPSTASH_REDIS_REST_TOKEN` and the app automatically uses Redis for orders.
   (Without it the API refuses to boot on Vercel — the serverless filesystem
   can't persist orders.)
3. **Set environment variables** (Vercel → *Settings* → *Environment Variables*):
   - `PUBLIC_BASE_URL` — e.g. `https://your-domain.com`
   - `CHECKOUT_MODE=invoice` (the default)
   - add manual-payment destination variables later; see `.env.example`
   - `ADMIN_TOKEN` — long random string protecting `/admin/orders`
   - `SMTP_HOST/PORT/USER/PASS`, `RECEIPT_FROM`, `SUPPORT_EMAIL` — real receipts
4. **Connect Google Workspace email + the order sheet** — contact-form
   delivery, customer receipts from the company address, new-order alerts,
   and the Google Sheets order log are all env-driven. Copy-paste setup:
   [GOOGLE-WORKSPACE-SETUP.md](GOOGLE-WORKSPACE-SETUP.md).
5. **Update the Orders Apps Script** — paste `google/nuvamin-orders.gs`, run
   `setup()`, and deploy a new version. Invoice ordering fails closed until the
   server verifies this payment-aware script is active.
6. **Domain** — `sitemap.xml`, `robots.txt` and the `og:image` meta tags are
   set to the production domain `https://nuvamin.bio`. Remember to set
   `PUBLIC_BASE_URL=https://nuvamin.bio` in Vercel so payment return and
   webhook URLs use it too.

## Before go-live checklist

- [ ] Latest Orders Apps Script deployed and `setup()` run
- [ ] Payment-instructions email tested (with or without destinations configured)
- [ ] Payment confirmed checkbox sends one confirmation email
- [ ] Carrier + tracking + Fulfilled sends the Track Package email
- [ ] Legal pages (`privacy.html`, `terms.html`, `shipping-returns.html`)
      reviewed and finalized by counsel
- [ ] VAT/sales-tax treatment decided and reflected in prices/terms
- [ ] `sitemap.xml` / `robots.txt` / OG tags updated to the final domain
- [ ] Strong `ADMIN_TOKEN`; SMTP configured and receipt tested

Palette (Elegant Shadows): `#FFFFFF` · `#B0BEC5` · `#78909C` · `#455A64` · `#000000`
