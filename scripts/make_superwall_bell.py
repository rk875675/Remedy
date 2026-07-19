"""Crisp black bell on white circle for Superwall swap."""
from PIL import Image, ImageDraw, ImageFilter
from pathlib import Path
import math

SIZE = 1024
ANGLE = 16  # degrees clockwise tilt
BLACK = (0, 0, 0, 255)
WHITE = (255, 255, 255, 255)

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

cx = cy = SIZE // 2
circle_r = int(SIZE * 0.47)
draw.ellipse((cx - circle_r, cy - circle_r, cx + circle_r, cy + circle_r), fill=WHITE)


def rot_pts(pts, angle, ox, oy):
    a = math.radians(angle)
    c, s = math.cos(a), math.sin(a)
    out = []
    for x, y in pts:
        dx, dy = x - ox, y - oy
        out.append((ox + dx * c - dy * s, oy + dx * s + dy * c))
    return out


def ellipse_pts(bbox, n=72):
    x0, y0, x1, y1 = bbox
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    ecx, ecy = (x0 + x1) / 2, (y0 + y1) / 2
    return [
        (ecx + rx * math.cos(2 * math.pi * i / n), ecy + ry * math.sin(2 * math.pi * i / n))
        for i in range(n)
    ]


def fill_rot_ellipse(d, bbox, angle, fill, ox, oy):
    d.polygon(rot_pts(ellipse_pts(bbox), angle, ox, oy), fill=fill)


def fill_rot_arc(d, bbox, start_deg, end_deg, angle, fill, thickness, ox, oy):
    x0, y0, x1, y1 = bbox
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    ecx, ecy = (x0 + x1) / 2, (y0 + y1) / 2
    outer, inner = [], []
    steps = 48
    for i in range(steps + 1):
        t = math.radians(start_deg + (end_deg - start_deg) * i / steps)
        outer.append((ecx + rx * math.cos(t), ecy + ry * math.sin(t)))
        inner.append((ecx + (rx - thickness) * math.cos(t), ecy + (ry - thickness) * math.sin(t)))
    d.polygon(rot_pts(outer + inner[::-1], angle, ox, oy), fill=fill)


# Bell drawn in upright coords then rotated around (bx, by)
bx, by = cx, cy + 20
s = SIZE / 1024

# Body silhouette as a single smooth polygon (classic notification bell)
# Path roughly: left lip -> left side -> crown left -> crown -> crown right -> right side -> right lip -> bottom
def bell_outline():
    pts = []
    # Left bottom flare corner going up the left side
    # Use parametric sides
    # Bottom-left lip
    pts.append((bx - 150 * s, by + 110 * s))
    # Left flare curve up
    for i in range(1, 12):
        t = i / 12
        x = bx - (150 - 55 * t) * s
        y = by + (110 - 220 * t) * s
        # nudge outward in middle
        x -= 20 * s * math.sin(math.pi * t)
        pts.append((x, y))
    # Left of crown
    pts.append((bx - 22 * s, by - 155 * s))
    # Crown top (small semicircle)
    for i in range(13):
        t = math.pi + math.pi * i / 12  # left to right over top
        pts.append((bx + 22 * s * math.cos(t), by - 175 * s + 22 * s * math.sin(t)))
    # Right side down
    pts.append((bx + 22 * s, by - 155 * s))
    for i in range(1, 12):
        t = i / 12
        x = bx + (22 + 128 * t) * s
        y = by + (-155 + 265 * t) * s
        x += 20 * s * math.sin(math.pi * t)
        pts.append((x, y))
    # Right lip
    pts.append((bx + 150 * s, by + 110 * s))
    # Bottom edge (slight upward curve)
    for i in range(1, 16):
        t = i / 16
        x = bx + (150 - 300 * t) * s
        y = by + 110 * s + 18 * s * math.sin(math.pi * t)
        pts.append((x, y))
    return pts


draw.polygon(rot_pts(bell_outline(), ANGLE, bx, by), fill=BLACK)

# Clapper
fill_rot_ellipse(
    draw,
    (bx - 32 * s, by + 118 * s, bx + 32 * s, by + 185 * s),
    ANGLE,
    BLACK,
    bx,
    by,
)

# Sound arcs
fill_rot_arc(
    draw,
    (bx - 210 * s, by - 130 * s, bx - 50 * s, by + 50 * s),
    210,
    310,
    ANGLE,
    BLACK,
    20 * s,
    bx,
    by,
)
fill_rot_arc(
    draw,
    (bx + 50 * s, by - 130 * s, bx + 210 * s, by + 50 * s),
    50,
    150,
    ANGLE,
    BLACK,
    20 * s,
    bx,
    by,
)

# Slight AA by downscale from 2x
hi = img.resize((SIZE * 2, SIZE * 2), Image.Resampling.NEAREST)
# Actually draw at 2x from the start for better AA
# Re-do at 2x:
SIZE2 = SIZE * 2
img2 = Image.new("RGBA", (SIZE2, SIZE2), (0, 0, 0, 0))
d2 = ImageDraw.Draw(img2)
cx2 = cy2 = SIZE2 // 2
r2 = int(SIZE2 * 0.47)
d2.ellipse((cx2 - r2, cy2 - r2, cx2 + r2, cy2 + r2), fill=WHITE)

# scale factor relative to 1024 base
s2 = SIZE2 / 1024
bx2, by2 = cx2, cy2 + 40


def rot_pts2(pts, angle, ox, oy):
    return rot_pts(pts, angle, ox, oy)


def bell_outline2():
    pts = []
    pts.append((bx2 - 150 * s2, by2 + 110 * s2))
    for i in range(1, 16):
        t = i / 16
        x = bx2 - (150 - 55 * t) * s2 - 22 * s2 * math.sin(math.pi * t)
        y = by2 + (110 - 220 * t) * s2
        pts.append((x, y))
    pts.append((bx2 - 24 * s2, by2 - 155 * s2))
    for i in range(17):
        t = math.pi + math.pi * i / 16
        pts.append((bx2 + 24 * s2 * math.cos(t), by2 - 178 * s2 + 24 * s2 * math.sin(t)))
    pts.append((bx2 + 24 * s2, by2 - 155 * s2))
    for i in range(1, 16):
        t = i / 16
        x = bx2 + (24 + 126 * t) * s2 + 22 * s2 * math.sin(math.pi * t)
        y = by2 + (-155 + 265 * t) * s2
        pts.append((x, y))
    pts.append((bx2 + 150 * s2, by2 + 110 * s2))
    for i in range(1, 20):
        t = i / 20
        x = bx2 + (150 - 300 * t) * s2
        y = by2 + 110 * s2 + 20 * s2 * math.sin(math.pi * t)
        pts.append((x, y))
    return pts


d2.polygon(rot_pts2(bell_outline2(), ANGLE, bx2, by2), fill=BLACK)

# clapper
pts = ellipse_pts((bx2 - 34 * s2, by2 + 118 * s2, bx2 + 34 * s2, by2 + 190 * s2), 64)
d2.polygon(rot_pts2(pts, ANGLE, bx2, by2), fill=BLACK)

# arcs
for bbox, start, end in [
    ((bx2 - 215 * s2, by2 - 135 * s2, bx2 - 45 * s2, by2 + 55 * s2), 208, 312),
    ((bx2 + 45 * s2, by2 - 135 * s2, bx2 + 215 * s2, by2 + 55 * s2), 48, 152),
]:
    x0, y0, x1, y1 = bbox
    rx, ry = (x1 - x0) / 2, (y1 - y0) / 2
    ecx, ecy = (x0 + x1) / 2, (y0 + y1) / 2
    thick = 22 * s2
    outer, inner = [], []
    for i in range(49):
        t = math.radians(start + (end - start) * i / 48)
        outer.append((ecx + rx * math.cos(t), ecy + ry * math.sin(t)))
        inner.append((ecx + (rx - thick) * math.cos(t), ecy + (ry - thick) * math.sin(t)))
    d2.polygon(rot_pts2(outer + inner[::-1], ANGLE, bx2, by2), fill=BLACK)

final = img2.resize((SIZE, SIZE), Image.Resampling.LANCZOS)

paths = [
    Path(r"C:\Users\rkuma\.cursor\projects\c-Users-rkuma-remedy\assets\superwall_bell_black.png"),
    Path(r"c:\Users\rkuma\remedy\scripts\output\superwall_bell_black.png"),
    Path.home() / "Downloads" / "superwall_bell_black.png",
]
for p in paths:
    p.parent.mkdir(parents=True, exist_ok=True)
    final.save(p, "PNG")
    print("saved", p)
