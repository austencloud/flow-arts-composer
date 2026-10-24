# Poi trick catalog, 2026-10-22

A list of poi trick names from public sources, for the poi move library in
[the real poi spec](../../superpowers/specs/active/2026-10-22-real-poi-design.md).
Austen asked for the whole scope of poi tricks by name, cross-referenced
against VTG and the Shape Engine. He fills in what each move looks like where
the sources don't say.

The full table is [catalog.md](catalog.md): **446 tricks in 19 families**, each
with aliases, timing and direction, plane and level where a source gives them,
a one-line description in our own words, where it already exists in the
project, and its sources.

## Where the names came from

- **Home of Poi** lesson index: 47 poi categories, 606 lesson pages. Most rows
  come from lesson titles; only the terminology lesson and the wraps listing
  were read in full.
- **Wikipedia** "Poi definitions" and "Poi (performance art)", and the
  **Wikibooks** poi tricks page.
- **DrexFactor Poi** and **Playpoi** YouTube video titles.

Blocked or missing: playpoi.com and the Home of Poi forum (Cloudflare),
drexfactor.com (expired certificate), a trick database that needs JavaScript,
and the Vulcan Tech Gospel PDF (not found). No Reddit or wiki glossary turned
up.

## What the project already has

| Family                    | Tricks | Already in VTG or the app | Description is a guess (?) |
| ------------------------- | -----: | ------------------------: | -------------------------: |
| Weaves                    |     50 |                        37 |                         19 |
| Butterflies               |     48 |                        26 |                          9 |
| Flowers                   |     47 |                        15 |                          6 |
| Tosses, throws, juggling  |     38 |                         1 |                          1 |
| Crossers and body moves   |     35 |                         0 |                          1 |
| Wraps                     |     34 |                         0 |                          1 |
| Hybrids                   |     25 |                        12 |                          1 |
| Stalls and stall chasers  |     23 |                         1 |                          1 |
| Isolations and extensions |     19 |                         9 |                          1 |
| Fountains                 |     17 |                         3 |                          0 |
| Contact poi               |     16 |                         0 |                          1 |
| Tracers and body tracing  |     15 |                         1 |                          0 |
| Windmills, reels          |     14 |                         4 |                          6 |
| CAPs                      |     13 |                         5 |                          0 |
| Partner and multi-poi     |     13 |                         1 |                          0 |
| Plane shifting, stacking  |     12 |                         2 |                          0 |
| Pendulums                 |     11 |                         1 |                          1 |
| Toroids and tetras        |      8 |                         8 |                          1 |
| Buzzsaws                  |      8 |                         6 |                          0 |
| **Total**                 |    446 |                       129 |                         49 |

"Already in" is generous on purpose. Most weave and butterfly hits mean VTG
names the family, not that exact variant, and every toroid hit is only "VTG's
3D hybrids may overlap". The exact matches are:

- **VTG named patterns:** Weave (Split-Same × Extension), Butterfly
  (Together-Opposite × Extension), Buzzsaw (Together-Same × Extension),
  Corkscrew (Split-Opposite × Extension); the Isolation, Extension and
  Vertical and Horizontal Antispin shapes; the Vanish hybrids.
- **Shape Engine:** extension (pro 0 out), isolation (pro 0 in), cat-eye
  (anti 0), inspin flowers, antispin flowers including the triquetra (anti
  0.5) and the 4-petal antispin (anti 1), and two-flower hybrids such as the
  Mercedes and the buffalo eye. All are flat (2D) and steady: one flower per
  hand, held.
- **App:** Gage's 72 CAPs on `/guide/eight-step`; a pendulum trajectory in
  the QFT notation code.

Nothing in the project covers the families that need a body or a third
dimension: wraps, stalls, throws, contact, crossers, tracers, plane shifts.
The Shape Engine draws a weave or a butterfly only as its 2D timing and
direction cell. It can't show the weave's circles switching sides of the body,
which is why the spec builds weaves from mocap.

## Found while cross-referencing, needs Austen's call

1. **The poi-legal checker may ban two standard poi tricks.** The checker in
   `src/lib/features/levels/poi-lab/services/poi-constraint-validator.ts`
   rejects anti 0 turns ("tramel impossible with poi") and pro 0 turns "in"
   ("cannot isolate inward-facing swinging prop"). On the Shape Engine's own
   flower math, anti 0 is the cat-eye and linear extension (1:1 antispin),
   and pro 0 in is the isolation. Home of Poi, Playpoi and DrexFactor teach
   all of them at beginner or intermediate level. Either real spinners bend
   the timing enough that these aren't the same motion as TKA's, or the rules
   are too strict. The Poi String lab's hand solver can settle it. Not
   changed.
2. **The weave's plane.** The catalog's plane column says "wall" for the
   3-beat weave, from a Playpoi title. I believe each poi circles in the wheel
   plane (beside the body) while the hands cross in front. The mocap study
   will measure it. Austen to confirm.
3. **Corkscrew.** The sources describe the corkscrew as horizontal circles.
   VTG's "Corkscrew" is a wall-plane Split-Opposite extension. The two may be
   different moves sharing a name.

## How Austen fills the gaps

The 49 rows marked "(?)" have a guessed description, nearly all from a lesson
title alone. Those are the ones to look at first, family by family. A
correction can be as short as "Lopsided butterfly: one hand high, one low".
The catalog gets updated as he goes.

## Rights

Names and our own one-line descriptions only. No lesson text or footage is
copied here. The sources list at the bottom of [catalog.md](catalog.md) credits
each site.
