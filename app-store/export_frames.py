from playwright.sync_api import sync_playwright
import os

HTML_PATH = os.path.join(os.path.dirname(__file__), "frames.html")
OUT_DIR = os.path.join(os.path.dirname(__file__), "export")
os.makedirs(OUT_DIR, exist_ok=True)

FRAMES = [
    ("frame-1", "remedy-01-hero.png"),
    ("frame-2", "remedy-02-tailored.png"),
    ("frame-3", "remedy-03-session.png"),
    ("frame-4", "remedy-04-schedule.png"),
    ("frame-5", "remedy-05-personal.png"),
    ("frame-6", "remedy-06-showup.png"),
    ("frame-7", "remedy-07-form.png"),
    ("frame-8", "remedy-08-journey.png"),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 2880})
    page.goto(f"file:///{HTML_PATH.replace(os.sep, '/')}")
    page.wait_for_load_state("networkidle")

    for frame_id, filename in FRAMES:
        el = page.locator(f"#{frame_id}")
        out_path = os.path.join(OUT_DIR, filename)
        el.screenshot(path=out_path)
        print(f"Saved {filename} ({os.path.getsize(out_path) // 1024} KB)")

    browser.close()

print(f"\nAll {len(FRAMES)} frames exported to: {OUT_DIR}")
