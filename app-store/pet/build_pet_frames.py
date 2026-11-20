"""Pet-era App Store screenshot frames (HELD, not uploaded).

Reuses the CSS and layouts of ../frames.html (v3) so the look is the same set,
swaps in the pet-era screenshots from pet/img/, writes pet/frames-pet.html and
renders 1284 x 2778 PNGs into pet/export/.

    python app-store/pet/build_pet_frames.py

Nothing here touches app-store/export/ (the live set) or App Store Connect.
"""

from __future__ import annotations

import os
import re

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
SRC_HTML = os.path.join(HERE, "..", "frames.html")
OUT_HTML = os.path.join(HERE, "frames-pet.html")
OUT_DIR = os.path.join(HERE, "export")

# id, file, layout, bg, headline, subhead, screenshot, show icon, device size
FRAMES = [
    ("01-meet", "layout-hero", "green", "Meet the armadillo<br>who grows with you.",
     "Name him. Show up. Watch him uncurl.", "home_arnie_standing.png", True, "std"),
    ("02-program", "layout-straight", "cream", "A real program,<br>not a playlist.",
     "Short sessions, planned around you.", "session_preview_w2s3.png", True, "std"),
    ("03-session", "layout-zoomed", "cream", "Video-guided.<br>Every exercise.",
     "He coaches from the floor.", "exercise_glute_bridge.png", False, "lg"),
    ("04-schedule", "layout-tilt", "green", "Built around<br>your schedule.",
     "Pick your days. He keeps count.", "workout_days_sheet.png", False, "std"),
    ("05-checkin", "layout-asym", "cream", "Starts with<br>how you feel.",
     "Check in before and after every session.", "pain_check_before_5.png", False, "std"),
    ("06-grumpy", "layout-tilt-r", "cream", "Poke him too much<br>and he gets grumpy.",
     "Warm, cheeky, always on your side.", "home_angry.png", False, "std"),
    ("07-stages", "layout-card", "green", "Five stages.<br>One armadillo.",
     "He uncurls as you finish sessions.", "crop_progress_2.png", False, "card"),
    ("08-no-guilt", "layout-phone-left", "cream", "Miss a day?<br>He waits.",
     "No guilt. He only ever grows.", "home_reading.png", False, "std"),
]

EXTRA_CSS = """
  .layout-card .text-block {
    position: relative; z-index: 2; display: flex; flex-direction: column;
    align-items: center; text-align: center; padding-top: 90px;
  }
  .layout-card .headline { margin-bottom: 18px; max-width: 1050px; }
  .layout-card .subhead  { max-width: 800px; }
  .layout-card .card {
    position: absolute; left: 50%; transform: translateX(-50%);
    bottom: 520px; width: 1120px; border-radius: 56px; overflow: hidden;
    box-shadow: 0 10px 28px rgba(0,0,0,0.18), 0 40px 90px rgba(0,0,0,0.28);
  }
  .layout-card .card img { width: 100%; display: block; }
"""


def frame_html(fid, layout, bg, headline, sub, shot, icon, size):
    is_dark = bg == "green"
    hcls = "t-warm" if is_dark else "t-dark"
    scls = "t-wsub" if is_dark else "t-muted"
    xl = "headline--xl" if layout in ("layout-hero", "layout-asym") else "headline--lg"
    tleft = " t-left" if layout == "layout-asym" else ""
    icon_html = (
        '<div class="app-icon%s"><img src="img/icon.png" alt="Remedy"></div>'
        % (" app-icon--glow" if is_dark else "")
        if icon
        else ""
    )
    if size == "card":
        media = '<div class="card"><img src="img/%s" alt=""></div>' % shot
    else:
        media = (
            '<div class="device device--%s"><div class="device__body"><div class="device__screen">'
            '<img src="img/%s" alt=""></div></div></div>' % (size, shot)
        )
    return f"""
<div class="frame-wrap">
  <div class="frame frame--{bg} {layout}" id="frame-{fid}">
    <div class="text-block">
      {icon_html}
      <h1 class="headline {xl} {hcls}{tleft}">{headline}</h1>
      <p class="subhead {scls}{tleft}">{sub}</p>
    </div>
    {media}
  </div>
</div>
"""


def main() -> None:
    with open(SRC_HTML, encoding="utf-8") as f:
        src = f.read()
    head = src.split("</style>")[0]
    head = re.sub(r"<title>.*?</title>", "<title>Remedy - pet App Store frames (held)</title>", head)
    head = re.sub(r'<script src="https://cdnjs[^"]*"></script>\n?', "", head)
    body = "".join(frame_html(*fr) for fr in FRAMES)
    html = head + EXTRA_CSS + "</style></head><body>" + body + "</body></html>"
    with open(OUT_HTML, "w", encoding="utf-8") as f:
        f.write(html)

    os.makedirs(OUT_DIR, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 2880})
        page.goto("file:///" + OUT_HTML.replace(os.sep, "/"))
        page.wait_for_load_state("networkidle")
        for fid, *_ in FRAMES:
            out = os.path.join(OUT_DIR, f"remedy-pet-{fid}.png")
            page.locator(f"#frame-{fid}").screenshot(path=out)
            print("saved", os.path.basename(out), os.path.getsize(out) // 1024, "KB")
        browser.close()


if __name__ == "__main__":
    main()
