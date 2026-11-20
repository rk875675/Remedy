from PIL import Image

INK = (28, 28, 30)

def near(p, target, tol):
    return all(abs(p[i] - target[i]) <= tol for i in range(3))

im = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1788.PNG").convert("RGB")
px = im.load()
# print a column sample through the name area
print("home samples")
for y in (320, 340, 360, 380, 400, 420, 440):
    row = []
    for x in range(40, 700, 40):
        row.append((x, px[x, y]))
    print(y, row)

print("--- progress name card ---")
im2 = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1789.PNG").convert("RGB")
px2 = im2.load()
for y in (1100, 1180, 1220, 1260, 1300, 1340):
    dark = [x for x in range(60, 500) if near(px2[x, y], INK, 20)]
    if dark:
        print(y, "ink", dark[0], dark[-1], "n", len(dark), "sample", px2[dark[0], y])

print("--- home white pill ---")
for y in range(980, 1120, 4):
    whites = [x for x in range(300, 900) if px[x, y][0] > 240 and px[x, y][1] > 240 and px[x, y][2] > 240]
    if len(whites) > 20:
        print(y, whites[0], whites[-1], len(whites), "bg", px[whites[0]-8, y] if whites[0] > 8 else None)

print("--- notif ink lower ---")
im3 = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1810.PNG").convert("RGB")
px3 = im3.load()
for y in range(1600, 1950, 3):
    dark = [x for x in range(80, 1000) if near(px3[x, y], INK, 22)]
    gray = [x for x in range(80, 1000) if near(px3[x, y], (107, 107, 107), 24) and px3[x, y][0] < 160]
    if len(dark) > 15 or len(gray) > 15:
        print(y, "ink", (dark[0], dark[-1], len(dark)) if dark else None, "gray", (gray[0], gray[-1], len(gray)) if gray else None)
