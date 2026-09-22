# Multi-grid Lettering Design

Status: proposed, 2026-09-22. Awaiting Austen's answers to the open questions
at the end. No classifier, dataframe or app change is part of this document.

Scope: Type 1 to Type 3 letters on the trigrid, the plain pentagrid and the
skewed pentagrid (ten points, one hand on each pentagon), checked against the
diamond and the shipped skewed diamond frame. Sources are the 2026 `Skews.ai`
artboards (page 15 = sheet 06 "Tier 1 Pentagrid Skewed", page 16 = sheet 07
"Pentagrid Skews, Plus", page 21 = Trigrid, page 22 = Tier 1 Pentagrid) and
the two shipped dataframes. See `docs/reference/skew-notation.md` for the
source list and the modifier notation.

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

### Type 1, opposite direction (proposed landmark rule)

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
steps, so it always lands on the other pentagon.

## Per-grid letter table

Counts are classes up to rotation, mirror (which reverses travel) and
blue/red swap. `x2` means two classes that the rule gives the same letter; see
open question 3 for how to tell them apart. Degrees are spacings.

| Grid                                        | Type 1 same                          | Type 1 opposite                                                                                                   | Type 2                                                                                  | Type 3                  |
| ------------------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------- |
| Trigrid                                     | G H I (0); S T U V (120)             | D E F (0 through alpha to 120); J K L (120 through alpha to 0); P Q R (120 through beta to 120)                   | W X (120 through alpha); Y Z (120 to 0); Θ Ω (0 to 120)                                 | none                    |
| Diamond                                     | A B C; G H I; S T U V                | D E F; J K L; M N O; P Q R                                                                                        | W X Y Z Σ Δ Θ Ω                                                                         | all eight               |
| Plain pentagrid                             | G H I (0); S T U V x2 (72 and 144)   | D E F (0 to 144); J K L (144 to 0); M N O x2 (72 to 144 and 144 to 72, through alpha); P Q R (72 through beta)    | W X (144 through alpha); Y Z (72 to 0); Σ Δ (144 to 72); Θ Ω x2 (0 to 72 and 72 to 144) | none                    |
| Skewed diamond (shipped frame)              | S T U V x2 (45 and 135)              | M N O x2; P Q R x2                                                                                                | all eight                                                                               | all eight               |
| Skewed pentagrid, pentagons interchangeable | A B C (180); S T U V x2 (36 and 108) | D E F (36 to 180); J K L (180 to 36); M N O (108 through alpha); P Q R x2 (36 to 108 and 108 to 36, through beta) | W X; Y Z; Σ Δ x2 (180 to 108 and 108 to 36); Θ Ω                                        | all eight, Θ- and Ω- x2 |
| Skewed pentagrid, pentagons distinct        | 20 classes: A B, C x2, S T U V x4    | 20 classes: D E, F x2, J K, L x2, M N, O x2, P Q x2, R x4                                                         | 20 classes                                                                              | 20 classes              |

Notes on the table:

- The trigrid has no A B C, no M N O and no Σ Δ. Two hands 120 apart are
  never opposite at an endpoint; every opposite-direction path that crosses
  alpha starts or ends at beta; and a single shift from 120 either reaches
  beta or passes alpha.
- The plain pentagrid has no A B C (no antipode) and no Type 3 (no dash).
- On the skewed pentagrid, opposite-direction hybrids never split when the
  pentagons are interchangeable, because reflecting across the hands'
  bisector swaps the pentagons. They split by the pro hand's pentagon only when
  the pentagons are distinct. The same holds for the 180 hybrid C.

## Choice between two opposite-direction rules

The shipped skewed-frame classifier (`OPPOSITE_FAMILIES` in
`src/lib/shared/pictograph/skew/skewed-frame-letter.ts`) uses a different rule.
Written for any grid it reads: take the last landmark reached after the start.
Alpha gives D E F when the start spacing is under 90, otherwise M N O. Beta
gives J K L when the start spacing is over 90, otherwise P Q R. If no landmark
is reached after the start, a beta start gives D E F and an alpha start gives
J K L. Call this the near/far rule.

Both rules give the same letters on the diamond. They differ here:

| Grid             | Class                   | Landmark rule | Near/far rule   | Sheet    |
| ---------------- | ----------------------- | ------------- | --------------- | -------- |
| Trigrid          | 120 through beta to 120 | P Q R         | J K L           | P        |
| Plain pentagrid  | 72 through alpha to 144 | M N O         | D E F           | M1       |
| Skewed diamond   | 45 through alpha to 135 | M N O         | D E F (shipped) | no sheet |
| Skewed diamond   | 135 through beta to 45  | P Q R         | J K L (shipped) | no sheet |
| Skewed pentagrid | 108 through beta to 36  | P Q R         | J K L           | J        |

For the landmark rule:

- It is the approved principle applied once more. D E F and J K L need an
  exact pure placement at an endpoint, just as A B C and G H I do.
- Time reversal behaves the same on every grid: it swaps D and J and fixes M
  and P. Under near/far, reversal swaps D with J on the diamond but D with M
  and J with P on the skewed diamond.
- It matches every opposite-direction cell on page 22, including M1, which
  near/far renames to D.

Against it:

- It reopens decision 2 of
  `docs/superpowers/specs/2026-09-21-skewed-frame-lettering-design.md`.
  128 of the 1024 shipped category 3 rows in `SkewedPictographDataframe.csv`
  would change: D to M 16, E to N 16, F to O 32, J to P 16, K to Q 16, L to R 32.
  The skewed diamond frame would then use only M N O and P Q R for opposite
  shifts.
- Sheet 06's J cell (108 through beta to 36) follows near/far, not the
  landmark rule. The landmark rule matches page 22 M1 and trigrid P, which
  near/far does not. Sheet 06's M2 cell and the trigrid sheet's M cell follow
  neither rule, so no rule reproduces every old label.

Recommendation: the landmark rule.

## Sheet 06 (page 15, Tier 1 Pentagrid Skewed): old label to new letter

Every cell was decoded from the vector artwork (dots, rings, prop bars, arrow
shapes) and put through the rules by `mapcells.py`, a research script in the
session scratchpad that imports the census module. Degrees are start to end
spacing. "Leader on filled/open" means the leading hand's pentagon.

| Old      | Geometry                                  | Landmark rule | Near/far |
| -------- | ----------------------------------------- | ------------- | -------- |
| Al       | 180, pro/pro                              | A             | A        |
| Bl       | 180, anti/anti                            | B             | B        |
| C1l^x    | 180, hybrid, pro on open                  | C             | C        |
| Af       | 108, pro/pro, leader on filled            | S             | S        |
| Bf       | 108, anti/anti, leader on filled          | T             | T        |
| C1f_x    | 108, pro leads, leader on filled          | U             | U        |
| C2l^x    | 144, anti leads, both hands on open       | V (see below) | V        |
| C2f_x    | 144, anti leads, both hands on filled     | V (see below) | V        |
| D E F    | 36 to 180                                 | D E F         | D E F    |
| G H      | 36, pro/pro and anti/anti, leader on open | S T           | S T      |
| I^x      | 36, pro leads, leader on open             | U             | U        |
| I_x      | 36, anti leads, leader on open            | V             | V        |
| J K L    | 108 through beta to 36                    | P Q R         | J K L    |
| M1 N1 O1 | 108 through alpha to 108                  | M N O         | M N O    |
| M2 N2 O2 | 180 to 36                                 | J K L         | J K L    |
| P Q R    | 36 through beta to 108                    | P Q R         | P Q R    |
| S T U V  | 108, leader on open                       | S T U V       | S T U V  |
| W X      | 180 to 108                                | Σ Δ           | Σ Δ      |
| Y Z      | 36 through beta to 36                     | Y Z           | Y Z      |
| Σ Δ      | 108 to 36                                 | Σ Δ           | Σ Δ      |
| θ Ω      | 36 to 108                                 | Θ Ω           | Θ Ω      |

The X cell's red arrow has an ambiguous hooked tail and decodes as a 0 to 3
arc. It is read here as 1 to 3, the same geometry as W, which is what the
label pair implies.

### What the old labels meant

Each sheet 06 cell is a page 22 letter with one hand moved one step (36
degrees) forward along its own travel, onto the open pentagon. Check: Al is
old A (144) with the leader moved forward to 180; Af is old A with the
follower moved forward to 108; G H I are 0 with one hand moved to 36; S T U V
are 72 with the leader moved to 108; D, M1, M2, P, W, Y, Σ and θ each shift
their page 22 geometry by one step in the same way. So the sheet names each
cell by the letter it was derived from, plus a mark for which hand was moved:

- `l` or `f`: the leader or the follower moved.
- `^x` or `_x`: the pro hand or the anti hand moved.

This is the modifier convention already documented in section 3 of
`skew-notation.md` (superscript = pro hand, subscript = anti hand, `l`/`f` =
leading/following hand), with `x` standing for a one-step skew in place of
`+`. It holds for every cell except the two C2 cells. Under the decode,
C2 with the leader moved would be 180 with the anti hand on open (mark
`l_x`), and C2 with the follower moved would be 108 anti leads with the
leader on filled (mark `f^x`). The sheet instead draws unmoved 144 C2 twice,
once per pentagon, with `l` paired to `^x`. These two cells look unfinished.

The approved principle letters a cell by its own shape, which is why most old
labels change. The derivation marks belong to modifier notation.

Classes the sheet does not draw: 36 with the leader on filled, 108 anti leads
with the leader on filled, and the 180 hybrid with the anti hand on open.
These only matter if filled and open count as different (open question 1).

## Page 22 (Tier 1 Pentagrid): old label to new letter

| Old                     | Geometry                   | Landmark rule | Near/far     |
| ----------------------- | -------------------------- | ------------- | ------------ |
| A B                     | 144, pro/pro and anti/anti | S T (144)     | S T (144)    |
| C1                      | 144, pro leads             | U (144)       | U (144)      |
| C2                      | 144, anti leads            | V (144)       | V (144)      |
| D E F                   | 0 to 144                   | D E F         | D E F        |
| G H I                   | 0                          | G H I         | G H I        |
| J K L                   | 144 to 0                   | J K L         | J K L        |
| M1 N1 O1                | 72 through alpha to 144    | M N O         | D E F        |
| M2 N2 O2                | 144 through alpha to 72    | M N O         | M N O        |
| P Q R                   | 72 through beta to 72      | P Q R         | P Q R        |
| S T U V                 | 72                         | S T U V (72)  | S T U V (72) |
| W X                     | 144 through alpha to 144   | W X           | W X          |
| Y Z                     | 72 to 0                    | Y Z           | Y Z          |
| Σ Δ                     | 144 to 72                  | Σ Δ           | Σ Δ          |
| θ Ω                     | 0 to 72                    | Θ Ω           | Θ Ω          |
| three unlabeled statics | 144, 0, 72                 | Type 6        | Type 6       |

The sheet's C1 and C2 are the U/V leader split at 144: C1 is pro leads and C2
is anti leads. The class 72 to 144 (shift plus static, widening, Θ Ω) is
missing from the sheet.

## Sheet 07 (page 16, Pentagrid Skews Plus): old label to new letter

A plus beat starts in the plain pentagon and ends with one hand one step past
its endpoint. On the diamond such entries and exits keep their base letter
and carry the modifier (`scripts/generate-skewed-dataframe.ts` letters them
from the base row). Sheet 07 follows the same convention: each cell is its
page 22 base letter plus a mark for which hand takes the plus. The new label
is therefore the page 22 mapping with the mark kept. The page 16 vector
artwork did not decode, so this table follows the labels, not a geometric
check.

| Old                     | New (landmark rule)    | Near/far differs |
| ----------------------- | ---------------------- | ---------------- |
| A+ B+                   | S+ T+ at 144           |                  |
| C1+ C1₊                 | U+ U₊ at 144           |                  |
| C2+ C2₊                 | V+ V₊ at 144           |                  |
| D+ E+ F+ F₊             | D+ E+ F+ F₊            |                  |
| G+ H+ I+ I₊             | G+ H+ I+ I₊            |                  |
| J+ K+ L+ L₊             | J+ K+ L+ L₊            |                  |
| M1+ N1+ O1+ O1₊         | M+ N+ O+ O₊ at 72      | D+ E+ F+ F₊      |
| M2+ N2+ O2+ O2₊         | M+ N+ O+ O₊ at 144     |                  |
| P+ Q+ R+ R₊             | P+ Q+ R+ R₊            |                  |
| Sl+ Sf+ Tl+ Tf+         | Sl+ Sf+ Tl+ Tf+ at 72  |                  |
| U+ U₊ V+ V₊             | U+ U₊ V+ V₊ at 72      |                  |
| W+ X+ Y+ Z+ Σ+ Δ+ θ+ Ω+ | unchanged, θ written Θ |                  |

The last R cell is printed `R+` twice; the second is read as `R₊`. At 144 the
old A and B cells are symmetric letters on page 22, but as S and T they have a
leader, so under section 3 they need `l`/`f` marks: A+ becomes S+l or S+f
depending on which hand the artwork moves. That split cannot be read from the
labels alone.

## Trigrid sheet (page 21)

| Old                     | Geometry                | New (both rules unless noted) |
| ----------------------- | ----------------------- | ----------------------------- |
| J K L                   | 120 through alpha to 0  | J K L                         |
| M N O                   | 0 through alpha to 120  | D E F                         |
| P Q R                   | 120 through beta to 120 | P Q R (near/far: J K L)       |
| G H I, S T U V, W X Y Z | as drawn                | unchanged                     |

The sheet has no Θ Ω, although 0 to 120 with one static hand exists.

## Trigrid dataframe discrepancy (report only, not fixed)

`static/data/pictographs/TrigridPictographDataframe.csv` (189 rows, points n,
se, sw) disagrees with the trigrid sheet and with both rules:

- Its J is beta to gamma, which the sheet calls M.
- Its M is gamma to gamma, opposite direction, which the sheet calls P.
- Its P Q R duplicate S T U as same-direction rows.
- Its V duplicates M as an opposite-direction row.
- I has one hybrid only.
- There is no gamma to beta opposite-direction row (the sheet's J).

The file is read only by `src/lib/features/lab/trigrid-lab`. It should be
regenerated from whichever rule is approved.

## Evidence

`scripts/notation/multigrid-lettering-census.py` enumerates every beat on
each grid (static, pro/anti shift, and a dash where the point count is even),
reduces to classes, applies both opposite-direction rules and checks them
against the shipped data. Run from the repository root:

```
python scripts/notation/multigrid-lettering-census.py
python scripts/notation/multigrid-lettering-census.py --classes
```

Result on 2026-09-22:

- `DiamondPictographDataframe.csv`, all 512 Type 1 to 3 rows: both rules match.
- `SkewedPictographDataframe.csv`, the 1024 Type 1 to 3 rows of category 3:
  near/far matches all of them; the landmark rule differs on 128, listed above.
- The Type 2 and Type 3 rules match every row in both files.

The Flow Arts MCP server (`tka-domain-local`) failed to connect during this
work. Letter facts were checked against the dataframes and the classifier
instead of the MCP.

## Open questions

1. Does filled versus open pentagon change the letter? Recommendation: no.
   Diamond versus box is a grid mode, not a letter difference, and the shipped
   skewed classifier ignores which family the leader sits on. The old `l`/`f`
   marks record which hand was moved, which is modifier notation. With the
   pentagons interchangeable the skewed pentagrid has 55 classes instead of 92.
2. Is the decode of `l`/`f` and `^x`/`_x` above correct?
3. How are same-letter variants labelled (S T U V at 72 and 144, M N O at two
   start spacings, and so on)? Candidates: numbered, as the sheet's M1/M2,
   ordered narrower start spacing first; or a spacing or placement tag.
   Recommendation: numbered, narrower start first, which keeps page 22's M1/M2
   order.
4. Which opposite-direction rule? Recommendation: the landmark rule, accepting
   that 128 shipped skewed-frame rows change in a later implementation round.
