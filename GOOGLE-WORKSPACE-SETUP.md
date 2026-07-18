# Hooking up Google Workspace (email + order sheet)

Everything below is **configuration only** — no code changes. The site already
knows how to send contact-form messages, customer receipts, and new-order
notifications, and how to log orders to a Google Sheet. It just needs the
values from the client's Google Workspace once it exists.

What gets wired up:

| Feature | Where it lands |
| --- | --- |
| Contact-form messages | Company inbox (`CONTACT_TO`), Reply-To set to the visitor |
| Payment-instructions invoice | Customer's email immediately after **Place order** |
| Customer receipt on confirmed payment | Customer's email, **from** the company address |
| Order notifications | Company inbox (`ORDER_NOTIFY_EMAIL`) when placed and when paid |
| Payment & fulfilment board | A Google Sheet the client owns — one row per placed order, with payment and fulfilment controls |
| "It's on the way" email | Sent from the client's Gmail automatically when Fulfilled is ticked |
| The Lot Report list | A second Google Sheet — newsletter signups land here automatically |
| Welcome email + first-order code | Sent from the client's Gmail the moment someone subscribes |
| Lot-drop announcements | One menu click in the sheet emails every active subscriber |

---

## Part 1 — Sending email through the Workspace address

Google Workspace mail is sent over Gmail SMTP with an **app password**
(a 16-character password Google generates for one app; the real account
password is never used).

**In the client's Google account (once the Workspace mailbox exists):**

1. Sign in to the mailbox the site sends from: `labs@nuvamin.bio`.
2. Turn on **2-Step Verification**: [myaccount.google.com/security](https://myaccount.google.com/security) → *2-Step Verification*. (App passwords require it.)
3. Create an app password: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) → app name e.g. `Nuvamin site` → **Create** → copy the 16-character password.

**In Vercel** (project → Settings → Environment Variables, environment = Production):

| Key | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `labs@nuvamin.bio` |
| `SMTP_PASS` | the 16-character app password |
| `RECEIPT_FROM` | `Nuvamin <labs@nuvamin.bio>` |
| `SUPPORT_EMAIL` | `support@nuvamin.bio` (the questions inbox) |
| `CONTACT_TO` | `support@nuvamin.bio` — receives contact-form messages |
| `ORDER_NOTIFY_EMAIL` | `labs@nuvamin.bio` — receives new-order alerts |

Then **redeploy** (Deployments → ⋯ on the latest → Redeploy) so the new
variables take effect.

> Note: Gmail sends from the authenticated mailbox (or its aliases). If
> `RECEIPT_FROM` doesn't match `SMTP_USER` or one of its aliases, Gmail will
> rewrite the From header — keep them the same address to be safe.

> Address map: `labs@nuvamin.bio` sends all order email and shows in the site
> footer; `support@nuvamin.bio` receives contact-form messages and is the
> public questions address on the site.

---

## Part 1b — Payment destinations in Vercel

The invoice email reads payment destinations only from server-side Vercel
environment variables. Real account details never belong in GitHub. Add any
combination of the following later, scoped to **Production**, then redeploy:

| Method | Environment variables |
| --- | --- |
| Zelle | `ZELLE_RECIPIENT` (email/phone), optional `ZELLE_ACCOUNT_NAME` |
| Cash App | `CASHAPP_CASHTAG`, optional `CASHAPP_PAYMENT_URL` |
| PayPal | `PAYPAL_ACCOUNT`, optional `PAYPAL_PAYMENT_URL` |
| Crypto | `CRYPTO_CURRENCY`, `CRYPTO_NETWORK`, `CRYPTO_WALLET_ADDRESS`, optional `CRYPTO_PAYMENT_URL` |

A method is included only when its destination is configured. If all methods
are still blank, the customer email safely says that the lab will follow up
with payment instructions; it never displays placeholders or invented account
details. Crypto emails explicitly show the configured currency/network to
reduce wrong-network transfers.

`CHECKOUT_MODE=invoice` is the active workflow. Stripe code and credentials
remain intact but unused. Setting `CHECKOUT_MODE=stripe` in Vercel and
redeploying restores the hosted Stripe flow later.

---

## Part 2 — Orders & fulfilment board in Google Sheets

Each **placed** order lands as an amber **AWAITING PAYMENT** row in a Google
Sheet the client owns. After funds arrive, a team member selects the payment
method, optionally records its transaction/reference, and ticks **Payment
confirmed ✓**. That securely marks the Redis order paid and sends the designed
*"Good things are coming"* confirmation email exactly once.

After the order is packed, enter its **Tracking #**, choose a **Carrier**, and
tick **Fulfilled ✓**. The customer instantly receives the designed *"It's on
the way"* email from this Google account's Gmail, with a working Track Package
button. UPS, USPS, FedEx and DHL are supported by the carrier dropdown.

The full script lives in this repo at **`google/nuvamin-orders.gs`**.

**1. Create the sheet** — [sheets.new](https://sheets.new), name it
*Nuvamin Orders*.

**2. Attach or update the script** — **Extensions → Apps Script**, replace the
editor contents with `google/nuvamin-orders.gs`. Preserve the current `SECRET`
if this sheet is already connected; otherwise change it to any long random
string. (`SUPPORT_EMAIL` is already `support@nuvamin.bio`.) Save.

**3. Run `setup()` once** — in the toolbar, select `setup` in the function
dropdown → **Run** → authorize when prompted (it needs Sheets + Gmail because
it sends the shipping email as this account). This formats the board with
payment and fulfilment controls and installs the edit trigger. Safe to re-run.
If the sheet used the previous paid-only layout, `setup()` inserts the new
payment columns while preserving existing orders, tracking and hidden data.

**4. Deploy the order receiver** — blue **Deploy → New deployment** → gear →
**Web app**:
- *Execute as*: **Me**
- *Who has access*: **Anyone** (required so the site can POST; the shared
  secret gates writes)
- **Deploy** → copy the Web app URL (`https://script.google.com/macros/s/…/exec`).

**5. In Vercel**, add and redeploy:

| Key | Value |
| --- | --- |
| `SHEETS_WEBHOOK_URL` | the Web app URL from step 4 |
| `SHEETS_WEBHOOK_SECRET` | the same string you put in `SECRET` |

### Day-to-day for the fulfilment team

1. New orders appear automatically — amber **AWAITING PAYMENT**, with items,
   quantities, shipping address, total and customer email.
2. Verify the payment outside Nuvamin. Choose **Zelle**, **Cash App**,
   **PayPal**, **Crypto** or **Other** under **Payment method**. Enter the
   provider reference or crypto transaction hash when one is available.
3. Tick **Payment confirmed ✓**. The row turns blue **PAID — TO FULFIL**, gets
   a timestamp, and the customer receives the order-confirmation email. If
   delivery fails, the box resets so the action can be retried safely.
4. Pack the order. Enter **Tracking #** and choose UPS, USPS, FedEx or DHL.
5. Tick **Fulfilled ✓**. The row turns green **SHIPPED ✓**, gets a
   timestamp, and the customer's shipping-confirmation email sends
   immediately (a toast in the corner confirms who it went to).
6. Completed actions are idempotent — ticking them again does not resend mail.

> After replacing the script: **Deploy → Manage deployments →
> pencil → Version: New version → Deploy** — the URL stays the same.

---

## Part 2b — The Lot Report (subscribers list + welcome offer)

The newsletter form on the site posts each signup to a **second** sheet. The
sheet's script instantly emails the new subscriber a designed welcome email
containing the first-order discount code (**LOT10 — 10% off**, enforced by
the checkout: valid once, first order per email address only). When the team
wants to announce a new lot, one menu click emails every active subscriber.

The script lives at **`google/nuvamin-subscribers.gs`**.

**1. Create a second sheet** — [sheets.new](https://sheets.new), name it
*Nuvamin — Lot Report subscribers*.

**2. Attach the script** — **Extensions → Apps Script**, paste the entire
contents of `google/nuvamin-subscribers.gs`, change `SECRET` to a long random
string (use a **different** one than the orders sheet). Save, then run
**`setup()`** once and authorize (Sheets + Gmail).

**3. Deploy** — **Deploy → New deployment → Web app** (*execute as Me*,
*access: Anyone*) → copy the URL.

**4. In Vercel**, add and redeploy:

| Key | Value |
| --- | --- |
| `SUBSCRIBERS_WEBHOOK_URL` | the web-app URL from step 3 |
| `SUBSCRIBERS_WEBHOOK_SECRET` | the same string as the script's `SECRET` |
| `FIRST_ORDER_DISCOUNT_CODE` | `LOT10` (or change it — also change it in the script) |
| `FIRST_ORDER_DISCOUNT_PERCENT` | `10` (ditto) |

### How the list works day-to-day

- **Signups are automatic** — every newsletter submit adds a green ACTIVE
  row and the welcome email (with the code) sends immediately. Duplicates
  are ignored; unsubscribed addresses re-activate if they sign up again.
- **Announce a drop**: open the sheet → **Nuvamin menu → Send lot-drop
  email…** → type the compound (e.g. `Retatrutide 30MG`), the product link,
  and an optional note. Every ACTIVE subscriber gets the designed
  announcement. (Gmail quota: ~1,500 recipients/day on Workspace.)
- **Unsubscribes are one click** — every email footer has a signed
  unsubscribe link; the row turns red UNSUBSCRIBED automatically and that
  address is skipped on future sends.
- **The code really works**: `LOT10` gives 10% off in the checkout, is
  rejected on anything but the customer's first order, and shows as a
  discount line in the receipt, the confirmation page, and the orders board.

## Part 3 — Test it (5 minutes)

1. On the live site: **Contact page** → send a test message → it should arrive
   in the `CONTACT_TO` inbox; hitting Reply should address the visitor.
2. Place a test order in invoice mode:
   - the browser shows **Order placed — Check your inbox**;
   - the customer receives the payment-instructions email;
   - `ORDER_NOTIFY_EMAIL` receives the awaiting-payment alert;
   - a new amber **AWAITING PAYMENT** row appears on the orders board.
3. Select a payment method and tick **Payment confirmed ✓**:
   - the row turns blue **PAID — TO FULFIL**;
   - the customer receives the designed order-confirmation email;
   - the company inbox receives the paid-order notification.
4. Add tracking and carrier, then tick **Fulfilled ✓**. The row turns green
   and the customer receives the shipped email with Track Package link.
5. Newsletter: submit the form on the homepage with a test address — a green
   row appears on the subscribers sheet and the welcome email (code LOT10)
   arrives. Use the code on a first test order and confirm the discount line;
   click Unsubscribe in the email footer and confirm the row turns red.
6. If any email doesn't arrive: check Vercel → the deployment → **Functions
   logs** — SMTP and sheet errors are logged there with the reason.

## Troubleshooting

- **"Invalid login" in logs** — the app password was mistyped (paste it without
  spaces), or 2-Step Verification isn't on for that mailbox.
- **Mail goes to spam** — normal for a brand-new domain; improves once the
  Workspace domain has SPF/DKIM set up (Google Admin → Apps → Gmail →
  Authenticate email; Workspace walks you through the DNS records).
- **No sheet row** — re-check that `SHEETS_WEBHOOK_SECRET` exactly matches the
  script's `SECRET`, and that the deployment's access is set to *Anyone*.
- **"Ordering is being configured"** — the deployed Orders Apps Script is
  still the old paid-only version. Paste the latest `google/nuvamin-orders.gs`,
  run `setup()`, then deploy a **New version** of the existing web app.
