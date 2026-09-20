"""
Wrap Remedy-flat scene art as SVG.

Source art lives in flat/src/. This embeds it so Sharp / the SVGs tab
render the actual picture — do not replace with a geometric redraw.
"""

from __future__ import annotations

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FLAT = ROOT / "assets" / "illustrations" / "flat"
SRC = FLAT / "src"
MANIFEST = ROOT / "assets" / "illustrations" / "manifest.json"

ENTRIES = [
    {"id": "flat-trigger-standing", "stem": "trigger-standing", "name": "Kitchen stand", "description": "Standing at a mustard kitchen counter with a mug.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-goal-exercise", "stem": "goal-exercise", "name": "Tying sneakers", "description": "Kneeling to lace mustard sneakers before a session.", "themes": ["recovery", "lifestyle"]},
    {"id": "flat-goal-sleep", "stem": "goal-sleep", "name": "Asleep", "description": "Tucked under a sage blanket beside a glowing lamp.", "themes": ["lifestyle", "recovery"]},
    {"id": "flat-desk-slouch", "stem": "desk-slouch", "name": "Desk slouch", "description": "Hunched at a laptop, one hand on the lower back.", "themes": ["office", "pain"]},
    {"id": "flat-couch-laptop", "stem": "couch-laptop", "name": "Couch laptop", "description": "Working from the sofa with a laptop on the knees.", "themes": ["office", "lifestyle"]},
    {"id": "flat-high-shelf", "stem": "high-shelf", "name": "High shelf", "description": "Reaching up to a kitchen shelf.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-car-commute", "stem": "car-commute", "name": "Car commute", "description": "Sitting in the car, hands on the wheel.", "themes": ["office", "pain"]},
    {"id": "flat-coffee-walk", "stem": "coffee-walk", "name": "Coffee walk", "description": "An easy outdoor walk with a mug.", "themes": ["recovery", "lifestyle"]},
    {"id": "flat-laundry", "stem": "laundry", "name": "Laundry basket", "description": "Carrying a laundry basket through the house.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-after-walk", "stem": "after-walk", "name": "After a walk", "description": "Standing tall after a short walk, feeling looser.", "themes": ["recovery"]},
    {"id": "flat-phone-bed", "stem": "phone-bed", "name": "Phone in bed", "description": "Propped in bed looking at a phone.", "themes": ["lifestyle", "pain"]},
    {"id": "flat-floor-stretch", "stem": "floor-stretch", "name": "Floor stretch", "description": "Gentle stretch on the living-room rug.", "themes": ["recovery", "lifestyle"]},
    {"id": "flat-video-call", "stem": "video-call", "name": "Video call", "description": "Slouched on a video call at the desk.", "themes": ["office", "pain"]},
    {"id": "flat-phone-stand", "stem": "phone-stand", "name": "Phone stand", "description": "Standing in the hallway looking down at a phone.", "themes": ["lifestyle", "pain"]},
    {"id": "flat-chair-twist", "stem": "chair-twist", "name": "Chair twist", "description": "Twisted in an office chair looking back.", "themes": ["office", "pain"]},
    {"id": "flat-bag-floor", "stem": "bag-floor", "name": "Bag on the floor", "description": "Bending to pick up a tote in the entryway.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-backpack", "stem": "backpack", "name": "Backpack walk", "description": "Walking with a backpack on one shoulder.", "themes": ["lifestyle", "office"]},
    {"id": "flat-socks", "stem": "socks", "name": "Putting on socks", "description": "Sitting on the bed edge pulling on a sock.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-out-of-bed", "stem": "out-of-bed", "name": "Out of bed", "description": "Sitting up stiff on the edge of the bed.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-dishwasher", "stem": "dishwasher", "name": "Dishwasher", "description": "Loading a plate into the dishwasher.", "themes": ["lifestyle", "pain"]},
    {"id": "flat-fridge-reach", "stem": "fridge-reach", "name": "Fridge reach", "description": "Reaching into the fridge.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-jacket", "stem": "jacket", "name": "Jacket on", "description": "Putting on a jacket in the hallway.", "themes": ["lifestyle", "pain"]},
    {"id": "flat-tv-slouch", "stem": "tv-slouch", "name": "TV slouch", "description": "Sunk into the sofa watching TV.", "themes": ["lifestyle", "pain"]},
    {"id": "flat-stove-cook", "stem": "stove-cook", "name": "Cooking", "description": "Stirring a pot at the stove.", "themes": ["lifestyle"]},
    {"id": "flat-stairs", "stem": "stairs", "name": "Stairs", "description": "Walking up a flight of stairs.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-chair-rise", "stem": "chair-rise", "name": "Getting up", "description": "Pushing up from an armchair.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-dishes-up", "stem": "dishes-up", "name": "Dishes up", "description": "Putting a plate on a high kitchen shelf.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-fold-laundry", "stem": "fold-laundry", "name": "Folding laundry", "description": "Sitting on the bed folding clothes.", "themes": ["lifestyle"]},
    {"id": "flat-water-plant", "stem": "water-plant", "name": "Watering plant", "description": "Watering a tall houseplant.", "themes": ["lifestyle", "recovery"]},
    {"id": "flat-window-look", "stem": "window-look", "name": "Window look", "description": "Standing at a window looking out.", "themes": ["lifestyle", "recovery"]},
    {"id": "flat-doorway-stretch", "stem": "doorway-stretch", "name": "Doorway stretch", "description": "Hands on a doorway frame, easy reach.", "themes": ["recovery", "office"]},
    {"id": "flat-park-bench", "stem": "park-bench", "name": "Park bench", "description": "Sitting on a park bench under rounded trees.", "themes": ["lifestyle", "recovery"]},
    {"id": "flat-dog-walk", "stem": "dog-walk", "name": "Dog walk", "description": "An easy walk with a dog.", "themes": ["recovery", "lifestyle"]},
    {"id": "flat-floor-tea", "stem": "floor-tea", "name": "Tea on the floor", "description": "Cross-legged on a rug with a mug.", "themes": ["lifestyle", "recovery"]},
    {"id": "flat-suitcase", "stem": "suitcase", "name": "Suitcase", "description": "Kneeling to zip a suitcase.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-mail", "stem": "mail", "name": "Getting the mail", "description": "At the front door collecting mail.", "themes": ["lifestyle"]},
    {"id": "flat-cafe-sit", "stem": "cafe-sit", "name": "Cafe sit", "description": "Sitting at a cafe table with a cup.", "themes": ["lifestyle", "office"]},
    {"id": "flat-book-couch", "stem": "book-couch", "name": "Reading on the couch", "description": "Lying on the sofa with a book.", "themes": ["lifestyle", "recovery"]},
    {"id": "flat-front-steps", "stem": "front-steps", "name": "Front steps", "description": "Walking up the front steps home.", "themes": ["lifestyle", "recovery"]},
    {"id": "flat-pet-lean", "stem": "pet-lean", "name": "Pet the cat", "description": "Leaning from a chair to pet a cat.", "themes": ["lifestyle", "pain"]},
    {"id": "flat-grocery-counter", "stem": "grocery-counter", "name": "Groceries down", "description": "Setting grocery bags on the kitchen counter.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-bathroom-sink", "stem": "bathroom-sink", "name": "Bathroom sink", "description": "Standing at the bathroom sink.", "themes": ["lifestyle"]},
    {"id": "flat-umbrella-walk", "stem": "umbrella-walk", "name": "Umbrella walk", "description": "Walking under a mustard umbrella.", "themes": ["lifestyle", "recovery"]},
    {"id": "flat-bus-sit", "stem": "bus-sit", "name": "Bus sit", "description": "Sitting on a bus looking out the window.", "themes": ["office", "lifestyle"]},
    {"id": "flat-vacuum", "stem": "vacuum", "name": "Vacuuming", "description": "Vacuuming the living room.", "themes": ["pain", "lifestyle"]},
    {"id": "flat-garden-water", "stem": "garden-water", "name": "Garden", "description": "Watering plants outside.", "themes": ["lifestyle", "recovery"]},
    {"id": "flat-ottoman-feet", "stem": "ottoman-feet", "name": "Feet up", "description": "In an armchair with feet on an ottoman.", "themes": ["lifestyle", "recovery"]},
    {"id": "flat-packing-tote", "stem": "packing-tote", "name": "Packing a tote", "description": "Packing a tote bag on the bed.", "themes": ["lifestyle"]},
]


def find_src(stem: str) -> Path:
    for ext in (".jpg", ".jpeg", ".png", ".webp"):
        path = SRC / f"{stem}{ext}"
        if path.exists():
            return path
    raise FileNotFoundError(f"No source art for {stem} in {SRC}")


def mime_for(path: Path) -> str:
    return {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    }[path.suffix.lower()]


def wrap(src: Path, dest: Path) -> None:
    b64 = base64.b64encode(src.read_bytes()).decode("ascii")
    dest.write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        'viewBox="0 0 1024 1024">\n'
        f'  <image width="1024" height="1024" href="data:{mime_for(src)};base64,{b64}" '
        'preserveAspectRatio="xMidYMid slice"/>\n'
        "</svg>\n",
        encoding="utf-8",
    )
    print(f"wrapped {src.name} -> {dest.relative_to(ROOT)}")


def upsert_manifest() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    keep_ids = {entry["id"] for entry in ENTRIES}
    kept: list[dict] = []
    for row in data["illustrations"]:
        if row.get("source") == "Remedy flat" and row["id"] not in keep_ids:
            print(f"dropped {row['id']}")
            continue
        kept.append(row)
    data["illustrations"] = kept
    by_id = {row["id"]: i for i, row in enumerate(data["illustrations"])}
    for entry in ENTRIES:
        if not (SRC / f"{entry['stem']}.jpg").exists() and not (SRC / f"{entry['stem']}.png").exists():
            continue
        row = {
            "id": entry["id"],
            "file": f"flat/{entry['stem']}.svg",
            "name": entry["name"],
            "description": entry["description"],
            "source": "Remedy flat",
            "license": "owned",
            "themes": entry["themes"],
            "enabled": True,
        }
        if entry["id"] in by_id:
            data["illustrations"][by_id[entry["id"]]] = row
        else:
            data["illustrations"].append(row)
    MANIFEST.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"updated {MANIFEST.relative_to(ROOT)}")


def remove_orphans() -> None:
    keep_stems = {entry["stem"] for entry in ENTRIES}
    for path in list(FLAT.glob("*.svg")) + list(SRC.glob("*")):
        if path.name.startswith("_") or path.name == "src":
            continue
        if path.stem not in keep_stems:
            path.unlink()
            print(f"removed orphan {path.relative_to(ROOT)}")


if __name__ == "__main__":
    FLAT.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    remove_orphans()
    for entry in ENTRIES:
        try:
            src = find_src(entry["stem"])
        except FileNotFoundError:
            print(f"skip {entry['stem']} (no source yet)")
            continue
        wrap(src, FLAT / f"{entry['stem']}.svg")
    upsert_manifest()
