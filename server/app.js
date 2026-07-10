"use strict";

/**
 * Nuvamin — storefront static host + hosted-gateway checkout API.
 *
 * Route map:
 *   GET  /api/health              boot + configuration diagnostics (no secrets)
 *   GET  /api/auth/config         public Google sign-in configuration
 *   POST /api/auth/google         verify Google identity + create session
 *   GET  /api/auth/session        current signed-in account
 *   POST /api/auth/logout         clear first-party session
 *   POST /api/research-verification  issue signed cart acknowledgement
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
const auth = require("./auth");
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
const rateLimitAuth = makeRateLimit(10, 60_000, "Too many sign-in attempts. Please wait a minute.");

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

/* --------------------------------------------------------------- identity */

app.get("/api/auth/config", (_req, res) => {
  res.set("Cache-Control", "no-store");
  const status = auth.configStatus();
  res.json({
    configured: status.ok,
    clientId: status.googleClientId ? config.auth.googleClientId : "",
    researchVersion: config.researchVerification.version,
  });
});

app.get("/api/auth/session", (req, res) => {
  res.set("Cache-Control", "no-store");
  const status = auth.configStatus();
  let user = null;
  if (status.ok) {
    try {
      user = auth.getSession(req);
    } catch (_err) {
      user = null;
    }
  }
  res.json({
    configured: status.ok,
    authenticated: Boolean(user),
    user: auth.safeUser(user),
    researchVersion: config.researchVerification.version,
  });
});

app.post("/api/auth/google", rateLimitAuth, auth.requireSameOrigin, async (req, res) => {
  try {
    const user = await auth.verifyGoogleCredential(cleanStr(req.body && req.body.credential, 8192));
    if (!user) return res.status(401).json({ error: "Google could not verify that account." });
    auth.setSessionCookie(res, user);
    return res.json({ ok: true, user: auth.safeUser(user) });
  } catch (err) {
    if (err.code === "AUTH_CONFIG") {
      return res.status(503).json({ error: "Google sign-in is not configured yet." });
    }
    console.error("[auth] Google verification failed:", err.message);
    return res.status(502).json({ error: "Google sign-in is temporarily unavailable." });
  }
});

app.post("/api/auth/logout", auth.requireSameOrigin, (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

app.post(
  "/api/research-verification",
  rateLimitAuth,
  auth.requireSameOrigin,
  auth.requireAuth,
  (req, res) => {
    const body = req.body || {};
    if (
      body.age21 !== true ||
      body.qualifiedResearcher !== true ||
      body.researchUseOnly !== true
    ) {
      return res.status(400).json({ error: "Complete both researcher confirmations to continue." });
    }
    const result = auth.issueResearchVerification(req.user);
    return res.json({
      ok: true,
      verificationToken: result.token,
      record: result.record,
    });
  }
);

/* ---------------------------------------------------------------- checkout */

// Create the order (pending) BEFORE payment, then open a hosted session.
app.post(
  "/api/checkout",
  rateLimitCheckout,
  auth.requireSameOrigin,
  auth.requireAuth,
  async (req, res) => {
  try {
    const rawCart = (req.body && req.body.cart) || {};
    const pricing = catalog.priceOrder(rawCart);

    if (pricing.items.length === 0) {
      return res.status(400).json({ error: "Your cart is empty." });
    }

    const requestBody = Object.assign({}, req.body, {
      customer: Object.assign({}, (req.body && req.body.customer) || {}, {
        email: req.user.email,
      }),
    });
    const checked = validateCustomer(requestBody);
    if (checked.error) {
      return res.status(400).json({ error: checked.error });
    }
    checked.customer.email = req.user.email;

    const researchVerification = auth.verifyResearchVerification(
      req.body && req.body.researchVerificationToken,
      req.user
    );
    if (!researchVerification) {
      return res.status(403).json({
        error: "Complete the researcher acknowledgement before checkout.",
      });
    }

    const gw = gateway(); // resolve before order creation so config errors cannot create orphan orders

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

    const order = await orders.createOrder({
      pricing,
      customer: checked.customer,
      shipping: checked.shipping,
      currency: config.currency,
      account: auth.safeUser(req.user),
      researchVerification,
    });

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
    if (
      err.code === "GATEWAY_CONFIG" ||
      err.code === "ORDER_STORE_CONFIG" ||
      err.code === "AUTH_CONFIG"
    ) {
      console.error("[checkout] unavailable — configuration:", err.message);
      return res.status(503).json({ error: "Checkout isn't available right now. Please try again later." });
    }
    console.error("[checkout] error:", err.message);
    return res.status(502).json({ error: "Unable to start checkout. Please try again." });
  }
  }
);

/* ------------------------------------------------------------------ health */

// Boot + configuration diagnostics. Never throws and never touches secrets:
// each subsystem reports its own state, so a production misconfiguration is
// visible in one request instead of presenting as a crashed function.
app.get("/api/health", (req, res) => {
  let gatewayCheck;
  try {
    gatewayCheck = { ok: true, provider: gateway().name };
  } catch (e) {
    gatewayCheck = { ok: false, error: e.message };
  }
  res.json({
    ok: true,
    service: "nuvamin-api",
    time: new Date().toISOString(),
    env: { vercel: config.onVercel, production: config.isProduction },
    checks: {
      orderStore: orders.storeStatus(),
      gateway: gatewayCheck,
      googleAuth: auth.configStatus(),
      researchVerification: { version: config.researchVerification.version },
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

/* ------------------------------------------------------- gateway returns */

// Success return: the browser is back, but we do NOT mark paid here — the
// webhook is the source of truth. Hand off to the styled confirmation page,
// which polls order status until the webhook confirms payment.
app.get(config.paths.success, async (req, res) => {
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
      // Company-side hooks: notify the inbox + append to the order sheet.
      // Neither may break payment processing — failures are logged only.
      try {
        await email.sendOrderNotification(updated);
      } catch (e) {
        console.error("[webhook] order notification failed:", e.message);
      }
      await sheets.logOrder(updated);
    }
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

const mockRoutesActive = config.provider === "mock" && !config.isProduction;

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
