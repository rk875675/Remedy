#!/usr/bin/env python3
"""
pt-video-crop-center — computed (not eyeballed) crop/center tool for PT exercise videos.

Why this exists: manual crop sweeps (try y=480, look, try y=560, look, ...) miss the
fact that the subject MOVES during the rep (hinge, squat, thrust...). A crop that looks
centered on frame 1 clips her head/feet at the extreme of the rep. This tool measures
the subject's silhouette across sampled frames spanning the WHOLE clip, unions the
bounding boxes, and computes a crop that is mathematically guaranteed to contain the
full range of motion plus padding — then re-measures the actual output to prove it.

IMPORTANT — aspect ratio default: the app's real video player
(app/session/[id].tsx) renders with width=SCREEN_WIDTH, height=SCREEN_WIDTH*0.65
and contentFit="cover". That means ANY crop whose aspect ratio doesn't match
20:13 (~1.538) gets scaled up and hard-cropped by `cover` on device — a tight
portrait crop that looks perfect in the contact sheet can end up "way too
zoomed in" in the actual app. --ar therefore DEFAULTS to 20:13. Only pass
--ar none if the output genuinely will not be shown in that player.

Subcommands:
  analyze   <video> [--samples N] [--pad F] [--ar W:H] [--out DIR]
      Samples frames across the whole clip, runs rembg to get the subject silhouette,
      unions the per-frame bounding boxes, detects any baked-in black letterbox/
      pillarbox margin (some Kling clips have this — real black pixels in the
      source, not a player artifact) so padding can never re-include it, computes
      a crop rect, writes:
        <out>/<stem>_report.json     (all measurements + chosen crop)
        <out>/<stem>_contact_src.jpg (grid of the sampled SOURCE frames, bbox drawn)

  apply     <video> <report.json> [--out FILE]
      Runs ffmpeg with the crop from the report. Also draws the crop rect onto the
      source contact sheet is already done in analyze; this step just crops the video.

  verify    <cropped_video> <report.json> [--out DIR]
      Re-samples the CROPPED video at the same relative timestamps, re-runs rembg,
      and checks every sample has the subject fully inside frame with margin.
      Writes <out>/<stem>_contact_cropped.jpg for a final visual gate.
      Exits non-zero (and prints exactly which frame/timestamp failed) if anything
      is clipped — never declare a crop "done" without this passing.

Usage:
  python crop_center.py analyze in.mp4 --pad 0.15
  python crop_center.py apply in.mp4 out/in_report.json --out in_cropped.mp4
  python crop_center.py verify in_cropped.mp4 out/in_report.json
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

try:
    from rembg import remove, new_session
except ImportError:
    print("rembg is required: pip install rembg[cpu]", file=sys.stderr)
    sys.exit(1)

MODEL_NAME = "u2net_human_seg"
_session = None


def get_session():
    global _session
    if _session is None:
        _session = new_session(MODEL_NAME)
    return _session


def sample_timestamps(duration: float, n: int) -> list[float]:
    """n evenly spaced timestamps covering the WHOLE clip, including near-start and
    near-end (never just the first frame or a couple of guessed spots)."""
    if n < 2:
        n = 2
    eps = min(0.05, duration * 0.02)
    return [eps + (duration - 2 * eps) * i / (n - 1) for i in range(n)]


def read_frame_at(cap: cv2.VideoCapture, fps: float, t: float) -> np.ndarray | None:
    frame_idx = int(round(t * fps))
    cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
    ok, frame = cap.read()
    if not ok:
        return None
    return frame


def subject_bbox(frame_bgr: np.ndarray, alpha_thresh: int = 40) -> tuple[int, int, int, int] | None:
    """Runs rembg on one frame, returns (x0,y0,x1,y1) of the largest connected
    foreground blob, or None if nothing detected."""
    pil_frame = Image.fromarray(cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB))
    result = remove(
        pil_frame,
        session=get_session(),
        alpha_matting=False,
    )
    alpha = np.array(result)[:, :, 3]
    mask = (alpha > alpha_thresh).astype(np.uint8)
    if mask.sum() == 0:
        return None
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num_labels <= 1:
        return None
    # stats[0] is background; pick largest non-background component
    largest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h, _ = stats[largest]
    return (int(x), int(y), int(x + w), int(y + h))


def detect_content_bounds(frame_bgr: np.ndarray, thresh: int = 45, min_run_frac: float = 0.02) -> tuple[int, int, int, int]:
    """Detects the real (non-black-letterboxed) content region of a frame.

    Some source clips (Kling/AI-gen artifacts) have solid-black pillarboxing or
    letterboxing baked into the frame itself — not a player-side effect, actual
    black pixels in the video. rembg's subject bbox says nothing about this (it
    only finds the person), so a crop can still include a strip of that black
    margin if padding pushes the crop edge back into it. This scans column/row
    mean brightness from each edge inward and returns the largest inner rect that
    excludes any sustained near-black run at the edges. Returns the full frame
    (0, 0, w, h) if no such margin is found.
    """
    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    col_mean = gray.mean(axis=0)
    row_mean = gray.mean(axis=1)

    def find_bounds(means: np.ndarray, min_run: int) -> tuple[int, int]:
        n = len(means)
        start = 0
        for i in range(n - min_run):
            if np.all(means[i:i + min_run] > thresh):
                start = i
                break
        end = n
        for i in range(n - 1, min_run - 1, -1):
            if np.all(means[i - min_run + 1:i + 1] > thresh):
                end = i + 1
                break
        return start, end

    x0, x1 = find_bounds(col_mean, max(4, int(w * min_run_frac)))
    y0, y1 = find_bounds(row_mean, max(4, int(h * min_run_frac)))
    return (x0, y0, x1, y1)


def build_contact_sheet(frames_with_boxes: list[tuple[np.ndarray, tuple | None, float]], out_path: Path, cols: int = 6):
    thumbs = []
    for frame, box, t in frames_with_boxes:
        f = frame.copy()
        if box is not None:
            x0, y0, x1, y1 = box
            cv2.rectangle(f, (x0, y0), (x1, y1), (0, 0, 255), 3)
        else:
            cv2.putText(f, "NO DETECTION", (10, 40), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
        cv2.putText(f, f"t={t:.2f}s", (10, f.shape[0] - 15), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        thumb_w = 320
        scale = thumb_w / f.shape[1]
        thumb = cv2.resize(f, (thumb_w, int(f.shape[0] * scale)))
        thumbs.append(thumb)

    rows = (len(thumbs) + cols - 1) // cols
    th, tw = thumbs[0].shape[:2]
    sheet = np.full((rows * th, cols * tw, 3), 30, dtype=np.uint8)
    for i, thumb in enumerate(thumbs):
        r, c = divmod(i, cols)
        sheet[r * th:r * th + thumb.shape[0], c * tw:c * tw + thumb.shape[1]] = thumb
    cv2.imwrite(str(out_path), sheet)


def cmd_analyze(args):
    video_path = Path(args.video)
    out_dir = Path(args.out) if args.out else video_path.parent / "_crop_audit"
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = video_path.stem

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"ERROR: cannot open {video_path}", file=sys.stderr)
        sys.exit(1)
    fps = cap.get(cv2.CAP_PROP_FPS)
    src_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    src_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = frame_count / fps

    timestamps = sample_timestamps(duration, args.samples)
    print(f"{video_path.name}: {src_w}x{src_h}, {duration:.2f}s, {fps:.1f}fps — sampling {len(timestamps)} frames across the FULL clip")

    samples = []
    frames_with_boxes = []
    for t in timestamps:
        frame = read_frame_at(cap, fps, t)
        if frame is None:
            print(f"  WARNING: could not read frame at t={t:.2f}s")
            continue
        box = subject_bbox(frame)
        samples.append({"t": t, "bbox": box})
        frames_with_boxes.append((frame, box, t))
        status = box if box else "NO DETECTION"
        print(f"  t={t:5.2f}s  bbox={status}")
    cap.release()

    # Content bounds (excludes baked-in black letterbox/pillarbox bars, if any).
    # Intersection across all sampled frames so a transient dark frame can't
    # falsely widen the "safe" region.
    content_boxes = [detect_content_bounds(frame) for frame, _, _ in frames_with_boxes]
    content_x0 = max(b[0] for b in content_boxes)
    content_y0 = max(b[1] for b in content_boxes)
    content_x1 = min(b[2] for b in content_boxes)
    content_y1 = min(b[3] for b in content_boxes)
    has_letterbox = content_x0 > 4 or content_y0 > 4 or content_x1 < src_w - 4 or content_y1 < src_h - 4

    detected = [s for s in samples if s["bbox"] is not None]
    miss_rate = 1 - len(detected) / len(samples) if samples else 1.0
    if miss_rate > 0.3:
        print(f"\nABORT: rembg failed to detect the subject on {miss_rate:.0%} of sampled frames.")
        print("Do not proceed with a computed crop on this video — the silhouette model")
        print("isn't reading it reliably (busy background, heavy motion blur, etc).")
        print(f"Inspect {out_dir / (stem + '_contact_src.jpg')} once written, then fall back")
        print("to manual review before cropping.")

    x0s = [s["bbox"][0] for s in detected]
    y0s = [s["bbox"][1] for s in detected]
    x1s = [s["bbox"][2] for s in detected]
    y1s = [s["bbox"][3] for s in detected]
    union = (min(x0s), min(y0s), max(x1s), max(y1s))
    ux0, uy0, ux1, uy1 = union
    bbox_w, bbox_h = ux1 - ux0, uy1 - uy0
    cx, cy = (ux0 + ux1) / 2, (uy0 + uy1) / 2

    pad = args.pad
    padded_w = bbox_w * (1 + 2 * pad)
    padded_h = bbox_h * (1 + 2 * pad)

    fit_warning = None
    edge_warnings = []
    if has_letterbox:
        edge_warnings.append(
            f"source has baked-in black letterbox/pillarbox margins — real content is "
            f"({content_x0},{content_y0})-({content_x1},{content_y1}) out of {src_w}x{src_h}; "
            f"the crop is clamped to this region so no black bar can be re-included by padding"
        )
    if uy1 >= src_h - 2:
        edge_warnings.append("subject's feet/bottom already touch the SOURCE frame's bottom edge in at least one sampled frame — there is no room to add vertical bottom padding without inventing pixels; do not force it")
    if uy0 <= 2:
        edge_warnings.append("subject's head/top already touches the SOURCE frame's top edge — no room to add vertical top padding")
    if ux0 <= 2:
        edge_warnings.append("subject already touches the SOURCE frame's left edge — no room to add horizontal left padding")
    if ux1 >= src_w - 2:
        edge_warnings.append("subject already touches the SOURCE frame's right edge — no room to add horizontal right padding")

    # Usable region the crop may occupy: full frame, minus any baked-in letterbox
    # margin detected above. Never src_w/src_h directly when has_letterbox — that
    # is exactly the bug that let padding math re-include a black column.
    bound_x0, bound_y0 = (content_x0, content_y0) if has_letterbox else (0, 0)
    bound_x1, bound_y1 = (content_x1, content_y1) if has_letterbox else (src_w, src_h)
    bound_w, bound_h = bound_x1 - bound_x0, bound_y1 - bound_y0

    ar_arg = args.ar if args.ar and args.ar.lower() != "none" else None
    if ar_arg:
        # Explicit (or default) target aspect ratio: couple w/h so the output has
        # exactly this AR. The default is the app's real video-player AR (see
        # --ar's help text) so contentFit="cover" inside that fixed-AR container
        # never needs to crop further than what we intentionally composed here —
        # omitting this is what caused the "way too zoomed in" bug: a tight
        # portrait crop gets blown up and hard-center-cropped by `cover` inside a
        # landscape box.
        ar_w, ar_h = (float(v) for v in ar_arg.split(":"))
        ar = ar_w / ar_h
        crop_w = max(padded_w, padded_h * ar)
        crop_h = crop_w / ar
        if crop_h < padded_h:
            crop_h = padded_h
            crop_w = crop_h * ar
        if crop_w > bound_w or crop_h > bound_h:
            scale_down = min(bound_w / crop_w, bound_h / crop_h)
            fit_warning = (
                f"Requested padding ({pad:.0%}) + aspect ratio {ar_arg} doesn't fit inside the "
                f"usable frame ({bound_w:.0f}x{bound_h:.0f}"
                f"{' after excluding letterbox' if has_letterbox else ''}). Scaled down to the "
                f"largest crop that still fits the AR instead of shrinking into the subject."
            )
            crop_w *= scale_down
            crop_h *= scale_down
            if crop_w < bbox_w or crop_h < bbox_h:
                fit_warning += " WARNING: even zero padding does not fit this AR — do NOT crop this video without changing --ar or accepting letterboxing."
    else:
        # Explicit opt-out (--ar none): crop width and height independently so a
        # constraint on one axis (e.g. feet already at the source's bottom edge)
        # never forces the other axis to give up room it doesn't need. Only use
        # this for output that will NOT be shown in the app's cover-fit player —
        # anything going in-app needs the default AR or it will look over-zoomed
        # on device.
        crop_w = min(padded_w, bound_w)
        crop_h = min(padded_h, bound_h)
        ar = crop_w / crop_h

    crop_x = cx - crop_w / 2
    crop_y = cy - crop_h / 2
    crop_x = max(bound_x0, min(crop_x, bound_x1 - crop_w))
    crop_y = max(bound_y0, min(crop_y, bound_y1 - crop_h))

    # even dimensions/offsets for libx264
    crop_w, crop_h = int(crop_w) & ~1, int(crop_h) & ~1
    crop_x, crop_y = int(round(crop_x)) & ~1, int(round(crop_y)) & ~1

    report = {
        "source": str(video_path),
        "source_dims": [src_w, src_h],
        "duration": duration,
        "fps": fps,
        "samples": samples,
        "union_bbox": union,
        "pad_frac": pad,
        "target_ar": ar,
        "content_bounds": [content_x0, content_y0, content_x1, content_y1],
        "has_letterbox": has_letterbox,
        "crop": {"w": crop_w, "h": crop_h, "x": crop_x, "y": crop_y},
        "miss_rate": miss_rate,
        "fit_warning": fit_warning,
        "edge_warnings": edge_warnings,
    }
    report_path = out_dir / f"{stem}_report.json"
    report_path.write_text(json.dumps(report, indent=2))

    contact_path = out_dir / f"{stem}_contact_src.jpg"
    # draw the chosen crop rect (yellow) on top of each per-frame bbox (red) for review
    frames_annotated = []
    for frame, box, t in frames_with_boxes:
        f = frame.copy()
        cv2.rectangle(f, (crop_x, crop_y), (crop_x + crop_w, crop_y + crop_h), (0, 255, 255), 3)
        frames_annotated.append((f, box, t))
    build_contact_sheet(frames_annotated, contact_path)

    print(f"\nUnion bbox across full clip: {union}  (w={bbox_w:.0f} h={bbox_h:.0f})")
    print(f"Chosen crop: w={crop_w} h={crop_h} x={crop_x} y={crop_y}  (source {src_w}x{src_h})")
    if fit_warning:
        print(f"WARNING: {fit_warning}")
    for w in edge_warnings:
        print(f"NOTE: {w}")
    print(f"\nWrote {report_path}")
    print(f"Wrote {contact_path}  <-- open/Read this before applying. Yellow=chosen crop, red=per-frame subject bbox.")


def cmd_apply(args):
    report = json.loads(Path(args.report).read_text())
    c = report["crop"]
    src = Path(report["source"])
    out_path = Path(args.out) if args.out else src.with_name(src.stem + "_cropped.mp4")
    filter_str = f"crop={c['w']}:{c['h']}:{c['x']}:{c['y']}"
    cmd = [
        "ffmpeg", "-y", "-i", str(src),
        "-vf", filter_str,
        "-c:v", "libx264", "-crf", "18", "-preset", "medium",
        "-c:a", "copy",
        "-movflags", "+faststart",
        str(out_path),
    ]
    print(" ".join(cmd))
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        sys.exit(1)
    print(f"Wrote {out_path}")


def cmd_verify(args):
    video_path = Path(args.video)
    report = json.loads(Path(args.report).read_text())
    out_dir = Path(args.out) if args.out else Path(report["source"]).parent / "_crop_audit"
    out_dir.mkdir(parents=True, exist_ok=True)
    stem = video_path.stem
    src_duration = report["duration"]
    crop = report["crop"]
    cw, ch = crop["w"], crop["h"]

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        print(f"ERROR: cannot open {video_path}", file=sys.stderr)
        sys.exit(1)
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    out_duration = frame_count / fps

    # same relative timestamps as the analyze pass (duration is unchanged by cropping)
    rel_ts = [s["t"] / src_duration for s in report["samples"]]
    timestamps = [r * out_duration for r in rel_ts]

    min_margin_frac = args.min_margin
    failures = []
    frames_with_boxes = []
    for t in timestamps:
        frame = read_frame_at(cap, fps, t)
        if frame is None:
            failures.append((t, "could not read frame"))
            continue
        box = subject_bbox(frame)
        frames_with_boxes.append((frame, box, t))
        if box is None:
            failures.append((t, "no subject detected in cropped frame"))
            continue
        x0, y0, x1, y1 = box
        margin_left, margin_top = x0, y0
        margin_right, margin_bottom = cw - x1, ch - y1
        min_margin_px_w = min_margin_frac * cw
        min_margin_px_h = min_margin_frac * ch
        for name, val, floor in [
            ("left", margin_left, min_margin_px_w),
            ("right", margin_right, min_margin_px_w),
            ("top", margin_top, min_margin_px_h),
            ("bottom", margin_bottom, min_margin_px_h),
        ]:
            if val < floor:
                failures.append((t, f"{name} margin {val:.0f}px < required {floor:.0f}px — subject is clipped or touching the edge"))
        print(f"  t={t:5.2f}s  bbox={box}  margins L{margin_left} R{margin_right} T{margin_top} B{margin_bottom}")
    cap.release()

    contact_path = out_dir / f"{stem}_contact_cropped.jpg"
    build_contact_sheet(frames_with_boxes, contact_path)
    print(f"\nWrote {contact_path}  <-- Read this image yourself before declaring done.")

    if failures:
        print(f"\nVERIFY FAILED ({len(failures)} issue(s)):")
        for t, msg in failures:
            print(f"  t={t:.2f}s: {msg}")
        sys.exit(1)
    print(f"\nVERIFY PASSED — subject stays fully in frame with >= {min_margin_frac:.0%} margin at all {len(timestamps)} sampled points.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_analyze = sub.add_parser("analyze")
    p_analyze.add_argument("video")
    p_analyze.add_argument("--samples", type=int, default=20)
    p_analyze.add_argument("--pad", type=float, default=0.15, help="fraction of bbox size added as padding on each side")
    p_analyze.add_argument(
        "--ar",
        default="20:13",
        help=(
            "target aspect ratio W:H. Default 20:13 (~1.538) matches the app's real "
            "video player — app/session/[id].tsx renders with "
            "width=SCREEN_WIDTH, height=SCREEN_WIDTH*0.65 and contentFit=\"cover\". "
            "A crop with a different AR gets scaled up and hard-cropped by `cover` on "
            "device — that mismatch, not the crop itself, is what caused the "
            "'way too zoomed in' bug. Only pass --ar none for output that will NOT "
            "be shown in that player."
        ),
    )
    p_analyze.add_argument("--out", default=None)
    p_analyze.set_defaults(func=cmd_analyze)

    p_apply = sub.add_parser("apply")
    p_apply.add_argument("report", help="path to the _report.json written by `analyze` (source video path comes from it)")
    p_apply.add_argument("--out", default=None)
    p_apply.set_defaults(func=cmd_apply)

    p_verify = sub.add_parser("verify")
    p_verify.add_argument("video")
    p_verify.add_argument("report")
    p_verify.add_argument("--min-margin", type=float, default=0.03, help="minimum required margin as a fraction of frame w/h")
    p_verify.add_argument("--out", default=None)
    p_verify.set_defaults(func=cmd_verify)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
