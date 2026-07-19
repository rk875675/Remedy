"""Crop generated 1536x1024 concept renders to proper 1024x1024 App Store icons,
strip alpha, and render small-scale previews (with iOS squircle mask) to check
how they read at real home-screen size."""

import os
from PIL import Image, ImageDraw

SRC_DIR = r"C:\Users\rkuma\.cursor\projects\c-Users-rkuma-remedy\assets"
OUT_DIR = r"C:\Users\rkuma\Downloads\Remedy\ICONS\refined"
os.makedirs(OUT_DIR, exist_ok=True)

FILES = {
    "glow": "remedy_icon_concept_glow.png",
    "embrace": "remedy_icon_concept_embrace.png",
    "mended": "remedy_icon_concept_mended.png",
}


def squircle_mask(size, corner_radius_ratio=0.2237):
    """Approximate iOS icon squircle mask (superellipse-ish via rounded rect)."""
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    r = int(size * corner_radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return mask


for name, fname in FILES.items():
    src_path = os.path.join(SRC_DIR, fname)
    img = Image.open(src_path).convert("RGB")  # ensure no alpha
    w, h = img.size
    # center-crop to square using the shorter dimension
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = img.crop((left, top, left + side, top + side))
    square = cropped.resize((1024, 1024), Image.LANCZOS)

    out_path = os.path.join(OUT_DIR, f"remedy_icon_{name}_1024.png")
    square.save(out_path, "PNG")
    print(f"Saved {out_path} size={square.size} mode={square.mode}")

    # small preview at 180px (iOS home screen @3x for 60pt icon) with squircle mask,
    # composited onto a neutral wallpaper-ish gray to simulate home screen
    preview_bg = Image.new("RGB", (400, 400), (60, 60, 65))
    icon_180 = square.resize((180, 180), Image.LANCZOS)
    mask = squircle_mask(180)
    preview_bg.paste(icon_180, (110, 60), mask)
    preview_path = os.path.join(OUT_DIR, f"remedy_icon_{name}_preview.png")
    preview_bg.save(preview_path, "PNG")
    print(f"Saved {preview_path}")
