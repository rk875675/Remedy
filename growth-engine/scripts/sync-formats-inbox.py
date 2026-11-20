"""Import every URL from studio Formats inbox into the Memes format library (local run)."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--studio",
        default="https://slide.remedyrecoveries.com",
        help="Growth Engine studio origin",
    )
    parser.add_argument(
        "--inbox-json",
        help="Path to {items:[{url,note,...}]} instead of live GET /api/formats",
    )
    parser.add_argument("--password", help="Studio password (sets session cookie via POST /api/auth/login)")
    args = parser.parse_args()

    items: list[dict]
    if args.inbox_json:
        items = json.loads(Path(args.inbox_json).read_text(encoding="utf-8")).get("items") or []
    else:
        jar = CookieJar()
        opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
        if args.password:
            login_body = json.dumps({"password": args.password}).encode("utf-8")
            req = urllib.request.Request(
                f"{args.studio.rstrip('/')}/api/auth/login",
                data=login_body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            opener.open(req, timeout=60)
        req = urllib.request.Request(f"{args.studio.rstrip('/')}/api/formats")
        payload = json.loads(opener.open(req, timeout=60).read().decode("utf-8"))
        items = payload.get("items") or []

    if not items:
        print("No format links in inbox.")
        return

    for row in items:
        url = str(row.get("url") or "").strip()
        note = str(row.get("note") or "").strip()
        if not url:
            continue
        cmd = [sys.executable, "scripts/import-format-study.py", url]
        if note:
            cmd.extend(["--note", note])
        print("Importing", url)
        code = subprocess.run(cmd).returncode
        if code == 3:
            print("  -> needs the Lens background step (see .cursor/skills/meme-format-decompose)")
        elif code != 0:
            print(f"  -> failed with exit {code}")


if __name__ == "__main__":
    main()
