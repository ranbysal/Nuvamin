# Nuvamin

**Precision materials for biological research** - a concept storefront and design
study for a fictional life-science materials brand. Reference compounds,
analytical standards and molecular reagents, every one shipped in the same
Nuvamin 2R vial and identified by a permanent NVM code.

The store is fully browsable: add materials to the cart, fill in delivery
details and place an order. Checkout is **simulated** - the order is priced in
the browser and lands on a confirmation page marked *Mock*. Nothing is charged,
stored on a server or shipped.

## Stack

Static HTML + CSS + vanilla JS. No build step, no backend, no dependencies.
Self-hosted fonts (Space Grotesk, Fraunces, Inter), GSAP for the pinned
"Inside the lab" sequence.

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Hero vial, featured materials, verification story, lab sequence, the 2R vial system |
| `shop.html` | The library: family filters (deep-linkable, e.g. `shop.html#analytical`) and a grid / index view |
| `product.html?id=<id>` | Material detail: key figures, structure drawing, specification, handling, add to cart |
| `coa.html?id=<id>` | Printable specimen certificate of analysis for the current lot |
| `cart.html` | Cart, delivery details, discount code (`LOT10`), **Place order** |
| `confirmation.html` | Mock order confirmation (reads the order from session storage) |
| `faq.html` | Ordering, grades, certificates, shipping and support |
| `about.html` / `contact.html` | Company story and standards / contact form |
| `privacy.html` / `terms.html` / `shipping-returns.html` | Policies |
| `404.html`, `robots.txt`, `sitemap.xml` | Site furniture |

## The catalogue

All product data lives in `assets/js/products.js` - five families
(reference, cellular, molecular, analytical, metabolic), 24 materials. Shared
behaviour (header, footer, cart store, motion) is in `assets/js/main.js`;
all styling in `assets/css/style.css`.

Real compounds use their real CAS numbers, formulas and molar masses
(formulas and masses verified with RDKit). The NVM-1xx+ reference panels,
lot numbers and certificate results are illustrative.

### Regenerating product imagery

Vial photographs and structure drawings are generated from the catalogue:

```sh
python3 -m pip install pillow numpy rdkit fonttools brotli
npm run assets                      # all products
python3 tools/make-assets.py nad    # just one
```

`tools/make-assets.py` starts from `tools/vial-blank.png` (the studio vial with
an empty label), draws the label - family colour band, NVM code, name, format,
grade, lot and a faint structure - wraps it onto the vial's curvature, and
writes `assets/img/<id>.webp` plus `assets/img/structures/<id>.svg`.

To add a material: add an entry to `products.js`, add its SMILES to `SMILES`
in the tool, and run it.

## Run locally

```sh
npm start        # http://localhost:3000
```

## Deploy

Any static host. On Vercel, import the repo with the *Other* preset - the
included `vercel.json` only enables clean URLs.

Palette (Elegant Shadows): `#FFFFFF` · `#B0BEC5` · `#78909C` · `#455A64` · `#000000`,
plus five muted family bands: sage `#6F8F86`, sand `#B39164`, steel `#5B7593`,
mauve `#8A7898`, graphite `#22272B`.
