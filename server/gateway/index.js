"use strict";

/**
 * Gateway factory. Selects the adapter from config.provider and FAILS FAST
 * when the selected provider is unusable — a real provider without complete
 * credentials, an unknown provider name, or the mock gateway in production
 * refuses to construct. Payments must never
 * silently degrade to the forgeable simulated gateway.
 *
 * Errors carry code "GATEWAY_CONFIG" so callers can turn them into a clean
 * 503 on the payment routes only. getGateway() must NOT be called at module
 * scope — resolving it at import time is what used to crash the entire
 * serverless function (contact form included) when PAYMENT_PROVIDER was
 * unset in production.
 */

const config = require("../config");
const StripeGateway = require("./stripe");
const MockGateway = require("./mock");

let instance = null;

function configError(message) {
  const err = new Error(message);
  err.code = "GATEWAY_CONFIG";
  return err;
}

function build() {
  switch (config.provider) {
    case "stripe": {
      const g = new StripeGateway();
      if (!g.isConfigured()) {
        throw configError(
          "PAYMENT_PROVIDER=stripe but Stripe credentials are missing " +
            "(STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET). Refusing to start."
        );
      }
      return g;
    }
    case "mock": {
      if (config.isProduction) {
        throw configError(
          "PAYMENT_PROVIDER=mock is disabled in production. Configure PAYMENT_PROVIDER=stripe."
        );
      }
      return new MockGateway();
    }
    default:
      throw configError(
        `Unknown PAYMENT_PROVIDER "${config.provider}". Expected "stripe" or "mock".`
      );
  }
}

function getGateway() {
  if (!instance) instance = build();
  return instance;
}

module.exports = { getGateway };
