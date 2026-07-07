"use strict";

/**
 * Authorize.Net adapter — STUB for a future swap.
 *
 * Implements the same PaymentGateway contract as the NMI adapter so the app
 * can switch to Authorize.Net by setting PAYMENT_PROVIDER=authorizenet and
 * providing AUTHNET_* credentials — no changes anywhere else.
 *
 * Intended live integration: Authorize.Net "Accept Hosted" — request a hosted
 * payment page token, then redirect the browser to the hosted form. Same
 * no-card-data-on-our-server guarantee as NMI.
 *
 * The methods below are intentionally scaffolded with clear TODOs; fill in
 * when/if the client moves to Authorize.Net.
 */

const crypto = require("crypto");
const PaymentGateway = require("./base");
const config = require("../config");

class AuthorizeNetGateway extends PaymentGateway {
  get name() {
    return "authorizenet";
  }

  isConfigured() {
    return Boolean(config.authnet.apiLoginId && config.authnet.transactionKey);
  }

  async createCheckoutSession(order, urls) {
    if (!this.isConfigured()) {
      throw new Error("Authorize.Net is not configured (set AUTHNET_API_LOGIN_ID / AUTHNET_TRANSACTION_KEY).");
    }
    // ▼ TODO (go-live): call getHostedPaymentPageRequest to obtain a form token,
    //   then redirect to the Accept Hosted URL with that token.
    //   const endpoint = config.authnet.environment === "production"
    //     ? "https://api.authorize.net/xml/v1/request.api"
    //     : "https://apitest.authorize.net/xml/v1/request.api";
    throw new Error("Authorize.Net adapter stub — implement getHostedPaymentPageRequest for go-live.");
  }

  verifyWebhook(req) {
    // Authorize.Net signs webhooks with X-ANET-Signature (HMAC-SHA512 of body,
    // keyed by the Signature Key).
    const raw = req.rawBody || JSON.stringify(req.body || {});
    const provided = (req.get("X-ANET-Signature") || "").replace(/^sha512=/i, "");
    let valid = false;
    if (config.authnet.signatureKey && provided) {
      const expected = crypto
        .createHmac("sha512", config.authnet.signatureKey)
        .update(raw)
        .digest("hex")
        .toUpperCase();
      valid = expected === provided.toUpperCase();
    }
    const body = req.body || {};
    const evt = String(body.eventType || "").toLowerCase();
    let type = "unknown";
    if (evt.includes("capture") || evt.includes("authcapture")) type = "paid";
    else if (evt.includes("void") || evt.includes("declin")) type = "failed";
    else if (evt.includes("refund")) type = "refunded";
    const payload = (body.payload || {});
    return {
      valid,
      event: {
        type,
        orderId: payload.merchantReferenceId || payload.invoiceNumber || null,
        sessionId: null,
        transactionId: payload.id || null,
        last4: null,
      },
    };
  }
}

module.exports = AuthorizeNetGateway;
