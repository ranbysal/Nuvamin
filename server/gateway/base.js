"use strict";

/**
 * PaymentGateway — the provider-adapter contract.
 *
 * Stripe and the local development mock implement this interface, so the rest
 * of the app does not contain provider-specific checkout logic.
 *
 * Contract:
 *
 *   name: string
 *
 *   async createCheckoutSession(order, urls) -> {
 *     sessionId: string,        // gateway's reference for this hosted checkout
 *     redirectUrl: string       // where to send the customer's browser
 *   }
 *     Given an already-created (pending) order and the return URLs, ask the
 *     gateway to open a hosted, PCI-compliant payment page. No card data is
 *     handled here — the customer enters it on the gateway's page.
 *
 *   verifyWebhook(req) -> { valid: boolean, event: object|null }
 *     Validate the signature of an inbound webhook and normalise its body
 *     into a provider-agnostic event: { type, sessionId, transactionId,
 *     orderId, last4 }.  type ∈ 'paid' | 'failed' | 'refunded' | 'unknown'.
 *
 *   async fetchStatus(order) -> { status } | null   (optional)
 *     Best-effort reconciliation used by the return route as a fallback when
 *     the webhook hasn't arrived yet. Never the source of truth on its own.
 */

class PaymentGateway {
  get name() {
    return "base";
  }
  async createCheckoutSession(/* order, urls */) {
    throw new Error("createCheckoutSession() not implemented");
  }
  verifyWebhook(/* req */) {
    return { valid: false, event: null };
  }
  async fetchStatus(/* order */) {
    return null;
  }
}

module.exports = PaymentGateway;
