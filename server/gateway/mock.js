"use strict";

/**
 * Mock hosted gateway — a fully local simulation of the redirect flow.
 *
 * It behaves exactly like a real hosted gateway from the app's point of view:
 * createCheckoutSession() returns a redirect URL (to our own /mock-hosted
 * page), that page collects a *fake* card entry, then redirects back to the
 * success/cancel return URLs and fires a signed webhook — so the entire order
 * lifecycle (pending → paid/failed/cancelled, receipt email, admin record)
 * is testable end-to-end WITHOUT any real credentials or real card data.
 *
 * Selected automatically when PAYMENT_PROVIDER=mock (the default) or when the
 * chosen real provider has no credentials configured yet.
 */

const crypto = require("crypto");
const PaymentGateway = require("./base");
const config = require("../config");

const MOCK_SECRET = "mock_webhook_secret_dev_only";

class MockGateway extends PaymentGateway {
  get name() {
    return "mock";
  }

  async createCheckoutSession(order, urls) {
    const sessionId = "mock_" + crypto.randomBytes(8).toString("hex");
    const redirectUrl =
      config.publicBaseUrl +
      "/mock-hosted?order=" +
      encodeURIComponent(order.id) +
      "&session=" +
      encodeURIComponent(sessionId);
    return { sessionId, redirectUrl };
  }

  verifyWebhook(req) {
    const raw = req.rawBody || JSON.stringify(req.body || {});
    const provided = (req.get("Webhook-Signature") || "").replace(/^sha256=/, "");
    const expected = crypto.createHmac("sha256", MOCK_SECRET).update(raw).digest("hex");
    let valid = false;
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(provided);
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch (e) {
      valid = false;
    }
    const body = req.body || {};
    return {
      valid,
      event: {
        type: body.type || "unknown",
        orderId: body.order_id || null,
        sessionId: body.session_id || null,
        transactionId: body.transaction_id || null,
        last4: body.last4 || null,
      },
    };
  }

  // Helper used only by the built-in mock hosted page to sign its callback.
  static sign(rawBody) {
    return crypto.createHmac("sha256", MOCK_SECRET).update(rawBody).digest("hex");
  }
}

module.exports = MockGateway;
