# Nuvamin

Premium supplement ecommerce storefront. Editorial, minimal, evidence-led.

## Stack

Static site — no build step, no dependencies. HTML + CSS + vanilla JS with
self-hosted fonts (Space Grotesk, Fraunces, Inter) and inline SVG product
renders.

## Pages

| Page | Purpose |
| --- | --- |
| `index.html` | Homepage: hero, featured products, Why Nuvamin, ingredient story, lifestyle, reviews, newsletter |
| `shop.html` | Full catalogue with category filters |
| `product.html?id=<id>` | Product detail: formula table, accordions, quantity + add to cart, related products |
| `about.html` | Standards, process, founder note |
| `journal.html` | Editorial articles |
| `contact.html` | Contact form, shipping/returns/certificate info |
| `cart.html` | Cart (localStorage) with shipping threshold and summary |

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Product data lives in `assets/js/products.js`; shared behaviour (header/footer
partials, cart store, scroll reveals, accordions) in `assets/js/main.js`;
all styling in `assets/css/style.css`.

Palette: `#DFDCD5` · `#B25B32` · `#55524B` · `#E9E6E0` · `#0D0D0D`
