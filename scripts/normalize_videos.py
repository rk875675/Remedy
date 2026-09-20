#!/usr/bin/env python3
"""
Remedy — Exercise Video Normalizer
==================================
Brings the exercise clip library to one consistent, device-appropriate encode so
each clip is small enough to download once and cache on the device.

Why this exists
---------------
The library was measured at 33 clips / 110 MB (avg 3.34 MB) with encodes ranging
from 529 kbps to 20,463 kbps and resolutions from 960x624 to 2880x2160. The app
plays them in a container sized `width=SCREEN_WIDTH, height=SCREEN_WIDTH*0.65`
(app/session/[id].tsx) — about 1179x766 px on the largest iPhone. Anything above
a ~1280 px width is pixels the UI physically cannot show, paid for on every
download.

What this does NOT do
---------------------
It never changes aspect ratio, crops, or re-frames. Those crops were measured and
verified by the pt-video-crop-center skill and must not be disturbed — scaling is
AR-preserving (`-2` height). `report` flags clips whose AR is not ~20:13 so they
can be sent back through that skill separately; this tool leaves them alone.

Clips carry no audio track (verified), but `-an` is passed defensively since the
player mutes playback anyway.

Usage:
  # 1. Pull the current library down from Supabase Storage
  python scripts/normalize_videos.py fetch

  # 2. Re-encode to the device-appropriate ceiling
  python scripts/normalize_videos.py encode

  # 3. Before/after table + AR warnings
  python scripts/normalize_videos.py report

Requires ffmpeg/ffprobe on PATH (already used elsewhere in this repo).
"""

import argparse
import json
import subprocess
import sys
import urllib.request
from pathlib import Path

STORAGE_BASE = (
    "https://vgqmvekjttywwadpftre.supabase.co"
    "/storage/v1/object/public/videos/exercises/"
)

# The 33 keys confirmed live in Storage (HTTP 200). The five superseded keys
# (back_extension_45, barbell_hip_thrust, bodyweight_squat, hip_hinge,
# bird_dog_from_misnamed_catcow) now 404/400 and are deliberately excluded —
# each was replaced by a _v2 upload.
LIVE_KEYS = [
    "back_extension_45_v2.mp4",
    "banded_clamshell.mp4",
    "banded_rdl_v2.mp4",
    "banded_row.mp4",
    "banded_row_v2.mp4",
    "barbell_hip_thrust_v2.mp4",
    "bird_dog.mp4",
    "bird_dog_v2.mp4",
    "bodyweight_squat_v2.mp4",
    "cat_cow.mp4",
    "childs_pose.mp4",
    "clamshell.mp4",
    "dead_bug.mp4",
    "dumbbell_rdl.mp4",
    "figure_4_stretch.mp4",
    "glute_bridge.mp4",
    "goblet_squat.mp4",
    "hamstring_stretch.mp4",
    "hip_flexor_stretch.mp4",
    "hip_hinge_v2.mp4",
    "kettlebell_deadlift.mp4",
    "leg_press.mp4",
    "mckenzie_press_up.mp4",
    "open_book_rotation.mp4",
    "seated_cable_row.mp4",
    "seated_cable_row_v2.mp4",
    "side_plank_full.mp4",
    "side_plank_knees.mp4",
    "single_leg_glute_bridge.mp4",
    "single_leg_rdl.mp4",
    "split_squat.mp4",
    "suitcase_carry.mp4",
    "thoracic_extension_chair.mp4",
]

DEFAULT_SRC = Path("scripts/output/_normalize/src")
DEFAULT_DST = Path("scripts/output/_normalize/out")

# Width ceiling. The player's container tops out near 1179 px on current iPhones;
# 1280 leaves headroom for future wider devices without paying for 1080p/4K.
MAX_WIDTH = 1280

# The AR the app's container expects (see pt-video-crop-center skill).
TARGET_AR = 20 / 13
AR_TOLERANCE = 0.04


def probe(path_or_url: str) -> dict | None:
    """Returns {w, h, dur, size, kbps, vcodec, has_audio} or None on failure."""
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "stream=codec_type,codec_name,width,height",
        "-show_entries", "format=duration,size",
        "-of", "json", str(path_or_url),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        return None
    try:
        data = json.loads(res.stdout)
    except json.JSONDecodeError:
        return None

    streams = data.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if not video:
        return None

    fmt = data.get("format", {})
    dur = float(fmt.get("duration") or 0)
    size = int(fmt.get("size") or 0)
    return {
        "w": int(video.get("width") or 0),
        "h": int(video.get("height") or 0),
        "dur": dur,
        "size": size,
        "kbps": (size * 8 / 1000) / dur if dur > 0 else 0,
        "vcodec": video.get("codec_name", "?"),
        "has_audio": any(s.get("codec_type") == "audio" for s in streams),
    }


def cmd_fetch(args: argparse.Namespace) -> int:
    src = Path(args.out)
    src.mkdir(parents=True, exist_ok=True)

    print(f"Fetching {len(LIVE_KEYS)} clips -> {src}\n")
    ok, skipped, failed = 0, 0, []
    for i, key in enumerate(LIVE_KEYS, 1):
        dest = src / key
        if dest.exists() and dest.stat().st_size > 0:
            print(f"[{i:2}/{len(LIVE_KEYS)}] {key:34} cached")
            skipped += 1
            continue
        try:
            urllib.request.urlretrieve(STORAGE_BASE + key, dest)
            mb = dest.stat().st_size / (1024 * 1024)
            print(f"[{i:2}/{len(LIVE_KEYS)}] {key:34} {mb:6.2f} MB")
            ok += 1
        except Exception as exc:  # noqa: BLE001 - report and continue
            print(f"[{i:2}/{len(LIVE_KEYS)}] {key:34} FAILED: {exc}")
            dest.unlink(missing_ok=True)
            failed.append(key)

    total = sum(f.stat().st_size for f in src.glob("*.mp4"))
    print(f"\nDownloaded {ok}, cached {skipped}, failed {len(failed)}")
    print(f"Library on disk: {total / (1024 * 1024):.1f} MB")
    for key in failed:
        print(f"  FAILED: {key}")
    return 1 if failed else 0


def encode_one(src: Path, dst: Path, crf: int, max_width: int) -> bool:
    # scale='min(W,iw)':-2  ->  downscale only, never upscale, AR preserved,
    # height forced even for yuv420p. Cropping/AR is explicitly not our job.
    vf = f"scale='min({max_width},iw)':-2:flags=lanczos"
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(src),
        "-vf", vf,
        "-c:v", "libx264",
        "-crf", str(crf),
        "-preset", "slow",
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        # Cap pathological peaks (the 20 Mbps source) without starving detail.
        "-maxrate", "1800k",
        "-bufsize", "3600k",
        # Progressive download: moov atom up front so playback can start early.
        "-movflags", "+faststart",
        "-an",
        str(dst),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"    ffmpeg ERROR: {res.stderr.strip()[:400]}")
        return False
    return True


def cmd_encode(args: argparse.Namespace) -> int:
    src_dir, dst_dir = Path(args.input), Path(args.output)
    if not src_dir.exists():
        print(f"Input dir {src_dir} does not exist — run `fetch` first.")
        return 1
    dst_dir.mkdir(parents=True, exist_ok=True)

    videos = sorted(src_dir.glob("*.mp4"))
    if not videos:
        print(f"No .mp4 files in {src_dir} — run `fetch` first.")
        return 1

    print(f"Encoding {len(videos)} clips  crf={args.crf}  max_width={args.max_width}")
    print(f"  {src_dir} -> {dst_dir}\n")

    src_total, dst_total, kept, failed = 0, 0, [], []
    for i, video in enumerate(videos, 1):
        out = dst_dir / video.name
        before = video.stat().st_size

        if out.exists() and not args.force:
            after = out.stat().st_size
            src_total += before
            dst_total += after
            print(f"[{i:2}/{len(videos)}] {video.name:34} exists, skipping (--force to redo)")
            continue

        if not encode_one(video, out, args.crf, args.max_width):
            failed.append(video.name)
            continue

        after = out.stat().st_size

        # Re-encoding an already-lean clip can inflate it. Keep whichever is
        # smaller so normalization is never a regression.
        if after >= before:
            out.unlink(missing_ok=True)
            out.write_bytes(video.read_bytes())
            after = out.stat().st_size
            kept.append(video.name)

        src_total += before
        dst_total += after
        pct = (1 - after / before) * 100 if before else 0
        note = "  (kept original — re-encode was larger)" if video.name in kept else ""
        print(
            f"[{i:2}/{len(videos)}] {video.name:34} "
            f"{before / 1048576:6.2f} -> {after / 1048576:5.2f} MB  {pct:+5.1f}%{note}"
        )

    print(f"\n--- Totals ---")
    print(f"  Before: {src_total / 1048576:7.1f} MB")
    print(f"  After:  {dst_total / 1048576:7.1f} MB")
    if src_total:
        print(f"  Saved:  {(1 - dst_total / src_total) * 100:7.1f}%")
    if kept:
        print(f"  Kept original for {len(kept)} already-lean clip(s).")
    if failed:
        print(f"  FAILED ({len(failed)}):")
        for name in failed:
            print(f"    - {name}")
        return 1
    return 0


def cmd_report(args: argparse.Namespace) -> int:
    src_dir, dst_dir = Path(args.input), Path(args.output)
    videos = sorted(src_dir.glob("*.mp4"))
    if not videos:
        print(f"No .mp4 files in {src_dir}.")
        return 1

    print(f"{'clip':34} {'before':>18}  {'after':>18}   delta")
    print("-" * 96)

    src_total, dst_total, ar_offenders = 0, 0, []
    for video in videos:
        before = probe(str(video))
        if not before:
            print(f"{video.name:34}  probe failed")
            continue
        src_total += before["size"]

        ar = before["w"] / before["h"] if before["h"] else 0
        if abs(ar - TARGET_AR) > AR_TOLERANCE:
            ar_offenders.append((video.name, before["w"], before["h"], ar))

        out = dst_dir / video.name
        after = probe(str(out)) if out.exists() else None
        if after:
            dst_total += after["size"]
            delta = (1 - after["size"] / before["size"]) * 100 if before["size"] else 0
            print(
                f"{video.name:34} "
                f"{before['w']:5}x{before['h']:<5}{before['size'] / 1048576:6.2f}MB  "
                f"{after['w']:5}x{after['h']:<5}{after['size'] / 1048576:6.2f}MB  "
                f"{delta:+6.1f}%"
            )
        else:
            print(
                f"{video.name:34} "
                f"{before['w']:5}x{before['h']:<5}{before['size'] / 1048576:6.2f}MB  "
                f"{'(not encoded)':>18}"
            )

    print("-" * 96)
    print(f"{'TOTAL':34} {src_total / 1048576:16.1f}MB  {dst_total / 1048576:16.1f}MB", end="")
    if src_total and dst_total:
        print(f"  {(1 - dst_total / src_total) * 100:+6.1f}%")
    else:
        print()

    if ar_offenders:
        print(
            f"\n{len(ar_offenders)} clip(s) are NOT ~20:13 ({TARGET_AR:.3f}). The player's "
            f"contentFit=\"cover\" will crop these further on device.\n"
            f"Send them through the pt-video-crop-center skill — this tool does not re-frame:"
        )
        for name, w, h, ar in ar_offenders:
            print(f"    {name:34} {w}x{h}  AR={ar:.3f}")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize Remedy exercise clips")
    sub = parser.add_subparsers(dest="command", required=True)

    p_fetch = sub.add_parser("fetch", help="Download the live library from Supabase Storage")
    p_fetch.add_argument("--out", default=str(DEFAULT_SRC))
    p_fetch.set_defaults(func=cmd_fetch)

    p_enc = sub.add_parser("encode", help="Re-encode to the device-appropriate ceiling")
    p_enc.add_argument("--input", default=str(DEFAULT_SRC))
    p_enc.add_argument("--output", default=str(DEFAULT_DST))
    p_enc.add_argument("--crf", type=int, default=25)
    p_enc.add_argument("--max-width", type=int, default=MAX_WIDTH, dest="max_width")
    p_enc.add_argument("--force", action="store_true", help="Re-encode even if output exists")
    p_enc.set_defaults(func=cmd_encode)

    p_rep = sub.add_parser("report", help="Before/after table and AR warnings")
    p_rep.add_argument("--input", default=str(DEFAULT_SRC))
    p_rep.add_argument("--output", default=str(DEFAULT_DST))
    p_rep.set_defaults(func=cmd_report)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
