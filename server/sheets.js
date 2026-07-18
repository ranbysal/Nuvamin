"use strict";

/**
 * Order log → Google Sheets.
 *
 * Posts one JSON row per PLACED order to a Google Apps Script "web app" URL
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
let capabilityCache = null;

async function postToSheet(payload) {
  const resp = await fetch(config.sheets.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ secret: config.sheets.secret }, payload)),
    redirect: "follow",
  });
  const text = await resp.text().catch(() => "");
  if (!resp.ok) throw new Error(`sheet webhook responded ${resp.status}: ${text.slice(0, 200)}`);
  let body = {};
  try { body = JSON.parse(text || "{}"); } catch (_err) {}
  return body;
}

/**
 * Refuse live invoice orders until the deployed Sheet script understands the
 * unpaid-order + payment-confirmation workflow. This prevents the previous
 * paid-only sheet from presenting an unpaid order as ready to fulfil.
 */
async function invoiceWorkflowStatus() {
  if (!config.sheets.webhookUrl || !config.sheets.secret) {
    return config.isProduction
      ? { ready: false, reason: "not-configured" }
      : { ready: true, reason: "development-without-sheet" };
  }
  if (capabilityCache && capabilityCache.expiresAt > Date.now()) {
    return capabilityCache.value;
  }
  try {
    const result = await postToSheet({ action: "capabilities" });
    const capabilities = Array.isArray(result.capabilities) ? result.capabilities : [];
    const ready = Number(result.version) >= 2 &&
      capabilities.includes("pending_orders") && capabilities.includes("confirm_payment");
    const value = { ready, version: result.version || null, capabilities };
    capabilityCache = {
      value,
      expiresAt: Date.now() + (ready ? 5 * 60 * 1000 : 15 * 1000),
    };
    return value;
  } catch (err) {
    console.error("[sheets] capability check failed:", err.message);
    const value = { ready: false, reason: err.message };
    capabilityCache = { value, expiresAt: Date.now() + 15 * 1000 };
    return value;
  }
}

function rowFor(order) {
  const a = order.shippingAddress || {};
  const addressLines = [a.name, a.line1, a.line2, `${a.postalCode || ""} ${a.city || ""}`.trim(), a.country].filter(Boolean);
  return {
    orderId: order.id,
    placedAt: order.createdAt,
    status: order.status,
    customerName: order.customer.name || "",
    customerEmail: order.customer.email || "",
    // Multiline for the sheet cell; itemsDetailed for the shipped email.
    items:
      order.items.map((i) => `${i.quantity} × ${i.name} ${i.mg}`).join("\n") +
      (order.discount ? `\nCode ${order.discountCode || ""}: −$${Number(order.discount).toFixed(2)}` : ""),
    itemsDetailed: order.items.map((i) => ({
      id: i.id,
      name: i.name,
      mg: i.mg,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    subtotal: order.subtotal,
    shipping: order.shipping,
    total: order.total,
    currency: order.currency,
    address: addressLines.join("\n"),
    transactionId: (order.payment && order.payment.transactionId) || "",
    provider: (order.payment && order.payment.provider) || "",
    paymentMethod: (order.payment && order.payment.method) || "",
    paidAt: order.paidAt || "",
  };
}

async function logOrder(order) {
  const row = rowFor(order);
  if (!config.sheets.webhookUrl) {
    console.log(`[sheets:DEV] order row (SHEETS_WEBHOOK_URL not set):`, JSON.stringify(row));
    return { logged: false, reason: "not-configured" };
  }
  try {
    await postToSheet({ action: "place_order", row });
    return { logged: true };
  } catch (e) {
    console.error(`[sheets] failed to log order ${order.id}:`, e.message);
    return { logged: false, reason: e.message };
  }
}

module.exports = { invoiceWorkflowStatus, logOrder, rowFor };
