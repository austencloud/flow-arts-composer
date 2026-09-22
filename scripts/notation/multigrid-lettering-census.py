"""Multi-grid lettering census.

Enumerates every two-hand beat on the trigrid, diamond, pentagrid, skewed
diamond (one hand on each 4-point family) and skewed pentagrid (one hand on
each pentagon), groups the beats into classes up to rotation, mirror and
blue/red swap, and letters each class with the rules proposed in
docs/superpowers/specs/2026-09-22-multigrid-lettering-design.md.

It then checks those rules against the two shipped dataframes:
  - DiamondPictographDataframe.csv (every Type 1-3 row)
  - SkewedPictographDataframe.csv, category 3 (the skewed-frame classifier)

Run from the repository root:
    python scripts/notation/multigrid-lettering-census.py
    python scripts/notation/multigrid-lettering-census.py --classes   # list every class

Research tool only. Nothing in the app imports it.
"""
from __future__ import annotations

import csv
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "static" / "data" / "pictographs"

PRO, ANTI, STATIC, DASH = "pro", "anti", "static", "dash"


@dataclass(frozen=True)
class Grid:
    name: str
    points: int  # points on the circle, evenly spaced
    shift: int  # steps a pro/anti motion moves
    mixed: bool  # hands must start on different sub-grids (parity differs)
    distinct: bool = False  # sub-grids are not interchangeable (no odd rotations)

    @property
    def step_deg(self) -> Fraction:
        return Fraction(360, self.points)

    @property
    def dash(self) -> int | None:
        return self.points // 2 if self.points % 2 == 0 else None


GRIDS = [
    Grid("trigrid", 3, 1, False),
    Grid("diamond", 4, 1, False),
    Grid("pentagrid", 5, 1, False),
    Grid("skewed diamond", 8, 2, True),
    Grid("skewed pentagrid, pentagons interchangeable", 10, 2, True),
    Grid("skewed pentagrid, pentagons distinct", 10, 2, True, distinct=True),
]

# A hand is (start, delta, motion). A beat is (blue, red).


def hand_moves(grid: Grid):
    yield 0, STATIC
    for delta in (grid.shift, -grid.shift):
        yield delta, PRO
        yield delta, ANTI
    if grid.dash is not None:
        yield grid.dash, DASH


def all_beats(grid: Grid):
    n = grid.points
    for b in range(n):
        for r in range(n):
            if grid.mixed and (b - r) % 2 == 0:
                continue
            for bd, bm in hand_moves(grid):
                for rd, rm in hand_moves(grid):
                    yield ((b, bd, bm), (r, rd, rm))


def transforms(grid: Grid):
    n = grid.points
    for sign in (1, -1):
        for k in range(n):
            if grid.distinct and k % 2:
                continue
            yield sign, k


def apply(grid: Grid, beat, sign, k, swap):
    n = grid.points
    hands = [((sign * s + k) % n, (sign * d) % n, m) for s, d, m in beat]
    if swap:
        hands.reverse()
    return tuple(hands)


def canonical(grid: Grid, beat):
    return min(
        apply(grid, beat, sign, k, swap)
        for sign, k in transforms(grid)
        for swap in (False, True)
    )


def signed(grid: Grid, steps: int) -> int:
    """Steps reduced to (-n/2, n/2]."""
    n = grid.points
    steps %= n
    return steps - n if steps * 2 > n else steps


def spacing_deg(grid: Grid, rel: Fraction) -> Fraction:
    n = grid.points
    r = rel % n
    return min(r, n - r) * grid.step_deg


def landmarks(grid: Grid, d0: Fraction, d1: Fraction):
    """Pure placements the relative angle touches, as (t, name) sorted by time.

    rel = red minus blue, in steps. Beta is rel = 0 mod n, alpha is
    rel = n/2 mod n. The path runs linearly from d0 to d1.
    """
    n = grid.points
    half = Fraction(n, 2)
    out = []
    if d0 == d1:
        return out
    lo, hi = min(d0, d1), max(d0, d1)
    m = (lo // half) - 1
    while m * half <= hi + half:
        v = m * half
        if lo <= v <= hi:
            t = (v - d0) / (d1 - d0)
            out.append((t, "beta" if (v % n) == 0 else "alpha"))
        m += 1
    return sorted(set(out))


def at_landmark(grid: Grid, d: Fraction):
    n = grid.points
    if d % n == 0:
        return "beta"
    if (d * 2) % n == 0:
        return "alpha"
    return None


def pick(triple, bm, rm):
    if bm == rm:
        return triple[0] if bm == PRO else triple[1]
    return triple[2]


# ---------------------------------------------------------------- the rules


def leader(grid: Grid, beat):
    """'blue', 'red' or None. Same-direction travel only."""
    (b, bd, _), (r, _, _) = beat
    ahead = (r - b) % grid.points  # red clockwise from blue
    if ahead == 0 or ahead * 2 == grid.points:
        return None
    travel = signed(grid, bd)
    red_ahead = ahead * 2 < grid.points if travel > 0 else ahead * 2 > grid.points
    return "red" if red_ahead else "blue"


def same_direction_letter(grid: Grid, beat):
    (b, _, bm), (r, _, rm) = beat
    place = at_landmark(grid, Fraction(r - b))
    if place == "alpha":
        return pick("ABC", bm, rm)
    if place == "beta":
        return pick("GHI", bm, rm)
    if bm == rm:
        return "S" if bm == PRO else "T"
    lead = leader(grid, beat)
    lead_motion = bm if lead == "blue" else rm
    return "U" if lead_motion == PRO else "V"


def opposite_path(grid: Grid, beat):
    (b, bd, _), (r, rd, _) = beat
    d0 = Fraction(signed(grid, r - b))
    d1 = d0 + signed(grid, rd) - signed(grid, bd)
    return d0, d1


def opposite_letter_landmark(grid: Grid, beat):
    """Proposed rule: D E F and J K L only where the hands start or end at a
    pure placement; otherwise the placement they pass picks M N O or P Q R."""
    (_, _, bm), (_, _, rm) = beat
    d0, d1 = opposite_path(grid, beat)
    start, end = at_landmark(grid, d0), at_landmark(grid, d1)
    if start == "beta" or end == "alpha":
        return pick("DEF", bm, rm)
    if end == "beta" or start == "alpha":
        return pick("JKL", bm, rm)
    crossed = {name for t, name in landmarks(grid, d0, d1) if 0 < t < 1}
    if crossed == {"beta"}:
        return pick("PQR", bm, rm)
    if crossed == {"alpha"}:
        return pick("MNO", bm, rm)
    return None


def opposite_letter_near_far(grid: Grid, beat):
    """The shipped skewed-frame rule written for any grid: the last pure
    placement reached after the start, and whether the start spacing is on
    that placement's side of 90 degrees."""
    (_, _, bm), (_, _, rm) = beat
    d0, d1 = opposite_path(grid, beat)
    reached = [name for t, name in landmarks(grid, d0, d1) if t > 0]
    s0 = spacing_deg(grid, d0)
    if not reached:
        start = at_landmark(grid, d0)
        if start == "beta":
            return pick("DEF", bm, rm)
        if start == "alpha":
            return pick("JKL", bm, rm)
        return None
    if reached[-1] == "alpha":
        return pick("DEF" if s0 < 90 else "MNO", bm, rm)
    return pick("JKL" if s0 > 90 else "PQR", bm, rm)


TYPE2 = {"W": ("W", "X"), "Y": ("Y", "Z"), "S": ("Σ", "Δ"), "T": ("Θ", "Ω")}


def type2_family(grid: Grid, mover_start, mover_delta, still):
    """W X reach alpha, Y Z reach beta, Σ Δ leave alpha or narrow,
    Θ Ω leave beta or widen."""
    d0 = Fraction(signed(grid, still - mover_start))
    d1 = d0 - signed(grid, mover_delta)
    reached = {name for t, name in landmarks(grid, d0, d1) if t > 0}
    if "alpha" in reached:
        return "W"
    if "beta" in reached:
        return "Y"
    start = at_landmark(grid, d0)
    if start == "alpha":
        return "S"
    if start == "beta":
        return "T"
    return "S" if spacing_deg(grid, d1) < spacing_deg(grid, d0) else "T"


def letter(grid: Grid, beat):
    (b, bd, bm), (r, rd, rm) = beat
    shifts = [m in (PRO, ANTI) for m in (bm, rm)]
    if all(shifts):
        if signed(grid, bd) == signed(grid, rd):
            return same_direction_letter(grid, beat)
        return opposite_letter_landmark(grid, beat)
    if any(shifts):
        mover, partner = (beat[0], beat[1]) if shifts[0] else (beat[1], beat[0])
        still = (partner[0] + partner[1]) % grid.points  # a dash counts at its end point
        fam = TYPE2[type2_family(grid, mover[0], mover[1], still)]
        base = fam[0] if mover[2] == PRO else fam[1]
        return base + ("-" if partner[2] == DASH else "")
    return None  # Types 4-6 are out of scope


def kind(beat):
    (_, bd, bm), (_, rd, rm) = beat
    moving = [m in (PRO, ANTI) for m in (bm, rm)]
    if all(moving):
        return "type 1 same" if bd == rd else "type 1 opposite"
    if any(moving):
        partner = rm if moving[0] else bm
        return "type 2" if partner == STATIC else "type 3"
    return "types 4-6"


def describe(grid: Grid, beat):
    (b, bd, bm), (r, rd, rm) = beat
    d0 = Fraction(signed(grid, r - b))
    end_rel = Fraction(signed(grid, (r + rd) - (b + bd)))
    parts = [f"{spacing_deg(grid, d0)}->{spacing_deg(grid, end_rel)}"]
    k = kind(beat)
    if k == "type 1 same":
        lead = leader(grid, beat)
        if lead:
            lm = bm if lead == "blue" else rm
            parts.append(f"{lm} leads")
            if grid.mixed:
                pent = "filled" if (b if lead == "blue" else r) % 2 == 0 else "open"
                parts.append(f"leader on {pent}")
        if grid.mixed and bm != rm:
            pro_start = b if bm == PRO else r
            parts.append("pro on " + ("filled" if pro_start % 2 == 0 else "open"))
    if k == "type 1 opposite":
        d0, d1 = opposite_path(grid, beat)
        marks = ", ".join(f"{name}@t={t}" for t, name in landmarks(grid, d0, d1))
        parts.append(f"touches [{marks}]")
        if grid.mixed and bm != rm:
            pro_start = b if bm == PRO else r
            parts.append("pro on " + ("filled" if pro_start % 2 == 0 else "open"))
    motions = "/".join(sorted({bm, rm})) if bm == rm or {bm, rm} <= {PRO, ANTI} else f"{bm}+{rm}"
    return f"{motions}: " + "; ".join(parts)


def census(show_classes: bool):
    for grid in GRIDS:
        classes = {}
        for beat in all_beats(grid):
            classes.setdefault(canonical(grid, beat), beat)
        by_kind = defaultdict(list)
        for beat in classes.values():
            by_kind[kind(beat)].append(beat)
        print(f"\n=== {grid.name}: {len(classes)} classes")
        for k in ("type 1 same", "type 1 opposite", "type 2", "type 3"):
            beats = by_kind.get(k, [])
            letters = Counter(letter(grid, b) for b in beats)
            summary = " ".join(f"{l}x{c}" if c > 1 else str(l) for l, c in sorted(letters.items(), key=str))
            print(f"  {k}: {len(beats)} classes -> {summary or '(none)'}")
            if k == "type 1 opposite" and beats:
                disagree = [b for b in beats if opposite_letter_landmark(grid, b) != opposite_letter_near_far(grid, b)]
                if disagree:
                    print(f"    near/far rule disagrees on {len(disagree)}:")
                    for b in sorted(disagree, key=lambda b: describe(grid, b)):
                        print(f"      {describe(grid, b)}  landmark={opposite_letter_landmark(grid, b)}  near/far={opposite_letter_near_far(grid, b)}")
            if show_classes:
                for b in sorted(beats, key=lambda b: (str(letter(grid, b)), describe(grid, b))):
                    print(f"      {letter(grid, b):3} {describe(grid, b)}")


# ------------------------------------------------------------- validations

DIAMOND_INDEX = {"n": 0, "e": 1, "s": 2, "w": 3}
EIGHT_INDEX = {"n": 0, "ne": 1, "e": 2, "se": 3, "s": 4, "sw": 5, "w": 6, "nw": 7}


def row_beat(grid: Grid, row, index):
    hands = []
    for color in ("blue", "red"):
        s = index[row[f"{color}StartLocation"]]
        e = index[row[f"{color}EndLocation"]]
        hands.append((s, (e - s) % grid.points, row[f"{color}MotionType"]))
    return tuple(hands)


def validate(path: Path, grid: Grid, index, row_filter, rules):
    rows = [r for r in csv.DictReader(path.open(encoding="utf-8")) if row_filter(r)]
    for name, rule in rules.items():
        checked, wrong = 0, Counter()
        for row in rows:
            beat = row_beat(grid, row, index)
            if kind(beat) == "types 4-6":
                continue
            got = rule(grid, beat)
            checked += 1
            if got != row["letter"]:
                wrong[(row["letter"], got)] += 1
        status = "all match" if not wrong else f"{sum(wrong.values())} differ {dict(wrong)}"
        print(f"  {path.name} [{name}]: {checked} rows, {status}")


def opposite_only(rule):
    def wrapped(grid, beat):
        if kind(beat) == "type 1 opposite":
            return rule(grid, beat)
        return letter(grid, beat)
    return wrapped


def main():
    census("--classes" in sys.argv)
    print("\n=== validation against shipped dataframes")
    diamond = GRIDS[1]
    skewed8 = GRIDS[3]
    rules = {
        "proposed rules": letter,
        "opposite by near/far": opposite_only(opposite_letter_near_far),
    }
    validate(DATA / "DiamondPictographDataframe.csv", diamond, DIAMOND_INDEX, lambda r: True, rules)
    validate(DATA / "SkewedPictographDataframe.csv", skewed8, EIGHT_INDEX, lambda r: r["category"] == "3", rules)


if __name__ == "__main__":
    main()
