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
 * Transitions are enforced (see LEGAL_TRANSITIONS): a late or replayed
 * webhook can never downgrade a paid order back to failed/cancelled.
 *
 * Storage drivers (ORDER_STORE=file|redis):
 *   file   — JSON file, single-host / local development
 *   redis  — Upstash Redis (REST), required on serverless hosts like Vercel
 *            where the filesystem is ephemeral
 *
 * The exported API is identical either way; every function returns a Promise.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("./config");

const STATUS = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
});

// From-status → allowed to-statuses. "failed → paid" covers a hosted-page
// retry that succeeds; "cancelled → paid" lets the authoritative webhook
// outrank a mere return-URL cancel. "paid" only ever moves to "refunded".
const LEGAL_TRANSITIONS = Object.freeze({
  [STATUS.PENDING]: [STATUS.PAID, STATUS.FAILED, STATUS.CANCELLED],
  [STATUS.FAILED]: [STATUS.PAID, STATUS.CANCELLED],
  [STATUS.CANCELLED]: [STATUS.PAID],
  [STATUS.PAID]: [STATUS.REFUNDED],
  [STATUS.REFUNDED]: [],
});

function canTransition(from, to) {
  return (LEGAL_TRANSITIONS[from] || []).includes(to);
}

/* ------------------------------------------------------------ file driver */

const DATA_DIR = path.join(__dirname, "data");
const STORE = path.join(DATA_DIR, "orders.json");

const fileDriver = {
  name: "file",
  _ensure() {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (!fs.existsSync(STORE)) fs.writeFileSync(STORE, "[]");
  },
  _readAll() {
    this._ensure();
    try {
      return JSON.parse(fs.readFileSync(STORE, "utf8")) || [];
    } catch (e) {
      return [];
    }
  },
  _writeAll(list) {
    this._ensure();
    fs.writeFileSync(STORE, JSON.stringify(list, null, 2));
  },
  async insert(order) {
    const all = this._readAll();
    all.push(order);
    this._writeAll(all);
  },
  async get(id) {
    return this._readAll().find((o) => o.id === id) || null;
  },
  async put(order) {
    const all = this._readAll();
    const idx = all.findIndex((o) => o.id === order.id);
    if (idx === -1) return;
    all[idx] = order;
    this._writeAll(all);
  },
  async list() {
    return this._readAll();
  },
};

/* ----------------------------------------------------------- redis driver */

const ORDER_KEY = (id) => "nv:order:" + id;
const INDEX_KEY = "nv:orders"; // sorted set: score = createdAt epoch ms

function makeRedisDriver() {
  if (!config.redis.url || !config.redis.token) {
    throw new Error(
      "ORDER_STORE=redis but Redis credentials are missing. Set " +
        "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (the Vercel " +
        "Upstash integration injects these automatically)."
    );
  }
  const { Redis } = require("@upstash/redis");
  const redis = new Redis({ url: config.redis.url, token: config.redis.token });
  return {
    name: "redis",
    async insert(order) {
      await redis.set(ORDER_KEY(order.id), order);
      await redis.zadd(INDEX_KEY, { score: Date.parse(order.createdAt), member: order.id });
    },
    async get(id) {
      return (await redis.get(ORDER_KEY(id))) || null;
    },
    async put(order) {
      await redis.set(ORDER_KEY(order.id), order);
    },
    async list() {
      const ids = await redis.zrange(INDEX_KEY, 0, -1);
      if (!ids.length) return [];
      const rows = await redis.mget(...ids.map(ORDER_KEY));
      return rows.filter(Boolean);
    },
  };
}

/* --------------------------------------------------------- driver select */

function buildDriver() {
  if (config.orderStore === "redis") return makeRedisDriver();
  if (config.orderStore === "file") {
    if (config.onVercel) {
      throw new Error(
        "ORDER_STORE=file cannot run on Vercel — the serverless filesystem is " +
          "ephemeral and orders would be lost. Add the Upstash Redis integration " +
          "(Vercel → Storage → Upstash) or set ORDER_STORE=redis with credentials."
      );
    }
    if (config.isProduction) {
      console.warn(
        "[orders] WARNING: file-backed order store in production. Fine for a " +
          "single host; use ORDER_STORE=redis for anything serverless or multi-instance."
      );
    }
    return fileDriver;
  }
  throw new Error(`Unknown ORDER_STORE "${config.orderStore}". Expected "file" or "redis".`);
}

const driver = buildDriver();
console.log(`[nuvamin] order store: ${driver.name}`);

/* ---------------------------------------------------------------- model */

function genId() {
  // Human-legible, unguessable order reference, e.g. NV-8F3K2QA7C1D4E9AB
  const rand = crypto.randomBytes(8).toString("hex").toUpperCase();
  return "NV-" + rand;
}

/**
 * Create a pending order from priced totals + customer contact & shipping.
 * This is the "backend order creation before payment" step.
 */
async function createOrder({ pricing, customer, shipping, currency }) {
  const now = new Date().toISOString();
  const order = {
    id: genId(),
    status: STATUS.PENDING,
    currency: currency || "USD",
    items: pricing.items,
    subtotal: pricing.subtotal,
    discount: pricing.discount || 0,
    discountCode: pricing.discountCode || "",
    shipping: pricing.shipping,
    total: pricing.total,
    customer: {
      email: (customer && customer.email) || "",
      name: (customer && customer.name) || "",
    },
    shippingAddress: shipping
      ? {
          name: shipping.name || "",
          line1: shipping.line1 || "",
          line2: shipping.line2 || "",
          city: shipping.city || "",
          postalCode: shipping.postalCode || "",
          country: shipping.country || "",
        }
      : null,
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
  await driver.insert(order);
  return order;
}

async function getOrder(id) {
  if (!id) return null;
  return driver.get(id);
}

async function updateOrder(id, mutator, eventType) {
  const order = await driver.get(id);
  if (!order) return null;
  mutator(order);
  order.updatedAt = new Date().toISOString();
  if (eventType) {
    order.events.push({ at: order.updatedAt, type: eventType, status: order.status });
  }
  await driver.put(order);
  return order;
}

/**
 * Apply a status change IF the transition is legal; returns the updated
 * order, or null when the order is missing or the transition is rejected
 * (e.g. a replayed "paid" webhook, or "failed" arriving after "paid").
 * Callers use the null return to stay idempotent — no duplicate receipts.
 */
async function setStatus(id, status, patch, eventType) {
  const current = await driver.get(id);
  if (!current) return null;
  if (!canTransition(current.status, status)) {
    if (current.status !== status) {
      console.warn(`[orders] rejected transition ${current.status} → ${status} for ${id}`);
    }
    return null;
  }
  return updateOrder(
    id,
    (o) => {
      o.status = status;
      if (patch) Object.assign(o.payment, patch);
    },
    eventType || "status:" + status
  );
}

async function listOrders({ status } = {}) {
  let all = (await driver.list()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
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
