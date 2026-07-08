/**
 * NUVAMIN — The Lot Report (subscribers list)
 * ------------------------------------------------------------------
 * Paste this whole file into a NEW spreadsheet's Apps Script editor
 * (Extensions → Apps Script), change SECRET below, then run setup()
 * once (Run ▶ with "setup" selected) and authorize it.
 *
 * What it does:
 *   • Receives newsletter signups from the website (doPost) and adds
 *     them to the list — duplicates are ignored automatically.
 *   • Instantly emails every NEW subscriber a designed welcome email
 *     with the first-order discount code, sent from THIS Google
 *     account's Gmail.
 *   • Adds a "Nuvamin" menu to the sheet with "Send lot-drop email…"
 *     — fill in a compound name + link and every Active subscriber
 *     gets the designed announcement.
 *   • Handles one-click unsubscribes from email links (the site
 *     verifies a signed token, then notifies this script).
 *
 * NOTE: keep SECRET identical to SUBSCRIBERS_WEBHOOK_SECRET in Vercel
 * — it authenticates signups AND signs the unsubscribe links.
 */

/* ============================ CONFIG ============================ */

var SECRET = "CHANGE_ME_TO_A_DIFFERENT_LONG_RANDOM_STRING"; // must match SUBSCRIBERS_WEBHOOK_SECRET in Vercel
var SHOP_NAME = "Nuvamin";
var SITE = "https://nuvamin.bio";
var SUPPORT_EMAIL = "support@nuvamin.bio";
var DISCOUNT_CODE = "LOT10";   // must match FIRST_ORDER_DISCOUNT_CODE in Vercel
var DISCOUNT_PERCENT = 10;     // must match FIRST_ORDER_DISCOUNT_PERCENT in Vercel
var SHEET_NAME = "Subscribers";

var COL = { EMAIL: 1, SIGNED_UP: 2, SOURCE: 3, STATUS: 4, WELCOME: 5, UNSUB_AT: 6 };
var HEADERS = ["Email", "Signed up", "Source", "Status", "Welcome sent", "Unsubscribed at"];
var STATUS_ACTIVE = "ACTIVE";
var STATUS_UNSUB = "UNSUBSCRIBED";
var BG_ACTIVE = "#E8F5E9";
var BG_UNSUB = "#FBE9E7";

/* ====================== ONE-TIME SETUP ========================== */

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0].setName(SHEET_NAME);

  var head = sheet.getRange(1, 1, 1, HEADERS.length);
  head.setValues([HEADERS]);
  head.setBackground("#000000").setFontColor("#FFFFFF").setFontWeight("bold")
      .setFontFamily("Arial").setVerticalAlignment("middle");
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 34);
  var widths = [260, 150, 150, 130, 130, 150];
  for (var c = 0; c < widths.length; c++) sheet.setColumnWidth(c + 1, widths[c]);

  SpreadsheetApp.getUi().alert(
    "The Lot Report list is ready.\n\n" +
    "Next: Deploy → New deployment → Web app (execute as Me, access: Anyone), then put " +
    "the web-app URL + your SECRET into Vercel as SUBSCRIBERS_WEBHOOK_URL / SUBSCRIBERS_WEBHOOK_SECRET.\n\n" +
    "To announce a drop: use the Nuvamin menu in the sheet's toolbar."
  );
}

/** Adds the "Nuvamin" menu whenever the sheet is opened. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Nuvamin")
    .addItem("Send lot-drop email…", "sendLotDrop")
    .addToUi();
}

/* ================== SIGNUPS & UNSUBSCRIBES (doPost) ============== */

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

    var email = String(body.email || "").trim().toLowerCase();
    if (!email) return jsonOut({ ok: false, error: "no email" });

    var rowIdx = findRowByEmail(sheet, email);

    if (body.action === "unsubscribe") {
      if (rowIdx) {
        var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM d, yyyy HH:mm");
        sheet.getRange(rowIdx, COL.STATUS).setValue(STATUS_UNSUB).setBackground(BG_UNSUB);
        sheet.getRange(rowIdx, COL.UNSUB_AT).setValue(now);
      }
      return jsonOut({ ok: true });
    }

    // subscribe
    if (rowIdx) {
      // Re-subscribing after an unsubscribe reactivates; otherwise no-op.
      if (String(sheet.getRange(rowIdx, COL.STATUS).getValue()) === STATUS_UNSUB) {
        sheet.getRange(rowIdx, COL.STATUS).setValue(STATUS_ACTIVE).setBackground(BG_ACTIVE);
        sheet.getRange(rowIdx, COL.UNSUB_AT).setValue("");
      }
      return jsonOut({ ok: true, already: true });
    }

    var now2 = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMM d, yyyy HH:mm");
    var newRow = sheet.getLastRow() + 1;
    sheet.getRange(newRow, 1, 1, HEADERS.length).setValues([[
      email, now2, String(body.source || "site"), STATUS_ACTIVE, "", ""
    ]]);
    sheet.getRange(newRow, COL.STATUS).setBackground(BG_ACTIVE);

    // welcome email with the first-order code
    try {
      var mail = buildWelcomeEmail(email);
      GmailApp.sendEmail(email, mail.subject, mail.text, {
        htmlBody: mail.html, name: SHOP_NAME, replyTo: SUPPORT_EMAIL
      });
      sheet.getRange(newRow, COL.WELCOME).setValue(now2);
    } catch (err) {
      sheet.getRange(newRow, COL.WELCOME).setValue("FAILED: " + err);
    }

    return jsonOut({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function findRowByEmail(sheet, email) {
  var last = sheet.getLastRow();
  if (last < 2) return 0;
  var values = sheet.getRange(2, COL.EMAIL, last - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim().toLowerCase() === email) return i + 2;
  }
  return 0;
}

/* ==================== LOT-DROP ANNOUNCEMENT ====================== */

/** Menu action: prompts for the drop details, then emails every ACTIVE
 *  subscriber. Gmail sending quotas apply (~1,500/day on Workspace). */
function sendLotDrop() {
  var ui = SpreadsheetApp.getUi();
  var p1 = ui.prompt("Lot drop", 'Compound + dose (e.g. "Retatrutide 30MG"):', ui.ButtonSet.OK_CANCEL);
  if (p1.getSelectedButton() !== ui.Button.OK || !p1.getResponseText().trim()) return;
  var compound = p1.getResponseText().trim();
  var p2 = ui.prompt("Lot drop", "Product link (full URL, e.g. " + SITE + "/product.html?id=retatrutide-30):", ui.ButtonSet.OK_CANCEL);
  if (p2.getSelectedButton() !== ui.Button.OK) return;
  var link = p2.getResponseText().trim() || SITE + "/shop.html";
  var p3 = ui.prompt("Lot drop", "One-line note (optional — e.g. \"New production lot, CoA published.\"):", ui.ButtonSet.OK_CANCEL);
  if (p3.getSelectedButton() !== ui.Button.OK) return;
  var note = p3.getResponseText().trim() || "A new production lot has cleared testing and is live in the catalogue.";

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var last = sheet.getLastRow();
  if (last < 2) { ui.alert("No subscribers yet."); return; }
  var rows = sheet.getRange(2, 1, last - 1, HEADERS.length).getValues();
  var sent = 0;
  for (var i = 0; i < rows.length; i++) {
    var email = String(rows[i][COL.EMAIL - 1]).trim();
    var status = String(rows[i][COL.STATUS - 1]);
    if (!email || status !== STATUS_ACTIVE) continue;
    try {
      var mail = buildDropEmail(email, compound, link, note);
      GmailApp.sendEmail(email, mail.subject, mail.text, {
        htmlBody: mail.html, name: SHOP_NAME, replyTo: SUPPORT_EMAIL
      });
      sent++;
    } catch (err) { /* keep going; quota or bad address */ }
  }
  ui.alert("Lot-drop email sent to " + sent + " subscriber" + (sent === 1 ? "" : "s") + ".");
}

/* ======================= EMAIL TEMPLATES ========================= */

function escH(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** HMAC-signed unsubscribe link, verified by the site before it
 *  notifies this script. Must mirror the server's token exactly. */
function unsubLink(email) {
  var raw = Utilities.computeHmacSha256Signature(email.toLowerCase(), SECRET);
  var hex = raw.map(function (b) { return ("0" + ((b + 256) % 256).toString(16)).slice(-2); }).join("");
  return SITE + "/api/unsubscribe?email=" + encodeURIComponent(email) + "&token=" + hex;
}

function shell(inner, preheader, email) {
  var SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  var SLATE = "#455A64", CREAM = "#ECEFF1";
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light only"><title>Nuvamin</title></head>' +
    '<body style="margin:0;padding:0;background:' + CREAM + ';-webkit-text-size-adjust:100%;">' +
    '<div style="display:none;max-height:0;overflow:hidden;">' + escH(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' + CREAM + ';"><tr><td align="center" style="padding:32px 12px 48px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">' +
    '<tr><td style="background:#000000;padding:26px 40px;" align="center">' +
      '<a href="' + SITE + '" style="text-decoration:none;"><span style="font-family:' + SANS + ';font-size:20px;font-weight:700;letter-spacing:0.42em;color:#ffffff;">NUVAMIN</span></a></td></tr>' +
    '<tr><td style="background:#ffffff;">' + inner + '</td></tr>' +
    '<tr><td style="padding:26px 40px 0;" align="center">' +
      '<p style="margin:0 0 14px;font-family:' + SANS + ';font-size:11px;line-height:1.7;color:#9AA7AE;">All Nuvamin products are supplied strictly for laboratory research use only.<br>Not for human or veterinary use.</p>' +
      '<p style="margin:0;font-family:' + SANS + ';font-size:11px;color:#9AA7AE;">' +
        '<a href="' + unsubLink(email) + '" style="color:' + SLATE + ';text-decoration:underline;">Unsubscribe</a>' +
        '&nbsp;&nbsp;&middot;&nbsp;&nbsp;<a href="mailto:' + SUPPORT_EMAIL + '" style="color:' + SLATE + ';text-decoration:underline;">' + SUPPORT_EMAIL + '</a>' +
        '&nbsp;&nbsp;&middot;&nbsp;&nbsp;&copy; 2026 Nuvamin</p>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
}

function hero(kicker, line1, line2, serifNote) {
  var SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  var SERIF = "Georgia,'Times New Roman',serif";
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:52px 40px 0;">' +
    '<p style="margin:0 0 18px;font-family:' + SANS + ';font-size:11px;font-weight:700;letter-spacing:0.3em;color:#78909C;text-transform:uppercase;">' + kicker + '</p>' +
    '<h1 style="margin:0;font-family:' + SANS + ';font-size:40px;line-height:1.04;font-weight:700;letter-spacing:-0.01em;color:#111111;text-transform:uppercase;">' + line1 + '<br>' + line2 + '</h1>' +
    '<p style="margin:16px 0 0;font-family:' + SERIF + ';font-style:italic;font-size:18px;color:#455A64;">' + serifNote + '</p>' +
    '</td></tr></table>';
}

function cta(label, url) {
  var SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:34px 40px 0;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#000000;">' +
    '<a href="' + url + '" style="display:inline-block;padding:17px 44px;font-family:' + SANS + ';font-size:12px;font-weight:700;letter-spacing:0.26em;color:#ffffff;text-decoration:none;text-transform:uppercase;">' + label + '</a>' +
    '</td></tr></table></td></tr></table>';
}

function buildWelcomeEmail(email) {
  var SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  var inner =
    hero("The Lot Report", "You&rsquo;re on", "the list.", "New lots, new data. Nothing else.") +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:30px 40px 0;">' +
      '<p style="margin:0;font-family:' + SANS + ';font-size:14px;line-height:1.8;color:#455A64;">One email when a new production lot clears testing &mdash; the compound, the numbers, the certificate. To start, here&rsquo;s ' + DISCOUNT_PERCENT + '% off your first order:</p>' +
    '</td></tr></table>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:26px 40px 0;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="border:2px solid #000000;padding:24px;">' +
        '<p style="margin:0 0 6px;font-family:' + SANS + ';font-size:10px;font-weight:700;letter-spacing:0.26em;color:#78909C;text-transform:uppercase;">' + DISCOUNT_PERCENT + '% off your first order</p>' +
        '<p style="margin:0;font-family:' + SANS + ';font-size:26px;font-weight:700;letter-spacing:0.18em;color:#111111;">' + DISCOUNT_CODE + '</p>' +
        '<p style="margin:8px 0 0;font-family:' + SANS + ';font-size:11px;color:#9AA7AE;">Enter it in the discount field at checkout.</p>' +
      '</td></tr></table>' +
    '</td></tr></table>' +
    cta("Browse the catalogue", SITE + "/shop.html") +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:22px 40px 46px;">' +
      '<p style="margin:0;font-family:' + SANS + ';font-size:12px;line-height:1.8;color:#78909C;">No countdown timers, no &ldquo;last chance&rdquo; theatre.<br>Unsubscribe any time &mdash; we never share your address.</p>' +
    '</td></tr></table>';
  return {
    subject: "You're on the list — " + DISCOUNT_PERCENT + "% off your first " + SHOP_NAME + " order",
    html: shell(inner, "Welcome to the Lot Report — " + DISCOUNT_CODE + " takes " + DISCOUNT_PERCENT + "% off your first order.", email),
    text: "You're on the Lot Report list.\n\n" +
      "One email when a new production lot clears testing - the compound, the numbers, the certificate.\n\n" +
      "Your welcome code: " + DISCOUNT_CODE + " - " + DISCOUNT_PERCENT + "% off your first order.\n" +
      "Enter it in the discount field at checkout: " + SITE + "/shop.html\n\n" +
      "Unsubscribe any time: " + unsubLink(email) + "\n\n- " + SHOP_NAME
  };
}

function buildDropEmail(email, compound, link, note) {
  var SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
  var inner =
    hero("The Lot Report", "New lot:", escH(compound) + ".", escH(note)) +
    cta("View the compound", link) +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:22px 40px 46px;">' +
      '<p style="margin:0;font-family:' + SANS + ';font-size:12px;line-height:1.8;color:#78909C;">Certificate and analytical data are on the product page.<br>You&rsquo;re receiving this because you subscribed to the Lot Report.</p>' +
    '</td></tr></table>';
  return {
    subject: "New lot: " + compound + " — " + SHOP_NAME,
    html: shell(inner, "New lot cleared testing: " + compound + ".", email),
    text: "New lot: " + compound + "\n\n" + note + "\n\n" + link + "\n\n" +
      "Unsubscribe any time: " + unsubLink(email) + "\n\n- " + SHOP_NAME
  };
}
