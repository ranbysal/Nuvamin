"use strict";

/**
 * Gateway factory. Selects the adapter from config.provider and FAILS FAST
 * when the selected provider is unusable — a real provider without complete
 * credentials, an unknown provider name, or the mock gateway in production
 * (without explicit opt-in) refuses to construct. Payments must never
 * silently degrade to the forgeable simulated gateway.
 *
 * Errors carry code "GATEWAY_CONFIG" so callers can turn them into a clean
 * 503 on the payment routes only. getGateway() must NOT be called at module
 * scope — resolving it at import time is what used to crash the entire
 * serverless function (contact form included) when PAYMENT_PROVIDER was
 * unset in production.
 */

const config = require("../config");
const NmiGateway = require("./nmi");
const AuthorizeNetGateway = require("./authorizenet");
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
    case "nmi": {
      const g = new NmiGateway();
      if (!g.isConfigured()) {
        throw configError(
          "PAYMENT_PROVIDER=nmi but NMI credentials are missing " +
            "(NMI_SECURITY_KEY, NMI_PROCESSOR_ACCOUNT_ID). Refusing to start — " +
            "set the credentials, or explicitly run PAYMENT_PROVIDER=mock for development."
        );
      }
      return g;
    }
    case "authorizenet": {
      const g = new AuthorizeNetGateway();
      if (!g.isConfigured()) {
        throw configError(
          "PAYMENT_PROVIDER=authorizenet but credentials are missing " +
            "(AUTHNET_API_LOGIN_ID, AUTHNET_TRANSACTION_KEY). Refusing to start."
        );
      }
      return g;
    }
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
      if (config.isProduction && !config.allowMockInProduction) {
        throw configError(
          "PAYMENT_PROVIDER=mock is disabled in production. Configure a real " +
            "provider, or set ALLOW_MOCK_GATEWAY=true only for a staging demo."
        );
      }
      return new MockGateway();
    }
    default:
      throw configError(
        `Unknown PAYMENT_PROVIDER "${config.provider}". Expected "nmi", "authorizenet", "stripe" or "mock".`
      );
  }
}

function getGateway() {
  if (!instance) instance = build();
  return instance;
}

module.exports = { getGateway };
