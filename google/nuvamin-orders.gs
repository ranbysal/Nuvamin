/**
 * NUVAMIN — Orders & Fulfilment sheet
 * ------------------------------------------------------------------
 * Paste this whole file into the spreadsheet's Apps Script editor
 * (Extensions → Apps Script), change SECRET below, then run setup()
 * once (Run ▶ with "setup" selected) and authorize it.
 *
 * What it does:
 *   • Receives one row per PAID order from the website (doPost).
 *   • Formats the sheet as a fulfilment board: status colours, a
 *     "Fulfilled" checkbox, tracking + carrier columns.
 *   • When a team member ticks "Fulfilled", the customer instantly
 *     receives a designed "Your order is on the way" email — sent
 *     from THIS Google account's Gmail — including the tracking
 *     number and carrier if they were filled in first.
 *
 * Because the script runs as the account that owns the sheet, no API
 * keys or passwords are involved on this side.
 */

/* ============================ CONFIG ============================ */

var SECRET = "CHANGE_ME_TO_A_LONG_RANDOM_STRING"; // must match SHEETS_WEBHOOK_SECRET in Vercel
var SHOP_NAME = "Nuvamin";
var SITE = "https://nuvamin.bio";
var SUPPORT_EMAIL = "lab@nuvamin.bio"; // Reply-To on shipping emails
var SHEET_NAME = "Orders";

/* Column layout (1-based) */
var COL = {
  ORDER: 1, PLACED: 2, STATUS: 3, CUSTOMER: 4, EMAIL: 5, ITEMS: 6,
  SHIP_TO: 7, TOTAL: 8, FULFILLED: 9, TRACKING: 10, CARRIER: 11,
  SHIPPED_AT: 12, TXN: 13, DATA: 14
};
var HEADERS = [
  "Order", "Placed", "Status", "Customer", "Email", "Items",
  "Ship to", "Total", "Fulfilled ✓", "Tracking #", "Carrier",
  "Shipped at", "Txn", "Data"
];

var STATUS_NEW = "NEW — TO FULFIL";
var STATUS_SHIPPED = "SHIPPED ✓";
var BG_NEW = "#FFF8E1";
var BG_SHIPPED = "#E8F5E9";

/* ====================== ONE-TIME SETUP ========================== */

/** Run this once after pasting the script. Formats the board and
 *  installs the fulfilment trigger. Safe to re-run any time. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0].setName(SHEET_NAME);

  // headers
  var head = sheet.getRange(1, 1, 1, HEADERS.length);
  head.setValues([HEADERS]);
  head.setBackground("#000000").setFontColor("#FFFFFF").setFontWeight("bold")
      .setFontFamily("Arial").setVerticalAlignment("middle");
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);

  // column widths + wrapping
  var widths = [150, 130, 130, 140, 200, 220, 220, 70, 80, 150, 90, 130, 120, 40];
  for (var c = 0; c < widths.length; c++) sheet.setColumnWidth(c + 1, widths[c]);
  sheet.getRange(2, COL.ITEMS, 2000, 1).setWrap(true);
  sheet.getRange(2, COL.SHIP_TO, 2000, 1).setWrap(true);

  // "Fulfilled" checkboxes
  var box = SpreadsheetApp.newDataValidation().requireCheckbox().build();
  sheet.getRange(2, COL.FULFILLED, 2000, 1).setDataValidation(box);

  // hide the machine-readable data column
  sheet.hideColumns(COL.DATA);

  // install the fulfilment trigger (replacing any existing copy)
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "onEditFulfil") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onEditFulfil").forSpreadsheet(ss).onEdit().create();

  SpreadsheetApp.getUi().alert(
    "Nuvamin orders board is ready.\n\n" +
    "Next: Deploy → New deployment → Web app (execute as Me, access: Anyone), " +
    "then put the web-app URL + your SECRET into Vercel as SHEETS_WEBHOOK_URL / SHEETS_WEBHOOK_SECRET."
  );
}

/* ==================== ORDERS ARRIVING (doPost) =================== */

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) {
    return ContentService.createTextOutput("forbidden").setMimeType(ContentService.MimeType.TEXT);
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);

    var r = body.row;
    var placed = r.placedAt ? Utilities.formatDate(new Date(r.placedAt), Session.getScriptTimeZone(), "MMM d, yyyy HH:mm") : "";
    var rowIdx = sheet.getLastRow() + 1;
    sheet.getRange(rowIdx, 1, 1, HEADERS.length).setValues([[
      r.orderId, placed, STATUS_NEW, r.customerName, r.customerEmail,
      r.items, r.address, Number(r.total), false, "", "", "", r.transactionId,
      JSON.stringify(r)
    ]]);
    sheet.getRange(rowIdx, COL.STATUS).setBackground(BG_NEW).setFontWeight("bold");
    sheet.getRange(rowIdx, COL.TOTAL).setNumberFormat(r.currency === "USD" ? "$#,##0.00" : "#,##0.00");
    sheet.getRange(rowIdx, COL.FULFILLED).insertCheckboxes();

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/* ================= FULFILMENT (checkbox ticked) ================== */

/** Installable trigger (created by setup). When "Fulfilled" is ticked:
 *  emails the customer their shipping confirmation, stamps the row. */
function onEditFulfil(e) {
  var range = e.range;
  var sheet = range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (range.getColumn() !== COL.FULFILLED || range.getNumRows() !== 1) return;
  var row = range.getRow();
  if (row < 2) return;
  if (e.value !== "TRUE" && e.value !== true) return;                 // only on tick
  if (sheet.getRange(row, COL.SHIPPED_AT).getValue()) return;          // already shipped

  var get = function (c) { return String(sheet.getRange(row, c).getValue() || ""); };
  var email = get(COL.EMAIL);
  if (!email) {
    SpreadsheetApp.getActiveSpreadsheet().toast("No customer email on row " + row, "Nuvamin", 6);
    return;
  }

  var data = {};
  try { data = JSON.parse(get(COL.DATA) || "{}"); } catch (err) {}
  var orderId = data.orderId || get(COL.ORDER);
  var tracking = get(COL.TRACKING).trim();
  var carrier = get(COL.CARRIER).trim();

  var mail = buildShippedEmail(data, orderId, get(COL.CUSTOMER), get(COL.SHIP_TO), tracking, carrier);
  GmailApp.sendEmail(email, mail.subject, mail.text, {
    htmlBody: mail.html,
    name: SHOP_NAME,
    replyTo: SUPPORT_EMAIL
  });

  var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM d, yyyy HH:mm");
  sheet.getRange(row, COL.SHIPPED_AT).setValue(now);
  sheet.getRange(row, COL.STATUS).setValue(STATUS_SHIPPED).setBackground(BG_SHIPPED);
  SpreadsheetApp.getActiveSpreadsheet().toast("Shipping email sent to " + email, "Order " + orderId, 6);
}

/* ==================== SHIPPED EMAIL TEMPLATE ===================== */

function trackingUrl(carrier, tracking) {
  if (!tracking) return "";
  var c = carrier.toLowerCase();
  if (c.indexOf("ups") !== -1) return "https://www.ups.com/track?tracknum=" + encodeURIComponent(tracking);
  if (c.indexOf("usps") !== -1) return "https://tools.usps.com/go/TrackConfirmAction?tLabels=" + encodeURIComponent(tracking);
  if (c.indexOf("fedex") !== -1) return "https://www.fedex.com/fedextrack/?trknbr=" + encodeURIComponent(tracking);
  if (c.indexOf("dhl") !== -1) return "https://www.dhl.com/en/express/tracking.html?AWB=" + encodeURIComponent(tracking);
  return "";
}

function escH(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildShippedEmail(data, orderId, customerName, shipToText, tracking, carrier) {
  var SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  var SERIF = "Georgia,'Times New Roman',serif";
  var INK = "#111111", MUTE = "#78909C", SLATE = "#455A64", HAIR = "#E3E8EB", CREAM = "#ECEFF1";
  var money = function (n) { return "$" + Number(n).toFixed(2); };
  var items = (data.itemsDetailed || []);
  var shipLines = String(shipToText || data.address || "").split("\n").filter(String);
  var trackLink = trackingUrl(carrier, tracking);
  // First name for the greeting — skip honorifics like "Dr." / "Prof."
  var nameParts = String(customerName || "").trim().split(/\s+/)
    .filter(function (p) { return !/^(dr|prof|mr|mrs|ms|mx)\.?$/i.test(p); });
  var firstName = nameParts[0] || "";

  var itemRows = items.map(function (i) {
    return '<tr>' +
      '<td width="76" style="padding:16px 0;border-top:1px solid ' + HAIR + ';" valign="middle">' +
        '<img src="' + SITE + '/assets/img/email/' + escH(i.id) + '.png" width="52" alt="' + escH(i.name) + ' ' + escH(i.mg) + '" style="display:block;width:52px;height:auto;border:0;background:' + CREAM + ';"></td>' +
      '<td style="padding:16px 12px 16px 0;border-top:1px solid ' + HAIR + ';" valign="middle">' +
        '<p style="margin:0;font-family:' + SANS + ';font-size:13px;font-weight:700;letter-spacing:0.08em;color:' + INK + ';text-transform:uppercase;">' +
          escH(i.name) + '&nbsp;' + escH(i.mg) + '&nbsp;&nbsp;<span style="color:' + MUTE + ';font-weight:400;">&times;&nbsp;' + escH(i.quantity) + '</span></p>' +
        '<p style="margin:4px 0 0;font-family:' + SANS + ';font-size:12px;color:' + MUTE + ';">Lyophilised powder &middot; CoA in the box</p></td>' +
      '<td align="right" style="padding:16px 0;border-top:1px solid ' + HAIR + ';" valign="middle">' +
        '<span style="font-family:' + SANS + ';font-size:13px;color:' + INK + ';">' + money(i.lineTotal) + '</span></td></tr>';
  }).join("");

  var trackingBlock = tracking
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:26px 0 0;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #000000;"><tr><td align="center" style="padding:20px 24px;">' +
        '<p style="margin:0 0 6px;font-family:' + SANS + ';font-size:10px;font-weight:700;letter-spacing:0.26em;color:' + MUTE + ';text-transform:uppercase;">' +
          (carrier ? escH(carrier) + ' tracking' : 'Tracking number') + '</p>' +
        '<p style="margin:0;font-family:' + SANS + ';font-size:18px;font-weight:700;letter-spacing:0.06em;color:' + INK + ';">' + escH(tracking) + '</p>' +
      '</td></tr></table></td></tr></table>'
    : "";

  var cta = trackLink
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:34px 40px 0;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#000000;">' +
      '<a href="' + trackLink + '" style="display:inline-block;padding:17px 44px;font-family:' + SANS + ';font-size:12px;font-weight:700;letter-spacing:0.26em;color:#ffffff;text-decoration:none;text-transform:uppercase;">Track package</a>' +
      '</td></tr></table></td></tr></table>'
    : '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:34px 40px 0;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#000000;">' +
      '<a href="' + SITE + '" style="display:inline-block;padding:17px 44px;font-family:' + SANS + ';font-size:12px;font-weight:700;letter-spacing:0.26em;color:#ffffff;text-decoration:none;text-transform:uppercase;">Visit Nuvamin</a>' +
      '</td></tr></table></td></tr></table>';

  var shipTo = shipLines.length
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:26px 0 0;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + CREAM + ';"><tr><td style="padding:20px 24px;">' +
      '<p style="margin:0 0 8px;font-family:' + SANS + ';font-size:10px;font-weight:700;letter-spacing:0.26em;color:' + MUTE + ';text-transform:uppercase;">On its way to</p>' +
      '<p style="margin:0;font-family:' + SANS + ';font-size:13px;line-height:1.75;color:' + SLATE + ';">' + shipLines.map(escH).join("<br>") + '</p>' +
      '</td></tr></table></td></tr></table>'
    : "";

  var html = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light only"><title>Nuvamin</title></head>' +
    '<body style="margin:0;padding:0;background:' + CREAM + ';-webkit-text-size-adjust:100%;">' +
    '<div style="display:none;max-height:0;overflow:hidden;">Order ' + escH(orderId) + ' has shipped — it&rsquo;s on the way.</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + CREAM + ';"><tr><td align="center" style="padding:32px 12px 48px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">' +
    '<tr><td style="background:#000000;padding:26px 40px;" align="center">' +
      '<a href="' + SITE + '" style="text-decoration:none;"><span style="font-family:' + SANS + ';font-size:20px;font-weight:700;letter-spacing:0.42em;color:#ffffff;">NUVAMIN</span></a></td></tr>' +
    '<tr><td style="background:#ffffff;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:52px 40px 0;">' +
        '<p style="margin:0 0 18px;font-family:' + SANS + ';font-size:11px;font-weight:700;letter-spacing:0.3em;color:' + MUTE + ';text-transform:uppercase;">Shipping update</p>' +
        '<h1 style="margin:0;font-family:' + SANS + ';font-size:40px;line-height:1.04;font-weight:700;letter-spacing:-0.01em;color:' + INK + ';text-transform:uppercase;">It&rsquo;s on<br>the way.</h1>' +
        '<p style="margin:16px 0 0;font-family:' + SERIF + ';font-style:italic;font-size:18px;color:' + SLATE + ';">' +
          (firstName ? escH(firstName) + ", your" : "Your") + ' order has left the lab — packed cold, sealed, certified.</p>' +
      '</td></tr></table>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:26px 40px 8px;">' +
        '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border:1px solid ' + HAIR + ';padding:10px 22px;">' +
        '<span style="font-family:' + SANS + ';font-size:11px;letter-spacing:0.22em;color:' + INK + ';text-transform:uppercase;">Order&nbsp;' + escH(orderId) + '</span>' +
        '</td></tr></table></td></tr></table>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:26px 40px 0;">' +
        (itemRows ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + itemRows + '</table>' : '') +
        trackingBlock + shipTo +
      '</td></tr></table>' +
      cta +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:22px 40px 46px;">' +
        '<p style="margin:0;font-family:' + SANS + ';font-size:12px;line-height:1.8;color:' + MUTE + ';">Shipped on dry ice — store as directed on each vial as soon as it arrives.<br>Certificate of analysis included in the box.</p>' +
      '</td></tr></table>' +
    '</td></tr>' +
    '<tr><td style="padding:26px 40px 0;" align="center">' +
      '<p style="margin:0 0 6px;font-family:' + SANS + ';font-size:10px;letter-spacing:0.22em;color:' + MUTE + ';text-transform:uppercase;">Certificate of analysis included&nbsp;&nbsp;&middot;&nbsp;&nbsp;Cold-chain dispatch</p>' +
      '<p style="margin:0 0 14px;font-family:' + SANS + ';font-size:11px;line-height:1.7;color:#9AA7AE;">All Nuvamin products are supplied strictly for laboratory research use only.<br>Not for human or veterinary use.</p>' +
      '<p style="margin:0;font-family:' + SANS + ';font-size:11px;color:#9AA7AE;">Questions? <a href="mailto:' + SUPPORT_EMAIL + '" style="color:' + SLATE + ';text-decoration:underline;">' + SUPPORT_EMAIL + '</a>&nbsp;&nbsp;&middot;&nbsp;&nbsp;&copy; 2026 Nuvamin</p>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';

  var text =
    "Your order is on the way.\n\n" +
    "Order " + orderId + "\n" +
    (tracking ? (carrier ? carrier + " tracking: " : "Tracking: ") + tracking + "\n" : "") +
    (trackLink ? "Track it: " + trackLink + "\n" : "") + "\n" +
    items.map(function (i) { return "  " + i.quantity + " x " + i.name + " " + i.mg; }).join("\n") + "\n\n" +
    (shipLines.length ? "On its way to:\n  " + shipLines.join("\n  ") + "\n\n" : "") +
    "Shipped on dry ice — store as directed on each vial as soon as it arrives.\n" +
    "Certificate of analysis included in the box.\n\n" +
    "Questions? " + SUPPORT_EMAIL + "\n\n— " + SHOP_NAME;

  return {
    subject: "Your " + SHOP_NAME + " order " + orderId + " is on the way",
    html: html,
    text: text
  };
}
