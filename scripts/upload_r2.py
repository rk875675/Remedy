#!/usr/bin/env python3
"""
Remedy — Publish exercise clips to Cloudflare R2
================================================
Moves the normalized clip library off Supabase Storage (metered egress) onto R2
(zero egress) and generates the migration that repoints `exercises.video_url`.

Why R2
------
Exercise clips are static assets served over and over. Supabase bills storage
egress ($0.03/GB cached, $0.09/GB uncached above the 250 GB Pro quota); R2 bills
$0 for egress on every storage class. The normalized library is ~10 MB, well
inside R2's 10 GB free tier, so serving it costs effectively nothing at any user
count.

Prerequisites
-------------
Run `python scripts/normalize_videos.py fetch` then `encode` first — this uploads
the normalized output, not the oversized originals.

Authentication uses the Wrangler CLI's browser OAuth flow (`npx wrangler login`),
so no R2 access key or secret is ever written to this repo. Wrangler is invoked
through `npx` and is NOT added to package.json.

Usage:
  # 0. One-time, interactive (see SETUP notes printed by `steps`)
  python scripts/upload_r2.py steps

  # 1. Inspect what will be uploaded and which keys are orphaned
  python scripts/upload_r2.py manifest

  # 2. Upload (add --dry-run first to see the exact wrangler commands)
  python scripts/upload_r2.py upload --bucket remedy-videos --dry-run
  python scripts/upload_r2.py upload --bucket remedy-videos

  # 3. Verify the public URLs actually serve, then emit the migration
  python scripts/upload_r2.py verify  --public-base https://videos.example.com
  python scripts/upload_r2.py migration --public-base https://videos.example.com
"""

import argparse
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

MIGRATIONS_DIR = Path("supabase/migrations")
DEFAULT_INPUT = Path("scripts/output/_normalize/out")
DEFAULT_PREFIX = "exercises"

# 054/055 already used by program-assignment migrations.
MIGRATION_NAME = "056_repoint_exercise_videos_to_r2.sql"

# Clips are immutable once published — a re-crop lands under a new key — so they
# can be cached hard at the edge and on device. Written without spaces so the value
# survives Windows cmd quoting when wrangler is invoked through npx.
CACHE_CONTROL = "public,max-age=31536000,immutable"

UPDATE_RE = re.compile(
    r"UPDATE\s+public\.exercises\s+SET\s+video_url\s*=\s*'([^']+)'\s+"
    r"WHERE\s+name\s*=\s*'((?:[^']|'')+)'",
    re.IGNORECASE | re.DOTALL,
)


def build_mapping() -> dict[str, str]:
    """
    Replays every migration in filename order and returns {exercise_name: key}.

    Later migrations overwrite earlier ones, which mirrors how Postgres actually
    applied them — so a re-crop (e.g. 053 pointing Bird Dog at bird_dog_v2.mp4)
    correctly wins over the original wiring in 036.
    """
    mapping: dict[str, str] = {}
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        text = path.read_text(encoding="utf-8")
        for url, name in UPDATE_RE.findall(text):
            mapping[name.replace("''", "'")] = url.rsplit("/", 1)[-1]
    return mapping


def referenced_keys() -> set[str]:
    return set(build_mapping().values())


def cmd_steps(_: argparse.Namespace) -> int:
    print(__doc__)
    print(
        """
SETUP — do these once, in order
===============================

1. Enable R2 (needs a payment method on file even though this stays in free tier):
     Cloudflare dashboard -> R2 -> "Enable R2"

2. Create the bucket:
     npx wrangler login              # opens a browser, no secrets stored in repo
     npx wrangler r2 bucket create remedy-videos

3. Expose it publicly. Pick ONE:

   a) Custom domain (recommended — stable, cacheable, no rate limits):
        R2 -> remedy-videos -> Settings -> Public access -> Connect Domain
        e.g. videos.yourdomain.com
      Public base becomes: https://videos.yourdomain.com

   b) r2.dev subdomain (quick, but rate-limited and NOT for production):
        R2 -> remedy-videos -> Settings -> Public access -> Allow r2.dev
      Public base becomes: https://pub-<hash>.r2.dev

4. Upload and verify:
     python scripts/normalize_videos.py fetch
     python scripts/normalize_videos.py encode
     python scripts/upload_r2.py upload --bucket remedy-videos
     python scripts/upload_r2.py verify --public-base <your public base>

5. Emit and apply the migration:
     python scripts/upload_r2.py migration --public-base <your public base>
     supabase db push --linked --yes

NOTE ON ACCESS CONTROL
======================
A public bucket means clips are readable by anyone with the URL — the same
exposure Supabase Storage has today, so this is not a regression. It is also NOT
the paywall your entitlement gate assumes. If clips must be premium-gated, keep
the bucket PRIVATE and serve through a Worker that validates a Supabase JWT, or
use R2 presigned URLs from the existing get-video-url edge function. Decide this
before launch, not after.
"""
    )
    return 0


def cmd_manifest(args: argparse.Namespace) -> int:
    mapping = build_mapping()
    src = Path(args.input)
    on_disk = {p.name for p in src.glob("*.mp4")} if src.exists() else set()
    needed = set(mapping.values())

    print(f"{len(mapping)} exercises reference a video key.\n")
    print(f"{'exercise':40} {'key':38} {'normalized':>10}")
    print("-" * 92)
    total, missing = 0, []
    for name, key in sorted(mapping.items()):
        path = src / key
        if path.exists():
            size = path.stat().st_size
            total += size
            print(f"{name:40} {key:38} {size / 1048576:8.2f}MB")
        else:
            missing.append(key)
            print(f"{name:40} {key:38} {'MISSING':>10}")
    print("-" * 92)
    print(f"{'TOTAL to upload':40} {'':38} {total / 1048576:8.2f}MB")

    orphaned = sorted(on_disk - needed)
    if orphaned:
        print(
            f"\n{len(orphaned)} file(s) on disk are not referenced by any exercise "
            f"(superseded by a _v2 upload). These are skipped:"
        )
        for key in orphaned:
            print(f"    {key}")

    if missing:
        print(f"\n{len(missing)} referenced key(s) missing from {src} — run `normalize_videos.py` first:")
        for key in missing:
            print(f"    {key}")
        return 1
    return 0


def cmd_upload(args: argparse.Namespace) -> int:
    src = Path(args.input)
    if not src.exists():
        print(f"{src} does not exist — run `normalize_videos.py encode` first.")
        return 1

    keys = sorted(referenced_keys())
    missing = [k for k in keys if not (src / k).exists()]
    if missing:
        print(f"{len(missing)} referenced clip(s) missing from {src}; run `manifest` for detail.")
        return 1

    print(f"Uploading {len(keys)} clips to r2://{args.bucket}/{args.prefix}/")
    if args.dry_run:
        print("(dry run — no bytes will move)\n")

    failed = []
    for i, key in enumerate(keys, 1):
        path = src / key
        object_path = f"{args.bucket}/{args.prefix}/{key}"
        cmd = [
            "npx", "--yes", "wrangler@latest", "r2", "object", "put", object_path,
            "--file", str(path),
            "--content-type", "video/mp4",
            "--cache-control", CACHE_CONTROL,
            "--remote",
        ]
        mb = path.stat().st_size / 1048576
        if args.dry_run:
            print(f"[{i:2}/{len(keys)}] {key:38} {mb:6.2f}MB\n    {' '.join(cmd)}")
            continue

        print(f"[{i:2}/{len(keys)}] {key:38} {mb:6.2f}MB ... ", end="", flush=True)
        res = subprocess.run(cmd, capture_output=True, text=True, shell=(sys.platform == "win32"))
        if res.returncode == 0:
            print("ok")
        else:
            print("FAILED")
            print(f"    {(res.stderr or res.stdout).strip()[:500]}")
            failed.append(key)

    if failed:
        print(f"\n{len(failed)} upload(s) failed:")
        for key in failed:
            print(f"    {key}")
        return 1
    if not args.dry_run:
        print(f"\nUploaded {len(keys)} clips. Next: verify --public-base <base>")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    base = args.public_base.rstrip("/")
    keys = sorted(referenced_keys())
    print(f"Verifying {len(keys)} clips under {base}/{args.prefix}/\n")

    ok, bad = 0, []
    for i, key in enumerate(keys, 1):
        url = f"{base}/{args.prefix}/{key}"
        # Browser-like UA — Cloudflare WAF often 403s the default Python-urllib agent.
        req = urllib.request.Request(
            url,
            method="HEAD",
            headers={"User-Agent": "RemedyVerify/1.0"},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                length = int(resp.headers.get("Content-Length") or 0)
                ctype = resp.headers.get("Content-Type") or "?"
                cache = resp.headers.get("Cache-Control") or "(none)"
                print(f"[{i:2}/{len(keys)}] {key:38} {resp.status} {length / 1048576:6.2f}MB {ctype:11} {cache}")
                ok += 1
        except (urllib.error.HTTPError, urllib.error.URLError, OSError) as exc:
            print(f"[{i:2}/{len(keys)}] {key:38} FAILED: {exc}")
            bad.append(key)

    print(f"\n{ok} ok, {len(bad)} failed")
    return 1 if bad else 0


def cmd_migration(args: argparse.Namespace) -> int:
    base = args.public_base.rstrip("/")
    mapping = build_mapping()
    out = MIGRATIONS_DIR / MIGRATION_NAME

    lines = [
        f"-- {MIGRATION_NAME}",
        "-- Repoint exercise clips from Supabase Storage to Cloudflare R2.",
        "--",
        "-- Rationale: clips are static, repeatedly-served assets. Supabase bills storage",
        "-- egress above the Pro quota ($0.03/GB cached, $0.09/GB uncached); R2 bills $0 for",
        "-- egress. Combined with the on-device cache in lib/videoCache.ts, video delivery",
        "-- stops scaling with user count.",
        "--",
        "-- The URLs here point at the NORMALIZED encodes (scripts/normalize_videos.py):",
        "-- the library went from 110.2 MB to 10.3 MB (-90.7%) by capping width at 1280px",
        "-- (the player container is ~1179px at 3x) with no change to aspect ratio or crop.",
        "--",
        "-- Because lib/videoCache.ts keys its on-device cache on the full URL, this change",
        "-- invalidates cached copies automatically; clients re-download once, then stop.",
        "",
    ]
    for name, key in sorted(mapping.items()):
        escaped = name.replace("'", "''")
        lines.append("UPDATE public.exercises")
        lines.append(f"SET video_url = '{base}/{args.prefix}/{key}'")
        lines.append(f"WHERE name = '{escaped}' AND is_assignable = true;")
        lines.append("")

    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {out} ({len(mapping)} exercises)")
    print("\nReview it, then apply with:\n  supabase db push --linked --yes")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Publish Remedy clips to Cloudflare R2")
    sub = parser.add_subparsers(dest="command", required=True)

    p_steps = sub.add_parser("steps", help="Print the one-time R2 setup instructions")
    p_steps.set_defaults(func=cmd_steps)

    p_man = sub.add_parser("manifest", help="Show what will be uploaded")
    p_man.add_argument("--input", default=str(DEFAULT_INPUT))
    p_man.set_defaults(func=cmd_manifest)

    p_up = sub.add_parser("upload", help="Upload normalized clips to R2")
    p_up.add_argument("--bucket", required=True)
    p_up.add_argument("--input", default=str(DEFAULT_INPUT))
    p_up.add_argument("--prefix", default=DEFAULT_PREFIX)
    p_up.add_argument("--dry-run", action="store_true", dest="dry_run")
    p_up.set_defaults(func=cmd_upload)

    p_ver = sub.add_parser("verify", help="HEAD every public URL")
    p_ver.add_argument("--public-base", required=True, dest="public_base")
    p_ver.add_argument("--prefix", default=DEFAULT_PREFIX)
    p_ver.set_defaults(func=cmd_verify)

    p_mig = sub.add_parser("migration", help="Emit the video_url migration")
    p_mig.add_argument("--public-base", required=True, dest="public_base")
    p_mig.add_argument("--prefix", default=DEFAULT_PREFIX)
    p_mig.set_defaults(func=cmd_migration)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
