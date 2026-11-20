"""Held avatar squares for the pet launch. Run: python marketing/pet/build_avatars.py"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(os.path.dirname(__file__), "avatars")
GREEN, TAN = (62, 107, 78), (246, 237, 224)
VARIANTS = [
    ("happy-green", "s5_happy.png", GREEN),
    ("idle-green", "s4_idle.png", GREEN),
    ("ball-tan", "s1_idle.png", TAN),
    ("happy-tan", "s5_happy.png", TAN),
]
for name, src, bg in VARIANTS:
    pet = Image.open(os.path.join(ROOT, "assets", "pet", src)).convert("RGBA")
    canvas = Image.new("RGBA", (1080, 1080), bg + (255,))
    size = 880  # keeps the pet inside the circle crop most platforms apply
    pet = pet.resize((size, size), Image.LANCZOS)
    canvas.alpha_composite(pet, ((1080 - size) // 2, (1080 - size) // 2 + 40))
    path = os.path.join(OUT, f"avatar-{name}.png")
    canvas.convert("RGB").save(path)
    print("saved", path)
