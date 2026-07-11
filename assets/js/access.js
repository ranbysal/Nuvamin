/* Nuvamin mandatory researcher-verification gate. */

(function () {
  "use strict";

  var SITE_KEY = "nuvamin-research-verification";
  var VERSION = "2026-07-10";
  var RECORD_DAYS = 365;
  var activeGate = null;

  function validIso(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
  }

  function validRecord(record) {
    if (!record || typeof record !== "object") return false;
    if (
      record.version !== VERSION ||
      record.age21 !== true ||
      record.qualifiedResearcher !== true ||
      record.researchUseOnly !== true ||
      !validIso(record.acceptedAt) ||
      !validIso(record.expiresAt)
    ) return false;

    var accepted = Date.parse(record.acceptedAt);
    var expires = Date.parse(record.expiresAt);
    var now = Date.now();
    var max = RECORD_DAYS * 24 * 60 * 60 * 1000;
    return accepted <= now + 60_000 && expires > now && expires - accepted <= max + 60_000;
  }

  function readRecord() {
    try {
      var record = JSON.parse(localStorage.getItem(SITE_KEY));
      if (validRecord(record)) return record;
      localStorage.removeItem(SITE_KEY);
    } catch (_err) {
      try { localStorage.removeItem(SITE_KEY); } catch (_ignored) {}
    }
    return null;
  }

  function saveRecord() {
    var accepted = new Date();
    var record = {
      version: VERSION,
      age21: true,
      qualifiedResearcher: true,
      researchUseOnly: true,
      acceptedAt: accepted.toISOString(),
      expiresAt: new Date(accepted.getTime() + RECORD_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    };
    try { localStorage.setItem(SITE_KEY, JSON.stringify(record)); } catch (_err) {}
    return record;
  }

  function markVerified() {
    document.documentElement.classList.remove("nv-access-pending", "nv-research-unverified");
    document.documentElement.classList.add("nv-research-verified");
  }

  function markUnverified() {
    document.documentElement.classList.remove("nv-access-pending", "nv-research-verified");
    document.documentElement.classList.add("nv-research-unverified");
  }

  function focusableElements(root) {
    return [].slice.call(root.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )).filter(function (el) {
      return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
    });
  }

  function openResearchGate() {
    if (activeGate) return activeGate;

    var resolveGate;
    var promise = new Promise(function (resolve) { resolveGate = resolve; });
    activeGate = promise;
    var previousFocus = document.activeElement;

    var gate = document.createElement("div");
    gate.className = "research-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "research-gate-title");
    gate.setAttribute("aria-describedby", "research-gate-copy");
    gate.innerHTML =
      '<div class="research-gate-card">' +
        '<div class="research-gate-mark" aria-hidden="true">N</div>' +
        '<p class="kicker no-rule">Restricted catalogue</p>' +
        '<h2 id="research-gate-title">Researcher verification</h2>' +
        '<p id="research-gate-copy" class="research-gate-intro">This website supplies research compounds exclusively to qualified researchers and laboratories for in vitro and laboratory research. These products are not offered for human or veterinary use. Confirm both statements before continuing.</p>' +
        '<form class="research-gate-form" novalidate>' +
          '<label class="research-check">' +
            '<input type="checkbox" name="age21" required>' +
            '<span><b>I am at least 21 years of age.</b></span>' +
          '</label>' +
          '<label class="research-check">' +
            '<input type="checkbox" name="researchUse" required>' +
            '<span><b>I am a qualified researcher or laboratory representative</b> purchasing solely for in vitro or laboratory research, and not for human or veterinary use.</span>' +
          '</label>' +
          '<p class="research-gate-status" role="status">Complete both confirmations to continue.</p>' +
          '<button class="btn research-gate-enter" type="submit" disabled>Enter Research Catalogue <span class="arr">&rarr;</span></button>' +
          '<button class="research-gate-exit" type="button">Not a researcher? Leave site</button>' +
        '</form>' +
      '</div>';

    document.body.appendChild(gate);

    var background = [].slice.call(document.body.children).filter(function (node) {
      return node !== gate && node.tagName !== "SCRIPT";
    }).map(function (node) {
      var state = {
        node: node,
        inert: Boolean(node.inert),
        ariaHidden: node.getAttribute("aria-hidden"),
      };
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
      return state;
    });

    var htmlOverflow = document.documentElement.style.overflow;
    var bodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.classList.add("nv-gate-open");

    var form = gate.querySelector("form");
    var checks = [].slice.call(gate.querySelectorAll('input[type="checkbox"]'));
    var enter = gate.querySelector(".research-gate-enter");
    var status = gate.querySelector(".research-gate-status");
    var exit = gate.querySelector(".research-gate-exit");

    function update() {
      var complete = checks.every(function (box) { return box.checked; });
      enter.disabled = !complete;
      status.textContent = complete
        ? "Both confirmations completed."
        : "Complete both confirmations to continue.";
    }

    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== "Tab") return;
      var items = focusableElements(gate);
      if (!items.length) {
        event.preventDefault();
        return;
      }
      var first = items[0];
      var last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function cleanup() {
      document.removeEventListener("keydown", onKeydown, true);
      background.forEach(function (state) {
        state.node.inert = state.inert;
        if (state.ariaHidden == null) state.node.removeAttribute("aria-hidden");
        else state.node.setAttribute("aria-hidden", state.ariaHidden);
      });
      document.documentElement.style.overflow = htmlOverflow;
      document.body.style.overflow = bodyOverflow;
      document.documentElement.classList.remove("nv-gate-open");
      gate.remove();
      activeGate = null;
      if (previousFocus && previousFocus.isConnected && typeof previousFocus.focus === "function") {
        setTimeout(function () { previousFocus.focus(); }, 0);
      }
    }

    checks.forEach(function (box) { box.addEventListener("change", update); });
    gate.addEventListener("mousedown", function (event) {
      if (event.target === gate) event.preventDefault();
    });
    document.addEventListener("keydown", onKeydown, true);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (checks.some(function (box) { return !box.checked; })) {
        update();
        checks.find(function (box) { return !box.checked; }).focus();
        return;
      }
      var record = saveRecord();
      markVerified();
      cleanup();
      resolveGate(record);
    });

    exit.addEventListener("click", function () {
      window.location.replace("https://www.google.com/");
    });

    setTimeout(function () { checks[0].focus(); }, 0);
    return promise;
  }

  function scheduleVisibleGate(target) {
    var timer = null;
    var observer = null;
    var opened = false;

    function cancelTimer() {
      if (timer) clearTimeout(timer);
      timer = null;
    }

    function beginTimer() {
      if (timer || opened) return;
      timer = setTimeout(function () {
        timer = null;
        opened = true;
        if (observer) observer.disconnect();
        openResearchGate();
      }, 2500);
    }

    if (!("IntersectionObserver" in window)) {
      beginTimer();
      return;
    }

    observer = new IntersectionObserver(function (entries) {
      var entry = entries[0];
      if (entry.isIntersecting && entry.intersectionRatio >= 0.2) beginTimer();
      else cancelTimer();
    }, { threshold: [0, 0.2, 0.5] });
    observer.observe(target);
  }

  function init() {
    var homeGrid = document.getElementById("featured-grid");
    var shopGrid = document.getElementById("shop-grid");
    var product = document.getElementById("pdp");
    if (!homeGrid && !shopGrid && !product) return;

    if (readRecord()) {
      markVerified();
      return;
    }

    markUnverified();
    if (product) setTimeout(openResearchGate, 80);
    else scheduleVisibleGate(homeGrid || shopGrid);
  }

  window.addEventListener("pageshow", function (event) {
    if (event.persisted && readRecord()) markVerified();
  });

  window.addEventListener("storage", function (event) {
    if (event.key === SITE_KEY && readRecord()) markVerified();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
