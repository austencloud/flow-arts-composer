---
status: active
value: 5
effort: L
remaining: "Complete the browser viewport sweep when the Chrome DevTools transport is available"
depends_on: ""
plan_path: ""
tags:
  - fuse
  - loops
  - solo-prop
  - vtg
last_triaged: 2026-10-07
work_state: verification
---

# Fuse one-hand LOOP sources

**Date:** 2026-08-11

**Status:** Implementation recorded; browser viewport verification remains (reviewed 2026-10-07).

**Original approval:** Austen approved the design on 2026-08-11.

## Outcome

Fuse combines two independently meaningful one-hand LOOPs. It does not ask the
user to choose a two-hand timing or direction while selecting one hand. Those
relationships are derived only after the blue and red paths are paired.

The full Shape Matrix remains a two-hand exploration surface. Fuse reuses its
single-flower vocabulary where useful, but does not embed the two-dimensional
matrix or apply a matrix cell to both source cards.

Each Fuse source card owns a `SoloLoopSource`:

- an immutable generated or selected base `SoloPropData`;
- a color-independent `PropLOOPSpecWire` proving its construction;
- a nondestructive adjustment recipe;
- the materialized solo prop currently shown and fused.

Every materialized source must be continuous, return to its starting location
and orientation, and retain a recognized one-hand LOOP structure.

## Current behavior being replaced

The default Fuse shuffle pool reads public two-hand sequence metadata, filters
only by length, hydrates a full sequence, and extracts one side. The library
picker also selects a full sequence and extracts one side. The existing VTG
picker avoids Firestore, but applies variation data to a two-hand archetype
before hiding one hand.

An unused `hand-path-loop-detector.ts` checks only that a path visits the four
points of its grid and returns home. That is neither wired into Fuse nor a
structured LOOP classifier.

The replacement generator must not use public sequence metadata, public
sequence hydration, or a generated two-hand sequence as its source.

## Domain contract

A one-hand LOOP has two independent requirements:

1. **Seamless closure:** the last step ends at the first step's location and
   orientation.
2. **Structured repetition:** its passes are related by a supported
   `PropLOOPSpec` component.

Supported solo components are Rotated, Reflected, Inverted, and Rewound.
Swapped is excluded because it requires two hand identities. Rewound remains
exclusive. Reflections retain their canonical axis. Rotated patterns may use
180-degree or 90-degree repetition. The Fuse adjustment control rotates a
completed source only in 90-degree increments. It never offers 45 degrees.

Diamond and Box sources may both exist, but the two active Fuse sources must
share one grid mode. This prevents an accidental Skewed pairing until Fuse has
an explicit Skewed experience.

## Canonical one-hand generator

Extend `@tka/sequence-engine` with the prop-level portion of the existing
per-prop LOOP design:

1. Project the canonical variation provider into a color-neutral graph of
   unique legal prop motions. This uses the pictograph dataframe as the legal
   motion vocabulary, not gallery sequences.
2. Search that graph for a seed of the requested length, grid, level, and LOOP
   seam target.
3. Expand the seed through a `PropLOOPSpec` executor. The executor operates on
   one prop and shares the existing position maps, reflection axes, inversion,
   orientation calculator, and rewound semantics.
4. Propagate orientations and reject any result that does not close at the
   requested total length.
5. Detect the prop relation from the resulting motion steps and require it to
   match the generated spec. Generated intent is retained as a proof
   certificate; detection is the independent evidence check.
6. Return color-neutral solo steps plus the spec and generation metrics. The
   app adapter creates `SoloPropData` and assigns it to Blue or Red only for
   presentation.

This is a shared engine capability. Fuse consumes it but does not own another
LOOP algebra or orientation implementation.

## Source adjustments

Adjustments are a recipe over the immutable base, never a chain of destructive
mutations. Materialization always replays the recipe in canonical order so
toggling a control off returns to a stable result.

Initial controls:

- rotate 90 degrees counterclockwise or clockwise, accumulating through
  0/90/180/270;
- Mirror (north-south reflection);
- Flip (east-west reflection);
- Invert;
- choose a new first step by cyclically shifting a closed path;
- Reset.

Rewind is not a Fuse source adjustment. The canonical sequence transform adds
the reversed path after the original, while Fuse must preserve its selected
length. Projecting that longer result back to the Fuse length discards the
reverse half and makes the action misleading.

The implementation composes the existing solo-prop sequence adapter and
canonical sequence transform owner. It must not reproduce motion-transform
maps in Fuse. After every materialization it rechecks seamless closure and
one-hand LOOP evidence before committing the source.

## Fuse interaction

Each source card exposes visible, side-colored actions:

- **Generate another** replaces Shuffle and produces a fresh verified solo
  LOOP at the current Fuse length.
- **Choose path** opens the structured one-hand flower/LOOP picker.
- **Actions** opens the shared sequence Actions presentation, scoped to the
  selected one-hand LOOP.
- **Previous** restores the prior generated source when history exists.
- **Pick from library** queries actual solo-prop artifacts and shows only
  verified one-hand LOOPs compatible with the current length and grid.

The picker never shows timing, direction, or element choices. Once both sources
are present, the combined preview derives the real two-hand result.

The existing Symmetry mode may continue to derive one source from the other.
Independent source adjustments belong to both Shuffle/Generate source cards
and do not depend on Symmetry mode.

On desktop, Actions opens as the same right-side panel language used by the
Create workspace and covers the animation side of Fuse without recomposing the
workspace beneath it. On compact layouts it becomes a bottom sheet. The panel
stays open after an adjustment so several reversible changes can be tried in
sequence. First Step opens an in-panel notation view where a source step can be
chosen directly.

Fuse shows only operations that are truthful for a fixed-length one-hand LOOP:
Mirror, Flip, Invert, 90-degree rotation in either direction, First Step, and
Reset. It omits Swap, Rewind, Extend, timing, direction, turn-pattern, and beat
editing controls. Create continues to use 45-degree rotation; Fuse never does.

## State and persistence

Fuse state owns the two `SoloLoopSource` values, their histories, concurrency
guards, preview derivation, and local persistence. Persist the base solo,
`PropLOOPSpecWire`, adjustment recipe, and current source origin. Restore by
re-materializing and validating, not by trusting stale derived steps.

`SoloPropData` gains optional structured LOOP metadata so generated or saved
solo artifacts can retain their proof outside Fuse. Repository mappers and
schemas treat it as optional for backward compatibility.

Generated sources use a generator origin. Explicit solo-library selections use
a library origin. The old public-sequence shuffle identity is not retained.

## Capability ownership

| Need                                   | Owner                                              | Relationship                         |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| Per-prop LOOP specification            | `packages/sequence-engine/src/loop/loop-spec.ts`   | Reuse                                |
| Per-prop LOOP execution and detection  | `@tka/sequence-engine` LOOP package                | Extend                               |
| Legal motion data                      | `IVariationProvider` / canonical dataframe adapter | Extend with color-neutral projection |
| Orientation propagation                | Sequence engine orientation services               | Reuse                                |
| Solo artifact creation                 | `solo-prop-factory.ts`                             | Reuse                                |
| Solo-to-sequence projection            | `solo-prop-sequence-adapter.ts`                    | Reuse                                |
| Spatial and temporal transforms        | `sequence-transformer.ts`                          | Compose                              |
| Sequence transform action presentation | `SequenceTransformActions.svelte`                  | Extend with context capability set   |
| Responsive action panel                | `CreatePanelDrawer.svelte`                         | Reuse                                |
| Source history and preview             | Fuse state                                         | Extend                               |
| Flower vocabulary and thumbnails       | Shared Shape Matrix domain/render services         | Reuse without the pair grid          |

No full-sequence gallery loader, Fuse-specific reflection map, duplicate
orientation calculator, or two-hand matrix transaction belongs in this path.

## Error and concurrency behavior

- A generator failure leaves the current source and preview intact and offers
  Retry through the existing Fuse error path.
- A rejected adjustment leaves the last valid recipe and materialized source
  intact.
- One operation may change a side at a time. Late generation or adjustment
  results are discarded by the side generation token.
- Changing length regenerates both sources for that length. It never tiles an
  unverified open path and calls it a LOOP.
- A library artifact without structured LOOP evidence is omitted, not labeled
  approximately.
- Fusing is blocked while either source is changing or validation is pending.

## Verification

### Engine

- Generated output has exactly the requested total length.
- Every adjacent motion is continuous.
- Final location and orientation equal the start.
- Detection agrees with the generated `PropLOOPSpec`.
- 180-degree and 90-degree rotated cases, both reflection axes, inversion,
  rewound, and supported compositions have deterministic fixtures.
- Invalid divisibility, unsupported Swapped, open seams, and orientation drift
  fail with typed reasons.

### Adjustments

- Four 90-degree rotations return identical content.
- Mirror, Flip, Invert, and Rewind are involutions.
- Choosing every possible first step preserves length, closure, and LOOP type.
- Reset reproduces the base content hash.
- No 45-degree control or call is reachable from Fuse.

### Fuse

- No default Fuse path calls the public sequence loader.
- Generate/Previous maintain independent histories per side.
- A failed generation or adjustment never partially changes the preview or
  persisted pair.
- Library results are solo artifacts and all pass the one-hand LOOP detector.
- Both active sources share a grid mode.
- The resulting two-hand preview is seamless and reports relationships derived
  from its actual paired steps.

### UI

- Keyboard and pointer operation of Generate, Choose path, Actions, first-step
  selection, and Reset.
- Desktop/4K right panel and compact bottom sheet use the shared Actions tile
  presentation and preserve focus/escape behavior from the shared drawer.
- Loading and error geometry does not shift the cards.
- Required desktop, 4K, tablet, short-landscape, and phone viewport sweep.
- Reduced-motion behavior and console inspection.

## Non-goals

- Embedding the full two-hand Shape Matrix in Fuse.
- Asking for timing or direction before both hands exist.
- 45-degree source rotation.
- Skewed pair generation.
- Treating “returns home” alone as a structured LOOP.
- Removing the public Shape Matrix destination.
- Replacing the shared two-hand SequenceBuilder.

## Implementation order

1. Remove the obsolete paired Shape Matrix/Fuse integration without touching
   the public matrix.
2. Add prop-level engine fixtures, executor, detector, and generator tests.
3. Add the solo artifact adapter/metadata and adjustment recipe service.
4. Replace the Fuse public-sequence shuffle pool with the generator-backed
   source pool and migrate persisted state defensively.
5. Upgrade the source-card picker and compose the shared Actions presentation
   in a responsive Fuse source panel.
6. Run focused tests, typecheck the changed paths, and complete visual
   verification.
