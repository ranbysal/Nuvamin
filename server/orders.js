"use strict";

/**
 * Order model + persistence.
 *
 * Status lifecycle:
 *   pending    — order created, awaiting payment (before redirect)
 *   paid       — gateway confirmed payment (via webhook — source of truth)
 *   failed     — gateway reported a declined/failed payment
 *   cancelled  — customer abandoned/cancelled the hosted checkout
 *   refunded   — a refund was issued (via webhook or admin action)
 *
 * Storage is a JSON file for portability (admin-readable). Swap this module's
 * internals for a real database without touching the rest of the app.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const STATUS = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
});

const DATA_DIR = path.join(__dirname, "data");
const STORE = path.join(DATA_DIR, "orders.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE)) fs.writeFileSync(STORE, "[]");
}

function readAll() {
  ensureStore();
  try {
    return JSON.parse(fs.readFileSync(STORE, "utf8")) || [];
  } catch (e) {
    return [];
  }
}

function writeAll(list) {
  ensureStore();
  fs.writeFileSync(STORE, JSON.stringify(list, null, 2));
}

function genId() {
  // Human-legible, unguessable order reference, e.g. NV-8F3K2QA7
  const rand = crypto.randomBytes(5).toString("hex").toUpperCase();
  return "NV-" + rand;
}

/**
 * Create a pending order from priced totals + customer contact.
 * This is the "backend order creation before payment" step.
 */
function createOrder({ pricing, customer, currency }) {
  const now = new Date().toISOString();
  const order = {
    id: genId(),
    status: STATUS.PENDING,
    currency: currency || "EUR",
    items: pricing.items,
    subtotal: pricing.subtotal,
    shipping: pricing.shipping,
    total: pricing.total,
    customer: {
      email: (customer && customer.email) || "",
      name: (customer && customer.name) || "",
    },
    payment: {
      provider: null,
      sessionId: null,
      transactionId: null,
      last4: null, // gateway-supplied display only; NEVER a full PAN
    },
    receiptSent: false,
    createdAt: now,
    updatedAt: now,
    events: [{ at: now, type: "created", status: STATUS.PENDING }],
  };
  const all = readAll();
  all.push(order);
  writeAll(all);
  return order;
}

function getOrder(id) {
  return readAll().find((o) => o.id === id) || null;
}

function updateOrder(id, mutator, eventType) {
  const all = readAll();
  const idx = all.findIndex((o) => o.id === id);
  if (idx === -1) return null;
  const order = all[idx];
  mutator(order);
  order.updatedAt = new Date().toISOString();
  if (eventType) {
    order.events.push({ at: order.updatedAt, type: eventType, status: order.status });
  }
  all[idx] = order;
  writeAll(all);
  return order;
}

function setStatus(id, status, patch, eventType) {
  return updateOrder(
    id,
    (o) => {
      o.status = status;
      if (patch) Object.assign(o.payment, patch);
    },
    eventType || "status:" + status
  );
}

function listOrders({ status } = {}) {
  let all = readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  if (status) all = all.filter((o) => o.status === status);
  return all;
}

module.exports = {
  STATUS,
  createOrder,
  getOrder,
  updateOrder,
  setStatus,
  listOrders,
};
