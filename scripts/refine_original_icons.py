"""Faithful refinement of the user's ORIGINAL 3 spine icons.

No redesign, no new concepts. Same exact artwork/composition, just:
  1. Find the actual spine mark and crop tighter so it fills the frame
     properly (App Store icons should not have a mark floating in a sea
     of background - that's part of what read as "cheap").
  2. Export as a true 1024x1024, flat, no-alpha, App Store spec PNG.
  3. Very light punch-up (contrast/saturation/sharpen) so colors feel
     richer/more premium instead of washed out - no new shapes, no glow,
     no 3D, no gradients added.
"""

import os
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw
from scipy import ndimage

SRC_DIR = r"C:\Users\rkuma\.cursor\projects\c-Users-rkuma-remedy\assets"
OUT_DIR = r"C:\Users\rkuma\Downloads\Remedy\ICONS\animated"
os.makedirs(OUT_DIR, exist_ok=True)

FILES = ["remedy_icon_animated_v1.png", "remedy_icon_animated_v2.png"]

# how much of the final 1024 frame the mark's bounding box should occupy
TARGET_FILL = 0.82


def find_bbox(img_rgb: Image.Image, bg_tolerance=20, min_component_frac=0.01):
    arr = np.array(img_rgb).astype(int)
    bg = arr[2, 2].astype(int)  # sample a definite background pixel
    diff = np.abs(arr - bg).sum(axis=2)
    mask = diff > bg_tolerance

    # the spine mark can be several disconnected shapes (gaps between
    # vertebrae), so keep every component big enough to be real artwork
    # and drop only tiny stray noise specks (e.g. compression artifacts)
    labeled, num = ndimage.label(mask)
    if num == 0:
        return None
    sizes = ndimage.sum(mask, labeled, range(1, num + 1))
    min_size = mask.sum() * 0.01  # drop components smaller than 1% of all foreground pixels
    keep_labels = [i + 1 for i, s in enumerate(sizes) if s >= min_size]
    clean_mask = np.isin(labeled, keep_labels)

    ys, xs = np.where(clean_mask)
    return xs.min(), ys.min(), xs.max(), ys.max()


def squircle_mask(size, corner_radius_ratio=0.2237):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    r = int(size * corner_radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return mask


for fname in FILES:
    name = os.path.splitext(fname)[0]
    img = Image.open(os.path.join(SRC_DIR, fname)).convert("RGB")
    w, h = img.size

    bbox = find_bbox(img)
    x0, y0, x1, y1 = bbox
    mark_w, mark_h = x1 - x0, y1 - y0
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2

    # square crop side so that the mark's longer dimension fills TARGET_FILL of it
    mark_long = max(mark_w, mark_h)
    crop_side = mark_long / TARGET_FILL

    half = crop_side / 2
    left = cx - half
    top = cy - half
    right = cx + half
    bottom = cy + half

    # clamp to image bounds, shifting the window if needed (don't shrink it,
    # to avoid changing the fill ratio - pad with background color instead)
    pad_left = max(0, -left)
    pad_top = max(0, -top)
    pad_right = max(0, right - w)
    pad_bottom = max(0, bottom - h)

    if pad_left or pad_top or pad_right or pad_bottom:
        bg_color = tuple(img.getpixel((2, 2)))
        new_w = w + int(pad_left) + int(pad_right)
        new_h = h + int(pad_top) + int(pad_bottom)
        padded = Image.new("RGB", (new_w, new_h), bg_color)
        padded.paste(img, (int(pad_left), int(pad_top)))
        img = padded
        left += pad_left
        top += pad_top
        right += pad_left
        bottom += pad_top

    crop = img.crop((int(round(left)), int(round(top)), int(round(left + crop_side)), int(round(top + crop_side))))
    square = crop.resize((1024, 1024), Image.LANCZOS)

    # light, tasteful punch-up only - no new elements
    square = ImageEnhance.Contrast(square).enhance(1.08)
    square = ImageEnhance.Color(square).enhance(1.12)
    square = square.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))

    out_path = os.path.join(OUT_DIR, f"remedy_icon_{name}_1024.png")
    square.save(out_path, "PNG")
    print(f"Saved {out_path} size={square.size} mode={square.mode} bbox_fill={mark_long/crop_side:.2f}")

    preview_bg = Image.new("RGB", (400, 400), (60, 60, 65))
    icon_180 = square.resize((180, 180), Image.LANCZOS)
    mask180 = squircle_mask(180)
    preview_bg.paste(icon_180, (110, 60), mask180)
    icon_60 = square.resize((60, 60), Image.LANCZOS)
    mask60 = squircle_mask(60)
    preview_bg.paste(icon_60, (170, 280), mask60)
    preview_path = os.path.join(OUT_DIR, f"remedy_icon_{name}_preview.png")
    preview_bg.save(preview_path, "PNG")
    print(f"Saved {preview_path}")
