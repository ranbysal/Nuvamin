# Nuvamin — Checkout & Payments

A **redirect-based Stripe Checkout** integration. Card data is entered only on
Stripe's hosted page — **this site never sees, handles, or stores card
details**. A mock adapter remains available strictly for local development and
non-production previews.

## Architecture

```
Browser (cart.html)
   │  Google sign-in + POST /api/research-verification
   │  POST /api/checkout   { cart, shipping address, signed verification token }
   ▼
Server  ── prices order from server-side catalog (client price is never trusted)
        ── verifies the HttpOnly Google session + matching acknowledgement
        ── validates email + shipping address server-side
        ── creates a PENDING order   (backend order creation BEFORE payment)
        ── gateway.createCheckoutSession(order)   →  { redirectUrl }
   │  302 redirect
   ▼
Stripe Checkout (or the built-in mock outside production)
   │  customer pays  →  gateway redirects back  +  sends signed webhook
   ├──────────────► GET /checkout/success → confirmation.html (polls status)
   ├──────────────► GET /checkout/cancel  → failed.html (retry)
   └──POST /api/webhook/payment  (SIGNED — the source of truth) ─► mark PAID,
                                                                   email receipt
```

### Order status model

`pending → paid | failed | cancelled | refunded`

Transitions are **enforced** (`server/orders.js`): `pending` can move to
`paid/failed/cancelled`; `failed` and `cancelled` can still move to `paid`
(a retry or a late authoritative webhook); `paid` only ever moves to
`refunded`. A replayed or out-of-order webhook can never downgrade a paid
order, and the receipt sends exactly once — on the transition that applied.

The **webhook is authoritative** for `paid`. The browser return URL only shows a
confirmation page that polls order status — a customer who closes the tab still
gets marked paid by the webhook, and the receipt still sends.

### Order storage

`ORDER_STORE=file` (default locally) keeps orders in `server/data/orders.json`.
`ORDER_STORE=redis` uses Upstash Redis (`UPSTASH_REDIS_REST_URL/TOKEN` — the
Vercel Upstash integration injects them, and the store then defaults to redis
automatically). On Vercel the file store refuses to boot: the serverless
filesystem is ephemeral. The public `GET /api/orders/:id` endpoint returns a
safe projection only — never the shipping address or internal event log.

## Files

| Path | Purpose |
| --- | --- |
| `server/app.js` | Express app: routes, validation, rate limiting, static hosting (allowlisted) |
| `server/config.js` | Env loader + typed config (all credentials via env) |
| `server/auth.js` | Google ID-token verification, signed sessions, researcher tokens |
| `server/catalog.js` | Authoritative server-side prices |
| `server/orders.js` | Order model + enforced status lifecycle + file/redis store drivers |
| `server/sheets.js` | Google Sheets order log (posts each paid order to the client's sheet) |
| `server/views.js` | Server-rendered markup for the mock hosted payment page |
| `api/index.js` | Vercel serverless entry (exports the Express app) |
| `vercel.json` | Vercel routing: API → function, pages/assets → CDN, nothing else exposed |
| `server/email.js` | Customer receipts, new-order notifications, contact-form delivery (SMTP, or console in dev) |
| `server/gateway/base.js` | The `PaymentGateway` adapter contract |
| `server/gateway/stripe.js` | Stripe Checkout session creation + webhook verification |
| `server/gateway/mock.js` | Built-in simulated hosted gateway (dev/testing) |
| `server/gateway/index.js` | Factory — selects adapter from `PAYMENT_PROVIDER` |
| `cart.html` | Google sign-in, researcher acknowledgement, cart review + checkout |
| `confirmation.html` | Success page (polls until `paid`) |
| `failed.html` | Failure/cancel page with **retry** button |

## Routes

| Method & path | Role |
| --- | --- |
| `GET /api/auth/config` | Public Google client id + verification version/status |
| `POST /api/auth/google` | Verify Google ID token and create HttpOnly session |
| `GET /api/auth/session` | Return safe signed-in account projection |
| `POST /api/auth/logout` | Clear the first-party session |
| `POST /api/research-verification` | Issue account-bound cart acknowledgement |
| `POST /api/checkout` | Create pending order + hosted session → `{ redirectUrl }` |
| `GET /checkout/success` | Gateway success return → confirmation page |
| `GET /checkout/cancel` | Gateway cancel return → failed page |
| `POST /api/webhook/payment` | **Signed** webhook — authoritative status update |
| `GET /api/orders/:id` | Public order status (for the confirmation page) |
| `GET /admin/orders` | Admin-readable order records (`Authorization: Bearer <ADMIN_TOKEN>`) |
| `POST /api/contact` | Contact form → company inbox (validated + rate-limited) |

## Run locally

```sh
npm install
cp .env.example .env          # defaults to PAYMENT_PROVIDER=mock
npm start                     # serves the whole site + API on :3000
```

Open `http://localhost:3000`, add items, go to **Cart → Checkout**. With the
`mock` provider you get a built-in simulated hosted page (Pay / Decline /
Cancel) so the entire lifecycle — including the emailed receipt (printed to the
console in dev) and the admin record — is testable with **no real credentials**.

Admin records:
```sh
curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://localhost:3000/admin/orders
```

## Going live with Stripe

1. In Vercel Production, set `PAYMENT_PROVIDER=stripe`.
2. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` from the approved Stripe
   account. `STRIPE_CHECKOUT_URL` normally uses the default in `.env.example`.
3. Set `PUBLIC_BASE_URL=https://nuvamin.bio` so return and webhook URLs use the
   production domain.
4. In the Stripe Dashboard, register
   `https://nuvamin.bio/api/webhook/payment` and subscribe it to the Checkout,
   PaymentIntent, expiration, and refund events handled by
   `server/gateway/stripe.js`.
5. Redeploy, then confirm `/api/health` reports `provider: "stripe"` and run a
   test-mode Checkout before enabling live mode.
6. Create a Google OAuth 2.0 Web client, allow `https://nuvamin.bio` as an
   authorized JavaScript origin, then set `GOOGLE_CLIENT_ID` and a randomly
   generated 32+ character `AUTH_SESSION_SECRET` in Vercel.
7. Set a strong `ADMIN_TOKEN` and configure SMTP (`SMTP_*`) for real receipts.

## Security posture

- **Fail-fast provider selection** — Stripe without complete credentials and
  the mock provider in production both refuse to construct. There is no
  production override for the mock. `/mock-hosted` routes are mounted only
  outside production when the mock provider is active.
- **Static allowlist** — the Express host serves only pages, `assets/` and SEO
  files. `server/`, order data, `package.json`, docs and dotfiles are never
  reachable over HTTP (Vercel's routing enforces the same boundary).
- **Webhook signatures** verified with a constant-time HMAC compare; the admin
  token uses `crypto.timingSafeEqual` too.
- **Input hardening** — server-side email + shipping-address validation, 32 kb
  body cap, and per-IP rate limiting on `POST /api/checkout`.
- **Checkout identity** — Google ID tokens are verified server-side with
  Google's official Node library. Sessions use Secure, HttpOnly, SameSite
  cookies, and the signed researcher token is short-lived and account-bound.
- All dynamic values in the mock hosted page are HTML-escaped.

## Notes & production hardening

- Use `ORDER_STORE=redis` (Upstash) for production — see README's Vercel
  section. The file store is for local development / single-host demos.
- If the storefront is hosted separately from the API, set
  `window.NUVAMIN_API_BASE = "https://api.yourdomain.com"` before the page
  scripts, and the checkout/confirmation calls will target that origin.
- Never commit `.env`. Only `.env.example` (placeholders) is in the repo.
