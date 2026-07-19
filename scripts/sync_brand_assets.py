"""Generate all Remedy brand assets from a single source logo.

Replace assets/brand/logo.png (1024x1024, square, full-bleed, no alpha),
then run:

    npm run sync:brand

Outputs:
  - assets/icon.png
  - assets/splash-icon.png
  - assets/favicon.png
  - assets/android-icon-background.png
  - assets/android-icon-foreground.png
  - assets/android-icon-monochrome.png
  - assets/brand/meta.json  (backgroundColor for app.json + lib/brand.ts)
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BRAND_DIR = ROOT / "assets" / "brand"
ASSETS_DIR = ROOT / "assets"
SOURCE = BRAND_DIR / "logo.png"
META_PATH = BRAND_DIR / "meta.json"
APP_JSON = ROOT / "app.json"


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return f"#{rgb[0]:02x}{rgb[1]:02x}{rgb[2]:02x}"


def sample_background_color(img_rgb: Image.Image) -> tuple[int, int, int]:
    arr = np.array(img_rgb)
    samples = [
        arr[2, 2],
        arr[2, -3],
        arr[-3, 2],
        arr[-3, -3],
    ]
    return tuple(int(v) for v in np.median(samples, axis=0).astype(int))


def make_foreground(img_rgb: Image.Image, bg_rgb: tuple[int, int, int], tolerance: int = 22) -> Image.Image:
    arr = np.array(img_rgb).astype(int)
    bg = np.array(bg_rgb, dtype=int)
    diff = np.abs(arr - bg).sum(axis=2)
    mask = diff > tolerance
    rgba = np.zeros((*arr.shape[:2], 4), dtype=np.uint8)
    rgba[..., :3] = arr.astype(np.uint8)
    rgba[..., 3] = np.where(mask, 255, 0).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def fit_in_safe_zone(mark: Image.Image, canvas_size: int = 1024, safe_frac: float = 0.66) -> Image.Image:
    bbox = mark.getbbox()
    if not bbox:
        raise RuntimeError("Foreground mark is empty")
    cropped = mark.crop(bbox)
    safe = int(canvas_size * safe_frac)
    w, h = cropped.size
    scale = min(safe / w, safe / h)
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    resized = cropped.resize((new_w, new_h), Image.LANCZOS)
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    x = (canvas_size - new_w) // 2
    y = (canvas_size - new_h) // 2
    canvas.paste(resized, (x, y), resized)
    return canvas


def make_monochrome(foreground: Image.Image) -> Image.Image:
    arr = np.array(foreground)
    alpha = arr[..., 3]
    mono = np.zeros((foreground.height, foreground.width, 4), dtype=np.uint8)
    mono[..., 3] = alpha
    return Image.fromarray(mono, "RGBA")


def write_meta(bg_hex: str) -> None:
    BRAND_DIR.mkdir(parents=True, exist_ok=True)
    META_PATH.write_text(json.dumps({"backgroundColor": bg_hex}, indent=2) + "\n", encoding="utf-8")
    print(f"Saved -> {META_PATH}")


def patch_app_json(bg_hex: str) -> None:
    data = json.loads(APP_JSON.read_text(encoding="utf-8"))
    expo = data.setdefault("expo", {})
    splash = expo.setdefault("splash", {})
    splash["backgroundColor"] = bg_hex
    android = expo.setdefault("android", {})
    adaptive = android.setdefault("adaptiveIcon", {})
    adaptive["backgroundColor"] = bg_hex
    APP_JSON.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"Updated splash + android adaptive backgroundColor in {APP_JSON}")


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Missing source logo: {SOURCE}")

    src = Image.open(SOURCE).convert("RGB")
    w, h = src.size
    if w != h:
        side = min(w, h)
        left = (w - side) // 2
        top = (h - side) // 2
        src = src.crop((left, top, left + side, top + side))
        print(f"Center-cropped source to {src.size}")

    if src.size != (1024, 1024):
        src = src.resize((1024, 1024), Image.LANCZOS)
        print(f"Resized source to {src.size}")

    bg_rgb = sample_background_color(src)
    bg_hex = rgb_to_hex(bg_rgb)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    icon_path = ASSETS_DIR / "icon.png"
    src.save(icon_path, "PNG")
    print(f"Saved -> {icon_path}")

    bg_path = ASSETS_DIR / "android-icon-background.png"
    Image.new("RGB", (1024, 1024), bg_rgb).save(bg_path, "PNG")
    print(f"Saved -> {bg_path}")

    fg = make_foreground(src, bg_rgb)
    fg_safe = fit_in_safe_zone(fg)
    fg_path = ASSETS_DIR / "android-icon-foreground.png"
    fg_safe.save(fg_path, "PNG")
    print(f"Saved -> {fg_path}")

    mono_path = ASSETS_DIR / "android-icon-monochrome.png"
    make_monochrome(fg_safe).save(mono_path, "PNG")
    print(f"Saved -> {mono_path}")

    favicon_path = ASSETS_DIR / "favicon.png"
    src.resize((48, 48), Image.LANCZOS).save(favicon_path, "PNG")
    print(f"Saved -> {favicon_path}")

    splash_path = ASSETS_DIR / "splash-icon.png"
    src.resize((512, 512), Image.LANCZOS).save(splash_path, "PNG")
    print(f"Saved -> {splash_path}")

    write_meta(bg_hex)
    patch_app_json(bg_hex)
    print(f"backgroundColor={bg_hex}")


if __name__ == "__main__":
    main()
