"""Ranks every spin by how far the hand strays from its drawn path.

Reads out-p*.json from sweep.ts (run from the folder holding them). A spin's
number at a setting is its worst case over all 8 hand paths.
"""
import glob
import json

P = json.load(open('out-p1.json'))['params']
rows = []
for f in sorted(glob.glob('out-p*.json')):
    rows += json.load(open(f))['rows']

HARD = 0.35   # metres; matches HARD_STRAY_METRES in poi-string-check.ts
LOOSE = 0.2   # poi weights; matches LOOSE_TENSION
SHAPE = {P[i]['handRadius']: i for i in range(len(P)) if not P[i]['gravity']}
FULL = [i for i in range(len(P)) if P[i]['gravity']]


def back(side, m):
    return ('pro' if m == 'anti' else 'anti') if side == 'left' else m


def name(side, m, on, th):
    t = lambda v: f"{v:g}"
    if side == 'left':
        return f"{m.title()} {t(on)} → {back(side, m).title()} {t(th)}"
    return f"{m.title()} {t(on)}" if on == th else f"{m.title()} {t(on)} → {m.title()} {t(th)}"


worst = {}
for r in rows:
    k = (r['side'], r['motion'], r['on'], r['third'])
    cur = worst.get(k)
    res = [x if x is not None else [9, 0] for x in r['res']]
    worst[k] = res if cur is None else [
        [max(a[0], b[0]), min(a[1], b[1])] for a, b in zip(cur, res)]


def slowest(res, radius):
    ok = [P[i]['bpm'] for i in FULL if P[i]['handRadius'] == radius
          and res[i][0] <= HARD and res[i][1] >= LOOSE]
    return min(ok) if ok else None


out = []
for k, res in worst.items():
    out.append(dict(side=k[0], key=k, name=name(*k),
                    shape={r: res[i][0] for r, i in SHAPE.items()},
                    slowest={r: slowest(res, r) for r in SHAPE}))

cm = lambda m: f"{round(m * 100)} cm"
tempo = lambda b: f"{b} bpm" if b else "none up to 240"
for side in ['left', 'right']:
    L = sorted([o for o in out if o['side'] == side], key=lambda o: o['shape'][0.6])
    bands = [sum(1 for o in L if lo < o['shape'][0.6] <= hi)
             for lo, hi in [(-1, 0.15), (0.15, HARD), (HARD, 99)]]
    print(f"\n=== {side} hand, {len(L)} spins; shape stray at a 0.6 m circle: "
          f"{bands[0]} within 15 cm, {bands[1]} 15–35 cm, {bands[2]} over 35 cm")
    print("| Spin | Shape stray, 0.3 m circle | 0.6 m | 0.9 m | Slowest tempo, hand within 35 cm (0.6 m circle) |")
    print("| --- | --- | --- | --- | --- |")
    for o in L:
        print(f"| {o['name']} | {cm(o['shape'][0.3])} | {cm(o['shape'][0.6])} | "
              f"{cm(o['shape'][0.9])} | {tempo(o['slowest'][0.6])} |")
json.dump(out, open('ranking.json', 'w'), default=str)

print("\n=== Gage's chart, worst over its 8 paths")
LC = {'Anti 1 → Pro 0': ('left', 'anti', 1, 0), 'Pro 0 → Anti 1': ('left', 'pro', 0, 1),
      'Pro 1 → Anti 1': ('left', 'pro', 1, 1)}
RC = {'Anti 1': ('right', 'anti', 1, 1), 'Pro 0': ('right', 'pro', 0, 0),
      'Pro 1 → Pro 0': ('right', 'pro', 1, 0)}
at = next(i for i in FULL if P[i]['bpm'] == 180 and P[i]['handRadius'] == 0.6)
print("| Left hand | Right hand | Hand stray at 180 bpm, 0.6 m circle | Slowest tempo, both within 35 cm |")
print("| --- | --- | --- | --- |")
for ln, l in LC.items():
    for rn, r in RC.items():
        s = max(worst[l][at][0], worst[r][at][0])
        a, b = slowest(worst[l], 0.6), slowest(worst[r], 0.6)
        both = max(a, b) if a and b else None
        print(f"| {ln} | {rn} | {cm(s)} | {tempo(both)} |")
