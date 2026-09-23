# Multi-grid Lettering Design

Status: rules approved by Austen, 2026-09-22 (see Decisions). No classifier,
dataframe or app change is part of this document; implementation is a
separate round.

Scope: Type 1 to Type 3 letters on the trigrid, the plain pentagrid and the
skewed pentagrid (ten points, one hand on each pentagon), checked against the
diamond and the shipped skewed diamond frame.

The old multi-grid sheets in the 2026 `Skews.ai` file (page 15 = sheet 06
"Tier 1 Pentagrid Skewed", page 16 = sheet 07 "Pentagrid Skews, Plus", page
21 = Tier 1 Trigrid, page 22 = Tier 1 Pentagrid) are unfinished drafts. They
skip classes, draw some classes twice, and include cells that do not belong
on the page. They are not a reference. This document letters every class by
rule, gives the complete catalog for each grid, and uses the sheets only to
show what the drafts got right, what they missed, and what the old labels
become. See `docs/reference/skew-notation.md` for the source list and the
modifier notation.

## Principle (approved)

Letters name shapes, not a minimal encoding. Every spacing with a leader keeps
the U/V split, and A B C and G H I exist only where the hands are exactly
opposite or exactly together.

This document extends the same idea to the opposite-direction families:
D E F and J K L exist only where the hands start or end exactly together or
exactly opposite.

## Terms

- `n`: points on the circle. Trigrid 3, diamond 4, pentagrid 5, skewed
  diamond 8 (two families of 4), skewed pentagrid 10 (two pentagons).
- Spacing: the smaller arc between the hands, 0 to 180 degrees.
- Relative angle `d`: red minus blue. Opposite-direction shifts move `d` by
  twice the shift, continuously over the beat, so `d` can pass through a
  placement that neither endpoint sits on.
- Landmarks: beta (`d` = 0, hands together) and alpha (`d` = 180, hands
  opposite). A pentagon has no antipode, but the relative angle still passes
  through 180 during an opposite-direction beat, so alpha is a landmark on
  every grid even where no static alpha placement exists.
- Leader: in a same-direction beat, the hand ahead in the direction of travel
  by the smaller arc. A leader exists only when the spacing is neither 0 nor 180.

## The rule

### Type 1, same direction

The spacing never changes.

| Spacing       | Letters                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------- |
| 180 (alpha)   | A B C: pro/pro, anti/anti, hybrid                                                         |
| 0 (beta)      | G H I: pro/pro, anti/anti, hybrid                                                         |
| anything else | S T: pro/pro, anti/anti. U V: hybrid, U when the leader is pro, V when the leader is anti |

### Type 1, opposite direction (landmark rule)

| Path of `d`                            | Letters |
| -------------------------------------- | ------- |
| starts at beta, or ends at alpha       | D E F   |
| ends at beta, or starts at alpha       | J K L   |
| crosses alpha strictly inside the beat | M N O   |
| crosses beta strictly inside the beat  | P Q R   |

Pro/pro, anti/anti and hybrid pick the member, as on the diamond. On the
diamond this is exactly D = beta to alpha, J = alpha to beta, M = gamma to
gamma through alpha, P = gamma to gamma through beta. Reversing a beat in
time swaps D and J and leaves M and P fixed, on every grid.

### Type 2, shift plus static

| Path of `d` after the start           | Letters |
| ------------------------------------- | ------- |
| reaches alpha (inside or at the end)  | W X     |
| reaches beta (inside or at the end)   | Y Z     |
| starts at alpha, or otherwise narrows | Σ Δ     |
| starts at beta, or otherwise widens   | Θ Ω     |

Pro takes the first letter, anti the second.

### Type 3, shift plus dash

Treat the dashing hand as static at its end point, apply the Type 2 rule, and
add the dash: W- X- Y- Z- Σ- Δ- Θ- Ω-. This reproduces both the diamond and
the shipped skewed-frame SHIFT_DASH table. Type 3 exists only where a dash
exists (an even number of points). On the skewed pentagrid a dash moves five
steps, so it always lands on the other pentagon, and the Type 3 classes
follow the plain pentagrid's Type 2 paths.

## Summary by grid

Counts are Type 1 to 3 classes up to rotation, mirror (which reverses travel)
and blue/red swap. `x2` means two classes that the rule gives the same
letter; they are numbered by start spacing, narrowest first (decision 3),
as in the catalogs below.

| Grid                               | Type 1 same           | Type 1 opposite               | Type 2                | Type 3              |
| ---------------------------------- | --------------------- | ----------------------------- | --------------------- | ------------------- |
| Trigrid (22)                       | G H I; S T U V        | D E F; J K L; P Q R           | W X; Y Z; Θ Ω         | none                |
| Diamond (38)                       | A B C; G H I; S T U V | D E F; J K L; M N O; P Q R    | all eight             | all eight           |
| Plain pentagrid (36)               | G H I; S T U V x2     | D E F; J K L; M N O x2; P Q R | W X; Y Z; Σ Δ; Θ Ω x2 | none                |
| Skewed diamond, shipped frame (36) | S T U V x2            | M N O x2; P Q R x2            | all eight             | all eight           |
| Skewed pentagrid (46)              | A B C; S T U V x2     | D E F; J K L; M N O; P Q R x2 | W X; Y Z; Σ Δ x2; Θ Ω | all eight, Θ- Ω- x2 |

Notes:

- The trigrid has no A B C, no M N O and no Σ Δ. Two hands 120 apart are
  never opposite at an endpoint; every opposite-direction path that crosses
  alpha starts or ends at beta; and a single shift from 120 either reaches
  beta or passes alpha.
- The plain pentagrid has no A B C (no antipode) and no Type 3 (no dash).
- The skewed pentagrid counts treat the two pentagons as interchangeable
  (decision 1). If filled and open counted as different, the 46 classes
  would become 80. The last column of its catalog shows how each class splits. A
  class splits only when something tells the two hands apart: a leader, or pro
  against anti. Opposite-direction pro/pro and anti/anti classes and the 180
  A and B never split.

## Complete catalogs

Generated by `python scripts/notation/multigrid-lettering-census.py --catalog`.
"Class" is the spacing path in degrees and any placement crossed strictly
inside the beat. For Type 2 and Type 3 it is the path with the non-shifting
hand held at its end point. "Near/far" is filled only where the shipped
skewed-frame rule would give a different letter (see "Why the landmark
rule and not near/far").
"Sheet" names the old cell that draws the class, or "not drawn".

### Trigrid: 22 classes, sheet page 21

| Letter | Type       | Motions     | Class                    | Near/far | Sheet     |
| ------ | ---------- | ----------- | ------------------------ | -------- | --------- |
| G      | 1 same     | pro/pro     | 0 to 0                   |          | G         |
| H      | 1 same     | anti/anti   | 0 to 0                   |          | H         |
| I      | 1 same     | pro/anti    | 0 to 0                   |          | I         |
| S      | 1 same     | pro/pro     | 120 to 120               |          | S         |
| T      | 1 same     | anti/anti   | 120 to 120               |          | T         |
| U      | 1 same     | pro/anti    | 120 to 120, pro leads    |          | U         |
| V      | 1 same     | pro/anti    | 120 to 120, anti leads   |          | V         |
| D      | 1 opposite | pro/pro     | 0 to 120 through alpha   |          | M         |
| E      | 1 opposite | anti/anti   | 0 to 120 through alpha   |          | N         |
| F      | 1 opposite | pro/anti    | 0 to 120 through alpha   |          | O         |
| J      | 1 opposite | pro/pro     | 120 to 0 through alpha   |          | J         |
| K      | 1 opposite | anti/anti   | 120 to 0 through alpha   |          | K         |
| L      | 1 opposite | pro/anti    | 120 to 0 through alpha   |          | L         |
| P      | 1 opposite | pro/pro     | 120 to 120 through beta  | J        | P         |
| Q      | 1 opposite | anti/anti   | 120 to 120 through beta  | K        | Q         |
| R      | 1 opposite | pro/anti    | 120 to 120 through beta  | L        | R         |
| W      | 2          | pro/static  | 120 to 120 through alpha |          | W         |
| X      | 2          | anti/static | 120 to 120 through alpha |          | X         |
| Y      | 2          | pro/static  | 120 to 0                 |          | Y         |
| Z      | 2          | anti/static | 120 to 0                 |          | Z         |
| Θ      | 2          | pro/static  | 0 to 120                 |          | not drawn |
| Ω      | 2          | anti/static | 0 to 120                 |          | not drawn |

### Pentagrid: 36 classes, sheet page 22

| Letter | Type       | Motions     | Class                    | Near/far | Sheet     |
| ------ | ---------- | ----------- | ------------------------ | -------- | --------- |
| G      | 1 same     | pro/pro     | 0 to 0                   |          | G         |
| H      | 1 same     | anti/anti   | 0 to 0                   |          | H         |
| I      | 1 same     | pro/anti    | 0 to 0                   |          | I         |
| S1     | 1 same     | pro/pro     | 72 to 72                 |          | S         |
| S2     | 1 same     | pro/pro     | 144 to 144               |          | A         |
| T1     | 1 same     | anti/anti   | 72 to 72                 |          | T         |
| T2     | 1 same     | anti/anti   | 144 to 144               |          | B         |
| U1     | 1 same     | pro/anti    | 72 to 72, pro leads      |          | U         |
| U2     | 1 same     | pro/anti    | 144 to 144, pro leads    |          | C1        |
| V1     | 1 same     | pro/anti    | 72 to 72, anti leads     |          | V         |
| V2     | 1 same     | pro/anti    | 144 to 144, anti leads   |          | C2        |
| D      | 1 opposite | pro/pro     | 0 to 144                 |          | D         |
| E      | 1 opposite | anti/anti   | 0 to 144                 |          | E         |
| F      | 1 opposite | pro/anti    | 0 to 144                 |          | F         |
| J      | 1 opposite | pro/pro     | 144 to 0                 |          | J         |
| K      | 1 opposite | anti/anti   | 144 to 0                 |          | K         |
| L      | 1 opposite | pro/anti    | 144 to 0                 |          | L         |
| M1     | 1 opposite | pro/pro     | 72 to 144 through alpha  | D        | M1        |
| M2     | 1 opposite | pro/pro     | 144 to 72 through alpha  |          | M2        |
| N1     | 1 opposite | anti/anti   | 72 to 144 through alpha  | E        | N1        |
| N2     | 1 opposite | anti/anti   | 144 to 72 through alpha  |          | N2        |
| O1     | 1 opposite | pro/anti    | 72 to 144 through alpha  | F        | O1        |
| O2     | 1 opposite | pro/anti    | 144 to 72 through alpha  |          | O2        |
| P      | 1 opposite | pro/pro     | 72 to 72 through beta    |          | P         |
| Q      | 1 opposite | anti/anti   | 72 to 72 through beta    |          | Q         |
| R      | 1 opposite | pro/anti    | 72 to 72 through beta    |          | R         |
| W      | 2          | pro/static  | 144 to 144 through alpha |          | W         |
| X      | 2          | anti/static | 144 to 144 through alpha |          | X         |
| Y      | 2          | pro/static  | 72 to 0                  |          | Y         |
| Z      | 2          | anti/static | 72 to 0                  |          | Z         |
| Σ      | 2          | pro/static  | 144 to 72                |          | Σ         |
| Δ      | 2          | anti/static | 144 to 72                |          | Δ         |
| Θ1     | 2          | pro/static  | 0 to 72                  |          | θ         |
| Θ2     | 2          | pro/static  | 72 to 144                |          | not drawn |
| Ω1     | 2          | anti/static | 0 to 72                  |          | Ω         |
| Ω2     | 2          | anti/static | 72 to 144                |          | not drawn |

### Skewed pentagrid: 46 classes, sheet page 15

"Distinct" is the number of classes this row would become if filled
and open pentagons counted as different (they do not; decision 1).

| Letter | Type       | Motions     | Class                    | Near/far | Sheet     | Distinct |
| ------ | ---------- | ----------- | ------------------------ | -------- | --------- | -------- |
| A      | 1 same     | pro/pro     | 180 to 180               |          | Al        | 1        |
| B      | 1 same     | anti/anti   | 180 to 180               |          | Bl        | 1        |
| C      | 1 same     | pro/anti    | 180 to 180               |          | C1l^x     | 2        |
| S1     | 1 same     | pro/pro     | 36 to 36                 |          | G         | 2        |
| S2     | 1 same     | pro/pro     | 108 to 108               |          | Af S      | 2        |
| T1     | 1 same     | anti/anti   | 36 to 36                 |          | H         | 2        |
| T2     | 1 same     | anti/anti   | 108 to 108               |          | Bf T      | 2        |
| U1     | 1 same     | pro/anti    | 36 to 36, pro leads      |          | I^x       | 2        |
| U2     | 1 same     | pro/anti    | 108 to 108, pro leads    |          | C1f_x U   | 2        |
| V1     | 1 same     | pro/anti    | 36 to 36, anti leads     |          | I_x       | 2        |
| V2     | 1 same     | pro/anti    | 108 to 108, anti leads   |          | V         | 2        |
| D      | 1 opposite | pro/pro     | 36 to 180                |          | D         | 1        |
| E      | 1 opposite | anti/anti   | 36 to 180                |          | E         | 1        |
| F      | 1 opposite | pro/anti    | 36 to 180                |          | F         | 2        |
| J      | 1 opposite | pro/pro     | 180 to 36                |          | M2        | 1        |
| K      | 1 opposite | anti/anti   | 180 to 36                |          | N2        | 1        |
| L      | 1 opposite | pro/anti    | 180 to 36                |          | O2        | 2        |
| M      | 1 opposite | pro/pro     | 108 to 108 through alpha |          | M1        | 1        |
| N      | 1 opposite | anti/anti   | 108 to 108 through alpha |          | N1        | 1        |
| O      | 1 opposite | pro/anti    | 108 to 108 through alpha |          | O1        | 2        |
| P1     | 1 opposite | pro/pro     | 36 to 108 through beta   |          | P         | 1        |
| P2     | 1 opposite | pro/pro     | 108 to 36 through beta   | J        | J         | 1        |
| Q1     | 1 opposite | anti/anti   | 36 to 108 through beta   |          | Q         | 1        |
| Q2     | 1 opposite | anti/anti   | 108 to 36 through beta   | K        | K         | 1        |
| R1     | 1 opposite | pro/anti    | 36 to 108 through beta   |          | R         | 2        |
| R2     | 1 opposite | pro/anti    | 108 to 36 through beta   | L        | L         | 2        |
| W      | 2          | pro/static  | 108 to 180               |          | not drawn | 2        |
| X      | 2          | anti/static | 108 to 180               |          | not drawn | 2        |
| Y      | 2          | pro/static  | 36 to 36 through beta    |          | Y         | 2        |
| Z      | 2          | anti/static | 36 to 36 through beta    |          | Z         | 2        |
| Σ1     | 2          | pro/static  | 108 to 36                |          | Σ         | 2        |
| Σ2     | 2          | pro/static  | 180 to 108               |          | W         | 2        |
| Δ1     | 2          | anti/static | 108 to 36                |          | Δ         | 2        |
| Δ2     | 2          | anti/static | 180 to 108               |          | X         | 2        |
| Θ      | 2          | pro/static  | 36 to 108                |          | θ         | 2        |
| Ω      | 2          | anti/static | 36 to 108                |          | Ω         | 2        |
| W-     | 3          | pro/dash    | 144 to 144 through alpha |          | not drawn | 2        |
| X-     | 3          | anti/dash   | 144 to 144 through alpha |          | not drawn | 2        |
| Y-     | 3          | pro/dash    | 72 to 0                  |          | not drawn | 2        |
| Z-     | 3          | anti/dash   | 72 to 0                  |          | not drawn | 2        |
| Σ-     | 3          | pro/dash    | 144 to 72                |          | not drawn | 2        |
| Δ-     | 3          | anti/dash   | 144 to 72                |          | not drawn | 2        |
| Θ1-    | 3          | pro/dash    | 0 to 72                  |          | not drawn | 2        |
| Θ2-    | 3          | pro/dash    | 72 to 144                |          | not drawn | 2        |
| Ω1-    | 3          | anti/dash   | 0 to 72                  |          | not drawn | 2        |
| Ω2-    | 3          | anti/dash   | 72 to 144                |          | not drawn | 2        |

## What the drafts get wrong

### Trigrid (page 21)

- Missing: Θ Ω, one hand static while the other shifts from beta to 120.
- Relabel: the sheet's M N O start together and end 120 apart, so they are
  D E F. The sheet has no D E F cells, so nothing else moves.
- Everything else is drawn once and keeps its letter.

### Pentagrid (page 22)

- Missing: Θ2 Ω2, from 72 to 144 (one hand static, widening without
  reaching alpha).
- Relabel: the sheet's A B C1 C2 are 144 apart and have a leader, so they are
  S2 T2 U2 V2 (144). C1 is pro leads (U2) and C2 is anti leads (V2), which
  is the U/V split the principle keeps. The sheet's S T U V (72) become
  S1 T1 U1 V1.
- The sheet's M1 N1 O1 (from 72) and M2 N2 O2 (from 144) keep their names.
- The sheet's θ Ω (from 0) become Θ1 Ω1; the missing pair is Θ2 Ω2.
- The three unlabeled static cells (144, 0 and 72) are Types 4 to 6 and out
  of scope here.

### Skewed pentagrid (page 15, sheet 06)

- Missing: W X (108 to 180, one hand static, ending opposite) and all ten
  Type 3 classes. The sheet has no dash cells at all.
- Drawn twice: the sheet's Af and S, Bf and T, and C1f_x and U are the same
  classes when the pentagons are interchangeable. They differ only in which
  pentagon the leader starts on.
- Not skewed-frame beats: C2l^x and C2f_x have both hands on one pentagon.
  They are the plain pentagrid's 144 V drawn on each pentagon.
- Relabel: G H I^x I_x become S1 T1 U1 V1 (36); Af Bf C1f_x and S T U V
  become S2 T2 U2 V2 (108); Al Bl C1l^x become A B C; M1 N1 O1 become M N
  O; M2 N2 O2 (starting opposite) become J K L; P Q R become P1 Q1 R1; the
  sheet's J K L (108 to 36 through beta) become P2 Q2 R2; Σ Δ become Σ1
  Δ1; the sheet's W X (starting opposite and narrowing) become Σ2 Δ2; θ is
  written Θ.
- Had filled and open counted as different, the sheet would draw 37 of 80
  classes and miss 43. Decision 1 makes that moot.

### What the old sheet 06 labels meant

Every sheet 06 cell except the two C2 cells is a page 22 letter with one hand
moved one step (36 degrees) forward along its own travel, onto the open
pentagon. Examples:

- Al is old A (144) with the leader moved forward to 180.
- Af is old A with the follower moved forward to 108.
- G H I are 0 with one hand moved to 36.
- S T U V are 72 with the leader moved to 108.
- D, M1, M2, P, W, Y, Σ and θ each shift their page 22 geometry by one step
  in the same way.

So the draft names each cell by the letter it came from, plus a mark for the
hand that moved:

- `l` or `f`: the leader or the follower moved.
- `^x` or `_x`: the pro hand or the anti hand moved.

This is the modifier convention in section 3 of `skew-notation.md`
(superscript = pro hand, subscript = anti hand, `l`/`f` = leading/following
hand), with `x` standing for a one-step skew in place of `+`. Under this
reading, C2 with the leader moved would be 180 with the anti hand on open
(mark `l_x`). C2 with the follower moved would be 108 anti leads with the
leader on filled (mark `f^x`). The draft shows neither.

Under the approved principle a cell is lettered by its own shape, which is
why most sheet 06 labels change. The derivation marks belong to modifier
notation.

### Pentagrid plus (page 16, sheet 07)

A plus beat starts on the plain pentagon and ends with one hand one step past
its endpoint. On the diamond such entries and exits keep their base letter
and carry the modifier (`scripts/generate-skewed-dataframe.ts` letters them
from the base row). Sheet 07 follows the same convention, so each cell's new
label is its page 22 base letter's new label with the mark kept. The page 16
artwork did not decode, so this table follows the printed labels, not a
geometric check, and it inherits page 22's gap: Θ2 Ω2 have no plus cells.

| Old                     | New                       |
| ----------------------- | ------------------------- |
| A+ B+                   | S2+ T2+                   |
| C1+ C1₊                 | U2+ U2₊                   |
| C2+ C2₊                 | V2+ V2₊                   |
| D+ E+ F+ F₊             | D+ E+ F+ F₊               |
| G+ H+ I+ I₊             | G+ H+ I+ I₊               |
| J+ K+ L+ L₊             | J+ K+ L+ L₊               |
| M1+ N1+ O1+ O1₊         | M1+ N1+ O1+ O1₊           |
| M2+ N2+ O2+ O2₊         | M2+ N2+ O2+ O2₊           |
| P+ Q+ R+ R₊             | P+ Q+ R+ R₊               |
| Sl+ Sf+ Tl+ Tf+         | S1l+ S1f+ T1l+ T1f+       |
| U+ U₊ V+ V₊             | U1+ U1₊ V1+ V1₊           |
| W+ X+ Y+ Z+ Σ+ Δ+ θ+ Ω+ | W+ X+ Y+ Z+ Σ+ Δ+ Θ1+ Ω1+ |

The last R cell is printed `R+` twice; the second is read as `R₊`. As S2 and
T2, the old A and B have a leader, so under section 3 they need `l`/`f`
marks. The sheet draws one cell each, so one of S2l+ / S2f+ and one of
T2l+ / T2f+ is missing, and which one is drawn cannot be read from the
labels.

## Why the landmark rule and not near/far

The shipped skewed-frame classifier (`OPPOSITE_FAMILIES` in
`src/lib/shared/pictograph/skew/skewed-frame-letter.ts`) uses a different rule.
Written for any grid it reads: take the last landmark reached after the start.
Alpha gives D E F when the start spacing is under 90, otherwise M N O. Beta
gives J K L when the start spacing is over 90, otherwise P Q R. If no landmark
is reached after the start, a beta start gives D E F and an alpha start gives
J K L. Call this the near/far rule.

Both rules give the same letters on the diamond. They differ here:

| Grid             | Class                   | Landmark rule | Near/far rule   |
| ---------------- | ----------------------- | ------------- | --------------- |
| Trigrid          | 120 through beta to 120 | P Q R         | J K L           |
| Plain pentagrid  | 72 through alpha to 144 | M N O         | D E F           |
| Skewed diamond   | 45 through alpha to 135 | M N O         | D E F (shipped) |
| Skewed diamond   | 135 through beta to 45  | P Q R         | J K L (shipped) |
| Skewed pentagrid | 108 through beta to 36  | P Q R         | J K L           |

The drafts do not settle this: page 22's M1 and the trigrid's P follow the
landmark rule, and sheet 06's J follows near/far.

For the landmark rule:

- It is the approved principle applied once more. D E F and J K L need an
  exact pure placement at an endpoint, just as A B C and G H I do.
- Time reversal behaves the same on every grid: it swaps D and J and fixes M
  and P. Under near/far, reversal swaps D with J on the diamond but D with M
  and J with P on the skewed diamond.
- Near/far depends on which side of 90 degrees the start spacing falls. That
  threshold has no placement behind it on the trigrid or pentagrids.

Against it:

- It reopens decision 2 of
  `docs/superpowers/specs/2026-09-21-skewed-frame-lettering-design.md`.
  128 of the 1024 shipped category 3 rows in `SkewedPictographDataframe.csv`
  would change: D to M 16, E to N 16, F to O 32, J to P 16, K to Q 16, L to R 32.
  The skewed diamond frame would then use only M N O and P Q R for opposite
  shifts.

Austen chose the landmark rule (decision 4).

## Trigrid dataframe discrepancy (report only, not fixed)

`static/data/pictographs/TrigridPictographDataframe.csv` (189 rows, points n,
se, sw) disagrees with the catalog:

- Its J is beta to gamma, which the catalog calls D.
- Its M is gamma to gamma, opposite direction, which the catalog calls P.
- Its P Q R duplicate S T U as same-direction rows.
- Its V duplicates M as an opposite-direction row.
- I has one hybrid only.
- There is no gamma to beta opposite-direction row (the catalog's J).

The file is read only by `src/lib/features/lab/trigrid-lab`. It should be
regenerated from the approved catalog.

## Evidence

`scripts/notation/multigrid-lettering-census.py` enumerates every beat on
each grid (static, pro/anti shift, and a dash where the point count is even),
reduces to classes, applies both opposite-direction rules and checks them
against the shipped data. It also holds the decoded cells of pages 15, 21 and
22 and prints the catalogs above. Run from the repository root:

```
python scripts/notation/multigrid-lettering-census.py
python scripts/notation/multigrid-lettering-census.py --classes
python scripts/notation/multigrid-lettering-census.py --catalog
```

Result on 2026-09-22:

- `DiamondPictographDataframe.csv`, all 512 Type 1 to 3 rows: both rules match.
- `SkewedPictographDataframe.csv`, the 1024 Type 1 to 3 rows of category 3:
  near/far matches all of them; the landmark rule differs on 128, listed above.
- The Type 2 and Type 3 rules match every row in both files.

The sheet cells were decoded from the vector artwork (grid dots, prop bars,
arrow tails and arrow-head shapes) and checked by eye against renders. The
page 15 X cell's red arrow has an ambiguous hooked tail and is read as the
same geometry as W.

The Flow Arts MCP server (`tka-domain-local`) failed to connect during this
work. Letter facts were checked against the dataframes and the classifier
instead of the MCP.

## Decisions (2026-09-22)

1. Filled versus open pentagon does not change the letter. Like diamond versus
   box, it is a grid mode. The skewed pentagrid has 46 Type 1 to 3 classes.
2. The decode of the sheet 06 marks is correct: `l`/`f` name the leader or
   follower and `^x`/`_x` the pro or anti hand that was moved one step. The
   marks are modifier notation, not part of the letter.
3. A letter that occurs at more than one start spacing on a grid is numbered
   by start spacing, narrowest first: S1 T1 U1 V1 at 72 and S2 T2 U2 V2 at
   144 on the pentagrid, M1 from 72 and M2 from 144, and so on. A modifier
   follows the number (S2l+, U2₊). A dash letter puts the number before the
   dash (Θ1-). The same numbering applies to the skewed diamond frame,
   where S T U V occur at 45 and 135 and, under decision 4, M N O and P Q R
   each occur from both; the shipped classifier does not number them yet.
4. Opposite-direction shifts use the landmark rule. This reverses decision 2
   of `docs/superpowers/specs/2026-09-21-skewed-frame-lettering-design.md`
   for the skewed diamond frame: the 128 category 3 rows listed above move
   from D E F / J K L to M N O / P Q R when the classifier is updated.
