"""Cut the moving overlay out of a CapCut meme using the verified clean background.

Inputs (from plate.py + match_background.py in <work_dir>):
  plate_known.png, coverage.png, bg_original.*, bg_source.json (homography _h)
Reference per pixel = clean background, except where the meme burned in static
overlays (hook text, emoji) -> the recovered plate. Anything that differs from
the reference in a frame is the character. A segmentation model is only used as
a tie-breaker for character pixels that happen to match the background colour.

Outputs in <work_dir>:
  clean_bg_frame.png  clean background warped to the video frame (576x1024)
  overlay_mask.png    burned-in static text/emoji
  fg/fg_%04d.png      RGBA cutout per frame (full frame, positions preserved)
  motion.gif          ffmpeg shared-palette GIF (cropped to union bbox)
  matte_report.json   QA numbers
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np

from plate import drop_end_cards, load_frames

T_LO = 16.0
HOLE_SPECK_PX = 24
HOLE_GAP_MAX_DIFF = 8.0


def warp_clean(work: Path, size: tuple[int, int]) -> np.ndarray:
    src = json.loads((work / "bg_source.json").read_text(encoding="utf-8"))
    orig_path = next(p for p in (work / "bg_original.png", work / "bg_original.jpg") if p.exists())
    orig = cv2.imread(str(orig_path))
    h = np.array(src["_h"], np.float64)
    s = float(np.sqrt(abs(np.linalg.det(h[:2, :2]))))
    small = cv2.resize(orig, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else orig
    if s < 1:
        h = h @ np.diag([1 / s, 1 / s, 1.0])
    return cv2.warpPerspective(small, h, size, flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def color_match(clean: np.ndarray, plate: np.ndarray, sel: np.ndarray) -> np.ndarray:
    """Affine colour fit clean->plate on trusted pixels (TikTok re-encode shifts colour)."""
    x = clean[sel].reshape(-1, 3).astype(np.float64)
    y = plate[sel].reshape(-1, 3).astype(np.float64)
    a = np.hstack([x, np.ones((len(x), 1))])
    coef, *_ = np.linalg.lstsq(a, y, rcond=None)
    flat = np.hstack([clean.reshape(-1, 3).astype(np.float64), np.ones((clean.size // 3, 1))]) @ coef
    return np.clip(flat, 0, 255).reshape(clean.shape).astype(np.uint8)


def fill_holes(mask: np.ndarray, diff: np.ndarray) -> np.ndarray:
    """Fill enclosed holes unless they truly match the background.

    Measured on real clips: genuine gaps (between hair strands, arm loops) have
    median diff 3-6 (= compression noise); character pixels that merely resemble
    the background (white shirt over white floor) sit at 10+.
    """
    inv = (mask == 0).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(inv, 4)
    out = mask.copy()
    h, w = mask.shape
    for i in range(1, n):
        x, y, bw, bh, area = stats[i]
        if x == 0 or y == 0 or x + bw >= w or y + bh >= h:
            continue
        region = lab == i
        if area <= HOLE_SPECK_PX or float(np.median(diff[region])) > HOLE_GAP_MAX_DIFF:
            out[region] = 255
    return out


def keep_main(mask: np.ndarray, min_frac: float = 0.02) -> np.ndarray:
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    if n <= 1:
        return mask
    areas = stats[1:, cv2.CC_STAT_AREA]
    big = areas.max()
    keep = np.zeros(n, bool)
    keep[1:] = areas >= big * min_frac
    return np.where(keep[lab], 255, 0).astype(np.uint8)


def support_mask(frame: np.ndarray, ref: np.ndarray) -> np.ndarray:
    blur_f = cv2.GaussianBlur(frame, (3, 3), 0).astype(np.int16)
    blur_r = cv2.GaussianBlur(ref, (3, 3), 0).astype(np.int16)
    diff = np.abs(blur_f - blur_r).max(axis=2)
    hard = (diff > T_LO).astype(np.uint8) * 255
    hard = cv2.morphologyEx(hard, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    hard = keep_main(hard)
    return fill_holes(hard, diff)


def solve_alpha(frame: np.ndarray, ref: np.ndarray, hard: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Known-background matting: alpha = (C-B).(F-B)/|F-B|^2 with F propagated from the core."""
    core = cv2.erode(hard, np.ones((3, 3), np.uint8), iterations=2)
    band = (cv2.dilate(hard, np.ones((3, 3), np.uint8), iterations=1) > 0) & (core == 0)
    f_est = cv2.inpaint(frame, band.astype(np.uint8) * 255, 4, cv2.INPAINT_TELEA) if band.any() else frame
    c = frame.astype(np.float32)
    b = ref.astype(np.float32)
    fb = f_est.astype(np.float32) - b
    denom = (fb * fb).sum(axis=2)
    num = ((c - b) * fb).sum(axis=2)
    a_band = np.where(denom > 400.0, num / np.maximum(denom, 1e-3), (hard > 0).astype(np.float32))
    a_band = np.clip(a_band, 0.0, 1.0)
    alpha = np.where(core > 0, 1.0, np.where(band, a_band, 0.0)).astype(np.float32)
    a3 = np.maximum(alpha, 0.05)[..., None]
    decont = np.clip(b + (c - b) / a3, 0, 255)
    color = np.where(band[..., None] & (alpha[..., None] > 0), decont, c).astype(np.uint8)
    return (alpha * 255).astype(np.uint8), color


def export_gif(fg_dir: Path, n: int, bbox: tuple[int, int, int, int], out: Path, fps: int, src_fps: float) -> None:
    x, y, w, h = bbox
    w -= w % 2
    h -= h % 2
    vf = (
        f"fps={fps},crop={w}:{h}:{x}:{y},split[s0][s1];"
        "[s0]palettegen=max_colors=255:reserve_transparent=1:stats_mode=full[p];"
        "[s1][p]paletteuse=dither=none:alpha_threshold=128:diff_mode=rectangle"
    )
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error", "-framerate", str(src_fps), "-i", str(fg_dir / "fg_%04d.png"),
            "-frames:v", str(n), "-vf", vf, "-gifflags", "-offsetting", "-loop", "0", str(out),
        ],
        check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("work_dir")
    # GIF delays are whole centiseconds: 20 fps = 5 cs exactly (15 fps rounds to 7 cs = plays slow).
    ap.add_argument("--gif-fps", type=int, default=20)
    args = ap.parse_args()
    work = Path(args.work_dir)

    cap = cv2.VideoCapture(args.video)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    cap.release()
    frames = drop_end_cards(load_frames(Path(args.video)))
    hgt, wid = frames[0].shape[:2]
    plate = cv2.imread(str(work / "plate_known.png"))
    known = cv2.imread(str(work / "coverage.png"), 0) > 0

    clean = warp_clean(work, (wid, hgt))
    raw_diff = np.abs(clean.astype(np.int16) - plate.astype(np.int16)).max(axis=2)
    trusted = known & (raw_diff < 40)
    clean = color_match(clean, plate, trusted)
    cf = clean.astype(np.float32)
    clean = np.clip(cf + 0.3 * (cf - cv2.GaussianBlur(cf, (0, 0), 0.8)), 0, 255).astype(np.uint8)
    cv2.imwrite(str(work / "clean_bg_frame.png"), clean)

    pd = np.abs(clean.astype(np.int16) - plate.astype(np.int16)).max(axis=2)
    overlay = ((pd > 28) & known).astype(np.uint8) * 255
    overlay = cv2.morphologyEx(overlay, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    overlay = cv2.dilate(overlay, np.ones((5, 5), np.uint8), iterations=1)
    cv2.imwrite(str(work / "overlay_mask.png"), overlay)
    # Exact video pixels wherever the character ever uncovered them (includes burned-in
    # hook text); the verified online photo only where it never did.
    ref = np.where(known[..., None], plate, clean)
    cv2.imwrite(str(work / "reference.png"), ref)
    seam = cv2.dilate((~known).astype(np.uint8), np.ones((3, 3), np.uint8)) > 0
    noise = float(np.percentile(pd[known & (overlay == 0) & ~seam], 99))

    fg_dir = work / "fg"
    fg_dir.mkdir(exist_ok=True)
    for old in fg_dir.glob("*.png"):
        old.unlink()
    union = np.zeros((hgt, wid), bool)
    maes: list[float] = []
    overlay_leak: list[float] = []
    for i, f in enumerate(frames):
        hard = support_mask(f, ref)
        a, color = solve_alpha(f, ref, hard)
        union |= a >= 128
        rgba = cv2.cvtColor(color, cv2.COLOR_BGR2BGRA)
        rgba[:, :, 3] = a
        cv2.imwrite(str(fg_dir / f"fg_{i:04d}.png"), rgba)
        af = a[..., None].astype(np.float32) / 255
        comp = color.astype(np.float32) * af + ref.astype(np.float32) * (1 - af)
        maes.append(float(np.abs(comp - f.astype(np.float32)).mean()))
        ov = overlay > 0
        overlay_leak.append(float((a[ov] >= 128).mean()) if ov.any() else 0.0)
        if i % 60 == 0:
            checker = np.full_like(f, 200)
            checker[(np.indices((hgt, wid)).sum(0) // 16) % 2 == 0] = 150
            binary = (a >= 128)[..., None].astype(np.float32)
            over = (color.astype(np.float32) * binary + checker * (1 - binary)).astype(np.uint8)
            cv2.imwrite(str(work / f"qa_{i:04d}.jpg"), np.hstack([f, over, (a[..., None].repeat(3, 2))]))

    ys, xs = np.where(union)
    pad = 4
    x0, y0 = max(0, xs.min() - pad), max(0, ys.min() - pad)
    x1, y1 = min(wid, xs.max() + pad), min(hgt, ys.max() + pad)
    bbox = (int(x0), int(y0), int(x1 - x0), int(y1 - y0))
    export_gif(fg_dir, len(frames), bbox, work / "motion.gif", args.gif_fps, src_fps)

    report = {
        "frames": len(frames),
        "bg_noise_p99": noise,
        "recomposite_mae_mean": float(np.mean(maes)),
        "recomposite_mae_max": float(np.max(maes)),
        "overlay_leak_mean": float(np.mean(overlay_leak)),
        "gif_bbox_xywh": list(bbox),
        "gif_bytes": (work / "motion.gif").stat().st_size,
    }
    (work / "matte_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
