"""Locate pet-name and first-name text on the new onboarding screenshots."""
from PIL import Image
from collections import defaultdict

INK = (28, 28, 30)
FILES = [
    "IMG_1785.PNG", "IMG_1788.PNG", "IMG_1789.PNG", "IMG_1790.PNG", "IMG_1791.PNG",
    "IMG_1792.PNG", "IMG_1793.PNG", "IMG_1794.PNG", "IMG_1795.PNG", "IMG_1796.PNG",
    "IMG_1797.PNG", "IMG_1798.PNG", "IMG_1799.PNG", "IMG_1800.PNG", "IMG_1801.PNG",
    "IMG_1802.PNG", "IMG_1803.PNG", "IMG_1804.PNG", "IMG_1805.PNG", "IMG_1806.PNG",
    "IMG_1808.PNG", "IMG_1809.PNG", "IMG_1810.PNG", "IMG_1812.PNG", "IMG_1813.PNG",
    "IMG_1814.PNG", "IMG_1815.PNG", "IMG_1816.PNG",
]
SRC = r"C:\Users\rkuma\OneDrive"


def near_ink(p, tol=26):
    r, g, b = p[:3]
    return abs(r - INK[0]) <= tol and abs(g - INK[1]) <= tol and abs(b - INK[2]) <= tol and max(r, g, b) < 90


def find_pill(im):
    w, h = im.size
    px = im.load()
    rows = []
    for y in range(160, int(h * 0.62)):
        x = 0
        best = None
        while x < w:
            if near_ink(px[x, y]):
                x0 = x
                while x < w and near_ink(px[x, y]):
                    x += 1
                length = x - x0
                if 150 <= length <= 280:
                    if best is None or length > (best[1] - best[0]):
                        best = (x0, x - 1, length)
            else:
                x += 1
        if best:
            rows.append((y, best[0], best[1], best[2]))
    if len(rows) < 12:
        return None
    long_rows = [r for r in rows if r[3] >= 190]
    use = long_rows or rows
    # split into y-clusters
    clusters = []
    cur = [use[0]]
    for r in use[1:]:
        if r[0] - cur[-1][0] <= 8:
            cur.append(r)
        else:
            clusters.append(cur)
            cur = [r]
    clusters.append(cur)
    cluster = max(clusters, key=len)
    if len(cluster) < 8:
        return None
    starts = sorted(r[1] for r in cluster)
    ends = sorted(r[2] for r in cluster)
    x0 = starts[len(starts) // 2]
    x1 = ends[len(ends) // 2]
    y0 = cluster[0][0]
    y1 = cluster[-1][0]
    # extend y while the center column is ink or white (text)
    cx = (x0 + x1) // 2
    while y0 > 140 and (near_ink(px[cx, y0 - 1]) or px[cx, y0 - 1][0] > 230):
        y0 -= 1
    while y1 < h - 10 and (near_ink(px[cx, y1 + 1]) or (px[cx, y1 + 1][0] > 240 and y1 - y0 < 60)):
        y1 += 1
    if not (30 <= (y1 - y0) <= 70):
        return None
    return (x0, y0, x1, y1)


def white_lines(im, y0, y1, x0, x1, min_w=40):
    px = im.load()
    rows = []
    for y in range(y0, y1):
        xs = [x for x in range(x0, x1) if px[x, y][0] > 235 and px[x, y][1] > 235 and px[x, y][2] > 235]
        if len(xs) > 12:
            rows.append((y, min(xs), max(xs), len(xs)))
    if not rows:
        return []
    bands = []
    cur = [rows[0]]
    for r in rows[1:]:
        if r[0] - cur[-1][0] <= 3:
            cur.append(r)
        else:
            bands.append(cur)
            cur = [r]
    bands.append(cur)
    out = []
    for band in bands:
        if len(band) < 8:
            continue
        by0, by1 = band[0][0], band[-1][0]
        bx0 = min(r[1] for r in band)
        bx1 = max(r[2] for r in band)
        if bx1 - bx0 >= min_w:
            out.append((bx0, by0, bx1, by1))
    return out


def ink_lines(im, y0, y1, x0, x1, min_h=14, max_h=120):
    px = im.load()
    rows = []
    for y in range(y0, y1):
        xs = [x for x in range(x0, x1) if near_ink(px[x, y], 18)]
        if len(xs) > 8:
            rows.append((y, min(xs), max(xs)))
    if not rows:
        return []
    bands = []
    cur = [rows[0]]
    for r in rows[1:]:
        if r[0] - cur[-1][0] <= 2:
            cur.append(r)
        else:
            bands.append(cur)
            cur = [r]
    bands.append(cur)
    out = []
    for band in bands:
        by0, by1 = band[0][0], band[-1][0]
        if not (min_h <= by1 - by0 <= max_h):
            continue
        bx0 = min(r[1] for r in band)
        bx1 = max(r[2] for r in band)
        out.append((bx0, by0, bx1, by1))
    return out


for name in FILES:
    im = Image.open(f"{SRC}\\{name}").convert("RGB")
    pill = find_pill(im)
    whites = white_lines(im, 200, 2200, 40, 1160, 80)
    inks = ink_lines(im, 180, 900, 20, 700)
    print(f"{name} pill={pill} white={whites[:4]} ink={inks[:6]}")
