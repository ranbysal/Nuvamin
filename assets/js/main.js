/* Nuvamin — shared behaviour: header, cart store, reveals, accordions. */

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
    "<p>Precision supplements, formulated with published evidence and verified by independent labs. Made slowly, in small batches.</p></div>" +
    '<div><h4 class="footer-h">Shop</h4><ul>' +
    '<li><a href="shop.html">All products</a></li>' +
    '<li><a href="shop.html#foundation">Foundation</a></li>' +
    '<li><a href="shop.html#cognition">Cognition</a></li>' +
    '<li><a href="shop.html#recovery">Recovery</a></li>' +
    "</ul></div>" +
    '<div><h4 class="footer-h">Company</h4><ul>' +
    '<li><a href="about.html">About</a></li>' +
    '<li><a href="journal.html">Journal</a></li>' +
    '<li><a href="contact.html">Contact</a></li>' +
    "</ul></div>" +
    '<div><h4 class="footer-h">Support</h4><ul>' +
    '<li><a href="contact.html#faq">FAQ</a></li>' +
    '<li><a href="contact.html">Shipping &amp; returns</a></li>' +
    '<li><a href="mailto:hello@nuvamin.com">hello@nuvamin.com</a></li>' +
    "</ul></div>" +
    "</div>" +
    '<div class="footer-word" aria-hidden="true">Nuvamin</div>' +
    '<p class="wrap footer-disclaimer">These statements have not been evaluated by a medicines authority. Nuvamin products are not intended to diagnose, treat, cure, or prevent any disease. A supplement supports a good routine; it does not replace one.</p>' +
    '<div class="footer-base"><span>&copy; 2026 Nuvamin</span><span>Formulated with evidence. Verified by third parties.</span><span>Privacy &middot; Terms</span></div>';

  var headerEl = document.querySelector(".site-header");
  if (headerEl && !headerEl.innerHTML.trim()) headerEl.innerHTML = headerHTML;
  var footerEl = document.querySelector(".site-footer");
  if (footerEl && !footerEl.innerHTML.trim()) footerEl.innerHTML = footerHTML;

  /* ---------- header scroll state ---------- */

  function onScroll() {
    if (!headerEl) return;
    headerEl.classList.toggle("scrolled", window.scrollY > 24);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

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
    toast((p ? p.name : "Item") + " added to cart");
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
      form.innerHTML = '<p class="news-ok">Welcome in. The first dispatch lands next week.</p>';
    }
    if (form.matches("[data-contact]")) {
      e.preventDefault();
      form.innerHTML = '<p class="form-ok">Thank you &mdash; we read everything and reply within two working days.</p>';
    }
  });

  cartBadge();
})();
