# Hooking up Google Workspace (email + order sheet)

Everything below is **configuration only** — no code changes. The site already
knows how to send contact-form messages, customer receipts, and new-order
notifications, and how to log orders to a Google Sheet. It just needs the
values from the client's Google Workspace once it exists.

What gets wired up:

| Feature | Where it lands |
| --- | --- |
| Contact-form messages | Company inbox (`CONTACT_TO`), Reply-To set to the visitor |
| Customer receipt on paid order | Customer's email, **from** the company address |
| "New paid order" notification | Company inbox (`ORDER_NOTIFY_EMAIL`) with items, totals, shipping address |
| Orders & fulfilment board | A Google Sheet the client owns — one row per paid order, with a Fulfilled checkbox |
| "It's on the way" email | Sent from the client's Gmail automatically when Fulfilled is ticked |

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

## Part 2 — Orders & fulfilment board in Google Sheets

Each **paid** order lands as a row in a Google Sheet the client owns —
formatted as a fulfilment board. A team member packs the order, optionally
enters a **Tracking #** and **Carrier**, then ticks the **Fulfilled ✓**
checkbox — and the customer instantly receives the designed
*"It's on the way"* email, sent from this Google account's Gmail, with a
Track Package button when the carrier is UPS / USPS / FedEx / DHL.

The full script lives in this repo at **`google/nuvamin-orders.gs`**.

**1. Create the sheet** — [sheets.new](https://sheets.new), name it
*Nuvamin Orders*.

**2. Attach the script** — **Extensions → Apps Script**, delete what's in the
editor, paste the entire contents of `google/nuvamin-orders.gs`, and change
the `SECRET` line to any long random string. (`SUPPORT_EMAIL` at the top is
already `support@nuvamin.bio` — the Reply-To on shipping emails.) Save.

**3. Run `setup()` once** — in the toolbar, select `setup` in the function
dropdown → **Run** → authorize when prompted (it needs Sheets + Gmail because
it sends the shipping email as this account). This formats the board
(black header, status colours, Fulfilled checkboxes, hidden data column) and
installs the fulfilment trigger. Safe to re-run any time.

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

1. New paid orders appear automatically — amber **NEW — TO FULFIL** status,
   with items, quantities, full shipping address, total and contact email.
2. Pack the order. Type the tracking number into **Tracking #** and the
   carrier (e.g. `UPS`) into **Carrier**.
3. Tick **Fulfilled ✓**. The row turns green **SHIPPED ✓**, gets a
   timestamp, and the customer's shipping-confirmation email sends
   immediately (a toast in the corner confirms who it went to).
4. Ticking the box on an already-shipped row does nothing — the email can
   never send twice.

> To change the script later: edit it, then **Deploy → Manage deployments →
> pencil → Version: New version → Deploy** — the URL stays the same.

## Part 3 — Test it (5 minutes)

1. On the live site: **Contact page** → send a test message → it should arrive
   in the `CONTACT_TO` inbox; hitting Reply should address the visitor.
2. Place a test order (with the mock provider on a preview, or NMI's sandbox
   when it's live):
   - customer email receives the receipt **from the company address**,
   - `ORDER_NOTIFY_EMAIL` receives the "New order NV-… (paid)" alert with the
     shipping address,
   - a new amber **NEW — TO FULFIL** row appears on the orders board;
   - tick **Fulfilled ✓** on that row: it turns green and the shipped email
     (with tracking, if entered) arrives at the customer address.
3. If any email doesn't arrive: check Vercel → the deployment → **Functions
   logs** — SMTP and sheet errors are logged there with the reason.

## Troubleshooting

- **"Invalid login" in logs** — the app password was mistyped (paste it without
  spaces), or 2-Step Verification isn't on for that mailbox.
- **Mail goes to spam** — normal for a brand-new domain; improves once the
  Workspace domain has SPF/DKIM set up (Google Admin → Apps → Gmail →
  Authenticate email; Workspace walks you through the DNS records).
- **No sheet row** — re-check that `SHEETS_WEBHOOK_SECRET` exactly matches the
  script's `SECRET`, and that the deployment's access is set to *Anyone*.
