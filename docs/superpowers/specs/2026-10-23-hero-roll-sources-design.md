# Hero roll sources: reversals, CAPs and Zan's Diamond on the home hero

Date: 2026-10-23. Approved by Austen in chat ("Four sources, even-ish").

## Problem

The home hero (`src/lib/shared/landing/`) never shows a prop reversal. Its
pictograph glyphs leave an empty slot to the right where the reversal dots
would sit, and the dice never rolls one. Two causes:

1. Two of every three draws are shape-matrix realizations
   (`shape-matrix-hero-pool.ts`): uniform per-hand turns on a 4-beat rotated
   flower. No step can reverse by construction.
2. The remaining generated draws (`per-visit-demo-core.ts`) pass
   `constraintPreset: "smooth"`, which `generation-orchestrator.ts` maps to
   `propContinuity: "maximize"`: the engine scores every reversal at zero and
   avoids them.

The generated path does bake dots (`build-result-transformer.ts` runs the
reversal detector), so once the engine is allowed to reverse, the dots show.

## Design

The hero act keeps its shape (`createHeroAct`, `drawHeroSequence`, chained
start placements, prop cycle) and gains a weighted table of draw sources.
Every source yields the same `HeroDraw` the act already uses: a plain
`SequenceData`, an optional TnD element for the indicator, and the grid it
was built on.

| Source      | Weight | What it is                                                             |
| ----------- | ------ | ---------------------------------------------------------------------- |
| `flowers`   | 1/3    | The existing shape-matrix realization, unchanged                       |
| `generated` | 1/3    | The existing per-visit roll; half of these allow reversals (see below) |
| `caps`      | 1/6    | Gage DeMello's 72 chart CAPs, plus the eight hand paths spun at a turn |
| `zans`      | 1/6    | Zan's Diamond: the original and its 23 stagger and reversal variations |

Weights live in one constant (`HERO_SOURCE_WEIGHTS`) and are injectable
through `createHeroAct({ sourceWeights })` so tests can force one source.
`matrixFraction` is replaced by `sourceWeights`; `boxFraction` stays and
still applies only to generated draws.

A source that returns null (cannot reach the chain target, data failed to
load, builder threw) falls through to the next source in a fixed order:
flowers, caps, zans, generated. The generated draw never returns null (it
already falls back to the baked fixture), so a draw always lands.

### Generated: let the engine reverse

`PerVisitDemoOptions` gains `continuity?: "smooth" | "mixed"`. The core
passes it as `constraintPreset` (default stays `"smooth"`). The worker
client and the worker forward the new field (it is a string, so structured
clone carries it). The hero act draws `mixed` for half of its generated
draws through its injected `random`, so the choice is deterministic in tests.

The implementer runs the real generator a few times with `mixed` and
confirms at least some steps carry `leftReversal` or `rightReversal`. If
`mixed` (engine `allow-reversals`) turns out to produce none in practice,
use `"choppy"` (`force-reversals`) for that half instead and record the
finding in the module comment.

### CAPs and Zan's Diamond: authored strips become hero draws

Both Guide topics already build a strip (start pose plus beats) as
`StepData[]`: `capStrip(cap)` in `caps-topic.ts` and
`zansDiamondStrip(variation)` in `zans-diamond-topic.ts`. The Guide pages
turn a strip into a playable sequence with `stripToSequence` from
`src/routes/(public)/guide/level-1/_data/guide-sequence-adapter.ts`. A
route-private module cannot be imported by `src/lib`, so:

- Move `stripToSequence`, `sequenceToStrip`, `bakeReversals`, `isStartBox`
  and `withLinearPaths` to a shared owner,
  `src/lib/shared/guide-topics/strip-to-sequence.ts`. The route adapter
  becomes a re-export of that module so its 69 importers do not change.
- `zansDiamondStrip` takes a second parameter `propType` (default
  `PropType.HAND`, so the Guide page is unchanged). The hero passes
  `PropType.STAFF` so the motions are prop motions, not HAND motions: HAND
  motions would get `pathShape: "linear"` from `withLinearPaths` and render
  as hand pictographs. `capStrip` already builds STAFF motions.

The CAP pool is the 72 chart CAPs (`CAPS`) plus, for each of the eight
hand paths (`CAP_HAND_PATHS`), `capOnPath(path, left, right)` with each hand
spun pro or anti at 0.5, 1 or 1.5 turns. Enumerate the pool once (a module
constant), then pick uniformly. A CAP whose `capOnPath` result went round
twice (24 beats) is fine: it still closes.

The Zan's pool is `ZANS_DIAMOND_VARIATIONS` (24 entries), picked uniformly.
An 8-beat variation is tiled twice so it holds the stage as long as the
other draws (the matrix pool already tiles its 4-beat flowers with
`tileClosedLoop`).

Pipeline for one authored draw, in order:

1. Build the strip and `stripToSequence(strip, { word, name })`.
2. Rotate to the chain target with the matrix pool's `rotateToStartKey`
   (90° steps only). Null means this entry cannot reach the target: try
   another entry from the same pool, up to a small cap, then return null so
   the act falls through to the next source.
3. Tile (Zan's only).
4. Bake dots with `processReversals` from
   `src/lib/shared/create/services/reversal-detector.ts`, with the sequence
   marked circular (`isCircular: true`) so the seam wraps. This is the only
   reversal owner; never set the flags by hand.
5. Derive the element with the matrix pool's `elementOf` for CAPs (they have
   a VTG mode). Zan's draws carry `element: null`, like generated draws.
6. Plain-ify with `JSON.parse(JSON.stringify(...))` as the other sources do.

`rotateToStartKey`, `startLocKey`, `tileClosedLoop` and `elementOf` move out
of `shape-matrix-hero-pool.ts` into a small shared sibling,
`src/lib/shared/landing/data/hero-draw-utils.ts`, which both the matrix
pool and the new `hero-authored-pool.ts` import. The matrix pool's behavior
does not change.

Both pools are dynamic-imported from the act, as the matrix pool is today,
so the landing bundle stays lean and Firebase-free. Neither pool fetches:
the CAP rows and the Zan's table are checked in.

### Where the files live

- `src/lib/shared/landing/data/hero-act.svelte.ts`: source table, weights,
  fall-through order, `continuity` draw for generated.
- `src/lib/shared/landing/data/hero-authored-pool.ts` (new): CAP and Zan's
  pools and `drawAuthoredRealization({ pool, chainStartPlacement, random })`.
- `src/lib/shared/landing/data/hero-draw-utils.ts` (new): the shared helpers
  above.
- `src/lib/shared/landing/data/shape-matrix-hero-pool.ts`: imports the
  helpers instead of defining them.
- `src/lib/shared/landing/data/per-visit-demo-core.ts`, `per-visit-demo.ts`,
  `per-visit-demo-worker-client.ts`, `per-visit-demo.worker.ts`: the
  `continuity` option.
- `src/lib/shared/guide-topics/strip-to-sequence.ts` (new) and the route
  adapter re-export.
- `src/lib/shared/guide-topics/zans-diamond-topic.ts`: `propType` parameter.

### Prop cycle and poi

The prop cycle (staff, fan, club, buugeng) is unchanged and poi stays out.
The CAP spins are pro 0, anti 1, pro 1 and the hand-path spins are pro or
anti at 0.5 to 1.5 turns; all are legal on the cycle's props.

### Ownership report

- Reusing `processReversals` (reversal-detector) for the dots.
- Reusing `rotateSequenceGeometry` through the matrix pool's chain helper.
- Reusing `capStrip`, `capOnPath`, `zansDiamondStrip`, `stripToSequence`.
- Extending `per-visit-demo-core.ts` with a continuity option.
- Extending `zansDiamondStrip` with a prop type.
- Moving (not duplicating) the strip adapter and the chain helpers to shared
  owners.

## Testing

- `hero-act.test.ts`: with injected `random` and `sourceWeights`, each
  source is chosen at its weight; a null from an authored pool falls through
  in the fixed order; the generated half-split between smooth and mixed
  passes `continuity` through; existing tests keep passing with
  `sourceWeights` in place of `matrixFraction`.
- `hero-authored-pool.test.ts` (new, real data, no mocks): every CAP pool
  entry and every Zan's variation closes (last step's end placement equals
  the start placement); a draw chained to a diamond start placement lands on
  it; a draw chained to a box placement returns null; at least one Zan's
  reversed-family draw and at least one CAP draw carry a reversal flag
  after baking; the CAP element is non-null.
- `per-visit-demo.test.ts`: `continuity: "mixed"` reaches the orchestrator
  as `constraintPreset: "mixed"`; absent stays `"smooth"`.
- `strip-to-sequence` keeps its existing coverage through the re-export
  (run the guide-sequence-adapter tests if any).
- Browser: on `/`, roll the dice until a CAP, a Zan's and a mixed generated
  draw have each shown; screenshot one with reversal dots visible in the
  glyph slot. Confirm the chain never teleports (the start pose of the new
  draw equals the previous draw's start pose) by reading the act state.

## Out of scope

- Poi legality filtering for the hero.
- Showing dots on the Guide pages themselves.
- Any change to the generated draw's length, loop type or turn ceiling.

## Implementation findings (2026-10-23)

- `mixed` is enough: against the real generator, eight of ten mixed rolls
  carried reversals (8 to 12 of 16 steps), smooth rolls none. `choppy` was not
  needed. `per-visit-demo-continuity.test.ts` keeps that guard.
- The CAP and Zan's pools bake no reversal dots at all, so the Testing bullet
  expecting a flagged Zan's reversed-family draw and a flagged CAP draw could
  not hold. Dots mark a prop changing spin direction. A CAP's capping hand
  switches pro/anti on its beat back so its prop keeps turning one way, and a
  reversed Zan's variation walks the hand path backwards while each prop keeps
  its spin (`reverseSoloPropSteps`). `hero-authored-pool.test.ts` pins this
  instead. The hero's dots come only from the mixed generated half: about one
  draw in six is a mixed roll at the approved weights, and most of those
  reverse.
- Every pool entry closes in 12 beats (CAPs) or 8 (Zan's), orientation
  included; no `capOnPath` result needed the 24-beat doubling at 0.5 to 1.5
  turns. Each pool splits evenly four ways by how far apart the hands start,
  so about a quarter of entries can reach any one chain target; the draw tries
  up to 24 entries before falling through.
