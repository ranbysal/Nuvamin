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
    navLink("journal.html", "Journal", "journal") +
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
    "<p>Research-grade peptides, independently verified lot by lot. Identity by mass spectrometry, purity by HPLC, certificates published for every batch.</p></div>" +
    '<div><h4 class="footer-h">Catalogue</h4><ul>' +
    '<li><a href="shop.html">All compounds</a></li>' +
    '<li><a href="shop.html#metabolic">Metabolic</a></li>' +
    '<li><a href="shop.html#repair">Repair</a></li>' +
    '<li><a href="shop.html#longevity">Longevity</a></li>' +
    "</ul></div>" +
    '<div><h4 class="footer-h">Company</h4><ul>' +
    '<li><a href="about.html">About</a></li>' +
    '<li><a href="journal.html">Journal</a></li>' +
    '<li><a href="contact.html">Contact</a></li>' +
    "</ul></div>" +
    '<div><h4 class="footer-h">Support</h4><ul>' +
    '<li><a href="contact.html#faq">Certificates of analysis</a></li>' +
    '<li><a href="contact.html">Shipping &amp; cold chain</a></li>' +
    '<li><a href="mailto:lab@nuvamin.com">lab@nuvamin.com</a></li>' +
    "</ul></div>" +
    "</div>" +
    '<div class="footer-word" aria-hidden="true">Nuvamin</div>' +
    '<p class="wrap footer-disclaimer">All Nuvamin products are supplied strictly for laboratory research use only. They are not for human or veterinary use, not dietary supplements, and not intended to diagnose, treat, cure, or prevent any disease or condition. By purchasing, you confirm you are a qualified researcher or institution and accept our terms of sale.</p>' +
    '<div class="footer-base"><span>&copy; 2026 Nuvamin</span><span>Research use only &middot; Verified by independent laboratories</span><span>Privacy &middot; Terms</span></div>';

  var headerEl = document.querySelector(".site-header");
  if (headerEl && !headerEl.innerHTML.trim()) headerEl.innerHTML = headerHTML;
  var footerEl = document.querySelector(".site-footer");
  if (footerEl && !footerEl.innerHTML.trim()) footerEl.innerHTML = footerHTML;

  /* ---------- header scroll state ---------- */

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      if (headerEl) headerEl.classList.toggle("scrolled", window.scrollY > 24);
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
      '<img class="amb-1" src="assets/img/tirzepatide.webp" alt="">' +
      '<img class="amb-2" src="assets/img/nad.webp" alt="">' +
      '<img class="amb-3" src="assets/img/bpc-157.webp" alt="">';
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

  /* ---------- hero motion engine ----------
     The vial is a physical object under a movable studio light: a specular
     highlight (masked to its own alpha) tracks the cursor while the rig
     tilts toward it. The SIGNATURE scroll move: as you leave the hero, the
     giant wordmark condenses — scaling down and settling under the header —
     as the vial recedes with depth, so the page opening reads as one
     continuous camera move rather than a hard cut. Lab tiles parallax on
     separate planes. One rAF loop, lerped, transform-only. */

  var prefersReduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function initHeroMotion() {
    var hero = document.querySelector(".hero");
    if (!hero) return;

    var rig = document.getElementById("vial-rig");
    var light = document.getElementById("vial-light");
    var sweep = hero.querySelector(".vial-sweep");
    var word = document.getElementById("hero-word");
    var render = document.getElementById("hero-render");
    var amb = hero.querySelector(".ambient");
    var parallaxEls = [].slice.call(document.querySelectorAll("[data-parallax]"));

    // mask the light layers to the hero vial's silhouette
    var maskOK = "maskImage" in document.body.style || "webkitMaskImage" in document.body.style;
    if (maskOK && rig) {
      var img = rig.querySelector("img");
      var url = img ? 'url("' + img.getAttribute("src") + '")' : "";
      [light, sweep].forEach(function (el) {
        if (!el) return;
        el.style.webkitMaskImage = url;
        el.style.maskImage = url;
      });
      document.body.classList.add("mask-ok");
    }

    if (prefersReduce) return;

    var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var tx = 0, ty = 0, cx = 0, cy = 0, sy = 0;
    var inside = false, running = false, rafId = null;
    var vh = window.innerHeight;
    window.addEventListener("resize", function () { vh = window.innerHeight; }, { passive: true });

    function frame() {
      cx += (tx - cx) * 0.07;
      cy += (ty - cy) * 0.07;
      sy += (window.scrollY - sy) * 0.12;

      // p: 0 at top of hero, 1 after ~0.7 viewport of scroll — drives the condense
      var p = Math.max(0, Math.min(1, sy / (vh * 0.7)));
      var ease = p * p * (3 - 2 * p); // smoothstep
      var tilt = 1 - ease;            // cursor tilt fades out as we scroll away

      if (rig) {
        // cursor tilt + scroll recede live together on the (un-animated) rig,
        // so the launch animation on #hero-render is never clobbered.
        rig.style.transform =
          "translate3d(0," + (ease * -26).toFixed(2) + "px,0) scale(" + (1 - ease * 0.07).toFixed(4) + ")" +
          " rotateY(" + (cx * 5 * tilt).toFixed(3) + "deg) rotateX(" + (cy * -4 * tilt).toFixed(3) + "deg)";
        rig.style.opacity = (1 - ease * 0.92).toFixed(3);
      }
      if (light) {
        light.style.backgroundPosition =
          (50 + cx * 34).toFixed(2) + "% " + (46 + cy * 30).toFixed(2) + "%";
        light.style.opacity = (inside ? 0.6 : 0) * tilt;
      }
      if (word) {
        // SIGNATURE: the giant wordmark condenses (sticky pins it to the top;
        // transform scales it toward the header brand) and dissolves as the
        // real header wordmark takes over — one continuous camera move.
        var scale = 1 - ease * 0.9;
        word.style.transform =
          "translate3d(" + (cx * -6 * tilt).toFixed(2) + "px,0,0) scale(" + scale.toFixed(4) + ")";
        word.style.opacity = Math.max(0, 1 - ease * 1.3).toFixed(3);
      }
      if (amb) {
        amb.style.transform =
          "translate3d(" + (cx * 12).toFixed(2) + "px," + (cy * 9 + sy * 0.06).toFixed(2) + "px,0)";
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
      hero.addEventListener("pointerleave", function () { tx = 0; ty = 0; inside = false; }, { passive: true });
    }
    // keep running while the hero OR the first scroll zone is on screen
    start();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeroMotion);
  } else {
    initHeroMotion();
  }

  /* ---------- interior page parallax (no hero) ---------- */

  if (!document.querySelector(".hero") && !prefersReduce) {
    var pxEls = [].slice.call(document.querySelectorAll("[data-parallax]"));
    var pAmb = document.querySelector(".page-hero .ambient");
    if (pxEls.length || pAmb) {
      var pvh = window.innerHeight, prun = false;
      function ploop() {
        var s = window.scrollY;
        if (pAmb) pAmb.style.transform = "translate3d(0," + (s * 0.08).toFixed(2) + "px,0)";
        for (var i = 0; i < pxEls.length; i++) {
          var el = pxEls[i], r = el.getBoundingClientRect();
          var mid = r.top + r.height / 2 - pvh / 2;
          var amt = parseFloat(el.getAttribute("data-parallax")) || 0.06;
          el.style.transform = "translate3d(0," + (mid * -amt).toFixed(2) + "px,0)";
        }
        requestAnimationFrame(ploop);
      }
      window.addEventListener("resize", function () { pvh = window.innerHeight; }, { passive: true });
      requestAnimationFrame(ploop);
    }
  }

  /* ---------- custom scrollbar (arrowless, exclusion-blend) ---------- */

  (function () {
    if (!("matchMedia" in window)) return;
    if (window.matchMedia("(hover: none)").matches) return; // leave native bar on touch

    var rail = document.createElement("div");
    rail.className = "scrollrail";
    rail.setAttribute("aria-hidden", "true");
    var thumb = document.createElement("div");
    thumb.className = "scrollthumb";
    rail.appendChild(thumb);
    document.body.appendChild(rail);
    document.body.classList.add("customscroll");

    var track = 0, thumbH = 44, hideTimer = null;

    function measure() {
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - window.innerHeight;
      if (scrollable <= 2) { rail.style.display = "none"; return; }
      rail.style.display = "";
      var vh = window.innerHeight;
      thumbH = Math.max(44, (vh / doc.scrollHeight) * vh);
      thumb.style.height = thumbH + "px";
      track = vh - thumbH;
    }
    function overDark(viewportY) {
      // hit-test the page directly behind the thumb — always reflects the
      // real, current layout (product images grow the page asynchronously).
      rail.style.pointerEvents = "none";
      var el = document.elementFromPoint(window.innerWidth - 9, viewportY);
      rail.style.pointerEvents = "";
      while (el && el !== document.body) {
        if (el.classList && (el.classList.contains("dark-band") ||
            el.classList.contains("news") || el.classList.contains("site-footer"))) return true;
        el = el.parentElement;
      }
      return false;
    }
    function place() {
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - window.innerHeight;
      var p = scrollable > 0 ? window.scrollY / scrollable : 0;
      var pos = p * track;
      thumb.style.transform = "translateY(" + pos.toFixed(2) + "px)";
      if (!dragging) rail.classList.toggle("on-dark", overDark(pos + thumbH / 2));
    }
    function flash() {
      rail.classList.add("show");
      clearTimeout(hideTimer);
      hideTimer = setTimeout(function () {
        if (!dragging) rail.classList.remove("show");
      }, 1400);
    }

    var raf = null;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(function () { place(); raf = null; });
      flash();
    }

    var dragging = false, startY = 0, startScroll = 0;
    thumb.addEventListener("pointerdown", function (e) {
      dragging = true;
      thumb.classList.add("drag");
      startY = e.clientY;
      startScroll = window.scrollY;
      thumb.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    thumb.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var doc = document.documentElement;
      var scrollable = doc.scrollHeight - window.innerHeight;
      var dy = e.clientY - startY;
      window.scrollTo(0, startScroll + (dy / track) * scrollable);
    });
    thumb.addEventListener("pointerup", function (e) {
      dragging = false;
      thumb.classList.remove("drag");
      try { thumb.releasePointerCapture(e.pointerId); } catch (err) {}
      flash();
    });
    // click on the rail jumps toward that position
    rail.addEventListener("pointerdown", function (e) {
      if (e.target === thumb) return;
      var scrollable = document.documentElement.scrollHeight - window.innerHeight;
      var rel = (e.clientY - thumbH / 2) / track;
      window.scrollTo({ top: Math.max(0, Math.min(1, rel)) * scrollable, behavior: "smooth" });
    });

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () { measure(); place(); }, { passive: true });
    // recentre after fonts/images shift layout
    window.addEventListener("load", function () { measure(); place(); });
    measure(); place();
    setTimeout(function () { measure(); place(); }, 400);
    flash();
  })();

  /* ---------- page fade transitions ---------- */

  document.addEventListener("click", function (e) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    var a = e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || href.charAt(0) === "#" || a.target === "_blank" ||
        /^(https?:|mailto:|tel:)/.test(href)) return;
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
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
    catch (e) { return {}; }
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

  /* ---------- newsletter + contact fake submit ---------- */

  document.addEventListener("submit", function (e) {
    var form = e.target;
    if (form.matches("[data-newsletter]")) {
      e.preventDefault();
      form.innerHTML = '<p class="news-ok">Confirmed. The next lot report lands in your inbox.</p>';
    }
    if (form.matches("[data-contact]")) {
      e.preventDefault();
      form.innerHTML = '<p class="form-ok">Received &mdash; a member of the lab team replies within one working day.</p>';
    }
  });

  cartBadge();
})();
