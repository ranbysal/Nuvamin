"use strict";

/**
 * Customer email receipt — triggered once, after a payment is CONFIRMED
 * (i.e. from the webhook that flips an order to "paid"), never on the mere
 * return redirect. If SMTP isn't configured it logs the receipt to the
 * console so the trigger is observable in development.
 */

const nodemailer = require("nodemailer");
const config = require("../server/config");

let transporter = null;
function getTransport() {
  if (transporter) return transporter;
  if (config.email.host) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: config.email.user ? { user: config.email.user, pass: config.email.pass } : undefined,
    });
  }
  return transporter;
}

function money(n, currency) {
  const sym = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency + " ";
  return sym + Number(n).toFixed(2);
}

function renderReceipt(order) {
  const lines = order.items
    .map((i) => `  ${i.quantity} x ${i.name} ${i.mg}  —  ${money(i.lineTotal, order.currency)}`)
    .join("\n");
  const text =
    `Thank you for your order.\n\n` +
    `Order ${order.id}\n` +
    `Status: PAID\n\n` +
    `${lines}\n\n` +
    `Subtotal: ${money(order.subtotal, order.currency)}\n` +
    `Shipping: ${order.shipping === 0 ? "Free" : money(order.shipping, order.currency)}\n` +
    `Total:    ${money(order.total, order.currency)}\n\n` +
    `A certificate of analysis is included with every order. ` +
    `Cold-chain dispatch on dry ice.\n\n` +
    `— Nuvamin`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;color:#111">` +
    `<h2 style="letter-spacing:.14em">NUVAMIN</h2>` +
    `<p>Thank you for your order.</p>` +
    `<p><strong>Order ${order.id}</strong> &mdash; <span style="color:#2e7d32">PAID</span></p>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px">` +
    order.items
      .map(
        (i) =>
          `<tr><td style="padding:6px 0;border-top:1px solid #eee">${i.quantity} &times; ${i.name} ${i.mg}</td>` +
          `<td align="right" style="padding:6px 0;border-top:1px solid #eee">${money(i.lineTotal, order.currency)}</td></tr>`
      )
      .join("") +
    `<tr><td style="padding:6px 0">Shipping</td><td align="right">${order.shipping === 0 ? "Free" : money(order.shipping, order.currency)}</td></tr>` +
    `<tr><td style="padding:8px 0;border-top:2px solid #111"><strong>Total</strong></td>` +
    `<td align="right" style="padding:8px 0;border-top:2px solid #111"><strong>${money(order.total, order.currency)}</strong></td></tr>` +
    `</table>` +
    `<p style="color:#666;font-size:12px">A certificate of analysis is included with every order. Cold-chain dispatch on dry ice.</p>` +
    `</div>`;
  return { text, html };
}

async function sendReceipt(order) {
  if (!order.customer || !order.customer.email) {
    console.log(`[email] order ${order.id} has no customer email — receipt skipped`);
    return { sent: false, reason: "no-email" };
  }
  const { text, html } = renderReceipt(order);
  const t = getTransport();
  if (!t) {
    console.log(
      `\n[email:DEV] Receipt for ${order.id} -> ${order.customer.email}\n` +
        `-------------------------------------------\n${text}\n-------------------------------------------\n`
    );
    return { sent: true, mode: "console" };
  }
  await t.sendMail({
    from: config.email.from,
    to: order.customer.email,
    subject: `Your Nuvamin order ${order.id}`,
    text,
    html,
  });
  return { sent: true, mode: "smtp" };
}

module.exports = { sendReceipt, renderReceipt };
