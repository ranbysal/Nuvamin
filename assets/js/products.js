/* Nuvamin — research peptide catalogue + vector vial renders.
   Vials are drawn as inline SVG so they inherit the page's typography
   and stay crisp at any size. For laboratory research use only. */

const NV_PRODUCTS = [
  {
    id: "retatrutide",
    name: "Retatrutide",
    sub: "GLP-1 / GIP / glucagon triple agonist",
    category: "Metabolic",
    mg: "10MG",
    form: "Lyophilised powder",
    price: 135,
    accent: "#78909C",
    panel: "#ECEFF1",
    blurb:
      "A single-chain triple agonist peptide targeting the GLP-1, GIP and glucagon receptors, supplied lyophilised for laboratory research. Identity and purity confirmed by independent HPLC and mass spectrometry on every lot.",
    research: ["Energy-metabolism models", "Glucose-regulation pathways", "Adipose signalling"],
    specs: [
      { k: "Purity", v: "≥99% (HPLC)" },
      { k: "CAS", v: "2381089-83-2" },
      { k: "Molecular formula", v: "C221H342N46O68" },
      { k: "Molar mass", v: "4731.4 g/mol" },
      { k: "Presentation", v: "10 mg lyophilised, single vial" },
      { k: "Storage", v: "−20 °C, desiccated, protected from light" }
    ]
  },
  {
    id: "tirzepatide",
    name: "Tirzepatide",
    sub: "GIP / GLP-1 dual receptor agonist",
    category: "Metabolic",
    mg: "10MG",
    form: "Lyophilised powder",
    price: 110,
    accent: "#455A64",
    panel: "#E3E8EB",
    blurb:
      "A dual GIP and GLP-1 receptor agonist peptide, lyophilised and lot-tested. Each batch ships with a certificate of analysis confirming identity and purity by HPLC–MS. For research use only.",
    research: ["Incretin-receptor signalling", "Glucose homeostasis", "Metabolic research"],
    specs: [
      { k: "Purity", v: "≥99% (HPLC)" },
      { k: "CAS", v: "2023788-19-2" },
      { k: "Molecular formula", v: "C225H348N48O68" },
      { k: "Molar mass", v: "4813.5 g/mol" },
      { k: "Presentation", v: "10 mg lyophilised, single vial" },
      { k: "Storage", v: "−20 °C, desiccated, protected from light" }
    ]
  },
  {
    id: "tb-500",
    name: "TB-500",
    sub: "Thymosin β-4 active fragment",
    category: "Repair",
    mg: "5MG",
    form: "Lyophilised powder",
    price: 55,
    accent: "#90A4AE",
    panel: "#EEF1F3",
    blurb:
      "The synthetic active fragment of Thymosin β-4, widely used in tissue-repair, angiogenesis and cell-migration research. Lyophilised, ≥98% pure, with a certificate of analysis in every vial.",
    research: ["Tissue-repair models", "Angiogenesis studies", "Cell-migration assays"],
    specs: [
      { k: "Purity", v: "≥98% (HPLC)" },
      { k: "CAS", v: "77591-33-4" },
      { k: "Sequence", v: "Ac-LKKTETQ" },
      { k: "Molar mass", v: "889.0 g/mol" },
      { k: "Presentation", v: "5 mg lyophilised, single vial" },
      { k: "Storage", v: "−20 °C, desiccated, protected from light" }
    ]
  },
  {
    id: "nad",
    name: "NAD+",
    sub: "Nicotinamide adenine dinucleotide",
    category: "Longevity",
    mg: "5MG",
    form: "Lyophilised powder",
    price: 65,
    accent: "#607D8B",
    panel: "#E7ECEF",
    blurb:
      "Research-grade nicotinamide adenine dinucleotide for cellular-energetics and longevity studies. Lyophilised, HPLC-verified and cold-chain shipped to protect stability in transit.",
    research: ["Cellular energetics", "Sirtuin-activity studies", "Mitochondrial research"],
    specs: [
      { k: "Purity", v: "≥99% (HPLC)" },
      { k: "CAS", v: "53-84-9" },
      { k: "Molecular formula", v: "C21H27N7O14P2" },
      { k: "Molar mass", v: "663.43 g/mol" },
      { k: "Presentation", v: "5 mg lyophilised, single vial" },
      { k: "Storage", v: "−20 °C, desiccated, protected from light" }
    ]
  }
];

/* ---------- vector renders ---------- */

function nvVialSVG(p) {
  var a = p.accent, ink = "#000000", white = "#FFFFFF";
  var uid = "v-" + p.id;
  var nameLen = p.name.length;
  var nameSize = nameLen > 9 ? 15 : (nameLen > 6 ? 18 : 22);

  // woven guilloché lines on the label
  var weave = "";
  for (var i = 0; i < 6; i++) {
    var x = 150 + i * 6;
    weave +=
      '<path d="M' + x + ' 190 C' + (x - 16) + ' 224, ' + (x + 20) + ' 256, ' + (x - 6) + ' 300 S' + (x + 18) + ' 322, ' + x + ' 330" ' +
      'stroke="' + a + '" stroke-width="0.7" opacity="0.22" fill="none"/>';
  }

  return (
    '<svg viewBox="0 0 300 380" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + p.name + ' ' + p.mg + ' research vial">' +
    '<defs>' +
    '<linearGradient id="cap-' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="#B4BBC0"/><stop offset="0.22" stop-color="#EDF1F3"/>' +
    '<stop offset="0.5" stop-color="#C2C9CD"/><stop offset="0.78" stop-color="#F1F4F6"/>' +
    '<stop offset="1" stop-color="#A7AFB4"/></linearGradient>' +
    '<linearGradient id="glass-' + uid + '" x1="0" y1="0" x2="1" y2="0">' +
    '<stop offset="0" stop-color="' + a + '" stop-opacity="0.18"/>' +
    '<stop offset="0.5" stop-color="' + a + '" stop-opacity="0.05"/>' +
    '<stop offset="1" stop-color="' + a + '" stop-opacity="0.20"/></linearGradient>' +
    '</defs>' +

    '<ellipse cx="150" cy="366" rx="70" ry="9" fill="' + ink + '" opacity="0.10"/>' +

    // glass neck + body
    '<rect x="124" y="74" width="52" height="44" rx="4" fill="url(#glass-' + uid + ')" stroke="' + ink + '" stroke-opacity="0.10" stroke-width="1"/>' +
    '<rect x="94" y="108" width="112" height="252" rx="14" fill="url(#glass-' + uid + ')" stroke="' + ink + '" stroke-opacity="0.10" stroke-width="1"/>' +
    // liquid tint
    '<rect x="97" y="150" width="106" height="207" rx="11" fill="' + a + '" opacity="0.16"/>' +
    // highlights
    '<rect x="104" y="120" width="9" height="230" rx="4.5" fill="#fff" opacity="0.55"/>' +
    '<rect x="192" y="120" width="6" height="230" rx="3" fill="' + ink + '" opacity="0.05"/>' +

    // crimp cap
    '<rect x="114" y="40" width="72" height="12" rx="4" fill="url(#cap-' + uid + ')"/>' +
    '<rect x="118" y="46" width="64" height="42" rx="4" fill="url(#cap-' + uid + ')"/>' +
    '<rect x="118" y="84" width="64" height="7" rx="2" fill="' + ink + '" opacity="0.18"/>' +
    '<g opacity="0.35">' +
    '<line x1="130" y1="52" x2="130" y2="82" stroke="#fff" stroke-width="1.4"/>' +
    '<line x1="146" y1="52" x2="146" y2="82" stroke="#000" stroke-width="0.6" opacity="0.4"/>' +
    '<line x1="162" y1="52" x2="162" y2="82" stroke="#fff" stroke-width="1.4"/>' +
    '<line x1="172" y1="52" x2="172" y2="82" stroke="#000" stroke-width="0.6" opacity="0.4"/>' +
    '</g>' +

    // label
    '<rect x="88" y="172" width="124" height="158" rx="4" fill="' + ink + '" opacity="0.05"/>' +
    '<rect x="86" y="170" width="124" height="158" rx="4" fill="' + white + '"/>' +
    weave +
    '<text x="100" y="' + (208 + (22 - nameSize) * 0.5) + '" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="' + nameSize + '" letter-spacing="0" fill="' + ink + '">' + p.name + '</text>' +
    '<rect x="100" y="222" width="60" height="19" rx="9.5" fill="none" stroke="' + ink + '" stroke-width="1"/>' +
    '<text x="130" y="235" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="500" font-size="9.5" letter-spacing="0.6" fill="' + ink + '">' + p.mg + '</text>' +
    '<text x="100" y="312" font-family="Inter, sans-serif" font-size="7.5" letter-spacing="1.2" fill="' + ink + '" opacity="0.65">RESEARCH USE ONLY</text>' +
    '<text x="200" y="250" text-anchor="middle" transform="rotate(-90 200 250)" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="12" letter-spacing="5" fill="' + ink + '">NUVAMIN</text>' +
    '</svg>'
  );
}

/* back-compat alias — call sites use nvBottleSVG */
function nvBottleSVG(p) { return nvVialSVG(p); }

function nvProductCard(p, i) {
  return (
    '<article class="pcard reveal" style="--d:' + (i * 70) + 'ms">' +
    '<a class="pcard-media" href="product.html?id=' + p.id + '" style="background:' + p.panel + '">' +
    '<div class="pcard-render">' + nvVialSVG(p) + '</div>' +
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
