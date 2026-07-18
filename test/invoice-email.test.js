"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const PAYMENT_KEYS = [
  "ZELLE_RECIPIENT",
  "ZELLE_ACCOUNT_NAME",
  "CASHAPP_CASHTAG",
  "CASHAPP_PAYMENT_URL",
  "PAYPAL_ACCOUNT",
  "PAYPAL_PAYMENT_URL",
  "CRYPTO_CURRENCY",
  "CRYPTO_NETWORK",
  "CRYPTO_WALLET_ADDRESS",
  "CRYPTO_PAYMENT_URL",
];

function loadEmail(overrides) {
  PAYMENT_KEYS.forEach((key) => delete process.env[key]);
  Object.assign(process.env, overrides || {});
  delete require.cache[require.resolve("../server/email")];
  delete require.cache[require.resolve("../server/config")];
  return require("../server/email");
}

function orderFixture() {
  return {
    id: "NV-TEST1234567890AB",
    status: "pending",
    currency: "USD",
    items: [
      {
        id: "retatrutide",
        name: "Retatrutide",
        mg: "10MG",
        quantity: 1,
        lineTotal: 58,
      },
    ],
    subtotal: 58,
    discount: 0,
    discountCode: "",
    shipping: 6,
    total: 64,
    customer: { name: "Dr. Maren Keller", email: "maren@example.test" },
    shippingAddress: {
      name: "Dr. Maren Keller",
      line1: "412 Beacon Research Park",
      line2: "Building C",
      postalCode: "02110",
      city: "Boston",
      country: "United States",
    },
    createdAt: "2026-07-18T12:00:00.000Z",
  };
}

test("invoice renders only configured payment destinations", { concurrency: false }, () => {
  const email = loadEmail({
    ZELLE_RECIPIENT: "payments@example.test",
    ZELLE_ACCOUNT_NAME: "Nuvamin",
    CASHAPP_CASHTAG: "NuvaminLabs",
    CASHAPP_PAYMENT_URL: "https://cash.app/$NuvaminLabs",
    CRYPTO_CURRENCY: "USDC",
    CRYPTO_NETWORK: "Base",
    CRYPTO_WALLET_ADDRESS: "0x1234567890abcdef",
    PAYPAL_PAYMENT_URL: "javascript:alert(1)",
  });

  const rendered = email.renderPaymentRequest(orderFixture());
  assert.deepEqual(rendered.configuredMethods, ["Zelle", "Cash App", "Crypto"]);
  assert.match(rendered.html, /payments@example\.test/);
  assert.match(rendered.html, /\$NuvaminLabs/);
  assert.match(rendered.html, /USDC · Base/);
  assert.match(rendered.html, /Total due/);
  assert.doesNotMatch(rendered.html, /javascript:/);
  assert.doesNotMatch(rendered.html, />PayPal</);
});

test("invoice has a safe follow-up state before destinations are configured", { concurrency: false }, () => {
  const email = loadEmail({});
  const rendered = email.renderPaymentRequest(orderFixture());
  assert.deepEqual(rendered.configuredMethods, []);
  assert.match(rendered.text, /Payment options are being finalized/);
  assert.match(rendered.html, /Do not send payment until those instructions arrive/);
  assert.doesNotMatch(rendered.html, /CHANGE_ME|PLACEHOLDER|REPLACE_WITH/);
});
