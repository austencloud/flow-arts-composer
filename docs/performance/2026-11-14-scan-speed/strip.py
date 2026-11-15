# Film strip from a screencast frames dir: one frame per step (latest frame at
# or before each time), labelled with the time, in rows.
#   python strip.py <frames_dir> <out.jpg> <title> [step_ms] [end_ms]
import os, sys
from PIL import Image, ImageDraw, ImageFont

frames_dir, out, title = sys.argv[1], sys.argv[2], sys.argv[3]
step = int(sys.argv[4]) if len(sys.argv) > 4 else 1000
files = sorted(f for f in os.listdir(frames_dir) if f.endswith(".jpg"))
times = [int(f[:-4]) for f in files]
end = int(sys.argv[5]) if len(sys.argv) > 5 else times[-1]
W, H = 140, 262
font = ImageFont.truetype("arial.ttf", 15)
big = ImageFont.truetype("arialbd.ttf", 18)
slots = list(range(0, end + 1, step))
cols = 10
rows = (len(slots) + cols - 1) // cols
sheet = Image.new("RGB", (cols * (W + 6) + 6, 34 + rows * (H + 26)), "white")
d = ImageDraw.Draw(sheet)
d.text((8, 6), title, fill="black", font=big)
for i, t in enumerate(slots):
    prior = [f for f, ft in zip(files, times) if ft <= t]
    x = 6 + (i % cols) * (W + 6)
    y = 34 + (i // cols) * (H + 26)
    if prior:
        img = Image.open(os.path.join(frames_dir, prior[-1])).convert("RGB").resize((W, H))
        sheet.paste(img, (x, y))
    else:
        d.rectangle([x, y, x + W, y + H], outline="#ccc")
    d.text((x + 2, y + H + 3), f"{t / 1000:.1f} s", fill="black", font=font)
sheet.save(out, quality=85)
print(out, len(slots), "frames")
