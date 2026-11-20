"""Gate a difference matte with subject segmentation.

When the background under a character was never visible, the difference matte
also cuts out pieces of the room there. Keep only matte pixels that a subject
model (rembg) also calls foreground, widened a little so the matte's own edge
stays. Rewrites fg/*.png and motion.gif in the work dir.

  python scripts/meme_decompose/refine_seg.py <format-id> [--model isnet-general-use]
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from matte import drop_end_cards, export_gif, load_frames  # noqa: E402

ROOT = HERE.parent.parent
PUBLIC = ROOT / "apps/web/public/memes/format-library"
WORK_ROOT = ROOT / ".work/meme-decompose"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("format_id")
    ap.add_argument("--model", default="isnet-general-use")
    ap.add_argument("--grow", type=int, default=9)
    ap.add_argument("--gif-fps", type=int, default=20)
    args = ap.parse_args()

    from rembg import new_session, remove

    work = WORK_ROOT / args.format_id
    video = PUBLIC / args.format_id / "00-full-reference.mp4"
    cap = cv2.VideoCapture(str(video))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()
    frames = drop_end_cards(load_frames(video))
    session = new_session(args.model)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (args.grow, args.grow))
    fg_dir = work / "fg"
    hgt, wid = frames[0].shape[:2]
    union = np.zeros((hgt, wid), bool)
    kept: list[float] = []
    started = time.time()
    for i, frame in enumerate(frames):
        fg_path = fg_dir / f"fg_{i:04d}.png"
        rgba = cv2.imread(str(fg_path), cv2.IMREAD_UNCHANGED)
        if rgba is None:
            continue
        seg = np.array(remove(Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)), session=session, only_mask=True))
        gate = cv2.dilate((seg > 90).astype(np.uint8), kernel) > 0
        # Solid subject interior: the difference matte drops pixels that match the room's colour.
        core = cv2.erode((seg > 200).astype(np.uint8), np.ones((5, 5), np.uint8)) > 0
        before = (rgba[:, :, 3] >= 128).sum()
        holes = core & (rgba[:, :, 3] < 128)
        rgba[:, :, :3][holes] = frame[holes]
        rgba[:, :, 3] = np.where(gate, rgba[:, :, 3], 0)
        rgba[:, :, 3][core] = 255
        after = (rgba[:, :, 3] >= 128).sum()
        kept.append(float(after) / max(1, before))
        union |= rgba[:, :, 3] >= 128
        cv2.imwrite(str(fg_path), rgba)
        if i % 50 == 0:
            print(f"{args.format_id} frame {i}/{len(frames)} kept {kept[-1]:.2f} ({time.time() - started:.0f}s)", flush=True)

    ys, xs = np.where(union)
    pad = 4
    x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x1, y1 = min(wid, xs.max() + pad), min(hgt, ys.max() + pad)
    bbox = (int(x0), int(y0), int(x1 - x0), int(y1 - y0))
    export_gif(fg_dir, len(frames), bbox, work / "motion.gif", args.gif_fps, src_fps)

    report_path = work / "matte_report.json"
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report.update({
        "segmentation_gate": args.model,
        "seg_kept_mean": float(np.mean(kept)),
        "gif_bbox_xywh": list(bbox),
        "gif_bytes": (work / "motion.gif").stat().st_size,
    })
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    tiles = []
    for i in np.linspace(0, len(frames) - 1, 5).astype(int):
        f = cv2.imread(str(fg_dir / f"fg_{i:04d}.png"), cv2.IMREAD_UNCHANGED)
        a = (f[:, :, 3] >= 128)[..., None].astype(np.float32)
        green = np.full(f.shape[:2] + (3,), (60, 200, 60), np.float32)
        tiles.append((f[:, :, :3] * a + green * (1 - a)).astype(np.uint8))
    out = PUBLIC / args.format_id / "_verify" / "qa_motion_on_green.jpg"
    cv2.imwrite(str(out), cv2.resize(np.hstack(tiles), None, fx=0.5, fy=0.5), [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(json.dumps({k: report[k] for k in ("seg_kept_mean", "gif_bbox_xywh", "gif_bytes")}))


if __name__ == "__main__":
    main()
