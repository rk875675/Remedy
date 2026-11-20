"""Builds the HELD App Store preview draft from real in-app screen recordings.

    python app-store/pet/preview/build_preview.py

Output: app-store/pet/preview/remedy-pet-preview-draft.mp4 (886x1920, 30 fps, H.264, silent AAC track).
Only real recordings. No pain-check screens, no outcome-claim screens, no iOS Control Center,
no rating pop-up, no recording start/stop UI. Starts on 'Name your armadillo'.
"""
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.abspath(os.path.join(HERE, "..", "..", "..", "growth-engine", "assets", "screenshots"))
OUT = os.path.join(HERE, "remedy-pet-preview-draft.mp4")

# (file, start, end, hold_last_frame_seconds, note)
SHOTS = [
    ("rec_onboarding_welcome_grow.mp4", 1.2, 5.0, 0.0, "Name your armadillo"),
    ("rec_onboarding_welcome_grow.mp4", 5.0, 9.5, 0.0, "Every session, it uncurls a little (stage preview)"),
    ("rec_session_done_home.mp4", 8.0, 13.0, 0.0, "Cat-Cow with the armadillo coaching"),
    ("rec_session_done_home.mp4", 27.0, 30.5, 0.0, "Glute Bridge, 'I am here. Keep going.'"),
    ("rec_session_done_home.mp4", 47.0, 50.0, 0.0, "Bird Dog with coaching bubble"),
    ("rec_poke_to_angry.mp4", 3.0, 6.5, 0.0, "Poke it too much and it rolls into a ball"),
    # Clean stretch only: the rating pop-up has faded by 68.4, Control Center starts at 69.8.
    ("rec_session_done_home.mp4", 68.5, 69.6, 1.0, "Home: You're good for today (holds on the last clean frame)"),
]

inputs, filters, labels = [], [], []
for i, (f, a, b, hold, _) in enumerate(SHOTS):
    inputs += ["-i", os.path.join(SRC, f)]
    chain = (
        f"[{i}:v]trim=start={a}:end={b},setpts=PTS-STARTPTS,fps=30,"
        f"scale=886:1926:flags=lanczos,crop=886:1920,setsar=1,format=yuv420p"
    )
    if hold:
        chain += f",tpad=stop_mode=clone:stop_duration={hold}"
    filters.append(chain + f"[v{i}]")
    labels.append(f"[v{i}]")
filters.append("".join(labels) + f"concat=n={len(SHOTS)}:v=1:a=0[v]")
total = sum(b - a + hold for _, a, b, hold, _ in SHOTS)
cmd = (
    ["ffmpeg", "-y", "-loglevel", "error"] + inputs
    + ["-f", "lavfi", "-t", f"{total:.3f}", "-i", "anullsrc=channel_layout=stereo:sample_rate=48000"]
    + ["-filter_complex", ";".join(filters), "-map", "[v]", "-map", f"{len(SHOTS)}:a"]
    + ["-c:v", "libx264", "-profile:v", "high", "-level", "4.0", "-crf", "17", "-preset", "slow", "-r", "30",
       "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", OUT]
)
subprocess.run(cmd, check=True)
print("wrote", OUT, f"({total:.1f}s planned)")
