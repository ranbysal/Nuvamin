/* Nuvamin — research peptide catalogue + product imagery.
   Product photography lives in assets/img/<id>.webp.
   For laboratory research use only. */

const NV_PRODUCTS = [
  {
    id: "retatrutide",
    name: "Retatrutide",
    sub: "GLP-1 / GIP / glucagon triple agonist",
    category: "Metabolic",
    mg: "10MG",
    form: "Lyophilised powder",
    price: 135,
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
    id: "bpc-157",
    name: "BPC-157",
    sub: "Body-protection compound (pentadecapeptide)",
    category: "Repair",
    mg: "10MG",
    form: "Lyophilised powder",
    price: 60,
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
    mg: "5MG",
    form: "Lyophilised powder",
    price: 65,
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
    '<div class="pcard-row"><h3 class="pcard-name"><a href="product.html?id=' + p.id + '">' + p.name + '</a></h3>' +
    '<span class="pcard-price">&euro;' + p.price.toFixed(2) + '</span></div>' +
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
