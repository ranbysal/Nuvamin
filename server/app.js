"use strict";

/**
 * Nuvamin — storefront static host + invoice-first order API.
 *
 * Route map:
 *   GET  /api/health              boot + configuration diagnostics (no secrets)
 *   POST /api/checkout            place order; invoice mode emails payment options
 *   POST /api/orders/:id/confirm-payment
 *                                 Sheet-only payment confirmation action
 *   GET  /checkout/success        gateway return (success) -> confirmation page
 *   GET  /checkout/cancel         gateway return (cancel)  -> failed page
 *   POST /api/webhook/payment     signed webhook — SOURCE OF TRUTH for status
 *   GET  /api/orders/:id          public order status (for the confirmation page)
 *   GET  /admin/orders            admin-readable order records (Bearer token)
 *   GET  /mock-hosted             simulated hosted page (mock provider ONLY)
 *   POST /mock-hosted/complete    mock page action -> fires signed webhook
 *   (static)                      site pages + assets ONLY — never server code,
 *                                 order data, configs or docs
 */

const path = require("path");
const crypto = require("crypto");
const express = require("express");

const config = require("./config");
const catalog = require("./catalog");
const orders = require("./orders");
const email = require("./email");
const sheets = require("./sheets");
const { getGateway } = require("./gateway");
const { MOCK_PAGE } = require("./views");

const MockGateway = require("./gateway/mock");

const app = express();
const ROOT = path.join(__dirname, "..");

// Capture the raw body (needed for webhook signature verification) while still
// parsing JSON / urlencoded for normal handlers. Bodies are small (a cart +
// an address) — cap them.
app.use(
  express.json({
    limit: "32kb",
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: "32kb" }));

// The payment gateway is resolved LAZILY, on first use by a payment route.
// Resolving it here at import time crashed the entire serverless function
// whenever payment config was missing (e.g. PAYMENT_PROVIDER unset in
// production) — which took the contact form and the mailing list down with
// it. A payment misconfiguration must only ever degrade the payment routes.
let _gateway = null;
function gateway() {
  if (!_gateway) {
    _gateway = getGateway();
    console.log(`[nuvamin] payment provider: ${_gateway.name}`);
  }
  return _gateway;
}

/* ------------------------------------------------------------ rate limit */

// Minimal in-memory limiter. Per-instance (resets on deploy / new serverless
// instance) — enough to blunt abuse of order creation and the contact form.
function makeRateLimit(max, windowMs, message) {
  const buckets = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const ip = req.ip || "unknown";
    const hits = (buckets.get(ip) || []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      return res.status(429).json({ error: message });
    }
    hits.push(now);
    buckets.set(ip, hits);
    if (buckets.size > 10_000) buckets.clear(); // crude memory cap
    next();
  };
}

const rateLimitCheckout = makeRateLimit(10, 60_000, "Too many checkout attempts. Please wait a minute.");
const rateLimitContact = makeRateLimit(5, 60_000, "Too many messages. Please wait a minute and try again.");

/* ------------------------------------------------------------ validation */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cleanStr(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
}

function secureSecretMatch(actual, expected) {
  if (!expected) return false;
  const a = Buffer.from(String(actual || ""));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Validate + normalize customer contact and shipping address.
 * Returns { error } or { customer, shipping }.
 */
function validateCustomer(body) {
  const rawCustomer = (body && body.customer) || {};
  const rawShip = (body && body.shipping) || {};

  const emailAddr = cleanStr(rawCustomer.email, 200);
  if (!EMAIL_RE.test(emailAddr)) {
    return { error: "A valid email address is required for your receipt." };
  }

  const shipping = {
    name: cleanStr(rawShip.name, 120),
    line1: cleanStr(rawShip.line1, 200),
    line2: cleanStr(rawShip.line2, 200),
    city: cleanStr(rawShip.city, 120),
    postalCode: cleanStr(rawShip.postalCode, 20),
    country: cleanStr(rawShip.country, 90),
  };
  const missing = ["name", "line1", "city", "postalCode", "country"].filter((k) => !shipping[k]);
  if (missing.length) {
    return { error: "Please complete the shipping address (" + missing.join(", ") + ")." };
  }

  return {
    customer: { email: emailAddr, name: shipping.name },
    shipping,
  };
}

/* ---------------------------------------------------------------- checkout */

function orderPlacedUrl(order, emailSent) {
  return (
    "/order-placed.html?order=" + encodeURIComponent(order.id) +
    "&email=" + (emailSent ? "sent" : "delayed")
  );
}

async function deliverPlacedOrder(order) {
  const [invoiceResult, sheetResult, notifyResult] = await Promise.allSettled([
    order.invoiceSent ? Promise.resolve({ sent: true }) : email.sendPaymentRequest(order),
    order.sheetLogged ? Promise.resolve({ logged: true }) : sheets.logOrder(order),
    order.orderPlacedNotificationSent
      ? Promise.resolve({ sent: true })
      : email.sendOrderPlacedNotification(order),
  ]);

  const invoiceSent = invoiceResult.status === "fulfilled" && invoiceResult.value.sent === true;
  const sheetLogged = sheetResult.status === "fulfilled" && sheetResult.value.logged === true;
  const notificationSent = notifyResult.status === "fulfilled" && notifyResult.value.sent === true;

  if (invoiceResult.status === "rejected") {
    console.error(`[order:${order.id}] payment email failed:`, invoiceResult.reason.message);
  }
  if (notifyResult.status === "rejected") {
    console.error(`[order:${order.id}] internal notification failed:`, notifyResult.reason.message);
  }

  await orders.updateOrder(
    order.id,
    (o) => {
      if (invoiceSent) o.invoiceSent = true;
      if (sheetLogged) o.sheetLogged = true;
      if (notificationSent) o.orderPlacedNotificationSent = true;
    },
    "invoice:delivery-attempted"
  );

  return { invoiceSent, sheetLogged, notificationSent };
}

async function finalizePaidOrder(order, { logToSheet = false } = {}) {
  let current = (await orders.getOrder(order.id)) || order;
  let receiptError = null;

  if (!current.receiptSent) {
    try {
      const sent = await email.sendReceipt(current);
      if (sent && sent.sent) {
        current =
          (await orders.updateOrder(current.id, (o) => (o.receiptSent = true), "receipt:sent")) || current;
      }
    } catch (err) {
      receiptError = err;
      console.error(`[order:${current.id}] confirmation email failed:`, err.message);
    }
  }

  if (!current.paidNotificationSent) {
    try {
      await email.sendOrderNotification(current);
      current =
        (await orders.updateOrder(
          current.id,
          (o) => (o.paidNotificationSent = true),
          "notification:paid-sent"
        )) || current;
    } catch (err) {
      console.error(`[order:${current.id}] paid notification failed:`, err.message);
    }
  }

  if (logToSheet && !current.sheetLogged) {
    const logged = await sheets.logOrder(current);
    if (logged.logged) {
      current =
        (await orders.updateOrder(current.id, (o) => (o.sheetLogged = true), "sheet:logged")) || current;
    }
  }

  return { order: current, receiptError };
}

// Invoice mode is the production default. Stripe remains available behind
// CHECKOUT_MODE=stripe, but it is never touched while invoice mode is active.
app.post("/api/checkout", rateLimitCheckout, async (req, res) => {
  try {
    if (config.checkoutMode !== "invoice" && config.checkoutMode !== "stripe") {
      return res.status(503).json({ error: "Ordering isn't available right now. Please try again later." });
    }

    // Resolve Stripe before creating an order so bad Stripe configuration
    // cannot create an orphan. Invoice mode deliberately skips the gateway.
    const gw = config.checkoutMode === "stripe" ? gateway() : null;
    const rawCart = (req.body && req.body.cart) || {};
    const pricing = catalog.priceOrder(rawCart);

    if (pricing.items.length === 0) {
      return res.status(400).json({ error: "Your cart is empty." });
    }

    const checked = validateCustomer(req.body);
    if (checked.error) {
      return res.status(400).json({ error: checked.error });
    }

    if (config.checkoutMode === "invoice") {
      const sheetWorkflow = await sheets.invoiceWorkflowStatus();
      if (!sheetWorkflow.ready) {
        console.error("[checkout] invoice sheet workflow is not ready:", sheetWorkflow.reason || sheetWorkflow);
        return res.status(503).json({
          error: "Ordering is being configured right now. Please try again shortly.",
        });
      }
    }

    // Optional first-order discount code (the Lot Report welcome offer).
    const codeInput = cleanStr(req.body && req.body.discountCode, 40).toUpperCase();
    if (codeInput) {
      if (codeInput !== config.discount.code || config.discount.percent <= 0) {
        return res.status(400).json({ error: "That discount code isn't valid." });
      }
      const all = await orders.listOrders({ status: orders.STATUS.PAID });
      const hasOrdered = all.some(
        (o) => (o.customer.email || "").toLowerCase() === checked.customer.email.toLowerCase()
      );
      if (hasOrdered) {
        return res.status(400).json({ error: "That code is only valid on your first order." });
      }
      pricing.discountCode = codeInput;
      pricing.discount = Number(((pricing.subtotal * config.discount.percent) / 100).toFixed(2));
      pricing.total = Number((pricing.subtotal - pricing.discount + pricing.shipping).toFixed(2));
    }

    const rawRequestId = cleanStr(req.body && req.body.requestId, 100);
    const requestId = /^[A-Za-z0-9_-]{16,100}$/.test(rawRequestId) ? rawRequestId : "";

    if (config.checkoutMode === "invoice" && requestId) {
      const existing = await orders.findByRequestId(requestId);
      if (existing && existing.payment && existing.payment.provider === "manual_invoice") {
        const delivered = await deliverPlacedOrder(existing);
        return res.json({
          orderId: existing.id,
          redirectUrl: orderPlacedUrl(existing, delivered.invoiceSent || existing.invoiceSent),
          emailSent: delivered.invoiceSent || existing.invoiceSent,
          duplicatePrevented: true,
        });
      }
    }

    const order = await orders.createOrder({
      pricing,
      customer: checked.customer,
      shipping: checked.shipping,
      currency: config.currency,
      requestId,
    });

    if (config.checkoutMode === "invoice") {
      const invoiceOrder = await orders.updateOrder(
        order.id,
        (o) => {
          o.payment.provider = "manual_invoice";
          o.payment.method = "awaiting_selection";
        },
        "invoice:created"
      );
      const delivered = await deliverPlacedOrder(invoiceOrder);
      return res.json({
        orderId: invoiceOrder.id,
        redirectUrl: orderPlacedUrl(invoiceOrder, delivered.invoiceSent),
        emailSent: delivered.invoiceSent,
      });
    }

    const session = await gw.createCheckoutSession(order, config.urls);
    await orders.updateOrder(
      order.id,
      (o) => {
        o.payment.provider = gw.name;
        o.payment.sessionId = session.sessionId;
      },
      "checkout:session-created"
    );
    return res.json({ orderId: order.id, redirectUrl: session.redirectUrl });
  } catch (err) {
    if (err.code === "GATEWAY_CONFIG" || err.code === "ORDER_STORE_CONFIG") {
      console.error("[checkout] unavailable — configuration:", err.message);
      return res.status(503).json({ error: "Ordering isn't available right now. Please try again later." });
    }
    console.error("[checkout] error:", err.message);
    return res.status(502).json({ error: "Unable to place your order. Please try again." });
  }
});

/* ------------------------------------------------------------------ health */

// Boot + configuration diagnostics. Never throws and never touches secrets:
// each subsystem reports its own state, so a production misconfiguration is
// visible in one request instead of presenting as a crashed function.
app.get("/api/health", async (req, res) => {
  let gatewayCheck = { ok: true, active: false, provider: config.provider };
  if (config.checkoutMode === "stripe") {
    try {
      gatewayCheck = { ok: true, active: true, provider: gateway().name };
    } catch (e) {
      gatewayCheck = { ok: false, active: true, error: e.message };
    }
  }
  const manualMethods = email.configuredPaymentMethods().map((method) => method.name);
  const invoiceSheet =
    config.checkoutMode === "invoice"
      ? await sheets.invoiceWorkflowStatus()
      : { ready: true, reason: "not-required" };
  res.json({
    ok: true,
    service: "nuvamin-api",
    time: new Date().toISOString(),
    env: { vercel: config.onVercel, production: config.isProduction },
    checks: {
      checkout: {
        ok:
          config.checkoutMode === "stripe" ||
          (config.checkoutMode === "invoice" && invoiceSheet.ready),
        mode: config.checkoutMode,
        configuredManualMethods: manualMethods,
        invoiceSheetReady: invoiceSheet.ready,
      },
      orderStore: orders.storeStatus(),
      gateway: gatewayCheck,
      email: { configured: Boolean(config.email.host && config.email.user) },
      ordersSheet: { configured: Boolean(config.sheets.webhookUrl) },
      subscribersSheet: { configured: Boolean(config.subscribers.webhookUrl) },
    },
  });
});

/* ----------------------------------------------------------------- contact */

// Contact form → company inbox (CONTACT_TO). Reply-To is the visitor, so
// replies go straight back to them from the client's mailbox.
app.post("/api/contact", rateLimitContact, async (req, res) => {
  const b = req.body || {};
  const msg = {
    name: cleanStr(b.name, 120),
    email: cleanStr(b.email, 200),
    institution: cleanStr(b.institution, 200),
    topic: cleanStr(b.topic, 120),
    message: cleanStr(b.message, 5000),
  };
  if (!msg.name) return res.status(400).json({ error: "Please tell us your name." });
  if (!EMAIL_RE.test(msg.email)) return res.status(400).json({ error: "Please enter a valid email so we can reply." });
  if (!msg.message) return res.status(400).json({ error: "Please write a message." });
  try {
    await email.sendContactMessage(msg);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[contact] send failed:", e && (e.response || e.code || e.message), e && e.responseCode || "");
    return res.status(502).json({ error: "We couldn't send your message right now. Please email us directly." });
  }
});

/* ---------------------------------------------------- the Lot Report list */

const rateLimitSubscribe = makeRateLimit(5, 60_000, "Too many attempts. Please wait a minute.");

function unsubscribeToken(emailAddr) {
  return crypto
    .createHmac("sha256", config.subscribers.secret || "dev")
    .update(String(emailAddr).toLowerCase())
    .digest("hex");
}

async function postToSubscribersSheet(payload) {
  const resp = await fetch(config.subscribers.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ secret: config.subscribers.secret }, payload)),
    redirect: "follow",
  });
  if (!resp.ok) throw new Error("subscribers webhook responded " + resp.status);
  return resp.json().catch(() => ({}));
}

// Newsletter signup → subscribers sheet, which sends the welcome email with
// the first-order discount code from the client's own Gmail.
app.post("/api/subscribe", rateLimitSubscribe, async (req, res) => {
  const emailAddr = cleanStr(req.body && req.body.email, 200);
  if (!EMAIL_RE.test(emailAddr)) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  const source = cleanStr(req.body && req.body.source, 60) || "site";
  if (!config.subscribers.webhookUrl) {
    if (config.isProduction) {
      // Never claim success in production while dropping the signup.
      console.error("[subscribe] SUBSCRIBERS_WEBHOOK_URL is not configured — signup rejected");
      return res.status(503).json({ error: "Signups are temporarily unavailable. Please try again soon." });
    }
    console.log(`[subscribe:DEV] ${emailAddr} (${source}) — SUBSCRIBERS_WEBHOOK_URL not set`);
    return res.json({ ok: true });
  }
  try {
    await postToSubscribersSheet({ action: "subscribe", email: emailAddr, source });
    return res.json({ ok: true });
  } catch (e) {
    console.error("[subscribe] failed:", e.message);
    return res.status(502).json({ error: "We couldn't sign you up right now. Please try again." });
  }
});

// One-click unsubscribe from email links: HMAC-signed so only recipients of
// our own emails can hit it, then forwarded to the subscribers sheet.
app.get("/api/unsubscribe", async (req, res) => {
  const emailAddr = cleanStr(req.query.email, 200);
  const token = cleanStr(req.query.token, 128);
  const expected = unsubscribeToken(emailAddr);
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (!emailAddr || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.redirect("/404.html");
  }
  try {
    if (config.subscribers.webhookUrl) {
      await postToSubscribersSheet({ action: "unsubscribe", email: emailAddr });
    } else {
      console.log(`[subscribe:DEV] unsubscribe ${emailAddr}`);
    }
  } catch (e) {
    console.error("[unsubscribe] failed:", e.message);
  }
  return res.redirect("/unsubscribed.html");
});

/* ----------------------------------------- manual payment confirmation */

// Called only by the private Google Orders sheet after the team has verified
// that funds arrived. The shared secret is server-side/Apps-Script-only and
// the transition is idempotent, so re-ticking cannot send duplicate receipts.
app.post("/api/orders/:id/confirm-payment", async (req, res) => {
  if (!secureSecretMatch(req.body && req.body.secret, config.sheets.secret)) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    const order = await orders.getOrder(req.params.id);
    if (!order) return res.status(404).json({ error: "order not found" });
    if (!order.payment || order.payment.provider !== "manual_invoice") {
      return res.status(409).json({ error: "order is not awaiting manual payment" });
    }

    const paymentMethod = cleanStr(req.body && req.body.paymentMethod, 80);
    const paymentReference = cleanStr(req.body && req.body.paymentReference, 200);
    if (!paymentMethod) {
      return res.status(400).json({ error: "payment method is required" });
    }

    let paidOrder = order;
    if (order.status !== orders.STATUS.PAID) {
      paidOrder = await orders.setStatus(
        order.id,
        orders.STATUS.PAID,
        {
          provider: "manual_invoice",
          method: paymentMethod,
          transactionId: paymentReference || null,
        },
        "sheet:payment-confirmed"
      );
      if (!paidOrder) {
        return res.status(409).json({ error: `order cannot be paid from status ${order.status}` });
      }
    }

    const finalized = await finalizePaidOrder(paidOrder, { logToSheet: false });
    if (finalized.receiptError || !finalized.order.receiptSent) {
      return res.status(502).json({
        error: "payment was recorded, but the confirmation email could not be sent; untick and retry",
      });
    }

    return res.json({
      ok: true,
      orderId: finalized.order.id,
      status: finalized.order.status,
      receiptSent: true,
    });
  } catch (err) {
    const cfg = err.code === "ORDER_STORE_CONFIG";
    console.error(`[manual-payment] ${cfg ? "unavailable" : "failed"}:`, err.message);
    return res.status(cfg ? 503 : 500).json({ error: cfg ? "order store unavailable" : "confirmation failed" });
  }
});

/* ------------------------------------------------------- gateway returns */

// Success return: the browser is back, but we do NOT mark paid here — the
// webhook is the source of truth. Hand off to the styled confirmation page,
// which polls order status until the webhook confirms payment.
app.get(config.paths.success, async (req, res) => {
  if (config.checkoutMode !== "stripe") return res.redirect("/shop.html");
  try {
    const order = await orders.getOrder(String(req.query.order || ""));
    if (!order) return res.redirect("/cart.html");
    res.redirect("/confirmation.html?order=" + encodeURIComponent(order.id));
  } catch (err) {
    console.error("[checkout:return] success handler failed:", err.message);
    res.redirect("/cart.html");
  }
});

// Cancel/abandon return: mark cancelled (unless already resolved) and show the
// failed page with a retry action.
app.get(config.paths.cancel, async (req, res) => {
  if (config.checkoutMode !== "stripe") return res.redirect("/cart.html");
  try {
    const order = await orders.getOrder(String(req.query.order || ""));
    if (order && order.status === orders.STATUS.PENDING) {
      await orders.setStatus(order.id, orders.STATUS.CANCELLED, null, "return:cancel");
    }
    const q = order ? "?order=" + encodeURIComponent(order.id) : "";
    res.redirect("/failed.html" + q);
  } catch (err) {
    console.error("[checkout:return] cancel handler failed:", err.message);
    res.redirect("/cart.html");
  }
});

/* ------------------------------------------------------------- webhook */

// Signed webhook — the authoritative status update. Idempotent: setStatus
// rejects illegal/replayed transitions (paid can never be downgraded), and
// the receipt only sends on the transition that actually applied.
async function handlePaymentWebhook(req, res) {
  const { valid, event } = gateway().verifyWebhook(req);
  if (!valid) {
    console.warn("[webhook] rejected: invalid signature");
    return res.status(401).json({ error: "invalid signature" });
  }
  const order = event.orderId ? await orders.getOrder(event.orderId) : null;
  if (!order) {
    return res.status(200).json({ ok: true, note: "no matching order" });
  }

  if (event.type === "paid") {
    const updated =
      order.status === orders.STATUS.PAID
        ? order
        : await orders.setStatus(
            order.id,
            orders.STATUS.PAID,
            { transactionId: event.transactionId, last4: event.last4 },
            "webhook:paid"
          );
    if (updated) await finalizePaidOrder(updated, { logToSheet: true });
  } else if (event.type === "failed") {
    await orders.setStatus(order.id, orders.STATUS.FAILED, { transactionId: event.transactionId }, "webhook:failed");
  } else if (event.type === "cancelled") {
    await orders.setStatus(order.id, orders.STATUS.CANCELLED, null, "webhook:cancelled");
  } else if (event.type === "refunded") {
    await orders.setStatus(order.id, orders.STATUS.REFUNDED, { transactionId: event.transactionId }, "webhook:refunded");
  }

  return res.json({ ok: true });
}

app.post(config.paths.webhook, async (req, res) => {
  if (config.checkoutMode !== "stripe") {
    return res.status(404).json({ error: "payment gateway is inactive" });
  }
  try {
    await handlePaymentWebhook(req, res);
  } catch (err) {
    // 5xx (not 2xx) so a real gateway re-delivers the event later instead of
    // treating it as consumed while our store/provider config is broken.
    const cfg = err.code === "GATEWAY_CONFIG" || err.code === "ORDER_STORE_CONFIG";
    console.error(`[webhook] ${cfg ? "unavailable — configuration" : "processing failed"}:`, err.message);
    if (!res.headersSent) {
      res.status(cfg ? 503 : 500).json({ error: cfg ? "not configured" : "webhook processing failed" });
    }
  }
});

/* ------------------------------------------------- public order status */

app.get("/api/orders/:id", async (req, res) => {
  let order;
  try {
    order = await orders.getOrder(req.params.id);
  } catch (err) {
    console.error("[orders] lookup failed:", err.message);
    return res.status(503).json({ error: "Order lookup is temporarily unavailable." });
  }
  if (!order) return res.status(404).json({ error: "not found" });
  // Return a safe projection (no address, no event log, no secrets) — the
  // order id travels in URLs, so this endpoint must never expose PII.
  res.json({
    id: order.id,
    status: order.status,
    currency: order.currency,
    items: order.items,
    subtotal: order.subtotal,
    discount: order.discount || 0,
    discountCode: order.discountCode || "",
    shipping: order.shipping,
    total: order.total,
    createdAt: order.createdAt,
  });
});

/* -------------------------------------------------- admin order records */

function requireAdmin(req, res, next) {
  const token = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(config.adminToken));
  const ok = Boolean(config.adminToken) && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

app.get("/admin/orders", requireAdmin, async (req, res) => {
  try {
    res.json(await orders.listOrders({ status: req.query.status }));
  } catch (err) {
    // Admin-facing and token-gated: return the real reason to speed up fixes.
    console.error("[admin] order list failed:", err.message);
    res.status(503).json({ error: err.message });
  }
});

/* ---------------------------------------------- built-in mock hosted page */
// Mounted ONLY when the mock provider is active — with a real gateway these
// endpoints do not exist, so order status can never be forged through them.
// Decided from config (not the gateway instance) so mounting never needs to
// construct a gateway at import time.

const mockRoutesActive =
  config.checkoutMode === "stripe" && config.provider === "mock" && !config.isProduction;

if (mockRoutesActive) {
  app.get("/mock-hosted", async (req, res) => {
    try {
      const order = await orders.getOrder(String(req.query.order || ""));
      if (!order) return res.redirect("/cart.html");
      res.type("html").send(MOCK_PAGE(order, String(req.query.session || "")));
    } catch (err) {
      console.error("[mock] hosted page failed:", err.message);
      res.redirect("/cart.html");
    }
  });

  // The mock page posts here; we emit a signed webhook to our own endpoint,
  // exactly as a real gateway would, then bounce the browser to the return URL.
  app.post("/mock-hosted/complete", async (req, res) => {
    try {
      const orderId = String(req.body.order || "");
      const outcome = String(req.body.outcome || "paid"); // paid | failed | cancel
      const order = await orders.getOrder(orderId);
      if (!order) return res.redirect("/cart.html");

      if (outcome === "cancel") {
        return res.redirect(config.paths.cancel + "?order=" + encodeURIComponent(orderId));
      }

      const payload = {
        type: outcome === "failed" ? "failed" : "paid",
        order_id: orderId,
        session_id: order.payment.sessionId,
        transaction_id: "mocktxn_" + Date.now(),
        last4: "4242",
      };
      const rawBody = JSON.stringify(payload);
      const signature = MockGateway.sign(rawBody);

      try {
        await fetch(config.urls.webhook, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Webhook-Signature": "sha256=" + signature },
          body: rawBody,
        });
      } catch (e) {
        console.error("[mock] webhook dispatch failed:", e.message);
      }

      const dest = outcome === "failed" ? config.paths.cancel : config.paths.success;
      res.redirect(dest + "?order=" + encodeURIComponent(orderId));
    } catch (err) {
      console.error("[mock] complete failed:", err.message);
      res.redirect("/cart.html");
    }
  });
}

/* --------------------------------------------------------- static site */

// Serve ONLY the public site surface: page URLs (with or without .html),
// the assets tree, and root SEO files. Everything else in the repo —
// server code, order data, package/config/docs — is never exposed.
const STATIC_ALLOW = /^\/($|assets\/|[a-z0-9-]+(\.html)?$|robots\.txt$|sitemap\.xml$|favicon\.ico$)/i;

function send404(res) {
  res.status(404).sendFile(path.join(ROOT, "404.html"), (err) => {
    if (err) res.type("txt").send("Not found");
  });
}

app.use((req, res, next) => {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!STATIC_ALLOW.test(req.path)) return send404(res);
  next();
});

app.use(
  express.static(ROOT, {
    extensions: ["html"],
    setHeaders: (res, p) => {
      if (/\.(webp|woff2)$/.test(p)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  })
);

// Styled 404 for anything that fell through.
app.use((req, res) => send404(res));

// Only bind a port when run directly (node server/app.js). When imported
// (e.g. a serverless function or tests) the app is exported unbound.
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`[nuvamin] listening on ${config.publicBaseUrl}  (port ${config.port})`);
  });
}

module.exports = app;
