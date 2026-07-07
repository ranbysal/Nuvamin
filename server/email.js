"use strict";

/**
 * Customer email receipt — triggered once, after a payment is CONFIRMED
 * (i.e. from the webhook that flips an order to "paid"), never on the mere
 * return redirect. If SMTP isn't configured it logs the receipt to the
 * console so the trigger is observable in development.
 *
 * The HTML templates are hand-built for email clients: table layout, inline
 * styles, system font stacks, PNG imagery (assets/img/email/) — no webp, no
 * webfonts, no flexbox. The "order shipped" sibling template lives in the
 * Google Sheet's Apps Script (see GOOGLE-WORKSPACE-SETUP.md) and mirrors
 * this design language.
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

/* ------------------------------------------------------- email template */

// Asset/link base for emails — must be the public https origin even when the
// server itself runs on localhost (mail clients fetch these URLs remotely).
const SITE = /localhost|127\.0\.0\.1/.test(config.publicBaseUrl || "")
  ? "https://nuvamin.bio"
  : config.publicBaseUrl || "https://nuvamin.bio";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const INK = "#111111";
const MUTE = "#78909C";
const SLATE = "#455A64";
const HAIR = "#E3E8EB";
const CREAM = "#ECEFF1";

/** Shared outer shell: cream canvas, white 600px card, black wordmark band. */
function emailShell(inner, preheader) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><title>Nuvamin</title></head>
<body style="margin:0;padding:0;background:${CREAM};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
<tr><td align="center" style="padding:32px 12px 48px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">
    <tr><td style="background:#000000;padding:26px 40px;" align="center">
      <a href="${SITE}" style="text-decoration:none;">
        <span style="font-family:${SANS};font-size:20px;font-weight:700;letter-spacing:0.42em;color:#ffffff;">NUVAMIN</span>
      </a>
    </td></tr>
    <tr><td style="background:#ffffff;">
      ${inner}
    </td></tr>
    <tr><td style="padding:26px 40px 0;" align="center">
      <p style="margin:0 0 6px;font-family:${SANS};font-size:10px;letter-spacing:0.22em;color:${MUTE};text-transform:uppercase;">
        Certificate of analysis included&nbsp;&nbsp;&middot;&nbsp;&nbsp;Cold-chain dispatch
      </p>
      <p style="margin:0 0 14px;font-family:${SANS};font-size:11px;line-height:1.7;color:#9AA7AE;">
        All Nuvamin products are supplied strictly for laboratory research use only.<br>
        Not for human or veterinary use.
      </p>
      <p style="margin:0;font-family:${SANS};font-size:11px;color:#9AA7AE;">
        Questions? <a href="mailto:${config.email.support}" style="color:${SLATE};text-decoration:underline;">${config.email.support}</a>
        &nbsp;&nbsp;&middot;&nbsp;&nbsp;&copy; 2026 Nuvamin
      </p>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

/** Hero block: kicker, big display headline, serif italic subline. */
function heroBlock(kicker, line1, line2, serifNote) {
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:52px 40px 0;">
        <p style="margin:0 0 18px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:0.3em;color:${MUTE};text-transform:uppercase;">${kicker}</p>
        <h1 style="margin:0;font-family:${SANS};font-size:40px;line-height:1.04;font-weight:700;letter-spacing:-0.01em;color:${INK};text-transform:uppercase;">
          ${line1}<br>${line2}
        </h1>
        <p style="margin:16px 0 0;font-family:${SERIF};font-style:italic;font-size:18px;color:${SLATE};">${serifNote}</p>
      </td></tr>
      </table>`;
}

function orderMetaBlock(order) {
  const d = new Date(order.createdAt);
  const date = isNaN(d) ? "" : d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:26px 40px 8px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="border:1px solid ${HAIR};padding:10px 22px;">
            <span style="font-family:${SANS};font-size:11px;letter-spacing:0.22em;color:${INK};text-transform:uppercase;">
              Order&nbsp;${escHtml(order.id)}${date ? `&nbsp;&nbsp;&middot;&nbsp;&nbsp;${date}` : ""}
            </span>
          </td>
        </tr></table>
      </td></tr>
      </table>`;
}

function itemRows(order) {
  return order.items
    .map(
      (i) => `
      <tr>
        <td width="76" style="padding:16px 0;border-top:1px solid ${HAIR};" valign="middle">
          <img src="${SITE}/assets/img/email/${escHtml(i.id)}.png" width="52" alt="${escHtml(i.name)} ${escHtml(i.mg)}"
               style="display:block;width:52px;height:auto;border:0;background:${CREAM};">
        </td>
        <td style="padding:16px 12px 16px 0;border-top:1px solid ${HAIR};" valign="middle">
          <p style="margin:0;font-family:${SANS};font-size:13px;font-weight:700;letter-spacing:0.08em;color:${INK};text-transform:uppercase;">
            ${escHtml(i.name)}&nbsp;${escHtml(i.mg)}&nbsp;&nbsp;<span style="color:${MUTE};font-weight:400;">&times;&nbsp;${escHtml(i.quantity)}</span>
          </p>
          <p style="margin:4px 0 0;font-family:${SANS};font-size:12px;color:${MUTE};">Lyophilised powder &middot; CoA included</p>
        </td>
        <td align="right" style="padding:16px 0;border-top:1px solid ${HAIR};" valign="middle">
          <span style="font-family:${SANS};font-size:13px;color:${INK};">${money(i.lineTotal, order.currency)}</span>
        </td>
      </tr>`
    )
    .join("");
}

function totalsBlock(order) {
  const row = (label, value, strong) => `
      <tr>
        <td style="padding:${strong ? "14px" : "6px"} 0 0;" ${strong ? `style="border-top:2px solid ${INK};"` : ""}>
          <span style="font-family:${SANS};font-size:${strong ? "13px" : "12px"};letter-spacing:0.14em;text-transform:uppercase;color:${strong ? INK : MUTE};font-weight:${strong ? "700" : "400"};">${label}</span>
        </td>
        <td align="right" style="padding:${strong ? "14px" : "6px"} 0 0;">
          <span style="font-family:${SANS};font-size:${strong ? "16px" : "12px"};color:${strong ? INK : SLATE};font-weight:${strong ? "700" : "400"};">${value}</span>
        </td>
      </tr>`;
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${row("Subtotal", money(order.subtotal, order.currency))}
        ${row("Shipping", order.shipping === 0 ? "Free" : money(order.shipping, order.currency))}
        <tr><td colspan="2" style="padding-top:14px;border-bottom:2px solid ${INK};"></td></tr>
        ${row("Total paid", money(order.total, order.currency), true)}
      </table>`;
}

function shipToBlock(order) {
  const addr = addressLines(order);
  if (!addr.length) return "";
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:26px 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM};">
        <tr><td style="padding:20px 24px;">
          <p style="margin:0 0 8px;font-family:${SANS};font-size:10px;font-weight:700;letter-spacing:0.26em;color:${MUTE};text-transform:uppercase;">Ships to</p>
          <p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.75;color:${SLATE};">${addr.map(escHtml).join("<br>")}</p>
        </td></tr>
        </table>
      </td></tr>
      </table>`;
}

function ctaButton(label, url) {
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:34px 40px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background:#000000;">
            <a href="${url}" style="display:inline-block;padding:17px 44px;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:0.26em;color:#ffffff;text-decoration:none;text-transform:uppercase;">${label}</a>
          </td>
        </tr></table>
      </td></tr>
      </table>`;
}

function renderReceipt(order) {
  const addr = addressLines(order);
  const text =
    `Your order is confirmed.\n\n` +
    `Order ${order.id}\n` +
    `Status: PAID\n\n` +
    order.items.map((i) => `  ${i.quantity} x ${i.name} ${i.mg}  —  ${money(i.lineTotal, order.currency)}`).join("\n") +
    `\n\nSubtotal: ${money(order.subtotal, order.currency)}\n` +
    `Shipping: ${order.shipping === 0 ? "Free" : money(order.shipping, order.currency)}\n` +
    `Total:    ${money(order.total, order.currency)}\n\n` +
    (addr.length ? `Ships to:\n  ${addr.join("\n  ")}\n\n` : "") +
    `We'll email you again the moment it ships. A certificate of analysis is ` +
    `included with every order. Cold-chain dispatch on dry ice.\n\n` +
    `Questions? ${config.email.support}\n\n— Nuvamin`;

  const inner = `
      ${heroBlock("Order confirmed", "Good things", "are coming.", "Thank you — your order is in the lab&rsquo;s hands now.")}
      ${orderMetaBlock(order)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="padding:26px 40px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${itemRows(order)}
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
          <tr><td style="border-top:1px solid ${HAIR};padding-top:16px;">
            ${totalsBlock(order)}
          </td></tr>
        </table>
        ${shipToBlock(order)}
      </td></tr>
      </table>
      ${ctaButton("View your order", `${SITE}/confirmation.html?order=${encodeURIComponent(order.id)}`)}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:22px 40px 46px;">
        <p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.8;color:${MUTE};">
          We&rsquo;ll email you again the moment your order ships.<br>
          Packed on dry ice, certificate of analysis in the box.
        </p>
      </td></tr>
      </table>`;

  const html = emailShell(inner, `Order ${order.id} confirmed — good things are coming.`);
  return { text, html };
}

/* -------------------------------------------------------------- senders */

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
    subject: `Your Nuvamin order ${order.id} is confirmed`,
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
    (addr.length ? `Ship to:\n  ${addr.join("\n  ")}\n` : "Ship to: (no address on file)\n") +
    `\nFulfil it from the Nuvamin Orders sheet — ticking "Fulfilled" emails the customer their shipping confirmation.`;
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
      ? `<p style="font-size:13px;color:#333"><strong>Ship to</strong><br>${addr.map(escHtml).join("<br>")}</p>`
      : `<p style="font-size:13px;color:#a00">No shipping address on file.</p>`) +
    `<p style="font-size:13px;color:#333">Fulfil from the <strong>Nuvamin Orders</strong> sheet — ticking <em>Fulfilled</em> emails the customer their shipping confirmation automatically.</p>` +
    `<p style="color:#666;font-size:12px">Questions? <a href="mailto:${escHtml(config.email.support)}">${escHtml(config.email.support)}</a></p>` +
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
