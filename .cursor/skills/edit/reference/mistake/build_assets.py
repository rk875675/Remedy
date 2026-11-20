import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).parent
ASSETS = ROOT / "assets"
PREVIEWS = ROOT / "previews"
ASSETS.mkdir(exist_ok=True)
PREVIEWS.mkdir(exist_ok=True)

VIDEO = Path(r"C:\Users\rkuma\OneDrive\3D1536FF-DEE6-4C35-89F3-4560E1111C86.MP4")
PUBMED = Path(r"C:\Users\rkuma\AppData\Local\Temp\cursor\screenshots\pubmed_heading.png")
W, H = 1080, 1920
BOX_W = 920
BOX_TOP = 1400
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
    shot = Image.open(PUBMED).convert("RGBA")
    shot = shot.crop((0, 20, shot.width, 400))
    inner = BOX_W - 60
    shot = shot.resize((inner, round(shot.height * inner / shot.width)), Image.LANCZOS)
    card = rounded_card(BOX_W, shot.height + 60)
    card.alpha_composite(shot, (30, 30))
    return card


def groups_card(rows: int) -> Image.Image:
    labels = ["Talked through the fear", "Kept their normal routine"]
    row_h = 130
    card = rounded_card(BOX_W, 60 + row_h * rows)
    d = ImageDraw.Draw(card)
    for i, label in enumerate(labels[:rows]):
        y = 30 + i * row_h
        d.ellipse((50, y + 30, 120, y + 100), fill=GREEN if i == 0 else INK)
        d.text((85, y + 65), str(i + 1), font=font(BOLD, 40), fill="white", anchor="mm")
        d.text((150, y + 65), label, font=font(BOLD, 52), fill=INK, anchor="lm")
    return card


def scale_card(filled: int = 2, settled: bool = True) -> Image.Image:
    """filled cells from 0 upward are dark; settled turns the filled cells green."""
    card = rounded_card(BOX_W, 300)
    d = ImageDraw.Draw(card)
    d.text((BOX_W // 2, 64), "Rate your pain", font=font(BOLD, 46), fill=INK, anchor="mm")
    n, gap, left = 11, 10, 40
    cell = (BOX_W - left * 2 - gap * (n - 1)) // n
    for i in range(n):
        x = left + i * (cell + gap)
        lit = i < filled
        color = (GREEN if settled else INK) if lit else TRACK
        d.rounded_rectangle((x, 130, x + cell, 130 + cell), 16, fill=color)
        d.text((x + cell // 2, 130 + cell // 2), str(i), font=font(BOLD, 36), fill="white" if lit else MUTED, anchor="mm")
    d.text((left, 270), "no pain", font=font(SEMI, 28), fill=MUTED, anchor="lm")
    d.text((BOX_W - left, 270), "worst pain", font=font(SEMI, 28), fill=MUTED, anchor="rm")
    return card


def bars_card() -> Image.Image:
    rows = [("Talked through the fear", 33, GREEN), ("Kept their normal routine", 5, INK)]
    card = rounded_card(BOX_W, 360)
    d = ImageDraw.Draw(card)
    left, right = 50, BOX_W - 50
    for i, (label, n, color) in enumerate(rows):
        y = 40 + i * 160
        d.text((left, y), label, font=font(BOLD, 42), fill=INK, anchor="lt")
        d.text((right, y + 4), f"{n} of 50", font=font(BOLD, 42), fill=color, anchor="rt")
        d.rounded_rectangle((left, y + 70, right, y + 120), 25, fill=TRACK)
        d.rounded_rectangle((left, y + 70, left + max(50, round((right - left) * n / 50)), y + 120), 25, fill=color)
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
        "1_paper": (paper_card(), 7.0),
        "2_groups_row1": (groups_card(1), 16.0),
        "3_groups_both": (groups_card(2), 21.0),
        "4_scale": (scale_card(), 25.6),
        "5_bars": (bars_card(), 35.8),
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
