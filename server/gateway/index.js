"use strict";

/**
 * Gateway factory. Selects the adapter from config.provider and gracefully
 * falls back to the mock gateway when a real provider is chosen but not yet
 * credentialed — so the site is always demonstrable.
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
      if (g.isConfigured()) return g;
      console.warn("[gateway] PAYMENT_PROVIDER=nmi but NMI creds are missing — using mock gateway.");
      return new MockGateway();
    }
    case "authorizenet": {
      const g = new AuthorizeNetGateway();
      if (g.isConfigured()) return g;
      console.warn("[gateway] PAYMENT_PROVIDER=authorizenet but creds are missing — using mock gateway.");
      return new MockGateway();
    }
    case "mock":
    default:
      return new MockGateway();
  }
}

function getGateway() {
  if (!instance) instance = build();
  return instance;
}

module.exports = { getGateway };
