# Step Grid Layout Transition — Design

**Date:** 2026-08-15
**Status:** Shipped. Moved out of `active/` on 2026-09-13 during spec
reconciliation.

**Reconciliation evidence (2026-09-13):** `db1454736` created `layout-flip.ts`;
`6c6163b84` landed the whole-cell targeting fix this document records. The API
is exactly `capture()/play()/discard()/cancel()`, x and y scale independently,
`fill: "both"` with a self-cancelling `onfinish`, rect read before cancel with no
blanket pre-cancel, and `getDuration() <= 0` declines capture. Cell size is
deliberately absent from `grid-layout-signature.ts`. All three superseded FLIP
copies are provably gone: `WorkspaceGrid.svelte` has zero matches for
`animate:flip`, `slideIntoPlace`, or the `activeMode === "construct"` branch.
`tests/unit/GridLayoutSignature.test.ts`: 12 tests pass. The Chromium suite
`layout-flip.svelte.test.ts` (12 blocks) needs a browser and was not re-run
here; the per-frame runtime table below is the original measurement.
**Owner:** `src/lib/shared/transitions/layout-flip.ts`

## The problem

Adding a step glided the grid into its new arrangement during the arrival
animation's landing phase. Every other layout change snapped. Austen: *"right
now if I delete a step it immediately pops the pictographs over instead of doing
a shifting animation."*

The cause was three separate copies of the same FLIP technique, each gated
against the others, with delete falling through all of them:

1. **Arrival capture/play** — an explicit snapshot pair, used only by the
   pictograph arrival card.
2. **A history `$effect.pre`** — geometry animation for undo/redo transitions.
3. **Declarative `animate:flip`** on the keyed blocks, whose duration function
   returned `0` while `removingStepIndex !== null`.

Deletion mutated the step array at t=250ms, inside a removing window that did
not clear until t=450ms — so the one path that could have carried it was
switched off at exactly the moment it was needed. `animate:flip` also applies a
single uniform scale, which distorts any cell whose aspect ratio changes.

## The shape of the fix

One owner for "this surface glides from its old arrangement to its new one",
driven by a layout signature.

### `layout-flip.ts` — the capability owner

`createLayoutFlip(config)` returns `{ capture, play, discard, cancel }`.
`capture()` snapshots every tracked element's rect; `play()` measures again and
animates each element from its old box to its new one via the Web Animations
API.

Two things it does that `svelte/animate`'s `flip` cannot:

- **Independent x and y scale**, so a cell changing aspect ratio (a timeline
  cell widening by its duration multiplier, a grid cell reflowing into a
  shorter row) travels without distorting.
- **Spans element families across keyed blocks**, so step cells, the start
  tile, and the mandala cells all move on one clock.

Details that are load-bearing:

- Capture reads each rect **before** cancelling animations still running on it,
  and never issues a blanket cancel ahead of the measuring loop. An interrupted
  transition chains from the position it had actually reached on screen instead
  of snapping to its destination first.
- Animations run `fill: "both"` with `onfinish = () => cancel()`. Without the
  cancel, the held final frame pins a transform onto the element and defeats
  the next transition's measurement.
- Members absent from the new layout (a deleted step, a mandala that only
  exists in the other mode) are skipped — there is nowhere to move them to.
- `getDuration()` returning 0 makes `capture()` decline, so reduced motion
  snaps rather than animating at zero length.
- **The transform lands on the tracked element itself, never a descendant.** A
  cell's background, border, and selection ring belong to its outer box. The
  first cut targeted an inner `.history-layout-shell` wrapper, so the opaque
  `--dm-pictograph-bg` box arrived at the destination instantly and the
  pictograph slid over to cover it. The engine has no option to target a
  descendant — offering one is what produced the bug.

### `grid-layout-signature.ts` — the trigger

A pure digest of the grid's composition: mode, column and row counts, start-tile
presence, timeline row sizes, and step identities in order. When it changes,
cells moved.

**Cell size is deliberately excluded.** A live panel or window drag fires the
ResizeObserver every frame; animating that would make the cells lag the handle
they are following. Proportional resizing tracks the container instantly; only a
genuine recomposition glides.

### `WorkspaceGrid.svelte` — the consumer

One `$effect.pre` compares the signature, captures if it changed, and plays in
`tick().then()`. The three old copies are gone: no `animate:flip`, no
`slideIntoPlace` keyframes and their per-cell stagger, no second geometry path
in the history effect (which now carries only its brightness pulses).

Arrival keeps an explicit `captureArrivalLayout()` / `playArrivalLayout()` pair
because it must snapshot inside its own `flushSync` before measuring the
destination cell. While that transaction is open the automatic capture stands
aside; if the arrival is cancelled between the two calls, the pending flag is
cleared and the snapshot discarded, so a cancelled arrival cannot block every
later glide.

The surface's own `--grid-center-offset` translate no longer transitions. Cell
rects already include the surface transform, so animating both double-moved
every cell.

### Delete timing

`.step-container.deleting` fades and scales to 0.86 in place over
`DURATION.normal`; survivors glide on `DURATION.emphasis`. The 10px jiggle is
gone.

`removeStepWithAnimation` now calls `endRemovingBeat()` immediately **before**
`setCurrentSequence`, drops its nested timeout, and runs its outer timeout on a
named `STEP_EXIT_ANIMATION_MS = DURATION.normal` rather than a hardcoded 250.
`removeStepAndSubsequentWithAnimation` got the same treatment.

A latent bug surfaced while doing this: single-step deletion never played an
exit animation at all. `isDeleting` checked only `removingStepIndices` (plural,
set by `startRemovingBeats`) while `removeStepWithAnimation` calls
`startRemovingBeat` (singular, setting `removingStepIndex`). `isStepLeaving()`
now covers both.

## Scope

Every trigger Austen selected: step list changes (delete, delete-and-subsequent,
mid-sequence insert, clear-to-here), column and size changes, the timeline ↔
grid toggle, and start position add/remove. Every StepGrid host, not just
Construct — the old `activeMode === "construct"` gate is removed.

## Known edges, accepted

- Mandala cells use different dataset keys in grid vs timeline mode, so they
  appear and disappear across that toggle rather than gliding. Steps and the
  start tile do glide.
- An interrupted glide re-captures from its mid-animation rect. This chains
  correctly, and is covered by a test.

## Verification

**Tests.** `tests/unit/GridLayoutSignature.test.ts` (12) covers which changes
fire the signature and which do not, resize exclusion included.
`src/lib/shared/transitions/layout-flip.svelte.test.ts` (9, real Chromium)
covers survivor animation on member removal, start and end keyframes, the
clock, non-uniform scale, the no-op case, the reduced-motion decline, discard,
interruption chaining, and descendant targeting.

The interruption test caught a real defect: `capture()` cancelled its own
running animations before measuring, so an interrupted glide snapped — the exact
behavior the module documented itself as avoiding.

**Runtime.** Measured in a throwaway isolated browser context on the Construct
workspace. Deleting a mid-sequence step produced, per frame:

| t (ms) | What is running |
|---|---|
| 16–190 | Deleted cell's `fadeOutCollapse`; at t=90 opacity 0.409, scale 0.917 |
| 264–523 | Survivors' glide, `duration: 280`, `cubic-bezier(0.4, 0, 0.2, 1)` |

Both surviving cells animated simultaneously, both changed geometry, and no
residual transform was left on any cell afterward. A 1920×1080 frame held at
110ms into the glide shows the cells mid-travel with nothing torn or
overlapping.

After moving the transform onto the keyed element, the same run at 110ms had
all three animations on the outer boxes, zero on any inner shell, and every
outer box short of its final slot (318/540/763 against finals of 338/579/820) —
the background travels with its pictograph instead of waiting at the
destination.
