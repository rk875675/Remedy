"""
Remedy-original figure kit.

Clones the construction of desk-worker.svg (sitting) and phone-app.svg
(standing): same viewBox, palette, limb weight, chair, desk, and phone UI.
Original vector drawings — not traces of Humaaans, Open Doodles, or
illlustrations.co.

Does not overwrite desk-worker.svg, phone-app.svg, or spine.svg.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CUSTOM = ROOT / "assets" / "illustrations" / "custom"
MANIFEST = ROOT / "assets" / "illustrations" / "manifest.json"

SKIN = "#f5cba7"
HAIR = "#3d2314"
HAIR_GRAY = "#6b5b53"
HAIR_WARM = "#5c3a21"
SHIRT = "#4a7c59"
SHIRT_DARK = "#3d6649"
PANTS = "#3d3d3d"
SHOES = "#2d3436"
DESK = "#8d7b68"
DESK_LIGHT = "#c4b4a0"
MONITOR = "#2d3436"
SCREEN = "#74b9ff"
CHAIR = "#555"
CHAIR_POST = "#444"
CORAL = "#e07a5f"
PHONE = "#1c1c1e"
APP = "#33663f"
INK = "#2d3436"
MOUTH_PAIN = "#c0392b"
MOUTH_OK = "#8d6e63"


def svg(parts: list[str]) -> str:
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 700">\n  ' + "\n  ".join(p for p in parts if p) + "\n</svg>\n"


def shadow(cx: float = 300, cy: float = 640, rx: float = 80, ry: float = 11, op: float = 0.07) -> str:
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#000" opacity="{op}"/>'


def glow(cx: float, cy: float) -> str:
    # Same single wash as desk-worker — never a badge or bang.
    return f'<ellipse cx="{cx}" cy="{cy}" rx="28" ry="22" fill="{CORAL}" opacity="0.22"/>'


def phone(x: float, y: float, w: float = 64, h: float = 110) -> str:
    return (
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="{PHONE}"/>'
        f'<rect x="{x + 4}" y="{y + 8}" width="{w - 8}" height="{h - 16}" rx="6" fill="{APP}"/>'
        f'<rect x="{x + 12}" y="{y + 18}" width="{w - 24}" height="6" rx="3" fill="#fff" opacity="0.8"/>'
        f'<rect x="{x + 12}" y="{y + 30}" width="{w - 32}" height="4" rx="2" fill="#fff" opacity="0.5"/>'
        f'<rect x="{x + 12}" y="{y + 40}" width="{w - 28}" height="4" rx="2" fill="#fff" opacity="0.5"/>'
        f'<rect x="{x + 12}" y="{y + 52}" width="{w - 24}" height="20" rx="4" fill="#fff" opacity="0.2"/>'
        f'<rect x="{x + 12}" y="{y + 78}" width="{w - 24}" height="14" rx="4" fill="#fff" opacity="0.15"/>'
    )


def hair_path(cx: float, cy: float, style: str, fill: str) -> str:
    if style == "bun":
        return (
            f'<ellipse cx="{cx + 4}" cy="{cy - 38}" rx="15" ry="13" fill="{fill}"/>'
            f'<path d="M{cx - 30} {cy - 12} C{cx - 26} {cy - 38} {cx + 2} {cy - 50} {cx + 30} {cy - 36} '
            f'C{cx + 36} {cy - 14} {cx + 32} {cy - 2} {cx + 22} {cy - 6} '
            f'C{cx + 10} {cy - 24} {cx - 10} {cy - 22} {cx - 26} {cy - 8} Z" fill="{fill}"/>'
        )
    if style == "pony":
        return (
            f'<path d="M{cx - 30} {cy - 12} C{cx - 24} {cy - 40} {cx + 4} {cy - 54} {cx + 30} {cy - 38} '
            f'C{cx + 36} {cy - 16} {cx + 30} {cy - 2} {cx + 18} {cy - 6} '
            f'C{cx + 8} {cy - 26} {cx - 12} {cy - 22} {cx - 26} {cy - 8} Z" fill="{fill}"/>'
            f'<path d="M{cx + 20} {cy - 30} C{cx + 44} {cy - 8} {cx + 48} {cy + 22} {cx + 36} {cy + 38} '
            f'C{cx + 34} {cy + 16} {cx + 28} {cy - 8} {cx + 20} {cy - 22} Z" fill="{fill}"/>'
        )
    if style == "long":
        return (
            f'<path d="M{cx - 32} {cy - 10} C{cx - 28} {cy - 42} {cx + 4} {cy - 54} {cx + 32} {cy - 36} '
            f'C{cx + 38} {cy - 14} {cx + 34} {cy + 12} {cx + 28} {cy + 30} '
            f'C{cx + 26} {cy + 8} {cx + 20} {cy - 10} {cx + 8} {cy - 22} '
            f'C{cx - 8} {cy - 24} {cx - 22} {cy - 10} {cx - 30} {cy + 16} '
            f'C{cx - 34} {cy + 8} {cx - 34} {cy - 2} {cx - 32} {cy - 10} Z" fill="{fill}"/>'
        )
    if style == "side":
        return (
            f'<path d="M{cx - 26} {cy - 14} C{cx - 8} {cy - 48} {cx + 22} {cy - 50} {cx + 34} {cy - 18} '
            f'C{cx + 36} {cy - 4} {cx + 28} {cy + 4} {cx + 18} {cy  } '
            f'C{cx + 16} {cy - 18} {cx} {cy - 26} {cx - 16} {cy - 16} '
            f'C{cx - 24} {cy - 12} {cx - 28} {cy - 10} {cx - 26} {cy - 14} Z" fill="{fill}"/>'
        )
    if style == "buzz":
        return (
            f'<path d="M{cx - 26} {cy - 8} C{cx - 18} {cy - 34} {cx + 6} {cy - 42} {cx + 28} {cy - 26} '
            f'C{cx + 32} {cy - 10} {cx + 24} {cy} {cx + 14} {cy - 6} '
            f'C{cx + 4} {cy - 22} {cx - 12} {cy - 18} {cx - 22} {cy - 6} Z" fill="{fill}"/>'
        )
    # short — same silhouette as desk-worker / phone-app
    return (
        f'<path d="M{cx - 30} {cy - 12} C{cx - 28} {cy - 37} {cx - 3} {cy - 52} {cx + 27} {cy - 42} '
        f'C{cx + 37} {cy - 37} {cx + 34} {cy - 12} {cx + 32} {cy - 4} '
        f'C{cx + 30} {cy - 17} {cx + 12} {cy - 27} {cx - 8} {cy - 24} '
        f'C{cx - 23} {cy - 22} {cx - 28} {cy - 14} {cx - 30} {cy - 12} Z" fill="{fill}"/>'
    )


def face(cx: float, cy: float, hair: str, mouth: str, hair_fill: str = HAIR) -> str:
    mouth_el = {
        "grimace": f'<path d="M{cx - 8} {cy + 16} Q{cx} {cy + 20} {cx + 8} {cy + 16}" stroke="{MOUTH_PAIN}" stroke-width="2" fill="none" stroke-linecap="round"/>',
        "smile": f'<path d="M{cx - 8} {cy + 16} Q{cx} {cy + 22} {cx + 8} {cy + 16}" stroke="{MOUTH_OK}" stroke-width="2" fill="none" stroke-linecap="round"/>',
        "flat": f'<path d="M{cx - 6} {cy + 16} Q{cx} {cy + 17} {cx + 6} {cy + 16}" stroke="{MOUTH_OK}" stroke-width="2" fill="none" stroke-linecap="round"/>',
    }[mouth]
    return (
        f'<rect x="{cx - 10}" y="{cy + 18}" width="20" height="28" rx="8" fill="{SKIN}"/>'
        f'<ellipse cx="{cx + 2}" cy="{cy}" rx="32" ry="36" fill="{SKIN}"/>'
        + hair_path(cx, cy, hair, hair_fill)
        + f'<circle cx="{cx - 13}" cy="{cy + 2}" r="2.5" fill="{INK}"/>'
        f'<circle cx="{cx + 10}" cy="{cy + 2}" r="2.5" fill="{INK}"/>'
        + mouth_el
    )


def office_chair() -> str:
    return (
        f'<path d="M380 600 Q395 590 410 600 L410 620 L380 620 Z" fill="{CHAIR}"/>'
        f'<rect x="388" y="460" width="14" height="140" rx="4" fill="{CHAIR_POST}"/>'
        f'<path d="M374 440 C380 415 414 415 420 440 L422 465 L372 465 Z" fill="{CHAIR}"/>'
    )


def desk() -> str:
    return (
        f'<rect x="120" y="380" width="260" height="14" rx="4" fill="{DESK}"/>'
        f'<rect x="130" y="394" width="14" height="226" fill="{DESK}"/>'
        f'<rect x="356" y="394" width="14" height="226" fill="{DESK}"/>'
        f'<rect x="140" y="430" width="240" height="8" rx="2" fill="{DESK_LIGHT}" opacity="0.5"/>'
    )


def monitor_day() -> str:
    return (
        f'<rect x="200" y="270" width="140" height="100" rx="8" fill="{MONITOR}"/>'
        f'<rect x="206" y="276" width="128" height="82" rx="4" fill="{SCREEN}"/>'
        f'<rect x="215" y="290" width="60" height="6" rx="3" fill="#fff" opacity="0.6"/>'
        f'<rect x="215" y="302" width="80" height="5" rx="2" fill="#fff" opacity="0.4"/>'
        f'<rect x="215" y="313" width="50" height="5" rx="2" fill="#fff" opacity="0.3"/>'
        f'<rect x="258" y="370" width="24" height="12" fill="{MONITOR}"/>'
        f'<rect x="245" y="378" width="50" height="6" rx="3" fill="#636e72"/>'
    )


def monitor_night() -> str:
    return (
        f'<rect x="200" y="270" width="140" height="100" rx="8" fill="{MONITOR}"/>'
        f'<rect x="206" y="276" width="128" height="82" rx="4" fill="#1a2744"/>'
        f'<rect x="215" y="290" width="60" height="6" rx="3" fill="#74b9ff" opacity="0.7"/>'
        f'<rect x="215" y="302" width="80" height="5" rx="2" fill="#74b9ff" opacity="0.4"/>'
        f'<rect x="215" y="313" width="50" height="5" rx="2" fill="#74b9ff" opacity="0.28"/>'
        f'<rect x="258" y="370" width="24" height="12" fill="{MONITOR}"/>'
        f'<rect x="245" y="378" width="50" height="6" rx="3" fill="#636e72"/>'
    )


def monitor_call() -> str:
    return (
        f'<rect x="200" y="270" width="140" height="100" rx="8" fill="{MONITOR}"/>'
        f'<rect x="206" y="276" width="128" height="82" rx="4" fill="#1b3a4b"/>'
        f'<rect x="214" y="284" width="54" height="32" rx="4" fill="#4a7c59" opacity="0.75"/>'
        f'<rect x="272" y="284" width="54" height="32" rx="4" fill="#5a7a8a" opacity="0.75"/>'
        f'<rect x="214" y="320" width="54" height="30" rx="4" fill="#3d5a80" opacity="0.75"/>'
        f'<rect x="272" y="320" width="54" height="30" rx="4" fill="#74b9ff" opacity="0.4"/>'
        f'<rect x="258" y="370" width="24" height="12" fill="{MONITOR}"/>'
        f'<rect x="245" y="378" width="50" height="6" rx="3" fill="#636e72"/>'
    )


def sit_body(*, hair: str, mouth: str, hair_fill: str, pain: bool, rising: bool = False) -> str:
    """Desk-worker body: hunched in the chair, facing the monitor."""
    if rising:
        torso = (
            f'<path d="M355 300 C348 350 350 400 358 440 C360 450 378 458 400 450 Z" fill="{SHIRT}"/>'
            f'<path d="M358 300 C355 340 356 380 360 420" stroke="{SHIRT_DARK}" stroke-width="2" fill="none" opacity="0.35"/>'
        )
        head = face(368, 268, hair, mouth, hair_fill)
        arm_back = f'<path d="M355 360 C338 380 318 388 308 384" fill="{SKIN}" stroke="#e8b796" stroke-width="1"/>'
        hand_back = f'<ellipse cx="308" cy="384" rx="9" ry="7" fill="{SKIN}"/>'
        arm_front = f'<path d="M390 350 C402 375 412 400 406 428" fill="{SKIN}" stroke="#e8b796" stroke-width="1"/>'
        hand_front = f'<ellipse cx="406" cy="428" rx="10" ry="8" fill="{SKIN}"/>'
        g = glow(400, 430) if pain else ""
    else:
        torso = (
            f'<path d="M395 430 C385 380 370 370 365 340 C362 340 358 342 355 344 L348 430 C350 440 370 450 395 445 Z" fill="{SHIRT}"/>'
            f'<path d="M355 344 C360 370 365 400 362 430 L348 430 C350 380 352 360 355 344 Z" fill="{SHIRT_DARK}" opacity="0.4"/>'
        )
        head = face(368, 272, hair, mouth, hair_fill)
        arm_back = f'<path d="M355 370 C340 380 320 385 310 382" fill="{SKIN}" stroke="#e8b796" stroke-width="1"/>'
        hand_back = f'<ellipse cx="310" cy="382" rx="9" ry="7" fill="{SKIN}"/>'
        arm_front = f'<path d="M390 380 C400 400 415 420 410 445 C408 455 402 460 398 458" fill="{SKIN}" stroke="#e8b796" stroke-width="1"/>'
        hand_front = f'<ellipse cx="398" cy="458" rx="10" ry="8" fill="{SKIN}"/>'
        g = glow(412, 442) if pain else ""
    legs = (
        f'<path d="M375 445 C370 480 365 530 370 580 L384 580 C386 530 388 480 390 445 Z" fill="{PANTS}"/>'
        f'<path d="M390 445 C395 480 400 530 395 580 L410 580 C412 530 408 480 400 445 Z" fill="{PANTS}"/>'
        f'<ellipse cx="377" cy="585" rx="14" ry="8" fill="{SHOES}"/>'
        f'<ellipse cx="402" cy="585" rx="14" ry="8" fill="{SHOES}"/>'
    )
    return torso + head + arm_front + hand_front + arm_back + hand_back + g + legs


def stand_body(
    *,
    hair: str,
    mouth: str,
    hair_fill: str,
    pain: bool,
    hold_phone: bool,
    stride: bool = False,
    wave: bool = False,
) -> str:
    """Phone-app body: centered standing figure."""
    if stride:
        legs = (
            f'<path d="M278 480 C268 520 258 570 262 620" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>'
            f'<path d="M322 480 C338 520 352 570 348 620" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>'
            f'<path d="M248 618 C245 625 248 635 263 636 C275 636 278 630 276 624" fill="{SHOES}"/>'
            f'<path d="M334 618 C331 625 334 635 349 636 C361 636 364 630 362 624" fill="{SHOES}"/>'
        )
        sh = shadow(305, 640, 78, 10, 0.08)
    else:
        legs = (
            f'<path d="M285 480 C283 520 280 570 278 620" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>'
            f'<path d="M315 480 C317 520 320 570 322 620" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>'
            f'<path d="M265 618 C262 625 265 635 280 636 C292 636 295 630 293 624" fill="{SHOES}"/>'
            f'<path d="M308 618 C305 625 308 635 323 636 C335 636 338 630 336 624" fill="{SHOES}"/>'
        )
        sh = shadow(300, 640, 60, 10, 0.08)
    torso = (
        f'<path d="M270 340 C265 380 268 430 280 480 L320 480 C332 430 335 380 330 340 Z" fill="{SHIRT}"/>'
        f'<path d="M295 340 C298 380 300 430 302 480" stroke="{SHIRT_DARK}" stroke-width="2" fill="none" opacity="0.3"/>'
        f'<path d="M280 340 C290 348 310 348 320 340" fill="none" stroke="{SHIRT_DARK}" stroke-width="2"/>'
    )
    head = face(300, 275, hair, mouth, hair_fill)
    if wave:
        arms = (
            f'<path d="M275 360 C250 340 235 310 242 285" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>'
            f'<ellipse cx="242" cy="282" rx="10" ry="8" fill="{SKIN}"/>'
            f'<path d="M325 360 C340 380 345 410 340 430" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>'
        )
        extra = ""
    elif hold_phone:
        arms = (
            f'<path d="M275 360 C260 380 255 410 260 430" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>'
            f'<path d="M325 360 C340 380 345 410 340 430" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>'
        )
        extra = phone(268, 420)
    else:
        arms = (
            f'<path d="M275 360 C260 380 255 410 260 430" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>'
            f'<path d="M325 360 C340 380 345 410 340 430" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>'
        )
        extra = ""
    g = glow(288, 430) if pain else ""
    return sh + legs + torso + head + arms + extra + g


# ---------------------------------------------------------------------------
# Scenes
# ---------------------------------------------------------------------------

def fig_laptop_slouch() -> str:
    return svg([
        shadow(300, 620, 180, 18, 0.06),
        desk(),
        # laptop on the desk instead of a monitor
        f'<rect x="190" y="300" width="160" height="82" rx="8" fill="{MONITOR}"/>'
        f'<rect x="196" y="306" width="148" height="62" rx="4" fill="{SCREEN}"/>'
        f'<rect x="208" y="318" width="56" height="5" rx="2" fill="#fff" opacity="0.55"/>'
        f'<rect x="208" y="330" width="78" height="4" rx="2" fill="#fff" opacity="0.35"/>'
        f'<rect x="220" y="382" width="100" height="10" rx="3" fill="#636e72"/>',
        office_chair(),
        sit_body(hair="side", mouth="grimace", hair_fill=HAIR_WARM, pain=True),
    ])


def fig_rising_chair() -> str:
    return svg([
        shadow(300, 620, 180, 18, 0.06),
        desk(),
        monitor_day(),
        office_chair(),
        sit_body(hair="short", mouth="grimace", hair_fill=HAIR_WARM, pain=True, rising=True),
    ])


def fig_video_call() -> str:
    return svg([
        shadow(300, 620, 180, 18, 0.06),
        desk(),
        monitor_call(),
        office_chair(),
        sit_body(hair="bun", mouth="grimace", hair_fill=HAIR, pain=True),
    ])


def fig_late_night() -> str:
    mug = (
        f'<ellipse cx="168" cy="376" rx="13" ry="9" fill="#6b5344"/>'
        f'<rect x="160" y="358" width="16" height="20" rx="3" fill="#6b5344"/>'
    )
    return svg([
        shadow(300, 620, 180, 18, 0.06),
        desk(),
        monitor_night(),
        mug,
        office_chair(),
        sit_body(hair="short", mouth="grimace", hair_fill=HAIR_GRAY, pain=True),
    ])


def fig_follow_app() -> str:
    return svg([
        shadow(300, 620, 140, 16, 0.06),
        office_chair(),
        sit_body(hair="side", mouth="smile", hair_fill=HAIR, pain=False),
        phone(248, 400, 58, 100),
    ])


def fig_desk_break() -> str:
    return svg([
        shadow(260, 620, 200, 16, 0.06),
        f'<rect x="70" y="400" width="200" height="14" rx="4" fill="{DESK}"/>'
        f'<rect x="80" y="414" width="14" height="200" fill="{DESK}"/>'
        f'<rect x="246" y="414" width="14" height="200" fill="{DESK}"/>',
        f'<rect x="120" y="300" width="120" height="90" rx="8" fill="{MONITOR}"/>'
        f'<rect x="126" y="306" width="108" height="72" rx="4" fill="{SCREEN}"/>'
        f'<rect x="166" y="390" width="20" height="10" fill="{MONITOR}"/>',
        stand_body(hair="bun", mouth="smile", hair_fill=HAIR, pain=False, hold_phone=True),
    ])


def _bed() -> list[str]:
    return [
        f'<rect x="90" y="430" width="420" height="26" rx="8" fill="{DESK}"/>',
        f'<rect x="100" y="456" width="400" height="92" rx="12" fill="#d9cbb8"/>',
        f'<rect x="90" y="360" width="22" height="110" rx="4" fill="{DESK}"/>',
    ]


def fig_morning_edge() -> str:
    return svg([
        shadow(300, 640, 190, 12),
        *_bed(),
        sit_body(hair="pony", mouth="grimace", hair_fill=HAIR, pain=True),
    ])


def fig_morning_ok() -> str:
    return svg([
        shadow(300, 640, 190, 12),
        *_bed(),
        sit_body(hair="pony", mouth="smile", hair_fill=HAIR, pain=False),
    ])


def fig_stiff_wake() -> str:
    return svg([
        shadow(300, 640, 200, 12),
        *_bed(),
        sit_body(hair="long", mouth="grimace", hair_fill=HAIR, pain=True),
    ])


def fig_bed_scroll() -> str:
    return svg([
        shadow(300, 640, 200, 12),
        *_bed(),
        sit_body(hair="long", mouth="flat", hair_fill=HAIR, pain=True),
        phone(248, 400, 56, 98),
    ])


def fig_tying_shoes() -> str:
    return svg([
        shadow(300, 640, 90, 11),
        f'<ellipse cx="268" cy="628" rx="26" ry="11" fill="{SHOES}"/>'
        f'<rect x="254" y="602" width="28" height="26" rx="8" fill="{SHOES}"/>'
        f'<path d="M256 610 Q268 604 280 610" stroke="#c4b4a0" stroke-width="2" fill="none"/>',
        f'<path d="M285 480 C280 530 272 575 268 618" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>'
        f'<path d="M318 480 C330 530 348 575 352 622" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="354" cy="628" rx="24" ry="10" fill="{SHOES}"/>',
        f'<path d="M270 340 C255 390 250 440 268 500 L332 500 C348 440 350 390 330 340 Z" fill="{SHIRT}"/>',
        face(300, 268, "short", "grimace"),
        f'<path d="M275 370 C250 430 245 500 258 555" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>'
        f'<path d="M325 370 C345 430 350 500 338 560" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="258" cy="558" rx="9" ry="7" fill="{SKIN}"/>'
        f'<ellipse cx="338" cy="562" rx="9" ry="7" fill="{SKIN}"/>',
        glow(292, 420),
    ])


def fig_floor_reach() -> str:
    return svg([
        shadow(280, 640, 130, 12),
        f'<rect x="150" y="610" width="20" height="9" rx="2" fill="#c9a227"/>'
        f'<circle cx="146" cy="614" r="5" fill="#c9a227"/>',
        f'<path d="M300 260 C270 320 230 400 200 490 L260 500 C300 410 340 330 350 260 Z" fill="{SHIRT}"/>',
        face(330, 228, "side", "grimace", HAIR_WARM),
        f'<path d="M270 330 C230 400 190 480 175 545" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>'
        f'<ellipse cx="174" cy="548" rx="10" ry="8" fill="{SKIN}"/>',
        f'<path d="M335 310 C360 360 375 410 368 450" stroke="{SKIN}" stroke-width="13" fill="none" stroke-linecap="round"/>',
        glow(268, 370),
        f'<path d="M210 490 C200 545 215 590 235 620" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>'
        f'<path d="M258 498 C300 545 340 590 355 622" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="238" cy="626" rx="14" ry="8" fill="{SHOES}"/>'
        f'<ellipse cx="358" cy="628" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def _car(smile: bool, hair: str, hair_fill: str, pain: bool) -> str:
    return svg([
        shadow(310, 640, 170, 12),
        f'<rect x="210" y="300" width="26" height="250" rx="10" fill="#6b5b53"/>'
        f'<rect x="210" y="504" width="200" height="26" rx="8" fill="#6b5b53"/>'
        f'<rect x="392" y="432" width="16" height="88" rx="6" fill="#4a4038"/>'
        f'<circle cx="428" cy="428" r="40" fill="#2d3436"/>'
        f'<circle cx="428" cy="428" r="24" fill="#636e72"/>'
        f'<circle cx="428" cy="428" r="8" fill="#2d3436"/>',
        f'<path d="M395 430 C385 380 370 370 365 340 C362 340 358 342 355 344 L348 430 C350 440 370 450 395 445 Z" fill="{SHIRT}"/>'
        f'<path d="M355 344 C360 370 365 400 362 430 L348 430 C350 380 352 360 355 344 Z" fill="{SHIRT_DARK}" opacity="0.4"/>',
        face(368, 272, hair, "smile" if smile else "grimace", hair_fill),
        f'<path d="M390 360 C410 390 424 415 420 430" fill="{SKIN}" stroke="#e8b796" stroke-width="1"/>'
        f'<ellipse cx="420" cy="432" rx="10" ry="8" fill="{SKIN}"/>',
        f'<path d="M355 370 C340 380 320 385 310 382" fill="{SKIN}" stroke="#e8b796" stroke-width="1"/>'
        f'<ellipse cx="310" cy="382" rx="9" ry="7" fill="{SKIN}"/>',
        glow(412, 442) if pain else "",
        f'<path d="M375 445 C370 480 365 530 370 580 L384 580 C386 530 388 480 390 445 Z" fill="{PANTS}"/>'
        f'<path d="M390 445 C395 480 400 530 395 580 L410 580 C412 530 408 480 400 445 Z" fill="{PANTS}"/>'
        f'<ellipse cx="377" cy="585" rx="14" ry="8" fill="{SHOES}"/>'
        f'<ellipse cx="402" cy="585" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def fig_car_commute() -> str:
    return _car(False, "short", HAIR, True)


def fig_drive_ok() -> str:
    return _car(True, "bun", HAIR, False)


def fig_couch_slump() -> str:
    return svg([
        shadow(300, 640, 200, 12),
        f'<rect x="80" y="430" width="440" height="118" rx="22" fill="{DESK}"/>'
        f'<rect x="100" y="402" width="88" height="68" rx="16" fill="#c4b4a0"/>'
        f'<rect x="412" y="402" width="88" height="68" rx="16" fill="#c4b4a0"/>',
        sit_body(hair="bun", mouth="grimace", hair_fill=HAIR, pain=True),
    ])


def fig_movie_sit() -> str:
    return svg([
        shadow(300, 640, 160, 12),
        f'<rect x="160" y="360" width="22" height="140" rx="8" fill="#6b5b53"/>'
        f'<rect x="418" y="360" width="22" height="140" rx="8" fill="#6b5b53"/>'
        f'<rect x="160" y="448" width="280" height="48" rx="12" fill="{DESK}"/>',
        sit_body(hair="side", mouth="grimace", hair_fill=HAIR_GRAY, pain=True),
    ])


def fig_kitchen_stiff() -> str:
    return svg([
        shadow(300, 640, 140, 12),
        f'<rect x="80" y="380" width="200" height="14" rx="4" fill="{DESK}"/>'
        f'<rect x="90" y="394" width="14" height="220" fill="{DESK}"/>'
        f'<rect x="256" y="394" width="14" height="220" fill="{DESK}"/>'
        f'<ellipse cx="168" cy="368" rx="14" ry="10" fill="#6b5344"/>'
        f'<rect x="160" y="348" width="16" height="22" rx="3" fill="#6b5344"/>',
        stand_body(hair="pony", mouth="grimace", hair_fill=HAIR, pain=True, hold_phone=False),
    ])


def fig_explaining() -> str:
    return svg([
        stand_body(hair="short", mouth="grimace", hair_fill=HAIR, pain=True, hold_phone=False, wave=True),
    ])


def fig_standing_tall() -> str:
    return svg([
        stand_body(hair="short", mouth="smile", hair_fill=HAIR, pain=False, hold_phone=False),
    ])


def fig_easy_walk() -> str:
    return svg([
        stand_body(hair="pony", mouth="smile", hair_fill=HAIR, pain=False, hold_phone=False, stride=True),
    ])


def fig_coffee_walk() -> str:
    mug = (
        f'<ellipse cx="248" cy="418" rx="13" ry="9" fill="#6b5344"/>'
        f'<rect x="240" y="398" width="16" height="22" rx="3" fill="#6b5344"/>'
    )
    return svg([
        stand_body(hair="bun", mouth="smile", hair_fill=HAIR, pain=False, hold_phone=False, stride=True),
        mug,
    ])


def fig_progress_phone() -> str:
    return svg([
        stand_body(hair="short", mouth="smile", hair_fill=HAIR, pain=False, hold_phone=True),
    ])


def fig_commute_ok() -> str:
    bag = (
        f'<rect x="338" y="430" width="48" height="64" rx="8" fill="#6b5344"/>'
        f'<rect x="350" y="418" width="24" height="14" rx="4" fill="#5a4638"/>'
    )
    return svg([
        stand_body(hair="side", mouth="smile", hair_fill=HAIR_WARM, pain=False, hold_phone=False),
        bag,
    ])


def fig_session_ready() -> str:
    return svg([
        shadow(300, 640, 120, 12),
        f'<rect x="160" y="568" width="280" height="16" rx="8" fill="#c4b4a0" opacity="0.55"/>',
        stand_body(hair="long", mouth="smile", hair_fill=HAIR, pain=False, hold_phone=True),
    ])


def fig_shoes_easy() -> str:
    return svg([
        stand_body(hair="short", mouth="smile", hair_fill=HAIR_GRAY, pain=False, hold_phone=False),
    ])


def fig_after_walk() -> str:
    return svg([
        stand_body(hair="buzz", mouth="smile", hair_fill=HAIR_WARM, pain=False, hold_phone=False),
    ])


def fig_keys_ok() -> str:
    keys = (
        f'<rect x="238" y="424" width="16" height="7" rx="2" fill="#c9a227"/>'
        f'<circle cx="234" cy="427" r="5" fill="#c9a227"/>'
    )
    return svg([
        stand_body(hair="pony", mouth="smile", hair_fill=HAIR, pain=False, hold_phone=False),
        keys,
    ])


# ---------------------------------------------------------------------------
# Round 3 — simple funny-wonky action (tying-shoes / floor-reach energy)
# ---------------------------------------------------------------------------

def fig_sock_hop() -> str:
    return svg([
        shadow(300, 640, 80, 11),
        f'<ellipse cx="268" cy="628" rx="16" ry="8" fill="{SHOES}"/>',
        f'<path d="M278 470 C270 520 262 575 266 620" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<path d="M322 470 C360 500 390 530 400 555" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="408" cy="560" rx="18" ry="10" fill="#d9cbb8"/>',
        f'<path d="M268 330 C250 390 248 440 270 490 L332 488 C350 430 348 380 328 330 Z" fill="{SHIRT}"/>',
        face(298, 298, "short", "grimace"),
        f'<path d="M275 370 C250 420 255 480 280 530" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<path d="M328 365 C360 420 385 490 398 540" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="280" cy="534" rx="9" ry="7" fill="{SKIN}"/>',
        f'<ellipse cx="400" cy="544" rx="9" ry="7" fill="{SKIN}"/>',
        glow(290, 430),
    ])


def fig_dropped_pen() -> str:
    return svg([
        shadow(280, 640, 140, 12),
        f'<rect x="80" y="360" width="220" height="14" rx="4" fill="{DESK}"/>',
        f'<rect x="90" y="374" width="14" height="230" fill="{DESK}"/>',
        f'<rect x="276" y="374" width="14" height="230" fill="{DESK}"/>',
        f'<rect x="118" y="598" width="28" height="6" rx="2" fill="#1c1c1e"/>',
        f'<path d="M340 250 C300 320 250 400 220 490 L280 502 C320 410 365 330 375 250 Z" fill="{SHIRT}"/>',
        face(358, 218, "side", "grimace", HAIR_WARM),
        f'<path d="M300 320 C250 390 190 480 160 555" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="158" cy="558" rx="10" ry="8" fill="{SKIN}"/>',
        f'<path d="M360 310 C385 360 395 410 388 450" stroke="{SKIN}" stroke-width="13" fill="none" stroke-linecap="round"/>',
        glow(280, 380),
        f'<path d="M230 490 C215 545 225 590 248 622" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<path d="M278 498 C320 545 355 590 368 622" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="250" cy="628" rx="14" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="370" cy="628" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def fig_couch_launch() -> str:
    return svg([
        shadow(300, 640, 180, 12),
        f'<rect x="280" y="430" width="250" height="110" rx="20" fill="{DESK}"/>',
        f'<rect x="430" y="400" width="80" height="70" rx="14" fill="#c4b4a0"/>',
        f'<path d="M230 280 C200 340 190 410 220 470 L300 460 C320 390 330 330 300 275 Z" fill="{SHIRT}"/>',
        face(255, 248, "bun", "grimace"),
        f'<path d="M220 340 C180 380 155 430 165 470" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="164" cy="474" rx="10" ry="8" fill="{SKIN}"/>',
        f'<path d="M290 340 C330 380 360 420 350 450" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        glow(240, 400),
        f'<path d="M225 468 C200 530 190 580 205 620" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<path d="M290 458 C340 500 390 540 410 575" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="208" cy="626" rx="14" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="414" cy="580" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def fig_high_shelf() -> str:
    return svg([
        shadow(300, 640, 70, 10, 0.08),
        f'<rect x="120" y="140" width="180" height="16" rx="4" fill="{DESK}"/>',
        f'<rect x="200" y="118" width="36" height="22" rx="4" fill="#c4b4a0"/>',
        f'<path d="M268 300 C258 360 262 420 278 480 L328 478 C342 420 344 360 330 300 Z" fill="{SHIRT}"/>',
        face(300, 248, "pony", "grimace"),
        f'<path d="M275 330 C250 280 230 210 220 165" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="218" cy="160" rx="10" ry="8" fill="{SKIN}"/>',
        f'<path d="M328 340 C350 380 355 420 348 450" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        glow(292, 420),
        f'<path d="M278 478 C274 530 270 580 268 622" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<path d="M324 476 C330 530 338 580 342 622" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="268" cy="628" rx="13" ry="7" fill="{SHOES}"/>',
        f'<ellipse cx="344" cy="628" rx="13" ry="7" fill="{SHOES}"/>',
    ])


def fig_sneeze() -> str:
    return svg([
        shadow(300, 640, 70, 10, 0.08),
        f'<path d="M255 360 C240 410 248 455 275 490 L330 488 C350 440 348 390 328 350 Z" fill="{SHIRT}"/>',
        face(318, 318, "short", "grimace", HAIR_GRAY),
        f'<path d="M270 380 C250 360 240 340 248 325" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<path d="M325 375 C345 355 355 340 348 322" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="248" cy="322" rx="9" ry="7" fill="{SKIN}"/>',
        f'<ellipse cx="348" cy="318" rx="9" ry="7" fill="{SKIN}"/>',
        glow(268, 430),
        f'<path d="M278 488 C274 535 270 580 274 622" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<path d="M324 486 C332 535 340 580 336 622" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="274" cy="628" rx="14" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="338" cy="628" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def fig_chair_twist() -> str:
    return svg([
        shadow(320, 640, 120, 12),
        f'<path d="M380 600 Q395 590 410 600 L410 620 L380 620 Z" fill="{CHAIR}"/>',
        f'<rect x="388" y="460" width="14" height="140" rx="4" fill="{CHAIR_POST}"/>',
        f'<path d="M374 440 C380 415 414 415 420 440 L422 465 L372 465 Z" fill="{CHAIR}"/>',
        f'<path d="M330 300 C360 350 390 400 400 445 L350 455 C330 400 300 350 290 310 Z" fill="{SHIRT}"/>',
        face(300, 268, "side", "grimace"),
        f'<path d="M340 340 C380 360 430 375 455 368" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="458" cy="366" rx="10" ry="8" fill="{SKIN}"/>',
        f'<path d="M310 350 C280 380 270 410 278 435" stroke="{SKIN}" stroke-width="13" fill="none" stroke-linecap="round"/>',
        glow(370, 400),
        f'<path d="M355 450 C350 500 348 545 354 590" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<path d="M395 448 C410 500 418 545 412 590" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="356" cy="598" rx="14" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="414" cy="598" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def fig_seatbelt() -> str:
    return svg([
        shadow(310, 640, 150, 12),
        f'<rect x="200" y="300" width="24" height="250" rx="10" fill="#6b5b53"/>',
        f'<rect x="200" y="504" width="190" height="24" rx="8" fill="#6b5b53"/>',
        f'<path d="M430 250 L418 510" stroke="#c0392b" stroke-width="8" fill="none" stroke-linecap="round" opacity="0.7"/>',
        f'<rect x="408" y="238" width="28" height="18" rx="4" fill="#8d7b68"/>',
        f'<path d="M300 270 C270 330 265 400 285 500 L345 500 C360 400 358 330 340 270 Z" fill="{SHIRT}"/>',
        face(318, 238, "short", "grimace", HAIR_WARM),
        f'<path d="M335 320 C380 360 410 400 422 430" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="424" cy="432" rx="10" ry="8" fill="{SKIN}"/>',
        f'<path d="M290 330 C260 360 250 400 258 430" stroke="{SKIN}" stroke-width="13" fill="none" stroke-linecap="round"/>',
        glow(300, 400),
        f'<path d="M288 498 C282 540 280 575 284 612" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<path d="M340 498 C358 540 370 575 366 612" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="286" cy="618" rx="14" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="368" cy="618" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def fig_laundry_bend() -> str:
    return svg([
        shadow(300, 640, 110, 12),
        f'<rect x="210" y="560" width="90" height="50" rx="10" fill="#c4b4a0"/>',
        f'<rect x="218" y="548" width="74" height="16" rx="6" fill="#8d7b68"/>',
        f'<path d="M270 250 C250 320 240 400 255 490 L325 492 C345 400 348 320 330 250 Z" fill="{SHIRT}"/>',
        face(300, 218, "bun", "grimace"),
        f'<path d="M275 340 C245 410 235 490 248 540" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<path d="M325 340 C350 410 358 490 340 545" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="248" cy="544" rx="9" ry="7" fill="{SKIN}"/>',
        f'<ellipse cx="340" cy="548" rx="9" ry="7" fill="{SKIN}"/>',
        glow(280, 400),
        f'<path d="M260 490 C248 535 245 575 252 612" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<path d="M320 490 C340 535 352 575 348 612" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="254" cy="618" rx="14" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="350" cy="618" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def fig_grocery_lean() -> str:
    return svg([
        shadow(310, 640, 100, 11),
        f'<rect x="200" y="455" width="42" height="55" rx="6" fill="#8d7b68"/>',
        f'<rect x="360" y="470" width="42" height="50" rx="6" fill="#6b5344"/>',
        f'<path d="M250 300 C230 360 235 420 260 475 L325 455 C345 400 348 350 328 300 Z" fill="{SHIRT}"/>',
        face(288, 268, "pony", "grimace"),
        f'<path d="M255 360 C220 400 205 440 210 470" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<path d="M325 350 C355 400 375 445 380 478" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        glow(268, 410),
        f'<path d="M262 472 C250 525 242 575 248 620" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<path d="M318 454 C345 510 365 565 358 620" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="250" cy="626" rx="14" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="360" cy="626" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def fig_penguin_steps() -> str:
    return svg([
        shadow(300, 640, 90, 11),
        f'<path d="M255 330 C240 390 250 440 275 490 L330 490 C350 440 348 390 328 330 Z" fill="{SHIRT}"/>',
        face(292, 298, "short", "grimace", HAIR_GRAY),
        f'<path d="M260 370 C220 390 195 410 200 430" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<path d="M325 370 C365 390 390 410 388 430" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        glow(288, 430),
        f'<path d="M270 488 C240 540 220 585 230 622" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<path d="M330 488 C360 540 380 585 370 622" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="232" cy="628" rx="16" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="372" cy="628" rx="16" ry="8" fill="{SHOES}"/>',
    ])


def fig_jacket_stuck() -> str:
    return svg([
        shadow(300, 640, 70, 10, 0.08),
        f'<path d="M250 340 C255 400 265 450 280 490 L325 488 C335 440 332 390 318 340 Z" fill="{SHIRT}"/>',
        f'<path d="M318 340 C360 360 400 400 410 450 L390 460 C375 415 345 375 318 360 Z" fill="#6b5344"/>',
        face(284, 308, "side", "grimace", HAIR_WARM),
        f'<path d="M255 370 C230 400 220 440 228 470" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<path d="M330 360 C370 390 400 430 405 455" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        glow(270, 430),
        f'<path d="M282 488 C278 535 274 580 278 622" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<path d="M322 486 C328 535 334 580 330 622" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="278" cy="628" rx="14" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="332" cy="628" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def fig_alarm_slap() -> str:
    return svg([
        shadow(300, 640, 190, 12),
        f'<rect x="90" y="450" width="420" height="26" rx="8" fill="{DESK}"/>',
        f'<rect x="100" y="476" width="400" height="80" rx="12" fill="#d9cbb8"/>',
        f'<rect x="90" y="380" width="22" height="100" rx="4" fill="{DESK}"/>',
        f'<rect x="430" y="400" width="36" height="28" rx="6" fill="#2d3436"/>',
        f'<circle cx="448" cy="414" r="6" fill="#74b9ff" opacity="0.6"/>',
        f'<path d="M220 300 C200 360 210 430 250 460 L340 450 C360 390 355 330 330 295 Z" fill="{SHIRT}"/>',
        face(250, 268, "long", "grimace"),
        f'<path d="M320 340 C380 360 420 380 440 398" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="442" cy="400" rx="10" ry="8" fill="{SKIN}"/>',
        f'<path d="M230 350 C200 390 190 430 200 450" stroke="{SKIN}" stroke-width="13" fill="none" stroke-linecap="round"/>',
        glow(260, 400),
        f'<path d="M255 458 C270 520 320 555 380 560" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="384" cy="564" rx="16" ry="8" fill="{SHOES}"/>',
    ])


def fig_sit_hover() -> str:
    return svg([
        shadow(320, 640, 110, 12),
        f'<path d="M380 600 Q395 590 410 600 L410 620 L380 620 Z" fill="{CHAIR}"/>',
        f'<rect x="388" y="470" width="14" height="130" rx="4" fill="{CHAIR_POST}"/>',
        f'<path d="M374 450 C380 425 414 425 420 450 L422 475 L372 475 Z" fill="{CHAIR}"/>',
        f'<path d="M250 280 C235 340 240 400 260 450 L320 448 C335 390 338 340 320 280 Z" fill="{SHIRT}"/>',
        face(284, 248, "short", "grimace"),
        f'<path d="M250 340 C215 370 195 400 200 425" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<path d="M318 338 C355 370 375 400 370 425" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        glow(268, 400),
        f'<path d="M262 448 C255 500 250 545 258 575" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<path d="M316 446 C340 490 360 530 355 570" stroke="{PANTS}" stroke-width="26" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="260" cy="580" rx="14" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="358" cy="576" rx="14" ry="8" fill="{SHOES}"/>',
    ])


def fig_over_shoulder() -> str:
    return svg([
        shadow(300, 640, 70, 10, 0.08),
        f'<path d="M290 330 C310 390 325 440 318 490 L268 492 C250 440 248 390 262 330 Z" fill="{SHIRT}"/>',
        face(330, 298, "buzz", "grimace", HAIR_WARM),
        f'<path d="M300 370 C340 390 375 410 385 430" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        f'<path d="M270 375 C240 400 230 430 238 455" stroke="{SKIN}" stroke-width="14" fill="none" stroke-linecap="round"/>',
        glow(280, 430),
        f'<path d="M275 490 C270 535 268 580 274 622" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<path d="M312 488 C322 535 330 580 326 622" stroke="{PANTS}" stroke-width="28" fill="none" stroke-linecap="round"/>',
        f'<ellipse cx="274" cy="628" rx="14" ry="8" fill="{SHOES}"/>',
        f'<ellipse cx="328" cy="628" rx="14" ry="8" fill="{SHOES}"/>',
    ])


FIGURES: list[dict] = [
    {"id": "laptop-slouch", "name": "Laptop slouch", "description": "Hunched at a laptop — desk-worker cousin for 'your chair is the problem'.", "themes": ["office", "pain"], "draw": fig_laptop_slouch},
    {"id": "rising-chair", "name": "Getting up from the chair", "description": "Standing up from the office chair, hand on the lower back.", "themes": ["office", "pain"], "draw": fig_rising_chair},
    {"id": "video-call", "name": "Video-call slump", "description": "Slumped on a call — remote-worker identity hook.", "themes": ["office", "pain"], "draw": fig_video_call},
    {"id": "late-night-desk", "name": "Late night desk", "description": "Tired at the glowing screen after hours.", "themes": ["office", "pain"], "draw": fig_late_night},
    {"id": "morning-edge", "name": "Morning on the bed", "description": "Sitting on the edge of the bed, stiff, hand on the back.", "themes": ["pain", "lifestyle"], "draw": fig_morning_edge},
    {"id": "stiff-wake", "name": "Stiff wake-up", "description": "Sitting up in bed — the morning that hurts.", "themes": ["pain", "lifestyle"], "draw": fig_stiff_wake},
    {"id": "tying-shoes", "name": "Tying shoes", "description": "Bent to tie a shoe, back glowing. Relatable moment — not a stretch diagram.", "themes": ["pain", "lifestyle"], "draw": fig_tying_shoes},
    {"id": "floor-reach", "name": "Reaching for keys", "description": "Reaching for keys on the floor. Story beat, not a form check.", "themes": ["pain", "lifestyle"], "draw": fig_floor_reach},
    {"id": "car-commute", "name": "Car commute", "description": "Driving, lower back glowing — pain after the commute.", "themes": ["pain", "lifestyle"], "draw": fig_car_commute},
    {"id": "couch-slump", "name": "Couch slump", "description": "Person slumped on the couch with a back glow. Not an empty room.", "themes": ["pain", "lifestyle"], "draw": fig_couch_slump},
    {"id": "kitchen-stiff", "name": "Stiff in the kitchen", "description": "Standing at the counter with a mug, hand on the back.", "themes": ["pain", "lifestyle"], "draw": fig_kitchen_stiff},
    {"id": "explaining", "name": "Explaining the pain", "description": "Standing, gesturing — 'me explaining my back to people who sit fine'.", "themes": ["pain", "lifestyle"], "draw": fig_explaining},
    {"id": "bed-scroll", "name": "Scrolling in bed", "description": "Propped in bed looking at the phone, back glowing.", "themes": ["pain", "lifestyle"], "draw": fig_bed_scroll},
    {"id": "movie-sit", "name": "Sitting through it", "description": "Parked in a seat, slouched, back glowing.", "themes": ["pain", "lifestyle"], "draw": fig_movie_sit},
    {"id": "standing-tall", "name": "Standing tall", "description": "Upright, slight smile — the after.", "themes": ["recovery", "lifestyle"], "draw": fig_standing_tall},
    {"id": "easy-walk", "name": "Easy walk", "description": "Walking comfortably. Movement, not a gym scene.", "themes": ["recovery", "lifestyle"], "draw": fig_easy_walk},
    {"id": "coffee-walk", "name": "Coffee walk", "description": "Walking with a mug — morning that doesn't hurt.", "themes": ["recovery", "lifestyle"], "draw": fig_coffee_walk},
    {"id": "follow-app", "name": "Following the app", "description": "Seated, looking at Remedy on the phone — starting the session.", "themes": ["recovery", "lifestyle"], "draw": fig_follow_app},
    {"id": "morning-ok", "name": "Morning that is fine", "description": "On the bed edge, upright, slight smile. Pair with morning-edge.", "themes": ["recovery", "lifestyle"], "draw": fig_morning_ok},
    {"id": "progress-phone", "name": "Progress on the phone", "description": "Standing tall showing Remedy. Cousin of phone + app.", "themes": ["recovery", "lifestyle"], "draw": fig_progress_phone},
    {"id": "commute-ok", "name": "Commute, fine", "description": "Standing with a bag, good posture.", "themes": ["recovery", "lifestyle"], "draw": fig_commute_ok},
    {"id": "desk-break", "name": "Desk + phone break", "description": "Standing beside the desk with Remedy open. Good posture.", "themes": ["office", "recovery"], "draw": fig_desk_break},
    {"id": "session-ready", "name": "Session ready", "description": "On a mat looking at the phone. Starting a session — not an exercise pose.", "themes": ["recovery", "lifestyle"], "draw": fig_session_ready},
    {"id": "shoes-easy", "name": "Shoes on, fine", "description": "Standing after shoes — pair with tying-shoes.", "themes": ["recovery", "lifestyle"], "draw": fig_shoes_easy},
    {"id": "after-walk", "name": "After a walk", "description": "Standing easy, no glow.", "themes": ["recovery", "lifestyle"], "draw": fig_after_walk},
    {"id": "drive-ok", "name": "Drive, fine", "description": "Driving upright, no glow. Pair with car-commute.", "themes": ["recovery", "lifestyle"], "draw": fig_drive_ok},
    {"id": "keys-ok", "name": "Picked up the keys", "description": "Standing, keys in hand. Pair with floor-reach.", "themes": ["recovery", "lifestyle"], "draw": fig_keys_ok},
    {"id": "sock-hop", "name": "Putting on a sock", "description": "One-foot hop to get a sock on. Funny-wonky everyday stretch.", "themes": ["pain", "lifestyle"], "draw": fig_sock_hop},
    {"id": "dropped-pen", "name": "Dropped pen", "description": "Reaching under the desk for a pen. Cousin of reaching for keys.", "themes": ["office", "pain"], "draw": fig_dropped_pen},
    {"id": "couch-launch", "name": "Getting off the couch", "description": "The long lean to stand up. Funny, not a form check.", "themes": ["pain", "lifestyle"], "draw": fig_couch_launch},
    {"id": "high-shelf", "name": "Top shelf", "description": "On tiptoes for the top shelf. Everyday reach-stretch.", "themes": ["pain", "lifestyle"], "draw": fig_high_shelf},
    {"id": "sneeze", "name": "The sneeze", "description": "Mid-sneeze, back glowing. Relatable and a little funny.", "themes": ["pain", "lifestyle"], "draw": fig_sneeze},
    {"id": "chair-twist", "name": "Chair twist", "description": "Twisted in the chair to grab something behind. Desk stretch moment.", "themes": ["office", "pain"], "draw": fig_chair_twist},
    {"id": "seatbelt", "name": "Seatbelt reach", "description": "Twisting for the seatbelt. Commute struggle.", "themes": ["pain", "lifestyle"], "draw": fig_seatbelt},
    {"id": "laundry-bend", "name": "Laundry basket", "description": "Bent over a basket. Same energy as tying shoes.", "themes": ["pain", "lifestyle"], "draw": fig_laundry_bend},
    {"id": "grocery-lean", "name": "Grocery bags", "description": "Listing sideways with two bags.", "themes": ["pain", "lifestyle"], "draw": fig_grocery_lean},
    {"id": "penguin-steps", "name": "Penguin walk", "description": "First stiff steps of the morning. Arms out for balance.", "themes": ["pain", "lifestyle"], "draw": fig_penguin_steps},
    {"id": "jacket-stuck", "name": "Jacket stuck", "description": "One arm in, twisted to find the other sleeve.", "themes": ["pain", "lifestyle"], "draw": fig_jacket_stuck},
    {"id": "alarm-slap", "name": "Hitting the alarm", "description": "Reaching from the bed to slap the clock.", "themes": ["pain", "lifestyle"], "draw": fig_alarm_slap},
    {"id": "sit-hover", "name": "Hovering over the chair", "description": "Afraid to sit down. Funny mid-air pause.", "themes": ["office", "pain"], "draw": fig_sit_hover},
    {"id": "over-shoulder", "name": "Look back", "description": "Twisted to look over the shoulder. Everyday stretch, not a pose chart.", "themes": ["pain", "lifestyle"], "draw": fig_over_shoulder},
]


PROTECTED = {"desk-worker.svg", "phone-app.svg", "spine.svg", "back-pain-sitting.svg", "back-pain-laying.svg"}


# Only emit these on this run so keepers (tying-shoes, desk-worker, etc.) stay put.
WRITE_ONLY = {
    "sock-hop", "dropped-pen", "couch-launch", "high-shelf", "sneeze",
    "chair-twist", "seatbelt", "laundry-bend", "grocery-lean", "penguin-steps",
    "jacket-stuck", "alarm-slap", "sit-hover", "over-shoulder",
}


def write_svgs() -> list[dict]:
    CUSTOM.mkdir(parents=True, exist_ok=True)
    written = []
    for fig in FIGURES:
        if WRITE_ONLY and fig["id"] not in WRITE_ONLY:
            continue
        name = f"{fig['id']}.svg"
        if name in PROTECTED:
            raise SystemExit(f"Refusing to overwrite protected file {name}")
        path = CUSTOM / name
        path.write_text(fig["draw"](), encoding="utf-8")
        written.append(fig)
        print(f"wrote {path.relative_to(ROOT)}")
    return written


def upsert_manifest(written: list[dict]) -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    by_id = {row["id"]: i for i, row in enumerate(data["illustrations"])}
    for fig in written:
        entry = {
            "id": fig["id"],
            "file": f"custom/{fig['id']}.svg",
            "name": fig["name"],
            "description": fig["description"],
            "source": "Remedy original",
            "license": "owned",
            "themes": fig["themes"],
            "enabled": True,
        }
        if fig["id"] in by_id:
            data["illustrations"][by_id[fig["id"]]] = entry
        else:
            data["illustrations"].append(entry)
    data["$comment"] = (
        "Vendored + Remedy-original illustration library for slides 1-3. "
        "See CURATION.md. Prefer Remedy originals (custom/*.svg, license owned). "
        "Rejected gym/interior/object tiles stay disabled."
    )
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"manifest now has {len(data['illustrations'])} entries")


if __name__ == "__main__":
    rows = write_svgs()
    upsert_manifest(rows)
