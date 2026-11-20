from PIL import Image, ImageDraw, ImageFont

INK = (28, 28, 30)


def near_ink(p, tol=28):
    r, g, b = p[:3]
    return abs(r - INK[0]) <= tol and abs(g - INK[1]) <= tol and abs(b - INK[2]) <= tol and max(r, g, b) < 80


im = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1790.PNG").convert("RGB")
w, h = im.size
px = im.load()

rows = []
for y in range(200, 1600):
    x = 0
    best = None
    while x < w:
        if near_ink(px[x, y]):
            x0 = x
            while x < w and near_ink(px[x, y]):
                x += 1
            if 140 <= (x - x0) <= 280:
                if best is None or (x - x0) > (best[1] - best[0]):
                    best = (x0, x - 1)
        else:
            x += 1
    if best:
        rows.append((y, best[0], best[1]))

long_rows = [r for r in rows if (r[2] - r[1]) >= 200]
print("rows", rows[0], rows[-1], "n", len(rows), "long", len(long_rows))
y0, y1 = rows[0][0], rows[-1][0]
starts = sorted(r[1] for r in long_rows)
ends = sorted(r[2] for r in long_rows)
x0 = starts[len(starts) // 2]
x1 = ends[len(ends) // 2]
print("bbox", x0, y0, x1, y1, "w", x1 - x0 + 1, "h", y1 - y0 + 1)

whites = []
for y in range(y0 + 4, y1 - 2):
    for x in range(x0 + 8, x1 - 8):
        r, g, b = px[x, y]
        if r > 230 and g > 230 and b > 230:
            whites.append((x, y))
wx0 = min(p[0] for p in whites)
wx1 = max(p[0] for p in whites)
wy0 = min(p[1] for p in whites)
wy1 = max(p[1] for p in whites)
print("text", wx0, wy0, wx1, wy1, "tw", wx1 - wx0 + 1, "th", wy1 - wy0 + 1)
print("padL", wx0 - x0, "padR", x1 - wx1, "padT", wy0 - y0, "padB", y1 - wy1)

tw = wx1 - wx0 + 1
th = wy1 - wy0 + 1
target = Image.new("L", (tw, th), 0)
tp = target.load()
for x, y in whites:
    tp[x - wx0, y - wy0] = 255
target.save(r"C:\Users\rkuma\remedy\tmp\dumpling_text.png")

fonts = {
    "segoeb": r"C:\Windows\Fonts\segoeuib.ttf",
    "segoe": r"C:\Windows\Fonts\segoeui.ttf",
    "arialb": r"C:\Windows\Fonts\arialbd.ttf",
    "arialnb": r"C:\Windows\Fonts\ARIALNB.TTF",
}


def render(path, size, tracking, word="DUMPLING"):
    font = ImageFont.truetype(path, size)
    widths = []
    for ch in word:
        bbox = font.getbbox(ch)
        widths.append(bbox[2] - bbox[0])
    total = sum(widths) + tracking * (len(word) - 1)
    img = Image.new("L", (total + 20, size * 3), 0)
    dr = ImageDraw.Draw(img)
    x = 8
    for ch, cw in zip(word, widths):
        bb = font.getbbox(ch)
        dr.text((x - bb[0], 8 - bb[1]), ch, font=font, fill=255)
        x += cw + tracking
    bbox = img.getbbox()
    return img.crop(bbox)


best = []
for name, path in fonts.items():
    for size in range(18, 40):
        for tracking in (0, 1, 2, 3):
            ren = render(path, size, tracking)
            if abs(ren.size[1] - th) > 3:
                continue
            width_err = abs(ren.size[0] - tw)
            canvas = Image.new("L", (tw, th), 0)
            src = ren
            if src.size[1] != th:
                # align cap boxes by cropping or padding vertically
                canvas_h = Image.new("L", (src.size[0], th), 0)
                oy = max(0, (th - src.size[1]) // 2)
                if src.size[1] <= th:
                    canvas_h.paste(src, (0, oy))
                else:
                    crop_y = (src.size[1] - th) // 2
                    canvas_h.paste(src.crop((0, crop_y, src.size[0], crop_y + th)), (0, 0))
                src = canvas_h
            if src.size[0] <= tw:
                canvas.paste(src, (0, 0))
            else:
                canvas.paste(src.crop((0, 0, tw, th)), (0, 0))
            inter = 0
            union = 0
            a = target.load()
            b = canvas.load()
            for y in range(th):
                for x in range(min(tw, src.size[0])):
                    A = a[x, y] > 128
                    B = b[x, y] > 128
                    if A and B:
                        inter += 1
                    if A or B:
                        union += 1
            iou = inter / union if union else 0
            best.append((round(iou, 3), -width_err, name, size, tracking, ren.size))

best.sort(reverse=True)
print("TOP")
for row in best[:15]:
    print(row)

print("target size", tw, th)
iou, _, name, size, tracking, raw = best[0]
ren = render(fonts[name], size, tracking)
strip_w = max(tw, ren.size[0]) + 4
strip = Image.new("RGB", (strip_w, th + ren.size[1] + 12), (0, 0, 0))
strip.paste(target.convert("RGB"), (0, 0))
strip.paste(ren.convert("RGB"), (0, th + 8))
strip.save(r"C:\Users\rkuma\remedy\tmp\font_compare.png")
print("saved compare", name, size, tracking, ren.size)
