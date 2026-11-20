"""Preview name replacements before writing the library copies."""
from PIL import Image, ImageDraw, ImageFont

INK = (28, 28, 30)
ARIALB = r"C:\Windows\Fonts\arialbd.ttf"
SEGOE = r"C:\Windows\Fonts\segoeui.ttf"
SEGOEB = r"C:\Windows\Fonts\segoeuib.ttf"
OUT = r"C:\Users\rkuma\remedy\tmp"


def near(p, target, tol):
    return all(abs(int(p[i]) - target[i]) <= tol for i in range(3))


def render_word(word, path, size, tracking, fill=(255, 255, 255, 255)):
    font = ImageFont.truetype(path, size)
    # Draw each glyph from a shared baseline so tracking is exact.
    widths = []
    for ch in word:
        bb = font.getbbox(ch, anchor="ls")
        widths.append(bb[2] - bb[0])
    total = sum(widths) + tracking * (len(word) - 1)
    ascent, descent = font.getmetrics()
    img = Image.new("RGBA", (max(1, total + 4), ascent + descent + 4), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    x = 2
    baseline = ascent + 2
    for ch, cw in zip(word, widths):
        dr.text((x, baseline), ch, font=font, fill=fill, anchor="ls")
        x += cw + tracking
    bbox = img.getbbox()
    return img.crop(bbox), baseline - (bbox[1] if bbox else 0)


def mask_iou(target, rendered):
    tw, th = target.size
    rw, rh = rendered.size
    if abs(rh - th) > 4:
        return 0.0
    canvas = Image.new("L", (max(tw, rw), max(th, rh)), 0)
    a = target.convert("L")
    b = rendered.convert("L")
    # bottom-align
    canvas.paste(a, (0, canvas.size[1] - th))
    other = Image.new("L", canvas.size, 0)
    other.paste(b, (0, canvas.size[1] - rh))
    ap, bp = canvas.load(), other.load()
    inter = union = 0
    for y in range(canvas.size[1]):
        for x in range(canvas.size[0]):
            A = ap[x, y] > 80
            B = bp[x, y] > 80
            if A and B:
                inter += 1
            if A or B:
                union += 1
    return inter / union if union else 0


def best_font(mask, word, fonts, sizes, trackings):
    best = (0, None)
    for path in fonts:
        for size in sizes:
            for tracking in trackings:
                ren, _ = render_word(word, path, size, tracking)
                score = mask_iou(mask, ren)
                width_pen = abs(ren.size[0] - mask.size[0]) / max(1, mask.size[0])
                rank = score - width_pen * 0.15
                if rank > best[0]:
                    best = (rank, (path, size, tracking, round(score, 3), ren.size, mask.size))
    return best


def ink_mask(im, box, tol=22):
    x0, y0, x1, y1 = box
    px = im.load()
    m = Image.new("L", (x1 - x0 + 1, y1 - y0 + 1), 0)
    mp = m.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if near(px[x, y], INK, tol):
                mp[x - x0, y - y0] = 255
    bb = m.getbbox()
    if not bb:
        return m
    return m.crop(bb)


def white_mask(im, box):
    x0, y0, x1, y1 = box
    px = im.load()
    m = Image.new("L", (x1 - x0 + 1, y1 - y0 + 1), 0)
    mp = m.load()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            p = px[x, y]
            if p[0] > 230 and p[1] > 230 and p[2] > 230:
                mp[x - x0, y - y0] = 255
    bb = m.getbbox()
    return m.crop(bb) if bb else m


home = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1788.PNG").convert("RGB")
didi = ink_mask(home, (50, 290, 220, 390), 18)
print("home didi mask", didi.size)
print("home", best_font(didi, "didi", [SEGOEB, ARIALB, SEGOE], range(48, 90), (-2, -1, 0, 1)))

prog = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1789.PNG").convert("RGB")
pd = ink_mask(prog, (100, 1180, 280, 1320), 24)
print("prog mask", pd.size)
print("prog", best_font(pd, "didi", [SEGOEB, SEGOE, ARIALB], range(28, 56), (-1, 0, 1)))

pill_box = (430, 1030, 780, 1100)
wm = white_mask(home, pill_box)
print("pill text mask", wm.size)
print("pill", best_font(wm, "didi is fully grown", [SEGOE, SEGOEB, ARIALB], range(28, 52), (-1, 0, 1, 2)))

notif = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1810.PNG").convert("RGB")
title = ink_mask(notif, (145, 1750, 920, 1794), 30)
print("title mask", title.size)
print("title", best_font(title, "Dumpling is ready when you are", [SEGOEB, SEGOE, ARIALB], range(32, 56), (-1, 0, 1, 2)))

# gray body
px = notif.load()
m = Image.new("L", (900, 80), 0)
mp = m.load()
for y in range(1805, 1885):
    for x in range(110, 1000):
        p = px[x, y]
        if 70 < p[0] < 150 and abs(p[0] - p[1]) < 14 and abs(p[1] - p[2]) < 14:
            mp[x - 110, y - 1805] = 255
bb = m.getbbox()
body = m.crop(bb) if bb else m
print("body mask", body.size, "bbox", bb)
print("body", best_font(body, "Bamw, 15 minutes for your back today.", [SEGOE, SEGOEB, ARIALB], range(28, 50), (-1, 0, 1)))

tag = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1790.PNG").convert("RGB")
tm = white_mask(tag, (490, 558, 690, 590))
print("tag mask", tm.size)
print("tag", best_font(tm, "DUMPLING", [ARIALB, SEGOEB], range(24, 40), (0, 1, 2, 3)))
