from PIL import Image, ImageDraw
import os

SRC_DIR = r"C:\Users\rkuma\.cursor\projects\c-Users-rkuma-remedy\assets"
OUT_DIR = r"C:\Users\rkuma\Downloads\Remedy\ICONS\refined"
os.makedirs(OUT_DIR, exist_ok=True)

FILES = {
    "flat_blocks": "remedy_icon_flat_blocks.png",
    "flat_ribbon": "remedy_icon_flat_ribbon.png",
    "flat_outline": "remedy_icon_flat_outline.png",
}


def squircle_mask(size, corner_radius_ratio=0.2237):
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)
    r = int(size * corner_radius_ratio)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=255)
    return mask


for name, fname in FILES.items():
    src_path = os.path.join(SRC_DIR, fname)
    img = Image.open(src_path).convert("RGB")
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    cropped = img.crop((left, top, left + side, top + side))
    square = cropped.resize((1024, 1024), Image.LANCZOS)

    out_path = os.path.join(OUT_DIR, f"remedy_icon_{name}_1024.png")
    square.save(out_path, "PNG")
    print(f"Saved {out_path} size={square.size} mode={square.mode}")

    preview_bg = Image.new("RGB", (400, 400), (60, 60, 65))
    icon_180 = square.resize((180, 180), Image.LANCZOS)
    mask = squircle_mask(180)
    preview_bg.paste(icon_180, (110, 60), mask)
    # also add a tiny 60px version to mimic a spotlight-search-size icon
    icon_60 = square.resize((60, 60), Image.LANCZOS)
    mask60 = squircle_mask(60)
    preview_bg.paste(icon_60, (170, 280), mask60)
    preview_path = os.path.join(OUT_DIR, f"remedy_icon_{name}_preview.png")
    preview_bg.save(preview_path, "PNG")
    print(f"Saved {preview_path}")
