"use strict";

/**
 * Order log → Google Sheets.
 *
 * Posts one JSON row per PAID order to a Google Apps Script "web app" URL
 * bound to the client's spreadsheet (setup + the script to paste are in
 * GOOGLE-WORKSPACE-SETUP.md). No Google API keys or service accounts needed —
 * the client owns the sheet and the script; this server only needs the URL
 * and a shared secret, both from env:
 *
 *   SHEETS_WEBHOOK_URL     — the deployed Apps Script web-app URL
 *   SHEETS_WEBHOOK_SECRET  — shared secret the script checks before writing
 *
 * Logging must never break order processing: failures are logged and
 * swallowed. When the URL isn't configured, rows are printed to the console
 * so the trigger is observable in development.
 */

const config = require("./config");

function rowFor(order) {
  const a = order.shippingAddress || {};
  return {
    orderId: order.id,
    placedAt: order.createdAt,
    status: order.status,
    customerName: order.customer.name || "",
    customerEmail: order.customer.email || "",
    items: order.items.map((i) => `${i.quantity}x ${i.name} ${i.mg}`).join("; "),
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    currency: order.currency,
    address: [a.line1, a.line2, `${a.postalCode || ""} ${a.city || ""}`.trim(), a.country]
      .filter(Boolean)
      .join(", "),
    transactionId: (order.payment && order.payment.transactionId) || "",
    provider: (order.payment && order.payment.provider) || "",
  };
}

async function logOrder(order) {
  const row = rowFor(order);
  if (!config.sheets.webhookUrl) {
    console.log(`[sheets:DEV] order row (SHEETS_WEBHOOK_URL not set):`, JSON.stringify(row));
    return { logged: false, reason: "not-configured" };
  }
  try {
    const resp = await fetch(config.sheets.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: config.sheets.secret, row }),
      redirect: "follow", // Apps Script replies via a 302 to a result URL
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`sheet webhook responded ${resp.status}: ${body.slice(0, 200)}`);
    }
    return { logged: true };
  } catch (e) {
    console.error(`[sheets] failed to log order ${order.id}:`, e.message);
    return { logged: false, reason: e.message };
  }
}

module.exports = { logOrder, rowFor };
