---
paths:
  - "src/**/*.{svelte,css,ts}"
---

# Layout Stability and Motion — ENFORCED

## Why This Is Load-Bearing

Movement is information. When a panel opens, a row is inserted, a control
changes size, or a workspace recomposes, the path between the old and new
geometry tells the user what changed and where it went. Snapping directly to
the destination erases that explanation and forces the user to reconstruct the
change mentally.

There are two different defects that agents used to group together as “layout
shift”:

1. **Accidental movement**: a counter changes width, an image loads without a
   reserved box, or a label pushes its siblings. Prevent it.
2. **Intentional movement**: the user expands a panel, inserts an item, changes
   a workspace mode, or reveals more detail. Animate it through the canonical
   motion system.

An intentional layout change that instantly pops to its new location is a UI
defect. A locally invented easing or one-off keyframe is also a defect: motion
must feel like one product.

## The Rule

Before changing dynamic UI, classify the geometry change:

- If the movement carries no useful meaning, reserve the destination geometry
  so nothing moves.
- If the movement communicates a user-requested structural change, animate the
  affected geometry with the canonical owner below.

This applies to expand/collapse, disclosure, panel resize, insertion/removal,
sorting, filtering that moves survivors, mode changes, responsive
recomposition, async replacement, and controls whose label or icon changes.

Never use `transition: all`. Name the properties that move. Never add raw
durations or easing curves in feature code. Use `DURATION`, the global
`--transition-*` tokens, and the shared transition owners.

## Canonical Motion Routing

| Change                                                                   | Required owner                                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Cheap mutually exclusive content or label/icon swap                      | `shared/components/Crossfade.svelte`; use `animateHeight` when the wrapper height materially changes    |
| One row, chip, settings group, or ordinary element entering/leaving flow | `growFade` from `shared/transitions/motion.ts`                                                          |
| A flex workspace panel entering/leaving                                  | `PanelGroup.svelte`, which owns `flexPresence`; do not reproduce its sizing transition in a feature     |
| Keyed list reorder                                                       | Svelte `animate:flip` with `flipDuration()`                                                             |
| Several survivors recomposing across grids, families, or keyed blocks    | `createLayoutMotion()` from `shared/transitions/layout-flip.ts`                                         |
| Content-driven dialog height changes                                    | `BaseModal` with `animateSize`; `createIntrinsicHeightMotion()` in `shared/transitions/motion.ts`         |
| Small overlay/control presence that does not reflow siblings             | `flyFade` or `popIn` from `shared/transitions/motion.ts`                                                |
| Route/module navigation                                                  | the existing native view-transition/module-transition owner in `src/app.css` and `view-transitions.css` |

If none fits, extend the closest shared owner first and document the new route
in `docs/architecture/canonical-capabilities.md`. Do not create a feature-local
motion framework.

## Preventing Accidental Movement

Pick the cheapest technique that fits:

1. **Ghost-sizer for variable text.** Stack a hidden longest variant and live
   text in one grid cell. Canonical example: `PipelineEditorDock.svelte`
   `.dock-title`.
2. **`font-variant-numeric: tabular-nums`** for changing numbers.
3. **Known fixed/min width** for a small enumerated set of labels.
4. **Reserved slot + opacity/visibility** for transient badges, spinners, and
   status marks inside a row.
5. **Fixed media geometry** with width/height or aspect-ratio before images,
   canvases, pictographs, and 3D surfaces load.
6. **Equal-width grid/flex tracks** for segmented controls and sibling actions.

After reserving the geometry, `Crossfade` may still communicate a true content
swap without moving its neighbours.

## Direct Manipulation and Reduced Motion

- Pointer dragging and scrubbing follow the pointer immediately. Do not ease
  behind the hand. The release may settle through the canonical motion owner.
- `prefers-reduced-motion: reduce` collapses motion to an immediate accessible
  state. Every JS transition must route through `motion.ts`/`motionDuration()`;
  every CSS transition must have the reduced-motion override supplied by its
  shared owner.
- Initial server/first paint does not animate structural chrome into place.
  Motion explains a state change, not page construction.
- A safety-critical state may change immediately when delay would be harmful.
  This is rare and must be named in the code comment.

These are the only routine exceptions to animated intentional reflow.

## Required Self-Check

For every conditional block and runtime label in a changed surface, answer:

1. Does this alter geometry or move anything else?
2. If no movement is meaningful, where is the space reserved?
3. If movement is meaningful, which canonical owner animates the old geometry
   into the new geometry?
4. What happens when that motion is interrupted halfway through?
5. What happens under reduced motion?

Visual verification must exercise both endpoints and at least one real
transition trigger. A screenshot of only the final state cannot prove motion.

## Forbidden

- Any intentional layout change that snaps to its destination with no canonical
  transition.
- `display: none`/`block` disclosure that reflows surrounding UI instantly.
- Dynamic intrinsic-width labels that push siblings.
- Changing numbers without tabular numerals.
- Async media with no reserved box.
- Feature-local raw milliseconds, easing curves, FLIP helpers, or animation
  stacks that duplicate the shared owners.
- Animating `width`, `height`, `flex-basis`, grid tracks, or transforms during a
  pointer drag so the UI lags behind the pointer.
- Claiming a structural UI change is done without watching the transition and
  checking the required responsive viewports.

## Related

- `docs/architecture/layout-motion.md` — owner boundaries and implementation examples
- `docs/architecture/canonical-capabilities.md` — searchable routing index
- `crossfade-primitive.md` — true content swaps and remount limits
- `visual-verification-mandatory.md` — required visual evidence
- `never-hand-roll.md` — extend an owner instead of creating a parallel behavior stack
