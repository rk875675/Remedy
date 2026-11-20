"""Print character counts for each field in app-store/pet/listing.md against App Store limits."""
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
LIMITS = {
    "App name": 30,
    "Subtitle": 30,
    "Promotional text": 170,
    "Keywords": 100,
    "Description": 4000,
    "What's new": 4000,
}

text = open(os.path.join(HERE, "listing.md"), encoding="utf-8").read()
ok = True
for field, limit in LIMITS.items():
    m = re.search(r"^## " + re.escape(field) + r".*?\n(.*?)(?=^## |\Z)", text, re.S | re.M)
    if not m:
        print(f"{field}: MISSING")
        ok = False
        continue
    body = m.group(1).strip()
    if field == "Subtitle":
        body = body.split("\n\n")[0].strip()
    if field == "App name":
        body = body.split("\n\n")[0].strip()
    n = len(body)
    flag = "ok" if n <= limit else "OVER"
    ok &= n <= limit
    print(f"{field}: {n}/{limit} {flag}")
raise SystemExit(0 if ok else 1)
