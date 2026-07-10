"use strict";

const crypto = require("crypto");

const config = require("../config");
const PaymentGateway = require("./base");

class StripeGateway extends PaymentGateway {
  get name() {
    return "stripe";
  }

  isConfigured() {
    return Boolean(config.stripe.secretKey && config.stripe.webhookSecret);
  }

  async createCheckoutSession(order, urls) {
    const amount = Math.round(Number(order.total) * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error("Stripe checkout requires a valid positive order total.");
    }

    const successSeparator = urls.success.includes("?") ? "&" : "?";
    const cancelSeparator = urls.cancel.includes("?") ? "&" : "?";
    const body = new URLSearchParams({
      mode: "payment",
      "payment_method_types[0]": "card",
      "payment_intent_data[capture_method]": "automatic",
      client_reference_id: order.id,
      customer_email: order.customer.email,
      success_url: urls.success + successSeparator + "order=" + encodeURIComponent(order.id),
      cancel_url: urls.cancel + cancelSeparator + "order=" + encodeURIComponent(order.id),
      "metadata[order_id]": order.id,
      "payment_intent_data[metadata][order_id]": order.id,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": String(order.currency || config.currency).toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][product_data][name]": "Nuvamin order " + order.id,
    });

    const response = await fetch(config.stripe.checkoutUrl, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + config.stripe.secretKey,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload.id || !payload.url) {
      const message = payload.error && payload.error.message;
      throw new Error("Stripe Checkout Session creation failed" + (message ? ": " + message : "."));
    }

    return { sessionId: payload.id, redirectUrl: payload.url };
  }

  verifyWebhook(req) {
    try {
      const rawBody = req.rawBody || "";
      const header = req.get("Stripe-Signature") || "";
      const parts = header.split(",").map((part) => part.split("=", 2));
      const timestampPart = parts.find(([key]) => key === "t");
      const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
      const timestamp = timestampPart && Number(timestampPart[1]);

      if (!rawBody || !timestamp || Math.abs(Date.now() / 1000 - timestamp) > 300) {
        return { valid: false, event: null };
      }

      const expected = crypto
        .createHmac("sha256", config.stripe.webhookSecret)
        .update(timestamp + "." + rawBody)
        .digest("hex");
      const expectedBuffer = Buffer.from(expected, "hex");
      const valid = signatures.some((signature) => {
        if (!/^[a-f0-9]{64}$/i.test(signature || "")) return false;
        const actualBuffer = Buffer.from(signature, "hex");
        return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
      });
      if (!valid) return { valid: false, event: null };

      const stripeEvent = JSON.parse(rawBody);
      const object = (stripeEvent.data && stripeEvent.data.object) || {};
      let type = "unknown";

      if (
        stripeEvent.type === "checkout.session.completed" ||
        stripeEvent.type === "checkout.session.async_payment_succeeded" ||
        stripeEvent.type === "payment_intent.succeeded"
      ) {
        type = "paid";
      } else if (
        stripeEvent.type === "checkout.session.async_payment_failed" ||
        stripeEvent.type === "payment_intent.payment_failed"
      ) {
        type = "failed";
      } else if (stripeEvent.type === "checkout.session.expired") {
        type = "cancelled";
      } else if (stripeEvent.type === "charge.refunded") {
        type = "refunded";
      }

      const metadata = object.metadata || {};
      const card = object.payment_method_details && object.payment_method_details.card;
      return {
        valid: true,
        event: {
          type,
          sessionId: object.object === "checkout.session" ? object.id : null,
          transactionId:
            (typeof object.payment_intent === "string" && object.payment_intent) ||
            (object.object === "payment_intent" ? object.id : null) ||
            (object.object === "charge" ? object.id : null),
          orderId: object.client_reference_id || metadata.order_id || null,
          last4: (card && card.last4) || null,
        },
      };
    } catch (_err) {
      return { valid: false, event: null };
    }
  }
}

module.exports = StripeGateway;
