"""Python twins of Post Studio's colour code, for measuring grades offline."""
import numpy as np
from PIL import Image

LUMA = np.array([0.2126, 0.7152, 0.0722])


def _small(frame, w, h):
    return np.asarray(Image.fromarray(frame).resize((w, h), Image.BILINEAR)).astype(np.float64)


def _pct(hist, count, fraction):
    seen = 0
    target = count * fraction
    for i, v in enumerate(hist):
        seen += v
        if seen >= target:
            return i / 255
    return 1.0


def current_auto(frames):
    """Port of analyzeVideoColor (post-video-color-grade.ts) on 160x90 samples."""
    hist = np.zeros(256, np.int64)
    peak_hist = np.zeros(256, np.int64)
    count = 0
    chroma = 0.0
    chroma_count = 0
    for f in frames:
        px = _small(f, 160, 90).reshape(-1, 3)[::4]  # i += 16 over RGBA bytes
        r, g, b = px[:, 0], px[:, 1], px[:, 2]
        y = np.round(0.2126 * r + 0.7152 * g + 0.0722 * b).astype(int)
        np.add.at(hist, y, 1)
        peak = px.max(1).astype(int)
        np.add.at(peak_hist, peak, 1)
        count += len(px)
        mid = (y >= 16) & (y <= 220)
        chroma += ((px.max(1) - px.min(1)) / 255)[mid].sum()
        chroma_count += int(mid.sum())
    median = _pct(hist, count, 0.5)
    shadow = _pct(hist, count, 0.1)
    highlight = _pct(peak_hist, count, 0.99)
    dark = median < 0.24 and shadow < 0.2
    brightness = round(max(0.9, 1 - (median - 0.65) * 0.25), 2) if (not dark and median > 0.65) else 1
    peak_after = brightness * highlight
    safe = 0.48 / (peak_after - 0.5) if peak_after > 0.5 else 1.12
    contrast = round(max(1, min(1.12, 1 + (shadow - 0.14) * 0.7, safe)), 2) if (not dark and shadow > 0.14 and highlight - shadow > 0.2) else 1
    avg = chroma / chroma_count if chroma_count else 0
    saturation = 1.04 if (not dark and 0.03 < avg < 0.12) else 1
    return {"brightness": brightness, "contrast": contrast, "saturation": saturation,
            "_stats": {"median": median, "shadow": shadow, "highlight": highlight, "dark": dark, "chroma": round(avg, 4)}}


def saturate(rgb, s):
    y = (rgb * LUMA).sum(-1, keepdims=True)
    return y + (rgb - y) * s


def css_filter(rgb, grade):
    """Chrome applies the shorthand filters on sRGB values, in order."""
    out = rgb * grade.get("brightness", 1)
    out = (out - 0.5) * grade.get("contrast", 1) + 0.5
    out = np.clip(out, 0, 1)
    out = saturate(out, grade.get("saturation", 1))
    return np.clip(out, 0, 1)


def proposed_auto(frames, strength=1.0):
    """Clip-wide auto tone: levels, midtone, gentle white balance, vibrance.

    One grade for the whole clip, measured on a few frames, so it never
    pumps. Returns parameters the renderer turns into per-channel curves.
    """
    px = np.concatenate([_small(f, 240, 427 if f.shape[0] > f.shape[1] else 135).reshape(-1, 3) for f in frames]) / 255
    y = (px * LUMA).sum(1)
    peak = px.max(1)
    # Black point: the darkest ~0.7% goes to black, but never crush more
    # than 0.07 (an already-deep black stays where it is).
    black = float(np.clip(np.quantile(y, 0.007), 0, 0.07))
    # White point: stretch only when the brightest 0.5% sits below 0.97,
    # at most 12%. LED cores that already clip keep it at 1.
    white = float(np.clip(np.quantile(peak, 0.995), 1 / 1.12, 1))
    white = 1.0 if white > 0.97 else white
    # Midtone: after levels the median moves up ~10% on dark footage and
    # toward 0.45 on normal footage, never more than a gamma of 0.8.
    median = float(np.median(y))
    leveled = (median - black) / (white - black)
    leveled = min(max(leveled, 0.02), 0.95)
    target = leveled * 1.12 if median < 0.25 else leveled + (0.45 - leveled) * 0.35
    target = min(max(target, 0.02), 0.95)
    gamma = float(np.clip(np.log(target) / np.log(leveled), 0.8, 1.15))
    # White balance on near-neutral midtones only (curtains, walls, floor,
    # sky), half strength, each channel within ±5%.
    chroma = peak - px.min(1)
    neutral = (y > 0.08) & (y < 0.85) & (chroma < 0.12)
    if neutral.sum() > 200:
        mean = px[neutral].mean(0)
        gains = np.clip((mean.mean() / mean) ** 0.5, 0.95, 1.05)
    else:
        gains = np.ones(3)
    # Vibrance: lift dull colour more than colour that is already strong.
    mid = (y > 0.06) & (y < 0.9)
    avg = float(chroma[mid].mean()) if mid.any() else 0.0
    saturation = float(np.clip(1 + (0.24 - avg) * 0.9, 1.0, 1.15))
    grade = {"black": black, "white": white, "gamma": gamma, "gains": [float(g) for g in gains],
             "saturation": saturation, "_stats": {"median": round(median, 3), "chroma": round(avg, 3)}}
    if strength != 1.0:
        grade = blend(grade, strength)
    return grade


def blend(grade, k):
    return {**grade, "black": grade["black"] * k, "white": 1 - (1 - grade["white"]) * k,
            "gamma": 1 + (grade["gamma"] - 1) * k, "gains": [1 + (g - 1) * k for g in grade["gains"]],
            "saturation": 1 + (grade["saturation"] - 1) * k}


def curve(v, grade, channel):
    x = np.clip((v * grade["gains"][channel] - grade["black"]) / (grade["white"] - grade["black"]), 0, 1)
    return x ** grade["gamma"]


def apply_proposed(rgb, grade):
    out = np.stack([curve(rgb[..., c], grade, c) for c in range(3)], -1)
    return np.clip(saturate(out, grade["saturation"]), 0, 1)


def proposed_auto_v2(frames, strength=1.0):
    """Clip-wide auto tone, tuned against InShot's Auto Adjust.

    Levels without brightening: blacks go to about half of the darkest
    0.5% (at most 0.08), the brightest 0.5% stretches toward white (at most
    12%), then a gamma puts the median back where it was plus 5% (12% on
    dark footage). Vibrance lifts dull colour. No white balance: InShot
    kept the source's colour temperature and a warming guess scored worse.
    """
    px = np.concatenate([_small(f, 240, 427 if f.shape[0] > f.shape[1] else 135).reshape(-1, 3) for f in frames]) / 255
    y = (px * LUMA).sum(1)
    peak = px.max(1)
    black = float(min(0.08, 0.55 * np.quantile(y, 0.005)))
    white = float(np.clip(np.quantile(peak, 0.995), 1 / 1.12, 1))
    white = 1.0 if white > 0.97 else white
    median = float(np.median(y))
    lift = 1.12 if median < 0.2 else 1.05
    leveled = min(max((median - black) / (white - black), 0.02), 0.95)
    target = min(max(median * lift, 0.02), 0.95)
    gamma = float(np.clip(np.log(target) / np.log(leveled), 0.75, 1.1))
    chroma = peak - px.min(1)
    mid = (y > 0.06) & (y < 0.9)
    avg = float(chroma[mid].mean()) if mid.any() else 0.0
    saturation = float(np.clip(1 + (0.26 - avg) * 0.9, 1.0, 1.15))
    grade = {"black": black, "white": white, "gamma": gamma, "gains": [1.0, 1.0, 1.0],
             "saturation": saturation, "_stats": {"median": round(median, 3), "chroma": round(avg, 3)}}
    if strength != 1.0:
        grade = blend(grade, strength)
    return grade


def slider_auto(frames):
    """The tuned Auto expressed with Post Studio's existing sliders.

    Brightness then contrast is a straight line, so pick the line that
    sends the black point to black and lifts the median 5% (12% on dark
    footage). Guard: never clip more than 1.5% of the picture's luma.
    """
    tone = proposed_auto_v2(frames)
    px = np.concatenate([_small(f, 240, 427 if f.shape[0] > f.shape[1] else 135).reshape(-1, 3) for f in frames]) / 255
    y = (px * LUMA).sum(1)
    black, m = tone["black"], tone["_stats"]["median"]
    lift = 1.12 if m < 0.2 else 1.05
    if black < 0.005:
        contrast = 1.0
        brightness = lift
    else:
        contrast = 1 + 2 * lift * black * m / (m - black)
        brightness = 0.5 * (1 - 1 / contrast) / black
    contrast = float(np.clip(contrast, 1, 1.3))
    brightness = float(np.clip(brightness, 0.9, 1.2))
    # Highlight guard: shrink the whole move until at most 1.5% of luma clips.
    q = float(np.quantile(y, 0.985))
    for _ in range(40):
        if (q * brightness - 0.5) * contrast + 0.5 <= 1.0:
            break
        brightness = 1 + (brightness - 1) * 0.9
        contrast = 1 + (contrast - 1) * 0.9
    return {"brightness": round(brightness, 2), "contrast": round(contrast, 2), "saturation": round(tone["saturation"], 2)}
