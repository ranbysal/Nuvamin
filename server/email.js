"use strict";

/**
 * Customer email receipt — triggered once, after a payment is CONFIRMED
 * (i.e. from the webhook that flips an order to "paid"), never on the mere
 * return redirect. If SMTP isn't configured it logs the receipt to the
 * console so the trigger is observable in development.
 */

const nodemailer = require("nodemailer");
const config = require("./config");

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

function escHtml(v) {
  return String(v == null ? "" : v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addressLines(order) {
  const a = order.shippingAddress;
  if (!a || !a.line1) return [];
  return [a.name, a.line1, a.line2, `${a.postalCode} ${a.city}`.trim(), a.country].filter(Boolean);
}

function renderReceipt(order) {
  const lines = order.items
    .map((i) => `  ${i.quantity} x ${i.name} ${i.mg}  —  ${money(i.lineTotal, order.currency)}`)
    .join("\n");
  const addr = addressLines(order);
  const text =
    `Thank you for your order.\n\n` +
    `Order ${order.id}\n` +
    `Status: PAID\n\n` +
    `${lines}\n\n` +
    `Subtotal: ${money(order.subtotal, order.currency)}\n` +
    `Shipping: ${order.shipping === 0 ? "Free" : money(order.shipping, order.currency)}\n` +
    `Total:    ${money(order.total, order.currency)}\n\n` +
    (addr.length ? `Ships to:\n  ${addr.join("\n  ")}\n\n` : "") +
    `A certificate of analysis is included with every order. ` +
    `Cold-chain dispatch on dry ice.\n\n` +
    `Questions? ${config.email.support}\n\n` +
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
    (addr.length
      ? `<p style="font-size:13px;color:#333"><strong>Ships to</strong><br>${addr.map(escHtml).join("<br>")}</p>`
      : "") +
    `<p style="color:#666;font-size:12px">A certificate of analysis is included with every order. Cold-chain dispatch on dry ice.</p>` +
    `<p style="color:#666;font-size:12px">Questions? <a href="mailto:${escHtml(config.email.support)}">${escHtml(config.email.support)}</a></p>` +
    `</div>`;
  return { text, html };
}

/**
 * Send a message through the configured SMTP transport, or print it to the
 * console when SMTP isn't configured (dev mode) so the trigger is observable.
 */
async function deliver({ to, subject, text, html, replyTo }) {
  const t = getTransport();
  if (!t) {
    console.log(
      `\n[email:DEV] "${subject}" -> ${to}${replyTo ? ` (reply-to ${replyTo})` : ""}\n` +
        `-------------------------------------------\n${text}\n-------------------------------------------\n`
    );
    return { sent: true, mode: "console" };
  }
  await t.sendMail({ from: config.email.from, to, subject, text, html, replyTo });
  return { sent: true, mode: "smtp" };
}

async function sendReceipt(order) {
  if (!order.customer || !order.customer.email) {
    console.log(`[email] order ${order.id} has no customer email — receipt skipped`);
    return { sent: false, reason: "no-email" };
  }
  const { text, html } = renderReceipt(order);
  return deliver({
    to: order.customer.email,
    subject: `Your Nuvamin order ${order.id}`,
    text,
    html,
  });
}

/**
 * Internal notification to the company inbox when an order is PAID —
 * everything fulfilment needs: items, totals, customer contact, address.
 */
async function sendOrderNotification(order) {
  const lines = order.items
    .map((i) => `  ${i.quantity} x ${i.name} ${i.mg}  —  ${money(i.lineTotal, order.currency)}`)
    .join("\n");
  const addr = addressLines(order);
  const text =
    `New PAID order on the storefront.\n\n` +
    `Order:    ${order.id}\n` +
    `Placed:   ${order.createdAt}\n` +
    `Customer: ${order.customer.name || "—"} <${order.customer.email}>\n` +
    (order.payment && order.payment.transactionId ? `Txn:      ${order.payment.transactionId}\n` : "") +
    `\n${lines}\n\n` +
    `Subtotal: ${money(order.subtotal, order.currency)}\n` +
    `Shipping: ${order.shipping === 0 ? "Free" : money(order.shipping, order.currency)}\n` +
    `Total:    ${money(order.total, order.currency)}\n\n` +
    (addr.length ? `Ship to:\n  ${addr.join("\n  ")}\n` : "Ship to: (no address on file)\n");
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111">` +
    `<h2 style="letter-spacing:.14em">NUVAMIN — new paid order</h2>` +
    `<p><strong>${escHtml(order.id)}</strong> &middot; ${escHtml(order.createdAt)}</p>` +
    `<p>Customer: ${escHtml(order.customer.name || "—")} &lt;${escHtml(order.customer.email)}&gt;</p>` +
    `<table style="width:100%;border-collapse:collapse;font-size:14px">` +
    order.items
      .map(
        (i) =>
          `<tr><td style="padding:6px 0;border-top:1px solid #eee">${i.quantity} &times; ${escHtml(i.name)} ${escHtml(i.mg)}</td>` +
          `<td align="right" style="padding:6px 0;border-top:1px solid #eee">${money(i.lineTotal, order.currency)}</td></tr>`
      )
      .join("") +
    `<tr><td style="padding:6px 0">Shipping</td><td align="right">${order.shipping === 0 ? "Free" : money(order.shipping, order.currency)}</td></tr>` +
    `<tr><td style="padding:8px 0;border-top:2px solid #111"><strong>Total</strong></td>` +
    `<td align="right" style="padding:8px 0;border-top:2px solid #111"><strong>${money(order.total, order.currency)}</strong></td></tr>` +
    `</table>` +
    (addr.length
      ? `<p style="font-size:13px"><strong>Ship to</strong><br>${addr.map(escHtml).join("<br>")}</p>`
      : `<p style="font-size:13px;color:#a00">No shipping address on file.</p>`) +
    `</div>`;
  return deliver({
    to: config.email.orderNotify,
    subject: `New order ${order.id} — ${money(order.total, order.currency)} (paid)`,
    text,
    html,
    replyTo: order.customer.email || undefined,
  });
}

/**
 * Contact-form message → company inbox. Reply-To is set to the visitor so
 * the client can answer straight from their mailbox.
 */
async function sendContactMessage({ name, email, institution, topic, message }) {
  const text =
    `New message from the site contact form.\n\n` +
    `From:        ${name} <${email}>\n` +
    (institution ? `Institution: ${institution}\n` : "") +
    (topic ? `Topic:       ${topic}\n` : "") +
    `\n${message}\n`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;color:#111">` +
    `<h2 style="letter-spacing:.14em">NUVAMIN — contact form</h2>` +
    `<p><strong>${escHtml(name)}</strong> &lt;${escHtml(email)}&gt;` +
    (institution ? `<br>Institution: ${escHtml(institution)}` : "") +
    (topic ? `<br>Topic: ${escHtml(topic)}` : "") +
    `</p><p style="white-space:pre-wrap;border-top:1px solid #eee;padding-top:12px">${escHtml(message)}</p>` +
    `</div>`;
  return deliver({
    to: config.email.contactTo,
    subject: `Contact form: ${topic || "message"} — ${name}`,
    text,
    html,
    replyTo: email,
  });
}

module.exports = { sendReceipt, renderReceipt, sendOrderNotification, sendContactMessage };
