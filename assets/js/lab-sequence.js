/* Nuvamin — "Plate Series": scroll-driven pinned photo sequence (section 04).
 *
 * Progressive enhancement over the static stacked layout in index.html:
 *  - Desktop (no reduced-motion, >=720w, >=620h): the section pins for 340vh
 *    and scroll scrubs four "plates" through alternating curtain reveals with
 *    counter-parallax mattes, line-masked captions, a rolling ghost numeral,
 *    and an honest 1px progress rail.
 *  - Narrow viewports: no pin — the stacked layout gains a gentle scrubbed
 *    settle per plate and caption line-rises.
 *  - Reduced motion / GSAP missing / any failure: the untouched stacked
 *    default renders. The enhanced state is purely additive (one <html>
 *    class + GSAP-managed inline styles + the pin spacer); gsap.matchMedia
 *    reverts all of it atomically when conditions change.
 *
 * Transform ownership: transitions own yPercent/scale, drift owns y(px),
 * the digit roll owns the inner column — separate channels, no collisions.
 * No .reveal / data-parallax inside [data-seq] (those systems would fight).
 */

(function () {
  "use strict";

  if (!window.gsap || !window.ScrollTrigger || typeof window.gsap.registerPlugin !== "function") return;
  try {
    gsap.registerPlugin(ScrollTrigger);
  } catch (e) {
    return;
  }

  var section = document.querySelector(".life");
  var seq = document.querySelector("[data-seq]");
  if (!section || !seq) return;

  var chapters = gsap.utils.toArray("[data-seq-chapter]");
  if (chapters.length < 2) return;

  var QC = /[?&]qc=1/.test(location.search); // deterministic scrub for automated QC

  ScrollTrigger.config({ ignoreMobileResize: true });

  /* ------------------------------------------------ shared refresh discipline */

  function refresh() {
    ScrollTrigger.refresh();
  }
  window.addEventListener("load", refresh);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) refresh(); // bfcache restore: re-derive pin state from scrollY
  });

  // The access gate (access.js) locks scroll via inline overflow on <html>.
  // A refresh measured while locked is wrong once the gate closes — defer it.
  var gatePending = false;
  new MutationObserver(function () {
    var locked = document.documentElement.style.overflow === "hidden";
    if (locked) {
      gatePending = true;
    } else if (gatePending) {
      gatePending = false;
      requestAnimationFrame(refresh);
    }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class"] });

  /* ------------------------------------------------------------ pinned mode */

  var mm = gsap.matchMedia();

  mm.add("(prefers-reduced-motion: no-preference) and (min-width: 720px) and (min-height: 620px)", function () {
    try {
      return buildPinned();
    } catch (err) {
      document.documentElement.classList.remove("lab-enhanced");
      ScrollTrigger.getAll().forEach(function (t) { t.kill(); });
      return undefined;
    }
  });

  mm.add("(prefers-reduced-motion: no-preference) and (max-width: 719px)", function () {
    try {
      return buildNarrow();
    } catch (err) {
      return undefined; // stacked default stands
    }
  });

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return gsap.utils.toArray((root || document).querySelectorAll(sel)); }

  function buildPinned() {
    // Layout class first — the trigger must measure the enhanced layout.
    document.documentElement.classList.add("lab-enhanced");

    var masks = chapters.map(function (c) { return q("[data-seq-mask]", c); });
    var medias = chapters.map(function (c) { return q("[data-seq-media]", c); });
    var scrims = chapters.map(function (c) { return q("[data-seq-scrim]", c); });
    var blades = chapters.map(function (c) { return q("[data-seq-blade]", c); });
    var caps = chapters.map(function (c) {
      return { lines: qa("[data-seq-line]", c), rule: q("[data-seq-rule]", c) };
    });
    var ghost = q("[data-seq-ghost]") || q(".seq-ghost");
    var digitCol = q("[data-seq-digits]");
    var countCol = q("[data-seq-count]");
    var rail = q("[data-seq-rail]");
    var thumb = q("[data-seq-thumb]");
    var track = q("[data-seq-track]");
    var ticks = qa("[data-seq-tick]");

    // Entry direction per transition: T1 bottom, T2 top, T3 bottom.
    var fromBottom = [true, false, true];
    var CLOSED_BOTTOM = "inset(100% 0% 0% 0%)";
    var CLOSED_TOP = "inset(0% 0% 100% 0%)";
    var OPEN = "inset(0% 0% 0% 0%)";

    /* -------- initial states (GSAP-owned; reverted automatically) -------- */
    chapters.forEach(function (c, i) {
      if (i === 0) return;
      gsap.set(masks[i], { clipPath: fromBottom[i - 1] ? CLOSED_BOTTOM : CLOSED_TOP });
      gsap.set(medias[i], { yPercent: fromBottom[i - 1] ? 12 : -12, scale: 1.06 });
      gsap.set(caps[i].lines, { yPercent: 110, autoAlpha: 0 });
      gsap.set(caps[i].rule, { scaleX: 0 });
    });
    gsap.set(chapters, { autoAlpha: 1 });

    /* ------------------------------- master pinned, scrubbed timeline ---- */
    var SEG = 0.20; // width of each transition
    var T = [0.10, 0.42, 0.74]; // transition start positions
    var activeIndex = 0;
    var shear = null; // velocity quickTo, rebuilt per active media

    var tl = gsap.timeline({
      defaults: { ease: "none" },
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: function () { return "+=" + window.innerHeight * 3.4; },
        pin: true,
        pinSpacing: true,
        scrub: QC ? true : 0.75,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          // derive (never accumulate) the active chapter from progress
          var p = self.progress;
          var idx = p < T[0] + SEG * 0.5 ? 0 : p < T[1] + SEG * 0.5 ? 1 : p < T[2] + SEG * 0.5 ? 2 : 3;
          if (idx !== activeIndex) {
            activeIndex = idx;
            shear = gsap.quickTo(medias[idx], "skewY", { duration: 0.5, ease: "power3" });
          }
          ticks.forEach(function (t, k) { t.classList.toggle("is-here", k === idx); });
          // velocity shear — clamped so it reads as weight, never as an effect
          if (!shear) shear = gsap.quickTo(medias[idx], "skewY", { duration: 0.5, ease: "power3" });
          shear(gsap.utils.clamp(-1.1, 1.1, self.getVelocity() / -2600));
        },
        onScrubComplete: function () {
          gsap.to(medias[activeIndex], { skewY: 0, duration: 0.4, overwrite: "auto" });
        },
      },
    });

    // Hold 1 — plate one finishes arriving (hands off from the lead-in).
    tl.fromTo(medias[0], { scale: 1.06 }, { scale: 1, duration: 0.10, ease: "power1.out", immediateRender: false }, 0);

    // Three curtain transitions.
    T.forEach(function (s, i) {
      var inn = i + 1;   // incoming chapter index
      var out = i;       // outgoing chapter index
      var bottom = fromBottom[i];

      // incoming curtain opens
      tl.fromTo(masks[inn],
        { clipPath: bottom ? CLOSED_BOTTOM : CLOSED_TOP },
        { clipPath: OPEN, duration: SEG, ease: "power2.inOut", immediateRender: false }, s);

      // incoming media counter-slides against the curtain + settles
      tl.fromTo(medias[inn],
        { yPercent: bottom ? 12 : -12, scale: 1.06 },
        { yPercent: 0, scale: 1, duration: SEG, ease: "power2.out", immediateRender: false }, s);

      // outgoing media recedes under a light scrim
      tl.to(medias[out], { scale: "+=0.045", yPercent: bottom ? -4 : 4, duration: SEG, ease: "power1.inOut" }, s);
      tl.to(scrims[out], { opacity: 0.16, duration: SEG, ease: "power1.in" }, s);
      tl.set(chapters[out], { autoAlpha: 0 }, s + SEG);
      tl.set(scrims[out], { opacity: 0 }, s + SEG);

      // blade hairline tracks the curtain edge (keyline language, not a glow)
      var mask = masks[inn];
      tl.fromTo(blades[inn],
        { y: function () { return bottom ? mask.offsetHeight : 0; } },
        { y: function () { return bottom ? 0 : mask.offsetHeight; }, duration: SEG, ease: "power2.inOut", immediateRender: false }, s);
      tl.fromTo(blades[inn], { opacity: 0 }, { opacity: 0.3, duration: SEG * 0.3, ease: "power1.in", immediateRender: false }, s);
      tl.to(blades[inn], { opacity: 0, duration: SEG * 0.3, ease: "power1.out" }, s + SEG * 0.7);

      // captions: outgoing lines exit early, incoming resolve as the curtain closes
      tl.to(caps[out].lines, { yPercent: -110, autoAlpha: 0, duration: SEG * 0.40, stagger: SEG * 0.04, ease: "power2.in" }, s);
      tl.to(caps[out].rule, { scaleX: 0, duration: SEG * 0.40, ease: "power2.in" }, s);
      tl.fromTo(caps[inn].lines,
        { yPercent: 110, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1, duration: SEG * 0.55, stagger: SEG * 0.06, ease: "power2.out", immediateRender: false },
        s + SEG * 0.45);
      tl.fromTo(caps[inn].rule,
        { scaleX: 0 }, { scaleX: 1, duration: SEG * 0.40, ease: "power2.out", immediateRender: false },
        s + SEG * 0.50);

      // ghost digit + counter roll through the middle of the move
      if (digitCol) tl.to(digitCol, { yPercent: -25 * inn, duration: SEG * 0.60, ease: "power2.inOut" }, s + SEG * 0.20);
      if (countCol) tl.to(countCol, { yPercent: -25 * inn, duration: SEG * 0.30, ease: "power2.inOut" }, s + SEG * 0.35);
    });

    // Continuous underlays (whole pin, linear — separate transform channels).
    var span = [[0, 0.30], [0.10, 0.62], [0.42, 0.94], [0.74, 1.0]];
    medias.forEach(function (m, i) {
      tl.fromTo(m, { y: 10 }, { y: -10, duration: span[i][1] - span[i][0], ease: "none", immediateRender: false }, span[i][0]);
    });
    if (ghost) tl.fromTo(ghost, { yPercent: 0 }, { yPercent: -14, duration: 1, ease: "none", immediateRender: false }, 0);
    if (thumb && track) {
      tl.fromTo(thumb, { y: 0 }, {
        y: function () { return track.offsetHeight - thumb.offsetHeight; },
        duration: 1, ease: "none", immediateRender: false,
      }, 0);
    }
    if (rail) tl.to(rail, { autoAlpha: 0, duration: 0.04, ease: "power1.in" }, 0.96);

    /* ----------------- lead-in: the approach already belongs to the pin -- */
    var stage = q("[data-seq-stage]");
    var lead = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top 90%",
        end: "top top",
        scrub: QC ? true : 0.75,
        invalidateOnRefresh: true,
      },
    });
    lead.fromTo(stage, { y: 48 }, { y: 0, ease: "power1.out", immediateRender: false }, 0);
    lead.fromTo(medias[0], { scale: 1.12 }, { scale: 1.06, ease: "none", immediateRender: false }, 0);
    if (ghost) lead.fromTo(ghost, { autoAlpha: 0 }, { autoAlpha: 1, ease: "none", immediateRender: false }, 0);
    if (track) lead.fromTo(track, { scaleY: 0 }, { scaleY: 1, ease: "power1.out", immediateRender: false }, 0);

    if (QC) window.__seqQC = { st: tl.scrollTrigger, tl: tl };

    // Cleanup on context revert: gsap.matchMedia strips tweens/pins/inline
    // styles automatically; we only remove the layout class.
    return function () {
      document.documentElement.classList.remove("lab-enhanced");
      if (QC) delete window.__seqQC;
    };
  }

  /* ---------------------------------------------------------- narrow mode */

  function buildNarrow() {
    var triggers = [];
    chapters.forEach(function (c) {
      var media = q("[data-seq-media]", c);
      var lines = qa("[data-seq-line]", c);
      var rule = q("[data-seq-rule]", c);

      triggers.push(gsap.fromTo(media, { scale: 1.06 }, {
        scale: 1, ease: "none",
        scrollTrigger: { trigger: c, start: "top 80%", end: "top 30%", scrub: 0.6 },
      }));

      gsap.set(lines, { yPercent: 110, autoAlpha: 0 });
      gsap.set(rule, { scaleX: 0, transformOrigin: "left center" });
      triggers.push(gsap.timeline({
        scrollTrigger: { trigger: c, start: "top 78%", toggleActions: "play none none reverse" },
      })
        .to(lines, { yPercent: 0, autoAlpha: 1, duration: 0.9, stagger: 0.08, ease: "power3.out" }, 0)
        .to(rule, { scaleX: 1, duration: 0.7, ease: "power2.out" }, 0.1));
    });
    return function () {}; // matchMedia reverts the tweens/triggers
  }
})();
