import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent
VIDEO = ROOT / "band.mp4"
TIMES = [0.0, 2.6, 7.0, 12.8, 14.4, 16.4, 17.5, 19.5, 23.2, 25.6, 29.0, 33.0]
TW, TH = 240, 427
COLS = 6
font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 22)

rows = (len(TIMES) + COLS - 1) // COLS
sheet = Image.new("RGB", (10 + COLS * (TW + 10), 10 + rows * (TH + 40)), (30, 30, 30))
d = ImageDraw.Draw(sheet)
for i, t in enumerate(TIMES):
    path = ROOT / "previews" / f"chk_{t}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", str(VIDEO), "-frames:v", "1", str(path)], check=True)
    x, y = 10 + (i % COLS) * (TW + 10), 10 + (i // COLS) * (TH + 40)
    sheet.paste(Image.open(path).convert("RGB").resize((TW, TH), Image.LANCZOS), (x, y + 30))
    d.text((x, y), f"{t:.1f}s", font=font, fill="white")
sheet.save(ROOT / "check_sheet.jpg", quality=88)
print("ok")
