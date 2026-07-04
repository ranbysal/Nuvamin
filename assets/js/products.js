/* Nuvamin — product catalogue + vector product renders.
   Bottles are drawn as inline SVG so they inherit the page's typography
   and stay crisp at any size. */

const NV_PRODUCTS = [
  {
    id: "daily-core",
    name: "Daily Core",
    sub: "The complete foundation",
    category: "Foundation",
    form: "60 capsules",
    dose: "2 capsules, morning",
    price: 42,
    accent: "#819FA7",
    panel: "#E7ECEF",
    jar: false,
    blurb:
      "One formula for the nutrients most diets under-deliver. Bioavailable forms, meaningful doses, nothing ornamental.",
    benefits: ["Micronutrient baseline", "Energy metabolism", "Immune support"],
    ingredients: [
      { name: "Methylated B-complex", dose: "Full spectrum", note: "Active forms — methylfolate, methylcobalamin — no conversion required." },
      { name: "Zinc bisglycinate", dose: "15 mg", note: "Chelated for absorption and a calm stomach." },
      { name: "Selenium", dose: "110 µg", note: "As selenomethionine, the form found in food." },
      { name: "Choline", dose: "250 mg", note: "The forgotten essential. Included at a dose that counts." }
    ]
  },
  {
    id: "omega-prime",
    name: "Omega Prime",
    sub: "Re-esterified triglyceride omega-3",
    category: "Longevity",
    form: "90 softgels",
    dose: "2 softgels with food",
    price: 38,
    accent: "#5B6E74",
    panel: "#E9EBE7",
    jar: false,
    blurb:
      "Cold-processed marine lipids in the rTG form your body actually recognises. IFOS five-star certified, every batch.",
    benefits: ["Cardiovascular support", "Cognitive maintenance", "Joint comfort"],
    ingredients: [
      { name: "EPA", dose: "840 mg", note: "Per serving, in re-esterified triglyceride form." },
      { name: "DHA", dose: "560 mg", note: "Structural fat for brain and retina." },
      { name: "Mixed tocopherols", dose: "10 mg", note: "Protects the oil, not a filler." }
    ]
  },
  {
    id: "night",
    name: "Night",
    sub: "Magnesium glycinate + apigenin",
    category: "Recovery",
    form: "90 capsules",
    dose: "3 capsules, 1 hour before bed",
    price: 34,
    accent: "#3A474C",
    panel: "#E4E8EC",
    jar: false,
    blurb:
      "A quiet formula for the end of the day. Magnesium in its gentlest form, with apigenin and glycine to help you wind down.",
    benefits: ["Sleep quality", "Muscle relaxation", "Next-day clarity"],
    ingredients: [
      { name: "Magnesium glycinate", dose: "300 mg elemental", note: "The form least likely to disturb digestion." },
      { name: "Apigenin", dose: "50 mg", note: "A flavonoid studied for its calming profile." },
      { name: "Glycine", dose: "2 g", note: "Also the carrier — the dose does double duty." }
    ]
  },
  {
    id: "focus",
    name: "Focus",
    sub: "Citicoline + L-theanine",
    category: "Cognition",
    form: "60 capsules",
    dose: "2 capsules, as needed",
    price: 44,
    accent: "#A7B8BC",
    panel: "#EDF0F2",
    jar: false,
    blurb:
      "Clean attention without the edge. Citicoline for the machinery, theanine to keep it smooth. No stimulants, no crash.",
    benefits: ["Sustained attention", "Working memory", "Calm alertness"],
    ingredients: [
      { name: "Citicoline (CDP-choline)", dose: "500 mg", note: "The clinically studied dose, not a sprinkle." },
      { name: "L-theanine", dose: "200 mg", note: "Smooths the signal. Pairs well with your morning coffee." },
      { name: "Rhodiola rosea", dose: "150 mg", note: "3% rosavins, standardised extract." }
    ]
  },
  {
    id: "d3-k2",
    name: "D3 + K2",
    sub: "Sunlight, directed",
    category: "Foundation",
    form: "120 capsules",
    dose: "1 capsule with a meal",
    price: 28,
    accent: "#B8B29E",
    panel: "#EFEDE6",
    jar: false,
    blurb:
      "Vitamin D moves calcium; K2 tells it where to go. Two nutrients that were always meant to travel together.",
    benefits: ["Bone density", "Immune function", "Seasonal support"],
    ingredients: [
      { name: "Vitamin D3", dose: "2,000 IU", note: "Cholecalciferol from lichen — vegan source." },
      { name: "Vitamin K2 (MK-7)", dose: "100 µg", note: "All-trans menaquinone-7, the shelf-stable form." },
      { name: "Extra-virgin olive oil", dose: "Carrier", note: "Fat-soluble vitamins need fat. That's all that's in here." }
    ]
  },
  {
    id: "collagen",
    name: "Collagen",
    sub: "Hydrolysed marine peptides",
    category: "Recovery",
    form: "300 g powder",
    dose: "1 scoop (10 g), any time",
    price: 48,
    accent: "#C9C2B2",
    panel: "#F0EEE7",
    jar: true,
    blurb:
      "Type I marine collagen, hydrolysed to peptides small enough to matter. Dissolves clear, tastes of nothing.",
    benefits: ["Skin elasticity", "Joint & tendon support", "Hair and nails"],
    ingredients: [
      { name: "Marine collagen peptides", dose: "10 g", note: "Wild-caught, MSC-certified source. Average 2 kDa." },
      { name: "Vitamin C", dose: "80 mg", note: "A cofactor collagen synthesis can't run without." }
    ]
  },
  {
    id: "creatine",
    name: "Creatine",
    sub: "Creapure® monohydrate",
    category: "Performance",
    form: "300 g powder",
    dose: "1 scoop (5 g), daily",
    price: 32,
    accent: "#8FA09B",
    panel: "#E8ECE9",
    jar: true,
    blurb:
      "The most studied molecule in sports nutrition, from the only source we'd put our name on. Micronised, single-ingredient.",
    benefits: ["Strength & power", "Training capacity", "Cognitive resilience"],
    ingredients: [
      { name: "Creatine monohydrate", dose: "5 g", note: "Creapure®, made in Germany. 99.99% pure. Nothing else in the jar." }
    ]
  },
  {
    id: "biome",
    name: "Biome",
    sub: "Multi-strain probiotic",
    category: "Foundation",
    form: "30 capsules",
    dose: "1 capsule, with breakfast",
    price: 46,
    accent: "#7E8D8A",
    panel: "#E9ECE8",
    jar: false,
    blurb:
      "Twelve strains selected for published human data, in delayed-release capsules that get them where they're going.",
    benefits: ["Digestive comfort", "Gut barrier support", "Everyday regularity"],
    ingredients: [
      { name: "Lactobacillus & Bifidobacterium blend", dose: "30 billion CFU", note: "Counted at expiry, not at manufacture." },
      { name: "Prebiotic FOS", dose: "100 mg", note: "A modest feed dose — enough to help, not enough to bloat." }
    ]
  }
];

/* ---------- vector renders ---------- */

function nvBottleSVG(p, opts) {
  opts = opts || {};
  var scale = opts.large ? 1 : 1;
  var a = p.accent, ink = "#0D0D0D", cream = "#FAFAF7";
  if (p.jar) {
    return (
      '<svg viewBox="0 0 300 380" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + p.name + ' jar render">' +
      '<ellipse cx="150" cy="352" rx="92" ry="12" fill="' + ink + '" opacity="0.07"/>' +
      '<rect x="62" y="96" width="176" height="252" rx="18" fill="' + a + '"/>' +
      '<rect x="62" y="96" width="176" height="252" rx="18" fill="#000" opacity="0.05"/>' +
      '<rect x="70" y="104" width="14" height="236" rx="7" fill="#fff" opacity="0.22"/>' +
      '<rect x="54" y="56" width="192" height="52" rx="10" fill="' + ink + '"/>' +
      '<rect x="54" y="98" width="192" height="6" fill="#000" opacity="0.25"/>' +
      '<rect x="78" y="150" width="144" height="150" rx="4" fill="' + cream + '"/>' +
      '<text x="150" y="182" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="11" letter-spacing="4" fill="' + ink + '">NUVAMIN</text>' +
      '<line x1="94" y1="196" x2="206" y2="196" stroke="' + ink + '" stroke-width="1" opacity="0.25"/>' +
      '<text x="150" y="232" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="21" letter-spacing="1" fill="' + ink + '">' + p.name.toUpperCase() + '</text>' +
      '<text x="150" y="252" text-anchor="middle" font-family="Inter, sans-serif" font-size="9.5" fill="' + ink + '" opacity="0.6">' + p.sub + '</text>' +
      '<rect x="118" y="270" width="64" height="17" rx="8.5" fill="none" stroke="' + ink + '" stroke-width="1"/>' +
      '<text x="150" y="281.5" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="8" letter-spacing="1.5" fill="' + ink + '">' + p.form.toUpperCase() + '</text>' +
      '</svg>'
    );
  }
  return (
    '<svg viewBox="0 0 300 380" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + p.name + ' bottle render">' +
    '<ellipse cx="150" cy="356" rx="74" ry="10" fill="' + ink + '" opacity="0.07"/>' +
    '<rect x="122" y="34" width="56" height="34" rx="6" fill="' + ink + '"/>' +
    '<rect x="122" y="60" width="56" height="5" fill="#000" opacity="0.3"/>' +
    '<path d="M110 84 C110 70 122 64 150 64 C178 64 190 70 190 84 L190 92 L110 92 Z" fill="' + a + '"/>' +
    '<rect x="92" y="90" width="116" height="266" rx="16" fill="' + a + '"/>' +
    '<rect x="100" y="100" width="10" height="244" rx="5" fill="#fff" opacity="0.25"/>' +
    '<rect x="92" y="128" width="116" height="176" fill="' + cream + '"/>' +
    '<rect x="92" y="128" width="116" height="176" fill="' + ink + '" opacity="0"/>' +
    '<text x="150" y="158" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="10.5" letter-spacing="4" fill="' + ink + '">NUVAMIN</text>' +
    '<line x1="110" y1="172" x2="190" y2="172" stroke="' + ink + '" stroke-width="1" opacity="0.25"/>' +
    '<text x="150" y="212" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="19" letter-spacing="0.5" fill="' + ink + '">' + p.name.toUpperCase() + '</text>' +
    '<text x="150" y="230" text-anchor="middle" font-family="Inter, sans-serif" font-size="8.6" fill="' + ink + '" opacity="0.6">' + p.sub + '</text>' +
    '<circle cx="150" cy="262" r="13" fill="none" stroke="' + a + '" stroke-width="1.4"/>' +
    '<circle cx="150" cy="262" r="4" fill="' + a + '"/>' +
    '<text x="150" y="292" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-size="7.6" letter-spacing="2" fill="' + ink + '" opacity="0.7">' + p.form.toUpperCase() + '</text>' +
    '</svg>'
  );
}

function nvProductCard(p, i) {
  return (
    '<article class="pcard reveal" style="--d:' + (i * 60) + 'ms">' +
    '<a class="pcard-media" href="product.html?id=' + p.id + '" style="background:' + p.panel + '">' +
    '<div class="pcard-render">' + nvBottleSVG(p) + '</div>' +
    '<span class="pcard-tag">' + p.category + '</span>' +
    '</a>' +
    '<div class="pcard-meta">' +
    '<div class="pcard-row"><h3 class="pcard-name"><a href="product.html?id=' + p.id + '">' + p.name + '</a></h3>' +
    '<span class="pcard-price">&euro;' + p.price + '</span></div>' +
    '<p class="pcard-sub">' + p.sub + '</p>' +
    '<button class="btn btn-line pcard-add" data-add="' + p.id + '">Add to cart</button>' +
    '</div>' +
    '</article>'
  );
}

function nvFindProduct(id) {
  for (var i = 0; i < NV_PRODUCTS.length; i++) if (NV_PRODUCTS[i].id === id) return NV_PRODUCTS[i];
  return null;
}
