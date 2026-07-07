"use strict";

/**
 * Authoritative server-side price list. Orders are always priced from THIS
 * table using the product id sent by the client — the browser never dictates
 * price. Keep in sync with assets/js/products.js (id, name, mg, price).
 */

const CATALOG = {
  retatrutide: { name: "Retatrutide", mg: "10MG", price: 58 },
  "retatrutide-30": { name: "Retatrutide", mg: "30MG", price: 115 },
  tirzepatide: { name: "Tirzepatide", mg: "10MG", price: 45 },
  "tesamorelin-10": { name: "Tesamorelin", mg: "10MG", price: 62 },
  "tesamorelin-20": { name: "Tesamorelin", mg: "20MG", price: 100 },
  "ghk-cu-50": { name: "GHK-Cu", mg: "50MG", price: 30 },
  "ghk-cu-100": { name: "GHK-Cu", mg: "100MG", price: 55 },
  "bpc-157": { name: "BPC-157", mg: "10MG", price: 45 },
  "tb-500": { name: "TB-500", mg: "5MG", price: 55 },
  nad: { name: "NAD+", mg: "5MG", price: 65 },
};

// USD. Flat $6 shipping, free at $60+.
const FREE_SHIPPING_THRESHOLD = 60;
const SHIPPING_FEE = 6;

/**
 * Build validated, server-priced line items from a raw {id: qty} cart.
 * Unknown ids and non-positive quantities are dropped.
 */
function buildLineItems(rawCart) {
  const items = [];
  for (const id of Object.keys(rawCart || {})) {
    const qty = Math.max(0, Math.min(99, parseInt(rawCart[id], 10) || 0));
    const p = CATALOG[id];
    if (!p || qty <= 0) continue;
    items.push({
      id,
      name: p.name,
      mg: p.mg,
      unitPrice: p.price,
      quantity: qty,
      lineTotal: p.price * qty,
    });
  }
  return items;
}

function priceOrder(rawCart) {
  const items = buildLineItems(rawCart);
  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  const shipping = items.length === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
  const total = subtotal + shipping;
  return { items, subtotal, shipping, total };
}

module.exports = { CATALOG, priceOrder, FREE_SHIPPING_THRESHOLD, SHIPPING_FEE };
