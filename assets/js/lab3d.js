/* Nuvamin: "Inside the lab", the life of one lot (homepage section 03).

   One lot, NM260924-04 (NVM-204), is followed through four stages while the
   section is pinned and scrubbed by scroll:

     01 Intake    raw material drifts inside a quarantine cage
     02 Identity  the particles condense into a real ATP molecule (RDKit
                  coordinates) and a scan ring passes through it
     03 Filling   the molecule lifts, a glass 2R vial rises, the material
                  pours through the neck and settles; stopper + cap crimp on
     04 Release   the vial spins while the label is applied, then turns to
                  face the viewer as a release ring sweeps up the glass

   The static markup is a complete layout on its own. This module always
   draws the instrument charts, and only upgrades to the WebGL scene
   (html.lab3d-on) when WebGL, GSAP ScrollTrigger and motion are available.
   Three.js is loaded lazily, just before the section scrolls into view. */

const root = document.querySelector("[data-lab]");
const docEl = document.documentElement;

/* ------------------------------------------------------------ utilities */

const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const range = (p, a, b) => clamp01((p - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eout = (t) => 1 - Math.pow(1 - t, 3);
const ein = (t) => t * t;
const eback = (t) => { const c1 = 1.3, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Stage windows on the 0..1 scroll progress. */
const STAGES = [0, 0.22, 0.47, 0.78];
const STATUS = ["Quarantine", "In testing", "Filling", "Released"];
const stageOf = (p) => (p < STAGES[1] ? 0 : p < STAGES[2] ? 1 : p < STAGES[3] ? 2 : 3);
const localOf = (p, i) => range(p, STAGES[i], i === 3 ? 1 : STAGES[i + 1]);

/* ATP, heavy atoms, from an RDKit ETKDG + MMFF conformer (Å, centered). */
const ATP = {"atoms":[["N",-4.086,4.168,-0.773],["C",-4.251,2.863,-0.335],["N",-5.506,2.391,-0.153],["C",-5.655,1.114,0.258],["N",-4.704,0.192,0.522],["C",-3.478,0.715,0.318],["N",-2.271,0.084,0.452],["C",-1.301,0.989,0.12],["N",-1.807,2.157,-0.224],["C",-3.168,2.0,-0.101],["C",-2.101,-1.284,0.899],["O",-0.69,-1.59,1.018],["C",-0.43,-2.786,0.253],["C",0.986,-2.753,-0.309],["O",1.128,-1.651,-1.194],["P",2.438,-0.734,-1.07],["O",2.165,0.399,-2.167],["O",3.763,-1.421,-1.203],["O",2.258,0.041,0.303],["P",3.343,0.159,1.463],["O",4.262,-1.147,1.339],["O",2.723,0.286,2.818],["O",4.282,1.383,1.1],["P",5.055,1.691,-0.235],["O",6.323,0.73,-0.22],["O",5.728,3.111,0.047],["O",4.257,1.655,-1.495],["C",-1.521,-2.842,-0.808],["O",-1.74,-4.158,-1.302],["C",-2.725,-2.33,-0.037],["O",-3.279,-3.433,0.717]],"bonds":[[0,1,0],[1,2,1],[2,3,1],[3,4,1],[4,5,1],[5,6,1],[6,7,1],[7,8,1],[8,9,1],[6,10,0],[10,11,0],[11,12,0],[12,13,0],[13,14,0],[14,15,0],[15,16,0],[15,17,1],[15,18,0],[18,19,0],[19,20,0],[19,21,1],[19,22,0],[22,23,0],[23,24,0],[23,25,0],[23,26,1],[12,27,0],[27,28,0],[27,29,0],[29,30,0],[9,1,1],[29,10,0],[9,5,1]]};
const ELEMENT = {
  C: { r: 0.36, color: "#2b3238" },
  N: { r: 0.37, color: "#4f6d8f" },
  O: { r: 0.35, color: "#b08a55" },
  P: { r: 0.5, color: "#7d6b91" }
};

/* ------------------------------------------------------------ instrument charts */

const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function drawChart(svg, opts) {
  if (!svg) return;
  const W = 300, base = 96, top = 10;
  const xOf = (v) => ((v - opts.x0) / (opts.x1 - opts.x0)) * W;
  const N = 420, ys = [];
  let max = 0;
  for (let i = 0; i <= N; i++) {
    const x = lerp(opts.x0, opts.x1, i / N);
    let y = 0;
    for (const pk of opts.peaks) y += opts.shape(x, pk);
    ys.push([x, y]);
    if (y > max) max = y;
  }
  const pt = ([x, y]) => xOf(x).toFixed(2) + "," + (base - (y / max) * (base - top)).toFixed(2);
  const d = "M" + ys.map(pt).join("L");
  svg.querySelector(".lr-line").setAttribute("d", d);
  svg.querySelector(".lr-fill").setAttribute("d", d + "L" + W + "," + base + "L0," + base + "Z");
  const axis = svg.querySelector(".lr-axis");
  axis.appendChild(svgEl("line", { x1: 0, x2: W, y1: base + 0.5, y2: base + 0.5 }));
  for (const t of opts.ticks) {
    const x = xOf(t);
    axis.appendChild(svgEl("line", { x1: x, x2: x, y1: base + 0.5, y2: base + 3.5 }));
    const label = svgEl("text", { x: x, y: base + 13, "text-anchor": "middle" });
    label.textContent = t;
    axis.appendChild(label);
  }
  const unit = svgEl("text", { x: opts.unitRight ? W : 0, y: base + 23, "text-anchor": opts.unitRight ? "end" : "start" });
  unit.textContent = opts.unit;
  axis.appendChild(unit);
  const labels = svg.querySelector(".lr-peaks");
  if (labels && opts.labels) {
    for (const [x, text] of opts.labels) {
      let y = 0;
      for (const pk of opts.peaks) y += opts.shape(x, pk);
      const t = svgEl("text", { x: xOf(x), y: base - (y / max) * (base - top) - 5 });
      t.textContent = text;
      labels.appendChild(t);
    }
  }
}

const lorentz = (x, [c, h, w]) => h * (w * w) / ((x - c) * (x - c) + w * w);
const gauss = (x, [c, h, w]) => h * Math.exp(-((x - c) * (x - c)) / (2 * w * w));

function drawCharts() {
  // 1H-NMR of ATP in D2O (x runs high ppm -> low ppm, as spectra are drawn)
  drawChart(root.querySelector("[data-lab-nmr]").ownerSVGElement, {
    x0: 9.2, x1: 3.2, shape: lorentz, unit: "ppm", unitRight: true,
    ticks: [9, 8, 7, 6, 5, 4],
    peaks: [
      [8.52, 1.0, 0.012], [8.25, 0.95, 0.012],              // adenine H8, H2
      [6.135, 0.5, 0.008], [6.115, 0.5, 0.008],             // H1' doublet
      [4.79, 0.7, 0.03],                                    // HDO
      [4.6, 0.34, 0.01], [4.585, 0.3, 0.01],                // H3'
      [4.41, 0.42, 0.012],                                  // H4'
      [4.235, 0.36, 0.01], [4.205, 0.36, 0.01]              // H5', H5''
    ]
  });
  // HPLC of the NVM-204 panel, 259 nm
  drawChart(root.querySelector("[data-lab-hplc]").ownerSVGElement, {
    x0: 0, x1: 12, shape: gauss, unit: "min", unitRight: true,
    ticks: [0, 2, 4, 6, 8, 10, 12],
    peaks: [
      [2.8, 0.78, 0.09], [4.6, 0.93, 0.1], [6.9, 0.88, 0.12], [9.4, 1.0, 0.14],
      [5.55, 0.022, 0.08], [8.15, 0.016, 0.09], [0, 0.004, 40]
    ],
    labels: [[2.8, "cAMP"], [4.6, "AMP"], [6.9, "ADP"], [9.4, "ATP"]]
  });
}

/* ------------------------------------------------------------ boot */

if (root) {
  drawCharts();
  if (canEnhance()) enhance();
}

function canEnhance() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  if (!window.gsap || !window.ScrollTrigger) return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) {
    return false;
  }
}

function enhance() {
  const gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });
  docEl.classList.add("lab3d-on");

  const canvas = root.querySelector("[data-lab-canvas]");
  const steps = [...root.querySelectorAll("[data-lab-step]")];
  const reads = [...root.querySelectorAll("[data-lab-read]")];
  const goBtns = [...root.querySelectorAll("[data-lab-go]")];
  const ghost = root.querySelector("[data-lab-ghost]");
  const status = root.querySelector("[data-lab-status]");
  const statusText = root.querySelector("[data-lab-status-text]");
  const stageCount = root.querySelector("[data-lab-count-stage]");
  const progressBar = root.querySelector("[data-lab-progress]");

  /* -------- split titles into words/characters for the flip -------- */
  steps.forEach((step) => {
    const h = step.querySelector(".lab-title");
    h.setAttribute("aria-label", h.textContent);
    h.innerHTML = h.textContent.split(" ").map((w) =>
      '<span class="w" aria-hidden="true">' + [...w].map((ch) => '<span class="c">' + ch + "</span>").join("") + "</span>"
    ).join(" ");
  });

  /* -------- readouts: reset to their "start" state, drive by scroll -------- */
  const counters = reads.map((r) => [...r.querySelectorAll("[data-lab-count]")].map((el) => ({
    el, to: parseFloat(el.getAttribute("data-lab-count")), dec: +el.getAttribute("data-dec"), last: ""
  })));
  const checks = reads.map((r) => [...r.querySelectorAll(".lr-list li")]);
  const nmr = root.querySelector("[data-lab-nmr]");
  const nmrFill = root.querySelector("[data-lab-nmr-fill]");
  const hplc = root.querySelector("[data-lab-hplc]");
  const hplcFill = root.querySelector("[data-lab-hplc-fill]");
  const fillBar = root.querySelector("[data-lab-fill]");
  const stamp = root.querySelector("[data-lab-stamp]");
  const peakLabels = root.querySelectorAll(".lr-peaks text");
  const indexBars = goBtns.map((b) => b.querySelector("i"));

  function setCount(c, v) {
    const s = v.toFixed(c.dec);
    if (s !== c.last) { c.el.textContent = s; c.last = s; }
  }
  function toggle(el, cls, on) { if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on); }

  function updateReadouts(p) {
    // intake: log lines tick through the stage
    const l0 = localOf(p, 0);
    checks[0].forEach((li, k) => toggle(li, "is-on", l0 > 0.12 + k * 0.2));
    // identity: spectrum draws, then the mass and match settle
    const l1 = localOf(p, 1);
    const draw1 = eio(range(l1, 0.05, 0.62));
    nmr.style.strokeDashoffset = 1 - draw1;
    nmrFill.style.clipPath = "inset(0 " + ((1 - draw1) * 100).toFixed(2) + "% 0 0)";
    counters[1].forEach((c, k) => setCount(c, c.to * eout(range(l1, 0.3 + k * 0.12, 0.8 + k * 0.08))));
    // filling: the balance counts up, then the seal lines tick
    const l2 = localOf(p, 2);
    const w = eout(range(l2, 0.22, 0.62));
    setCount(counters[2][0], counters[2][0].to * w + (w > 0 && w < 1 ? (Math.random() - 0.5) * 0.004 : 0));
    fillBar.style.transform = "scaleX(" + w.toFixed(4) + ")";
    checks[2].forEach((li) => toggle(li, "is-on", l2 > parseFloat(li.getAttribute("data-lab-at"))));
    // release: chromatogram, purity, stamp
    const l3 = localOf(p, 3);
    const draw3 = eio(range(l3, 0.04, 0.55));
    hplc.style.strokeDashoffset = 1 - draw3;
    hplcFill.style.clipPath = "inset(0 " + ((1 - draw3) * 100).toFixed(2) + "% 0 0)";
    peakLabels.forEach((t, k) => { t.style.opacity = draw3 > 0.2 + k * 0.22 ? 1 : 0; });
    counters[3].forEach((c, k) => setCount(c, c.to * eout(range(l3, 0.4 + k * 0.1, 0.75 + k * 0.08))));
    toggle(stamp, "is-on", l3 > 0.78);
    // index underline + footer
    indexBars.forEach((b, k) => { b.style.transform = "scaleX(" + localOf(p, k).toFixed(4) + ")"; });
    progressBar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    toggle(root, "is-moving", p > 0.015);
  }
  peakLabels.forEach((t) => { t.style.transition = "opacity .5s"; });

  /* -------- stage transitions (played, not scrubbed) -------- */
  const partsOf = (k) => [...steps[k].querySelectorAll(".c, .lab-num, .lab-text"), reads[k]];
  function hardHide(k) {
    gsap.killTweensOf(partsOf(k));
    steps[k].classList.remove("is-here");
    reads[k].classList.remove("is-here");
  }
  let current = -1;
  function showStage(i, instant) {
    if (i === current) return;
    const dir = i > current ? 1 : -1;
    const prev = current;
    current = i;
    goBtns.forEach((b, k) => b.classList.toggle("is-here", k === i));
    stageCount.textContent = "0" + (i + 1);
    status.setAttribute("data-state", i);
    gsap.to(ghost, { yPercent: -25 * i, duration: instant ? 0 : 1.1, ease: "expo.out", overwrite: true });

    // status text roll
    if (instant) statusText.textContent = STATUS[i];
    else gsap.timeline()
      .to(statusText, { yPercent: -dir * 110, opacity: 0, duration: 0.2, ease: "power2.in" })
      .add(() => { statusText.textContent = STATUS[i]; })
      .fromTo(statusText, { yPercent: dir * 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.35, ease: "power3.out" });

    steps.forEach((s, k) => s.setAttribute("aria-hidden", k === i ? "false" : "true"));
    reads.forEach((r, k) => r.setAttribute("aria-hidden", k === i ? "false" : "true"));

    const inStep = steps[i], inRead = reads[i];
    const inChars = inStep.querySelectorAll(".c");
    const inRest = inStep.querySelectorAll(".lab-num, .lab-text");
    inStep.classList.add("is-here");
    inRead.classList.add("is-here");

    if (instant || prev < 0) {
      steps.forEach((s, k) => { if (k !== i) s.classList.remove("is-here"); });
      reads.forEach((r, k) => { if (k !== i) r.classList.remove("is-here"); });
      gsap.set(inChars, { rotateX: 0, yPercent: 0, opacity: 1 });
      gsap.set(inRest, { y: 0, opacity: 1 });
      gsap.set(inRead, { y: 0, opacity: 1, filter: "blur(0px)" });
      return;
    }

    // anything that is neither leaving nor arriving is hidden at once, so a
    // fast scroll through several stages never stacks titles
    steps.forEach((_, k) => { if (k !== i && k !== prev) hardHide(k); });
    const outStep = steps[prev], outRead = reads[prev];
    gsap.killTweensOf(partsOf(prev).concat(partsOf(i)));
    gsap.to(outStep.querySelectorAll(".c"), {
      rotateX: dir * 88, yPercent: -dir * 40, opacity: 0, duration: 0.42, ease: "power3.in",
      stagger: { each: 0.007, from: dir > 0 ? "start" : "end" }
    });
    gsap.to(outStep.querySelectorAll(".lab-num, .lab-text"), {
      y: -dir * 14, opacity: 0, duration: 0.35, ease: "power2.in",
      onComplete: () => { if (current !== prev) outStep.classList.remove("is-here"); }
    });
    gsap.to(outRead, {
      y: -dir * 12, opacity: 0, filter: "blur(6px)", duration: 0.35, ease: "power2.in",
      onComplete: () => { if (current !== prev) outRead.classList.remove("is-here"); }
    });

    gsap.fromTo(inChars, { rotateX: -dir * 88, yPercent: dir * 40, opacity: 0 }, {
      rotateX: 0, yPercent: 0, opacity: 1, duration: 0.9, ease: "expo.out", delay: 0.22,
      stagger: { each: 0.016, from: dir > 0 ? "start" : "end" }
    });
    gsap.fromTo(inRest, { y: dir * 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "expo.out", delay: 0.34, stagger: 0.06 });
    gsap.fromTo(inRead, { y: dir * 16, opacity: 0, filter: "blur(6px)" }, { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.7, ease: "expo.out", delay: 0.28 });
  }

  /* -------- scroll: pin the stage, map scroll to 0..1 -------- */
  let target = 0, P = 0, primed = false;
  const st = ScrollTrigger.create({
    trigger: root,
    start: "top top",
    end: () => "+=" + Math.round(window.innerHeight * 4.4),
    pin: true,
    pinSpacing: true,
    anticipatePin: 1,
    invalidateOnRefresh: true,
    onUpdate: (self) => { target = self.progress; }
  });
  target = st.progress;

  goBtns.forEach((b, k) => b.addEventListener("click", () => {
    const mid = k === 3 ? 0.97 : (STAGES[k] + STAGES[k + 1]) / 2 + 0.02;
    window.scrollTo({ top: st.start + (st.end - st.start) * mid, behavior: "smooth" });
  }));

  window.addEventListener("load", () => ScrollTrigger.refresh());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());

  showStage(stageOf(target), true);
  updateReadouts(target);
  let drawFn = null;
  runLoop();

  /* -------- 3D: load three.js just before the section is reached -------- */
  const io = new IntersectionObserver((entries) => {
    if (!entries[0].isIntersecting) return;
    io.disconnect();
    import("./vendor/three.lab.min.js").then((THREE) => startScene(THREE)).catch(() => {
      // the pinned UI keeps working without the canvas
      root.classList.add("is-ready");
    });
  }, { rootMargin: "120% 0px 120% 0px" });
  io.observe(root);

  /* -------- the scene -------- */
  function startScene(THREE) {
    const small = window.matchMedia("(max-width: 900px)").matches;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.05;

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 6, 5);
    scene.add(key, new THREE.AmbientLight(0xffffff, 0.35));

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    const lookAt = new THREE.Vector3();

    /* ---- quarantine cage ---- */
    const CENTER = new THREE.Vector3(0, 1.15, 0);
    const cageGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(2.55, 2.55, 2.55));
    const cage = new THREE.LineSegments(cageGeo, new THREE.LineDashedMaterial({
      color: 0x78909c, dashSize: 0.09, gapSize: 0.07, transparent: true, opacity: 1, depthWrite: false
    }));
    cage.computeLineDistances();
    const cageGroup = new THREE.Group();
    cageGroup.position.copy(CENTER);
    cageGroup.add(cage);
    // corner brackets
    const bracketPts = [];
    const h = 1.275, b = 0.22;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const c = [sx * h, sy * h, sz * h];
      bracketPts.push(...c, c[0] - sx * b, c[1], c[2], ...c, c[0], c[1] - sy * b, c[2], ...c, c[0], c[1], c[2] - sz * b);
    }
    const bracketGeo = new THREE.BufferGeometry();
    bracketGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bracketPts), 3));
    const brackets = new THREE.LineSegments(bracketGeo, new THREE.LineBasicMaterial({ color: 0x263238, transparent: true, depthWrite: false }));
    cageGroup.add(brackets);
    scene.add(cageGroup);

    /* ---- molecule ---- */
    const MOL_SCALE = small ? 0.15 : 0.155;
    const mol = new THREE.Group();
    mol.position.copy(CENTER);
    mol.scale.setScalar(MOL_SCALE);
    scene.add(mol);
    const atoms = ATP.atoms.map(([el, x, y, z]) => ({ el, v: new THREE.Vector3(x, y, z), r: ELEMENT[el].r, color: new THREE.Color(ELEMENT[el].color) }));
    const atomMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 28, 20),
      new THREE.MeshStandardMaterial({ roughness: 0.28, metalness: 0.08, envMapIntensity: 0.9 }),
      atoms.length
    );
    mol.add(atomMesh);
    const bondMat = new THREE.MeshStandardMaterial({ color: 0x9aa7ae, roughness: 0.4, metalness: 0.05, transparent: true, opacity: 0 });
    const bondMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), bondMat, ATP.bonds.length * 2);
    {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
      const dir = new THREE.Vector3(), mid = new THREE.Vector3(), side = new THREE.Vector3(), s = new THREE.Vector3();
      let n = 0;
      ATP.bonds.forEach(([a, bIdx, dbl]) => {
        const A = atoms[a].v, B = atoms[bIdx].v;
        dir.subVectors(B, A);
        const len = dir.length();
        dir.normalize();
        q.setFromUnitVectors(up, dir);
        side.crossVectors(dir, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(dbl ? 0.11 : 0);
        for (const k of dbl ? [-1, 1] : [0]) {
          mid.addVectors(A, B).multiplyScalar(0.5).addScaledVector(side, k);
          s.set(dbl ? 0.07 : 0.1, len, dbl ? 0.07 : 0.1);
          m.compose(mid, q, s);
          bondMesh.setMatrixAt(n++, m);
        }
      });
      bondMesh.count = n;
      bondMesh.instanceMatrix.needsUpdate = true;
    }
    mol.add(bondMesh);

    // scan ring
    const scan = new THREE.Group();
    const scanRing = new THREE.Mesh(new THREE.TorusGeometry(1.22, 0.0045, 8, 180), new THREE.MeshBasicMaterial({ color: 0x455a64, transparent: true, depthWrite: false }));
    const scanDisc = new THREE.Mesh(new THREE.CircleGeometry(1.22, 96), new THREE.MeshBasicMaterial({ color: 0x78909c, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }));
    scanRing.rotation.x = scanDisc.rotation.x = Math.PI / 2;
    scan.add(scanRing, scanDisc);
    scene.add(scan);

    /* ---- vial ---- */
    const vial = new THREE.Group();
    scene.add(vial);
    const profile = [
      [0, 0], [0.5, 0], [0.575, 0.018], [0.6, 0.07], [0.6, 1.5], [0.592, 1.575], [0.56, 1.64], [0.49, 1.7],
      [0.44, 1.74], [0.42, 1.78], [0.42, 1.84], [0.47, 1.855], [0.49, 1.89], [0.49, 1.97], [0.465, 1.995], [0.37, 1.995]
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const glassMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0 }, uEdge: { value: new THREE.Color(0x3d4b53) } },
      vertexShader: `
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vV = -mv.xyz; vY = position.y;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform float uOpacity; uniform vec3 uEdge;
        varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){
          vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
          vec3 v = normalize(vV);
          float f = 1.0 - abs(dot(n, v));
          float edge = pow(f, 3.2);
          float rim = smoothstep(0.86, 0.985, f);
          float nx = n.x;
          float s1 = smoothstep(0.40, 0.50, nx) * (1.0 - smoothstep(0.52, 0.66, nx));
          float s2 = smoothstep(-0.66, -0.58, nx) * (1.0 - smoothstep(-0.56, -0.48, nx));
          float streak = s1 * 0.95 + s2 * 0.5;
          vec3 col = mix(vec3(0.95, 0.965, 0.972), uEdge, clamp(edge * 0.7 + rim * 0.6, 0.0, 1.0));
          col = mix(col, vec3(1.0), streak);
          float a = 0.018 + edge * 0.34 + rim * 0.42 + streak * 0.5;
          a *= gl_FrontFacing ? 1.0 : 0.5;
          a *= 0.9 + 0.35 * smoothstep(1.55, 1.9, vY);
          gl_FragColor = vec4(col, a * uOpacity);
        }`
    });
    const glass = new THREE.Mesh(new THREE.LatheGeometry(profile, 120), glassMat);
    glass.renderOrder = 10;
    vial.add(glass);
    // thick glass base
    const baseGlass = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.58, 0.09, 96), glassMat);
    baseGlass.position.y = 0.05;
    baseGlass.renderOrder = 9;
    vial.add(baseGlass);

    // lyophilised cake
    const cakeMat = new THREE.MeshStandardMaterial({ color: 0xf4f5f4, roughness: 0.95, metalness: 0, transparent: true, opacity: 0 });
    const cake = new THREE.Mesh(new THREE.CylinderGeometry(0.535, 0.55, 0.34, 72), cakeMat);
    cake.position.y = 0.1 + 0.17;
    vial.add(cake);

    // stopper + cap
    const capGroup = new THREE.Group();
    vial.add(capGroup);
    const metal = new THREE.MeshStandardMaterial({ color: 0xd9dde0, metalness: 1, roughness: 0.26, envMapIntensity: 1.25, transparent: true, opacity: 0 });
    const metalTop = new THREE.MeshStandardMaterial({ color: 0xc4c9cc, metalness: 1, roughness: 0.38, envMapIntensity: 1.1, transparent: true, opacity: 0 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x5f676c, roughness: 0.7, metalness: 0, transparent: true, opacity: 0 });
    const stopper = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.24, 64), rubber);
    stopper.position.y = 1.86;
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.535, 0.535, 0.4, 96, 1, true), metal);
    skirt.position.y = 2.02;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.535, 0.05, 96), metal);
    rim.position.y = 2.245;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.03, 96), metalTop);
    disc.position.y = 2.265;
    const roll = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.022, 12, 96), metal);
    roll.rotation.x = Math.PI / 2;
    roll.position.y = 1.825;
    capGroup.add(stopper, skirt, rim, disc, roll);

    // label
    const LABEL_ARC = 0.9 * TAU, LABEL_CENTER = 0.47;
    const labelCanvas = document.createElement("canvas");
    labelCanvas.width = 2400; labelCanvas.height = 808;
    const labelTex = new THREE.CanvasTexture(labelCanvas);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    labelTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const revealCanvas = document.createElement("canvas");
    revealCanvas.width = 256; revealCanvas.height = 4;
    const rctx = revealCanvas.getContext("2d");
    const rg = rctx.createLinearGradient(0, 0, 256, 0);
    rg.addColorStop(0, "#fff"); rg.addColorStop(0.499, "#fff"); rg.addColorStop(0.501, "#000"); rg.addColorStop(1, "#000");
    rctx.fillStyle = rg; rctx.fillRect(0, 0, 256, 4);
    const revealTex = new THREE.CanvasTexture(revealCanvas);
    revealTex.wrapS = revealTex.wrapT = THREE.ClampToEdgeWrapping;
    const labelMat = new THREE.MeshStandardMaterial({
      map: labelTex, alphaMap: revealTex, alphaTest: 0.5, roughness: 0.62, metalness: 0, envMapIntensity: 0.55, side: THREE.DoubleSide
    });
    const label = new THREE.Mesh(
      new THREE.CylinderGeometry(0.604, 0.604, 1.14, 128, 1, true, -LABEL_CENTER * LABEL_ARC, LABEL_ARC),
      labelMat
    );
    label.position.y = 0.745;
    vial.add(label);
    drawLabel(labelCanvas);
    labelTex.needsUpdate = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { drawLabel(labelCanvas); labelTex.needsUpdate = true; });

    // release ring
    const sweep = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.0045, 8, 120), new THREE.MeshBasicMaterial({ color: 0x263238, transparent: true, opacity: 0, depthWrite: false }));
    sweep.rotation.x = Math.PI / 2;
    vial.add(sweep);

    // contact shadow
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 256;
    const sctx = shadowCanvas.getContext("2d");
    const sg = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    sg.addColorStop(0, "rgba(38,50,56,0.42)"); sg.addColorStop(0.35, "rgba(38,50,56,0.18)"); sg.addColorStop(1, "rgba(38,50,56,0)");
    sctx.fillStyle = sg; sctx.fillRect(0, 0, 256, 256);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(shadowCanvas), transparent: true, opacity: 0, depthWrite: false
    }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    scene.add(shadow);

    /* ---- particles ---- */
    const N = small ? 1800 : 3400;
    const rand = rng(204);
    const posArr = new Float32Array(N * 3), sizeArr = new Float32Array(N), alphaArr = new Float32Array(N), toneArr = new Float32Array(N);
    const cloud = new Float32Array(N * 3), molL = new Float32Array(N * 3), mouth = new Float32Array(N * 3), powder = new Float32Array(N * 3);
    const seed = new Float32Array(N), delay = new Float32Array(N);
    const atomWeights = atoms.map((a) => a.r * a.r);
    const wSum = atomWeights.reduce((s, v) => s + v, 0);
    function pickAtom(r) { let acc = 0; for (let k = 0; k < atoms.length; k++) { acc += atomWeights[k] / wSum; if (r <= acc) return k; } return atoms.length - 1; }
    for (let i = 0; i < N; i++) {
      // cloud: soft sphere
      const u = rand() * 2 - 1, th = rand() * TAU, rr = Math.cbrt(rand()) * 1.08;
      const sq = Math.sqrt(1 - u * u);
      cloud[i * 3] = rr * sq * Math.cos(th); cloud[i * 3 + 1] = rr * u; cloud[i * 3 + 2] = rr * sq * Math.sin(th);
      // molecule: atoms (72%) and bonds
      let mx, my, mz;
      if (rand() < 0.72) {
        const a = atoms[pickAtom(rand())];
        const uu = rand() * 2 - 1, tt = rand() * TAU, s2 = Math.sqrt(1 - uu * uu), rad = a.r * (0.7 + 0.5 * Math.cbrt(rand()));
        mx = a.v.x + rad * s2 * Math.cos(tt); my = a.v.y + rad * uu; mz = a.v.z + rad * s2 * Math.sin(tt);
      } else {
        const [a, bb] = ATP.bonds[Math.floor(rand() * ATP.bonds.length)];
        const t = rand();
        mx = lerp(atoms[a].v.x, atoms[bb].v.x, t) + (rand() - 0.5) * 0.18;
        my = lerp(atoms[a].v.y, atoms[bb].v.y, t) + (rand() - 0.5) * 0.18;
        mz = lerp(atoms[a].v.z, atoms[bb].v.z, t) + (rand() - 0.5) * 0.18;
      }
      molL[i * 3] = mx; molL[i * 3 + 1] = my; molL[i * 3 + 2] = mz;
      // pour: through the mouth, settle as a cake
      const ma = rand() * TAU, mr = Math.sqrt(rand()) * 0.1;
      mouth[i * 3] = Math.cos(ma) * mr; mouth[i * 3 + 1] = 2.05; mouth[i * 3 + 2] = Math.sin(ma) * mr;
      const pa = rand() * TAU, pr = Math.sqrt(rand()) * 0.5;
      powder[i * 3] = Math.cos(pa) * pr; powder[i * 3 + 1] = 0.12 + rand() * 0.3; powder[i * 3 + 2] = Math.sin(pa) * pr;
      seed[i] = rand();
      delay[i] = rand();
      sizeArr[i] = 0.42 + Math.pow(rand(), 2.6) * 1.05;
      toneArr[i] = rand();
    }
    const pGeo = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(posArr, 3);
    const sizeAttr = new THREE.BufferAttribute(sizeArr, 1);
    const alphaAttr = new THREE.BufferAttribute(alphaArr, 1);
    posAttr.setUsage(35048); alphaAttr.setUsage(35048); sizeAttr.setUsage(35048); // DYNAMIC_DRAW
    pGeo.setAttribute("position", posAttr);
    pGeo.setAttribute("aSize", sizeAttr);
    pGeo.setAttribute("aAlpha", alphaAttr);
    pGeo.setAttribute("aTone", new THREE.BufferAttribute(toneArr, 1));
    const baseSize = sizeArr.slice();
    const pMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uScale: { value: 1 }, uA: { value: new THREE.Color(0x263238) }, uB: { value: new THREE.Color(0x78909c) } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha; attribute float aTone;
        uniform float uScale; varying float vAlpha; varying float vTone;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / -mv.z;
          vAlpha = aAlpha; vTone = aTone;
        }`,
      fragmentShader: `
        uniform vec3 uA; uniform vec3 uB; varying float vAlpha; varying float vTone;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.15, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(mix(uA, uB, vTone), a);
        }`
    });
    const points = new THREE.Points(pGeo, pMat);
    points.frustumCulled = false;
    points.renderOrder = 5;
    scene.add(points);

    /* ---- camera path ---- */
    const CAM = [
      [0.00, [0.0, 1.35, 9.8], [0, 1.15, 0]],
      [0.20, [0.8, 1.6, 9.2], [0, 1.15, 0]],
      [0.38, [-0.8, 1.45, 7.6], [0, 1.15, 0]],
      [0.47, [-0.4, 1.9, 8.6], [0, 1.55, 0]],
      [0.58, [0.5, 2.3, 9.8], [0, 1.72, 0]],
      [0.72, [0.9, 2.35, 8.2], [0, 1.35, 0]],
      [0.82, [0.2, 1.45, 7.9], [0, 1.15, 0]],
      [1.00, [0.0, 1.3, 8.1], [0, 1.15, 0]]
    ];
    const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
    function cameraAt(p, pos, look) {
      let k = 0;
      while (k < CAM.length - 2 && p > CAM[k + 1][0]) k++;
      const [p0, c0, l0] = CAM[k], [p1, c1, l1] = CAM[k + 1];
      const t = smooth(range(p, p0, p1));
      pos.set(lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t));
      look.set(lerp(l0[0], l1[0], t), lerp(l0[1], l1[1], t), lerp(l0[2], l1[2], t));
    }

    /* ---- sizing ---- */
    let W = 0, H = 0, dpr = 1;
    function resize() {
      W = root.clientWidth; H = root.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, small ? 1.6 : 1.75);
      renderer.setPixelRatio(dpr);
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      // frame the free space between the text column and the panel
      const shiftX = small ? 0 : -0.035 * W;
      const shiftY = small ? 0.1 * H : -0.035 * H;
      camera.setViewOffset(W, H, shiftX, shiftY, W, H);
      const distScale = small ? Math.max(1, 1.25 * (0.75 / camera.aspect)) : Math.max(1, 1.45 / camera.aspect);
      camera.userData.distScale = distScale;
      camera.updateProjectionMatrix();
      pMat.uniforms.uScale.value = H * dpr * 0.046;
    }
    resize();
    window.addEventListener("resize", resize);

    /* ---- pointer parallax ---- */
    let px = 0, py = 0, tpx = 0, tpy = 0;
    if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      root.addEventListener("pointermove", (e) => {
        const r = root.getBoundingClientRect();
        tpx = ((e.clientX - r.left) / r.width - 0.5) * 2;
        tpy = ((e.clientY - r.top) / r.height - 0.5) * 2;
      }, { passive: true });
      root.addEventListener("pointerleave", () => { tpx = 0; tpy = 0; }, { passive: true });
    }

    /* ---- per-frame state ---- */
    const camPos = new THREE.Vector3(), molM = new THREE.Matrix4(), v3 = new THREE.Vector3();
    const white = new THREE.Color(0xffffff), tmpC = new THREE.Color(), dummy = new THREE.Object3D();
    const atomWorldY = new Float32Array(atoms.length);
    const LABEL_START = -LABEL_CENTER * LABEL_ARC;
    const EDGE_ANGLE = 1.3; // where the label is applied, in view space (radians)

    function frame(p, time) {
      /* cage */
      const cageOut = eio(range(p, 0.17, 0.29));
      cageGroup.rotation.y = time * 0.06 + p * 1.6;
      cageGroup.rotation.x = 0.18;
      cageGroup.scale.setScalar(1 + cageOut * 0.35);
      cage.material.opacity = (1 - cageOut) * 0.9;
      brackets.material.opacity = (1 - cageOut) * 0.85;
      cageGroup.visible = cageOut < 1;

      /* molecule transform */
      const lift = eio(range(p, 0.46, 0.56));
      mol.position.set(0, lerp(CENTER.y, 3.15, lift), 0);
      mol.scale.setScalar(MOL_SCALE * lerp(1, 0.72, lift));
      mol.rotation.set(0.32 + Math.sin(time * 0.3) * 0.04, time * 0.14 + p * 5.2, 0.12);
      mol.updateMatrixWorld(true);
      molM.copy(mol.matrixWorld);

      /* atoms + bonds */
      const inT = range(p, 0.29, 0.37), outT = range(p, 0.44, 0.5);
      const scanT = range(p, 0.345, 0.45);
      const scanY = lerp(CENTER.y + 1.25, CENTER.y - 1.25, eio(scanT));
      const scanOn = Math.sin(Math.PI * scanT);
      scan.position.y = scanY;
      scan.rotation.z = Math.sin(time * 0.5) * 0.03;
      scanRing.material.opacity = scanOn * 0.9;
      scanDisc.material.opacity = scanOn * 0.07;
      scan.visible = scanOn > 0.001;
      for (let k = 0; k < atoms.length; k++) {
        const a = atoms[k];
        const stag = k / atoms.length;
        const g = eback(clamp01(inT * 1.6 - stag * 0.6)) * (1 - eio(clamp01(outT * 1.5 - (1 - stag) * 0.5)));
        v3.copy(a.v).applyMatrix4(molM);
        atomWorldY[k] = v3.y;
        const hl = scan.visible ? Math.exp(-Math.pow((v3.y - scanY) / 0.14, 2)) * scanOn : 0;
        dummy.position.copy(a.v);
        dummy.scale.setScalar(Math.max(0.0001, a.r * g * (1 + hl * 0.35)));
        dummy.updateMatrix();
        atomMesh.setMatrixAt(k, dummy.matrix);
        tmpC.copy(a.color).lerp(white, hl * 0.4);
        atomMesh.setColorAt(k, tmpC);
      }
      atomMesh.instanceMatrix.needsUpdate = true;
      if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true;
      atomMesh.visible = inT > 0 && outT < 1;
      bondMat.opacity = clamp01(inT * 1.4 - 0.35) * (1 - clamp01(outT * 1.6));
      bondMesh.visible = bondMat.opacity > 0.001;

      /* vial */
      const rise = eout(range(p, 0.47, 0.58));
      vial.visible = rise > 0;
      const idle = range(p, 0.95, 1);
      vial.position.y = lerp(-1.3, 0, rise) + Math.sin(time * 1.1) * 0.018 * idle;
      glassMat.uniforms.uOpacity.value = rise;
      shadow.material.opacity = rise * 0.85;
      shadow.scale.setScalar(lerp(0.6, 1, rise));
      const cakeT = eio(range(p, 0.655, 0.72));
      cakeMat.opacity = cakeT;
      cake.scale.set(1, Math.max(0.001, lerp(0.35, 1, cakeT)), 1);
      cake.position.y = 0.1 + 0.17 * cake.scale.y;

      const capIn = range(p, 0.69, 0.755);
      const crimp = range(p, 0.755, 0.775);
      const capFade = eout(range(p, 0.67, 0.71));
      metal.opacity = metalTop.opacity = rubber.opacity = capFade;
      capGroup.visible = capFade > 0;
      capGroup.position.y = lerp(1.35, 0, eback(capIn));
      capGroup.scale.set(1 + Math.sin(Math.PI * crimp) * 0.025, 1 - Math.sin(Math.PI * crimp) * 0.04, 1 + Math.sin(Math.PI * crimp) * 0.025);
      stopper.position.y = 1.86 + (1 - eout(capIn)) * 0.12;

      /* label: spin the vial while the label is applied at a fixed edge */
      const wrap = range(p, 0.785, 0.875);
      revealTex.offset.x = 0.5 - wrap;
      label.visible = wrap > 0;
      const spinAtWrap = (r) => EDGE_ANGLE - LABEL_START - r * LABEL_ARC;
      let rotY;
      if (p < 0.785) rotY = spinAtWrap(0) + (0.785 - p) * 2.2;
      else if (p < 0.875) rotY = spinAtWrap(eio(wrap) * 0.999 + 0.0005);
      else {
        const settle = eout(range(p, 0.875, 0.965));
        rotY = lerp(spinAtWrap(1), -TAU, settle);
      }
      vial.rotation.y = rotY + Math.sin(time * 0.6) * 0.08 * idle;

      const sw = range(p, 0.9, 0.985);
      sweep.position.y = lerp(0.05, 2.32, eio(sw));
      sweep.material.opacity = Math.sin(Math.PI * sw) * 0.85;
      sweep.scale.setScalar(sweep.position.y > 1.55 ? lerp(1, 0.8, range(sweep.position.y, 1.55, 1.72)) : 1);
      sweep.visible = sw > 0 && sw < 1;

      /* particles */
      const morph = range(p, 0.155, 0.345);
      const halo = range(p, 0.3, 0.36) * (1 - range(p, 0.44, 0.49));
      const pour = range(p, 0.525, 0.705);
      const settleFade = range(p, 0.66, 0.73);
      const cloudRot = time * 0.09 + p * 2.4;
      const cr = Math.cos(cloudRot), sr = Math.sin(cloudRot);
      const breathe = 1 + Math.sin(time * 0.8) * 0.02;
      const e = molM.elements;
      for (let i = 0; i < N; i++) {
        const i3 = i * 3, sd = seed[i];
        // cloud position (drifting)
        let cx = cloud[i3] * breathe, cy = cloud[i3 + 1] * breathe, cz = cloud[i3 + 2] * breathe;
        cx += Math.sin(time * 0.7 + sd * 40.0) * 0.05;
        cy += Math.cos(time * 0.55 + sd * 31.0) * 0.05;
        const rx = cx * cr - cz * sr, rz = cx * sr + cz * cr;
        cx = rx + CENTER.x; cy = cy + CENTER.y; cz = rz + CENTER.z;
        // molecule position (world)
        const lx = molL[i3], ly = molL[i3 + 1], lz = molL[i3 + 2];
        const mx = e[0] * lx + e[4] * ly + e[8] * lz + e[12];
        const my = e[1] * lx + e[5] * ly + e[9] * lz + e[13];
        const mz = e[2] * lx + e[6] * ly + e[10] * lz + e[14];
        const t = eio(clamp01(morph * 1.45 - sd * 0.45));
        let x = lerp(cx, mx, t), y = lerp(cy, my, t), z = lerp(cz, mz, t);
        let a = 0.9, s = 1;
        // pour into the vial
        const u = clamp01((pour - delay[i] * 0.58) / 0.42);
        if (u > 0) {
          const vy = vial.position.y;
          if (u < 0.62) {
            const w = eio(u / 0.62);
            const qx = mx * 0.3, qy = Math.max(my, 2.6) + 0.55, qz = mz * 0.3;
            const ox = mouth[i3], oy = mouth[i3 + 1] + vy, oz = mouth[i3 + 2];
            const iw = 1 - w;
            x = iw * iw * mx + 2 * iw * w * qx + w * w * ox;
            y = iw * iw * my + 2 * iw * w * qy + w * w * oy;
            z = iw * iw * mz + 2 * iw * w * qz + w * w * oz;
          } else {
            const w = ein((u - 0.62) / 0.38);
            x = lerp(mouth[i3], powder[i3], w);
            y = lerp(mouth[i3 + 1], powder[i3 + 1], w) + vy;
            z = lerp(mouth[i3 + 2], powder[i3 + 2], w);
            s = lerp(1, 0.7, w);
          }
          // rotate settled material with the vial so it stays inside
          if (u >= 1) {
            const c = Math.cos(vial.rotation.y), sn = Math.sin(vial.rotation.y);
            const px0 = powder[i3], pz0 = powder[i3 + 2];
            x = px0 * c + pz0 * sn; z = -px0 * sn + pz0 * c;
            a = 0.9 * (1 - settleFade);
          }
        }
        a *= 1 - halo * 0.72;
        posArr[i3] = x; posArr[i3 + 1] = y; posArr[i3 + 2] = z;
        alphaArr[i] = a;
        sizeArr[i] = baseSize[i] * s * (1 - halo * 0.3);
      }
      posAttr.needsUpdate = true; alphaAttr.needsUpdate = true; sizeAttr.needsUpdate = true;
      points.visible = settleFade < 1;

      /* camera */
      cameraAt(p, camPos, lookAt);
      const ds = camera.userData.distScale || 1;
      camPos.sub(lookAt).multiplyScalar(ds).add(lookAt);
      camPos.x += px * 0.45; camPos.y -= py * 0.28;
      camera.position.copy(camPos);
      camera.lookAt(lookAt);
    }

    /* ---- label artwork (matches the product photography) ---- */
    function drawLabel(cv) {
      const c = cv.getContext("2d");
      const Wd = cv.width, Ht = cv.height;
      c.fillStyle = "#f7f8f8"; c.fillRect(0, 0, Wd, Ht);
      // subtle paper shading
      const g = c.createLinearGradient(0, 0, 0, Ht);
      g.addColorStop(0, "rgba(0,0,0,0.02)"); g.addColorStop(0.5, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.03)");
      c.fillStyle = g; c.fillRect(0, 0, Wd, Ht);
      // family band
      c.fillStyle = "#22272B"; c.fillRect(0, 14, Wd, 42);
      const track = (text, x, y, font, color, spacing, align) => {
        c.font = font; c.fillStyle = color;
        const chars = [...text];
        const widths = chars.map((ch) => c.measureText(ch).width);
        const total = widths.reduce((s, w) => s + w, 0) + spacing * (chars.length - 1);
        let cx = align === "right" ? x - total : x;
        chars.forEach((ch, k) => { c.fillText(ch, cx, y); cx += widths[k] + spacing; });
      };
      const L = Math.round(Wd * 0.3);
      track("REFERENCE MATERIALS", L, 43, "500 18px 'Space Grotesk', Arial", "rgba(255,255,255,0.94)", 4.4);
      track("NVM-204", Math.round(Wd * 0.6), 43, "500 18px 'Space Grotesk', Arial", "rgba(255,255,255,0.94)", 3.8, "right");
      track("REFERENCE MATERIAL", L, 206, "500 29px 'Space Grotesk', Arial", "#3d525c", 5.2);
      c.fillStyle = "#121517"; c.font = "600 112px Inter, Arial"; c.fillText("NVM-204", L - 5, 322);
      c.font = "400 38px Inter, Arial"; c.fillStyle = "rgba(18,21,23,0.9)"; c.fillText("Nucleotide Panel", L, 380);
      // quantity pill
      c.font = "500 36px Inter, Arial";
      const qw = c.measureText("25MG").width;
      c.lineWidth = 4; c.strokeStyle = "#121517";
      const px0 = L, py0 = 416, pw = qw + 46, ph = 62, rr = 12;
      c.beginPath();
      c.moveTo(px0 + rr, py0); c.arcTo(px0 + pw, py0, px0 + pw, py0 + ph, rr); c.arcTo(px0 + pw, py0 + ph, px0, py0 + ph, rr);
      c.arcTo(px0, py0 + ph, px0, py0, rr); c.arcTo(px0, py0, px0 + pw, py0, rr); c.closePath(); c.stroke();
      c.fillStyle = "#121517"; c.fillText("25MG", px0 + 23, py0 + 44);
      c.font = "400 33px Inter, Arial"; c.fillStyle = "rgba(18,21,23,0.92)"; c.fillText("Reference grade", L, 694);
      track("LOT NM260924-04", L, 740, "400 24px 'Space Grotesk', Arial", "#3d525c", 3.4);
      // faint structure motif
      c.strokeStyle = "rgba(96,110,120,0.2)"; c.lineWidth = 2.4;
      const hex = (cx, cy, r) => { c.beginPath(); for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; c[k ? "lineTo" : "moveTo"](cx + r * Math.cos(a), cy + r * Math.sin(a)); } c.closePath(); c.stroke(); };
      hex(Wd * 0.51, 570, 38); hex(Wd * 0.51 + 66, 608, 38);
      c.beginPath(); c.moveTo(Wd * 0.51 - 33, 589); c.lineTo(Wd * 0.51 - 90, 628); c.lineTo(Wd * 0.51 - 146, 604); c.stroke();
      // vertical wordmark
      c.save();
      c.translate(Wd * 0.66, Ht * 0.5 + 34);
      c.rotate(-Math.PI / 2);
      track("NUVAMIN", -272, 0, "700 60px 'Space Grotesk', Arial", "#121517", 40);
      c.restore();
    }

    /* ---- render loop hookup ---- */
    drawFn = (p, time) => { frame(p, time); renderer.render(scene, camera); };
    drawFn(P, performance.now() / 1000);
    requestAnimationFrame(() => root.classList.add("is-ready"));
  }

  /* -------- the loop: smooth the scroll, drive UI + scene -------- */
  function runLoop() {
    let visible = true, last = performance.now(), rafId = 0;
    const vis = new IntersectionObserver((en) => {
      visible = en[0].isIntersecting;
      if (visible && !rafId) { last = performance.now(); rafId = requestAnimationFrame(tick); }
    }, { rootMargin: "10% 0px" });
    vis.observe(root);
    function tick(now) {
      rafId = 0;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (!primed) { P = target; primed = true; }
      P += (target - P) * (1 - Math.exp(-dt * 5.2));
      if (Math.abs(target - P) < 0.00005) P = target;
      showStage(stageOf(P));
      updateReadouts(P);
      if (drawFn) drawFn(P, now / 1000);
      if (visible) rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
  }
}
