import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
OUT = Path(__file__).parent
TIMES = {"A": [1.0, 6.4, 14.5, 20.5, 24.6, 29.5, 35.9, 39.7, 43.3]}
TW, TH = 240, 427
font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 22)

sheet = Image.new("RGB", (10 + 9 * (TW + 10), TH + 50), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for row, (name, times) in enumerate(TIMES.items()):
    video = OUT / f"mistake_{name}.mp4"
    for col, t in enumerate(times):
        path = ROOT / "previews" / f"chk_{name}_{t}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(video), "-frames:v", "1", str(path)], check=True)
        x, y = 10 + col * (TW + 10), 10 + row * (TH + 40)
        sheet.paste(Image.open(path).convert("RGB").resize((TW, TH), Image.LANCZOS), (x, y + 30))
        d.text((x, y), f"{name} {t:.1f}s", font=font, fill="white")
sheet.save(OUT / "check_sheet.jpg", quality=88)
print("ok")
