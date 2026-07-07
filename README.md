# Nuvamin

Research-peptide ecommerce storefront. Editorial, minimal, evidence-led —
with a full hosted-gateway checkout backend (order creation, signed payment
webhooks, receipts, admin records).

## Stack

- **Frontend** — static HTML + CSS + vanilla JS. No build step. Self-hosted
  fonts (Space Grotesk, Fraunces, Inter), real product photography (webp).
- **Backend** — Node.js (≥20) + Express in `server/`. Redirect-based hosted
  payment gateway behind a provider adapter (NMI intended; Authorize.Net stub;
  built-in mock for development). **No card data ever touches this codebase**
  — card entry happens on the gateway's PCI-compliant hosted page.
- **Order store** — Upstash Redis in production (`ORDER_STORE=redis`), JSON
  file for local development (`ORDER_STORE=file`).

See [PAYMENTS.md](PAYMENTS.md) for the full payment architecture, order
lifecycle, and NMI go-live checklist.

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Homepage: signature vial hero, featured compounds, verification story |
| `shop.html` | Full catalogue with category filters |
| `product.html?id=<id>` | Compound detail: specs, accordions, quantity + add to cart |
| `about.html` | Standards, process, founder note |
| `journal.html` | Editorial articles |
| `contact.html` | Contact form, FAQ |
| `cart.html` | Cart + delivery details + checkout (→ hosted gateway) |
| `confirmation.html` / `failed.html` | Payment result pages (poll order status) |
| `privacy.html` / `terms.html` / `shipping-returns.html` | Policy pages — **placeholder legal copy, counsel must finalize** |
| `404.html`, `robots.txt`, `sitemap.xml` | Standard site furniture |

Product data lives in `assets/js/products.js` (display) and
`server/catalog.js` (authoritative prices — the server never trusts client
prices); shared behaviour in `assets/js/main.js`; all styling in
`assets/css/style.css`.

## Run locally

```sh
npm install
cp .env.example .env      # defaults: PAYMENT_PROVIDER=mock, ORDER_STORE=file
npm start                 # site + API on http://localhost:3000
```

Add items → Cart → fill delivery details → Checkout. The mock provider shows a
simulated hosted payment page (Pay / Decline / Cancel) so the whole lifecycle —
signed webhook, receipt (printed to console), admin record — works with no real
credentials.

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
   - `PUBLIC_BASE_URL` — e.g. `https://your-domain.com` (drives return + webhook URLs)
   - `PAYMENT_PROVIDER=nmi` + the `NMI_*` credentials (see `.env.example`;
     until then, previews can use `PAYMENT_PROVIDER=mock` — note the mock
     gateway refuses to run in production)
   - `ADMIN_TOKEN` — long random string protecting `/admin/orders`
   - `SMTP_HOST/PORT/USER/PASS`, `RECEIPT_FROM`, `SUPPORT_EMAIL` — real receipts
4. **Connect Google Workspace email + the order sheet** — contact-form
   delivery, customer receipts from the company address, new-order alerts,
   and the Google Sheets order log are all env-driven. Copy-paste setup:
   [GOOGLE-WORKSPACE-SETUP.md](GOOGLE-WORKSPACE-SETUP.md).
5. **Register the webhook** in the NMI portal:
   `https://YOUR_DOMAIN/api/webhook/payment`.
6. **Update the domain** in `sitemap.xml`, `robots.txt` and the `og:image`
   meta tags (currently `https://nuvamin.vercel.app`).

## Before go-live checklist

- [ ] NMI credentials set; test a real transaction in NMI's sandbox
- [ ] Field names in `server/gateway/nmi.js` reconciled with your NMI account
      (marked `▼ TODO (go-live) ▼`)
- [ ] Legal pages (`privacy.html`, `terms.html`, `shipping-returns.html`)
      finalized by counsel — placeholders are marked `[PLACEHOLDER]`
- [ ] VAT/sales-tax treatment decided and reflected in prices/terms
- [ ] `sitemap.xml` / `robots.txt` / OG tags updated to the final domain
- [ ] Strong `ADMIN_TOKEN`; SMTP configured and receipt tested

Palette (Elegant Shadows): `#FFFFFF` · `#B0BEC5` · `#78909C` · `#455A64` · `#000000`
