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
| Order log | A Google Sheet the client owns — one row per paid order |

---

## Part 1 — Sending email through the Workspace address

Google Workspace mail is sent over Gmail SMTP with an **app password**
(a 16-character password Google generates for one app; the real account
password is never used).

**In the client's Google account (once the Workspace mailbox exists):**

1. Sign in to the mailbox the site should send from, e.g. `orders@THEIRDOMAIN.com`.
2. Turn on **2-Step Verification**: [myaccount.google.com/security](https://myaccount.google.com/security) → *2-Step Verification*. (App passwords require it.)
3. Create an app password: [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) → app name e.g. `Nuvamin site` → **Create** → copy the 16-character password.

**In Vercel** (project → Settings → Environment Variables, environment = Production):

| Key | Value |
| --- | --- |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_USER` | `orders@THEIRDOMAIN.com` |
| `SMTP_PASS` | the 16-character app password |
| `RECEIPT_FROM` | `Nuvamin <orders@THEIRDOMAIN.com>` |
| `SUPPORT_EMAIL` | the public support address, e.g. `lab@THEIRDOMAIN.com` |
| `CONTACT_TO` | inbox for contact-form messages (can equal `SUPPORT_EMAIL`) |
| `ORDER_NOTIFY_EMAIL` | inbox for new-order alerts (can equal `SUPPORT_EMAIL`) |

Then **redeploy** (Deployments → ⋯ on the latest → Redeploy) so the new
variables take effect.

> Note: Gmail sends from the authenticated mailbox (or its aliases). If
> `RECEIPT_FROM` doesn't match `SMTP_USER` or one of its aliases, Gmail will
> rewrite the From header — keep them the same address to be safe.

> The site pages currently show `lab@nuvamin.com` as the public email. If the
> client's real address differs, tell me the final address and I'll update the
> pages in one pass.

---

## Part 2 — Order log in Google Sheets

The server posts each **paid** order to a tiny script attached to the client's
own spreadsheet. The client owns the sheet; no Google API keys are involved.

**1. Create the sheet** — [sheets.new](https://sheets.new), name it e.g.
*Nuvamin Orders*.

**2. Attach the script** — in the sheet: **Extensions → Apps Script**, delete
whatever is in the editor, paste this, and change `SECRET` to any long random
string:

```javascript
// Nuvamin order log — receives one row per paid order from the website.
const SECRET = "CHANGE_ME_TO_A_LONG_RANDOM_STRING";

const HEADERS = [
  "Order ID", "Placed at", "Status", "Customer name", "Customer email",
  "Items", "Subtotal", "Shipping", "Total", "Currency", "Ship to",
  "Transaction ID", "Provider"
];

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) {
    return ContentService.createTextOutput("forbidden").setMimeType(ContentService.MimeType.TEXT);
  }
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);
  const r = body.row;
  sheet.appendRow([
    r.orderId, r.placedAt, r.status, r.customerName, r.customerEmail,
    r.items, r.subtotal, r.shipping, r.total, r.currency, r.address,
    r.transactionId, r.provider
  ]);
  return ContentService.createTextOutput(JSON.stringify({ ok: true }))
    .setMimeType(ContentService.MimeType.JSON);
}
```

**3. Deploy it** — blue **Deploy → New deployment** → gear icon → **Web app**:
- *Execute as*: **Me**
- *Who has access*: **Anyone** (required so the server can POST; the shared
  secret is what gates writes)
- **Deploy**, authorize when prompted, then **copy the Web app URL**
  (`https://script.google.com/macros/s/…/exec`).

**4. In Vercel**, add:

| Key | Value |
| --- | --- |
| `SHEETS_WEBHOOK_URL` | the Web app URL from step 3 |
| `SHEETS_WEBHOOK_SECRET` | the same string you put in `SECRET` |

Redeploy again.

> To change columns later: edit the script, then **Deploy → Manage
> deployments → edit (pencil) → Version: New version → Deploy** — the URL
> stays the same.

---

## Part 3 — Test it (5 minutes)

1. On the live site: **Contact page** → send a test message → it should arrive
   in the `CONTACT_TO` inbox; hitting Reply should address the visitor.
2. Place a test order (with the mock provider on a preview, or NMI's sandbox
   when it's live):
   - customer email receives the receipt **from the company address**,
   - `ORDER_NOTIFY_EMAIL` receives the "New order NV-… (paid)" alert with the
     shipping address,
   - one new row appears in the Google Sheet.
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
