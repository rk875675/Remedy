#!/usr/bin/env python3
"""
Remedy — Video Processing Pipeline
===================================
Takes raw downloaded exercise videos (from Pexels or a self-shoot) and:
  1. Blurs all detected faces (deface, MIT license)
  2. Removes background and composites over a clean neutral background (rembg, MIT)
  3. Outputs final MP4s ready for upload to Supabase Storage / Cloudflare Stream

Setup (one-time):
  pip install deface rembg[gpu] opencv-python Pillow numpy
  # If no CUDA GPU, use: pip install deface rembg[cpu] opencv-python Pillow numpy

Usage:
  python scripts/process_videos.py --input ./raw_videos --output ./processed_videos
  python scripts/process_videos.py --input ./raw_videos --output ./processed_videos --bg-color 245,242,239
  python scripts/process_videos.py --input ./raw_videos --output ./processed_videos --bg-image ./assets/bg_neutral.jpg
  python scripts/process_videos.py --input ./raw_videos --output ./processed_videos --skip-deface
  python scripts/process_videos.py --input ./raw_videos --output ./processed_videos --skip-bg
"""

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

try:
    from rembg import remove, new_session
    REMBG_AVAILABLE = True
except ImportError:
    REMBG_AVAILABLE = False
    print("Warning: rembg not installed. Background removal will be skipped.")
    print("  Install with: pip install rembg[cpu]")


def run_deface(input_path: Path, output_path: Path, threshold: float = 0.2) -> bool:
    """
    Runs deface on a single video to blur all detected faces.
    threshold: detection confidence 0.0–1.0 (lower = more aggressive blurring)
    """
    cmd = [
        sys.executable, "-m", "deface",
        str(input_path),
        "--output", str(output_path),
        "--thresh", str(threshold),
        "--replacewith", "blur",
        "--mosaicsize", "15",
    ]
    print(f"  [deface] {input_path.name} → {output_path.name}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  [deface] ERROR:\n{result.stderr}")
        return False
    return True


def replace_background(
    input_path: Path,
    output_path: Path,
    bg_color: tuple[int, int, int] = (245, 242, 239),
    bg_image_path: Path | None = None,
    session=None,
) -> bool:
    """
    Removes background from each frame using rembg (u2net_human_seg model)
    and composites over a solid color or image background.
    bg_color: RGB tuple — defaults to Remedy's warm cream (#FAF7F4 ≈ 250,247,244)
    """
    if not REMBG_AVAILABLE:
        return False

    cap = cv2.VideoCapture(str(input_path))
    if not cap.isOpened():
        print(f"  [bg-remove] ERROR: Cannot open {input_path}")
        return False

    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Load background image once if provided
    bg_img = None
    if bg_image_path and bg_image_path.exists():
        bg_img = cv2.imread(str(bg_image_path))
        bg_img = cv2.resize(bg_img, (width, height))

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    tmp_out = output_path.with_suffix(".tmp.mp4")
    writer = cv2.VideoWriter(str(tmp_out), fourcc, fps, (width, height))

    print(f"  [bg-remove] {input_path.name} → {output_path.name} ({total_frames} frames)")

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_idx % 30 == 0:
            pct = int(frame_idx / max(total_frames, 1) * 100)
            print(f"    {pct}% ({frame_idx}/{total_frames})", end="\r")

        # rembg expects PIL Image
        pil_frame = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        result_pil = remove(pil_frame, session=session, alpha_matting=True,
                            alpha_matting_foreground_threshold=240,
                            alpha_matting_background_threshold=10)

        result_rgba = np.array(result_pil)
        alpha = result_rgba[:, :, 3:4] / 255.0

        if bg_img is not None:
            background = bg_img.copy()
        else:
            background = np.full((height, width, 3), bg_color[::-1], dtype=np.uint8)  # BGR

        fg = cv2.cvtColor(result_rgba[:, :, :3], cv2.COLOR_RGB2BGR).astype(np.float32)
        bg = background.astype(np.float32)
        composite = (fg * alpha + bg * (1 - alpha)).astype(np.uint8)

        writer.write(composite)
        frame_idx += 1

    print(f"    100% — done          ")
    cap.release()
    writer.release()

    # Re-mux with ffmpeg to get a proper H.264 MP4 (mp4v is not streamable)
    ffmpeg_cmd = [
        "ffmpeg", "-y",
        "-i", str(tmp_out),
        "-c:v", "libx264",
        "-crf", "23",
        "-preset", "medium",
        "-movflags", "+faststart",
        str(output_path),
    ]
    ffmpeg_result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
    tmp_out.unlink(missing_ok=True)

    if ffmpeg_result.returncode != 0:
        print(f"  [bg-remove] ffmpeg ERROR (raw mp4v file kept at {output_path.with_suffix('.tmp.mp4')}):\n{ffmpeg_result.stderr}")
        return False

    return True


def process_video(
    input_path: Path,
    output_dir: Path,
    skip_deface: bool = False,
    skip_bg: bool = False,
    bg_color: tuple[int, int, int] = (245, 242, 239),
    bg_image_path: Path | None = None,
    rembg_session=None,
) -> bool:
    stem = input_path.stem
    suffix = input_path.suffix

    current = input_path

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)

        if not skip_deface:
            defaced = tmp / f"{stem}_defaced{suffix}"
            ok = run_deface(current, defaced)
            if not ok:
                print(f"  [deface] FAILED on {input_path.name} — stopping pipeline for this file.")
                return False
            current = defaced

        if not skip_bg and REMBG_AVAILABLE:
            bg_replaced = output_dir / f"{stem}_processed{suffix}"
            ok = replace_background(current, bg_replaced, bg_color, bg_image_path, rembg_session)
            if not ok:
                print(f"  [bg-remove] FAILED on {input_path.name}")
                return False
        else:
            # No bg step: just copy the defaced (or original) file to output
            import shutil
            final = output_dir / f"{stem}_processed{suffix}"
            shutil.copy2(str(current), str(final))

    return True


def main():
    parser = argparse.ArgumentParser(description="Remedy video processing pipeline")
    parser.add_argument("--input", required=True, help="Input directory containing raw MP4 videos")
    parser.add_argument("--output", required=True, help="Output directory for processed videos")
    parser.add_argument("--bg-color", default="245,242,239",
                        help="Background RGB color (default: 245,242,239 — Remedy cream)")
    parser.add_argument("--bg-image", default=None, help="Background image path (overrides --bg-color)")
    parser.add_argument("--skip-deface", action="store_true", help="Skip face blurring step")
    parser.add_argument("--skip-bg", action="store_true", help="Skip background removal step")
    parser.add_argument("--threshold", type=float, default=0.2,
                        help="deface detection threshold (0.0–1.0, lower = more aggressive, default 0.2)")
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    bg_color = tuple(int(x) for x in args.bg_color.split(","))
    bg_image_path = Path(args.bg_image) if args.bg_image else None

    videos = sorted(input_dir.glob("*.mp4")) + sorted(input_dir.glob("*.mov"))
    if not videos:
        print(f"No MP4/MOV files found in {input_dir}")
        sys.exit(1)

    print(f"\nRemedy Video Pipeline")
    print(f"  Input:     {input_dir} ({len(videos)} videos)")
    print(f"  Output:    {output_dir}")
    print(f"  Deface:    {'SKIP' if args.skip_deface else f'ON (threshold={args.threshold})'}")
    print(f"  BG remove: {'SKIP' if args.skip_bg else ('ON (image)' if bg_image_path else f'ON (color={bg_color})')}")
    print()

    # Load rembg session once for all videos (amortizes model load time)
    rembg_session = None
    if not args.skip_bg and REMBG_AVAILABLE:
        print("Loading rembg model (u2net_human_seg)...")
        rembg_session = new_session("u2net_human_seg")
        print("Model loaded.\n")

    success, failed = [], []
    for i, video in enumerate(videos, 1):
        print(f"[{i}/{len(videos)}] {video.name}")
        ok = process_video(
            video, output_dir,
            skip_deface=args.skip_deface,
            skip_bg=args.skip_bg,
            bg_color=bg_color,
            bg_image_path=bg_image_path,
            rembg_session=rembg_session,
        )
        if ok:
            success.append(video.name)
        else:
            failed.append(video.name)
        print()

    print(f"\n--- Done ---")
    print(f"  Success: {len(success)}")
    if failed:
        print(f"  Failed:  {len(failed)}")
        for f in failed:
            print(f"    - {f}")


if __name__ == "__main__":
    main()
