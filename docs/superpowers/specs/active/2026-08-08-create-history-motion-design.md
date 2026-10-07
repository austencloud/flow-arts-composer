---
status: active
value: null
effort: null
remaining: "Verify Create history identity across insert, delete, rewind, and shift, then check motion and visual acceptance."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Create History Motion

**Status:** Approved for implementation

**Date:** 2026-08-08

**Surface:** Create workspace, including Construct, Generate, Spell, and Assemble

## Outcome

Undo and redo show what changed. A restored snapshot does not arrive as one
unexplained repaint. Retained steps move to their new slots, inserted and
removed steps enter or leave, compatible prop and arrow geometry interpolates,
and controls that reflect restored state update without shifting the layout.

The operation label describes the command. A before/after diff decides the
motion. This distinction covers collateral changes such as reversal indicators,
word updates, start-position changes, duration widths, and grid rearrangement
without teaching each command a partial list of consequences.

## Existing Owners

This work extends the current owners instead of creating another animation
stack:

- `sequence-animation-state.svelte.ts` owns transient sequence animation state.
- `step-grid-display-state.svelte.ts` owns Create grid presentation state.
- `WorkspaceGrid.svelte` owns standard and timeline cell layout.
- `PropSvg.svelte` and `ArrowSvg.svelte` own live geometry interpolation.
- `assemble-history-controller.ts` owns Assemble snapshot restoration.
- `motion.ts` owns reduced-motion-aware transition timing.

The current module-level restore suppression flag is removed. History motion is
feature state, not process-global state.

## Transition Plan

Before a snapshot is restored, a pure planner compares the displayed sequence
with the target sequence. It records:

- inserted, removed, retained, moved, and changed step identities;
- changes to duration, grid mode, notation, prop geometry, and arrow geometry;
- start-position, word, circularity, and selection changes;
- the direction and operation label that caused the restore.

The plan is transient. It is never persisted with undo history. Each plan has an
epoch so a newer undo or redo cancels the presentation work from an older plan
without changing the restored document state.

Step IDs are the primary identity. Duplicate or missing legacy IDs receive a
deterministic occurrence key so a malformed sequence cannot crash a keyed Svelte
block. When identity cannot safely survive a change, the planner treats that
step as a replacement.

## Motion Contract

### Membership

- Removed steps fade and settle inward while leaving their old slots.
- Inserted steps fade and settle into their new slots.
- Retained steps move and resize from their old rectangles to their new ones.
- Start and mandala layout items participate when their grid slots move.

### Content

- Props and arrows use stable keys based on step identity and hand color.
- Compatible coordinates and rotations interpolate in the live SVG.
- Glyph, reversal, duration, or arrow-topology changes receive a short cell
  change highlight so a discrete asset change is still attributable.
- A full sequence replacement uses one coordinated change rather than a long
  per-step reveal.

### Selection and controls

- Selection rings follow the retained cell and use their existing CSS motion.
- Picker and builder controls update inside reserved layout slots.
- Undo never moves focus merely to explain the transition.
- Assemble restores grid mode, center visibility, active hand, phase, cursor,
  start poses, paths, selection, and edit mode through the same plan boundary.

### Reduced motion

`prefers-reduced-motion: reduce` collapses geometric movement and scaling to
zero. The final state appears immediately with a brief non-moving state cue.
No panning, zooming, or sequential reveal remains.

## Rapid input

Undo and redo remain document operations, not animation commands. Pressing the
shortcut again restores the next correct snapshot immediately. Any older DOM
animations are canceled and replaced by the newest plan. No animation timer may
delay or reorder history stack mutations.

## Performance

- Retained pictographs remain mounted.
- The grid does not route through the generic keyed `Crossfade` primitive.
- Geometry motion uses transforms and opacity.
- Full replacements avoid duplicating two live 64-step SVG grids.
- Position caches remove identities when steps leave instead of clearing every
  cached coordinate.

## Verification

Silent-bug tests cover:

- stable identity across insert, delete, rewind, and shift;
- every registered Create history operation class;
- sequence replacement and legacy missing/duplicate IDs;
- Assemble snapshot fields and settings consequences;
- rapid-plan replacement and reduced motion.

Runtime proof samples rectangles and computed transforms before, during, and
after history actions in standard and timeline layouts. It covers single-step
add/remove, truncation, clear/restore, duration changes, transforms, rewind,
shift, generation replacement, Assemble reorder, and Assemble grid changes.

## Acceptance criteria

- No history restore clears all prop or arrow position caches.
- A retained step keeps its component identity when its index changes.
- Surviving cells visibly travel during a grid rearrangement.
- Changed prop and arrow coordinates have an observable intermediate state.
- Duration restoration changes timeline width without a one-frame jump.
- Picker and Assemble controls reflect the restored snapshot without layout
  shift.
- Rapid undo and redo cannot leave stale classes, hidden cells, or wrong state.
- Reduced motion produces the same final document with no geometric motion.
