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

const gateway = getGateway();
console.log(`[nuvamin] payment provider: ${gateway.name}`);

/* ------------------------------------------------------------ rate limit */

// Minimal in-memory limiter for checkout creation. Per-instance (resets on
// deploy / new serverless instance) — enough to blunt abuse of order creation.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateBuckets = new Map();

function rateLimitCheckout(req, res, next) {
  const now = Date.now();
  const ip = req.ip || "unknown";
  const hits = (rateBuckets.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    return res.status(429).json({ error: "Too many checkout attempts. Please wait a minute." });
  }
  hits.push(now);
  rateBuckets.set(ip, hits);
  if (rateBuckets.size > 10_000) rateBuckets.clear(); // crude memory cap
  next();
}

/* ------------------------------------------------------------ validation */

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cleanStr(v, max) {
  return String(v == null ? "" : v).trim().slice(0, max);
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

// Create the order (pending) BEFORE payment, then open a hosted session.
app.post("/api/checkout", rateLimitCheckout, async (req, res) => {
  try {
    const rawCart = (req.body && req.body.cart) || {};
    const pricing = catalog.priceOrder(rawCart);

    if (pricing.items.length === 0) {
      return res.status(400).json({ error: "Your cart is empty." });
    }

    const checked = validateCustomer(req.body);
    if (checked.error) {
      return res.status(400).json({ error: checked.error });
    }

    const order = await orders.createOrder({
      pricing,
      customer: checked.customer,
      shipping: checked.shipping,
      currency: config.currency,
    });

    const session = await gateway.createCheckoutSession(order, config.urls);

    await orders.updateOrder(
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
  const order = await orders.getOrder(String(req.query.order || ""));
  if (!order) return res.redirect("/cart.html");
  res.redirect("/confirmation.html?order=" + encodeURIComponent(order.id));
});

// Cancel/abandon return: mark cancelled (unless already resolved) and show the
// failed page with a retry action.
app.get(config.paths.cancel, async (req, res) => {
  const order = await orders.getOrder(String(req.query.order || ""));
  if (order && order.status === orders.STATUS.PENDING) {
    await orders.setStatus(order.id, orders.STATUS.CANCELLED, null, "return:cancel");
  }
  const q = order ? "?order=" + encodeURIComponent(order.id) : "";
  res.redirect("/failed.html" + q);
});

/* ------------------------------------------------------------- webhook */

// Signed webhook — the authoritative status update. Idempotent: setStatus
// rejects illegal/replayed transitions (paid can never be downgraded), and
// the receipt only sends on the transition that actually applied.
app.post(config.paths.webhook, async (req, res) => {
  const { valid, event } = gateway.verifyWebhook(req);
  if (!valid) {
    console.warn("[webhook] rejected: invalid signature");
    return res.status(401).json({ error: "invalid signature" });
  }
  const order = event.orderId ? await orders.getOrder(event.orderId) : null;
  if (!order) {
    return res.status(200).json({ ok: true, note: "no matching order" });
  }

  if (event.type === "paid") {
    const updated = await orders.setStatus(
      order.id,
      orders.STATUS.PAID,
      { transactionId: event.transactionId, last4: event.last4 },
      "webhook:paid"
    );
    if (updated && !updated.receiptSent) {
      try {
        await email.sendReceipt(updated);
        await orders.updateOrder(order.id, (o) => (o.receiptSent = true), "receipt:sent");
      } catch (e) {
        console.error("[webhook] receipt send failed:", e.message);
      }
    }
  } else if (event.type === "failed") {
    await orders.setStatus(order.id, orders.STATUS.FAILED, { transactionId: event.transactionId }, "webhook:failed");
  } else if (event.type === "cancelled") {
    await orders.setStatus(order.id, orders.STATUS.CANCELLED, null, "webhook:cancelled");
  } else if (event.type === "refunded") {
    await orders.setStatus(order.id, orders.STATUS.REFUNDED, { transactionId: event.transactionId }, "webhook:refunded");
  }

  return res.json({ ok: true });
});

/* ------------------------------------------------- public order status */

app.get("/api/orders/:id", async (req, res) => {
  const order = await orders.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: "not found" });
  // Return a safe projection (no address, no event log, no secrets) — the
  // order id travels in URLs, so this endpoint must never expose PII.
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
  const a = Buffer.from(String(token));
  const b = Buffer.from(String(config.adminToken));
  const ok = Boolean(config.adminToken) && a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}

app.get("/admin/orders", requireAdmin, async (req, res) => {
  res.json(await orders.listOrders({ status: req.query.status }));
});

/* ---------------------------------------------- built-in mock hosted page */
// Mounted ONLY when the mock provider is active — with a real gateway these
// endpoints do not exist, so order status can never be forged through them.

if (gateway.name === "mock") {
  app.get("/mock-hosted", async (req, res) => {
    const order = await orders.getOrder(String(req.query.order || ""));
    if (!order) return res.redirect("/cart.html");
    res.type("html").send(MOCK_PAGE(order, String(req.query.session || "")));
  });

  // The mock page posts here; we emit a signed webhook to our own endpoint,
  // exactly as a real gateway would, then bounce the browser to the return URL.
  app.post("/mock-hosted/complete", async (req, res) => {
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
