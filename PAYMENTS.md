# Nuvamin — Orders & Payments

Nuvamin currently uses an **invoice-first, manually verified payment flow**.
Stripe Checkout remains implemented but inactive. No payment account details
are committed to GitHub; invoice destinations are read from server-only Vercel
environment variables.

## Active flow

```text
Browser (cart.html)
  │  POST /api/checkout {cart, email, shipping, requestId}
  ▼
Server
  ├─ reprices from the server catalogue
  ├─ validates contact and shipping details
  ├─ creates an AWAITING PAYMENT order in Redis
  ├─ emails the customer payment instructions
  ├─ emails the company an awaiting-payment alert
  └─ posts the order to the private Google Sheet
  │
  ▼
order-placed.html — "Check your inbox"

Team verifies external funds
  │  Google Sheet: choose method/reference → Payment confirmed ✓
  │  POST /api/orders/:id/confirm-payment {shared secret}
  ▼
Server marks PAID → sends "Good things are coming" confirmation

Team packs order
  │  Google Sheet: carrier + tracking → Fulfilled ✓
  ▼
Apps Script sends "It's on the way" email + Track Package link
```

## Order states

`pending → paid | failed | cancelled | refunded`

For invoice orders, `pending` means **awaiting payment**. The Google Sheet's
Payment confirmed action is the authoritative paid transition. The endpoint is
protected by `SHEETS_WEBHOOK_SECRET`, validates that the order belongs to the
manual-invoice flow, and is idempotent. A completed action cannot resend the
customer receipt.

Stripe retains its signed webhook and legal state transitions for future use.
Paid orders can never be downgraded by late/replayed events.

## Payment destinations

Configure any combination in Vercel Production and redeploy:

| Method | Variables |
| --- | --- |
| Zelle | `ZELLE_RECIPIENT`, optional `ZELLE_ACCOUNT_NAME` |
| Cash App | `CASHAPP_CASHTAG`, optional `CASHAPP_PAYMENT_URL` |
| PayPal | `PAYPAL_ACCOUNT`, optional `PAYPAL_PAYMENT_URL` |
| Crypto | `CRYPTO_CURRENCY`, `CRYPTO_NETWORK`, `CRYPTO_WALLET_ADDRESS`, optional `CRYPTO_PAYMENT_URL` |

Only configured methods appear. When every destination is blank, the email
safely tells the customer that the lab will follow up; it never renders
placeholder account data. For crypto, the configured currency and network are
shown explicitly.

## Google Sheet

Every placed order appears as **AWAITING PAYMENT**. The operational sequence is:

1. Verify funds outside Nuvamin.
2. Select Zelle, Cash App, PayPal, Crypto or Other.
3. Enter a provider reference or transaction hash when available.
4. Tick **Payment confirmed ✓**. The row becomes **PAID — TO FULFIL** and the
   customer receives the designed confirmation email.
5. Enter tracking and choose UPS, USPS, FedEx or DHL.
6. Tick **Fulfilled ✓**. The row becomes **SHIPPED ✓** and the customer receives
   the shipping email with a working carrier link.

The server probes the Apps Script's version-2 capabilities before accepting an
invoice order. This intentionally fails closed if the deployed Sheet script is
still the previous paid-only version, preventing unpaid orders from being
mistaken for ready-to-fulfil orders.

Setup and migration instructions: [GOOGLE-WORKSPACE-SETUP.md](GOOGLE-WORKSPACE-SETUP.md).

## Stripe retained but inactive

`CHECKOUT_MODE=invoice` is the default and does not construct or call the
Stripe gateway. Existing Stripe source, credentials, return routes and signed
webhook handling remain intact.

To restore Stripe later:

1. Set `CHECKOUT_MODE=stripe` and `PAYMENT_PROVIDER=stripe` in Vercel.
2. Ensure `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are configured.
3. Ensure the Stripe webhook targets `/api/webhook/payment`.
4. Redeploy and complete a test-mode checkout before enabling live payments.

The mock gateway remains restricted to non-production and is available only
when `CHECKOUT_MODE=stripe` and `PAYMENT_PROVIDER=mock`.

## Reliability and security

- Server-side catalogue pricing; browser totals are never trusted.
- Redis-backed orders on Vercel.
- Per-attempt request IDs prevent duplicate orders after network retries.
- Customer card/bank/wallet credentials are never collected by Nuvamin.
- Payment destinations stay in server-only environment variables.
- Sheet confirmation requires a timing-safe shared-secret comparison.
- Customer-facing order status exposes no email or shipping address.
- Confirmation and paid-order notifications have stored send-once flags.
- Sheet insertion rejects duplicate order IDs.
- Fulfilment requires confirmed payment, tracking and a supported carrier.

## Relevant files

| Path | Purpose |
| --- | --- |
| `cart.html` | Delivery form and Place order action |
| `order-placed.html` | Awaiting-payment result page |
| `server/app.js` | Order creation, Sheet confirmation and retained Stripe routes |
| `server/email.js` | Payment request, paid confirmation and company notifications |
| `server/orders.js` | Redis/file order model and enforced lifecycle |
| `server/sheets.js` | Sheet capability check and placed-order logging |
| `google/nuvamin-orders.gs` | Payment confirmation and tracked fulfilment actions |
| `server/gateway/stripe.js` | Inactive retained Stripe Checkout adapter |
