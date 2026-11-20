"""Turn a dumped Google Lens results page into candidate thumbnails + source pages.

In the Lens results tab, run LENS_JS (below) with browser_cdp Runtime.evaluate
(returnByValue: true, awaitPromise: true). The response is saved to a file;
pass that file here.

Usage: python lens_harvest.py <cdp_response.json> <out_dir>
Writes out_dir/items.json ([{i, href, thumb}]) and out_dir/tNNN.jpg for inline thumbs.
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

LENS_JS = r"""(async () => {
  for (let i = 0; i < 12; i++) { window.scrollBy(0, 1500); await new Promise(r => setTimeout(r, 400)); }
  const out = [];
  document.querySelectorAll('img').forEach(img => {
    if (img.naturalWidth < 90) return;
    let el = img, link = '';
    for (let i = 0; i < 12 && el; i++) {
      el = el.parentElement; if (!el) break;
      const a = el.matches('a[href]') ? el : el.querySelector('a[href]');
      if (a && !a.href.includes('google.')) { link = a.href; break; }
    }
    out.push({ href: link, src: img.currentSrc || img.src || '' });
  });
  return JSON.stringify(out);
})()"""


def find_value(o: object) -> str | None:
    if isinstance(o, dict):
        v = o.get("value")
        if isinstance(v, str) and v.startswith("["):
            return v
        for child in o.values():
            r = find_value(child)
            if r:
                return r
    elif isinstance(o, list):
        for child in o:
            r = find_value(child)
            if r:
                return r
    return None


def harvest(src: Path, out: Path) -> list[dict]:
    out.mkdir(parents=True, exist_ok=True)
    raw = json.loads(src.read_text(encoding="utf-8"))
    payload = json.dumps(raw) if isinstance(raw, list) else find_value(raw)
    if not payload:
        raise SystemExit(f"No result array in {src}")
    items: list[dict] = []
    for i, it in enumerate(json.loads(payload)):
        s = str(it.get("src", ""))
        thumb = ""
        if s.startswith("data:image"):
            p = out / f"t{i:03d}.jpg"
            p.write_bytes(base64.b64decode(s.split(",", 1)[1]))
            thumb = str(p)
        elif s.startswith("http"):
            thumb = s
        if thumb:
            items.append({"i": i, "href": str(it.get("href", "")), "thumb": thumb})
    (out / "items.json").write_text(json.dumps(items, indent=2), encoding="utf-8")
    print(f"{len(items)} Lens thumbnails -> {out}")
    return items


if __name__ == "__main__":
    harvest(Path(sys.argv[1]), Path(sys.argv[2]))
