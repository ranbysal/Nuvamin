"use strict";

/**
 * Nuvamin — storefront static host + hosted-gateway checkout API.
 *
 * Route map:
 *   POST /api/checkout            create pending order + hosted session -> {redirectUrl}
 *   GET  /checkout/success        gateway return (success) -> confirmation page
 *   GET  /checkout/cancel         gateway return (cancel)  -> failed page
 *   POST /api/webhook/payment     signed webhook — SOURCE OF TRUTH for status
 *   GET  /api/orders/:id          public order status (for the confirmation page)
 *   GET  /admin/orders            admin-readable order records (Bearer token)
 *   GET  /mock-hosted             built-in simulated hosted page (mock provider)
 *   POST /mock-hosted/complete    mock page action -> fires signed webhook
 *   (static)                      the existing site (index.html, cart.html, ...)
 */

const path = require("path");
const express = require("express");

const config = require("./config");
const catalog = require("./catalog");
const orders = require("./orders");
const email = require("./email");
const { getGateway } = require("./gateway");
const { MOCK_PAGE } = require("./views");

const MockGateway = require("./gateway/mock");

const app = express();
const ROOT = path.join(__dirname, "..");

// Capture the raw body (needed for webhook signature verification) while still
// parsing JSON / urlencoded for normal handlers.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);
app.use(express.urlencoded({ extended: true }));

const gateway = getGateway();
console.log(`[nuvamin] payment provider: ${gateway.name}`);

/* ---------------------------------------------------------------- checkout */

// Create the order (pending) BEFORE payment, then open a hosted session.
app.post("/api/checkout", async (req, res) => {
  try {
    const rawCart = (req.body && req.body.cart) || {};
    const customer = (req.body && req.body.customer) || {};
    const pricing = catalog.priceOrder(rawCart);

    if (pricing.items.length === 0) {
      return res.status(400).json({ error: "Your cart is empty." });
    }

    const order = orders.createOrder({
      pricing,
      customer,
      currency: config.currency,
    });

    const session = await gateway.createCheckoutSession(order, config.urls);

    orders.updateOrder(
      order.id,
      (o) => {
        o.payment.provider = gateway.name;
        o.payment.sessionId = session.sessionId;
      },
      "checkout:session-created"
    );

    return res.json({ orderId: order.id, redirectUrl: session.redirectUrl });
  } catch (err) {
    console.error("[checkout] error:", err.message);
    return res.status(502).json({ error: "Unable to start checkout. Please try again." });
  }
});

/* ------------------------------------------------------- gateway returns */

// Success return: the browser is back, but we do NOT mark paid here — the
// webhook is the source of truth. Hand off to the styled confirmation page,
// which polls order status until the webhook confirms payment.
app.get(config.paths.success, async (req, res) => {
  const order = orders.getOrder(String(req.query.order || ""));
  if (!order) return res.redirect("/cart.html");
  res.redirect("/confirmation.html?order=" + encodeURIComponent(order.id));
});

// Cancel/abandon return: mark cancelled (unless already resolved) and show the
// failed page with a retry action.
app.get(config.paths.cancel, (req, res) => {
  const order = orders.getOrder(String(req.query.order || ""));
  if (order && order.status === orders.STATUS.PENDING) {
    orders.setStatus(order.id, orders.STATUS.CANCELLED, null, "return:cancel");
  }
  const q = order ? "?order=" + encodeURIComponent(order.id) : "";
  res.redirect("/failed.html" + q);
});

/* ------------------------------------------------------------- webhook */

// Signed webhook — the authoritative status update. Idempotent: re-delivery
// of the same event will not double-send receipts.
app.post(config.paths.webhook, async (req, res) => {
  const { valid, event } = gateway.verifyWebhook(req);
  if (!valid) {
    console.warn("[webhook] rejected: invalid signature");
    return res.status(401).json({ error: "invalid signature" });
  }
  const order = event.orderId ? orders.getOrder(event.orderId) : null;
  if (!order) {
    return res.status(200).json({ ok: true, note: "no matching order" });
  }

  if (event.type === "paid" && order.status !== orders.STATUS.PAID) {
    orders.setStatus(
      order.id,
      orders.STATUS.PAID,
      { transactionId: event.transactionId, last4: event.last4 },
      "webhook:paid"
    );
    const fresh = orders.getOrder(order.id);
    if (!fresh.receiptSent) {
      try {
        await email.sendReceipt(fresh);
        orders.updateOrder(order.id, (o) => (o.receiptSent = true), "receipt:sent");
      } catch (e) {
        console.error("[webhook] receipt send failed:", e.message);
      }
    }
  } else if (event.type === "failed") {
    orders.setStatus(order.id, orders.STATUS.FAILED, { transactionId: event.transactionId }, "webhook:failed");
  } else if (event.type === "cancelled") {
    orders.setStatus(order.id, orders.STATUS.CANCELLED, null, "webhook:cancelled");
  } else if (event.type === "refunded") {
    orders.setStatus(order.id, orders.STATUS.REFUNDED, { transactionId: event.transactionId }, "webhook:refunded");
  }

  return res.json({ ok: true });
});

/* ------------------------------------------------- public order status */

app.get("/api/orders/:id", (req, res) => {
  const order = orders.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "not found" });
  // Return a safe projection (no internal event log, no secrets).
  res.json({
    id: order.id,
    status: order.status,
    currency: order.currency,
    items: order.items,
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    createdAt: order.createdAt,
  });
});

/* -------------------------------------------------- admin order records */

function requireAdmin(req, res, next) {
  const token = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!config.adminToken || token !== config.adminToken) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

app.get("/admin/orders", requireAdmin, (req, res) => {
  res.json(orders.listOrders({ status: req.query.status }));
});

/* ---------------------------------------------- built-in mock hosted page */
// Only meaningful with the mock provider; harmless otherwise.

app.get("/mock-hosted", (req, res) => {
  const order = orders.getOrder(String(req.query.order || ""));
  if (!order) return res.redirect("/cart.html");
  res.type("html").send(MOCK_PAGE(order, String(req.query.session || "")));
});

// The mock page posts here; we emit a signed webhook to our own endpoint,
// exactly as a real gateway would, then bounce the browser to the return URL.
app.post("/mock-hosted/complete", async (req, res) => {
  const orderId = String(req.body.order || "");
  const outcome = String(req.body.outcome || "paid"); // paid | failed | cancel
  const order = orders.getOrder(orderId);
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
});

/* --------------------------------------------------------- static site */

app.use(
  express.static(ROOT, {
    extensions: ["html"],
    setHeaders: (res, p) => {
      if (/\.(webp|woff2)$/.test(p)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    },
  })
);

// Only bind a port when run directly (node server/app.js). When imported
// (e.g. a serverless function or tests) the app is exported unbound.
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`[nuvamin] listening on ${config.publicBaseUrl}  (port ${config.port})`);
  });
}

module.exports = app;
