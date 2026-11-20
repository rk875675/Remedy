"""Recover the static background plate from real pixels only (no inpainting).

A CapCut overlay meme is a still photo + a moving cutout + static hook text.
Every pixel the character uncovers in at least one frame is recovered exactly
(masked temporal median). Pixels never uncovered stay marked in coverage.png;
those must come from the original photo found online (find_background.py).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np

DIFF_THR = 18
CHUNK_ROWS = 64


def load_frames(video: Path) -> list[np.ndarray]:
    cap = cv2.VideoCapture(str(video))
    frames: list[np.ndarray] = []
    while True:
        ok, f = cap.read()
        if not ok:
            break
        frames.append(f)
    cap.release()
    if not frames:
        raise SystemExit(f"No frames in {video}")
    return frames


def drop_end_cards(frames: list[np.ndarray]) -> list[np.ndarray]:
    """Drop trailing frames whose brightness collapses (black/branding end card)."""
    lum = np.array([float(f.mean()) for f in frames])
    ref = float(np.median(lum))
    keep = len(frames)
    while keep > 1 and lum[keep - 1] < ref * 0.7:
        keep -= 1
    return frames[:keep]


def masked_median(stack: np.ndarray, masks: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """stack: T,H,W,3 uint8; masks: T,H,W bool (True = foreground, excluded)."""
    t, h, w, _ = stack.shape
    plate = np.zeros((h, w, 3), np.uint8)
    count = np.zeros((h, w), np.int32)
    for y0 in range(0, h, CHUNK_ROWS):
        y1 = min(h, y0 + CHUNK_ROWS)
        chunk = stack[:, y0:y1].astype(np.float32)
        m = masks[:, y0:y1]
        chunk[m] = np.nan
        with np.errstate(all="ignore"):
            med = np.nanmedian(chunk, axis=0)
        n = (~m).sum(axis=0)
        med = np.nan_to_num(med, nan=0.0)
        plate[y0:y1] = np.clip(med, 0, 255).astype(np.uint8)
        count[y0:y1] = n
    return plate, count


def fg_masks(stack: np.ndarray, plate: np.ndarray, thr: int = DIFF_THR) -> np.ndarray:
    diff = np.abs(stack.astype(np.int16) - plate[None].astype(np.int16)).max(axis=3)
    masks = diff > thr
    kernel = np.ones((7, 7), np.uint8)
    return np.stack([cv2.dilate(m.astype(np.uint8), kernel, iterations=2) > 0 for m in masks])


def build_plate(video: Path, out_dir: Path, iterations: int = 3) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    frames = drop_end_cards(load_frames(video))
    stack = np.stack(frames)
    plate = np.median(stack, axis=0).astype(np.uint8)
    masks = np.zeros(stack.shape[:3], bool)
    for _ in range(iterations):
        masks = fg_masks(stack, plate)
        plate, count = masked_median(stack, masks)
    known = count >= 3
    plate_vis = plate.copy()
    plate_vis[~known] = (255, 0, 255)
    cv2.imwrite(str(out_dir / "plate_known.png"), plate)
    cv2.imwrite(str(out_dir / "plate_holes_magenta.png"), plate_vis)
    cv2.imwrite(str(out_dir / "coverage.png"), (known * 255).astype(np.uint8))
    report = {
        "frames_used": len(frames),
        "size": [int(plate.shape[1]), int(plate.shape[0])],
        "known_fraction": float(known.mean()),
        "hole_px": int((~known).sum()),
    }
    (out_dir / "plate_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("out_dir")
    args = ap.parse_args()
    print(json.dumps(build_plate(Path(args.video), Path(args.out_dir)), indent=2))


if __name__ == "__main__":
    main()
