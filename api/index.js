"use strict";

/**
 * Vercel serverless entry point. The Express app is exported unbound from
 * server/app.js; Vercel invokes it per-request. All /api, /checkout, /admin
 * (and, outside production, /mock-hosted) traffic is routed here by
 * vercel.json — static pages/assets are served by the CDN, never by this
 * function.
 *
 * Requires on Vercel:
 *   - Upstash Redis integration (Storage tab) → order store
 *   - PUBLIC_BASE_URL, PAYMENT_PROVIDER + provider creds
 *   - GOOGLE_CLIENT_ID, AUTH_SESSION_SECRET, ADMIN_TOKEN, SMTP_*
 */

module.exports = require("../server/app");
