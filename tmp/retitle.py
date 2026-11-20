"""Replace Dumpling/didi with Arnie and Bamw with John on the new screenshots."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SRC = Path(r"C:\Users\rkuma\OneDrive")
QA = Path(r"C:\Users\rkuma\remedy\tmp\qa")
EDITED = Path(r"C:\Users\rkuma\remedy\tmp\edited")
QA.mkdir(parents=True, exist_ok=True)
EDITED.mkdir(parents=True, exist_ok=True)

INK = (28, 28, 30)
ARIALB = r"C:\Windows\Fonts\arialbd.ttf"
SEGOE = r"C:\Windows\Fonts\segoeui.ttf"
SEGOEB = r"C:\Windows\Fonts\segoeuib.ttf"


def near(p, target, tol):
    return all(abs(int(p[i]) - target[i]) <= tol for i in range(3))


def render_chars(text, font_path, size, tracking, fill):
    font = ImageFont.truetype(font_path, size)
    widths = []
    for ch in text:
        bb = font.getbbox(ch, anchor="ls")
        widths.append(bb[2] - bb[0])
    total = sum(widths) + tracking * (max(0, len(text) - 1))
    ascent, descent = font.getmetrics()
    img = Image.new("RGBA", (max(1, total + 8), ascent + descent + 8), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    x = 4
    baseline = ascent + 4
    for ch, cw in zip(text, widths):
        dr.text((x, baseline), ch, font=font, fill=fill, anchor="ls")
        x += cw + tracking
    bbox = img.getbbox()
    if not bbox:
        return img
    return img.crop(bbox)


def render_native(text, font_path, size, fill):
    font = ImageFont.truetype(font_path, size)
    ascent, descent = font.getmetrics()
    bb = font.getbbox(text, anchor="ls")
    img = Image.new("RGBA", (bb[2] - bb[0] + 8, ascent + descent + 8), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    dr.text((4 - bb[0], ascent + 4), text, font=font, fill=fill, anchor="ls")
    bbox = img.getbbox()
    return img.crop(bbox) if bbox else img


def paste_rgba(base, overlay, xy):
    x, y = xy
    if overlay.mode != "RGBA":
        overlay = overlay.convert("RGBA")
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    layer.paste(overlay, (x, y), overlay)
    out = Image.alpha_composite(base.convert("RGBA"), layer)
    return out.convert("RGB")


def in_rr(x, y, x0, y0, x1, y1, r):
    if x < x0 or y > y1 or y < y0 or x > x1:
        return False
    cx = x
    cy = y
    if x < x0 + r and y < y0 + r:
        cx, cy = x0 + r, y0 + r
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    if x > x1 - r and y < y0 + r:
        cx, cy = x1 - r, y0 + r
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    if x < x0 + r and y > y1 - r:
        cx, cy = x0 + r, y1 - r
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    if x > x1 - r and y > y1 - r:
        cx, cy = x1 - r, y1 - r
        return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
    return True


def find_tag(im):
    px = im.load()
    w, h = im.size
    rows = []
    for y in range(250, int(h * 0.58)):
        xs = [x for x in range(420, 820) if px[x, y][0] < 55 and px[x, y][1] < 55 and px[x, y][2] < 70]
        if len(xs) < 30:
            continue
        span = xs[-1] - xs[0]
        if 170 <= span <= 260 and 450 <= xs[0] <= 530:
            rows.append((y, xs[0], xs[-1]))
    if len(rows) < 8:
        return None
    body = [r for r in rows if r[1] >= 470 and (r[2] - r[1]) >= 200]
    if len(body) < 4:
        return None
    x0 = min(r[1] for r in body)
    x1 = max(r[2] for r in body)
    y0 = min(r[0] for r in rows if r[1] >= 465)
    y1 = max(r[0] for r in rows)
    return (x0, y0, x1, y1)


def replace_tag(im):
    pill = find_tag(im)
    if not pill:
        return im, None
    x0, y0, x1, y1 = pill
    px = im.load()
    whites = []
    for y in range(y0 + 6, y1 - 4):
        for x in range(x0 + 8, x1 - 8):
            p = px[x, y]
            if p[0] > 230 and p[1] > 230 and p[2] > 230:
                whites.append((x, y))
    if not whites:
        return im, None
    tx0 = min(p[0] for p in whites)
    tx1 = max(p[0] for p in whites)
    ty0 = min(p[1] for p in whites)
    ty1 = max(p[1] for p in whites)
    pad_l = tx0 - x0
    pad_r = x1 - tx1
    text = render_chars("ARNIE", SEGOEB, 29, 3, (255, 255, 255, 255))
    new_w = text.size[0] + pad_l + pad_r
    new_x1 = x0 + new_w - 1
    radius = 18

    # Bubble border just to the right of the old pill.
    bx = min(im.size[0] - 2, x1 + 16)
    border = [y for y in range(y0, y1 + 12) if px[bx, y][0] < 60 and px[bx, y][1] < 60 and px[bx, y][2] < 80]
    if border:
        b0, b1 = min(border), max(border)
    else:
        b0, b1 = y0 + 26, y0 + 32

    def sample(x, y):
        x = max(0, min(im.size[0] - 1, x))
        y = max(0, min(im.size[1] - 1, y))
        return px[x, y]

    for y in range(y0 - 2, y1 + 3):
        for x in range(new_x1 - 1, x1 + 3):
            if not in_rr(x, y, x0 - 1, y0 - 1, x1 + 1, y1 + 1, radius + 1):
                continue
            if y < b0:
                px[x, y] = sample(x1 + 18, y)
            elif y <= b1:
                px[x, y] = INK
            else:
                px[x, y] = sample(x1 + 18, y)

    # Supersampled new pill.
    scale = 4
    ph = y1 - y0 + 1
    pw = new_x1 - x0 + 1
    layer = Image.new("RGBA", (pw * scale, ph * scale), (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)
    dr.rounded_rectangle((0, 0, pw * scale - 1, ph * scale - 1), radius=radius * scale, fill=INK + (255,))
    text_big = render_chars("ARNIE", SEGOEB, 29 * scale, 3 * scale, (255, 255, 255, 255))
    ox = (pad_l * scale)
    oy = ((ph - text.size[1]) // 2) * scale
    # Use the 1x vertical centering, scaled.
    layer.paste(text_big, (ox, oy), text_big)
    small = layer.resize((pw, ph), Image.Resampling.LANCZOS)
    im = paste_rgba(im, small, (x0, y0))
    # Clear leftover antialiasing from the old, wider pill.
    px = im.load()
    for y in range(y0 - 3, y1 + 4):
        for x in range(new_x1 + 1, x1 + 8):
            if in_rr(x, y, x0, y0, new_x1, y1, radius):
                continue
            p = px[x, y]
            if y < b0:
                bg = px[min(im.size[0] - 1, x1 + 22), y]
                if abs(int(p[0]) - int(bg[0])) + abs(int(p[1]) - int(bg[1])) + abs(int(p[2]) - int(bg[2])) > 18:
                    px[x, y] = bg
            elif y <= b1:
                if p[0] > 80:
                    px[x, y] = INK
            else:
                bg = px[min(im.size[0] - 1, x1 + 22), min(im.size[1] - 1, y)]
                if not (bg[0] > 245 and bg[1] > 245 and bg[2] > 245):
                    bg = (255, 255, 255)
                if p[0] < 245 or p[1] < 245 or p[2] < 245:
                    px[x, y] = bg
    return im, (x0, y0, new_x1, y1, x1)


def erase_to_bg(im, box, pad=4, dist=14):
    """Replace anything that isn't the local flat background inside the box."""
    x0, y0, x1, y1 = box
    px = im.load()
    samples = []
    for y in range(max(0, y0 - pad), min(im.size[1], y1 + pad + 1)):
        x = max(0, x0 - 10)
        p = px[x, y]
        samples.append(p)
    bg = tuple(sorted(s[i] for s in samples)[len(samples) // 2] for i in range(3))
    for y in range(y0 - pad, y1 + pad + 1):
        for x in range(x0 - pad, x1 + pad + 1):
            if not (0 <= x < im.size[0] and 0 <= y < im.size[1]):
                continue
            p = px[x, y]
            if abs(int(p[0]) - bg[0]) + abs(int(p[1]) - bg[1]) + abs(int(p[2]) - bg[2]) > dist:
                row = px[max(0, x0 - 10), y]
                if abs(int(row[0]) - bg[0]) + abs(int(row[1]) - bg[1]) + abs(int(row[2]) - bg[2]) < dist:
                    px[x, y] = row
                else:
                    px[x, y] = bg
    return bg


def replace_home_name(im):
    box = (63, 309, 187, 366)
    erase_to_bg(im, box, pad=5, dist=12)
    text = render_chars("Arnie", ARIALB, 77, -1, INK + (255,))
    # Baseline-align to the old ink bottom. "didi" has no descenders.
    x = box[0]
    y = box[3] - text.size[1] + 1
    return paste_rgba(im, text, (x, y)), (x, y, x + text.size[0], y + text.size[1])


def replace_progress_name(im):
    # Card title sits on white. Search the known band.
    px = im.load()
    xs, ys = [], []
    for y in range(1180, 1320):
        for x in range(90, 320):
            if near(px[x, y], INK, 26):
                xs.append(x)
                ys.append(y)
    if not xs:
        return im, None
    box = (min(xs), min(ys), max(xs), max(ys))
    for y in range(box[1] - 4, box[3] + 5):
        for x in range(box[0] - 4, box[2] + 5):
            if 0 <= x < im.size[0] and 0 <= y < im.size[1] and px[x, y][0] < 245:
                px[x, y] = (255, 255, 255)
    text = render_chars("Arnie", SEGOE, 42, 1, INK + (255,))
    x = box[0]
    y = box[3] - text.size[1] + 1
    return paste_rgba(im, text, (x, y)), (x, y, x + text.size[0], y + text.size[1])


def find_white_line(im, y0, y1, x0, x1):
    px = im.load()
    rows = []
    for y in range(y0, y1):
        xs = [x for x in range(x0, x1) if px[x, y][0] > 236 and px[x, y][1] > 236 and px[x, y][2] > 236]
        if len(xs) > 20 and 80 < (xs[-1] - xs[0]) < 420:
            rows.append((y, xs[0], xs[-1]))
    if len(rows) < 8:
        return None
    bands = []
    cur = [rows[0]]
    for r in rows[1:]:
        if r[0] - cur[-1][0] <= 3:
            cur.append(r)
        else:
            bands.append(cur)
            cur = [r]
    bands.append(cur)
    picked = None
    for band in bands:
        if len(band) < 10:
            continue
        bx0 = min(r[1] for r in band)
        bx1 = max(r[2] for r in band)
        by0, by1 = band[0][0], band[-1][0]
        if 180 <= (bx1 - bx0) <= 400 and 18 <= (by1 - by0) <= 48:
            picked = (bx0, by0, bx1, by1)
            break
    return picked


def replace_growth_pill(im):
    line = find_white_line(im, 860, 1200, 300, 980)
    if not line:
        return im, None
    tx0, ty0, tx1, ty1 = line
    px = im.load()
    cx = (tx0 + tx1) // 2

    def brighter(y, base_sum, jump=36):
        return sum(px[cx, y]) > base_sum + jump

    y = ty0 - 6
    base = sum(px[cx, y])
    while y > ty0 - 90:
        y -= 1
        if brighter(y, base):
            break
        base = min(base, sum(px[cx, y]))
    pill_top = y + 1
    y = ty1 + 6
    base = sum(px[cx, y])
    while y < ty1 + 90:
        y += 1
        if brighter(y, base):
            break
        base = min(base, sum(px[cx, y]))
    pill_bot = y - 1
    # Horizontal extent along a row inside the pill, above the glyphs.
    my = max(pill_top + 4, min(ty0 - 8, pill_bot - 4))
    # Sample the fill to the left of the glyphs. The center can sit on a letter.
    probe_x = max(20, tx0 - 20)
    inner = px[probe_x, my]
    pill_sum = sum(inner)
    left = tx0
    while left > 20 and sum(px[left, my]) < pill_sum + 36:
        left -= 1
    left += 1
    right = tx1
    while right < im.size[0] - 2 and sum(px[right, my]) < pill_sum + 36:
        right += 1
    right -= 1

    side = px[max(0, left - 14), my]
    alphas = []
    for i in range(3):
        if side[i] > 30 and inner[i] < side[i]:
            alphas.append(1 - (inner[i] / side[i]))
    alpha = sum(alphas) / len(alphas) if alphas else 0.22
    alpha = min(0.32, max(0.16, alpha))

    text = render_chars("Arnie is fully grown", SEGOE, 35, 2, (255, 255, 255, 255))
    pad_l = tx0 - left
    pad_r = right - tx1
    pad_t = ty0 - pill_top
    new_w = text.size[0] + pad_l + pad_r
    old_w = right - left + 1
    # Keep the pill centered.
    center = (left + right) / 2
    new_left = int(round(center - new_w / 2))
    new_right = new_left + new_w - 1
    radius = max(8, (pill_bot - pill_top) // 2)
    margin = 12

    def scene(x, y):
        y = max(0, min(im.size[1] - 1, y))
        lx = max(0, left - margin - 6)
        rx = min(im.size[0] - 1, right + margin + 6)
        lc = px[lx, y]
        rc = px[rx, y]
        if rx == lx:
            return lc
        t = (x - lx) / (rx - lx)
        return tuple(max(0, min(255, int(round(lc[i] + (rc[i] - lc[i]) * t)))) for i in range(3))

    scale = 4
    region_top = min(pill_top, pill_top) - margin
    region_bot = pill_bot + margin
    region_left = min(left, new_left) - margin
    region_right = max(right, new_right) + margin
    ph = region_bot - region_top + 1
    rw = region_right - region_left + 1
    canvas = Image.new("RGB", (rw, ph))
    cp = canvas.load()
    for y in range(ph):
        for x in range(rw):
            ax = region_left + x
            ay = region_top + y
            if in_rr(ax, ay, left - margin, pill_top - margin, right + margin, pill_bot + margin, radius + margin):
                cp[x, y] = scene(ax, ay)
            else:
                cp[x, y] = px[max(0, min(im.size[0] - 1, ax)), max(0, min(im.size[1] - 1, ay))]
    overlay = Image.new("RGBA", (rw * scale, ph * scale), (0, 0, 0, 0))
    dr = ImageDraw.Draw(overlay)
    ox0 = (new_left - region_left) * scale
    oy0 = (pill_top - region_top) * scale
    ox1 = (new_right - region_left) * scale
    oy1 = (pill_bot - region_top) * scale
    dr.rounded_rectangle((ox0, oy0, ox1, oy1), radius=radius * scale, fill=(0, 0, 0, int(round(alpha * 255))))
    flat = overlay.resize((rw, ph), Image.Resampling.LANCZOS)
    canvas = Image.alpha_composite(canvas.convert("RGBA"), flat).convert("RGB")
    text_x = new_left + max(8, pad_l) - region_left
    text_y = (pill_top - region_top) + max(0, ((pill_bot - pill_top + 1) - text.size[1]) // 2)
    canvas = paste_rgba(canvas, text, (text_x, text_y))
    im.paste(canvas, (region_left, region_top))
    return im, (new_left, pill_top, new_right, pill_bot, round(alpha, 3))


def fit_native(text, font_path, target_w, target_h):
    best = None
    for size in range(24, 60):
        img = render_native(text, font_path, size, (0, 0, 0, 255))
        err = abs(img.size[0] - target_w) + abs(img.size[1] - target_h) * 2
        if best is None or err < best[0]:
            best = (err, size, img.size)
    return best[1], best[2]


def wipe_text(im, box):
    px = im.load()
    x0, y0, x1, y1 = box
    for y in range(y0 - 2, y1 + 3):
        for x in range(x0 - 3, x1 + 3):
            if 0 <= x < im.size[0] and 0 <= y < im.size[1]:
                p = px[x, y]
                if p[0] < 250 or p[1] < 250 or p[2] < 250:
                    px[x, y] = (255, 255, 255)


def replace_notification(im):
    px = im.load()
    title_box = (256, 1751, 896, 1791)
    body_box = (255, 1814, 926, 1848)
    title_size, title_fit = fit_native(
        "Dumpling is ready when you are", SEGOEB, title_box[2] - title_box[0], title_box[3] - title_box[1]
    )
    body_size, body_fit = fit_native(
        "Bamw, 15 minutes for your back today.", SEGOE, body_box[2] - body_box[0], body_box[3] - body_box[1]
    )
    body_colors = []
    for y in range(body_box[1], body_box[3]):
        for x in range(body_box[0], body_box[2]):
            p = px[x, y]
            if 60 < p[0] < 160 and abs(int(p[0]) - int(p[1])) < 16 and abs(int(p[1]) - int(p[2])) < 16:
                body_colors.append(p)
    fill = (107, 107, 107, 255)
    if body_colors:
        fill = tuple(sorted(c[i] for c in body_colors)[len(body_colors) // 2] for i in range(3)) + (255,)
    wipe_text(im, title_box)
    title = render_native("Arnie is ready when you are", SEGOEB, title_size, INK + (255,))
    im = paste_rgba(im, title, (title_box[0], title_box[3] - title.size[1] + 1))
    wipe_text(im, body_box)
    body = render_native("John, 15 minutes for your back today.", SEGOE, body_size, fill)
    im = paste_rgba(im, body, (body_box[0], body_box[3] - body.size[1] + 1))
    return im, (title_size, title.size, body_size, body.size, fill[:3])


def save_pair(name, before, after, box, pad=30):
    x0, y0, x1, y1 = box
    x0 = max(0, x0 - pad)
    y0 = max(0, y0 - pad)
    x1 = min(before.size[0] - 1, x1 + pad)
    y1 = min(before.size[1] - 1, y1 + pad)
    b = before.crop((x0, y0, x1, y1))
    a = after.crop((x0, y0, x1, y1))
    sheet = Image.new("RGB", (b.size[0], b.size[1] * 2 + 8), (255, 0, 0))
    sheet.paste(b, (0, 0))
    sheet.paste(a, (0, b.size[1] + 8))
    sheet.save(QA / name)


TAG_FILES = [
    "IMG_1790.PNG", "IMG_1791.PNG", "IMG_1792.PNG", "IMG_1793.PNG", "IMG_1794.PNG",
    "IMG_1796.PNG", "IMG_1797.PNG", "IMG_1798.PNG", "IMG_1799.PNG", "IMG_1800.PNG",
    "IMG_1801.PNG", "IMG_1802.PNG", "IMG_1803.PNG", "IMG_1804.PNG", "IMG_1805.PNG",
    "IMG_1806.PNG", "IMG_1809.PNG",
]
PLAIN = [
    "IMG_1785.PNG", "IMG_1795.PNG", "IMG_1808.PNG", "IMG_1812.PNG", "IMG_1813.PNG",
    "IMG_1814.PNG", "IMG_1815.PNG", "IMG_1816.PNG",
]

for name in TAG_FILES:
    src = Image.open(SRC / name).convert("RGB")
    out, info = replace_tag(src.copy(), ) if False else replace_tag(src.copy())
    print(name, "tag", info)
    if info:
        save_pair(f"tag_{name}", src, out, info[:4], 80)
    out.save(EDITED / name)

# home
src = Image.open(SRC / "IMG_1788.PNG").convert("RGB")
out = src.copy()
out, nb = replace_home_name(out)
out, pb = replace_growth_pill(out)
print("home name", nb, "pill", pb)
save_pair("home_name.png", src, out, (40, 250, 400, 430), 10)
if pb:
    save_pair("home_pill.png", src, out, pb[:4], 40)
out.save(EDITED / "IMG_1788.PNG")

src = Image.open(SRC / "IMG_1789.PNG").convert("RGB")
out = src.copy()
out, nb = replace_progress_name(out)
out, pb = replace_growth_pill(out)
print("progress name", nb, "pill", pb)
if nb:
    save_pair("prog_name.png", src, out, nb, 40)
if pb:
    save_pair("prog_pill.png", src, out, pb[:4], 40)
out.save(EDITED / "IMG_1789.PNG")

src = Image.open(SRC / "IMG_1810.PNG").convert("RGB")
out, info = replace_notification(src.copy())
print("notif", info)
save_pair("notif.png", src, out, (80, 1680, 1120, 1920), 10)
out.save(EDITED / "IMG_1810.PNG")

for name in PLAIN:
    Image.open(SRC / name).convert("RGB").save(EDITED / name)

print("done", len(list(EDITED.glob('*.PNG'))))
