"use strict";

/**
 * NMI (Network Merchants Inc.) adapter — hosted redirect checkout.
 *
 * Flow: we ask NMI to create a hosted "Collect Checkout" session for the
 * order total; NMI returns a checkout URL; we redirect the customer there.
 * The customer enters card details ON NMI'S PAGE (PCI SAQ-A — no card data
 * ever reaches this server). NMI then redirects back to our success/cancel
 * URL and, authoritatively, POSTs a signed webhook we use to mark the order.
 *
 * All credentials come from env (see .env.example):
 *   NMI_CHECKOUT_URL, NMI_PROCESSOR_ACCOUNT_ID, NMI_SECURITY_KEY,
 *   NMI_WEBHOOK_SECRET
 *
 * NOTE FOR GO-LIVE:  The exact request/response shape of NMI's hosted
 * checkout endpoint depends on your NMI account's enabled API version.
 * The request builder + response parser below are marked with ▼ TODO ▼ so
 * you can align field names with the NMI integration guide for your account.
 */

const crypto = require("crypto");
const PaymentGateway = require("./base");
const config = require("../config");

class NmiGateway extends PaymentGateway {
  get name() {
    return "nmi";
  }

  isConfigured() {
    return Boolean(config.nmi.securityKey && config.nmi.processorAccountId);
  }

  async createCheckoutSession(order, urls) {
    if (!this.isConfigured()) {
      throw new Error(
        "NMI is not configured. Set NMI_SECURITY_KEY and NMI_PROCESSOR_ACCOUNT_ID, " +
          "or run with PAYMENT_PROVIDER=mock for a simulated hosted flow."
      );
    }

    // ▼ TODO (go-live): confirm field names against NMI's hosted-checkout guide.
    const payload = {
      security_key: config.nmi.securityKey,
      processor_id: config.nmi.processorAccountId,
      type: "sale",
      amount: order.total.toFixed(2),
      currency: order.currency,
      order_id: order.id,
      order_description: "Nuvamin order " + order.id,
      redirect_url: urls.success + "?order=" + encodeURIComponent(order.id),
      cancel_url: urls.cancel + "?order=" + encodeURIComponent(order.id),
      webhook_url: urls.webhook,
      customer_email: order.customer.email || "",
    };

    const resp = await fetch(config.nmi.checkoutUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error("NMI checkout create failed (" + resp.status + "): " + text.slice(0, 300));
    }

    const data = await resp.json().catch(() => ({}));

    // ▼ TODO (go-live): map to NMI's actual response keys for your account.
    const sessionId = data.checkout_id || data.session_id || data.id || null;
    const redirectUrl = data.checkout_url || data.redirect_url || data.url || null;

    if (!redirectUrl) {
      throw new Error("NMI did not return a hosted checkout URL. Response: " + JSON.stringify(data).slice(0, 300));
    }
    return { sessionId, redirectUrl };
  }

  /**
   * Validate an inbound NMI webhook. NMI signs the raw body with your webhook
   * secret; we recompute the HMAC and compare in constant time.
   */
  verifyWebhook(req) {
    const secret = config.nmi.webhookSecret;
    const raw = req.rawBody || JSON.stringify(req.body || {});
    // ▼ TODO (go-live): use the exact signature header NMI sends for your account.
    const provided =
      req.get("Webhook-Signature") ||
      req.get("X-NMI-Signature") ||
      req.get("Sig-Header") ||
      "";

    let valid = false;
    if (secret && provided) {
      const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
      const a = Buffer.from(expected);
      const b = Buffer.from(provided.replace(/^sha256=/, ""));
      valid = a.length === b.length && crypto.timingSafeEqual(a, b);
    }

    const body = req.body || {};
    const rawStatus = String(body.event_type || body.type || body.condition || "").toLowerCase();
    let type = "unknown";
    if (/success|complete|settle|approved|captured|sale/.test(rawStatus)) type = "paid";
    else if (/fail|declin|error|void/.test(rawStatus)) type = "failed";
    else if (/refund|credit/.test(rawStatus)) type = "refunded";
    else if (/cancel/.test(rawStatus)) type = "cancelled";

    const event = {
      type,
      orderId: body.order_id || body.orderId || (body.merchant_defined_field_1 || null),
      sessionId: body.checkout_id || body.session_id || null,
      transactionId: body.transaction_id || body.transactionid || null,
      last4: body.cc_last_4 || body.last4 || null,
    };
    return { valid, event };
  }
}

module.exports = NmiGateway;
