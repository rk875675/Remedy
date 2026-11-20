"""App Store product-page header, 3840×1646.

Apple clips this one image on every device. The art-safe rectangle from
their template is 1646×661 at (1097, 493). The spine sits inside it.

The field is a packed set of tiles on one diagonal. Two lines run edge to
edge as seams: tiles stop at them, nothing runs underneath. Every tile is
beveled and some are lifted, so the depth comes from edges, not overlap.
"""

from __future__ import annotations

import os

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

W, H = 3840, 1646
SAFE = (1097, 493, 1646, 661)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO = os.path.join(ROOT, "assets", "brand", "logo.png")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "export", "remedy-header-3840x1646.png")

# Painted at half res, then scaled.
S = 2
SW, SH = W // S, H // S


def rgb(r: int, g: int, b: int) -> np.ndarray:
    return np.array([r, g, b], dtype=np.float32)


INK = rgb(38, 70, 52)
DEEP = rgb(45, 82, 60)
FOREST = rgb(53, 95, 69)
GREEN = rgb(62, 107, 78)  # #3E6B4E
LEAF = rgb(78, 128, 96)
SAGE = rgb(92, 143, 110)
WARM = rgb(236, 224, 208)
CLAY = rgb(196, 97, 74)  # #C4614A
CLAY_DEEP = rgb(172, 82, 62)
PAPER = rgb(242, 236, 226)
BONE = rgb(226, 214, 194)

GRID = np.deg2rad(-6)  # tiles and the white line
SEAM = np.deg2rad(9)  # the clay line
GAP = 10  # dark joint between tiles
RADIUS = 34
WHITE_HALF = 4
CLAY_HALF = 7
V_WHITE = 668  # white line, in grid coordinates
CLAY_AT = (1920.0, 1250.0)

# Column cuts along the grid, per region. Row cuts per column.
REGIONS: dict[str, dict[str, list]] = {
    "top": {
        "cols": [-400, 520, 1180, 2320, 2900, 4300],
        "rows": [[380], [], [360], [], [560]],
        "colors": [
            [DEEP, WARM],
            [FOREST],
            [LEAF, GREEN],
            [DEEP],
            [GREEN, BONE],
        ],
        "lift": [[0, 1], [0], [1, 0], [0], [0, 1]],
    },
    "mid": {
        "cols": [-400, 700, 1260, 1560, 2260, 2780, 3360, 4300],
        "rows": [[1080], [940], [1200], [], [1000, 1600], [1300], [900, 1500]],
        "colors": [
            [GREEN, DEEP],
            [SAGE, FOREST],
            [CLAY, DEEP],
            [SAGE],
            [FOREST, LEAF, DEEP],
            [DEEP, GREEN],
            [LEAF, CLAY_DEEP, DEEP],
        ],
        "lift": [[0, 1], [1, 0], [1, 0], [2], [0, 1, 1], [0, 0], [1, 0, 0]],
    },
    "bot": {
        "cols": [-400, 1240, 2860, 4300],
        "rows": [[1400], [], []],
        "colors": [
            [FOREST, GREEN],
            [LEAF],
            [DEEP],
        ],
        "lift": [[0, 1], [0], [0]],
    },
}


def extract_spine() -> Image.Image:
    src = np.array(Image.open(LOGO).convert("RGB")).astype(np.float32)
    bg = np.median(np.stack([src[8, 8], src[8, -9], src[40, 40]]), axis=0)
    dist = np.linalg.norm(src - bg, axis=2)
    dist[-1, :] = 0
    alpha = np.clip((dist - 32.0) / 20.0, 0, 1).astype(np.float32)
    rgb_ = (src - bg * (1.0 - alpha[..., None])) / np.maximum(alpha[..., None], 1e-3)
    rgb_ = np.clip(rgb_, 0, 255)
    white = (rgb_[:, :, 0] > 175) & (rgb_[:, :, 1] > 155) & (rgb_[:, :, 2] > 140)
    clay = (rgb_[:, :, 0] > 150) & (rgb_[:, :, 1] < 125) & (rgb_[:, :, 2] < 110)
    alpha = np.where(white | clay, alpha, 0).astype(np.float32)
    alpha = gaussian_filter(alpha, 0.6)
    rgba = np.dstack([rgb_, (alpha * 255).astype(np.uint8)]).astype(np.uint8)
    ys, xs = np.where(alpha > 0.8)
    pad = 4
    box = (
        max(0, int(xs.min()) - pad),
        max(0, int(ys.min()) - pad),
        min(rgba.shape[1], int(xs.max()) + 1 + pad),
        min(rgba.shape[0], int(ys.max()) + 1 + pad),
    )
    return Image.fromarray(rgba, "RGBA").crop(box)


def shift(mask: np.ndarray, dy: int, dx: int) -> np.ndarray:
    out = np.zeros_like(mask)
    y0, y1 = max(0, dy), SH + min(0, dy)
    x0, x1 = max(0, dx), SW + min(0, dx)
    sy0, sy1 = max(0, -dy), SH - max(0, dy)
    sx0, sx1 = max(0, -dx), SW - max(0, dx)
    out[y0:y1, x0:x1] = mask[sy0:sy1, sx0:sx1]
    return out


def bevel_shade(sdf: np.ndarray, width: float) -> np.ndarray:
    """Light a beveled edge from the upper left. Flat faces stay at 1.0."""
    height = np.clip(sdf / width, 0, 1)
    height = height * height * (3 - 2 * height)
    gy, gx = np.gradient(height)
    gain = width / S * 0.9
    nx, ny, nz = -gx * gain, -gy * gain, np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    key = np.array([-0.5, -0.7, 0.5], dtype=np.float32)
    key /= np.linalg.norm(key)
    lit = (nx * key[0] + ny * key[1] + nz * key[2]) / length
    flat = key[2]
    return np.clip(1.0 + (lit - flat) * 0.24, 0.82, 1.12)


def main() -> None:
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32)
    x = xx * S + S / 2
    y = yy * S + S / 2
    c, s = np.cos(GRID), np.sin(GRID)
    u = x * c + y * s
    v = -x * s + y * c

    dw = v - V_WHITE
    cx, cy = CLAY_AT
    dc = (x - cx) * -np.sin(SEAM) + (y - cy) * np.cos(SEAM)

    region_of = np.where(dw < 0, 0, np.where(dc < 0, 1, 2))
    line_d = np.where(
        region_of == 0,
        -dw - WHITE_HALF,
        np.where(region_of == 1, np.minimum(dw - WHITE_HALF, -dc - CLAY_HALF), dc - CLAY_HALF),
    )

    sdf = np.full((SH, SW), -1e6, dtype=np.float32)
    color = np.zeros((SH, SW, 3), dtype=np.float32)
    lift = np.zeros((SH, SW), dtype=np.int8)

    for r_index, name in enumerate(("top", "mid", "bot")):
        spec = REGIONS[name]
        cols = spec["cols"]
        in_region = region_of == r_index
        for ci in range(len(cols) - 1):
            ul, ur = cols[ci], cols[ci + 1]
            in_col = in_region & (u >= ul) & (u < ur)
            if not in_col.any():
                continue
            rows = [-1e6] + list(spec["rows"][ci]) + [1e6]
            for ri in range(len(rows) - 1):
                vt, vb = rows[ri], rows[ri + 1]
                m = in_col & (v >= vt) & (v < vb)
                if not m.any():
                    continue
                du = np.minimum(u[m] - ul, ur - u[m]) - GAP / 2
                dv = np.minimum(v[m] - vt, vb - v[m]) - GAP / 2
                qx, qy = RADIUS - du, RADIUS - dv
                corner = (qx > 0) & (qy > 0)
                grid_d = np.where(corner, RADIUS - np.sqrt(qx * qx + qy * qy), np.minimum(du, dv))
                sdf[m] = np.minimum(grid_d, line_d[m])
                colors = spec["colors"][ci]
                lifts = spec["lift"][ci]
                color[m] = colors[min(ri, len(colors) - 1)]
                lift[m] = lifts[min(ri, len(lifts) - 1)]

    alpha = np.clip((sdf + 1.5) / 3.0, 0, 1)
    shade = 1.0 + 0.0 * sdf
    # Light falls from the upper left across the whole field.
    room = 1.04 - 0.08 * np.clip((x / W) * 0.55 + (y / H) * 0.45, 0, 1)
    face = np.clip(color * (shade * room)[..., None], 0, 255)

    canvas = np.broadcast_to(INK, (SH, SW, 3)).copy()
    for level in (0, 1, 2):
        m = alpha * (lift == level)
        if level > 0:
            drop = gaussian_filter(shift(m, 6 * level + 3, 4 * level), 8.0 + 5.0 * level)
            a = (drop * (0.20 + 0.06 * level))[..., None]
            canvas = canvas * (1 - a) + rgb(24, 46, 34) * a
        canvas = canvas * (1 - m[..., None]) + face * m[..., None]
        if level == 0:
            # Seams sit in the same layer as the flat tiles.
            white = np.clip((WHITE_HALF + 1.5 - np.abs(dw)) / 3.0, 0, 1)[..., None]
            canvas = canvas * (1 - white) + PAPER * white
            clay = np.clip((CLAY_HALF + 1.5 - np.abs(dc)) / 3.0, 0, 1)[..., None]
            canvas = canvas * (1 - clay) + CLAY * clay

    canvas = gaussian_filter(canvas, (0.9, 0.9, 0))
    rng = np.random.default_rng(7)
    canvas += rng.normal(0, 1.2, canvas.shape).astype(np.float32)
    small = Image.fromarray(np.clip(canvas, 0, 255).astype(np.uint8), "RGB")
    image = small.resize((W, H), Image.Resampling.LANCZOS).convert("RGBA")

    mark = extract_spine()
    mark_h = 500
    mark_w = max(1, round(mark.width * (mark_h / mark.height)))
    mark = mark.resize((mark_w, mark_h), Image.Resampling.LANCZOS)
    sx, sy, sw, sh = SAFE
    left = sx + sw // 2 - mark_w // 2
    top = sy + sh // 2 - mark_h // 2 + 30
    spine_a = np.zeros((H, W), dtype=np.float32)
    spine_a[top : top + mark_h, left : left + mark_w] = np.array(mark)[:, :, 3] / 255.0
    blurred = gaussian_filter(spine_a, 12)
    shadow = np.zeros((H, W, 4), dtype=np.uint8)
    shadow[:, :, 0], shadow[:, :, 1], shadow[:, :, 2] = 20, 40, 30
    blurred = np.roll(np.roll(blurred, 14, axis=0), 8, axis=1)
    shadow[:, :, 3] = np.clip(blurred * 0.42 * 255, 0, 255).astype(np.uint8)
    image.alpha_composite(Image.fromarray(shadow, "RGBA"))
    image.alpha_composite(mark, (left, top))

    inside = left >= sx and top >= sy and left + mark_w < sx + sw and top + mark_h < sy + sh
    print(f"spine x {left}-{left + mark_w} y {top}-{top + mark_h} inside_safe={inside}")
    if not inside:
        raise SystemExit("spine left the safe area")

    flat = image.convert("RGB")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    flat.save(OUT, "PNG", optimize=True)
    print(f"wrote {OUT} {flat.size} {flat.mode}")


if __name__ == "__main__":
    main()
