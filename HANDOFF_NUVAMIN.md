# Nuvamin — Developer Handoff

**Date:** 2026-07-09 · **Repo:** `ranbysal/Nuvamin` · **Production:** https://nuvamin.bio (Vercel, deploys from `main`)
**Working branch:** `claude/nuvamin-ecommerce-site-yn4jwo` (kept in sync with `main` as of commit `51eded6`)

This document is the complete technical handoff for the next developer. It documents what exists, what works, what is intentionally not built, and how to operate and test every part of the system. Read §15 (safe handoff rules) before changing anything.

---

## 1. Current project status

**Works (verified):**
- The full static storefront: 13 pages (index, shop, product, cart, confirmation, failed, unsubscribed, about, journal, contact, privacy, terms, shipping-returns, 404), design system, motion system, responsive layout, SEO files (robots.txt, sitemap.xml, OG tags).
- The Express API (`server/app.js`), exported unbound and served on Vercel as one serverless function (`api/index.js`, routed by `vercel.json`).
- **As of commit `51eded6` the API no longer crashes at boot when a subsystem is misconfigured** (see §2). Contact form, mailing-list signup, and static serving are isolated from order-store and payment-gateway configuration.
- `GET /api/health` — new diagnostics endpoint that reports, per subsystem, exactly what is and isn't configured in the running deployment. This is the first thing to check when anything misbehaves.
- Complete mock-gateway checkout lifecycle in development (order → hosted page → signed webhook → paid → receipt), with enforced status transitions and idempotent webhook handling.
- Google Sheets integrations (orders fulfilment board + subscribers list) — code complete on the server side; each requires its Apps Script web app to be deployed and two env vars set (§5).

**Partially built / needs configuration, not code:**
- Order persistence in production: requires the Upstash Redis integration on Vercel (§6). Until then order routes return clean 503s.
- Production email: requires `SMTP_*` env vars in Vercel (Gmail app password; see GOOGLE-WORKSPACE-SETUP.md).

**Broken:** nothing known, after `51eded6`. Before it, every `/api` route 500'd in production — root cause and fix in §2.

**Intentionally not completed (see §8 and §13):**
- No payment provider is connected in production. There is **no Stripe code in this repository** — no SDK, no keys, no PaymentIntent/Checkout Session logic, no frontend Stripe.js. A provider-adapter gateway architecture exists (mock, NMI, Authorize.Net adapters) but no live credentials are configured and checkout is disabled in production by design.
- The requested "restricted research-buyer review system" (terms gate → buyer verification → authorization-only payment → pending-review → manual approve/capture → status emails) is **not implemented anywhere**. The previous developer (me — the AI assistant that built this repo) declined to build the payment/fulfilment activation for this catalog; that decision and its scope are documented precisely in §13 so the client can plan around it.

---

## 2. Production issue summary (the API crash)

**Symptom:** every `/api` request in production returned HTTP 500 (`FUNCTION_INVOCATION_FAILED`). The contact form showed "WE COULDN'T SEND YOUR MESSAGE RIGHT NOW", newsletter signup failed, and order lookups failed — all simultaneously.

**Root cause — two module-scope throws, either of which killed the entire function at import time:**

1. `server/orders.js` — pre-fix line 154: `const driver = buildDriver();` ran at module load. With no Upstash credentials present, `ORDER_STORE` defaults to `file` (`server/config.js:51`), and on Vercel the file driver guard (pre-fix lines 136–142) throws:

   > `Error: ORDER_STORE=file cannot run on Vercel — the serverless filesystem is ephemeral and orders would be lost. Add the Upstash Redis integration (Vercel → Storage → Upstash) or set ORDER_STORE=redis with credentials.`

2. `server/app.js` — pre-fix line 49: `const gateway = getGateway();` ran at module load. With `PAYMENT_PROVIDER` unset, the provider defaults to `mock`, and the production guard in `server/gateway/index.js` throws:

   > `Error: PAYMENT_PROVIDER=mock is disabled in production. Configure a real provider, or set ALLOW_MOCK_GATEWAY=true only for a staging demo.`

**Why it took every route down:** `api/index.js` → `require("../server/app")` → which `require`s `./orders` and calls `getGateway()` during import. A throw during import aborts the whole module graph, so Vercel's function fails initialization and **every** route it serves (`/api/*`, `/checkout/*`, `/admin/*`) returns 500 — including `/api/contact` and `/api/subscribe`, whose own dependencies (SMTP, Apps Script URL) were irrelevant.

**Evidence:** reproduced locally by running the pre-fix code with `NODE_ENV=production VERCEL=1` — `require("./server/app")` throws exactly error #1 above (orders.js is required before the gateway line, so it fires first; fixing only that one would then hit #2). These are the exact messages that appear in the Vercel function logs for the failed invocations. *Honest caveat:* the fix session ran in a sandbox whose egress policy blocks `nuvamin.bio` and has no Vercel dashboard access, so the log lines were confirmed by local reproduction of the deployed configuration rather than read from the dashboard. To see them yourself: Vercel → project → **Observability → Logs** (or Deployments → the failing deployment → Functions).

**What changed (commit `51eded6`):**
- `server/orders.js`: the store driver is resolved lazily on first use (`getDriver()`), never at import. Config errors carry `code: "ORDER_STORE_CONFIG"`. New non-throwing `storeStatus()` probe.
- `server/app.js`: the gateway is resolved lazily inside payment routes. Order/payment routes catch failures and return clean JSON 503s. The webhook returns 5xx on config errors so a real gateway would re-deliver. Mock-hosted routes mount from config, not from a constructed gateway. New `GET /api/health`.
- `server/gateway/index.js`: config errors carry `code: "GATEWAY_CONFIG"`.
- `server/email.js`: in production, missing SMTP now **throws** (surfacing as the contact route's honest 502) instead of console-logging the mail and claiming success.
- `POST /api/subscribe`: in production, a missing `SUBSCRIBERS_WEBHOOK_URL` returns 503 instead of a fake `{ok:true}`.

**Result:** contact/subscribe/static depend only on their own config. A store or payment misconfiguration degrades only order/payment routes, each with a clear message, and `/api/health` names the exact problem.

**Remaining risk:**
- The env vars themselves still need to be set for each subsystem to actually work (§6). The fix isolates failures; it doesn't configure anything.
- Rate limiting is per-instance in-memory (resets per serverless instance) — adequate, not bulletproof.
- `/api/health` intentionally reports which subsystems are unconfigured (booleans + our own error strings, never secrets). If the client considers that too much surface, gate it behind `ADMIN_TOKEN` (task in §14).

---

## 3. API routes

All routes live in `server/app.js` (single file). `apiBase` on the frontend is same-origin (`window.NUVAMIN_API_BASE || ""`).

| # | Method & path | Purpose | Status |
|---|---|---|---|
| 1 | `GET /api/health` | Boot + config diagnostics | **Working** (new) |
| 2 | `POST /api/contact` | Contact form → company inbox | **Working** (fixed); prod needs `SMTP_*` |
| 3 | `POST /api/subscribe` | Lot Report signup → subscribers sheet | **Working**; prod needs `SUBSCRIBERS_WEBHOOK_*` |
| 4 | `GET /api/unsubscribe` | One-click unsubscribe from emails | **Working**; same deps as #3 |
| 5 | `POST /api/checkout` | Create pending order + hosted payment session | Code working (mock e2e); **blocked in production by design** (no payment provider — §8/§13) |
| 6 | `GET /api/orders/:id` | Public order status (safe projection) | Working; prod needs order store (§6) |
| 7 | `POST /api/webhook/payment` | Signed gateway webhook — source of truth for paid/failed/cancelled/refunded | Working (mock-verified); real provider needs adapter creds |
| 8 | `GET /checkout/success` · `GET /checkout/cancel` | Gateway return redirects → confirmation/failed pages | Working |
| 9 | `GET /admin/orders` | Order records (Bearer `ADMIN_TOKEN`) | Working; prod needs order store + token |
| 10 | `GET /mock-hosted` · `POST /mock-hosted/complete` | Simulated hosted payment page | Dev-only (never mounted in production without `ALLOW_MOCK_GATEWAY=true`) |
| 11 | static + 404 fallthrough | Allowlisted site files only (`/assets`, `*.html`, robots, sitemap, favicon) — never `server/`, configs, or docs | Working |

**Details per route:**

- **`GET /api/health`** — no payload. Always 200 once the function boots. Response: `{ok, service, time, env:{vercel, production}, checks:{orderStore:{ok, driver|error}, gateway:{ok, provider|error}, email:{configured}, ordersSheet:{configured}, subscribersSheet:{configured}}}`. No secrets.
- **`POST /api/contact`** — JSON `{name*, email*, institution, topic, message*}` (lengths capped 120/200/200/120/5000; email regex). 200 `{ok:true}` · 400 `{error}` validation · 429 rate-limited (5/min/IP) · 502 `{error}` when SMTP fails/missing. Sends to `CONTACT_TO` (default `support@nuvamin.bio`) with Reply-To set to the visitor.
- **`POST /api/subscribe`** — JSON `{email*, source}`. 200 `{ok:true}` · 400 invalid email · 429 (5/min/IP) · 502 sheet webhook failed · 503 (production, URL unset). Posts `{action:"subscribe", email, source, secret}` to the subscribers Apps Script.
- **`GET /api/unsubscribe?email=&token=`** — HMAC-SHA256(email, `SUBSCRIBERS_WEBHOOK_SECRET`) token; constant-time compare; bad token → redirect `/404.html`; good → notifies the sheet, redirects `/unsubscribed.html`.
- **`POST /api/checkout`** — JSON `{cart:{productId: qty}, customer:{email*}, shipping:{name*, line1*, line2, city*, postalCode*, country*}, discountCode}`. Server-side pricing only (`server/catalog.js` — the browser never dictates price); `LOT10` validated server-side, first paid order per email only. 200 `{orderId, redirectUrl}` · 400 validation/empty cart/bad code · 429 (10/min/IP) · **503 config unavailable** · 502 gateway error. Creates the order **pending** before redirect.
- **`GET /api/orders/:id`** — 200 safe projection `{id, status, currency, items, subtotal, discount, discountCode, shipping, total, createdAt}` — deliberately **no address/email/events** (order ids travel in URLs) · 404 · 503 store unavailable.
- **`POST /api/webhook/payment`** — raw body captured for signature verification (`req.rawBody`). 401 invalid signature · 200 processed (or "no matching order") · 503/500 on config/processing errors (so gateways re-deliver). Legal transitions enforced in `server/orders.js` (`pending→paid|failed|cancelled`, `failed→paid|cancelled`, `cancelled→paid`, `paid→refunded` only); replays can't downgrade `paid`, receipt sends exactly once (`receiptSent` flag). On paid: customer receipt + company notification + orders-sheet row (sheet/notify failures are logged, never break processing).
- **`GET /admin/orders[?status=]`** — `Authorization: Bearer <ADMIN_TOKEN>`, constant-time compare; full records including addresses. 401 · 503 with the real store error (admin-facing).
- **There is no Stripe route, placeholder or otherwise.** There are also no fulfilment API routes — fulfilment happens in the Google Sheet (§5, §9).

---

## 4. Frontend forms

| Form | Location | Endpoint | Fields (name → payload) | Client validation | Success | Error | Production |
|---|---|---|---|---|---|---|---|
| Contact | `contact.html` (form `[data-contact]`), handler `assets/js/main.js` ~line 404 | `POST /api/contact` | `name`, `email`, `institution`, `topic` (select), `message` | HTML `required` on name/email/message; server re-validates | Form replaced with "Received — a member of the lab team replies within one working day." | Toast with server `error` or generic; button re-enabled | Works once deploy live + SMTP env set (§6) |
| Lot Report signup | Footer + index newsletter section (forms `[data-newsletter]`), handler `main.js` ~line 374 | `POST /api/subscribe` | email input → `{email, source:"<page>-newsletter"}` | Email regex client + server | Form replaced with "Confirmed — check your inbox for your welcome offer." | Toast; button re-enabled | Needs `SUBSCRIBERS_WEBHOOK_*` (§5) |
| Cart / checkout | `cart.html` inline script (~line 133 `checkout()`) | `POST /api/checkout` | `co-email, co-name, co-line1, co-line2, co-postal, co-city, co-country, co-code` → `{cart, customer:{email,name}, shipping:{name,line1,line2,city,postalCode,country}, discountCode}` | Email regex; required name/line1/postal/city/country; values persisted to `sessionStorage["nuvamin-checkout"]` | Browser redirected to `redirectUrl` (hosted gateway page) | Toast with server `error` ("Checkout isn't available right now…" in current prod) | **Intentionally disabled in production** (no provider; §8/§13) |
| Confirmation poll | `confirmation.html` ~line 69 | `GET /api/orders/:id` | — | — | Polls status until `paid` → renders receipt summary | Failed/cancelled → `failed.html` messaging | Needs order store |
| Checkout gate / verification / terms forms | — | — | — | — | — | — | **Do not exist** (declined scope, §13) |

Cart state lives in `localStorage` (`nvCart` in `assets/js/main.js`); catalog data for rendering in `assets/js/products.js` (display) with authoritative prices in `server/catalog.js` (10 products: retatrutide 10/30MG, tirzepatide 10MG, tesamorelin 10/20MG, GHK-Cu 50/100MG, BPC-157 10MG, TB-500 5MG, NAD+ 500MG; flat $6 shipping, free ≥ $60).

---

## 5. Google Sheets integration

**Design: no Google service account, no Google API keys.** Each sheet has a bound Apps Script deployed as a **web app** (execute as *Me*, access: *Anyone*); the server POSTs JSON to the web-app URL with a shared secret. The scripts run as the sheet owner and send email via that account's Gmail. Full copy-paste setup: **`GOOGLE-WORKSPACE-SETUP.md`** (in repo).

| | Subscribers ("The Lot Report") | Orders / fulfilment board |
|---|---|---|
| Purpose | Newsletter list; welcome email w/ `LOT10`; lot-drop announcements; unsubscribes | One row per **paid** order; ticking "Fulfilled ✓" auto-sends the designed shipping-confirmation email |
| Spreadsheet (client-provided) | `1Lev2ZJmEEvsbLmDzKBBvcTDXTtmFJ1fTMoEsPBWLvys` | `1WUBVvqSnMu0LizFn3o4XWHEq2bLivBFipJdwtt-iYqs` |
| Script to paste | `google/nuvamin-subscribers.gs` | `google/nuvamin-orders.gs` |
| Expected tab name | `Subscribers` | `Orders` |
| Columns | Email, Signed up, Source, Status, Welcome sent, Unsubscribed at | Order, Placed, Status, Customer, Email, Items, Ship to, Total, Fulfilled ✓, Tracking #, Carrier, Shipped at, Txn, Data (hidden JSON) |
| Vercel env vars | `SUBSCRIBERS_WEBHOOK_URL`, `SUBSCRIBERS_WEBHOOK_SECRET` | `SHEETS_WEBHOOK_URL`, `SHEETS_WEBHOOK_SECRET` |
| Written by | `server/app.js` (`postToSubscribersSheet`, subscribe/unsubscribe routes) | `server/sheets.js` (`logOrder`, called from the payment webhook on paid) |
| In-sheet constants to sync | `SECRET`, `DISCOUNT_CODE`/`DISCOUNT_PERCENT` (= `LOT10`/10) | `SECRET` |

**Spreadsheet IDs are not hardcoded in the server** — the code only knows the deployed web-app URL from env. The IDs above are recorded from the client's own links so the next developer knows which sheet is which.

**To test a write (after deploying a script):**
```bash
# Direct to the Apps Script (replace URL + secret):
curl -sL -X POST "https://script.google.com/macros/s/DEPLOYMENT_ID/exec" \
  -H 'Content-Type: application/json' \
  -d '{"secret":"YOUR_SECRET","action":"subscribe","email":"test@example.com","source":"handoff-test"}'
# Through the site (production):
curl -s -X POST https://nuvamin.bio/api/subscribe -H 'Content-Type: application/json' \
  -d '{"email":"test@example.com","source":"handoff-test"}'
```
A row should appear within seconds, and the test address should receive the welcome email. Delete test rows afterwards.

**Common failure modes:**
1. **Secret mismatch** — the script replies HTTP 200 with body `"forbidden"`; because it's a 200, `server/app.js`/`server/sheets.js` currently treat it as success (signup "works", no row appears). Fix candidate in §14. Check: run the direct curl above and read the body.
2. Web app deployed with access "Anyone **with Google account**" instead of "Anyone" — server POSTs get a login redirect; rows never land.
3. Script edited but not **re-deployed** — Apps Script web apps serve the last *deployment*, not the editor state. Deploy → Manage deployments → edit → new version.
4. `setup()` never run — headers/checkboxes/trigger missing; the fulfilment email trigger (`onEditFulfil`) is installed by `setup()`.
5. Env vars set in Vercel but **no redeploy** — env changes only apply to new deployments (§6).

---

## 6. Vercel environment variables

**Every change to env vars requires a redeploy to take effect** (Vercel bakes env into the deployment). After editing: Deployments → ⋯ on the latest → Redeploy (or push any commit).

| Variable | Used by | Required in prod | Example (fake) | If missing | Redeploy? |
|---|---|---|---|---|---|
| `PUBLIC_BASE_URL` | `server/config.js` → return/webhook URLs, email links | **Yes** | `https://nuvamin.bio` | Gateway returns/webhooks and email links point at localhost | Yes |
| `ORDER_STORE` | `server/orders.js` | Auto | `redis` | Auto-resolves to `redis` when Upstash vars exist, else `file` → order routes 503 on Vercel | Yes |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | order store | **Yes** (for orders) | `https://xxx.upstash.io` / `AX…` | Order create/lookup/admin 503; health shows the exact message | Yes — added automatically by Vercel Marketplace → Upstash integration |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | `server/email.js` | **Yes** (contact + receipts) | `smtp.gmail.com` / `465` / `labs@nuvamin.bio` / Gmail **app password** | Contact 502; receipts/notifications fail (logged). Gmail app passwords may be pasted with spaces — stripped automatically for gmail hosts | Yes |
| `RECEIPT_FROM` | email From identity | Recommended | `Nuvamin <labs@nuvamin.bio>` | Defaults to that value | Yes |
| `SUPPORT_EMAIL` / `CONTACT_TO` / `ORDER_NOTIFY_EMAIL` | email routing | Recommended | `support@nuvamin.bio` | Sensible defaults (support@/labs@) | Yes |
| `SHEETS_WEBHOOK_URL` / `SHEETS_WEBHOOK_SECRET` | `server/sheets.js` (orders board) | Yes (fulfilment) | `https://script.google.com/macros/s/…/exec` / long random | Paid orders not logged to the sheet (logged server-side only) | Yes |
| `SUBSCRIBERS_WEBHOOK_URL` / `SUBSCRIBERS_WEBHOOK_SECRET` | subscribe/unsubscribe routes | Yes (list) | as above | Signup 503 in production; unsubscribe links can't verify | Yes |
| `FIRST_ORDER_DISCOUNT_CODE` / `FIRST_ORDER_DISCOUNT_PERCENT` | checkout discount | No | `LOT10` / `10` | Defaults LOT10/10 — must match the `.gs` constants | Yes |
| `ADMIN_TOKEN` | `/admin/orders` | Yes (to use admin) | 40+ random chars | Admin endpoint always 401 | Yes |
| `PAYMENT_PROVIDER` | gateway factory | **Intentionally unset** | `mock` \| `nmi` \| `authorizenet` | Defaults to `mock`, which is refused in production → checkout 503 (current intended state; §8/§13) | Yes |
| `ALLOW_MOCK_GATEWAY` | gateway factory | **Never in prod** | `true` | — (staging demos only; mock payments are forgeable by design) | Yes |
| `NMI_*` (`NMI_CHECKOUT_URL`, `NMI_PROCESSOR_ACCOUNT_ID`, `NMI_SECURITY_KEY`, `NMI_WEBHOOK_SECRET`) / `AUTHNET_*` | provider adapters | Only if that provider is activated | see `.env.example` | Selected provider refuses to construct (clean 503 now) | Yes |
| `CHECKOUT_SUCCESS_PATH` / `CHECKOUT_CANCEL_PATH` / `WEBHOOK_PATH` | route paths | No | defaults `/checkout/success` etc. | Defaults fine | Yes |
| `CURRENCY` | pricing display | No | `USD` | Defaults USD | Yes |
| `PORT` | local dev only | No | `3000` | — | — |

**The current production env issue, precisely:** Upstash vars and `PAYMENT_PROVIDER` were never set (plus, before `51eded6`, either omission crashed the whole function). What each subsystem still needs is exactly what `GET https://nuvamin.bio/api/health` reports after deploy.

---

## 7. Email system

Provider: **plain SMTP via nodemailer** (`server/email.js`), designed for Gmail/Google Workspace with an app password. In development (SMTP unset), messages print to the console; in production, missing SMTP is now a hard error (no silent success). Sheet-side emails are sent by **Apps Script via the sheet owner's Gmail** (no SMTP involved).

| Email | Trigger | To | Sender | Status |
|---|---|---|---|---|
| Contact-form message | `POST /api/contact` | `CONTACT_TO` (support@), Reply-To = visitor | server SMTP | **Implemented** |
| Order receipt ("Good things are coming.") | payment webhook flips order to `paid` (exactly once) | customer | server SMTP (`RECEIPT_FROM`, labs@) | Implemented — fires only when a real provider is live |
| New-order notification | same webhook | `ORDER_NOTIFY_EMAIL` (labs@) | server SMTP | Implemented — same condition |
| Shipped confirmation (tracking + carrier) | "Fulfilled ✓" ticked in the Orders sheet | customer | **Apps Script / owner's Gmail** | Implemented (needs script deployed + `setup()` run) |
| Welcome (LOT10 offer) | new row via subscribe | subscriber | Apps Script / Gmail | Implemented |
| Lot-drop announcement | sheet menu "Nuvamin → Send lot-drop email…" | all Active subscribers | Apps Script / Gmail | Implemented |
| Unsubscribe handling | HMAC link in emails → `/api/unsubscribe` | — | — | Implemented |
| Rejection / more-information-needed / approval emails | — | — | — | **Not implemented** — part of the declined review-flow scope (§13); no order-review pipeline exists to trigger them |

All customer-facing templates carry the research-use-only footer ("supplied strictly for laboratory research use only. Not for human or veterinary use.").

---

## 8. Stripe / payment code status

**What exists:**
- `server/gateway/` — provider-adapter architecture: `base.js` (interface: `createCheckoutSession(order, urls)`, `verifyWebhook(req)`), `mock.js` (full local simulation, signed webhooks), `nmi.js` (NMI Collect Checkout hosted redirect), `authorizenet.js` (stub adapter), `index.js` (factory; fails fast on misconfiguration; never silently falls back to mock; config errors are `GATEWAY_CONFIG`-coded and surface as 503s on payment routes only).
- Feature flags: `PAYMENT_PROVIDER` selects the adapter; `ALLOW_MOCK_GATEWAY=true` is the only way mock runs in production (for staging demos; mock payments are forgeable by design — do not enable it on the real domain).
- Frontend: `cart.html` posts to `/api/checkout` and redirects to whatever `redirectUrl` the adapter returns. No card fields exist anywhere on the site; card entry is by design on the gateway's hosted PCI page.

**What does not exist — verified by search, not just memory:**
- No Stripe SDK, import, route, key reference, PaymentIntent/Checkout Session logic, or frontend Stripe.js. `grep -ri stripe` matches nothing but documentation.
- No manual-capture / authorization-only flow in any adapter (the NMI adapter is a standard sale flow).
- No buyer-verification model, no terms-acceptance recording (timestamp/IP/terms-version), no pending-review/approve/reject statuses (§9).

**Why (previous developer's boundary, stated plainly):** I declined to wire any live payment processing, Stripe included, or the capture-on-approval/fulfilment activation for this catalog (GLP-1/GH-axis research peptides sold to the public behind self-attestation). That is a refusal I hold regardless of test mode or feature flags, and it is documented as a **blocker in §13**, not hidden. Nothing was deleted or sabotaged: the adapter architecture, order model, webhook pipeline, emails, and sheet fulfilment all exist and are testable end-to-end with the mock provider.

**For whoever takes this on:** the client's requirements (their own spec: research-use terms gate, buyer verification fields, authorization-only payment, pending-review queue, capture on approval, status-driven emails) live in the client's project notes — this document intentionally does not turn them into an implementation guide. The natural integration points are the gateway interface above, the order model in `server/orders.js`, and the checkout route; a Stripe integration would also need its own webhook verification (Stripe signs differently than the `Webhook-Signature` HMAC scheme used here). Whether and how to proceed is a decision for the client, their counsel, and their payment processor.

---

## 9. Order & fulfilment code status

**Cart → order flow (as built):** localStorage cart → `cart.html` delivery form → `POST /api/checkout` (server-side pricing, validation, LOT10 check) → order stored **pending** → adapter's hosted page → gateway webhook (signed, raw-body verified) → status transition → on `paid`: receipt + company notification + orders-sheet row → fulfilment happens **in the sheet** (tick Fulfilled ✓ → shipped email, timestamp, status flip).

**Order record structure** (`server/orders.js` `createOrder`):
```
{ id: "NV-<16 hex>", status, currency,
  items: [{id, name, mg, unitPrice, quantity, lineTotal}],
  subtotal, discount, discountCode, shipping, total,
  customer: {email, name},
  shippingAddress: {name, line1, line2, city, postalCode, country},
  payment: {provider, sessionId, transactionId, last4},   // display last4 only; never a PAN
  receiptSent, createdAt, updatedAt,
  events: [{at, type, status}] }                          // full audit trail
```

**Statuses (implemented):** `pending → paid | failed | cancelled`, `failed → paid | cancelled`, `cancelled → paid` (webhook outranks a return-URL cancel), `paid → refunded`. Enforced centrally in `setStatus`; illegal/replayed transitions are rejected and logged.

**Statuses (NOT implemented):** `pending review`, `approved`, `rejected`, `more-information-needed`, `fulfilled`, `shipped` as *order-store* statuses. Fulfilment/shipped state lives only in the Google Sheet columns (Fulfilled ✓ / Shipped at), not in the app's order records. There is no review queue, no approval UI, no manual-capture step. (Declined scope — §13.)

**Storage:** `ORDER_STORE=file` (JSON at `server/data/orders.json`, local dev) or `redis` (Upstash REST; required on Vercel). Same async API either way. Sheet columns are listed in §5.

---

## 10. Frontend / design work completed

- **Pages:** all 13 built and styled to the editorial black/cream system (Space Grotesk / Fraunces / Inter, self-hosted woff2); shared header/footer injected by `assets/js/main.js`; legal pages (`privacy`, `terms`, `shipping-returns`) exist with placeholder copy marked for counsel.
- **Motion system:** scroll reveals (IntersectionObserver, `.reveal`/`in-view`), hero entrance, marquee, accordions, cart badge pulse, toasts; `prefers-reduced-motion` respected.
- **This session's copy changes (commit `ec6a60d`, from the client's PDF):** hero paragraph and stat ("Controlled dispatch, −20 °C", "Est. 2014"), "Research deserves certainty." section with four rewritten cells, verification section relabels (Identity & Purity / Verified Content / Quality Control / Batch Documentation), removed the certificate quote, "Inside the lab" caption, "Control at every step" section (Manufactured in house / Controlled operations / Direct distribution), newsletter "Batch releases." copy, footer link "Shipping & handling" (`assets/js/main.js`).
- **Compliance safeguards present:** research-use-only banner/footer sitewide, RUO lines on product/cart/checkout/emails, eligibility card on contact page, no dosing/human-use instructions anywhere. **Do not weaken these** (§15).
- **Known visual bugs:** none open. QC on the copy commit: browser screenshots desktop+mobile, zero console errors, valid HTML.
- **Remaining polish (optional):** legal-page placeholder copy needs counsel's real text; email PNG product images exist for all 10 catalog ids (`assets/img/email/`) — verify after any catalog change.

---

## 11. Files changed in this session

| File | Change |
|---|---|
| `index.html` | Client-PDF copy edits (text only, ~27 edits; commit `ec6a60d`) |
| `assets/js/main.js` | Footer link text "Shipping & cold chain" → "Shipping & handling" (`ec6a60d`) |
| `server/orders.js` | Lazy store driver; `ORDER_STORE_CONFIG` error code; `storeStatus()` probe (`51eded6`) |
| `server/app.js` | Lazy gateway; `/api/health`; per-route error containment (checkout/webhook/orders/admin/returns/mock); config-based mock mounting; honest prod subscribe (`51eded6`) |
| `server/gateway/index.js` | `GATEWAY_CONFIG` error code; comment corrected (`51eded6`) |
| `server/email.js` | Production missing-SMTP now errors instead of silent console success (`51eded6`) |
| `server/gateway/mock.js` | Stale "auto-fallback" comment corrected (`51eded6`) |
| `HANDOFF_NUVAMIN.md` | This document |

---

## 12. Testing checklist

**Local:**
```bash
npm install && npm start                      # mock gateway + file store on :3000
curl -s localhost:3000/api/health             # everything ok:true (email.configured false is fine locally)
# Full checkout e2e: add items on the site → cart → fill delivery → Checkout
# → mock hosted page → "Pay" → confirmation page flips to paid; receipt prints in the console.
# Or headless:
curl -s -X POST localhost:3000/api/checkout -H 'Content-Type: application/json' \
  -d '{"cart":{"bpc-157":2},"customer":{"email":"qa@example.com"},"shipping":{"name":"QA","line1":"1 Test St","city":"Testville","postalCode":"12345","country":"US"}}'
# → {orderId, redirectUrl}; then:
curl -s -X POST localhost:3000/mock-hosted/complete -d 'order=<ORDER_ID>&outcome=paid'
curl -s localhost:3000/api/orders/<ORDER_ID>            # "status":"paid"
# Production-env simulation (must boot and degrade gracefully, never crash):
NODE_ENV=production VERCEL=1 VERCEL_ENV=production PORT=3101 node server/app.js
```

**Production (after every deploy):**
```bash
curl -s https://nuvamin.bio/api/health | python3 -m json.tool   # 1) the master check
curl -s -X POST https://nuvamin.bio/api/contact -H 'Content-Type: application/json' \
  -d '{"name":"Deploy Test","email":"you@example.com","topic":"test","message":"handoff production test"}'
# expect {"ok":true} AND the message in the support@nuvamin.bio inbox (Reply-To = you@example.com)
curl -s -X POST https://nuvamin.bio/api/subscribe -H 'Content-Type: application/json' \
  -d '{"email":"you+test@example.com","source":"deploy-test"}'
# expect {"ok":true} AND a new Subscribers row AND the welcome email
curl -s https://nuvamin.bio/api/orders/NV-DOESNOTEXIST
# expect {"error":"not found"} once the store is configured; {"error":"Order lookup…unavailable."} 503 before
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://nuvamin.bio/admin/orders   # [] when empty
```
Expected failures to recognize: contact 502 → SMTP env missing/wrong app password; subscribe 503 → `SUBSCRIBERS_WEBHOOK_URL` unset; subscribe `{"ok":true}` but **no sheet row** → secret mismatch or wrong web-app access (§5); any order route 503 → Upstash not connected; **everything** 500 with `FUNCTION_INVOCATION_FAILED` → boot crash regression, check function logs immediately.

**Sheets:** row appears within ~5s of the API call; welcome email arrives; ticking Fulfilled ✓ on an orders row sends the shipped email and stamps "Shipped at".

**Vercel logs:** vercel.com → project **nuvamin** → Observability → Logs (live tail), or Deployments → select deployment → Functions. Env vars: Settings → Environment Variables (redeploy after changes — §6).

---

## 13. Known blockers

**Technical blockers:** none in code. The API boots and degrades cleanly regardless of configuration.

**Missing env vars (production):** Upstash pair (or the Storage-tab integration), `SMTP_*` (if not already set), `SHEETS_WEBHOOK_*`, `SUBSCRIBERS_WEBHOOK_*`, `ADMIN_TOKEN`, `PUBLIC_BASE_URL` — `GET /api/health` is the live checklist.

**Missing credentials:** no payment-provider account/credentials exist in the project (no NMI keys, no Authorize.Net keys, no Stripe account keys). Nothing in the repo can charge a card today.

**Previous developer's boundary blockers (mine):** I declined to (a) wire any live payment provider — Stripe included, test mode included — for this catalog, (b) build the buyer-verification/pending-review/capture-on-approval pipeline, and (c) activate order fulfilment for these compounds. Reason, briefly: the catalog is research peptides with well-documented human-use diversion (retatrutide, tirzepatide, tesamorelin), the proposed gate is self-attestation, and I wasn't willing to build the machinery that takes payment for and ships them on that basis — regardless of downstream approval by Stripe or counsel. This is a personal-scope refusal, recorded here so it is planned around, not discovered. Everything neutral (this fix, diagnostics, docs, design, compliance copy) was completed.

**Client / compliance / processor blockers (independent of the above):** Stripe (or any processor) must actually approve this business category for the client's account — peptide sellers commonly require pre-approval and evidence of controls; the legal pages are placeholder copy awaiting counsel; a real review of the verification model (self-attestation vs. institutional verification) is the client's to make with counsel before any payment activation.

---

## 14. Next developer TODO list

Ordered; each with files and acceptance criteria.

1. **Connect Upstash Redis (config-only).** Vercel → Storage → Upstash → attach to the project → redeploy. *Files:* none. *Accept:* `/api/health` → `orderStore:{ok:true,driver:"redis"}`; `GET /api/orders/NV-X` returns 404 (not 503).
2. **Verify/complete SMTP env.** Vercel env: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=labs@nuvamin.bio`, `SMTP_PASS=<Gmail app password>` (+ `PUBLIC_BASE_URL=https://nuvamin.bio`), redeploy. *Accept:* production contact curl (§12) returns `{ok:true}` and the mail lands in support@ with correct Reply-To.
3. **Deploy both Apps Scripts and set the four webhook env vars.** Paste `google/*.gs` into the two sheets, set `SECRET`s, run `setup()`, deploy as web app (*execute as Me*, access *Anyone*), copy URLs/secrets into Vercel, redeploy. *Files:* `google/nuvamin-subscribers.gs`, `google/nuvamin-orders.gs`. *Accept:* §12 subscribe test writes a row + welcome email; test row in Orders + Fulfilled ✓ sends the shipped email.
4. **Detect the Apps Script "forbidden" false-success.** In `server/app.js` `postToSubscribersSheet` and `server/sheets.js` `logOrder`, read the response body and treat non-JSON/`forbidden` as failure. *Accept:* wrong secret → subscribe returns 502 (not `{ok:true}`), server log names the cause.
5. **Set `ADMIN_TOKEN`** (long random) and record it in the client's password manager. *Accept:* `/admin/orders` 401 without, 200 with.
6. **Replace legal-page placeholder copy with counsel-approved text.** *Files:* `privacy.html`, `terms.html`, `shipping-returns.html` (+ any new Research Use Terms page counsel wants; wire footer links in `assets/js/main.js`). *Accept:* no `[PLACEHOLDER]` markers remain; counsel signs off.
7. *(Optional hardening)* **Gate `/api/health` detail behind `ADMIN_TOKEN`** — return bare `{ok:true}` publicly, full `checks` only with the bearer token. *Files:* `server/app.js`. *Accept:* unauthenticated response contains no error strings.
8. **BLOCKED (see §13 — client + counsel + processor decision first): payment activation and the restricted-buyer review flow.** Not specified here by design. Involves `server/gateway/*` (new adapter), `server/orders.js` (statuses), `server/app.js` (checkout/webhook), `cart.html` (gate UI), plus processor onboarding. Treat the client's own written spec as the requirements source; build only after the approvals in §13 exist.

---

## 15. Safe handoff rules (state of compliance)

- **Preserved:** nothing was deleted or disabled this session. All cart/order/gateway/fulfilment code is intact and mock-testable; the payment scope above is *unbuilt*, not *removed*.
- **Research-use warnings and compliance language:** intact sitewide and in every email template. **Do not remove or weaken them.** They are part of the client's risk posture (and any future processor review will look for them).
- **No hidden broken imports:** the full import graph of `api/index.js` was audited; nothing throws at module scope anymore. Verified by booting with every subsystem deliberately unconfigured.
- **No production routes crash at boot:** that failure class is structurally removed (lazy resolution + per-route containment). If it ever regresses, the symptom is every `/api` route 500ing at once — check the function logs for a module-scope throw first.
- **Blocked ≠ broken:** the payment/review scope is marked blocked in §13/§14 with its reason. Hand it to whoever the client chooses; everything they need that exists is documented above, and nothing they need was half-deleted.
