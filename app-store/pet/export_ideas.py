"""Export the locked App Store frames.

Screenshots: 1206 x 2622, the iPhone 6.1" / 6.3" size App Store Connect
lists (also accepts 1179 x 2556). Header: 3840 x 1646.

    python app-store/pet/export_ideas.py
"""

from __future__ import annotations

import os
import shutil

from PIL import Image
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "export")
DOWNLOADS = os.path.join(os.path.expanduser("~"), "Downloads", "Remedy App Store")
URL = "http://127.0.0.1:8754/app-store/pet/ideas.html"

SHOTS = [
    ("shot-01", "01-back-exercise-pet.png"),
    ("shot-02", "02-grows-with-you.png"),
    ("shot-03", "03-celebrate-wins.png"),
    ("shot-04", "04-track-progress.png"),
    ("shot-05", "05-custom-plan.png"),
    ("shot-06", "06-video-workouts.png"),
    ("shot-07", "07-rest-buddy.png"),
    ("shot-08", "08-gentle-reminders.png"),
]
W, H = 1206, 2622
ZOOM = H / 844


def fit(path: str, size: tuple[int, int]) -> None:
    im = Image.open(path).convert("RGB")
    tw, th = size
    if im.size != size:
        scale = max(tw / im.width, th / im.height)
        if abs(scale - 1) > 0.001:
            im = im.resize(
                (round(im.width * scale), round(im.height * scale)),
                Image.Resampling.LANCZOS,
            )
        left = max(0, (im.width - tw) // 2)
        top = max(0, (im.height - th) // 2)
        im = im.crop((left, top, left + tw, top + th))
        im.save(path, "PNG")


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(DOWNLOADS, exist_ok=True)
    saved: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1600, "height": 1200}, device_scale_factor=1)
        page.goto(URL, wait_until="networkidle")
        page.evaluate("() => document.fonts.ready")
        page.wait_for_timeout(400)
        page.evaluate("() => { document.querySelector('header.bar').style.display = 'none'; }")
        page.set_viewport_size({"width": 4200, "height": 3200})

        def stage(selector: str, zoom: float | None) -> None:
            page.evaluate(
                """([selector, zoom]) => {
                  const src = document.querySelector(selector);
                  let stage = document.getElementById('export-stage');
                  if (!stage) {
                    stage = document.createElement('div');
                    stage.id = 'export-stage';
                    stage.style.position = 'absolute';
                    stage.style.left = '0';
                    stage.style.top = '0';
                    stage.style.zIndex = '50';
                    document.body.appendChild(stage);
                  }
                  stage.replaceChildren(src.cloneNode(true));
                  const node = stage.firstElementChild;
                  node.style.margin = '0';
                  if (zoom) node.style.zoom = String(zoom);
                }""",
                [selector, zoom],
            )

        for shot_id, name in SHOTS:
            stage(f"#frames #{shot_id}", ZOOM)
            path = os.path.join(OUT, name)
            page.locator("#export-stage .shot").screenshot(path=path)
            fit(path, (W, H))
            saved.append(path)
            print(f"{name}  {W}x{H}")

        stage("#shot-header", None)
        page.evaluate(
            """() => {
              const node = document.querySelector('#export-stage .banner');
              node.style.width = '3840px';
              node.style.height = '1646px';
              node.style.maxWidth = 'none';
              node.style.aspectRatio = 'auto';
              node.querySelectorAll('.bn.tf').forEach((t) => {
                t.style.borderLeftWidth = '20px';
                t.style.borderRightWidth = '20px';
                t.style.borderBottomWidth = '52px';
              });
            }"""
        )
        header = page.locator("#export-stage .banner")
        header_path = os.path.join(OUT, "header.png")
        header.screenshot(path=header_path)
        fit(header_path, (3840, 1646))
        saved.append(header_path)
        print("header.png  3840x1646")

        page.set_viewport_size({"width": 4200, "height": 2800})
        stage("#shot-search-wide", 2)
        page.evaluate(
            """() => {
              const node = document.querySelector('#export-stage .search-board');
              node.style.transform = 'none';
            }"""
        )
        search_path = os.path.join(OUT, "search.png")
        page.locator("#export-stage .search-board").screenshot(path=search_path)
        fit(search_path, (3840, 2560))
        saved.append(search_path)
        print("search.png  3840x2560")
        browser.close()

    for path in saved:
        dest = os.path.join(DOWNLOADS, os.path.basename(path))
        shutil.copy2(path, dest)
        print(f"copied {os.path.basename(path)}")
    print(DOWNLOADS)


if __name__ == "__main__":
    main()
