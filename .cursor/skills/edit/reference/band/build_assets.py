import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
PREVIEWS = ROOT / "previews"
ASSETS.mkdir(exist_ok=True)
PREVIEWS.mkdir(exist_ok=True)

VIDEO = Path(r"C:\Users\rkuma\OneDrive\ACC2693E-FF14-4D9A-898A-64992EFE0BA4.MP4")
PUBMED = PREVIEWS / "pubmed_band.png"
PUBMED_CROP = (150, 25, 1250, 505)
# Jaspinder Singh on Unsplash (Unsplash License): unsplash.com/photos/vpVE1Xk1eR4
HOOK_PHOTO = PREVIEWS / "yoga_d.jpg"
W, H = 1080, 1920
BOX_W = 920
BOX_TOP = 1300
GREEN = (51, 102, 63)
INK = (20, 20, 20)
MUTED = (120, 120, 120)
TRACK = (232, 232, 228)

BOLD = r"C:\Windows\Fonts\segoeuib.ttf"
SEMI = r"C:\Windows\Fonts\seguisb.ttf"


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def rounded_card(w: int, h: int, radius: int = 40) -> Image.Image:
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle((0, 0, w - 1, h - 1), radius, fill=(255, 255, 255, 255))
    return card


def with_shadow(card: Image.Image) -> Image.Image:
    pad = 30
    out = Image.new("RGBA", (card.width + pad * 2, card.height + pad * 2), (0, 0, 0, 0))
    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 90), (pad, pad + 8, pad + card.width, pad + card.height + 8), card.split()[3])
    out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(16)))
    out.alpha_composite(card, (pad, pad))
    return out


def paper_card() -> Image.Image:
    shot = Image.open(PUBMED).convert("RGBA").crop(PUBMED_CROP)
    inner = BOX_W - 60
    shot = shot.resize((inner, round(shot.height * inner / shot.width)), Image.LANCZOS)
    card = rounded_card(BOX_W, shot.height + 60)
    card.alpha_composite(shot, (30, 30))
    return card


def hook_card() -> Image.Image:
    photo = Image.open(HOOK_PHOTO).convert("RGBA")
    h = 560
    scale = BOX_W / photo.width
    photo = photo.resize((BOX_W, round(photo.height * scale)), Image.LANCZOS)
    top = (photo.height - h) // 2
    photo = photo.crop((0, top, BOX_W, top + h))
    mask = Image.new("L", (BOX_W, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, BOX_W - 1, h - 1), 40, fill=255)
    card = Image.new("RGBA", (BOX_W, h), (0, 0, 0, 0))
    card.paste(photo, (0, 0), mask)
    return card


def groups_card(rows: int) -> Image.Image:
    labels = ["Built strength", "Core and stretch class"]
    row_h = 130
    card = rounded_card(BOX_W, 60 + row_h * rows)
    d = ImageDraw.Draw(card)
    for i, label in enumerate(labels[:rows]):
        y = 30 + i * row_h
        d.ellipse((50, y + 30, 120, y + 100), fill=GREEN if i == 0 else INK)
        d.text((85, y + 65), str(i + 1), font=font(BOLD, 40), fill="white", anchor="mm")
        d.text((150, y + 65), label, font=font(BOLD, 52), fill=INK, anchor="lm")
    return card


DOT_ROWS = [("Built strength", 36, 3, GREEN), ("Stretch class", 30, 10, INK)]
COLS = 18


def dots_card(rows: int = 2, lit: tuple[int, int] = (3, 10), counts: tuple[bool, bool] = (True, True)) -> Image.Image:
    """One dot per person. Lit dots are the ones who flared up bad enough to go in for care."""
    left, right = 50, BOX_W - 50
    pitch = (right - left) / COLS
    dot = round(pitch * 0.72)
    block = 70 + 2 * round(pitch)
    card = rounded_card(BOX_W, 40 + 70 + block * rows)
    d = ImageDraw.Draw(card)
    d.text((BOX_W // 2, 58), "Flared up and went in for care", font=font(BOLD, 40), fill=INK, anchor="mm")
    for r, (label, total, hit, color) in enumerate(DOT_ROWS[:rows]):
        y = 110 + r * block
        d.text((left, y), label, font=font(BOLD, 40), fill=INK, anchor="lt")
        if counts[r]:
            d.text((right, y), f"{hit} of {total}", font=font(BOLD, 40), fill=color, anchor="rt")
        for i in range(total):
            cx = left + pitch * (i % COLS) + pitch / 2
            cy = y + 62 + pitch * (i // COLS) + pitch / 2
            fill = color if i < lit[r] else TRACK
            d.ellipse((cx - dot / 2, cy - dot / 2, cx + dot / 2, cy + dot / 2), fill=fill)
    return card


def frame_at(t: float) -> Image.Image:
    path = PREVIEWS / f"raw_{t:.2f}.png"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(VIDEO), "-frames:v", "1", str(path)],
        check=True,
    )
    return Image.open(path).convert("RGBA")


def place(frame: Image.Image, card: Image.Image) -> Image.Image:
    out = frame.copy()
    shadowed = with_shadow(card)
    out.alpha_composite(shadowed, ((W - shadowed.width) // 2, BOX_TOP - 30))
    return out


def main() -> None:
    cards = {
        "0_hook": (hook_card(), 2.6),
        "1_paper": (paper_card(), 7.0),
        "2_groups_row1": (groups_card(1), 12.8),
        "3_groups_both": (groups_card(2), 14.4),
        "4_dots_empty": (dots_card(1, (0, 0), (False, False)), 16.4),
        "5_dots_three": (dots_card(1, (3, 0), (True, False)), 19.0),
        "6_dots_both": (dots_card(2, (3, 10), (True, True)), 25.4),
    }
    shots = []
    for name, (card, t) in cards.items():
        card.save(ASSETS / f"{name}.png")
        preview = place(frame_at(t), card)
        preview.convert("RGB").save(PREVIEWS / f"{name}.jpg", quality=88)
        shots.append(preview)

    thumb_w = 360
    thumb_h = round(H * thumb_w / W)
    sheet = Image.new("RGB", (thumb_w * len(shots) + 10 * (len(shots) + 1), thumb_h + 20), (30, 30, 30))
    for i, img in enumerate(shots):
        sheet.paste(img.convert("RGB").resize((thumb_w, thumb_h), Image.LANCZOS), (10 + i * (thumb_w + 10), 10))
    sheet.save(PREVIEWS / "contact_sheet.jpg", quality=88)


if __name__ == "__main__":
    main()
