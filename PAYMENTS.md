# Nuvamin — Checkout & Payments

A **redirect-based hosted-gateway** checkout. Card data is entered only on the
payment provider's PCI-compliant hosted page — **this site never sees, handles,
or stores card details** (PCI SAQ-A posture). Payments run through a **provider
adapter** so the processor can be swapped without touching the rest of the app.

- **Intended provider:** NMI (Network Merchants Inc.), hosted redirect checkout.
- **Swappable to:** Authorize.Net (adapter stub already wired), or any hosted
  gateway that supports a create-session → redirect → webhook flow.

## Architecture

```
Browser (cart.html)
   │  POST /api/checkout   { cart, customer.email, shipping address }
   ▼
Server  ── prices order from server-side catalog (client price is never trusted)
        ── validates email + shipping address server-side
        ── creates a PENDING order   (backend order creation BEFORE payment)
        ── gateway.createCheckoutSession(order)   →  { redirectUrl }
   │  302 redirect
   ▼
Hosted gateway page (NMI / Authorize.Net / built-in mock)
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
| `server/catalog.js` | Authoritative server-side prices |
| `server/orders.js` | Order model + enforced status lifecycle + file/redis store drivers |
| `api/index.js` | Vercel serverless entry (exports the Express app) |
| `vercel.json` | Vercel routing: API → function, pages/assets → CDN, nothing else exposed |
| `server/email.js` | Customer receipt (SMTP, or console in dev) |
| `server/gateway/base.js` | The `PaymentGateway` adapter contract |
| `server/gateway/nmi.js` | **NMI** hosted-checkout adapter |
| `server/gateway/authorizenet.js` | Authorize.Net adapter (stub for future swap) |
| `server/gateway/mock.js` | Built-in simulated hosted gateway (dev/testing) |
| `server/gateway/index.js` | Factory — selects adapter from `PAYMENT_PROVIDER` |
| `cart.html` | Cart review + checkout button (→ `/api/checkout`) |
| `confirmation.html` | Success page (polls until `paid`) |
| `failed.html` | Failure/cancel page with **retry** button |

## Routes

| Method & path | Role |
| --- | --- |
| `POST /api/checkout` | Create pending order + hosted session → `{ redirectUrl }` |
| `GET /checkout/success` | Gateway success return → confirmation page |
| `GET /checkout/cancel` | Gateway cancel return → failed page |
| `POST /api/webhook/payment` | **Signed** webhook — authoritative status update |
| `GET /api/orders/:id` | Public order status (for the confirmation page) |
| `GET /admin/orders` | Admin-readable order records (`Authorization: Bearer <ADMIN_TOKEN>`) |

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

## Going live with NMI

1. In `.env`, set `PAYMENT_PROVIDER=nmi` and fill the NMI values (each is
   marked `REPLACE_WITH_…` in `.env.example`):
   - `NMI_PROCESSOR_ACCOUNT_ID` — processor / gateway account ID
   - `NMI_SECURITY_KEY` — private API security key
   - `NMI_WEBHOOK_SECRET` — webhook signing secret
   - `NMI_CHECKOUT_URL` — hosted-checkout endpoint for your account
2. Set `PUBLIC_BASE_URL` to your real domain (drives the return + webhook URLs).
3. In the NMI portal, register the webhook URL: `https://YOUR_DOMAIN/api/webhook/payment`.
4. In `server/gateway/nmi.js`, reconcile the request/response field names and the
   webhook signature header with your NMI account's integration guide — the exact
   spots are marked `▼ TODO (go-live) ▼`.
5. Set a strong `ADMIN_TOKEN`, and configure SMTP (`SMTP_*`) for real receipts.

## Swapping to Authorize.Net later

Set `PAYMENT_PROVIDER=authorizenet`, provide `AUTHNET_*` env vars, and complete
the `getHostedPaymentPageRequest` call in `server/gateway/authorizenet.js`
(Accept Hosted flow). No other code changes — the app only talks to the adapter
interface.

## Security posture

- **Fail-fast provider selection** — a real provider without complete
  credentials (or the mock provider in production) refuses to boot; payments
  can never silently degrade to the forgeable simulated gateway. The
  `/mock-hosted` routes are only mounted when the mock provider is active.
- **Static allowlist** — the Express host serves only pages, `assets/` and SEO
  files. `server/`, order data, `package.json`, docs and dotfiles are never
  reachable over HTTP (Vercel's routing enforces the same boundary).
- **Webhook signatures** verified with a constant-time HMAC compare; the admin
  token uses `crypto.timingSafeEqual` too.
- **Input hardening** — server-side email + shipping-address validation, 32 kb
  body cap, and per-IP rate limiting on `POST /api/checkout`.
- All dynamic values in the mock hosted page are HTML-escaped.

## Notes & production hardening

- Use `ORDER_STORE=redis` (Upstash) for production — see README's Vercel
  section. The file store is for local development / single-host demos.
- If the storefront is hosted separately from the API, set
  `window.NUVAMIN_API_BASE = "https://api.yourdomain.com"` before the page
  scripts, and the checkout/confirmation calls will target that origin.
- Never commit `.env`. Only `.env.example` (placeholders) is in the repo.
