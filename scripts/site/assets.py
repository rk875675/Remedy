"""Builds website image assets. Run after `node scripts/build-site.mjs` (it writes og-jobs.json).

python scripts/site/assets.py
"""
import json
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
WEB = ROOT / "website"
ASSETS = WEB / "assets"
FONTS = Path("C:/Windows/Fonts")

BG = (246, 237, 224)  # constants/colors.ts background #F6EDE0
PRIMARY = (62, 107, 78)  # #3E6B4E
PRIMARY_MUTED = (231, 239, 233)
TEXT = (28, 28, 30)
TEXT_2 = (92, 86, 82)
BORDER = (229, 216, 198)  # #E5D8C6
BRAND_LOGO = ROOT / "assets" / "brand" / "logo.png"
PET_DIR = ROOT / "assets" / "pet"
# Poses used on OG cards, picked per page key so the cards are not all identical.
OG_PETS = ["s5_celebrating", "s4_ready", "s3_proud", "s5_ready", "s3_celebrating", "s4_proud", "s5_proud", "s3_ready"]

# Pet-era app screenshots. The raw 1206x2622 phone screenshots live in the growth-engine
# screenshot library (read only from here). The status bar and dynamic island are cropped off.
SRC = ROOT / "growth-engine" / "assets" / "screenshots"
STATUS_BAR = 58  # px at the 470px output width
SCREEN_W, SCREEN_H = 470, 966
SCREENS = {
    "home": "home_arnie_standing.png",  # Arnie standing, 1 session until he grows, today's session
    "session": "exercise_glute_bridge.png",  # Glute Bridge, set 1 of 3, Arnie coaching
    "session_preview": "session_preview_w2s3.png",  # Week 2 session 3, 19 min, 5 exercises
    "pain_check": "pain_check_before_5.png",  # slider at 5, Arnie: Noticeable. We'll take it easy.
    "workout_days": "workout_days_sheet.png",  # Tuesday, Friday, Sunday, 3 of 3
    "cat_cow": "exercise_cat_cow.png",
    "bird_dog": "exercise_bird_dog.png",
    "childs_pose": "exercise_childs_pose.png",
    "squat": "exercise_squat.png",
    # Full Progress tab: This week 0/3, Arnie fully grown, stage strip. Pain tab is not selected, so no trend chart.
    "progress": "progress_arnie_week.png",
}


def save_screen(im, name, out):
    im = im.resize((SCREEN_W, round(im.height * SCREEN_W / im.width)), Image.LANCZOS)
    im.save(out / f"{name}.webp", "WEBP", quality=82, method=6)
    for width in (240, 360):
        small = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        small.save(out / f"{name}-{width}.webp", "WEBP", quality=80, method=6)


def screens():
    out = ASSETS / "screens"
    out.mkdir(parents=True, exist_ok=True)
    for name, file in SCREENS.items():
        im = Image.open(SRC / file).convert("RGB")
        im = im.resize((SCREEN_W, SCREEN_H + STATUS_BAR), Image.LANCZOS).crop((0, STATUS_BAR, SCREEN_W, SCREEN_H + STATUS_BAR))
        save_screen(im, name, out)


def logos():
    # Source of truth is the app logo (assets/brand/logo.png, 1024px, full-bleed green).
    brand = Image.open(BRAND_LOGO).convert("RGB")
    brand.resize((512, 512), Image.LANCZOS).save(ASSETS / "logo.png", optimize=True)
    for size, name in [(64, "logo-64.png"), (512, "logo-512.png"), (192, "icon-192.png"), (340, "logo-340.png"), (180, "apple-touch-icon.png"), (48, "favicon.png")]:
        brand.resize((size, size), Image.LANCZOS).save(ASSETS / name, optimize=True)
    for size, name in [(340, "logo-340.webp"), (180, "apple-touch-icon.webp")]:
        brand.resize((size, size), Image.LANCZOS).save(ASSETS / name, "WEBP", quality=88, method=6)


def pet_cut(name, height):
    """Pet drawing cropped to its visible pixels, scaled to the given height (RGBA)."""
    im = Image.open(PET_DIR / f"{name}.png").convert("RGBA")
    im = im.crop(im.split()[-1].getbbox())
    return im.resize((round(im.width * height / im.height), height), Image.LANCZOS)


def pets():
    """Website pet art: hero, the five growth stages, in webp with alpha."""
    out = ASSETS / "pet"
    out.mkdir(parents=True, exist_ok=True)
    pet_cut("s5_celebrating", 640).save(out / "hero.webp", "WEBP", quality=88, method=6)
    # Transactional emails (supabase/email-templates/layout.mjs): 2x of a 62x84 slot, PNG for mail clients.
    pet_cut("s5_celebrating", 168).save(out / "email-pet.png", optimize=True)
    for stage in range(1, 6):
        # The app art is drawn on one shared 768px canvas, so scaling the whole canvas keeps
        # the five stages in proportion to each other.
        im = Image.open(PET_DIR / f"s{stage}_ready.png").convert("RGBA").crop((0, 40, 768, 760))
        im = im.resize((320, round(320 * im.height / im.width)), Image.LANCZOS)
        im.save(out / f"stage-{stage}.webp", "WEBP", quality=88, method=6)


def founder_photo():
    dest = ASSETS / "rahul.webp"
    if dest.exists():
        return
    req = urllib.request.Request(
        "https://relentlesstough.com/assets/img/rahul.webp",
        headers={"User-Agent": "Mozilla/5.0 remedy-site-build"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    tmp = ASSETS / "rahul-src.webp"
    tmp.write_bytes(data)
    im = Image.open(tmp).convert("RGB")
    side = min(im.size)
    left = (im.width - side) // 2
    top = max(0, (im.height - side) // 3)
    im = im.crop((left, top, left + side, top + side)).resize((320, 320), Image.LANCZOS)
    im.save(dest, "WEBP", quality=82, method=6)
    tmp.unlink()


def font(name, size):
    return ImageFont.truetype(str(FONTS / name), size)


def wrap(draw, text, fnt, width):
    words, lines, line = text.split(), [], ""
    for w in words:
        trial = f"{line} {w}".strip()
        if draw.textlength(trial, font=fnt) <= width:
            line = trial
        else:
            lines.append(line)
            line = w
    lines.append(line)
    return lines


def rounded(im, radius):
    mask = Image.new("L", im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, im.width, im.height), radius, fill=255)
    out = Image.new("RGBA", im.size)
    out.paste(im, (0, 0), mask)
    return out


def og_pet_panel(im, d, pet_name):
    """Forest-green panel on the right with the armadillo standing on its bottom edge."""
    d.rounded_rectangle((790, -40, 1240, 670), 48, fill=PRIMARY)
    pet = pet_cut(pet_name, 500)
    im.paste(pet, (790 + (410 - pet.width) // 2 + 20, 630 - pet.height - 36), pet)


def og_image(job, pet_name, logo):
    W, H = 1200, 630
    im = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(im)
    og_pet_panel(im, d, pet_name)

    x = 72
    small = logo.resize((44, 44), Image.LANCZOS)
    im.paste(small, (x, 64), small)
    d.text((x + 58, 70), "Remedy", font=font("georgiab.ttf", 30), fill=TEXT)

    kicker = (job.get("kicker") or "Back pain guide").upper()
    d.text((x, 178), kicker, font=font("seguisb.ttf", 22), fill=PRIMARY)

    title = job["title"] or "Remedy"
    size = 64
    while size > 38:
        f = font("georgiab.ttf", size)
        lines = wrap(d, title, f, 660)
        if len(lines) <= 3:
            break
        size -= 4
    y = 220
    for line in lines:
        d.text((x, y), line, font=f, fill=TEXT)
        y += int(size * 1.18)

    d.line((x, 520, x + 56, 520), fill=PRIMARY, width=4)
    d.text((x, 540), "remedyrecoveries.com  ·  iPhone back fitness program", font=font("segoeui.ttf", 22), fill=TEXT_2)
    return im


def og_images():
    jobs_file = ROOT / "scripts" / "site" / "og-jobs.json"
    jobs = json.loads(jobs_file.read_text(encoding="utf-8"))
    out = ASSETS / "og"
    out.mkdir(parents=True, exist_ok=True)
    logo = Image.open(ASSETS / "logo.png").convert("RGBA")
    for job in jobs:
        key = job["key"]
        pet_name = "s5_celebrating" if key == "home" else OG_PETS[sum(map(ord, key)) % len(OG_PETS)]
        og_image(job, pet_name, logo).save(out / f"{key}.png", optimize=True)
    print(f"{len(jobs)} OG images")


def og_default():
    """Site-wide fallback card (assets/og-1200.png and .webp)."""
    logo = Image.open(ASSETS / "logo.png").convert("RGBA")
    im = Image.new("RGB", (1200, 630), BG)
    d = ImageDraw.Draw(im)
    og_pet_panel(im, d, "s5_celebrating")
    d.rectangle((0, 0, 16, 630), fill=PRIMARY)
    x = 72
    small = logo.resize((56, 56), Image.LANCZOS)
    im.paste(small, (x, 150), small)
    d.text((x, 228), "Remedy", font=font("georgiab.ttf", 96), fill=PRIMARY)
    d.text((x, 350), "A back pain app", font=font("georgia.ttf", 48), fill=TEXT)
    d.text((x, 410), "for iPhone", font=font("georgia.ttf", 48), fill=TEXT)
    d.text((x, 500), "Short daily sessions, and an armadillo.", font=font("segoeui.ttf", 26), fill=TEXT_2)
    im.save(ASSETS / "og-1200.png", optimize=True)
    im.save(ASSETS / "og-1200.webp", "WEBP", quality=85, method=6)


if __name__ == "__main__":
    # screens() reads the growth-engine screenshot library, so it only runs with --screens.
    import sys
    if "--screens" in sys.argv:
        screens()
    logos()
    pets()
    founder_photo()
    og_images()
    og_default()
