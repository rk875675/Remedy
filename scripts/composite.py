import cv2
import numpy as np
from rembg import remove, new_session
from PIL import Image
import sys
import os

def composite_video(input_path, background_path, output_path):
    cap = cv2.VideoCapture(input_path)
    fps = cap.get(cv2.CAP_PROP_FPS)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    print(f"Input: {width}x{height} @ {fps:.2f}fps, ~{total_frames} frames")

    bg = Image.open(background_path).convert("RGBA").resize((width, height))

    temp_path = output_path.replace(".mp4", "_noaudio.mp4")
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    out = cv2.VideoWriter(temp_path, fourcc, fps, (width, height))

    session = new_session()
    frame_num = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_frame = Image.fromarray(frame_rgb)
        removed = remove(pil_frame, session=session).convert("RGBA")

        composite = Image.alpha_composite(bg.copy(), removed)
        result = cv2.cvtColor(np.array(composite.convert("RGB")), cv2.COLOR_RGB2BGR)
        out.write(result)

        frame_num += 1
        if frame_num % 30 == 0:
            print(f"  Frame {frame_num}/{total_frames}...")

    cap.release()
    out.release()
    print(f"Compositing done. {frame_num} frames written.")

    # Re-attach original audio
    cmd = f'ffmpeg -i "{temp_path}" -i "{input_path}" -c:v copy -c:a aac -map 0:v:0 -map 1:a:0 -shortest "{output_path}" -y'
    print("Merging audio...")
    os.system(cmd)
    os.remove(temp_path)
    print(f"Done! Output: {output_path}")

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python composite.py <input.mp4> <background.jpg> <output.mp4>")
        sys.exit(1)
    composite_video(sys.argv[1], sys.argv[2], sys.argv[3])
