"""Crop just the phone and scrub leftover UI/chrome from composite."""
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import numpy as np
from pathlib import Path

gen_path = Path(r"C:\Users\rkuma\.cursor\projects\c-Users-rkuma-remedy\assets\remedy_phone_clean.png")
remedy_path = Path(
    r"C:\Users\rkuma\.cursor\projects\c-Users-rkuma-remedy\assets\c__Users_rkuma_AppData_Roaming_Cursor_User_workspaceStorage_a9dd92b1a24df54166d57c6ec6e63509_images_remedy_icon-d406f352-5a83-45ad-88d2-55e94381ee0d.png"
)
orig_path = Path(
    r"C:\Users\rkuma\.cursor\projects\c-Users-rkuma-remedy\assets\c__Users_rkuma_AppData_Roaming_Cursor_User_workspaceStorage_a9dd92b1a24df54166d57c6ec6e63509_images_image-4202ae53-1ef5-4bb3-9c1a-fec2a34eb641.png"
)

downloads = Path.home() / "Downloads" / "remedy_phone.png"
assets_out = Path(r"C:\Users\rkuma\.cursor\projects\c-Users-rkuma-remedy\assets\remedy_phone.png")
scripts_out = Path(r"c:\Users\rkuma\remedy\scripts\output\remedy_phone.png")

# ---------- Preferred path: precise composite from originals ----------
src = Image.open(orig_path).convert("RGBA")
arr = np.array(src)
rgb = arr[:, :, :3].astype(np.int16)
h, w = rgb.shape[:2]

# Phone starts ~y=185 in original (see probe)
# Find left/right of phone body in that band
band = rgb[190:480, :]
near_black = (band[:, :, 0] < 30) & (band[:, :, 1] < 30) & (band[:, :, 2] < 30)
# Ignore far-right sidebar and far-left blue
col_counts = near_black.sum(axis=0)
# Phone columns: high dark count, excluding edges
valid = np.where(col_counts > 50)[0]
# Drop right sidebar: sidebar starts where darkness continues but color is blue-grey
left = int(valid.min())
right = int(valid.max())
# Trim right if pixels are blueish dark (sidebar)
while right > left:
    col = rgb[200:480, right]
    if (col[:, 2] > col[:, 0] + 15).mean() > 0.3 and col.mean() > 15:
        right -= 1
    elif col.mean() > 40:  # not black phone
        right -= 1
    else:
        break

# Include volume buttons slightly left of body
left = max(0, left - 12)
top = 185
bottom = 498  # above "payment due now" text

# Verify bottom doesn't include text
for y in range(bottom, top, -1):
    row = rgb[y, left:right]
    if ((row[:, 0] < 40) & (row[:, 1] < 40) & (row[:, 2] < 40)).mean() > 0.4:
        bottom = y
        break

phone = src.crop((left, top, right + 1, bottom + 1)).convert("RGBA")
p = np.array(phone)
pr = p[:, :, :3]

# Find purple eye
purple = (
    (pr[:, :, 0] > 70)
    & (pr[:, :, 0] < 210)
    & (pr[:, :, 1] < 120)
    & (pr[:, :, 2] > 100)
    & (pr[:, :, 2] > pr[:, :, 0] - 20)
)
# Restrict to central region (avoid Dynamic Island LEDs)
ph, pw = pr.shape[:2]
mask_region = np.zeros((ph, pw), dtype=bool)
mask_region[int(ph * 0.25) : int(ph * 0.85), int(pw * 0.2) : int(pw * 0.8)] = True
purple &= mask_region
pys, pxs = np.where(purple)
print("purple n", len(pxs), "bbox", pxs.min(), pys.min(), pxs.max(), pys.max())
eye_cx = int(np.median(pxs))
eye_cy = int(np.median(pys))

# Also cover white ring/eyebrow around eye
bright = (pr[:, :, 0] > 200) & (pr[:, :, 1] > 200) & (pr[:, :, 2] > 200)
bright &= (
    (np.abs(np.arange(pw)[None, :] - eye_cx) < 55)
    & (np.abs(np.arange(ph)[:, None] - eye_cy) < 60)
)
# Wipe eye area black
draw = ImageDraw.Draw(phone)
r = 60
draw.ellipse((eye_cx - r, eye_cy - r - 14, eye_cx + r, eye_cy + r + 8), fill=(0, 0, 0, 255))

# Paste remedy icon as circle
remedy = Image.open(remedy_path).convert("RGBA")
icon_size = 100
remedy = remedy.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
alpha = Image.new("L", (icon_size, icon_size), 0)
ImageDraw.Draw(alpha).ellipse((0, 0, icon_size - 1, icon_size - 1), fill=255)
alpha = alpha.filter(ImageFilter.GaussianBlur(0.5))
remedy.putalpha(alpha)
phone.paste(remedy, (eye_cx - icon_size // 2, eye_cy - icon_size // 2 - 2), remedy)

# Upscale 3x for a crisp download
scale = 3
phone_up = phone.resize((phone.width * scale, phone.height * scale), Image.Resampling.LANCZOS)

# White canvas with margin
margin = 48
canvas = Image.new("RGB", (phone_up.width + margin * 2, phone_up.height + margin * 2), (255, 255, 255))
canvas.paste(phone_up.convert("RGB"), (margin, margin))

for path in (downloads, assets_out, scripts_out):
    path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(path, "PNG")
    print("saved", path, canvas.size)

# ---------- Also clean the AI generate (strip blue UI) as alt ----------
gen = Image.open(gen_path).convert("RGB")
g = np.array(gen)
# Find blue selection pixels and replace near edges; crop to phone
# Non-white content
not_white = ~((g[:, :, 0] > 245) & (g[:, :, 1] > 245) & (g[:, :, 2] > 245))
# Exclude saturated blue (UI)
blue = (g[:, :, 2] > 160) & (g[:, :, 0] < 130) & (g[:, :, 1] < 180)
phone_mask = not_white & ~blue
ys, xs = np.where(phone_mask)
# Also exclude very top rows that are only the "Image" label
top_g = int(ys.min())
# Skip label: if top rows are mostly blue-ish or small, start lower
for y in range(0, g.shape[0] // 4):
    row_blue = blue[y].mean()
    row_phone = phone_mask[y].mean()
    if row_phone > 0.05 and row_blue < 0.02:
        top_g = y
        break
bottom_g = int(ys.max())
left_g = int(xs.min())
right_g = int(xs.max())
# Tighten: remove blue border columns
while left_g < right_g and blue[:, left_g].mean() > 0.05:
    left_g += 1
while right_g > left_g and blue[:, right_g].mean() > 0.05:
    right_g -= 1

cropped_gen = gen.crop((left_g, top_g, right_g + 1, bottom_g + 1))
cg = np.array(cropped_gen)
# Scrub any remaining blue pixels to nearest white/black
blue2 = (cg[:, :, 2] > 160) & (cg[:, :, 0] < 130) & (cg[:, :, 1] < 180)
cg[blue2] = [255, 255, 255]

# Cover white pointer near icon: find green circle center
green = (cg[:, :, 1] > 60) & (cg[:, :, 1] > cg[:, :, 0] + 10) & (cg[:, :, 1] > cg[:, :, 2] + 10) & (cg[:, :, 0] < 100)
gys, gxs = np.where(green)
if len(gxs) > 100:
    icx, icy = int(np.median(gxs)), int(np.median(gys))
    # Re-paste remedy icon cleanly over any pointer artifacts
    icon = Image.open(remedy_path).convert("RGBA")
    sz = int(np.sqrt(len(gxs)) * 1.15)
    sz = max(80, min(sz, min(cg.shape[0], cg.shape[1]) // 2))
    icon = icon.resize((sz, sz), Image.Resampling.LANCZOS)
    am = Image.new("L", (sz, sz), 0)
    ImageDraw.Draw(am).ellipse((0, 0, sz - 1, sz - 1), fill=255)
    icon.putalpha(am)
    # Black wipe then paste
    out = Image.fromarray(cg)
    ImageDraw.Draw(out).ellipse((icx - sz // 2 - 4, icy - sz // 2 - 4, icx + sz // 2 + 4, icy + sz // 2 + 4), fill=(0, 0, 0))
    out.paste(icon, (icx - sz // 2, icy - sz // 2), icon)
    # White margin canvas
    m = 40
    final_gen = Image.new("RGB", (out.width + m * 2, out.height + m * 2), (255, 255, 255))
    final_gen.paste(out, (m, m))
    alt = Path.home() / "Downloads" / "remedy_phone_alt.png"
    final_gen.save(alt)
    print("alt saved", alt, final_gen.size)
