"""Score colour grades against Austen's InShot export of ΩΛ-XJ.

InShot applied its AI Auto Adjust at 40% to the run-through (source
20260906_221801.mp4 from 70.512272 s). For each sampled time we align the
source crop to the export's top region, average both into blocks, and
measure how far each candidate grade lands from InShot's pixels.
"""
import subprocess, sys, json
import numpy as np
from PIL import Image

BASE = "C:/Users/Austen/Downloads/InShot-recovery-2026-09-29/"
OUT = "C:/Users/Austen/AppData/Local/Temp/claude/E--tka-platform/f7265b5f-1250-4f33-84a1-fa830488bacf/scratchpad/colour/"
SOURCE_START = 70.512272
TIMES = [2, 5, 8, 11, 14, 17, 20]
CROP_TOP, CROP_BOTTOM = 0.21069205, 0.6791869
sys.path.insert(0, OUT)
from grades import current_auto, css_filter, proposed_auto, apply_proposed  # noqa: E402


def frame(path, seconds):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{seconds:.4f}", "-i", path, "-frames:v", "1",
                          "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True, check=True).stdout
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=width,height:stream_side_data=rotation", "-of", "json", path],
                           capture_output=True, text=True).stdout
    info = json.loads(probe)["streams"][0]
    w, h = info["width"], info["height"]
    rot = abs(int(next((s.get("rotation", 0) for s in info.get("side_data_list", [])), 0)))
    if rot in (90, 270):
        w, h = h, w
    return np.frombuffer(raw, np.uint8).reshape(h, w, 3)


def block(img, size):
    h, w = img.shape[0] // size * size, img.shape[1] // size * size
    return img[:h, :w].reshape(h // size, size, w // size, size, 3).mean(axis=(1, 3))


def align(src, exp):
    """Best integer shift of src (larger) against exp by grayscale block match."""
    s = block(src.astype(np.float32), 4).mean(axis=2)
    e = block(exp.astype(np.float32), 4).mean(axis=2)
    best = None
    for dy in range(0, s.shape[0] - e.shape[0] + 1):
        for dx in range(0, s.shape[1] - e.shape[1] + 1):
            d = np.abs(s[dy:dy + e.shape[0], dx:dx + e.shape[1]] - e).mean()
            if best is None or d < best[0]:
                best = (d, dx * 4, dy * 4)
    return best


def srgb_to_lab(rgb):
    c = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def delta_e(a, b):
    return np.sqrt(((srgb_to_lab(np.clip(a, 0, 1)) - srgb_to_lab(np.clip(b, 0, 1))) ** 2).sum(-1))


pairs_src, pairs_exp, full_src = [], [], []
for t in TIMES:
    src = frame(BASE + "assets/20260906_221801.mp4", SOURCE_START + t)
    exp = frame(BASE + "reference-export.mp4", t)[:900, 30:1050]
    H = src.shape[0]
    crop = src[int(CROP_TOP * H):int(CROP_BOTTOM * H)]
    crop = np.asarray(Image.fromarray(crop).resize((1128, 940), Image.BILINEAR))
    score, dx, dy = align(crop, exp)
    aligned = crop[dy:dy + exp.shape[0], dx:dx + exp.shape[1]]
    print(f"t={t}: shift dx={dx} dy={dy} gray diff {score:.2f}")
    pairs_src.append(block(aligned.astype(np.float32) / 255, 12).reshape(-1, 3))
    pairs_exp.append(block(exp.astype(np.float32) / 255, 12).reshape(-1, 3))
    full_src.append(aligned)
    if t == 11:
        Image.fromarray(aligned).save(OUT + "omega-src-11.png")
        Image.fromarray(exp).save(OUT + "omega-inshot-11.png")

src = np.concatenate(pairs_src)
exp = np.concatenate(pairs_exp)

# Auto analyzers read the whole clip span; sample the run-through source span.
clip_frames = [frame(BASE + "assets/20260906_221801.mp4", SOURCE_START + 25.137199 * f) for f in (0.15, 0.5, 0.85)]
cur = current_auto(clip_frames)
prop = proposed_auto(clip_frames)
print("current Auto:", cur)
print("proposed Auto:", {k: (round(v, 3) if isinstance(v, float) else v) for k, v in prop.items() if k != "curves"})

candidates = {
    "original (no grade)": src,
    "current Auto": css_filter(src, cur),
    "Austen's sliders (contrast 1.17, sat 1.12)": css_filter(src, {"brightness": 1, "contrast": 1.17, "saturation": 1.12}),
    "proposed Auto": apply_proposed(src, prop),
}
# Upper bound: best per-channel curve + saturation fitted to InShot itself.
knots = np.linspace(0, 1, 17)
oracle = np.zeros_like(src)
for c in range(3):
    idx = np.clip((src[:, c] * 16).astype(int), 0, 15)
    frac = src[:, c] * 16 - idx
    A = np.zeros((len(src), 17))
    A[np.arange(len(src)), idx] = 1 - frac
    A[np.arange(len(src)), idx + 1] += frac
    coef = np.linalg.lstsq(A, exp[:, c], rcond=None)[0]
    oracle[:, c] = A @ coef
    print(f"oracle curve {'RGB'[c]}:", " ".join(f"{v:.3f}" for v in coef))
candidates["best possible curves (fitted to InShot)"] = oracle

print("\nDistance from InShot's Auto Adjust export (CIE76 ΔE; lower is closer, ~2 is barely visible):")
for name, out in candidates.items():
    d = delta_e(out, exp)
    print(f"  {name:45s} median {np.median(d):5.2f}  p90 {np.quantile(d, 0.9):5.2f}  mean {d.mean():5.2f}")
lum = lambda x: (x * [0.2126, 0.7152, 0.0722]).sum(-1)
print("\nMean luma  src %.3f  inshot %.3f  proposed %.3f" % (lum(src).mean(), lum(exp).mean(), lum(candidates['proposed Auto']).mean()))
print("Mean RGB   src", np.round(src.mean(0), 3), " inshot", np.round(exp.mean(0), 3), " proposed", np.round(candidates['proposed Auto'].mean(0), 3))
