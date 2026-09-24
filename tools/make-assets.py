#!/usr/bin/env python3
"""Generate Nuvamin product imagery from assets/js/products.js.

For every product this writes:
  assets/img/<id>.webp               the labelled Nuvamin 2R vial (RGBA)
  assets/img/structures/<id>.svg     a skeletal structure drawing for the PDP

The vial starts from tools/vial-blank.png (the studio vial with an empty label
and the vertical NUVAMIN wordmark). Label artwork is drawn flat, supersampled,
then wrapped onto the vial's curvature and lit with the label's own shading.

Requirements: python3 -m pip install pillow numpy rdkit fonttools brotli
Usage:        python3 tools/make-assets.py [product-id ...]
"""

import io
import json
import os
import subprocess
import sys
import tempfile

import numpy as np
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit.Chem.Draw import rdMolDraw2D

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "img")
STRUCT = os.path.join(IMG, "structures")

# Skeletal structures (neutral forms; salts are named in the product data).
SMILES = {
    "nadh": "NC(=O)C1=CN(C=CC1)[C@@H]1O[C@H](COP(O)(=O)OP(O)(=O)OC[C@H]2O[C@H]([C@H](O)[C@@H]2O)n2cnc3c(N)ncnc23)[C@@H](O)[C@H]1O",
    "glutathione": "N[C@@H](CCC(=O)N[C@@H](CS)C(=O)NCC(O)=O)C(O)=O",
    "coq10": "COC1=C(OC)C(=O)C(C/C=C(\\C)CC/C=C(\\C)CC/C=C(\\C)CC/C=C(\\C)CC/C=C(\\C)CC/C=C(\\C)CC/C=C(\\C)CC/C=C(\\C)CC/C=C(\\C)CCC=C(C)C)=C(C)C1=O",
    "lipoic-acid": "OC(=O)CCCCC1CCSS1",
    "riboflavin": "Cc1cc2nc3c(=O)[nH]c(=O)nc-3n(C[C@H](O)[C@H](O)[C@H](O)CO)c2cc1C",
    "inositol": "O[C@H]1[C@H](O)[C@@H](O)[C@H](O)[C@H](O)[C@@H]1O",
    "carnitine": "C[N+](C)(C)C[C@@H](O)CC([O-])=O",
    "taurine": "NCCS(O)(=O)=O",
    "creatine": "CN(CC(O)=O)C(N)=N",
    "caffeine": "Cn1cnc2c1c(=O)n(C)c(=O)n2C",
    "nicotinamide": "NC(=O)c1cccnc1",
    "tyrosine": "N[C@@H](Cc1ccc(O)cc1)C(O)=O",
    "tryptophan": "N[C@@H](Cc1c[nH]c2ccccc12)C(O)=O",
    "atp": "Nc1ncnc2n(cnc12)[C@@H]1O[C@H](COP(O)(=O)OP(O)(=O)OP(O)(O)=O)[C@@H](O)[C@H]1O",
    "camp": "Nc1ncnc2n(cnc12)[C@@H]1O[C@@H]2COP(O)(=O)O[C@H]2[C@H]1O",
    "nad": "NC(=O)c1ccc[n+](c1)[C@@H]1O[C@H](COP([O-])(=O)OP(O)(=O)OC[C@H]2O[C@H]([C@H](O)[C@@H]2O)n2cnc3c(N)ncnc23)[C@@H](O)[C@H]1O",
    "fad": "Cc1cc2nc3c(=O)[nH]c(=O)nc-3n(C[C@H](O)[C@H](O)[C@H](O)COP(O)(=O)OP(O)(=O)OC[C@H]3O[C@H]([C@H](O)[C@@H]3O)n3cnc4c(N)ncnc34)c2cc1C",
    "nadp": "NC(=O)c1ccc[n+](c1)[C@@H]1O[C@H](COP([O-])(=O)OP(O)(=O)OC[C@H]2O[C@H]([C@H](OP(O)(O)=O)[C@@H]2O)n2cnc3c(N)ncnc23)[C@@H](O)[C@H]1O",
    "theophylline": "Cn1c2nc[nH]c2c(=O)n(C)c1=O",
    "pyruvate": "CC(=O)C(=O)[O-].[Na+]",
    "phenylalanine": "N[C@@H](Cc1ccccc1)C(O)=O",
    "adp": "Nc1ncnc2n(cnc12)[C@@H]1O[C@H](COP(O)(=O)OP(O)(O)=O)[C@@H](O)[C@H]1O",
    "amp": "Nc1ncnc2n(cnc12)[C@@H]1O[C@H](COP(O)(O)=O)[C@@H](O)[C@H]1O",
    "gssg": "N[C@@H](CCC(=O)N[C@@H](CSSC[C@H](NC(=O)CC[C@H](N)C(O)=O)C(=O)NCC(O)=O)C(=O)NCC(O)=O)C(O)=O",
}

# Reference panels: (structure ids, legends)
PANELS = {
    "nvm-204": (["atp", "adp", "amp", "camp"], ["ATP", "ADP", "AMP", "cAMP"]),
    "nvm-101": (["nad", "nadh", "fad"], ["NAD+", "NADH", "FAD"]),
    "nvm-317": (["phenylalanine", "tyrosine", "tryptophan"], ["L-Phe", "L-Tyr", "L-Trp"]),
    "nvm-402": (["glutathione", "gssg"], ["GSH", "GSSG"]),
}

# ---------------------------------------------------------------- data + fonts


def load_catalogue():
    js = (
        "const fs=require('fs');"
        "eval(fs.readFileSync(process.argv[1],'utf8')+';globalThis.P=NV_PRODUCTS;globalThis.F=NV_FAMILIES;');"
        "process.stdout.write(JSON.stringify({products:P,families:F}));"
    )
    out = subprocess.check_output(["node", "-e", js, os.path.join(ROOT, "assets/js/products.js")])
    return json.loads(out)


_font_dir = tempfile.mkdtemp(prefix="nv-fonts-")


def font(name, size):
    """Load a site font (variable woff2) pinned to the weight in its file name."""
    ttf = os.path.join(_font_dir, name + ".ttf")
    if not os.path.exists(ttf):
        t = TTFont(os.path.join(ROOT, "assets/fonts", name + ".woff2"))
        t.flavor = None
        t.save(ttf)
    f = ImageFont.truetype(ttf, size)
    weight = int(name.rsplit("-", 1)[1])
    f.set_variation_by_axes([weight])        # Inter + Space Grotesk: wght only
    return f


# ---------------------------------------------------------------- label art

SS = 3                      # supersampling factor for label artwork
BLANK = Image.open(os.path.join(ROOT, "tools/vial-blank.png")).convert("RGBA")
W, H = BLANK.size
BASE = np.asarray(BLANK).astype(float)
LABEL_Y0, LABEL_Y1 = 336, 797          # printable label rows
CX, R = 218.5, 192.0                   # vial axis + radius (px) for the wrap
TEXT_X = 64                            # left margin of label copy (flat px)
INK = (22, 26, 29)
SLATE = (69, 90, 100)


def draw_tracked(d, xy, text, fnt, fill, tracking=0.0):
    """Draw text with letter-spacing (tracking in em)."""
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=fnt, fill=fill, anchor="ls")
        x += fnt.getlength(ch) + tracking * fnt.size
    return x


def tracked_width(text, fnt, tracking):
    return sum(fnt.getlength(c) for c in text) + tracking * fnt.size * max(0, len(text) - 1)


def structure_png(mol_ids, px_w, px_h):
    """Faint line-art structure for the label (first molecule only)."""
    mol = Chem.MolFromSmiles(SMILES[mol_ids[0]])
    d = rdMolDraw2D.MolDraw2DCairo(px_w, px_h)
    o = d.drawOptions()
    o.clearBackground = False
    o.useBWAtomPalette()
    o.bondLineWidth = 2
    o.padding = 0.04
    o.minFontSize = 18
    o.maxFontSize = 22
    d.DrawMolecule(mol)
    d.FinishDrawing()
    return Image.open(io.BytesIO(d.GetDrawingText())).convert("RGBA")


def label_layer(p, fam):
    """Flat RGBA artwork for the label area (full vial canvas size, supersampled)."""
    S = SS
    art = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)

    # faint structure drawing, lower right (where the old wave art sat)
    mol_ids = PANELS[p["id"]][0] if p["id"] in PANELS else [p["id"]]
    sw, sh = 200 * S, 190 * S
    st = structure_png(mol_ids, sw, sh)
    a = np.asarray(st).astype(float)
    ink = (255 - a[..., :3].mean(-1)) / 255.0 * (a[..., 3] / 255.0)
    tint = np.zeros((sh, sw, 4), np.uint8)
    tint[..., :3] = (96, 110, 120)
    tint[..., 3] = np.clip(ink * 0.26 * 255, 0, 255).astype(np.uint8)
    art.alpha_composite(Image.fromarray(tint, "RGBA"), (int(138 * S), int(596 * S)))

    ref = p["family"] == "reference"
    # code line
    f_code = font("SpaceGrotesk-500", int(14.5 * S))
    top = "REFERENCE MATERIAL" if ref else p["code"]
    draw_tracked(d, (TEXT_X * S, 452 * S), top, f_code, SLATE + (255,), 0.16)

    # product name, auto-fit
    maxw = 226 * S                        # keeps clear of the NUVAMIN wordmark
    size = 40
    while size > 22:
        f_name = font("Inter-600", int(size * S))
        if f_name.getlength(p["name"]) <= maxw:
            break
        size -= 1
    d.text((TEXT_X * S, 512 * S), p["name"], font=f_name, fill=INK + (255,), anchor="ls")
    y = 512
    if p.get("labelSub"):
        f_sub = font("Inter-400", int(16 * S))
        d.text((TEXT_X * S, 540 * S), p["labelSub"], font=f_sub, fill=INK + (225,), anchor="ls")
        y = 540

    # quantity pill
    f_q = font("Inter-500", int(16.5 * S))
    q = p["mg"]
    qw = f_q.getlength(q)
    px0, py0 = TEXT_X * S, (y + 22) * S
    pill = (px0, py0, px0 + qw + 22 * S, py0 + 31 * S)
    d.rounded_rectangle(pill, radius=6 * S, outline=INK + (255,), width=int(1.9 * S))
    d.text((px0 + 11 * S, py0 + 21.5 * S), q, font=f_q, fill=INK + (255,), anchor="ls")

    # grade + lot
    f_g = font("Inter-400", int(15 * S))
    d.text((TEXT_X * S, 718 * S), p["grade"], font=f_g, fill=INK + (240,), anchor="ls")
    f_l = font("SpaceGrotesk-400", int(11 * S))
    draw_tracked(d, (TEXT_X * S, 742 * S), "LOT " + p["lot"], f_l, SLATE + (235,), 0.14)
    return art


def band_layer(p, fam):
    """Colour-coded family band across the top of the label (output space)."""
    S = SS
    art = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(art)
    col = tuple(int(fam["color"][i:i + 2], 16) for i in (1, 3, 5))
    d.rectangle((0, 341 * S, W * S, 361 * S), fill=col + (255,))
    f_b = font("SpaceGrotesk-500", int(9.5 * S))
    draw_tracked(d, (TEXT_X * S, 354.5 * S), fam["long"].upper(), f_b, (255, 255, 255, 235), 0.24)
    code = p["code"]
    f_c = font("SpaceGrotesk-500", int(9.5 * S))
    cw = tracked_width(code, f_c, 0.2)
    draw_tracked(d, (322 * S - cw, 354.5 * S), code, f_c, (255, 255, 255, 235), 0.2)
    return art


def wrap(layer):
    """Downsample and wrap flat artwork onto the cylinder (horizontal only)."""
    flat = np.asarray(layer.resize((W, H), Image.LANCZOS)).astype(float)
    xs = np.arange(W, dtype=float)
    t = np.clip((xs - CX) / R, -0.999, 0.999)
    u = CX + R * np.arcsin(t)             # output column -> flat column
    out = np.zeros_like(flat)
    i0 = np.clip(np.floor(u).astype(int), 0, W - 2)
    fr = (u - i0)[None, :, None]
    # premultiplied interpolation keeps edges clean
    pm = flat.copy()
    pm[..., :3] *= pm[..., 3:4] / 255.0
    samp = pm[:, i0] * (1 - fr) + pm[:, i0 + 1] * fr
    a = samp[..., 3:4]
    out[..., :3] = np.where(a > 0, samp[..., :3] / np.maximum(a, 1e-6) * 255.0, 0)
    out[..., 3:4] = a
    return out


def compose(p, fam):
    base = BASE.copy()
    rgb, alpha = base[..., :3], base[..., 3]
    lum = rgb.mean(-1, keepdims=True)
    light = np.clip(lum / 249.0, 0.7, 1.03)            # label's own lighting

    band = np.asarray(band_layer(p, fam).resize((W, H), Image.LANCZOS)).astype(float)
    # clip the band to the label's visible extent (where the label is bright)
    rows = slice(LABEL_Y0, LABEL_Y1)
    mask = np.zeros((H, W, 1))
    mask[rows] = ((lum[rows] > 200) & (alpha[rows, :, None] > 250)).astype(float)
    mask = np.asarray(Image.fromarray((mask[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))).astype(float)[..., None] / 255.0

    art = wrap(label_layer(p, fam))
    art_img = Image.fromarray(np.clip(art, 0, 255).astype(np.uint8), "RGBA").filter(ImageFilter.GaussianBlur(0.35))
    art = np.asarray(art_img).astype(float)

    out = rgb.copy()
    for layer, m in ((band, mask), (art, mask)):
        a = layer[..., 3:4] / 255.0 * m
        col = layer[..., :3] * light
        out = out * (1 - a) + col * a
    res = np.dstack([np.clip(out, 0, 255), alpha]).astype(np.uint8)
    return Image.fromarray(res, "RGBA")


# ---------------------------------------------------------------- structures (PDP)


def structure_svg(pid):
    opts = rdMolDraw2D.MolDrawOptions()
    if pid in PANELS:
        ids, legends = PANELS[pid]
        mols = [Chem.MolFromSmiles(SMILES[i]) for i in ids]
        per_row = 2
        rows = (len(mols) + per_row - 1) // per_row
        d = rdMolDraw2D.MolDraw2DSVG(per_row * 360, rows * 300, 360, 300)
        _style(d.drawOptions())
        d.DrawMolecules(mols, legends=legends)
    else:
        mol = Chem.MolFromSmiles(SMILES[pid])
        # size the canvas to the molecule's own proportions so wide
        # dinucleotides don't float in empty space
        AllChem.Compute2DCoords(mol)
        pos = mol.GetConformer().GetPositions()
        span_x = max(pos[:, 0].max() - pos[:, 0].min(), 1.0)
        span_y = max(pos[:, 1].max() - pos[:, 1].min(), 1.0)
        w = 720
        h = int(min(460, max(240, w * (span_y + 2.2) / (span_x + 2.2))))
        d = rdMolDraw2D.MolDraw2DSVG(w, h)
        _style(d.drawOptions())
        d.DrawMolecule(mol)
    d.FinishDrawing()
    svg = d.GetDrawingText()
    svg = svg.replace("<?xml version='1.0' encoding='iso-8859-1'?>\n", "")
    svg = svg.replace("#000000", "#263238").replace("#FFFFFF", "none")
    return svg


def _style(o):
    o.clearBackground = False
    o.useBWAtomPalette()
    o.bondLineWidth = 1.6
    o.padding = 0.08
    o.legendFontSize = 20
    o.legendFraction = 0.12
    o.minFontSize = 13
    o.maxFontSize = 16


# ---------------------------------------------------------------- main


def main():
    data = load_catalogue()
    fams = data["families"]
    only = set(sys.argv[1:])
    os.makedirs(STRUCT, exist_ok=True)
    for p in data["products"]:
        if only and p["id"] not in only:
            continue
        vial = compose(p, fams[p["family"]])
        vial.save(os.path.join(IMG, p["id"] + ".webp"), "WEBP", quality=88, method=6)
        with open(os.path.join(STRUCT, p["id"] + ".svg"), "w") as fh:
            fh.write(structure_svg(p["id"]))
        print("wrote", p["id"])


if __name__ == "__main__":
    main()
