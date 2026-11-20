import subprocess
import sys
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Callable

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import build_assets as ba  # noqa: E402

ROOT = Path(__file__).parent
SFX_DIR = Path(r"c:\Users\rkuma\remedy\.cursor\skills\edit\sfx")
OUT = Path(__file__).parent
OUT.mkdir(exist_ok=True)

VIDEO = ba.VIDEO
W, H, FPS = 1080, 1920, 30
ZOOM_CENTER = (540, 760)
FADE_IN, FADE_OUT, RISE = 0.22, 0.2, 24

# Mixkit free sound effects (Mixkit License), saved with the edit skill.
SFX = {
    "card": ("card-in.mp3", 0.11),
    "row": ("box-check.mp3", 0.14),
    "cell": ("soft-click.mp3", 0.05),
    "settle": ("settle.mp3", 0.13),
    "result": ("result.mp3", 0.09),
}


@dataclass
class Card:
    image: Image.Image | Callable[[float], Image.Image]
    start: float
    end: float
    rise: bool = True


@dataclass
class Push:
    start: float
    hold_until: float
    amount: float
    ease_in: float = 0.2
    ease_out: float = 0.5
    # Anchor on the burned caption line when a card is up, so the caption never slides onto the card.
    center_y: int | None = None


@dataclass
class DotsAnim:
    """Row 1 lights its 3 on "three"; row 2 crossfades in, then lights its 10 on "10"."""

    row2_in: float
    fills: tuple[tuple[float, float], tuple[float, float]]

    def lit(self, r: int, t: float) -> int:
        start, end = self.fills[r]
        hit = ba.DOT_ROWS[r][2]
        if t < start:
            return 0
        if t >= end:
            return hit
        return 1 + int(hit * (t - start) / (end - start))

    def state(self, t: float) -> tuple[int, tuple[int, int], tuple[bool, bool]]:
        rows = 2 if t >= self.row2_in else 1
        lit = (self.lit(0, t), self.lit(1, t))
        return rows, lit, (lit[0] == ba.DOT_ROWS[0][2], lit[1] == ba.DOT_ROWS[1][2])

    def cell_times(self) -> list[float]:
        times = []
        for r, (start, end) in enumerate(self.fills):
            hit = ba.DOT_ROWS[r][2]
            times += [round(start + i * (end - start) / hit, 3) for i in range(hit)]
        return times


@lru_cache(maxsize=None)
def dots_image(rows: int, lit: tuple[int, int], counts: tuple[bool, bool]) -> Image.Image:
    return ba.with_shadow(ba.dots_card(rows, lit, counts))


@dataclass
class Cut:
    name: str
    base_zoom: float
    box_top: int
    cards: list[Card]
    pushes: list[Push]
    sounds: list[tuple[str, float]] = field(default_factory=list)


def smooth(x: float) -> float:
    x = max(0.0, min(1.0, x))
    return x * x * (3 - 2 * x)


def push_amount(p: Push, t: float) -> float:
    if t < p.start or t > p.hold_until + p.ease_out:
        return 0.0
    if t < p.start + p.ease_in:
        return p.amount * smooth((t - p.start) / p.ease_in)
    if t <= p.hold_until:
        return p.amount
    return p.amount * (1 - smooth((t - p.hold_until) / p.ease_out))


def zoom_center_y(pushes: list[Push], t: float) -> float:
    cy = float(ZOOM_CENTER[1])
    for p in pushes:
        if p.center_y is not None and p.amount:
            cy += (p.center_y - ZOOM_CENTER[1]) * push_amount(p, t) / p.amount
    return cy


def zoom_frame(frame: Image.Image, z: float, cy: float) -> Image.Image:
    if z <= 1.0001:
        return frame
    cw, ch = W / z, H / z
    cx = ZOOM_CENTER[0]
    left = min(max(cx - cw / 2, 0), W - cw)
    top = min(max(cy - ch / 2, 0), H - ch)
    return frame.resize((W, H), Image.BICUBIC, box=(left, top, left + cw, top + ch))


def card_state(c: Card, t: float) -> tuple[float, int] | None:
    if t < c.start or t > c.end:
        return None
    fade_in = FADE_IN if c.rise else 0.15
    a_in = smooth((t - c.start) / fade_in)
    a_out = 1 - smooth((t - (c.end - FADE_OUT)) / FADE_OUT) if t > c.end - FADE_OUT else 1.0
    rise = round(RISE * (1 - a_in)) if c.rise else 0
    return min(a_in, a_out), rise


def overlay(frame: Image.Image, cut: Cut, t: float) -> Image.Image:
    for c in cut.cards:
        state = card_state(c, t)
        if state is None:
            continue
        alpha, rise = state
        img = c.image(t) if callable(c.image) else c.image
        if alpha < 0.999:
            img = img.copy()
            img.putalpha(img.getchannel("A").point(lambda v: round(v * alpha)))
        frame.alpha_composite(img, ((W - img.width) // 2, cut.box_top - 30 + rise))
    return frame


def mix_audio(cut: Cut) -> Path:
    out = ROOT / f"audio_{cut.name}.wav"
    args = ["ffmpeg", "-v", "error", "-y", "-i", str(VIDEO)]
    chains = []
    for i, (kind, t) in enumerate(cut.sounds, start=1):
        file, gain = SFX[kind]
        args += ["-i", str(SFX_DIR / file)]
        ms = round(t * 1000)
        chains.append(
            f"[{i}:a]aresample=48000,aformat=channel_layouts=stereo,"
            f"silenceremove=start_periods=1:start_threshold=-45dB,lowpass=f=9000,"
            f"volume={gain},adelay={ms}|{ms}[s{i}]"
        )
    labels = "".join(f"[s{i}]" for i in range(1, len(cut.sounds) + 1))
    graph = ";".join(
        ["[0:a]aresample=48000,aformat=channel_layouts=stereo[v]", *chains,
         f"[v]{labels}amix=inputs={len(cut.sounds) + 1}:normalize=0:duration=first[a]"]
    )
    args += ["-filter_complex", graph, "-map", "[a]", "-c:a", "pcm_s16le", str(out)]
    subprocess.run(args, check=True)
    return out


def render(cut: Cut) -> Path:
    audio = mix_audio(cut)
    out = OUT / f"{cut.name}.mp4"
    dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", str(VIDEO), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                           stdout=subprocess.PIPE)
    enc = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
         "-i", "-", "-i", str(audio), "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "medium",
         "-crf", "17", "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709",
         "-color_trc", "bt709", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out)],
        stdin=subprocess.PIPE)
    size = W * H * 3
    n = 0
    assert dec.stdout and enc.stdin
    while True:
        raw = dec.stdout.read(size)
        if len(raw) < size:
            break
        t = n / FPS
        z = cut.base_zoom * (1 + sum(push_amount(p, t) for p in cut.pushes))
        frame = zoom_frame(Image.frombytes("RGB", (W, H), raw), z, zoom_center_y(cut.pushes, t)).convert("RGBA")
        enc.stdin.write(overlay(frame, cut, t).convert("RGB").tobytes())
        n += 1
    enc.stdin.close()
    enc.wait()
    dec.wait()
    print(cut.name, n, "frames ->", out)
    return out


def build_cut(name: str, base_zoom: float, box_top: int, hook, paper, g1, g2, dots_in_out, anim: DotsAnim,
              pushes: list[Push]) -> Cut:
    cards = [
        Card(ba.with_shadow(ba.hook_card()), *hook),
        Card(ba.with_shadow(ba.paper_card()), *paper),
        Card(ba.with_shadow(ba.groups_card(1)), *g1),
        Card(ba.with_shadow(ba.groups_card(2)), *g2, rise=False),
        Card(lambda t: dots_image(1, *anim.state(t)[1:]), dots_in_out[0], anim.row2_in + 0.15),
        Card(lambda t: dots_image(2, *anim.state(t)[1:]), anim.row2_in, dots_in_out[1], rise=False),
    ]
    sounds = [("card", hook[0]), ("card", paper[0]), ("card", g1[0]), ("row", g2[0]), ("card", dots_in_out[0])]
    sounds += [("cell", t) for t in anim.cell_times()]
    sounds += [("row", anim.row2_in), ("settle", anim.fills[1][1])]
    sounds = [(k, t) for k, t in sounds if t > 0]
    return Cut(name, base_zoom, box_top, cards, pushes, sounds)


CUT_A = build_cut(
    "band", 1.0, ba.BOX_TOP,
    hook=(-0.3, 5.1),
    paper=(5.54, 10.9), g1=(12.28, 13.43), g2=(13.28, 15.3),
    dots_in_out=(15.46, 26.9),
    anim=DotsAnim(row2_in=22.54, fills=((17.08, 17.6), (24.48, 25.4))),
    pushes=[Push(17.08, 21.44, 0.07, center_y=1300), Push(27.2, 30.96, 0.06), Push(31.88, 33.86, 0.05, ease_out=0.45)],
)

if __name__ == "__main__":
    render(CUT_A)
