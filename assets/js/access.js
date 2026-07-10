/* Nuvamin researcher access + Google-authenticated cart gate. */

(function () {
  "use strict";

  var SITE_KEY = "nuvamin-research-verification";
  var CART_KEY = "nuvamin-cart-research-verification";
  var DEFAULT_VERSION = "2026-07-10";
  var SITE_RECORD_DAYS = 365;
  var configPromise = null;
  var activeGate = null;
  var currentUser = null;
  var currentVersion = DEFAULT_VERSION;
  var cartRefreshId = 0;

  function api(path) {
    return (window.NUVAMIN_API_BASE || "") + path;
  }

  function fetchJson(path, options) {
    options = options || {};
    options.credentials = "same-origin";
    return fetch(api(path), options).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  function getPublicConfig() {
    if (configPromise) return configPromise;
    configPromise = fetchJson("/api/auth/config").then(function (result) {
      if (!result.ok) throw new Error("config");
      currentVersion = result.body.researchVersion || DEFAULT_VERSION;
      return result.body;
    }).catch(function () {
      currentVersion = DEFAULT_VERSION;
      return { configured: false, clientId: "", researchVersion: DEFAULT_VERSION };
    });
    return configPromise;
  }

  function validIso(value) {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
  }

  function validSiteRecord(record, version) {
    if (!record || typeof record !== "object") return false;
    if (
      record.version !== version ||
      record.age21 !== true ||
      record.qualifiedResearcher !== true ||
      record.researchUseOnly !== true ||
      !validIso(record.acceptedAt) ||
      !validIso(record.expiresAt)
    ) return false;
    var accepted = Date.parse(record.acceptedAt);
    var expires = Date.parse(record.expiresAt);
    var now = Date.now();
    var max = SITE_RECORD_DAYS * 24 * 60 * 60 * 1000;
    return accepted <= now + 60_000 && expires > now && expires - accepted <= max + 60_000;
  }

  function readSiteRecord(version) {
    try {
      var record = JSON.parse(localStorage.getItem(SITE_KEY));
      if (validSiteRecord(record, version)) return record;
      localStorage.removeItem(SITE_KEY);
    } catch (_err) {
      try { localStorage.removeItem(SITE_KEY); } catch (_ignored) {}
    }
    return null;
  }

  function saveSiteRecord(version) {
    var accepted = new Date();
    var record = {
      version: version,
      age21: true,
      qualifiedResearcher: true,
      researchUseOnly: true,
      acceptedAt: accepted.toISOString(),
      expiresAt: new Date(accepted.getTime() + SITE_RECORD_DAYS * 24 * 60 * 60 * 1000).toISOString(),
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

  function openResearchGate(options) {
    options = options || {};
    if (activeGate) return activeGate;

    var version = options.version || currentVersion || DEFAULT_VERSION;
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
          '<p class="research-gate-status" id="research-gate-status" role="status">Complete both confirmations to continue.</p>' +
          '<button class="btn research-gate-enter" type="submit" disabled>' +
            (options.actionLabel || "Enter Research Catalogue") +
            ' <span class="arr">&rarr;</span>' +
          '</button>' +
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
      var record = saveSiteRecord(version);
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

  function scheduleVisibleGate(target, version) {
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
        openResearchGate({ version: version });
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

  function initSiteVerification() {
    var homeGrid = document.getElementById("featured-grid");
    var shopGrid = document.getElementById("shop-grid");
    var product = document.getElementById("pdp");
    if (!homeGrid && !shopGrid && !product) return;

    getPublicConfig().then(function (cfg) {
      var version = cfg.researchVersion || DEFAULT_VERSION;
      if (readSiteRecord(version)) {
        markVerified();
        return;
      }
      markUnverified();
      if (product) {
        setTimeout(function () { openResearchGate({ version: version }); }, 80);
      } else {
        scheduleVisibleGate(homeGrid || shopGrid, version);
      }
    });
  }

  function readCartVerification(user, version) {
    try {
      var stored = JSON.parse(sessionStorage.getItem(CART_KEY));
      var record = stored && stored.record;
      if (
        !stored ||
        typeof stored.token !== "string" ||
        stored.token.length < 40 ||
        !record ||
        record.accountId !== user.id ||
        record.version !== version ||
        record.age21 !== true ||
        record.qualifiedResearcher !== true ||
        record.researchUseOnly !== true ||
        !validIso(record.acceptedAt) ||
        !validIso(record.expiresAt) ||
        Date.parse(record.expiresAt) <= Date.now()
      ) {
        sessionStorage.removeItem(CART_KEY);
        return null;
      }
      return stored;
    } catch (_err) {
      try { sessionStorage.removeItem(CART_KEY); } catch (_ignored) {}
      return null;
    }
  }

  function loadGoogleIdentity() {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      return Promise.resolve(window.google);
    }
    return new Promise(function (resolve, reject) {
      var existing = document.getElementById("nv-google-identity");
      if (existing) {
        existing.addEventListener("load", function () { resolve(window.google); }, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      var script = document.createElement("script");
      script.id = "nv-google-identity";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.onload = function () { resolve(window.google); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  function cartHasItems() {
    return Boolean(window.nvCart && window.nvCart.count() > 0);
  }

  function cartElements() {
    return {
      shell: document.getElementById("cart-access-shell"),
      root: document.getElementById("cart-root"),
      panel: document.getElementById("cart-access-panel"),
      title: document.getElementById("cart-access-title"),
      copy: document.getElementById("cart-access-copy"),
      status: document.getElementById("cart-access-status"),
      google: document.getElementById("google-signin-button"),
      acknowledge: document.getElementById("cart-acknowledge"),
      signout: document.getElementById("cart-signout"),
    };
  }

  function lockCart(els) {
    if (!els.shell || !els.root) return;
    els.shell.classList.add("is-locked");
    els.shell.classList.remove("is-unlocked");
    els.root.inert = true;
    els.root.setAttribute("aria-hidden", "true");
    els.panel.hidden = false;
  }

  function unlockCart(els) {
    if (!els.shell || !els.root) return;
    els.shell.classList.remove("is-locked");
    els.shell.classList.add("is-unlocked");
    els.root.inert = false;
    els.root.removeAttribute("aria-hidden");
    els.panel.hidden = true;
    document.dispatchEvent(new CustomEvent("nv:cart-unlocked"));
  }

  function syncIdentityFields(user) {
    if (!user) return;
    var email = document.getElementById("co-email");
    var name = document.getElementById("co-name");
    if (email) {
      email.value = user.email || "";
      email.readOnly = true;
      email.setAttribute("aria-readonly", "true");
    }
    if (name && !name.value && user.name) name.value = user.name;
  }

  function showAcknowledgement(els, user, version) {
    lockCart(els);
    syncIdentityFields(user);
    els.title.textContent = "Research use acknowledgement";
    els.copy.textContent = "Signed in as " + user.email + ". Confirm your researcher status once more to access the cart and continue to checkout.";
    els.status.textContent = "Your acknowledgement will be recorded with the order.";
    els.google.innerHTML = "";
    els.google.hidden = true;
    els.acknowledge.hidden = false;
    els.acknowledge.disabled = false;
    els.acknowledge.textContent = "Acknowledge";
    els.signout.hidden = false;

    els.acknowledge.onclick = function () {
      els.acknowledge.disabled = true;
      openResearchGate({
        version: version,
        actionLabel: "Confirm and Continue",
      }).then(function () {
        els.status.textContent = "Recording your acknowledgement…";
        return fetchJson("/api/research-verification", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            age21: true,
            qualifiedResearcher: true,
            researchUseOnly: true,
          }),
        });
      }).then(function (result) {
        if (!result.ok || !result.body.verificationToken) {
          throw new Error(result.body.error || "Verification could not be recorded.");
        }
        sessionStorage.setItem(CART_KEY, JSON.stringify({
          token: result.body.verificationToken,
          record: result.body.record,
        }));
        unlockCart(els);
        syncIdentityFields(user);
      }).catch(function (err) {
        els.status.textContent = err.message || "Verification could not be recorded.";
        els.acknowledge.disabled = false;
      });
    };
  }

  function showGoogleSignIn(els, cfg) {
    lockCart(els);
    els.title.textContent = "Sign in to continue";
    els.copy.textContent = "Your cart is reserved for verified researchers and laboratory representatives. Continue with Google so your identity can be associated with the order.";
    els.acknowledge.hidden = true;
    els.signout.hidden = true;
    els.google.hidden = false;
    els.google.innerHTML = "";
    els.status.textContent = "";

    if (!cfg.configured || !cfg.clientId) {
      els.status.textContent = "Google sign-in is being configured. Checkout remains unavailable until setup is complete.";
      return;
    }

    els.status.textContent = "Loading secure Google sign-in…";
    loadGoogleIdentity().then(function () {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        throw new Error("Google sign-in could not load.");
      }
      window.google.accounts.id.initialize({
        client_id: cfg.clientId,
        ux_mode: "popup",
        auto_select: false,
        callback: function (response) {
          els.status.textContent = "Verifying your Google account…";
          fetchJson("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential: response && response.credential }),
          }).then(function (result) {
            if (!result.ok || !result.body.user) {
              throw new Error(result.body.error || "Google sign-in failed.");
            }
            currentUser = result.body.user;
            try { sessionStorage.removeItem(CART_KEY); } catch (_err) {}
            showAcknowledgement(els, currentUser, cfg.researchVersion || currentVersion);
          }).catch(function (err) {
            els.status.textContent = err.message || "Google sign-in failed.";
          });
        },
      });
      window.google.accounts.id.renderButton(els.google, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "left",
        width: Math.min(360, Math.max(240, els.panel.clientWidth - 72)),
      });
      els.status.textContent = "Google verifies the account. Nuvamin never receives your Google password.";
    }).catch(function (err) {
      els.status.textContent = err.message || "Google sign-in could not load.";
    });
  }

  function refreshCartAccess() {
    var els = cartElements();
    if (!els.shell) return Promise.resolve();
    var refreshId = ++cartRefreshId;

    if (!cartHasItems()) {
      currentUser = null;
      els.shell.classList.remove("is-locked", "is-unlocked");
      els.root.inert = false;
      els.root.removeAttribute("aria-hidden");
      els.panel.hidden = true;
      return Promise.resolve();
    }

    lockCart(els);
    els.title.textContent = "Checking account access";
    els.copy.textContent = "Confirming your Google session and researcher-verification status.";
    els.status.textContent = "Please wait…";
    els.google.hidden = true;
    els.acknowledge.hidden = true;
    els.signout.hidden = true;

    return Promise.all([getPublicConfig(), fetchJson("/api/auth/session")]).then(function (values) {
      if (refreshId !== cartRefreshId) return;
      var cfg = values[0];
      var sessionResult = values[1];
      var session = sessionResult.body || {};
      currentVersion = session.researchVersion || cfg.researchVersion || DEFAULT_VERSION;
      if (!session.configured) {
        showGoogleSignIn(els, cfg);
        return;
      }
      if (!session.authenticated || !session.user) {
        currentUser = null;
        showGoogleSignIn(els, cfg);
        return;
      }
      currentUser = session.user;
      syncIdentityFields(currentUser);
      var verification = readCartVerification(currentUser, currentVersion);
      if (verification) unlockCart(els);
      else showAcknowledgement(els, currentUser, currentVersion);
    }).catch(function () {
      if (refreshId !== cartRefreshId) return;
      els.status.textContent = "Account verification is temporarily unavailable.";
    });
  }

  function invalidateCartAccess(status) {
    if (status === 401) currentUser = null;
    try { sessionStorage.removeItem(CART_KEY); } catch (_err) {}
    refreshCartAccess();
  }

  function getCartVerificationToken() {
    if (!currentUser) return "";
    var stored = readCartVerification(currentUser, currentVersion);
    return stored ? stored.token : "";
  }

  function initCartAccess() {
    var els = cartElements();
    if (!els.shell) return;
    els.signout.addEventListener("click", function () {
      fetchJson("/api/auth/logout", { method: "POST" }).finally(function () {
        currentUser = null;
        try { sessionStorage.removeItem(CART_KEY); } catch (_err) {}
        refreshCartAccess();
      });
    });
    document.addEventListener("nv:cart-rendered", function () {
      syncIdentityFields(currentUser);
      if (!cartHasItems()) {
        refreshCartAccess();
        return;
      }
      if (currentUser && readCartVerification(currentUser, currentVersion)) {
        unlockCart(cartElements());
        return;
      }
      refreshCartAccess();
    });
    refreshCartAccess();
  }

  window.nvAccess = {
    ensureCartAccess: refreshCartAccess,
    getCartVerificationToken: getCartVerificationToken,
    invalidateCartAccess: invalidateCartAccess,
    openResearchGate: openResearchGate,
  };

  function init() {
    initSiteVerification();
    initCartAccess();
  }

  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    getPublicConfig().then(function (cfg) {
      if (readSiteRecord(cfg.researchVersion || DEFAULT_VERSION)) markVerified();
    });
  });

  window.addEventListener("storage", function (event) {
    if (event.key !== SITE_KEY) return;
    getPublicConfig().then(function (cfg) {
      if (readSiteRecord(cfg.researchVersion || DEFAULT_VERSION)) markVerified();
    });
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
