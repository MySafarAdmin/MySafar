"""Cuts the TV's two characters out of the supplied character sheet into static/tv-art.

    python3 tools/tv_art.py characters.png [out_dir]

The sheet (1536 x 1024, white background) has the boy in six poses on the top row and the girl in six on the
bottom row. Each pose is cut out along its outline, the girl's outfits are all recoloured to the pink of her wave
pose (the sheet gives her a different outfit in every pose; on the TV she is one character), white background
trapped between arms and heads is cleared, and closed-eye copies of the standing poses are made for blinking.
Everything is saved at twice the sheet's size as WebP. Needs Pillow and NumPy.

If the sheet changes, check the seed points below and the ART sizes at the top of static/tv.html (the script
prints them).
"""
import json
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# A point inside each pose on the sheet.
SEEDS = {"b-wave": (150, 300), "b-crossed": (390, 300), "b-book": (620, 350), "b-point": (850, 330),
         "b-sit": (1110, 400), "b-cheer": (1390, 300), "g-wave": (150, 820), "g-clasp": (380, 820),
         "g-books": (600, 850), "g-point": (830, 830), "g-sit": (1110, 880), "g-cheer": (1390, 800)}


def hsv(im):
    return np.asarray(im.convert("RGB").convert("HSV")).astype(float)


def flood(mask, seed, value=100):
    im = Image.fromarray(mask.astype(np.uint8) * 255).copy()
    ImageDraw.floodfill(im, seed, value)
    return np.asarray(im) == value


def cut(sheet):
    a = np.asarray(sheet).astype(int)
    h, w, _ = a.shape
    white = (a.min(axis=2) >= 238) & ((a.max(axis=2) - a.min(axis=2)) < 14)
    background = np.zeros_like(white)
    for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]:
        if white[p[1], p[0]] and not background[p[1], p[0]]:
            background |= flood(white, p)
    poses = {}
    for name, seed in SEEDS.items():
        part = flood(~background, seed)
        ys, xs = np.where(part)
        alpha = Image.fromarray(part.astype(np.uint8) * 255).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
        rgba = sheet.copy()
        rgba.putalpha(alpha)
        poses[name] = rgba.crop((xs.min() - 4, ys.min() - 4, xs.max() + 5, ys.max() + 5))
    return poses


def face_mask(im):
    """The face: the skin under the headwear, with the eyes and mouth inside it."""
    H, A = hsv(im), np.asarray(im)
    h, s = H[..., 0], H[..., 1]
    hh, ww = h.shape
    skin = (h >= 9) & (h <= 21) & (s > 110) & (A[..., 3] > 200)
    skin[int(hh * .42):] = False
    grown = np.asarray(Image.fromarray(skin.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(5))) > 0
    ys, xs = np.where(skin[:, int(ww * .35):int(ww * .65)])
    face = flood(grown, (int(np.median(xs)) + int(ww * .35), int(np.median(ys))))
    return ~flood(~face, (0, 0))


def recolour(im, ref, rules, grow=False):
    """Moves each garment in rules to the pink of ref, keeping its shading."""
    RH = hsv(ref)
    pink = (np.asarray(ref)[..., 3] > 200) & ((RH[..., 0] > 235) | (RH[..., 0] < 6)) & (RH[..., 1] > 60)
    hue, val, sat = np.median(RH[..., 0][pink]), np.median(RH[..., 2][pink]), np.median(RH[..., 1][pink])
    A = np.asarray(im).copy()
    H = hsv(im)
    h, s, v = H[..., 0], H[..., 1], H[..., 2]
    hh, ww = h.shape
    yy, xx = np.mgrid[0:hh, 0:ww]
    face = face_mask(im)
    for cond, boxes, keep_face in rules:
        m = cond(h, s, v, yy / hh) & (A[..., 3] > 0)
        if keep_face:
            m &= ~face
        for x0, y0, x1, y1 in boxes:
            m &= ~((xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1))
        if grow:  # the darker edge of a garment, next to its outline
            near = np.asarray(Image.fromarray(m.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0
            m |= near & (v < 232) & (h >= 12) & (h <= 40) & (s > 90) & ~face
        nv = np.clip(val + (v[m] - np.median(v[m])) * 0.5, 0, 255)
        ns = np.clip(sat + (s[m] - np.median(s[m])) * 0.3, 0, 255)
        new = np.stack([np.full(nv.shape, hue), ns, nv], -1).astype(np.uint8)[None]
        A[m, :3] = np.asarray(Image.fromarray(new, "HSV").convert("RGB"))[0]
    return Image.fromarray(A)


def clear_pockets(im):
    """White background enclosed by an arm is made transparent (not the eyes, shoes or book pages)."""
    A = np.asarray(im).copy()
    rgb = A[..., :3].astype(int)
    white = (rgb.min(-1) >= 244) & ((rgb.max(-1) - rgb.min(-1)) < 10) & (A[..., 3] > 0)
    face, done = face_mask(im), np.zeros_like(white)
    for y, x in zip(*np.where(white)):
        if done[y, x]:
            continue
        part = flood(white, (int(x), int(y)))
        done |= part
        if part.sum() > 40 and np.where(part)[0].max() < A.shape[0] * 0.85 and not face[part].any():
            A[part, 3] = 0
    return Image.fromarray(A)


def blink(im):
    """The same pose with closed, smiling eyes."""
    A = np.asarray(im)
    H = hsv(im)
    dark = (H[..., 2] < 70) & face_mask(im) & (A[..., 3] > 200)
    parts, done = [], np.zeros_like(dark)
    for y, x in zip(*np.where(dark)):
        if done[y, x]:
            continue
        part = flood(dark, (int(x), int(y)))
        done |= part
        ys, xs = np.where(part)
        if part.sum() > 120 and 0.55 < (xs.max() - xs.min() + 1) / (ys.max() - ys.min() + 1) < 1.6:
            parts.append((part.sum(), xs.min(), ys.min(), xs.max(), ys.max()))
    eyes = min(combinations(parts, 2),
               key=lambda p: abs(p[0][2] - p[1][2]) + abs(p[0][0] - p[1][0]) * 0.05 - min(p[0][0], p[1][0]) * 0.02)
    patch, mask = im.copy(), Image.new("L", im.size, 0)
    draw, dm, lids = ImageDraw.Draw(patch), ImageDraw.Draw(mask), []
    for _, x0, y0, x1, y1 in sorted(eyes, key=lambda e: e[1]):
        w, h, cx, cy = x1 - x0, y1 - y0, (x0 + x1) / 2, (y0 + y1) / 2
        skin = tuple(int(c) for c in np.median(A[int(y1 + h * .5):int(y1 + h * .8), int(cx - w * .3):int(cx + w * .3), :3].reshape(-1, 3), axis=0))
        box = (cx - w, cy - h * .95, cx + w, cy + h * .85)
        draw.ellipse(box, fill=skin + (255,))
        dm.ellipse(box, fill=255)
        lids.append((cx, cy, w, h, max(2, int(h * .16))))
    k = (np.asarray(mask.filter(ImageFilter.GaussianBlur(2.2))) / 255.0)[..., None]
    out = np.asarray(im).astype(float)
    out[..., :3] = out[..., :3] * (1 - k) + np.asarray(patch).astype(float)[..., :3] * k
    out = Image.fromarray(out.astype(np.uint8))
    d = ImageDraw.Draw(out)
    for cx, cy, w, h, lw in lids:
        d.arc((cx - w * .66, cy - h * .3, cx + w * .66, cy + h * .6), 195, 345, fill=(45, 25, 16, 255), width=lw)
    return out


def main(sheet_path, out_dir="static/tv-art"):
    poses = cut(Image.open(sheet_path).convert("RGB"))
    ref = poses["g-wave"]
    purple = lambda h, s, v, y: (h > 170) & (h < 235) & (s > 40)  # noqa: E731
    blue = lambda h, s, v, y: (h > 135) & (h < 175) & (s > 60)  # noqa: E731
    sage = lambda h, s, v, y: (h > 70) & (h < 120) & (s > 20) & ~((s > 78) & (v < 128))  # noqa: E731 (not the dark green book)
    cream = lambda h, s, v, y: (h >= 8) & (h <= 40) & (s >= 20) & (s < 125) & (v > 170) & (y < 0.62)  # noqa: E731
    yellow = lambda h, s, v, y: (h >= 21.5) & (h <= 42) & (s > 100)  # noqa: E731
    poses["g-clasp"] = recolour(poses["g-clasp"], ref, [(purple, [], False)])
    poses["g-point"] = recolour(poses["g-point"], ref, [(blue, [], False)])
    poses["g-books"] = recolour(poses["g-books"], ref, [(sage, [], False), (cream, [(74, 180, 182, 268)], True)])
    poses["g-cheer"] = recolour(poses["g-cheer"], ref, [(yellow, [], True), (cream, [], True)], grow=True)
    poses = {name: clear_pockets(im) for name, im in poses.items()}
    for name in ("b-crossed", "g-clasp", "b-wave", "g-wave"):
        poses[name + "-blink"] = blink(poses[name])
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    art = {}
    for name, im in sorted(poses.items()):
        im.resize((im.width * 2, im.height * 2), Image.LANCZOS).save(out / f"{name}.webp", "WEBP", quality=88, method=6, alpha_quality=95)
        # Size on the sheet, the middle of the feet across the image, and the gap below them.
        solid = np.asarray(im)[..., 3] > 128
        rows = np.where(solid.any(1))[0]
        band = solid[int(rows.max() - (rows.max() - rows.min()) * 0.22):rows.max() + 1]
        cols = np.where(band.any(0))[0]
        art[name] = [im.width, im.height, round((cols.min() + cols.max()) / 2 / im.width, 3),
                     round((im.height - 1 - rows.max()) / im.height, 3)]
    print("var ART=" + json.dumps(art, separators=(",", ":")) + ";")


if __name__ == "__main__":
    main(*sys.argv[1:])
