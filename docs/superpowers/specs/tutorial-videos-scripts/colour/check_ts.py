import numpy as np, io, contextlib, json
with contextlib.redirect_stdout(io.StringIO()):
    import audit_inshot as A
from grades import css_filter, LUMA
ts = json.load(open(A.OUT + "ts-grades.json", encoding="utf8"))
g = next(r["grade"] for r in ts if r["id"].endswith("main-1") and r["seq"] == "ΩΛ-XJ")
d = A.delta_e(css_filter(A.src, g), A.exp)
print("ΩΛ-XJ run-through, shipped values", g, "vs InShot: median %.2f p90 %.2f mean %.2f" % (np.median(d), np.quantile(d, .9), d.mean()))
for r in ts:
    it = r
    path = "E:/tka-platform/static/word-videos/inshot-recovery/" + {"inshot-1790713086932-main-1": "camera-cut-1.mp4", "inshot-1790713086932-main-2": "camera-cut-2.mp4", "dck-main-1": "dck-cut-1.mp4", "dck-main-2": "dck-cut-2.mp4", "video-1": "woods-cut-1.mp4", "woods-main-2": "woods-cut-2.mp4"}[r["id"]]
    items = json.load(open(A.OUT + "items.json", encoding="utf8"))
    src = next(i for i in items if i["id"] == r["id"])
    frames = [A.frame(path, src["sourceIn"] + (src["sourceOut"] - src["sourceIn"]) * f).astype(np.float64) / 255 for f in (0.15, 0.5, 0.85)]
    y = np.concatenate([(f * LUMA).sum(-1).ravel() for f in frames])
    gr = r["grade"]
    out = (y * gr["brightness"] - 0.5) * gr["contrast"] + 0.5
    newly = ((out > 1) & (y < 0.999)).mean()
    print(f"{r['seq']:6s} {r['id']:30s} newly clipped luma {newly*100:.2f}%  already clipped {(y >= 0.999).mean()*100:.2f}%  median {np.median(y):.3f} -> {np.median(np.clip(out,0,1)):.3f}")
