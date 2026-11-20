from PIL import Image

INK = (28, 28, 30)

def near(p, target, tol):
    return all(abs(int(p[i]) - target[i]) <= tol for i in range(3))

def ink_bbox(im, x0, y0, x1, y1, tol=16):
    px = im.load()
    xs = []
    ys = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if near(px[x, y], INK, tol):
                xs.append(x)
                ys.append(y)
    if not xs:
        return None
    return min(xs), min(ys), max(xs), max(ys), len(xs)

home = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1788.PNG").convert("RGB")
print("home didi", ink_bbox(home, 40, 280, 320, 430))
home.crop((40, 280, 360, 430)).save(r"C:\Users\rkuma\remedy\tmp\crop_home_didi.png")
home.crop((380, 1000, 860, 1140)).save(r"C:\Users\rkuma\remedy\tmp\crop_home_pill.png")

prog = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1789.PNG").convert("RGB")
print("progress scan")
px = prog.load()
for y in range(1000, 1900, 2):
    xs = [x for x in range(70, 450) if near(px[x, y], INK, 16)]
    if len(xs) > 10:
        print(y, xs[0], xs[-1], len(xs))

notif = Image.open(r"C:\Users\rkuma\OneDrive\IMG_1810.PNG").convert("RGB")
notif.crop((90, 1660, 1100, 1900)).save(r"C:\Users\rkuma\remedy\tmp\crop_notif.png")
print("notif title", ink_bbox(notif, 100, 1720, 1000, 1810, 20))
