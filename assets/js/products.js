/* Nuvamin — research peptide catalogue + product imagery.
   Product photography lives in assets/img/<id>.webp.
   Prices are in USD and mirrored authoritatively in server/catalog.js.
   For laboratory research use only. */

const NV_PRODUCTS = [
  {
    id: "retatrutide",
    name: "Retatrutide",
    sub: "GLP-1 / GIP / glucagon triple agonist",
    category: "Metabolic",
    mg: "10MG",
    form: "Lyophilised powder",
    price: 58,
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
    price: 45,
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
    id: "ghk-cu-50",
    name: "GHK-Cu",
    sub: "Copper tripeptide complex",
    category: "Repair",
    mg: "50MG",
    form: "Lyophilised powder",
    price: 30,
    panel: "#EAEEF0",
    blurb:
      "The naturally occurring copper-binding tripeptide Gly-His-Lys complexed with Cu(II), widely used in skin-remodelling, wound-healing and collagen-synthesis research. Lyophilised, lot-tested, certificate of analysis in every vial.",
    research: ["Skin-remodelling studies", "Collagen-synthesis assays", "Wound-healing models"],
    specs: [
      { k: "Purity", v: "≥98% (HPLC)" },
      { k: "CAS", v: "89030-95-5" },
      { k: "Sequence", v: "Gly-His-Lys · Cu(II)" },
      { k: "Molecular formula", v: "C14H22CuN6O4" },
      { k: "Molar mass", v: "403.9 g/mol" },
      { k: "Presentation", v: "50 mg lyophilised, single vial" },
      { k: "Storage", v: "−20 °C, desiccated, protected from light" }
    ]
  },
  {
    id: "tesamorelin-10",
    name: "Tesamorelin",
    sub: "Stabilised GHRH analogue (44 aa)",
    category: "Metabolic",
    mg: "10MG",
    form: "Lyophilised powder",
    price: 62,
    panel: "#E7ECEF",
    blurb:
      "A trans-3-hexenoyl-stabilised analogue of growth-hormone-releasing hormone used in GH-axis and adipose-tissue research. Lyophilised and lot-verified, with identity confirmed by mass spectrometry on every batch.",
    research: ["GH-axis signalling", "Adipose-tissue models", "IGF-1 pathway studies"],
    specs: [
      { k: "Purity", v: "≥98% (HPLC)" },
      { k: "CAS", v: "218949-48-5" },
      { k: "Molecular formula", v: "C221H366N72O67S" },
      { k: "Molar mass", v: "5135.9 g/mol" },
      { k: "Presentation", v: "10 mg lyophilised, single vial" },
      { k: "Storage", v: "−20 °C, desiccated, protected from light" }
    ]
  },
  {
    id: "retatrutide-30",
    name: "Retatrutide",
    sub: "GLP-1 / GIP / glucagon triple agonist",
    category: "Metabolic",
    mg: "30MG",
    form: "Lyophilised powder",
    price: 115,
    panel: "#ECEFF1",
    blurb:
      "A single-chain triple agonist peptide targeting the GLP-1, GIP and glucagon receptors, supplied lyophilised for laboratory research. The 30 mg presentation for higher-throughput work. Identity and purity confirmed by independent HPLC and mass spectrometry on every lot.",
    research: ["Energy-metabolism models", "Glucose-regulation pathways", "Adipose signalling"],
    specs: [
      { k: "Purity", v: "≥99% (HPLC)" },
      { k: "CAS", v: "2381089-83-2" },
      { k: "Molecular formula", v: "C221H342N46O68" },
      { k: "Molar mass", v: "4731.4 g/mol" },
      { k: "Presentation", v: "30 mg lyophilised, single vial" },
      { k: "Storage", v: "−20 °C, desiccated, protected from light" }
    ]
  },
  {
    id: "ghk-cu-100",
    name: "GHK-Cu",
    sub: "Copper tripeptide complex",
    category: "Repair",
    mg: "100MG",
    form: "Lyophilised powder",
    price: 55,
    panel: "#EAEEF0",
    blurb:
      "The naturally occurring copper-binding tripeptide Gly-His-Lys complexed with Cu(II), widely used in skin-remodelling, wound-healing and collagen-synthesis research. The 100 mg presentation for extended protocols. Certificate of analysis in every vial.",
    research: ["Skin-remodelling studies", "Collagen-synthesis assays", "Wound-healing models"],
    specs: [
      { k: "Purity", v: "≥98% (HPLC)" },
      { k: "CAS", v: "89030-95-5" },
      { k: "Sequence", v: "Gly-His-Lys · Cu(II)" },
      { k: "Molecular formula", v: "C14H22CuN6O4" },
      { k: "Molar mass", v: "403.9 g/mol" },
      { k: "Presentation", v: "100 mg lyophilised, single vial" },
      { k: "Storage", v: "−20 °C, desiccated, protected from light" }
    ]
  },
  {
    id: "tesamorelin-20",
    name: "Tesamorelin",
    sub: "Stabilised GHRH analogue (44 aa)",
    category: "Metabolic",
    mg: "20MG",
    form: "Lyophilised powder",
    price: 100,
    panel: "#E7ECEF",
    blurb:
      "A trans-3-hexenoyl-stabilised analogue of growth-hormone-releasing hormone used in GH-axis and adipose-tissue research. The 20 mg presentation for larger study designs. Identity confirmed by mass spectrometry on every batch.",
    research: ["GH-axis signalling", "Adipose-tissue models", "IGF-1 pathway studies"],
    specs: [
      { k: "Purity", v: "≥98% (HPLC)" },
      { k: "CAS", v: "218949-48-5" },
      { k: "Molecular formula", v: "C221H366N72O67S" },
      { k: "Molar mass", v: "5135.9 g/mol" },
      { k: "Presentation", v: "20 mg lyophilised, single vial" },
      { k: "Storage", v: "−20 °C, desiccated, protected from light" }
    ]
  },
  {
    id: "bpc-157",
    name: "BPC-157",
    sub: "Body-protection compound (pentadecapeptide)",
    category: "Repair",
    mg: "10MG",
    form: "Lyophilised powder",
    price: 45,
    panel: "#EAEEF0",
    blurb:
      "A synthetic pentadecapeptide derived from a gastric protective protein, widely used in tissue-repair and gut-integrity research. Lyophilised, ≥98% pure, with a certificate of analysis in every vial.",
    research: ["Tissue-repair models", "Gut-integrity studies", "Angiogenesis research"],
    specs: [
      { k: "Purity", v: "≥98% (HPLC)" },
      { k: "CAS", v: "137525-51-0" },
      { k: "Sequence", v: "GEPPPGKPADDAGLV" },
      { k: "Molecular formula", v: "C62H98N16O22" },
      { k: "Molar mass", v: "1419.5 g/mol" },
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
    mg: "500MG",
    form: "Lyophilised powder",
    price: 70,
    panel: "#E7ECEF",
    blurb:
      "Research-grade nicotinamide adenine dinucleotide for cellular-energetics and longevity studies. Lyophilised, HPLC-verified and cold-chain shipped to protect stability in transit.",
    research: ["Cellular energetics", "Sirtuin-activity studies", "Mitochondrial research"],
    specs: [
      { k: "Purity", v: "≥99% (HPLC)" },
      { k: "CAS", v: "53-84-9" },
      { k: "Molecular formula", v: "C21H27N7O14P2" },
      { k: "Molar mass", v: "663.43 g/mol" },
      { k: "Presentation", v: "500 mg lyophilised, single vial" },
      { k: "Storage", v: "−20 °C, desiccated, protected from light" }
    ]
  }
];

/* ---------- product imagery ---------- */

function nvProductImg(p) {
  return (
    '<img class="pvial" src="assets/img/' + p.id + '.webp" ' +
    'alt="' + p.name + " " + p.mg + ' research vial" decoding="async">'
  );
}

function nvProductCard(p, i) {
  return (
    '<article class="pcard reveal" style="--d:' + (i * 70) + 'ms">' +
    '<a class="pcard-media" href="product.html?id=' + p.id + '" style="background:' + p.panel + '">' +
    '<div class="pcard-render">' + nvProductImg(p) + '</div>' +
    '<span class="pcard-tag">' + p.category + '</span>' +
    '</a>' +
    '<div class="pcard-meta">' +
    '<div class="pcard-row"><h3 class="pcard-name"><a href="product.html?id=' + p.id + '">' + p.name + " " + p.mg + '</a></h3>' +
    '<span class="pcard-price">$' + p.price.toFixed(2) + '</span></div>' +
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
