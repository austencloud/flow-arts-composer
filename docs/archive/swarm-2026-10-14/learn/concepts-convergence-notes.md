# Guide → Concepts Convergence — Working Notes

Living scratchpad for converging the written Level-1 guide into the interactive
Concepts module. Brainstorm state, not a spec. Started 2026-06-19.

## The decision (2026-06-19)

Converge on the **Concepts module** as the single learning surface.
- Port guide content into concept lessons one at a time.
- **Harvest** existing assets (live pictographs, the 19 baked motion videos, the
  3D viewer) into lessons — don't discard.
- The written scroll-guide gets **demoted** later to a lookup codex
  (`/guide/codex`, poster) + the downloadable PDF. Not deleted.
- Convergence also fixes the "guide hugs the left edge" complaint for free —
  concept experiences render full-screen.

## The gold-standard model: the `grid` concept

`grid` is the one CONFIRMED lesson. Every new lesson copies its shape.
Source: `src/lib/features/learn/components/interactive/GridConceptExperience.svelte`
+ `grid-concept/grid-experience-state.svelte.ts`.

The pattern:
- **ONE hero visual that transforms.** Not a row of panels. A single grid that
  morphs through phases.
- **Progressive reveal on Next.** A step can hold several phases; each Next
  reveals the next phase (split → diamond-labels → box-labels → merged), same
  visual transforming.
- **Discovery by construction.** The payoff step is "build it yourself" — tap
  center → hand → outer points; auto-celebrates on completion.
- **Reward is subtle.** Haptics + progress/card state changes. The code comment
  is explicit: "the visual delight comes from progress updates and card state
  changes, not confetti."
- **5-step arc:** intro → transform/explore → highlight/explore → construct →
  summary.
- Per-step/phase persistence, a11y announcements, keyboard nav, scroll-review
  mode after completion — all already in the shell.

## Anti-pattern (rejected 2026-06-19): the layer salad

First skeleton (`src/routes/test/concept-skeleton/`) showed every illustration
layer side-by-side (2D grid + pictograph + animation + 3D) for Hand Positions.
**Wrong.** Why:
- For a *static* position, the bare 2D grid does nothing and the static-hold
  "animation" does nothing — no motion to show.
- A big pictograph with the same pictograph duplicated in the row below it is
  pointless repetition.
- Showing all layers at once is noise, not teaching.

**Rule:** pick the ONE representation that actually *does something* for THIS
concept and let it transform. Layers are a **palette to choose from per
concept**, never an all-at-once dump.

## The 3D-avatar layer (Austen's vision — parked)

Every concept *can* also be shown in 3D with an avatar performing it — even the
grid, with an avatar placing its hands at points. Use the shipped 3D viewer
(`Viewer3DCanvas` + `PerformerRig`), not new tech.

- 3D is a **first-class layer for concepts where embodiment/motion matters**
  (hand motions, body turns, negative space, staff spin) — "what it looks like
  on a body."
- Probably NOT the right hero for purely static/spatial concepts (positions,
  grid) where a flat interactive grid is clearer. Decide per concept.
- Park the 3D build until we reach a concept where motion on a body is the point.

## Working agreement

- Go slow. One concept, one step at a time.
- **Synchronize before building.** Park ideas here; don't auto-implement.
- No autopilot / no batch lesson-cranking. Austen drives; Claude proposes and
  builds only the agreed piece, then we look at it together.

## Known wiring bugs to fix when we touch the shell

- `ConceptDetailView` checks `concept.id === "hand-motions"`, but `concepts.ts`
  defines it as `hand-motions-intro` → the already-BUILT Motions experience
  never renders (falls to "Coming Soon").
- `ConceptDetailView` checks `"vtg-fundamentals"`, which is not one of the 28
  concept ids → dead branch.

## ch10 guide accuracy audit (2026-06-19, MCP-grounded)

Two real bugs in the dual-shift examples (one-line config fixes + re-bake):
- `t1-together-same` ("Beta to Beta") actually ends at alpha (red S→E, blue
  S→W = β→α); duplicate of `together-to-split`. Should be genuine β→β.
- `t1-gamma-opposite` ("opposite direction") stays in the same gamma half =
  same-direction. Opposite must cross halves (M = gamma3→gamma13); fix: blue
  ends W not E.
Everything else in ch10 verified accurate.

## Writing rules for lesson copy (learned the hard way 2026-06-19)

- **Positions are STATIC.** Alpha/beta/gamma describe where hands *are*, not a
  motion. Never say a hand "swings/moves/travels" to describe a position. The
  on-screen slide between positions is a teaching transition, not part of the
  position. (Gamma = static 90° right angle; rotation can stack *at* that
  position but that's not the position's definition.)
- **No em dashes** in any user-facing copy (project writing rule). Use periods.
- **MCP-ground every domain claim** before writing a caption. This is the learn
  module — getting alpha/beta/gamma wrong is unacceptable. Canonical: alpha=180°
  opposite, beta=0° together, gamma=90° adjacent right-angle.

## Hand Positions lesson — staged plan (2026-06-19, agreed w/ Austen)

**Stage 1 — meet each (BUILT, approved).** One hero grid + real hand props.
Next steps through Alpha → Beta → Gamma, one at a time. Eyebrow shows VTG nod
(Split / Together / Quarter), Greek name big, one grounded caption. Hands move
between positions as a teaching transition (the slide is NOT part of the
position; positions are static).

**Stage 2 — compare (BUILT).** The shared stage widens into three inspectable
Alpha, Beta, and Gamma choices. Each choice keeps the same grid treatment as the
walkthrough and remains a full-size touch target on narrow screens.

**Stage 3 — "Same letter, many faces" (BUILT).** Tap a card on the compare row
and the same artifact becomes a transform playground. Approach C (chosen):
- ONE live pictograph at that position's true base (alpha1 = N/S), rendered with
  the lesson's own grid+hand renderer (kept for visual consistency with screens
  1–4; NOT PictographRenderer/PositionVisualizer — those pull the full prop
  pipeline + arrows/glyphs and diverge from the approved hand-dots look; the
  transform here is pure index geometry on the 8-point circle).
- A big letter label above that NEVER changes — the invariance anchor.
- Three transform buttons: Rotate (45° step, walks all 8), Mirror, Color-swap.
- 8-cell discovery tray (row of 4 diamond + row of 4 box) lights each state
  reached. "Discovered N of 8." Subtle reward (cell fill), per grid-concept.
- Caption per action: "Rotated — still Alpha." etc.
Canonical grounding: MCP "Symmetry Invariance Principle" — a pictograph is the
same letter under rotation, reflection, color-swap; it drove the whole letter
enumeration. (Exception STUV = same-dir asymmetric color-swap; not at this stage.)
8 points = one radius-143 circle: diamond cardinals + box intercardinals at 45°,
so a single rotate walks diamond↔box through all 8 (grid-coordinates.ts confirms).
Reused data shape from position-quiz-data.ts (diamond/box variation split).

**Stage 4 — quiz (PARKED).** Identify-the-position check after all three seen.

## WIRED INTO REAL MODULE (updated 2026-09-04)

The design is the live `hand-positions` experience and shares its heading,
artifact, and controls frame with the preceding Grid lesson:
`src/lib/features/learn/components/interactive/positions/PositionsConceptExperience.svelte`
(slot already wired in `ConceptDetailView`). Ships on dev.tka → Concepts → Hand
Positions. `/test/positions-concept` is the throwaway scratch copy (superseded;
real component is source of truth now). Old positions sub-files
(DiscoveryVariantA / ConstructionQuiz / SpeedRounds / positions-experience-state)
left on disk, now unreferenced — don't delete blindly (other agents' work).

STILL PENDING: the quiz ("Name the position" — show a random rotated/box/
mirrored/color-swapped variation, pick alpha/beta/gamma). Build mobile-first
after Austen reacts to the stacked mobile layout on dev.tka.

## Next step

Re-think **Hand Positions** the grid way: one hero grid with two hand markers
that *move* to reveal alpha → beta → gamma (the relationship is the lesson),
then a "make beta yourself" construction beat. Design it together before coding.
