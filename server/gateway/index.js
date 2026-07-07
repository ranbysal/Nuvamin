"use strict";

/**
 * Gateway factory. Selects the adapter from config.provider and FAILS FAST
 * when the selected provider is unusable — a real provider without complete
 * credentials, an unknown provider name, or the mock gateway in production
 * (without explicit opt-in) refuses to boot. Payments must never silently
 * degrade to the forgeable simulated gateway.
 */

const config = require("../config");
const NmiGateway = require("./nmi");
const AuthorizeNetGateway = require("./authorizenet");
const MockGateway = require("./mock");

let instance = null;

function build() {
  switch (config.provider) {
    case "nmi": {
      const g = new NmiGateway();
      if (!g.isConfigured()) {
        throw new Error(
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
        throw new Error(
          "PAYMENT_PROVIDER=authorizenet but credentials are missing " +
            "(AUTHNET_API_LOGIN_ID, AUTHNET_TRANSACTION_KEY). Refusing to start."
        );
      }
      return g;
    }
    case "mock": {
      if (config.isProduction && !config.allowMockInProduction) {
        throw new Error(
          "PAYMENT_PROVIDER=mock is disabled in production. Configure a real " +
            "provider, or set ALLOW_MOCK_GATEWAY=true only for a staging demo."
        );
      }
      return new MockGateway();
    }
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${config.provider}". Expected "nmi", "authorizenet" or "mock".`
      );
  }
}

function getGateway() {
  if (!instance) instance = build();
  return instance;
}

module.exports = { getGateway };
