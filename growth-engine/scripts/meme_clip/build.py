"""Burn our caption onto a clip or a full-frame GIF, then send it to Review.

    python scripts/meme_clip/build.py assets/memes/builds/<id>.json --preview
    python scripts/meme_clip/build.py assets/memes/builds/<id>.json --publish

The clip is the whole picture. An mp4 keeps its own sound. A gif needs "audio".
"cover" is a white bar (y, h on the 1080x1920 frame) that hides their old line.
--publish also drops every other meme still sitting in Review.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "memes"
WORK = ROOT / ".work" / "meme-build"
FONTS = {
    "arial": "C\\:/Windows/Fonts/arialbd.ttf",
    "impact": "C\\:/Windows/Fonts/impact.ttf",
    "black": "C\\:/Windows/Fonts/seguibl.ttf",
}
W, H = 1080, 1920
NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
ID_RE = re.compile(r"^[a-z0-9-]{1,40}$")
HASHTAGS = "#backpain #backpainrelief #posture #physicaltherapy #lowerbackpain"
CTA = "Download Remedy on the App Store — link in bio"
SPEC_KEYS = {
    "id", "clip", "audio", "seconds", "cover", "text", "title", "caption", "description", "musicCredit",
    "trim", "zoom", "pan", "speed", "pitch", "wipe",
}
TEXT_KEYS = {"lines", "y", "size", "box", "font"}
COVER_KEYS = {"y", "h"}
WIPE_KEYS = {"y", "h"}


class SpecError(ValueError):
    pass


def need(cond: bool, msg: str) -> None:
    if not cond:
        raise SpecError(msg)


def escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019")
        .replace("%", "\\%").replace(",", "\\,")
    )


def load(path: Path) -> dict[str, Any]:
    spec = json.loads(path.read_text(encoding="utf-8"))
    need(isinstance(spec, dict), "spec must be an object")
    extra = set(spec) - SPEC_KEYS
    need(not extra, f"unknown keys: {sorted(extra)}")
    missing = {"id", "clip", "seconds", "text", "title", "caption", "description", "musicCredit"} - set(spec)
    need(not missing, f"missing: {sorted(missing)}")
    need(isinstance(spec["id"], str) and ID_RE.fullmatch(spec["id"]), "id must be a short slug")
    clip = ROOT / spec["clip"]
    need(clip.is_file() and clip.suffix.lower() in {".mp4", ".gif"}, "clip must be an mp4 or gif under the repo")
    spec["_clip"] = clip
    if clip.suffix.lower() == ".gif":
        need(isinstance(spec.get("audio"), str), "a gif needs audio")
        audio = ROOT / spec["audio"]
        need(audio.is_file(), f"audio not found: {audio}")
        spec["_audio"] = audio
    elif "audio" in spec:
        audio = ROOT / spec["audio"]
        need(audio.is_file(), f"audio not found: {audio}")
        spec["_audio"] = audio
    if spec.get("_audio"):
        try:
            spec["_audio"].resolve().relative_to(ROOT / "assets" / "audio")
        except ValueError:
            pass
        else:
            raise SpecError("Do not use the slideshow music beds. A meme keeps its own sound.")
    secs = spec["seconds"]
    need(isinstance(secs, (int, float)) and not isinstance(secs, bool) and 2 <= float(secs) <= 30, "seconds must be 2-30")
    for key, lo, hi, label in (
        ("trim", 0, 1.5, "trim must be 0-1.5 seconds"),
        ("zoom", 1, 1.12, "zoom must be 1-1.12"),
        ("pan", 0, 1, "pan must be 0-1"),
        ("speed", 0.9, 1.1, "speed must be 0.9-1.1"),
    ):
        if key not in spec:
            continue
        val = spec[key]
        need(isinstance(val, (int, float)) and not isinstance(val, bool), f"{key} must be a number")
        need(lo <= float(val) <= hi, label)
    if "pitch" in spec:
        pitch = spec["pitch"]
        need(isinstance(pitch, (int, float)) and not isinstance(pitch, bool), "pitch must be a number")
        need(0.97 <= float(pitch) <= 1.04, "pitch must be 0.97-1.04")
    if "wipe" in spec:
        wipe = spec["wipe"]
        need(isinstance(wipe, dict) and set(wipe) <= WIPE_KEYS and {"y", "h"} <= set(wipe), "wipe needs y and h")
        need(isinstance(wipe["y"], int) and isinstance(wipe["h"], int), "wipe y and h must be integers")
        need(wipe["y"] % 2 == 0 and wipe["h"] % 2 == 0, "wipe y and h must be even")
        need(2 <= wipe["y"] and 40 <= wipe["h"] <= 460 and wipe["y"] + wipe["h"] <= H - 2, "wipe is outside the frame")
    if "cover" in spec:
        cover = spec["cover"]
        need(isinstance(cover, dict) and set(cover) <= COVER_KEYS and {"y", "h"} <= set(cover), "cover needs y and h")
        need(isinstance(cover["y"], int) and isinstance(cover["h"], int), "cover y and h must be integers")
        need(0 <= cover["y"] < H and 20 <= cover["h"] <= 600, "cover is outside the frame")
    need(isinstance(spec["text"], list) and 1 <= len(spec["text"]) <= 2, "text needs 1-2 blocks")
    for i, block in enumerate(spec["text"]):
        need(isinstance(block, dict) and {"lines", "y"} <= set(block) <= TEXT_KEYS, f"text[{i}] has bad keys")
        lines = block["lines"]
        need(isinstance(lines, list) and 1 <= len(lines) <= 4, f"text[{i}] needs 1-4 lines")
        for line in lines:
            need(isinstance(line, str) and 1 <= len(line) <= 34, f"line too long (34 max): {line!r}")
            low = line.lower()
            need("remedy" not in low and "heating pad" not in low, "Do not put Remedy or a heating pad on screen")
        need(isinstance(block["y"], int) and 0 <= block["y"] <= H - 60, f"text[{i}].y is off the frame")
        if "box" in block:
            need(block["box"] == "white", "box must be white")
        if "font" in block:
            need(block["font"] in FONTS, f"font must be one of {sorted(FONTS)}")
    for key in ("title", "caption", "description", "musicCredit"):
        need(isinstance(spec[key], str) and spec[key].strip() and len(spec[key]) <= 200, f"{key} must be short text")
    need("heating pad" not in spec["title"].lower() and "heating pad" not in spec["caption"].lower(), "Do not say heating pad")
    return spec


def draw(spec: dict[str, Any]) -> str:
    parts = []
    cover = spec.get("cover")
    if cover:
        parts.append(f"drawbox=x=0:y={int(cover['y'])}:w={W}:h={int(cover['h'])}:color=white:t=fill")
    for block in spec["text"]:
        size = int(block.get("size", 54))
        y = int(block["y"])
        font = FONTS[block.get("font", "arial")]
        # The cover is white, so the line has to be black. White type on it disappears.
        on_white = cover is not None or block.get("box") == "white"
        ink = "fontcolor=black:borderw=0" if on_white else f"fontcolor=white:borderw={max(4, size // 10)}:bordercolor=black"
        for line in block["lines"]:
            parts.append(
                f"drawtext=fontfile='{font}':text='{escape(line)}':fontsize={size}:{ink}:x=(w-text_w)/2:y={y}"
            )
            y += size + 16
    return ",".join(parts)


def ffmpeg(args: list[str]) -> None:
    res = subprocess.run(
        ["ffmpeg", "-y", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW
    )
    if res.returncode != 0:
        raise SystemExit(res.stderr[-1500:])


def video_chain(spec: dict[str, Any]) -> str:
    zoom = float(spec.get("zoom", 1))
    pan = float(spec.get("pan", 0.5))
    speed = float(spec.get("speed", 1))
    trim = float(spec.get("trim", 0))
    secs = float(spec["seconds"])
    # Trim in the filter. This file has one keyframe, so seeking the input jumps to the wrong shot.
    head = f"trim=start={trim}:duration={secs},setpts=PTS-STARTPTS," if trim else ""
    if zoom == 1 and pan == 0.5:
        scale = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H}"
    else:
        scale = (
            f"scale=w='trunc(iw*max({W}/iw\\,{H}/ih)*{zoom}/2)*2'"
            f":h='trunc(ih*max({W}/iw\\,{H}/ih)*{zoom}/2)*2',"
            f"crop={W}:{H}:x='(in_w-{W})*{pan}':y='(in_h-{H})/2'"
        )
    pts = f",setpts=PTS/{speed}" if speed != 1 else ""
    base = f"[0:v]{head}{scale},setsar=1,fps=30{pts}"
    wipe = spec.get("wipe")
    if not wipe:
        return f"{base},{draw(spec)}[out]"
    y, h = int(wipe["y"]), int(wipe["h"])
    # Soften only the old caption so the new line can sit on the picture. No filled panel.
    return (
        f"{base}[base];"
        f"[base]split[sharp][soft];"
        f"[soft]crop={W}:{h}:0:{y},boxblur=20:4[band];"
        f"[sharp][band]overlay=0:{y},{draw(spec)}[out]"
    )


def render(spec: dict[str, Any], preview: bool) -> Path:
    clip: Path = spec["_clip"]
    secs = float(spec["seconds"])
    trim = float(spec.get("trim", 0))
    speed = float(spec.get("speed", 1))
    out_secs = secs / speed
    gif = clip.suffix.lower() == ".gif"
    take = trim + secs
    inputs = ["-stream_loop", "-1", "-t", f"{take}", "-i", str(clip)] if gif else ["-t", f"{take}", "-i", str(clip)]
    audio_idx = 0
    if spec.get("_audio"):
        inputs += ["-t", f"{secs}", "-i", str(spec["_audio"])]
        audio_idx = 1
    filt = video_chain(spec)
    if preview:
        WORK.mkdir(parents=True, exist_ok=True)
        dest = WORK / f"{spec['id']}.jpg"
        ffmpeg([*inputs, "-filter_complex", filt, "-map", "[out]", "-ss", "1.2", "-frames:v", "1", "-update", "1", str(dest)])
        return dest
    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"{spec['id']}.mp4"
    fade = max(0.0, out_secs - 0.4)
    pitch = float(spec.get("pitch", 1))
    audio_bits = []
    if spec.get("_audio"):
        audio_bits.append(f"atrim=0:{secs},asetpts=PTS-STARTPTS")
    else:
        audio_bits.append(f"atrim=start={trim}:duration={secs},asetpts=PTS-STARTPTS")
    if pitch != 1:
        # Pitch only. Duration stays put, then the clip speed is applied after.
        audio_bits.append("aresample=44100")
        audio_bits.append(f"asetrate={int(round(44100 * pitch))}")
        audio_bits.append("aresample=44100")
        audio_bits.append(f"atempo={1 / pitch:.5f}")
    if speed != 1:
        audio_bits.append(f"atempo={speed}")
    audio_bits.append(f"afade=t=out:st={fade}:d=0.4")
    ffmpeg([
        *inputs, "-filter_complex", filt, "-map", "[out]", "-map", f"{audio_idx}:a",
        "-af", ",".join(audio_bits),
        "-t", f"{out_secs}", "-r", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", "-shortest",
        str(dest),
    ])
    return dest


def wrangler(args: list[str]) -> None:
    env = {k: v for k, v in os.environ.items() if k != "CLOUDFLARE_API_TOKEN"}
    cmd = "npx wrangler " + " ".join(args)
    for attempt in range(2):
        res = subprocess.run(
            cmd, shell=True, cwd=ROOT, env=env, capture_output=True, text=True, encoding="utf-8", errors="replace",
            creationflags=NO_WINDOW,
        )
        if res.returncode == 0:
            return
        if attempt == 1:
            raise SystemExit(f"wrangler failed: {res.stderr[-600:]}")


def publish(spec: dict[str, Any], mp4: Path, keep_review: bool) -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    listing = WORK / "memes.json"
    wrangler(["r2", "object", "get", "slideshow/growth/memes.json", "--file", str(listing), "--remote"])
    data = json.loads(listing.read_text(encoding="utf-8"))
    kept = [
        row for row in data.get("items", [])
        if row.get("id") != spec["id"] and (keep_review or row.get("status") != "review")
    ]
    lines = [line for block in spec["text"] for line in block["lines"]]
    caption = spec["caption"].strip()
    if CTA not in caption:
        caption = f"{caption}\n\n{CTA}"
    row = {
        "id": spec["id"],
        "title": spec["title"],
        "caption": caption,
        "description": spec["description"],
        "hashtags": HASHTAGS,
        "lines": lines,
        "musicCredit": spec["musicCredit"],
        "status": "review",
        "rejectedReason": "",
        "createdAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
    data["items"] = [row, *kept]
    wrangler([
        "r2", "object", "put", f"slideshow/growth/memes/{spec['id']}.mp4",
        "--file", str(mp4), "--content-type", "video/mp4", "--remote",
    ])
    listing.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    wrangler([
        "r2", "object", "put", "slideshow/growth/memes.json",
        "--file", str(listing), "--content-type", "application/json", "--remote",
    ])


def main(argv: list[str]) -> int:
    files = [a for a in argv if not a.startswith("--")]
    if len(files) != 1:
        print(__doc__)
        return 2
    path = Path(files[0])
    if not path.is_absolute():
        path = ROOT / path
    try:
        spec = load(path)
    except SpecError as err:
        print(err)
        return 3
    if "--preview" in argv:
        print(render(spec, preview=True))
        return 0
    mp4 = render(spec, preview=False)
    print(mp4)
    if "--publish" in argv:
        publish(spec, mp4, keep_review="--keep-review" in argv)
        print(f"in review: {spec['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
