"""Find the exact original background from Google Lens results.

Usage:
  python find_bg.py <work_dir> <lens_cdp_dump.json> [<more dumps> ...] [--url IMG_URL ...]

1. Harvest Lens thumbnails + their source pages.
2. SIFT/RANSAC-score every thumbnail against the recovered plate.
3. For thumbnails that screen as the same photo, open their source pages and
   score every full-size image there (Pinterest thumbs upgrade to /originals/).
4. Keep the LARGEST verified image. Writes bg_original.<ext>, bg_source.json.
Exit 0 = verified at >= video resolution, 2 = verified but low-res, 1 = none.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from lens_harvest import harvest
from match_background import SCREEN_INLIERS, Matcher, fetch, read_any
from page_images import page_image_urls


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("work_dir")
    ap.add_argument("dumps", nargs="*")
    ap.add_argument("--url", action="append", default=[], help="extra candidate image URL")
    args = ap.parse_args()
    work = Path(args.work_dir)
    matcher = Matcher(work)
    cand_dir = work / "candidates"
    results: list[dict] = []

    def consider(label: str, path: Path | None, page: str = "") -> dict | None:
        if path is None:
            return None
        img = read_any(path)
        if img is None:
            return None
        r = matcher.score(img)
        r.update({"source": label, "page": page, "file": str(path), "w": int(img.shape[1]), "h": int(img.shape[0])})
        flag = "OK " if r["verified"] else "   "
        print(f"{flag} inl={r['inliers']:4d} err={r['align_err'] if r['align_err'] is None else round(r['align_err'], 1)} {r['w']}x{r['h']} {label[:80]}")
        results.append(r)
        return r

    pages: list[str] = []
    for i, dump in enumerate(args.dumps):
        for it in harvest(Path(dump), work / f"lens_{i}"):
            t = it["thumb"]
            r = consider(t, Path(t) if not t.startswith("http") else fetch(t, cand_dir), it["href"])
            if r and r["inliers"] >= SCREEN_INLIERS and it["href"]:
                pages.append(it["href"])
    for u in args.url:
        consider(u, fetch(u, cand_dir))

    for page in dict.fromkeys(pages):
        for u in page_image_urls(page):
            consider(u, fetch(u, cand_dir), page)

    verified = [r for r in results if r["verified"]]
    slim = sorted(({k: v for k, v in r.items() if not k.startswith("_")} for r in results), key=lambda r: -r["inliers"])
    (work / "bg_matches.json").write_text(json.dumps(slim[:80], indent=2), encoding="utf-8")
    if not verified:
        print("NO VERIFIED MATCH. Try other Lens crops (lens_query_*.jpg) or Lens 'Exact matches'.")
        raise SystemExit(1)
    best = max(verified, key=lambda r: (r["w"] * r["h"], r["inliers"]))
    raw = Path(best["file"]).read_bytes()
    ext = ".png" if raw[:4] == b"\x89PNG" else ".jpg"
    for old in work.glob("bg_original.*"):
        old.unlink()
    (work / f"bg_original{ext}").write_bytes(raw)
    (work / "bg_source.json").write_text(json.dumps(best, indent=2), encoding="utf-8")
    plate_h, plate_w = matcher.plate.shape[:2]
    print(f"VERIFIED {best['source']} ({best['w']}x{best['h']}, inliers {best['inliers']}, err {best['align_err']:.1f})")
    if best["w"] * best["h"] < plate_w * plate_h:
        print("LOW RES: verified source is smaller than the video frame. Open its page / other sites for a bigger copy.")
        raise SystemExit(2)


if __name__ == "__main__":
    main()
