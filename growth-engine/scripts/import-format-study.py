"""Add a TikTok link to the Memes format library and start the decompose pipeline.

  python scripts/import-format-study.py <tiktok url> [--id slug] [--hook "..."] [--note "title"]

Creates the catalog entry (title, hook, stats, audio) and runs
scripts/meme_decompose/run.py, which stops at the Lens step (exit 3) until the
agent verifies the original background. See .cursor/skills/meme-format-decompose.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "assets/memes/format-library.json"


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:48].strip("-") or "format-study"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--id")
    ap.add_argument("--hook", default="")
    ap.add_argument("--note", default="")
    args = ap.parse_args()

    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    formats: list[dict] = catalog.setdefault("formats", [])
    existing = next((f for f in formats if f.get("sourceUrl") == args.url), None)
    if existing:
        fmt_id = existing["id"]
        print(f"Already in catalog as {fmt_id}")
    else:
        req = urllib.request.Request(
            f"https://www.tikwm.com/api/?url={urllib.parse.quote(args.url)}",
            headers={"User-Agent": "Mozilla/5.0"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            data = (json.load(r) or {}).get("data") or {}
        title = args.note.strip() or (data.get("title") or "Format study").strip()
        fmt_id = args.id or slugify(title)
        hook = (args.hook or title)[:240]
        music = data.get("music_info") or {}
        formats.append(
            {
                "id": fmt_id,
                "title": title[:120],
                "hook": hook,
                "summary": "Imported from the Formats inbox.",
                "sourceUrl": args.url,
                "poster": f"{fmt_id}/poster.jpg",
                "clip": f"{fmt_id}/00-full-reference.mp4",
                "stats": {
                    "views": int(data.get("play_count") or 0),
                    "likes": int(data.get("digg_count") or 0),
                    "comments": int(data.get("comment_count") or 0),
                    "shares": int(data.get("share_count") or 0),
                },
                "songTitle": music.get("title") or "original sound",
                "songArtist": music.get("author") or "",
                "songNote": "Sound from the source post. Study only.",
                "sort": len(formats) + 1,
                "parts": [
                    {"label": "Hook", "kind": "text", "file": "", "body": hook, "caption": "Top CapCut hook. Remake as your own text layer."},
                    {"label": "Audio", "kind": "audio", "file": f"{fmt_id}/05-audio-original-sound.mp3", "caption": "Sound as posted on TikTok."},
                ],
            }
        )
        CATALOG.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Added {fmt_id} to {CATALOG.name}")

    code = subprocess.run(
        [sys.executable, str(ROOT / "scripts/meme_decompose/run.py"), fmt_id, "--url", args.url], cwd=ROOT
    ).returncode
    sys.exit(code)


if __name__ == "__main__":
    main()
