/* Nuvamin — shared behaviour: header, cart store, reveals, motion system. */

(function () {
  "use strict";

  /* ---------- header + footer partials ---------- */

  var page = document.body.getAttribute("data-page") || "";

  function navLink(href, label, key) {
    var active = page === key ? ' class="active"' : "";
    return '<a href="' + href + '"' + active + ">" + label + "</a>";
  }

  var headerHTML =
    '<div class="wrap header-inner">' +
    '<nav class="nav nav-left">' +
    navLink("shop.html", "Shop", "shop") +
    navLink("about.html", "About", "about") +
    navLink("faq.html", "FAQ", "faq") +
    "</nav>" +
    '<a class="brand" href="index.html">Nuvamin</a>' +
    '<nav class="nav nav-right">' +
    navLink("contact.html", "Contact", "contact") +
    '<a class="cart-link" href="cart.html">Cart <span class="cart-count" data-cart-count>0</span></a>' +
    "</nav>" +
    "</div>";

  var footerHTML =
    '<div class="wrap footer-grid">' +
    '<div class="footer-brand"><span class="brand" style="text-align:left;text-indent:0">Nuvamin</span>' +
    "<p>Precision materials for biological research. Reference compounds, analytical standards and molecular reagents &mdash; every lot characterised, documented and traceable.</p></div>" +
    '<div><h4 class="footer-h">Company</h4><ul>' +
    '<li><a href="about.html">About</a></li>' +
    '<li><a href="contact.html">Contact</a></li>' +
    "</ul></div>" +
    '<div><h4 class="footer-h">Support</h4><ul>' +
    '<li><a href="faq.html">FAQ</a></li>' +
    '<li><a href="faq.html#certificates">Certificates of analysis</a></li>' +
    '<li><a href="shipping-returns.html">Shipping &amp; handling</a></li>' +
    '<li><a href="mailto:labs@nuvamin.bio">labs@nuvamin.bio</a></li>' +
    "</ul></div>" +
    "</div>" +
    '<div class="footer-word" aria-hidden="true">Nuvamin</div>' +
    '<p class="wrap footer-disclaimer">Nuvamin is a concept store and design study. Product listings, lot numbers and analytical data are illustrative, and orders placed on this site are simulated &mdash; nothing is charged or shipped. Within the concept, all materials are for research use only and not for use in diagnostic or therapeutic procedures.</p>' +
    '<div class="footer-base"><span>&copy; 2026 Nuvamin</span><span>For research use only &middot; Concept store</span>' +
    '<span><a href="privacy.html">Privacy</a> &middot; <a href="terms.html">Terms</a> &middot; <a href="shipping-returns.html">Shipping &amp; returns</a></span></div>';

  var headerEl = document.querySelector(".site-header");
  if (headerEl && !headerEl.innerHTML.trim()) headerEl.innerHTML = headerHTML;
  var footerEl = document.querySelector(".site-footer");
  if (footerEl && !footerEl.innerHTML.trim()) footerEl.innerHTML = footerHTML;

  /* ---------- policy month ---------- */

  var policyDates = document.querySelectorAll("[data-policy-updated]");
  if (policyDates.length) {
    var policyNow = new Date();
    var policyLabel = new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric"
    }).format(policyNow);
    var policyMachineDate = policyNow.getFullYear() + "-" +
      ("0" + (policyNow.getMonth() + 1)).slice(-2);
    policyDates.forEach(function (dateEl) {
      dateEl.textContent = policyLabel;
      dateEl.setAttribute("datetime", policyMachineDate);
    });
  }

  /* ---------- header scroll state + progress hairline ---------- */

  var progressEl = document.createElement("div");
  progressEl.className = "progress";
  document.body.appendChild(progressEl);

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      if (headerEl) headerEl.classList.toggle("scrolled", window.scrollY > 24);
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      progressEl.style.transform = "scaleX(" + (max > 0 ? Math.min(1, window.scrollY / max) : 0) + ")";
      ticking = false;
    });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- ambient product drift (hero backdrops) ---------- */

  var ambientHost = document.querySelector(".hero") || document.querySelector(".page-hero");
  if (ambientHost) {
    var amb = document.createElement("div");
    amb.className = "ambient";
    amb.setAttribute("aria-hidden", "true");
    amb.innerHTML =
      '<img class="amb-1" src="assets/img/atp.webp" alt="">' +
      '<img class="amb-2" src="assets/img/nvm-204.webp" alt="">' +
      '<img class="amb-3" src="assets/img/caffeine.webp" alt="">';
    ambientHost.prepend(amb);
  }

  /* ---------- hero launch sequence ---------- */

  requestAnimationFrame(function () {
    requestAnimationFrame(function () { document.body.classList.add("hero-go"); });
  });

  /* ---------- hero motion engine: studio light + depth parallax ----------
     The vial behaves like a physical object under a movable studio light:
     a specular highlight (masked to the vial's own alpha) follows the
     cursor while the rig tilts a few degrees toward it. The wordmark and
     ambient layer move on separate depth planes; scroll acts as a dolly.
     Everything is transform/background-position only, lerped in one rAF loop. */

  function initHeroMotion() {
    var hero = document.querySelector(".hero");
    if (!hero) return;

    var rig = document.getElementById("vial-rig");
    var light = document.getElementById("vial-light");
    var sweep = hero.querySelector(".vial-sweep");
    var word = hero.querySelector(".hero-word");
    var amb = hero.querySelector(".ambient");

    // Mask the light layers to the hero vial's silhouette. The mask is only
    // enabled AFTER the vial image has fully decoded — applying it earlier
    // lets the gradient layers paint unmasked for a frame (or longer on a
    // slow load), which reads as a grey box around the vial.
    var maskOK = "maskImage" in document.body.style || "webkitMaskImage" in document.body.style;
    if (maskOK && rig) {
      var img = rig.querySelector("img");
      if (img) {
        var applyMask = function () {
          if (!img.naturalWidth) return; // image failed — leave layers hidden
          var url = 'url("' + img.getAttribute("src") + '")';
          [light, sweep].forEach(function (el) {
            if (!el) return;
            el.style.webkitMaskImage = url;
            el.style.maskImage = url;
          });
          document.body.classList.add("mask-ok");
        };
        var whenLoaded = img.complete
          ? Promise.resolve()
          : new Promise(function (res) { img.addEventListener("load", res, { once: true }); });
        whenLoaded
          .then(function () { return img.decode ? img.decode() : null; })
          .then(applyMask, function () { applyMask(); });
      }
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var tx = 0, ty = 0;      // pointer target, -1..1
    var cx = 0, cy = 0;      // smoothed pointer
    var sy = 0;              // smoothed scroll
    var inside = false;
    var running = false, rafId = null;
    var parallaxEls = [].slice.call(document.querySelectorAll("[data-parallax]"));
    var vh = window.innerHeight;
    window.addEventListener("resize", function () { vh = window.innerHeight; }, { passive: true });

    function frame() {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      sy += (window.scrollY - sy) * 0.14;
      var s = Math.min(sy, 1200);

      if (rig) {
        rig.style.transform =
          "rotateY(" + (cx * 5).toFixed(3) + "deg) rotateX(" + (cy * -4).toFixed(3) + "deg)" +
          " translate3d(0," + (s * -0.04).toFixed(2) + "px,0)";
      }
      if (light) {
        light.style.backgroundPosition =
          (50 + cx * 34).toFixed(2) + "% " + (46 + cy * 30).toFixed(2) + "%";
        // Never reveal the light layer unless its silhouette mask is active.
        light.style.opacity = inside && document.body.classList.contains("mask-ok") ? 0.6 : 0;
      }
      if (word) {
        word.style.transform =
          "translate3d(" + (cx * -9).toFixed(2) + "px," +
          (cy * -6 + s * -0.12).toFixed(2) + "px,0)";
      }
      if (amb) {
        amb.style.transform =
          "translate3d(" + (cx * 12).toFixed(2) + "px," + (cy * 9 + s * 0.05).toFixed(2) + "px,0)";
      }
      for (var i = 0; i < parallaxEls.length; i++) {
        var el = parallaxEls[i];
        var r = el.getBoundingClientRect();
        var mid = r.top + r.height / 2 - vh / 2;
        var amt = parseFloat(el.getAttribute("data-parallax")) || 0.06;
        el.style.transform = "translate3d(0," + (mid * -amt).toFixed(2) + "px,0)";
      }
      rafId = requestAnimationFrame(frame);
    }
    function start() { if (!running) { running = true; rafId = requestAnimationFrame(frame); } }
    function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); }

    if (fine) {
      hero.addEventListener("pointermove", function (e) {
        var r = hero.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
        inside = true;
      }, { passive: true });
      hero.addEventListener("pointerleave", function () {
        tx = 0; ty = 0; inside = false;
      }, { passive: true });
    }

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0 }).observe(hero);
    } else {
      start();
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroMotion);
  } else {
    initHeroMotion();
  }

  /* ---------- interior page parallax (no hero) ---------- */

  if (!document.querySelector(".hero") &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var pxEls = [].slice.call(document.querySelectorAll("[data-parallax]"));
    var pAmb = document.querySelector(".page-hero .ambient");
    if (pxEls.length || pAmb) {
      var pvh = window.innerHeight;
      window.addEventListener("resize", function () { pvh = window.innerHeight; }, { passive: true });
      var ploop = function () {
        var s = window.scrollY;
        if (pAmb) pAmb.style.transform = "translate3d(0," + (s * 0.08).toFixed(2) + "px,0)";
        for (var i = 0; i < pxEls.length; i++) {
          var el = pxEls[i], r = el.getBoundingClientRect();
          var mid = r.top + r.height / 2 - pvh / 2;
          var amt = parseFloat(el.getAttribute("data-parallax")) || 0.06;
          el.style.transform = "translate3d(0," + (mid * -amt).toFixed(2) + "px,0)";
        }
        requestAnimationFrame(ploop);
      };
      requestAnimationFrame(ploop);
    }
  }

  /* ---------- page fade transitions ---------- */

  document.addEventListener("click", function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    var a = e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || a.target === "_blank" ||
        /^(https?:|mailto:|tel:)/.test(href)) return;
    // Same-page fragment link (a #anchor on the page you're already on):
    // no real navigation happens, so fading out would leave the page
    // invisible. Let the browser handle it natively.
    var dest = new URL(href, location.href);
    if (dest.pathname === location.pathname && dest.hash) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    e.preventDefault();
    document.body.classList.add("page-out");
    setTimeout(function () { location.href = href; }, 220);
  });
  window.addEventListener("pageshow", function () {
    document.body.classList.remove("page-out");
  });

  /* ---------- cart store ---------- */

  var CART_KEY = "nuvamin-cart";

  function cartRead() {
    var cart;
    try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
    catch (e) { return {}; }
    // Prune ids that are no longer in the catalogue so the header badge,
    // the cart page and the checkout payload always agree (carts persist
    // in localStorage across catalogue changes).
    if (typeof nvFindProduct === "function") {
      for (var id in cart) if (!nvFindProduct(id)) delete cart[id];
    }
    return cart;
  }
  function cartWrite(cart) {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    cartBadge();
  }
  function cartCount() {
    var cart = cartRead(), n = 0;
    for (var k in cart) n += cart[k];
    return n;
  }
  function cartBadge() {
    var n = cartCount();
    document.querySelectorAll("[data-cart-count]").forEach(function (el) {
      el.textContent = n;
      el.classList.add("bump");
      setTimeout(function () { el.classList.remove("bump"); }, 300);
    });
  }
  function cartAdd(id, qty) {
    var cart = cartRead();
    cart[id] = (cart[id] || 0) + (qty || 1);
    cartWrite(cart);
    var p = typeof nvFindProduct === "function" ? nvFindProduct(id) : null;
    toast((p ? p.name + " " + p.mg : "Item") + " added to cart");
  }
  function cartSet(id, qty) {
    var cart = cartRead();
    if (qty <= 0) delete cart[id]; else cart[id] = qty;
    cartWrite(cart);
  }

  window.nvCart = { read: cartRead, add: cartAdd, set: cartSet, count: cartCount };

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-add]");
    if (btn) { e.preventDefault(); cartAdd(btn.getAttribute("data-add"), 1); }
  });

  /* ---------- toast ---------- */

  var toastEl = document.createElement("div");
  toastEl.className = "toast";
  toastEl.setAttribute("role", "status");
  toastEl.setAttribute("aria-live", "polite");
  document.body.appendChild(toastEl);
  var toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }
  window.nvToast = toast;

  /* ---------- reveal on scroll ---------- */

  function watchReveals() {
    var els = document.querySelectorAll(".reveal:not([data-watched])");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("in-view"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (el) { el.setAttribute("data-watched", "1"); io.observe(el); });
  }
  window.nvWatchReveals = watchReveals;
  watchReveals();


  /* ---------- accordions ---------- */

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".acc-btn");
    if (!btn) return;
    var item = btn.closest(".acc-item");
    var panel = item.querySelector(".acc-panel");
    var open = item.classList.toggle("open");
    panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });

  /* ---------- newsletter + contact (concept store: handled in the browser) ---------- */

  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (form.matches("[data-newsletter]")) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      if (!input || !EMAIL_RE.test(input.value.trim())) {
        toast("Enter a valid email address");
        if (input) input.focus();
        return;
      }
      form.innerHTML = '<p class="news-ok" role="status">You&rsquo;re on the list &mdash; lot reports arrive as new materials are released.</p>';
    }
    if (form.matches("[data-contact]")) {
      e.preventDefault();
      var name = form.name && form.name.value.trim();
      var email = form.email && form.email.value.trim();
      var message = form.message && form.message.value.trim();
      if (!name) { toast("Enter your name"); form.name.focus(); return; }
      if (!EMAIL_RE.test(email || "")) { toast("Enter a valid email address"); form.email.focus(); return; }
      if (!message) { toast("Add a message"); form.message.focus(); return; }
      form.innerHTML = '<p class="form-ok" role="status">Received &mdash; a member of the lab team replies within one working day.</p>';
    }
  });

  cartBadge();
})();
