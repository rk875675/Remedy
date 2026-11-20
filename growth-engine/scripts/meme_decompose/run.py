"""One-command pipeline: TikTok overlay meme -> exact background + clean motion GIF.

  python scripts/meme_decompose/run.py <format-id> [--url <tiktok url>]

Stages (each cached in .work/meme-decompose/<id>/):
  fetch   download reference MP4, audio, poster, stats (tikwm) if --url given
  plate   exact-pixel background where the character ever uncovers it
  query   write Lens query crops to the public folder  -> STOP (exit 3) until
          find_bg.py has verified the original background (agent does Lens)
  matte   known-background matte, decontaminated edges, ffmpeg GIF
  gates   hard QA; refuses to publish if any fails (exit 4)
  publish copy 02-background.jpg + 03-motion.gif + QA sheets, update catalog
Run from growth-engine/.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
PUBLIC = ROOT / "apps/web/public/memes/format-library"
CATALOG = ROOT / "assets/memes/format-library.json"
WORK_ROOT = ROOT / ".work/meme-decompose"

GATE_RECOMP_MAE = 2.5
GATE_OVERLAY_LEAK = 0.002
GATE_GIF_BYTES = 24 * 1024 * 1024


def sh(*args: str) -> None:
    subprocess.run([sys.executable, *args], check=True, cwd=HERE)


def fetch(fmt_id: str, url: str, pub: Path) -> dict:
    req = urllib.request.Request(
        f"https://www.tikwm.com/api/?url={urllib.parse.quote(url)}",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        payload = json.load(r)
    data = payload.get("data") or {}
    if not data.get("play"):
        raise SystemExit(f"tikwm returned no video for {url}: {payload.get('msg')}")
    pub.mkdir(parents=True, exist_ok=True)
    urllib.request.urlretrieve(data["play"], pub / "00-full-reference.mp4")
    if data.get("music"):
        urllib.request.urlretrieve(data["music"], pub / "05-audio-original-sound.mp3")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-ss", "0.4", "-i", str(pub / "00-full-reference.mp4"), "-frames:v", "1", str(pub / "poster.jpg")],
        check=True,
    )
    meta = {"sourceUrl": url, "tikwm": data}
    (WORK_ROOT / fmt_id / "fetch.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return meta


def write_queries(work: Path, pub_verify: Path) -> list[Path]:
    plate = cv2.imread(str(work / "plate_known.png"))
    cov = cv2.imread(str(work / "coverage.png"), 0)
    # Holes are smoothed ONLY to make a natural-looking search query; never published.
    q = cv2.inpaint(plate, (cov == 0).astype(np.uint8) * 255, 9, cv2.INPAINT_TELEA)
    h, w = q.shape[:2]
    pub_verify.mkdir(parents=True, exist_ok=True)
    crops = {
        "lens_query_full.jpg": q,
        "lens_query_lower.jpg": q[int(h * 0.4) :, :],
        "lens_query_left.jpg": q[int(h * 0.4) : int(h * 0.8), : int(w * 0.45)],
        "lens_query_right.jpg": q[int(h * 0.37) : int(h * 0.75), int(w * 0.58) :],
    }
    out = []
    for name, img in crops.items():
        p = pub_verify / name
        cv2.imwrite(str(p), cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC), [cv2.IMWRITE_JPEG_QUALITY, 95])
        out.append(p)
    return out


def bg_ok(work: Path) -> tuple[bool, str]:
    src = work / "bg_source.json"
    if not src.exists():
        return False, "no verified background yet"
    b = json.loads(src.read_text(encoding="utf-8"))
    plate = cv2.imread(str(work / "plate_known.png"))
    if not b.get("verified"):
        return False, "bg_source.json is not verified"
    if b["w"] * b["h"] < plate.shape[0] * plate.shape[1]:
        return False, f"verified background is low-res ({b['w']}x{b['h']})"
    return True, f"{b['source']} ({b['w']}x{b['h']}, {b['inliers']} inliers)"


def contact_sheet(work: Path, pub_verify: Path) -> None:
    fg = sorted((work / "fg").glob("fg_*.png"))
    picks = [fg[int(i)] for i in np.linspace(0, len(fg) - 1, 5)]
    tiles = []
    for p in picks:
        f = cv2.imread(str(p), cv2.IMREAD_UNCHANGED)
        a = (f[:, :, 3] >= 128)[..., None].astype(np.float32)
        green = np.full(f.shape[:2] + (3,), (60, 200, 60), np.float32)
        tiles.append((f[:, :, :3] * a + green * (1 - a)).astype(np.uint8))
    sheet = np.hstack(tiles)
    cv2.imwrite(str(pub_verify / "qa_motion_on_green.jpg"), cv2.resize(sheet, None, fx=0.5, fy=0.5), [cv2.IMWRITE_JPEG_QUALITY, 88])
    ref = cv2.imread(str(work / "clean_bg_frame.png"))
    first = cv2.imread(str(work / "plate_holes_magenta.png"))
    cv2.imwrite(str(pub_verify / "qa_background_vs_plate.jpg"), cv2.resize(np.hstack([first, ref]), None, fx=0.5, fy=0.5), [cv2.IMWRITE_JPEG_QUALITY, 88])


def publish(fmt_id: str, work: Path, pub: Path) -> dict:
    src = json.loads((work / "bg_source.json").read_text(encoding="utf-8"))
    orig = next(p for p in (work / "bg_original.png", work / "bg_original.jpg") if p.exists())
    img = cv2.imread(str(orig))
    cv2.imwrite(str(pub / "02-background.jpg"), img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    shutil.copyfile(work / "motion.gif", pub / "03-motion.gif")
    for stale in ("02-background-aisle.jpg",):
        (pub / stale).unlink(missing_ok=True)
    report = json.loads((work / "matte_report.json").read_text(encoding="utf-8"))
    sources = {
        "background": {
            "url": src["source"],
            "page": src.get("page", ""),
            "size": [src["w"], src["h"]],
            "sift_inliers": src["inliers"],
            "align_err": src["align_err"],
            "homography_original_to_frame": src["_h"],
        },
        "motion": report,
    }
    (pub / "_verify" / "sources.json").write_text(json.dumps(sources, indent=2), encoding="utf-8")

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    entry = next((f for f in catalog["formats"] if f["id"] == fmt_id), None)
    if entry is None:
        raise SystemExit(f"{fmt_id} not in {CATALOG}; add the entry (title/hook/stats) first")
    page = src.get("page") or src["source"]
    parts = [p for p in entry["parts"] if p["kind"] not in ("image", "gif")]
    parts[:0] = [
        {
            "label": "Background",
            "kind": "image",
            "file": f"{fmt_id}/02-background.jpg",
            "caption": f"Original photo, no overlay ({src['w']}x{src['h']}). Verified same image (SIFT {src['inliers']} inliers). Source: {page}",
        },
        {
            "label": "Motion",
            "kind": "gif",
            "file": f"{fmt_id}/03-motion.gif",
            "caption": "Character cut from the reference clip against the verified background. Transparent GIF.",
        },
    ]
    entry["parts"] = parts
    CATALOG.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return sources


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("format_id")
    ap.add_argument("--url", help="TikTok URL (downloads reference if missing)")
    ap.add_argument("--redo-plate", action="store_true")
    args = ap.parse_args()
    fmt_id = args.format_id
    work = WORK_ROOT / fmt_id
    work.mkdir(parents=True, exist_ok=True)
    pub = PUBLIC / fmt_id
    video = pub / "00-full-reference.mp4"

    if not video.exists():
        if not args.url:
            raise SystemExit(f"Missing {video}; pass --url <tiktok url>")
        fetch(fmt_id, args.url, pub)
    print(f"[fetch] {video}")

    if args.redo_plate or not (work / "plate_known.png").exists():
        sh("plate.py", str(video), str(work))
    print(f"[plate] {json.loads((work / 'plate_report.json').read_text())}")

    ok, why = bg_ok(work)
    if not ok:
        queries = write_queries(work, pub / "_verify")
        print(f"[query] {why}. Lens query crops:")
        for q in queries:
            print(f"   {q.relative_to(ROOT)}")
        print("NEXT: npm run deploy, then Lens each crop via the deploy URL and run find_bg.py (see SKILL.md).")
        raise SystemExit(3)
    print(f"[bg] {why}")

    sh("matte.py", str(video), str(work))
    report = json.loads((work / "matte_report.json").read_text(encoding="utf-8"))

    fails = []
    if report["recomposite_mae_mean"] > GATE_RECOMP_MAE:
        fails.append(f"recomposite MAE {report['recomposite_mae_mean']:.2f} > {GATE_RECOMP_MAE}")
    if report["overlay_leak_mean"] > GATE_OVERLAY_LEAK:
        fails.append(f"hook text/emoji leaking into GIF ({report['overlay_leak_mean']:.4f})")
    if report["gif_bytes"] > GATE_GIF_BYTES:
        fails.append(f"GIF too big for Pages ({report['gif_bytes']} bytes); lower --gif-fps")
    (pub / "_verify").mkdir(parents=True, exist_ok=True)
    contact_sheet(work, pub / "_verify")
    if fails:
        print("[gates] FAIL:\n  " + "\n  ".join(fails))
        raise SystemExit(4)
    print("[gates] pass")

    publish(fmt_id, work, pub)
    print(f"[publish] {pub.relative_to(ROOT)}/02-background.jpg, 03-motion.gif, _verify/qa_*.jpg")
    print("Look at _verify/qa_motion_on_green.jpg and qa_background_vs_plate.jpg, then npm run deploy.")


if __name__ == "__main__":
    main()
