"""python measure.py <video> -> where his burned captions sit, when the header leaves, and BOX_TOP."""
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).parent
FRAMES = ROOT / "previews"
FRAMES.mkdir(exist_ok=True)
video = sys.argv[1]
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video],
                           capture_output=True, text=True, check=True).stdout)


def white_rows(path: Path, y0: int, y1: int) -> list[int]:
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    rows = (a.min(axis=2) > 235)[:, 200:880].sum(axis=1)
    return [y for y in range(y0, y1) if rows[y] > 40]


tops, bottoms, header_on = [], [], []
t = 0.5
while t < dur - 0.3:
    path = FRAMES / f"m_{t:.1f}.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(t), "-i", video, "-frames:v", "1", str(path)], check=True)
    cap = white_rows(path, 800, 1600)
    if cap:
        tops.append(cap[0])
        bottoms.append(cap[-1])
    if len(white_rows(path, 80, 600)) > 30:
        header_on.append(t)
    t += 1.0

cap_top, cap_bottom = int(np.median(tops)), int(np.percentile(bottoms, 90))
box_top = int(round((cap_bottom + 88) / 10) * 10)
print(f"captions y {cap_top}-{cap_bottom}  (seen in {len(tops)} frames)")
print(f"header last seen at {max(header_on) if header_on else 'never'} s")
print(f"BOX_TOP = {box_top}")
