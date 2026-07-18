"use strict";

/**
 * Central config. Loads a local ".env" (if present) without external deps,
 * then exposes typed settings. All secret/credential values live here behind
 * environment variables — nothing is hard-coded.
 */

const fs = require("fs");
const path = require("path");

(function loadDotenv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  text.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) return;
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      // Unquoted values: strip trailing inline comments ("KEY=value  # note").
      val = val.replace(/\s+#.*$/, "").trim();
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = val;
  });
})();

const env = process.env;
const PUBLIC_BASE_URL = (env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

// Vercel sets VERCEL=1 on every deployment; VERCEL_ENV/NODE_ENV mark production.
const ON_VERCEL = Boolean(env.VERCEL);
const IS_PRODUCTION = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";

const config = {
  port: parseInt(env.PORT || "3000", 10),
  publicBaseUrl: PUBLIC_BASE_URL,
  currency: env.CURRENCY || "USD",

  onVercel: ON_VERCEL,
  isProduction: IS_PRODUCTION,

  // "invoice" (default) creates an order and emails manual payment
  // instructions. "stripe" restores the hosted Stripe Checkout flow without
  // requiring any code changes.
  checkoutMode: (env.CHECKOUT_MODE || "invoice").toLowerCase(),

  // "stripe" | "mock". Mock is restricted to non-production environments.
  provider: (env.PAYMENT_PROVIDER || "mock").toLowerCase(),

  // "file" | "redis" — defaults to redis whenever Upstash/KV credentials exist.
  orderStore: (env.ORDER_STORE || (env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL ? "redis" : "file")).toLowerCase(),
  redis: {
    // Vercel Marketplace (Upstash) injects UPSTASH_*; legacy Vercel KV injects KV_*.
    url: env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL || "",
    token: env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN || "",
  },

  paths: {
    success: env.CHECKOUT_SUCCESS_PATH || "/checkout/success",
    cancel: env.CHECKOUT_CANCEL_PATH || "/checkout/cancel",
    webhook: env.WEBHOOK_PATH || "/api/webhook/payment",
  },

  // Full return URLs handed to the gateway.
  urls: {
    success: PUBLIC_BASE_URL + (env.CHECKOUT_SUCCESS_PATH || "/checkout/success"),
    cancel: PUBLIC_BASE_URL + (env.CHECKOUT_CANCEL_PATH || "/checkout/cancel"),
    webhook: PUBLIC_BASE_URL + (env.WEBHOOK_PATH || "/api/webhook/payment"),
  },

  stripe: {
    checkoutUrl: env.STRIPE_CHECKOUT_URL || "https://api.stripe.com/v1/checkout/sessions",
    secretKey: env.STRIPE_SECRET_KEY || "",
    webhookSecret: env.STRIPE_WEBHOOK_SECRET || "",
  },

  // Manual-invoice destinations. Empty methods are omitted from the customer
  // email, which lets these values be added safely in Vercel later without
  // committing account details to the repository.
  manualPayments: {
    zelle: {
      recipient: env.ZELLE_RECIPIENT || "",
      accountName: env.ZELLE_ACCOUNT_NAME || "",
    },
    cashApp: {
      cashtag: env.CASHAPP_CASHTAG || "",
      url: env.CASHAPP_PAYMENT_URL || "",
    },
    paypal: {
      account: env.PAYPAL_ACCOUNT || "",
      url: env.PAYPAL_PAYMENT_URL || "",
    },
    crypto: {
      currency: env.CRYPTO_CURRENCY || "",
      network: env.CRYPTO_NETWORK || "",
      address: env.CRYPTO_WALLET_ADDRESS || "",
      url: env.CRYPTO_PAYMENT_URL || "",
    },
  },

  email: {
    host: env.SMTP_HOST || "",
    port: parseInt(env.SMTP_PORT || "587", 10),
    user: env.SMTP_USER || "",
    // Gmail displays app passwords with spaces ("xxxx xxxx xxxx xxxx");
    // pasting them verbatim fails auth, so strip whitespace for Gmail hosts.
    pass: /gmail/i.test(env.SMTP_HOST || "") ? (env.SMTP_PASS || "").replace(/\s+/g, "") : env.SMTP_PASS || "",
    from: env.RECEIPT_FROM || "Nuvamin <labs@nuvamin.bio>",
    support: env.SUPPORT_EMAIL || "support@nuvamin.bio",
    // Where contact-form messages land (the company inbox).
    contactTo: env.CONTACT_TO || env.SUPPORT_EMAIL || "support@nuvamin.bio",
    // Where new-paid-order notifications land (the company inbox).
    orderNotify: env.ORDER_NOTIFY_EMAIL || env.SUPPORT_EMAIL || "labs@nuvamin.bio",
  },

  // Google Sheets order log — an Apps Script web-app URL (see GOOGLE-WORKSPACE-SETUP.md).
  sheets: {
    webhookUrl: env.SHEETS_WEBHOOK_URL || "",
    secret: env.SHEETS_WEBHOOK_SECRET || "",
  },

  // The Lot Report mailing list — second Apps Script web app (subscribers
  // sheet). The same secret signs unsubscribe tokens in outgoing email.
  subscribers: {
    webhookUrl: env.SUBSCRIBERS_WEBHOOK_URL || "",
    secret: env.SUBSCRIBERS_WEBHOOK_SECRET || "",
  },

  // First-order discount promised to new Lot Report subscribers. The welcome
  // email (sent by the subscribers Apps Script) must advertise the same code.
  discount: {
    code: (env.FIRST_ORDER_DISCOUNT_CODE || "LOT10").toUpperCase(),
    percent: Math.min(90, Math.max(0, parseInt(env.FIRST_ORDER_DISCOUNT_PERCENT || "10", 10) || 0)),
  },

  adminToken: env.ADMIN_TOKEN || "",
};

module.exports = config;
