# Layout motion

**Repository status (2026-10-14):** App-facing motion primitives come from `src/lib/shared/transitions/motion.ts`, which re-exports `@austencloud/motion`.

Layout motion is an interaction contract, not decoration. It connects two
states so the eye can follow what moved, appeared, disappeared, or changed
size. Flow Arts Composer prevents meaningless movement and animates meaningful movement.

## One system, shared owners

| Geometry change                                          | Owner                                    | Why                                                                            |
| -------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| True content swap                                        | `Crossfade.svelte`                       | Holds both states in one box; `animateHeight` carries a material height change |
| One element enters/leaves normal flow                    | `growFade()`                             | Animates the element's own box and opacity                                     |
| Flex workspace panel enters/leaves or changes allocation | `PanelGroup.svelte` + `flexPresence()`   | Moves the neighbouring panels on the same clock as the entering/leaving panel  |
| Keyed list reorder                                       | Svelte `animate:flip` + `flipDuration()` | Svelte already owns stable keyed geometry                                      |
| Several surviving elements recompose                     | `createLayoutMotion()`                   | Captures old rectangles and animates survivors across grids or keyed families  |
| A content-sized dialog changes its natural height        | `BaseModal` with `animateSize`           | Keeps the dialog frame continuous without scaling or remounting its contents   |

Small non-reflowing overlays use `flyFade()` or `popIn()`. Route/module
navigation keeps using the native view-transition rules in the app CSS.

All JavaScript durations come from `DURATION` in
`shared/transitions/transitions.ts`. CSS uses the matching
`--transition-*` tokens in `src/app.css`. The helpers in `motion.ts` collapse
their duration when the user prefers reduced motion.

## Decision order

1. Ask whether the movement communicates anything.
2. If it does not, reserve geometry. A label, counter, image, or spinner should
   not move its neighbours simply because its content changed.
3. If it does, choose the narrowest owner from the table.
4. Check interruption. A second click halfway through must continue from the
   visible frame, not jump to an old endpoint.
5. Check reduced motion and direct manipulation. Dragging follows the pointer;
   reduced motion reaches the final state immediately.

## Structural panels

`PanelGroup` writes `flex-grow`, `flex-shrink`, and `flex-basis` separately so
those allocations can transition. A fixed dock changes `flex-basis`; an editor
changes `flex-grow`; mount/unmount uses `flexPresence`. Resize-handle slots use
`growFade`, and direct pointer drag temporarily disables easing so the divider
does not lag behind the hand.

Feature code supplies panel definitions and state only:

```svelte
<PanelGroup direction="vertical" panels={workspacePanels} bind:sizes />
```

Do not animate the same panel again inside its feature. Child content may fade
or crossfade, but `PanelGroup` owns the structural allocation.

### Compositor edge

A heavy workspace can't afford a layout pass on every frame of a slide, so
`compositorEdge` opts a group out of the allocation transition. Create's Play
and Stop are the first users. The mode applies only when the moving panel is
the last one, has `revealContent`, and a flexible neighbour absorbs the
change. In any other arrangement the group falls back to the ordinary slide.

- The group takes its end layout once, on the change frame. The moving panel
  then travels by `transform` from where it stood. Its content stays laid out
  at the held size until it settles.
- A descendant marked `data-panel-flip="<key>"` rides the same clock. Mark
  every control that would otherwise jump with the edge, such as a button row
  or a header badge. `shared/panels/compositor-travel.ts` owns the travel of
  the panel and its riders.
- `data-panel-motion="compositor"` stays on the root until every travel ends,
  and `PANEL_SETTLE_EVENT` fires once at rest.
- An interrupting change never replaces a running travel. Each mover is
  measured just before and just after the layout change, in the same task,
  with nothing cancelled or seeked in between. The page's animation clock
  does not move inside a task, so the running travel adds the same offset to
  both readings and the difference is the pure layout shift. A second
  animation from that shift to zero runs on the mover's other channel (the
  CSS `translate` property or `transform`; a rider keeps its resting
  transform behind the offset). Both stay on the compositor, so a reversal
  curves instead of jumping. A third change while both channels are busy
  brings the mover to its present position with `seekToPresent`, measures,
  and replaces. Stop, the safety timer and the fallback cancel every channel.
- The page's animation clock also stands still through a long task, and so
  does the time a frame reports. A correction handled after one (Stop tapped
  while Play's player mounts) took that stale start and finished before its
  first frame, so the panel landed in one step. A correction therefore starts
  on `performance.now()` at the next animation frame, with `fill: backwards`
  holding its first keyframe until the page's clock catches up. A first travel
  keeps the start the compositor reports.
- Under reduced motion the change lands at once.

A heavy source switched beside the edge uses `DualSourceCrossfade` with
`settleInert`. Pointer input moves to the shown side at once. The `inert` swap,
which restyles the whole subtree, waits for the group's settle. The fade's
duration and delay sit on each source, not as custom properties on the root:
an inherited value that changes with the direction restyles every element in
both sources.

## Multi-element recomposition

`createLayoutMotion()` is the generic FLIP owner. It tracks stable dataset keys,
captures rectangles before Svelte updates the DOM, and plays after the update.
It intentionally keeps the historical `layout-flip.ts` file path and deprecated
grid-named aliases so existing imports remain source-compatible.

Use it when survivors change tracks, columns, sizes, or element families. Do
not use it for a single conditional row or for pointer-driven movement.

## Sequence edits inside a pictograph

When a sequence edit changes what an existing pictograph shows, the drawing
animates from the old picture to the new one through a single owner in the
pictograph renderer, so every surface that draws the step moves the same
way. The join slide (`shared/grid-join/join-slide.svelte.ts`) is the first:
re-joining the grids glides each hand's grid, props and arrows over
`GRID_JOIN_TWEEN_MS`. A different drawing snaps, an interruption restarts
from the shown frame, and reduced motion snaps.

Sequence transforms (rotate, mirror, flip, swap hands, invert) follow the same
rule through `shared/pictograph/shared/state/pictograph-edit-motion.svelte.ts`.
The transform announces its edit just before the sequence commits; each live
`PictographContainer` whose drawing changes joins one shared clock, holds its
old drawing while the old arrows fade, carries the props along the edit's path
(`shared/pictograph/shared/services/pictograph-edit-travel.ts`: rotate arcs
round the center, mirror and flip dash across the axis, swap trades places,
invert spins in place) through `calculatePictographMotionPositions`, then
fades the new arrows in. A grid cell whose drawing changes unannounced (undo,
a turns edit) travels on the same clock; a newly generated sequence snaps.
`PropSvg` and `ArrowSvg` paint the positions they are given and keep no
transform transitions or position caches of their own.

## Verification

Content-sized dialogs opt into `BaseModal.animateSize`; the shared
`createIntrinsicHeightMotion()` controller owns their height. A CSS transition
on `height: fit-content` does not animate a content change when the declared
height value stays the same. Do not add a feature-local observer or layer a
second CSS height transition over the controller. Keep width changes with the
existing shell owner and leave direct pointer resizing immediate.
The frame keeps its measured height between observations; its nonshrinking
content wrapper remains the independent source of natural geometry. Clear the
owned height on teardown, not between transitions. Observe both the OS setting
and the app's `data-motion-preference` setting, including changes mid-animation.

A button whose label changes its width (a lesson's "Next" becoming
"Continue to Hand Placements") uses the same controller on the other axis:
`createIntrinsicSizeMotion(button, { dimension: "width", release: true })`.
Measure the width before the label commits, measure the natural width after,
ease between them, and fade the new words in with `createDestinationFade`.
`release` hands the width back to content sizing when the ease lands, so a
container query can still make the button full width. `LessonStageControls`
is the consumer.

Outgoing `Crossfade` layers remain painted during their outro but become inert
and hidden from assistive technology. Rapid reversal must restore only the
current controls. Heavy live cards and video players retain their existing
lifetime; a settings change is not a reason to remount their rendering subtree.

For every structural change:

- exercise the trigger in a real browser;
- observe the old state, motion path, and final state;
- trigger it again before the first transition finishes;
- verify `prefers-reduced-motion: reduce`;
- check the required responsive viewports from
  [visual-verification-mandatory.md](../../.claude/rules/visual-verification-mandatory.md) and confirm that controls do not resize
  their neighbours while labels/icons swap;
- check for console errors.

For intrinsic resizing, sample frames after the actual input. Require heights
between the two endpoints and test interruption, settlement, and viewport
containment. Final screenshots, declarations of `transition`, and intercepting
an `animate()` call cannot establish that the visible dialog moved correctly.

The source contract test keeps the routing rule, canonical exports, shared
PanelGroup integration, and Stage's single mounted timeline connected.
