"use strict";

/**
 * Authoritative server-side price list. Orders are always priced from THIS
 * table using the product id sent by the client — the browser never dictates
 * price. Keep in sync with assets/js/products.js (id, name, mg, price).
 */

const CATALOG = {
  retatrutide: { name: "Retatrutide", mg: "10MG", price: 135 },
  tirzepatide: { name: "Tirzepatide", mg: "10MG", price: 110 },
  "bpc-157": { name: "BPC-157", mg: "10MG", price: 60 },
  "tb-500": { name: "TB-500", mg: "5MG", price: 55 },
  nad: { name: "NAD+", mg: "5MG", price: 65 },
};

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
