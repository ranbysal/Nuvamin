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

  // "nmi" | "authorizenet" | "mock"
  provider: (env.PAYMENT_PROVIDER || "mock").toLowerCase(),
  // Explicit opt-in required to run the simulated gateway in production.
  allowMockInProduction: env.ALLOW_MOCK_GATEWAY === "true",

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

  nmi: {
    checkoutUrl: env.NMI_CHECKOUT_URL || "https://secure.nmi.com/api/v4/checkouts",
    // ▼ LIVE credentials come from env — placeholders in .env.example ▼
    processorAccountId: env.NMI_PROCESSOR_ACCOUNT_ID || "",
    securityKey: env.NMI_SECURITY_KEY || "",
    webhookSecret: env.NMI_WEBHOOK_SECRET || "",
  },

  authnet: {
    apiLoginId: env.AUTHNET_API_LOGIN_ID || "",
    transactionKey: env.AUTHNET_TRANSACTION_KEY || "",
    signatureKey: env.AUTHNET_SIGNATURE_KEY || "",
    environment: env.AUTHNET_ENV || "sandbox",
  },

  email: {
    host: env.SMTP_HOST || "",
    port: parseInt(env.SMTP_PORT || "587", 10),
    user: env.SMTP_USER || "",
    pass: env.SMTP_PASS || "",
    from: env.RECEIPT_FROM || "Nuvamin <lab@nuvamin.com>",
    support: env.SUPPORT_EMAIL || "lab@nuvamin.com",
    // Where contact-form messages land (the company inbox).
    contactTo: env.CONTACT_TO || env.SUPPORT_EMAIL || "lab@nuvamin.com",
    // Where new-paid-order notifications land (the company inbox).
    orderNotify: env.ORDER_NOTIFY_EMAIL || env.SUPPORT_EMAIL || "lab@nuvamin.com",
  },

  // Google Sheets order log — an Apps Script web-app URL (see GOOGLE-WORKSPACE-SETUP.md).
  sheets: {
    webhookUrl: env.SHEETS_WEBHOOK_URL || "",
    secret: env.SHEETS_WEBHOOK_SECRET || "",
  },

  adminToken: env.ADMIN_TOKEN || "",
};

module.exports = config;
