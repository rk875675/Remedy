"""Verify background candidates against the recovered plate (SIFT + RANSAC homography).

SSIM after resizing is useless: the original photo is usually a different crop or
aspect than the TikTok frame. A homography with many RANSAC inliers on the known
(uncovered) plate pixels proves "same photo". Unrelated images score < 15 inliers;
the true source scored 1131 (full-res) and 100+ even as a 168x300 Lens thumbnail.
"""
from __future__ import annotations

import hashlib
import urllib.request
from pathlib import Path

import cv2
import numpy as np

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
SCREEN_INLIERS = 30
MIN_INLIERS = 40
MIN_INLIER_RATIO = 0.25
MAX_ALIGN_ERR = 12.0


def load_plate(work: Path) -> tuple[np.ndarray, np.ndarray]:
    plate = cv2.imread(str(work / "plate_known.png"))
    cov = cv2.imread(str(work / "coverage.png"), 0)
    if plate is None or cov is None:
        raise SystemExit(f"Run plate stage first: missing plate_known.png/coverage.png in {work}")
    mask = cv2.erode((cov > 0).astype(np.uint8) * 255, np.ones((9, 9), np.uint8))
    return plate, mask


def fetch(url: str, dest_dir: Path) -> Path | None:
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{hashlib.sha1(url.encode('utf-8')).hexdigest()[:16]}.img"
    if dest.exists() and dest.stat().st_size > 2000:
        return dest
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://www.google.com/"})
        data = urllib.request.urlopen(req, timeout=40).read()
    except Exception:
        return None
    if len(data) < 2000:
        return None
    dest.write_bytes(data)
    return dest


def read_any(path: Path) -> np.ndarray | None:
    return cv2.imdecode(np.frombuffer(path.read_bytes(), np.uint8), cv2.IMREAD_COLOR)


class Matcher:
    def __init__(self, work: Path) -> None:
        self.plate, self.mask = load_plate(work)
        self.sift = cv2.SIFT_create(nfeatures=6000)
        g = cv2.cvtColor(self.plate, cv2.COLOR_BGR2GRAY)
        self.k1, self.d1 = self.sift.detectAndCompute(g, self.mask)

    def score(self, cand: np.ndarray) -> dict:
        scale = 1.0
        if max(cand.shape[:2]) > 2400:
            scale = 2400 / max(cand.shape[:2])
            cand = cv2.resize(cand, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        k2, d2 = self.sift.detectAndCompute(cv2.cvtColor(cand, cv2.COLOR_BGR2GRAY), None)
        out: dict = {"inliers": 0, "ratio": 0.0, "align_err": None, "verified": False}
        if self.d1 is None or d2 is None or len(k2) < 8:
            return out
        pairs = cv2.BFMatcher(cv2.NORM_L2).knnMatch(self.d1, d2, k=2)
        good = [m for m, n in (p for p in pairs if len(p) == 2) if m.distance < 0.75 * n.distance]
        if len(good) < 8:
            return out
        src = np.float32([k2[m.trainIdx].pt for m in good]).reshape(-1, 1, 2)
        dst = np.float32([self.k1[m.queryIdx].pt for m in good]).reshape(-1, 1, 2)
        h, inl = cv2.findHomography(src, dst, cv2.RANSAC, 4.0)
        if h is None:
            return out
        out["inliers"] = int(inl.sum())
        out["ratio"] = out["inliers"] / max(1, len(good))
        size = (self.plate.shape[1], self.plate.shape[0])
        warped = cv2.warpPerspective(cand, h, size, flags=cv2.INTER_LINEAR)
        valid = cv2.warpPerspective(np.full(cand.shape[:2], 255, np.uint8), h, size) > 0
        m = (self.mask > 0) & valid
        if m.sum() > 1000:
            out["align_err"] = float(np.abs(warped.astype(np.int16) - self.plate.astype(np.int16))[m].mean())
            out["covers_frame"] = float(valid.mean())
        # homography mapping ORIGINAL (unscaled) candidate pixels -> video frame
        out["_h"] = (h @ np.diag([scale, scale, 1.0])).tolist()
        out["verified"] = (
            out["inliers"] >= MIN_INLIERS
            and out["ratio"] >= MIN_INLIER_RATIO
            and out["align_err"] is not None
            and out["align_err"] <= MAX_ALIGN_ERR
            and out.get("covers_frame", 0.0) >= 0.98
        )
        return out
