"use strict";

/**
 * Server-rendered HTML for the built-in MOCK hosted payment page.
 * This stands in for the gateway's real hosted page during development so the
 * redirect flow is fully testable. With a real provider (NMI/Authorize.Net)
 * this page is never shown — the customer lands on the provider's own page.
 *
 * The "card" inputs here are inert placeholders; nothing is transmitted or
 * stored. It exists only to drive the mock outcome buttons.
 */

function money(n, currency) {
  const sym = currency === "EUR" ? "€" : currency === "USD" ? "$" : currency + " ";
  return sym + Number(n).toFixed(2);
}

function MOCK_PAGE(order, session) {
  const rows = order.items
    .map(
      (i) =>
        `<tr><td>${i.quantity} &times; ${i.name} ${i.mg}</td><td class="r">${money(i.lineTotal, order.currency)}</td></tr>`
    )
    .join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Secure Checkout — Nuvamin</title>
<style>
  :root{--ink:#000;--line:rgba(0,0,0,.14);--mut:rgba(0,0,0,.55)}
  *{box-sizing:border-box}
  body{margin:0;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;background:#eceff1;color:#000;
       min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{background:#fff;max-width:460px;width:100%;padding:36px;border:1px solid var(--line)}
  .badge{font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--mut)}
  h1{font-family:"Space Grotesk",Arial,sans-serif;font-size:22px;letter-spacing:.02em;margin:6px 0 2px}
  .sim{font-size:11px;color:#8a6d3b;background:#fcf5e6;border:1px solid #ecdcae;padding:8px 10px;margin:14px 0}
  table{width:100%;border-collapse:collapse;font-size:14px;margin:10px 0 4px}
  td{padding:7px 0;border-top:1px solid #eee}.r{text-align:right}
  .tot{border-top:2px solid #000;font-weight:700}
  label{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);margin:16px 0 6px}
  input{width:100%;padding:12px;border:1px solid var(--line);font:inherit;background:#fafafa}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  button{width:100%;padding:15px;border:0;font-family:"Space Grotesk",Arial,sans-serif;font-size:12px;
         letter-spacing:.18em;text-transform:uppercase;cursor:pointer;margin-top:12px}
  .pay{background:#000;color:#fff}.alt{background:transparent;border:1px solid var(--line)}
  .foot{font-size:11px;color:var(--mut);margin-top:16px;text-align:center;line-height:1.6}
</style></head><body>
  <div class="card">
    <div class="badge">Secure hosted checkout</div>
    <h1>NUVAMIN</h1>
    <div class="badge">Order ${order.id}</div>
    <div class="sim">Simulated gateway (development). No real card is processed and nothing is stored.</div>
    <table>${rows}
      <tr><td>Shipping</td><td class="r">${order.shipping === 0 ? "Free" : money(order.shipping, order.currency)}</td></tr>
      <tr class="tot"><td>Total</td><td class="r">${money(order.total, order.currency)}</td></tr>
    </table>
    <label>Card number</label><input value="4242 4242 4242 4242" inputmode="numeric" autocomplete="off">
    <div class="grid"><div><label>Expiry</label><input value="12 / 30"></div>
      <div><label>CVC</label><input value="123"></div></div>
    <form method="POST" action="/mock-hosted/complete">
      <input type="hidden" name="order" value="${order.id}">
      <input type="hidden" name="session" value="${session}">
      <button class="pay" name="outcome" value="paid">Pay ${money(order.total, order.currency)}</button>
      <button class="alt" name="outcome" value="failed">Simulate decline</button>
      <button class="alt" name="outcome" value="cancel">Cancel &amp; return</button>
    </form>
    <p class="foot">Card data is entered on the gateway's PCI-compliant page.<br>Nuvamin never sees or stores it.</p>
  </div>
</body></html>`;
}

module.exports = { MOCK_PAGE, money };
