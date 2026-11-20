"""python transcribe.py <video> -> words.json and words.txt next to this script."""
import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel

ROOT = Path(__file__).parent
video = sys.argv[1]
model = WhisperModel("small.en", device="cpu", compute_type="int8")
segments, _ = model.transcribe(video, word_timestamps=True)
words = [{"w": w.word.strip(), "s": round(w.start, 2), "e": round(w.end, 2)} for seg in segments for w in seg.words]
(ROOT / "words.json").write_text(json.dumps(words), encoding="utf-8")
(ROOT / "words.txt").write_text("\n".join(f"{x['s']:.2f}-{x['e']:.2f} {x['w']}" for x in words), encoding="utf-8")
print(len(words), "words; duration", words[-1]["e"] if words else 0)
