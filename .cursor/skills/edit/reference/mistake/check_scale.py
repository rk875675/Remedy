import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
OUT = Path(__file__).parent
TIMES = {"A": [24.5, 25.7, 26.1, 26.7, 29.5, 30.95, 31.1, 31.5]}
TW, TH = 300, 533
font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 22)

sheet = Image.new("RGB", (10 + 8 * (TW + 10), TH + 50), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for row, (name, times) in enumerate(TIMES.items()):
    video = OUT / f"mistake_{name}.mp4"
    for col, t in enumerate(times):
        path = ROOT / "previews" / f"scale_{name}_{t}.png"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(video), "-frames:v", "1", str(path)], check=True)
        img = Image.open(path).convert("RGB").crop((0, 1080, 1080, 1920))
        x, y = 10 + col * (TW + 10), 10 + row * (TH + 40)
        sheet.paste(img.resize((TW, round(img.height * TW / img.width)), Image.LANCZOS), (x, y + 30))
        d.text((x, y), f"{name} {t:.2f}s", font=font, fill="white")
sheet.save(OUT / "check_scale.jpg", quality=88)
print("ok")
