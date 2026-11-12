"""Cut pet pose art out of its green-screen background into app-ready PNGs.

Source art is generated as `pet-s<stage>-<mood>.jpg` on a flat green background.
Each one becomes `assets/pet/s<stage>_<mood>.png`: transparent, edge-cleaned,
and placed on a shared square canvas (centred, bottom-aligned) so poses of the
same stage line up when the app crossfades between them.

    python scripts/key_pet_poses.py --src <folder with pet-s*-*.jpg> [--sheet out.png]

`--sheet` also writes a contact sheet (each pose on cream and on forest green)
for checking edges by eye.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "pet"

CANVAS = 768
# The pose is scaled to fit this box, then centred and sat on BASELINE.
FIT_W = 700
FIT_H = 700
BASELINE = 748

SOURCE_PATTERN = re.compile(r"^pet-s([1-5])-([a-z]+)\.(?:jpg|jpeg|png)$")
SENTINEL = (255, 0, 255)
FLOOD_THRESHOLD = 110
EDGE_BAND_PX = 3
PALETTE_COLOURS = 128

CREAM = (250, 247, 244)
FOREST = (62, 107, 78)


def sample_background(rgb: np.ndarray) -> np.ndarray:
    """Median colour of a thin frame around the image."""
    frame = np.concatenate(
        [
            rgb[:6].reshape(-1, 3),
            rgb[-6:].reshape(-1, 3),
            rgb[:, :6].reshape(-1, 3),
            rgb[:, -6:].reshape(-1, 3),
        ]
    )
    return np.median(frame, axis=0)


def background_mask(img: Image.Image) -> np.ndarray:
    """True where the pixel is background connected to the image border."""
    work = img.copy()
    w, h = work.size
    step = max(1, w // 16)
    seeds = (
        [(x, 0) for x in range(0, w, step)]
        + [(x, h - 1) for x in range(0, w, step)]
        + [(0, y) for y in range(0, h, step)]
        + [(w - 1, y) for y in range(0, h, step)]
    )
    for seed in seeds:
        if work.getpixel(seed) != SENTINEL:
            ImageDraw.floodfill(work, seed, SENTINEL, thresh=FLOOD_THRESHOLD)
    arr = np.array(work)
    return (arr[..., 0] == SENTINEL[0]) & (arr[..., 1] == SENTINEL[1]) & (arr[..., 2] == SENTINEL[2])


def key_out(img: Image.Image) -> Image.Image:
    rgb = np.array(img).astype(np.float32)
    bg = sample_background(rgb)
    is_bg = background_mask(img)

    alpha = np.where(is_bg, 0.0, 1.0).astype(np.float32)

    # Pixels next to the background are a blend of outline and green. Estimate
    # how much green is in each one, turn that into partial alpha, and remove
    # the green so no fringe is left on light or dark app backgrounds.
    bg_img = Image.fromarray((is_bg * 255).astype(np.uint8))
    near_bg = np.array(bg_img.filter(ImageFilter.MaxFilter(EDGE_BAND_PX * 2 + 1))) > 0
    band = near_bg & ~is_bg

    bg_excess = float(bg[1] - max(bg[0], bg[2]))
    if bg_excess > 1:
        excess = rgb[..., 1] - np.maximum(rgb[..., 0], rgb[..., 2])
        green_share = np.clip(excess / bg_excess, 0.0, 1.0)
        band_alpha = 1.0 - green_share
        alpha = np.where(band, band_alpha, alpha)
        safe_alpha = np.clip(alpha, 0.05, 1.0)[..., None]
        unmixed = (rgb - (1.0 - alpha[..., None]) * bg) / safe_alpha
        rgb = np.where(band[..., None], np.clip(unmixed, 0, 255), rgb)

    out = np.dstack([rgb, alpha * 255.0]).round().astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def place_on_canvas(cutout: Image.Image) -> Image.Image:
    bbox = cutout.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bbox:
        raise RuntimeError("Nothing left after keying; check the source background")
    pose = cutout.crop(bbox)
    scale = min(FIT_W / pose.width, FIT_H / pose.height)
    size = (max(1, round(pose.width * scale)), max(1, round(pose.height * scale)))
    pose = pose.resize(size, Image.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), (0, 0, 0, 0))
    canvas.alpha_composite(pose, ((CANVAS - pose.width) // 2, BASELINE - pose.height))
    return canvas


def contact_sheet(items: list[tuple[str, Image.Image]], path: Path, cell: int = 256) -> None:
    cols = min(7, len(items))
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * cell * 2), CREAM)
    for i, (_, img) in enumerate(items):
        col, row = i % cols, i // cols
        thumb = img.resize((cell, cell), Image.LANCZOS)
        for half, colour in enumerate((CREAM, FOREST)):
            tile = Image.new("RGBA", (cell, cell), colour + (255,))
            tile.alpha_composite(thumb)
            sheet.paste(tile.convert("RGB"), (col * cell, (row * 2 + half) * cell))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path, "PNG")
    print(f"Contact sheet -> {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--src", required=True, type=Path, help="Folder holding pet-s<stage>-<mood>.jpg files")
    parser.add_argument("--sheet", type=Path, help="Optional path for a contact sheet PNG")
    parser.add_argument("--only", nargs="*", help="Only process these names, e.g. s3_idle s5_proud")
    args = parser.parse_args()

    sources = sorted(p for p in args.src.iterdir() if SOURCE_PATTERN.match(p.name))
    if not sources:
        raise SystemExit(f"No pet-s<stage>-<mood> images found in {args.src}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    done: list[tuple[str, Image.Image]] = []
    for src in sources:
        match = SOURCE_PATTERN.match(src.name)
        assert match is not None
        name = f"s{match.group(1)}_{match.group(2)}"
        if args.only and name not in args.only:
            continue
        final = place_on_canvas(key_out(Image.open(src).convert("RGB")))
        out_path = OUT_DIR / f"{name}.png"
        # The art is flat colour, so a palette PNG is a fraction of the size
        # with no visible change.
        final.quantize(
            colors=PALETTE_COLOURS,
            method=Image.Quantize.FASTOCTREE,
            dither=Image.Dither.NONE,
        ).save(out_path, "PNG", optimize=True)
        print(f"{src.name} -> {out_path.relative_to(ROOT)} ({out_path.stat().st_size // 1024} KB)")
        done.append((name, final))

    if args.sheet and done:
        contact_sheet(done, args.sheet)


if __name__ == "__main__":
    main()
