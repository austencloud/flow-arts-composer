# SpiroAnim → TKA: full transcription

Complete transcription of Mentive's **SpiroAnim** pattern space into TKA
letters. Source: [rbgirard/spiroanim](https://github.com/rbgirard/spiroanim),
a Vue 3 + Three.js poi/staff animator (`PTEXT = ['POI', 'Staff']`).

Produced 2026-08-09. Purpose: give TKA a measured, poi-grounded corpus —
specifically to source **poi-legal** content, since
`docs/reference/poi-legality.md` records the transition layer as having no data
at all.

An additional 2026-08-23 artifact covers a hand-authored v9 editor link rather
than a concept-builder cell. Its 45-degree frame arcs pair into 24 TKA
dual-shifts, each carrying 0.25 turns. The position cycle closes after 12 steps;
the repeated second pass closes the eight-state orientation cycle. See
`editor-v9-quarter-turn-club-loop.json` for the complete motion record and the
original SpiroAnim URL.

## Attribution

The Eight Step handpaths are **Gage's source data**, re-paginated by Mentive
(his `docs/EIGHT_STEP.md` documents the correction). The VTG matrix descends
from Noel Yee's Vulcan Tech Gospel (2010). Nothing here is TKA-original; it is
a transcription of other people's systems into TKA's vocabulary. Credit them on
any surface built from this. See `.claude/rules/no-fabrication.md` and the
`feedback_source_tiering` memory.

Mentive directly confirmed that the Quarter Space Tech source documents were
his work, based on Alex Kurowski's grid. The imported collection credits both
contributions and identifies SpiroAnim as the transcription source. Public
credit uses Mentive, his requested public name. Randy is the preferred name when
a real name is required.

## Method

His own builders and compiler were the oracle — nothing was reimplemented, so
there is no risk of grading our own homework.

1. Clone, `npm install`, add a vitest spec importing `buildVtgPattern`,
   `createVtgPreviewAnimation`, `createQtrPreviewAnimation`, and
   `createEightStepPreviewAnimation`; enumerate every cell × option.
2. Run each result through **his** `rootCompile()`, and each compiled frame's
   `pos`/`rot` vectors through **his** `closestPoint()` to recover named grid
   points (`MTC`, `MR`, …).
3. Map those to TKA compass (`MTC→n`, `MR→e`, `MBC→s`, `ML→w`, and the four
   intercardinals), then resolve `(startPlacement, endPlacement, motionTypes,
locations)` against `static/data/pictographs/{Diamond,Box}PictographDataframe.csv`.
   **Position names and letters both come from the dataframes** — no TKA
   numbering was invented.

Motion mapping, verified against MCP `get_term_definition("turns")` ("0 turns
with pro shift: prop rotates 90 degrees") and confirmed empirically against his
generator:

| His curve family | prop rotation / 90° hand arc | TKA                      |
| ---------------- | ---------------------------- | ------------------------ |
| Extension        | +90°                         | pro, 0 turns             |
| Inspin           | +270°                        | pro, 1 turn, ori **in**  |
| Outspin          | +270°                        | pro, 1 turn, ori **out** |
| Antispin         | −270°                        | anti, 1 turn             |

Inspin and outspin differ only by starting phase — exactly `Flower.ori`.

## Result

**1,584 transcribed patterns, 8,640 steps, 100% resolved to TKA letters. Zero
unresolved.** A further 1,728 entries for the 1:2, 1:4, 2:3 and 2:5 ratios
were derived from those on 2026-09-01 (see `bridge.md` → Speed ratios), for
3,312 entries in the file.

The 2026-09-04 Quarter Space Tech pass adds **228 multi-plane sequences and
1,680 steps**, also with zero unresolved letters: 56 Breaks, 64 Advanced, and
108 Beyond. SpiroAnim's own compiler/analyzer supplies the six-axis position
timelines. Each orthogonal transition is then expressed through TKA's canonical
viewpoints: Wall from the back, Wheel from the performer's right, and Floor from
the top. Every resulting hand motion stores its plane.

The QST length distribution is 32 four-step, 8 six-step, and 188 eight-step
sequences. Across both hands it contains 1,920 Wall, 720 Wheel, and 720 Floor
motions. Twenty-eight plane breaks require the same world point to be
re-expressed with a different local compass label; world-space continuity and
closure are validated rather than falsely requiring those local labels to match.

The concept ↔ position mapping is exact, with no exceptions across the corpus:

| His concept                 | TKA letters                              | TKA positions |
| --------------------------- | ---------------------------------------- | ------------- |
| `vtg` (6×6, 7 speed ratios) | **A–L** (SS=ABC, TO=DEF, TS=GHI, SO=JKL) | alpha / beta  |
| `qtr` (quarter spacing)     | **M–V** (QO=M–R, QS=S–V)                 | gamma         |
| `eight-step` (8×9)          | all 22                                   | all three     |

His entire application is **TKA Type 1 (dual-shift) and nothing else** — 22 of
47 letters. Structural facts measured over the corpus:

- every hand arc is exactly 90° (one adjacent-cardinal shift), 15,552/15,552
- at 1:1/1:3/1:5, prop rotations are only ±90/±270/±450 → integer turns 0–2;
  the even-denominator and two-cycle ratios add 0.25/0.5/0.75/1.5 turns
- the motion vocabulary is `pro` and `anti` at those turn values, nothing else
- both diamond and box grids are used (box mode puts initial arcs at 45/135/225)

**The 25 letters he never touches are the non-continuous vocabulary:** Type 2
(W X Y Z Σ Δ Θ Ω), Type 3 dashes, Type 4/5 (Φ Ψ Λ and dashes), Type 6 statics
(α β γ). A tether can only pull, so static and dash need a gripped prop. That
containment is the whole story: poi lives inside TKA as the dual-shift region.

A VTG cell is 2 frames = **one pictograph**. An Eight Step cell is 13 frames =
**a 12-step word**. His `column-row` reference is END-START — the row sets the
shared start frame, the column sets the continuation.

## Files

- `tka-transcription.json` — 3,312 patterns (1,584 transcribed at 1:1/1:3/1:5
  plus 1,728 derived for 1:2/1:4/2:3/2:5); per step: letter, start/end
  position, per-hand turns (`blueTurns`/`redTurns`), colour-swap flag.
- `cell-catalogue.json` — 288 rows, the canonical reading of each cell
  (diamond, non-anti, Qtr #1), with its TKA word and start position.
- `editor-v9-quarter-turn-club-loop.json`: the 24-step TKA transcription of
  the supplied SpiroAnim v9 editor artifact, including all 48 explicit
  interradial start/end orientations and 0.25-turn values.
- `qst-228-sequences.json`: the complete Quarter Space Tech archive as editable
  TKA sequences, with source reference, source commit, attribution, original
  document link, and a Wall/Wheel/Floor plane on every hand motion.
- `scripts/transcribe-spiroanim-qst.ts`: reproducible QST translator. It loads
  SpiroAnim through SpiroAnim's own Vite pipeline and refuses to label a checkout
  with a source ref when the relevant inputs differ.
- `scripts/import-spiroanim-qst.cjs`: idempotent private-library importer for the
  `Quarter Space Tech Archive` collection.

## History archive preservation

The public `/history#archive-record-quarter-space-tech` record preserves the
three PDF exports byte-for-byte and renders all 50 pages as lossless WebP images
for the in-page document reader. The PDFs carry a March 15, 2024 export date.
That date identifies these copies, not the origin of Quarter Space Tech.

| Document                | Pages | Patterns | SHA-256                                                            |
| ----------------------- | ----: | -------: | ------------------------------------------------------------------ |
| Quarter “Time” Breaks   |     7 |       56 | `4a9ef6c8b77cfde6210427e78e2d2b521574a30c0b079bfa7f5890c39cd42547` |
| Quarter “Time” Advanced |    16 |       64 | `d90369e4980a4e98be827f50092a2fef4f362c2b2489830151f53eeafe6aa429` |
| Quarter Space Beyond    |    27 |      108 | `80169e9ea7e24c9b7abe9909b89f190045f1b85888a8cd7da9b1dd0e225ef068` |

## What he has that TKA does not

1. **Dual hands/props classification** — two codes per pattern (`6-3` = `SO/TS`)
   with a local-frame parity correction, because world-space rotation axes lie
   after a quarter-phase transform. TKA classifies one mode. TKA has the
   information; it has nowhere to put a cycle-level code, since its unit is a
   discrete step.
2. **Wall-plane feasibility** — 24 Eight Step cells marked potentially difficult
   or impossible in wall plane without significant modification
   (`EightStepPane.vue`). This rare negative, gravity-bound evidence is now
   preserved as `metadata.wallPlaneSourceAssessment`. It remains separate from
   scanner-generated `metadata.wallFeasibility`: the other 48 cells are unmarked,
   not proven feasible.
3. **A momentum-preserving reversal algorithm** — his `QTR Trans'` toggle
   inserts a beat before each relationship change and derives the handoff as
   `-turns - 2*arc`, reversing the local rotation axis while preserving compiled
   prop rotation. That is a worked solution to the reversal problem
   `poi-legality.md` §5 says we have no language for.
4. **Parallel-transport plane solving** — plane is relative to an orthogonal
   reference transported through every preceding frame, not a fixed CW/CCW
   lookup, which breaks when the capping hand reverses.
5. Speed ratio as a first-class axis (1:1, 1:2, 1:3, 1:4, 1:5, 2:3, 2:5 bridge
   to TKA turns; 2:1 has no TKA reading).

## Two cautions for anything built on this

**It is positive evidence, not a legality boundary.** This is a curated
pedagogical corpus (Yee's book, Gage's pages), not an enumeration. It shows
these patterns are performed; absence from it is not a physics claim. The 24
wall-plane marks are the exception and are disproportionately valuable.

**Do not canonicalize by rotation.** `poi-legality.md` §4: TKA is rotation- and
reflection-invariant because gravity is irrelevant to it; poi notation is
gravity-bound and rotation is not a symmetry. VTG _rules_ may be canonicalized;
Eight Step handpaths and the wall-plane marks must not be, or the gravity
information that makes this corpus worth having is destroyed.

## Reproducing

Clone spiroanim, `npm install`, add a vitest spec that imports the builders and
writes JSON, then resolve against the dataframes. The dump and resolver scripts
lived in a session scratchpad and are not vendored here; the method above is
sufficient to regenerate.

Quarter Space Tech is reproducible without a scratch spec:

```powershell
pnpm tsx scripts/transcribe-spiroanim-qst.ts --source E:/spiroanim --source-ref origin/main --write
node scripts/import-spiroanim-qst.cjs --dry-run
```

The finite import stops at the 228 tested QST definitions. SpiroAnim's Third
Order and Kinetic Alphabet panes currently expose no comparable authored
catalog or generator, so there is no additional finite sequence corpus to
translate from those panes.

Related: `docs/reference/poi-legality.md`, memory `project_spiroanim_bridge`,
`project_wall_plane_feasibility`, `project_shape_matrix_destination`.
