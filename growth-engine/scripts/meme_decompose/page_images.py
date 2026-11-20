"""Extract full-resolution image URLs from a source page (Pinterest, generic og:image)."""
from __future__ import annotations

import re
import urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
IMG_RE = re.compile(r"https?:(?:\\?/){2}[^\"'\s<>()]+?\.(?:jpe?g|png|webp)(?:\?[^\"'\s<>()]*)?", re.I)


def page_image_urls(page: str) -> list[str]:
    try:
        req = urllib.request.Request(page, headers={"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9"})
        html = urllib.request.urlopen(req, timeout=40).read().decode("utf-8", errors="ignore")
    except Exception as exc:
        print(f"  page fetch failed ({exc.__class__.__name__}): {page[:90]}")
        return []
    found: list[str] = []
    for m in IMG_RE.findall(html):
        u = m.replace("\\/", "/").replace("\\u002F", "/").replace("&amp;", "&")
        if "pinimg.com" in u:
            u = re.sub(r"i\.pinimg\.com/[^/]+/", "i.pinimg.com/originals/", u)
        if any(x in u for x in ("favicon", "/static/", "sprite", "logo")):
            continue
        found.append(u)
    found += [m.replace("&amp;", "&") for m in re.findall(r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"', html)]
    uniq = list(dict.fromkeys(found))
    print(f"  {len(uniq):3d} images on {page[:90]}")
    return uniq
