import numpy as np, io, contextlib, json
from PIL import Image, ImageDraw, ImageFont
with contextlib.redirect_stdout(io.StringIO()):
    import audit_inshot as A
from grades import current_auto, css_filter, proposed_auto_v2, apply_proposed, slider_auto
CLIPS = "E:/tka-platform/static/word-videos/inshot-recovery/"
FONT = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 22)
BOLD = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", 24)

def duration(path):
    import subprocess
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True).stdout)

def graded(frame, fn):
    return (np.clip(fn(frame.astype(np.float64) / 255), 0, 1) * 255).round().astype(np.uint8)

rows = []
# ΩΛ-XJ against InShot's own export (same crop of the same moment).
src11 = np.asarray(Image.open(A.OUT + "omega-src-11.png"))
ins11 = np.asarray(Image.open(A.OUT + "omega-inshot-11.png"))
cur = current_auto(A.clip_frames); new = proposed_auto_v2(A.clip_frames); sl = slider_auto(A.clip_frames)
rows.append(("ΩΛ-XJ run-through (InShot made the last one)", [
    ("Original", src11), ("Your sliders now", graded(src11, lambda x: css_filter(x, {"contrast": 1.17, "saturation": 1.12}))),
    ("A: new Auto, sliders", graded(src11, lambda x: css_filter(x, sl))), ("B: new Auto, curves", graded(src11, lambda x: apply_proposed(x, new))),
    ("InShot Auto 40%", ins11)]))
report = {"ΩΛ-XJ": {"sliders": sl, "new": {k: round(v, 3) if isinstance(v, float) else v for k, v in new.items()}}}
for name, file, sliders in [("DCKΨ- run-through", "dck-cut-1.mp4", {"contrast": 1.17, "saturation": 1.12}),
                            ("DCKΨ- slow take", "dck-cut-2.mp4", {"contrast": 1.25, "saturation": 1.09}),
                            ("Δ-ΛRZ woods, full speed", "woods-cut-1.mp4", {"contrast": 1.17, "saturation": 1.12}),
                            ("Δ-ΛRZ woods, slow take", "woods-cut-2.mp4", {"contrast": 1.25, "saturation": 1.09})]:
    path = CLIPS + file
    d = duration(path)
    frames = [A.frame(path, d * f) for f in (0.15, 0.5, 0.85)]
    cur = current_auto(frames); new = proposed_auto_v2(frames); sl = slider_auto(frames)
    report[name] = {"sliders": sl, "new": {k: round(v, 3) if isinstance(v, float) else v for k, v in new.items()}}
    f = frames[1]
    rows.append((name, [("Original", f), ("Your sliders now", graded(f, lambda x: css_filter(x, sliders))),
                        ("A: new Auto, sliders", graded(f, lambda x: css_filter(x, sl))), ("B: new Auto, curves", graded(f, lambda x: apply_proposed(x, new)))]))
print(json.dumps({k: {"sliders": v["sliders"], "curves": {kk: vv for kk, vv in v["new"].items() if kk in ("black", "white", "gamma", "saturation")}} for k, v in report.items()}, ensure_ascii=False))

CELL_W, GAP, LABEL, TITLE = 300, 10, 34, 40
def fit(img):
    im = Image.fromarray(img)
    return im.resize((CELL_W, round(im.height * CELL_W / im.width)), Image.LANCZOS)
height = sum(TITLE + LABEL + max(fit(i).height for _, i in cells) + GAP * 2 for _, cells in rows)
sheet = Image.new("RGB", (5 * CELL_W + 6 * GAP, height), (24, 24, 28))
draw = ImageDraw.Draw(sheet)
yy = 0
for title, cells in rows:
    draw.text((GAP, yy + 8), title, font=BOLD, fill=(240, 240, 240))
    yy += TITLE
    h = 0
    for c, (label, img) in enumerate(cells):
        x = GAP + c * (CELL_W + GAP)
        draw.text((x, yy + 4), label, font=FONT, fill=(255, 214, 102) if label.startswith(("A:", "B:")) else (200, 200, 200))
        im = fit(img)
        sheet.paste(im, (x, yy + LABEL))
        h = max(h, im.height)
    yy += LABEL + h + GAP * 2
sheet.save(A.OUT + "auto-colour-comparison.jpg", quality=90)
print(sheet.size)
