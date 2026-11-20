"""Render a format meme from one spec file, and optionally send it to Memes > Review.

    python scripts/meme_build/build.py assets/memes/builds/<id>.json --preview
    python scripts/meme_build/build.py assets/memes/builds/<id>.json
    python scripts/meme_build/build.py assets/memes/builds/<id>.json --publish

--preview writes one frame to .work/meme-build/<id>.jpg. A plain run writes
output/memes/<id>.mp4. --publish also uploads the mp4 to R2 growth/memes/ and
adds or replaces the row in growth/memes.json.

--audio=<file under assets/audio> swaps the sound and --suffix=<-x> renames the
output (YouTube copies use a CC bed: --audio=assets/audio/easy-lemon.m4a --suffix=-yt).
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
LIB = ROOT / "apps" / "web" / "public" / "memes" / "format-library"
OUT = ROOT / "output" / "memes"
WORK = ROOT / ".work" / "meme-build"
FONTS = {
    "arial": "C\\:/Windows/Fonts/arialbd.ttf",
    "impact": "C\\:/Windows/Fonts/impact.ttf",
    "black": "C\\:/Windows/Fonts/seguibl.ttf",
}
W, H = 1080, 1920
# Child processes of a hidden parent otherwise open their own console window on Windows.
NO_WINDOW = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
ID_RE = re.compile(r"^[a-z0-9-]{1,40}$")
HASHTAGS = "#backpain #backpainrelief #posture #physicaltherapy #lowerbackpain"
CTA = "Download Remedy on the App Store — link in bio"

SPEC_KEYS = {
    "id", "format", "variantOf", "changed", "background", "gif", "audio", "seconds",
    "text", "title", "caption", "description", "musicCredit", "results",
    "trim", "zoom", "pan", "speed",
}
GIF_KEYS = {"file", "x", "y", "width"}
AUDIO_KEYS = {"file", "start"}
TEXT_KEYS = {"lines", "y", "size", "x", "box", "font"}
RESULT_KEYS = {"platform", "url", "postedAt", "views", "likes", "shares", "note"}


class SpecError(ValueError):
    pass


def need(cond: bool, msg: str) -> None:
    if not cond:
        raise SpecError(msg)


def strict(obj: Any, keys: set[str], required: set[str], where: str) -> dict[str, Any]:
    need(isinstance(obj, dict), f"{where} must be an object")
    extra = set(obj) - keys
    need(not extra, f"{where} has unknown keys: {sorted(extra)}")
    missing = required - set(obj)
    need(not missing, f"{where} is missing: {sorted(missing)}")
    return obj


def lib_file(rel: Any, where: str) -> Path:
    need(isinstance(rel, str) and rel and ".." not in rel, f"{where} must be a library path")
    path = LIB / rel
    need(path.is_file(), f"{where} not found: {path}")
    return path


def number(value: Any, where: str, lo: float, hi: float) -> float:
    need(isinstance(value, (int, float)) and not isinstance(value, bool), f"{where} must be a number")
    need(lo <= value <= hi, f"{where} must be {lo}-{hi}")
    return float(value)


def load(path: Path) -> dict[str, Any]:
    spec = strict(
        json.loads(path.read_text(encoding="utf-8")),
        SPEC_KEYS,
        {"id", "format", "background", "audio", "seconds", "text", "title", "caption", "description", "musicCredit"},
        "spec",
    )
    need(isinstance(spec["id"], str) and bool(ID_RE.match(spec["id"])), "id must be a-z, 0-9, dashes, max 40")
    need(path.stem == spec["id"], f"file name must be {spec['id']}.json")
    need(spec.get("variantOf") is None or isinstance(spec["variantOf"], str), "variantOf must be an id or null")
    need(isinstance(spec.get("changed", ""), str), "changed must be text")
    lib_file(spec["background"], "background")
    if spec.get("gif") is not None:
        gif = strict(spec["gif"], GIF_KEYS, GIF_KEYS, "gif")
        lib_file(gif["file"], "gif.file")
        number(gif["x"], "gif.x", -W, W)
        number(gif["y"], "gif.y", -H, H)
        number(gif["width"], "gif.width", 40, 2 * W)
    audio = strict(spec["audio"], AUDIO_KEYS, {"file"}, "audio")
    lib_file(audio["file"], "audio.file")
    number(audio.get("start", 0), "audio.start", 0, 600)
    number(spec["seconds"], "seconds", 3, 60)
    number(spec.get("trim", 0), "trim", 0, 1.5)
    number(spec.get("zoom", 1), "zoom", 1, 1.12)
    number(spec.get("pan", 0.5), "pan", 0, 1)
    number(spec.get("speed", 1), "speed", 0.9, 1.1)
    need(float(spec["seconds"]) - float(spec.get("trim", 0)) >= 2, "trim leaves less than 2 seconds")
    need(isinstance(spec["text"], list) and 1 <= len(spec["text"]) <= 3, "text needs 1-3 blocks")
    for i, block in enumerate(spec["text"]):
        strict(block, TEXT_KEYS, {"lines", "y"}, f"text[{i}]")
        lines = block["lines"]
        need(isinstance(lines, list) and 1 <= len(lines) <= 4, f"text[{i}].lines needs 1-4 lines")
        for line in lines:
            need(isinstance(line, str) and 1 <= len(line) <= 34, f"text[{i}] line too long (34 max): {line!r}")
            need("remedy" not in line.lower(), "Do not put Remedy in the on-screen text")
        number(block["y"], f"text[{i}].y", 0, H - 60)
        number(block.get("size", 58), f"text[{i}].size", 30, 96)
        if "x" in block:
            number(block["x"], f"text[{i}].x", 0, W)
        if "box" in block:
            need(block["box"] == "white", f"text[{i}].box must be white")
        if "font" in block:
            need(block["font"] in FONTS, f"text[{i}].font must be one of {sorted(FONTS)}")
    for key in ("title", "caption", "description", "musicCredit"):
        need(isinstance(spec[key], str) and spec[key].strip() != "", f"{key} must be text")
    need(len(spec["title"]) <= 120, "title is too long")
    for i, row in enumerate(spec.get("results", [])):
        strict(row, RESULT_KEYS, {"platform", "url", "postedAt"}, f"results[{i}]")
    return spec


def escape(text: str) -> str:
    return (
        text.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019")
        .replace("%", "\\%").replace(",", "\\,")
    )


def draw(spec: dict[str, Any]) -> str:
    parts = []
    for block in spec["text"]:
        size = int(block.get("size", 58))
        y = int(block["y"])
        # x is the line's center (labels over a character); default centers on the frame.
        xpos = f"{int(block['x'])}-text_w/2" if "x" in block else "(w-text_w)/2"
        font = FONTS[block.get("font", "arial")]
        boxed = block.get("box") == "white"
        ink = "fontcolor=black:box=1:boxcolor=white:boxborderw=18:borderw=0" if boxed else f"fontcolor=white:borderw={max(4, size // 10)}:bordercolor=black"
        for line in block["lines"]:
            parts.append(
                f"drawtext=fontfile='{font}':text='{escape(line)}':fontsize={size}:{ink}:x={xpos}:y={y}"
            )
            y += size + 18
    return ",".join(parts)


def ffmpeg(args: list[str]) -> None:
    res = subprocess.run(
        ["ffmpeg", "-y", *args], capture_output=True, text=True, encoding="utf-8", errors="replace", creationflags=NO_WINDOW
    )
    if res.returncode != 0:
        raise SystemExit(res.stderr[-1500:])


def render(spec: dict[str, Any], preview: bool, audio_path: Path | None = None, suffix: str = "") -> Path:
    secs = float(spec["seconds"])
    trim = float(spec.get("trim", 0))
    zoom = float(spec.get("zoom", 1))
    pan = float(spec.get("pan", 0.5))
    speed = float(spec.get("speed", 1))
    take = secs - trim
    out_secs = take / speed
    gif = spec.get("gif")
    inputs = ["-loop", "1", "-t", f"{take}", "-i", str(LIB / spec["background"])]
    chain = [f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1,fps=30[bg]"]
    last = "bg"
    if gif:
        inputs += ["-ignore_loop", "0", "-stream_loop", "-1", "-ss", f"{trim}", "-t", f"{take}", "-i", str(LIB / gif["file"])]
        width = int(gif["width"]) // 2 * 2
        chain.append(f"[1:v]format=rgba,scale={width}:-1:flags=lanczos,fps=30[gif]")
        chain.append(f"[bg][gif]overlay={int(gif['x'])}:{int(gif['y'])}:format=auto:shortest=0[layered]")
        last = "layered"
    frame = []
    if zoom != 1 or pan != 0.5:
        scale = (
            f"scale=w='trunc(iw*max({W}/iw\\,{H}/ih)*{zoom}/2)*2'"
            f":h='trunc(ih*max({W}/iw\\,{H}/ih)*{zoom}/2)*2'"
        )
        frame.append(f"{scale},crop={W}:{H}:x='(in_w-{W})*{pan}':y='(in_h-{H})/2',setsar=1")
    if speed != 1:
        frame.append(f"setpts=PTS/{speed}")
    if frame:
        chain.append(f"[{last}]{','.join(frame)}[framed]")
        last = "framed"
    chain.append(f"[{last}]{draw(spec)}[out]")
    filt = ";".join(chain)

    if preview:
        WORK.mkdir(parents=True, exist_ok=True)
        dest = WORK / f"{spec['id']}.jpg"
        ffmpeg([*inputs, "-filter_complex", filt, "-map", "[out]", "-ss", "2", "-frames:v", "1", "-update", "1", str(dest)])
        return dest

    OUT.mkdir(parents=True, exist_ok=True)
    dest = OUT / f"{spec['id']}{suffix}.mp4"
    audio = spec["audio"]
    audio_idx = 2 if gif else 1
    start = trim if audio_path else float(audio.get("start", 0)) + trim
    sound = audio_path or (LIB / audio["file"])
    fade = max(0.0, out_secs - 0.6)
    tempo = f",atempo={speed}" if speed != 1 else ""
    ffmpeg([
        *inputs,
        "-ss", f"{start}", "-t", f"{take}", "-i", str(sound),
        "-filter_complex", filt,
        "-map", "[out]", "-map", f"{audio_idx}:a",
        "-af", f"atrim=0:{take},asetpts=PTS-STARTPTS{tempo},afade=t=out:st={fade}:d=0.6",
        "-t", f"{out_secs}", "-r", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
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


def publish(spec: dict[str, Any], mp4: Path) -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    listing = WORK / "memes.json"
    wrangler(["r2", "object", "get", "slideshow/growth/memes.json", "--file", str(listing), "--remote"])
    data = json.loads(listing.read_text(encoding="utf-8"))
    items = [row for row in data.get("items", []) if row.get("id") != spec["id"]]
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
    data["items"] = [row, *items]
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
    files = [Path(a) for a in argv if not a.startswith("--")]
    if not files:
        print(__doc__)
        return 2
    opts = dict(a[2:].split("=", 1) for a in argv if a.startswith("--") and "=" in a)
    audio_path: Path | None = None
    if "audio" in opts:
        audio_path = (ROOT / opts["audio"]).resolve()
        if not audio_path.is_file() or (ROOT / "assets" / "audio") not in audio_path.parents:
            print(f"--audio must be a file under assets/audio: {audio_path}")
            return 3
    suffix = opts.get("suffix", "")
    if suffix and not re.fullmatch(r"-[a-z0-9]{1,8}", suffix):
        print("--suffix must look like -yt")
        return 3
    for file in files:
        path = file if file.is_absolute() else ROOT / file
        try:
            spec = load(path)
        except SpecError as err:
            print(f"{path.name}: {err}")
            return 3
        if "--preview" in argv:
            print(render(spec, preview=True))
            continue
        mp4 = render(spec, preview=False, audio_path=audio_path, suffix=suffix)
        print(mp4)
        if "--publish" in argv and not suffix:
            publish(spec, mp4)
            print(f"in review: {spec['id']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
