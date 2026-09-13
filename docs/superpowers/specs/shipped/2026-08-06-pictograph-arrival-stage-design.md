# Pictograph Arrival Stage

**Status:** Shipped. Implemented and browser-verified 2026-08-12. Moved out of
`active/` on 2026-09-13 during spec reconciliation.

**Reconciliation evidence (2026-09-13):** all eight named deliverables resolve.
`963121a4d` (_feat(create): animate pictographs into the step grid_) created
`PictographArrivalStage.svelte` and the three domain modules; `d3d5227b6` and
`8be948936` followed. Every literal target in this document is present in the
source: the six-phase machine (`PictographArrivalStage.svelte:22-27`), the 280ms
focus pull / 350ms vignette after a 50ms delay / 0.58 peak scrim / 120ms hold /
280ms landing, the clamped prop rate
`clamp(max(850, effectiveDegrees/360 deg/s), 850, 2000)` computed from
`staffRotationDelta` rather than turn count
(`pictograph-arrival-motion.ts:6-36`), the `visibility: hidden` destination
(`WorkspaceGrid.svelte:1414`), and the four-column Construct policy pinned at
`StepGrid.svelte:265` and applied only above 650px. `StepCell.svelte` is a static
renderer again. Tests: `tests/unit/create/pictograph-arrival-layout.test.ts`,
`-geometry.test.ts`, `step-grid-arrival-state.test.ts` and
`create-workspace-grid-layout.test.ts` pass (29 assertions). The browser trace
recorded below is the original 2026-08-12 evidence and was not re-measured.

**Date:** 2026-08-06

**Surface:** Create > Construct workspace

## Outcome

When a Construct option is committed, show that one new transition at a readable
size over the workspace, then land the completed pictograph in its reserved step
grid slot. This is a one-time arrival animation, not workspace playback. The
green Play control continues to open the Sequence Viewer for full-sequence
playback and exploration.

The arrival teaches the selected transition without requiring a guide and stays
legible when the grid has compressed into small mobile cells.

## Interaction Contract

The committed step passes through these phases:

```text
idle -> preparing -> entering -> moving -> holding -> landing -> handing-off -> idle
```

1. The large card fades and scales forward from 92% to full size. A lighter
   vignette follows 50ms later so the card explains the focus change before the
   workspace dims. The card already shows the previous step's ending pose
   during this focus pull.
2. The glyph is visible at bottom-left and the step number at top-left. Arrows
   begin hidden.
3. The props animate to the committed step's ending pose at a rate derived from
   the larger Blue or Red effective staff rotation. The arrow layer fades from
   hidden to fully visible on the same progress clock.
4. The completed pictograph remains still long enough to read.
5. The entire pictograph shrinks and moves into the measured destination slot
   while the scrim fades out.
6. The destination cell paints underneath the landed stage card for one full
   frame. The stage renderer is removed on the following frame.

The stage never renders a mandala.

### Timing targets

- Card focus pull: 280ms
- Vignette fade: 350ms after a 50ms delay, peaking at 58% opacity
- Prop motion and arrow fade: 850ms to 2000ms, based on effective rotation
- Completed-pictograph hold: 120ms
- Landing: 280ms
- Stage-to-cell overlap: one painted frame

The start pose remains visible throughout the focus pull. The card uses a
decelerating scale with no bounce, blur, or directional slide because this
animation repeats after every committed option. These values are tuning targets
and may move after frame review, but the phase ordering is fixed.

### Prop-rate contract

The instructional prop motion uses linear progress. Card entrance, scrim, and
grid landing retain their own easing because they describe interface geometry,
not the authored prop rotation.

The preview gives Blue and Red one shared clock. Its duration is calculated from
the larger absolute `staffRotationDelta` returned by the canonical animation
endpoint calculator:

```text
duration = clamp(max(850ms, effectiveDegrees / 360° per second), 850ms, 2000ms)
```

Raw turn count is not the timing input. A zero-turn shift still contains base
rotation, while a zero-turn dash or static can contain no staff rotation. Using
the effective delta keeps the preview aligned with the renderer's actual path.
The 850ms floor keeps ordinary options readable, and the 2000ms cap keeps the
frequent option-selection interaction responsive. This clock affects only the
arrival preview. It does not write or reinterpret the step's authored duration.

### Expert-speed behavior

The option picker remains usable while an arrival is active. A newer committed
selection immediately settles the current arrival into its destination and
starts the new arrival. No selected step is dropped or reordered, and the user
does not wait for the full presentation before continuing.

Undo, step editing, tab changes, sequence replacement, and component teardown
must settle or cancel the stage without leaving an invisible destination cell.

### Reduced motion

Under either the app preference or `prefers-reduced-motion`, show the completed
pictograph at the large stage size briefly, then reveal the destination without
prop movement or a geometric landing animation. The animated duplicate is
`aria-hidden`; a polite live region announces the committed step. The stage is
not a dialog and never traps focus.

## Responsive Presentation

The stage is bounded to the workspace, not the viewport. Its card consumes
roughly 80% of the workspace's limiting dimension, with container-query caps
that grow at large workspace sizes. A short or narrow workspace always favors
the largest card that fits inside its safe inset.

The grid remains in layout under a dim vignette. The entire destination tile is
hidden with `visibility: hidden`, so its opaque surface cannot appear as a black
placeholder while its rectangle remains measurable. Scrolling and column
changes occur behind the vignette. The destination rectangle is measured again
immediately before landing so a responsive reflow cannot send the card toward
stale coordinates.

### Construct grid stability

The standard Construct grid uses a stable wide-workspace policy so committing a
step does not make every existing pictograph jump to a newly optimized table:

- Non-LOOP sequences use one step column per step through four steps, then stay
  at four step columns.
- Cell size comes from the available width in this mode. Adding another row
  cannot silently resize every existing cell.
- Circular sequences keep the explicit LOOP-aligned column count. That
  structural layout takes precedence over the four-column baseline.
- Workspaces below the existing narrow breakpoint retain the responsive
  readability policy. Timeline mode retains its duration-based row contract.

When an intentional structural change remains outside an arrival, persistent
standard-grid items use Svelte's size-aware FLIP animation. Arrival owns a
stronger coordinated transaction that works in both the standard grid and the
duration-based timeline layout.

The document commits the new step immediately, but the grid's presentation list
omits that staged final step throughout preview. At the start of landing, the
workspace captures the real rectangles of the Start tile, every retained step,
and retained mandala cells. The same synchronous state flush changes the arrival
request to `landing`, which inserts the complete final layout. Auto-scroll is
applied before the final rectangles are read.

Each retained grid item then receives an inverse translate-and-scale transform
from its captured rectangle to its final rectangle. The transform origin is the
top-left corner so the first animated frame exactly matches the held geometry,
including simultaneous movement and resizing. The incoming card targets the
new cell's real final rectangle. Grid movement, card contraction, and scrim fade
share the same 280ms duration and `cubic-bezier(0.4, 0, 0.2, 1)` easing. No
predicted or center-offset-adjusted target rectangle is used.

The arriving destination stays hidden because the arrival stage owns its entry.
Svelte's declarative FLIP and the grid surface transition are disabled during
this transaction so transforms cannot compound. Deletion and clear workflows
keep their existing motion. Reduced motion collapses the geometric duration to
zero.

## Ownership and Reuse

### Reuse

- `PictographContainer.svelte` already owns preparation, the exact start-to-end
  prop interpolation, arrow opacity, glyph visibility, and step-number override.
- `pictograph-motion-positioner.ts` remains the canonical geometry calculation.
- `step-grid-display-state.svelte.ts` remains the per-grid reactive state owner.
- `motion.ts` and the existing transition duration tokens provide the shared
  reduced-motion and timing conventions.
- The absolute overlay structure follows `ExportTakeover.svelte`, without its
  dialog role, focus behavior, or full takeover styling.

### Extend

- Extend `WorkspaceGrid.svelte` with destination registration and a reserved,
  visually hidden arrival state.

### Create

- Create `PictographArrivalStage.svelte`. No existing component combines a live
  pictograph motion sequence with a measured grid destination and exact visual
  ownership handoff. `BaseModal` and `MediaSpotlight` are incompatible because
  they own dialog or full-screen interaction semantics.

### Remove

- Remove motion-preview timers, requestAnimationFrame ownership, and renderer
  overrides from `StepCell.svelte`. A step cell returns to rendering a finished
  static pictograph.

## Failure Handling

- Missing or disconnected destination: reveal the final cell and close the stage.
- Resize or scroll during motion: remeasure before landing.
- New selection during motion: reveal the old destination and start the new stage.
- Sequence replacement or undo: clear the stage before the replacement paints.
- Preparation timeout: reveal the final destination. Never leave the grid blank.
- Unsupported `Element.animate()`: reveal the destination immediately.

## Landing Technology Decision

The landing stays on the live arrival renderer and uses `Element.animate()`
with a measured translate and scale. Element-scoped View Transitions were
investigated because the repository already uses named document transitions,
but they replace the live source with browser snapshots at the DOM update
boundary. That conflicts with the stronger contract here: one live
`PictographContainer` must own prop motion, arrow reveal, and the complete
flight into the grid. The destination renderer takes over only after that
flight has finished.

## Verification

### Silent-bug tests

- State-machine ordering and request supersession.
- Geometry conversion between stage and destination rectangles.
- Missing-target and teardown recovery.
- Reduced-motion phase collapse.
- A newer request never hides an older destination after superseding it.

### Browser proof

- Instrument prop transforms and stage/destination rectangles around handoff.
- Assert that no prop transform changes after ownership moves to the cell.
- Confirm exactly one visible pictograph during every sampled frame.
- Exercise rapid selection, undo, resize, scroll, and a long sequence.
- Exercise 3 to 4 steps, 4 to 5 steps, and a non-LOOP to LOOP column change.
- Capture and inspect 1920x1080, 2560x1440, 3840x2160, 1440x900,
  820x1180, 960x412, and 375x667.

### 2026-08-12 verification record

- A 4-to-5 step arrival was sampled throughout landing. An existing step began
  at its exact held rectangle (`396.54, 236.63, 302.00`) and progressed through
  seven distinct translated and scaled frames before settling at
  (`276.05, 357.63, 180.99`).
- The Start tile was sampled independently. It began at its exact held rectangle
  (`94.55, 236.63, 302.00`) and progressed through six distinct frames before
  settling at (`95.06, 357.63, 180.99`).
- The stage card and all retained grid items used a 280ms landing with
  `cubic-bezier(0.4, 0, 0.2, 1)`.
- The required viewport set was captured and inspected. The page reported no
  console warnings or errors after the responsive sweep.
- Focused unit coverage passed 14 tests across arrival presentation, geometry,
  rate calculation, and state ownership. Chromium component coverage passed all
  3 arrival-stage tests, including release-before-destination-measure ordering.
- On 2026-08-12, prop timing was changed from fixed 850ms cubic easing to a
  linear, effective-rotation-aware clock. Runtime sampling measured a 3-turn
  shift at 1750ms with progress `0.0000, 0.1333, 0.2762, 0.4095, 0.5619,
0.6953, 0.8476, 0.9714` across roughly 250ms intervals. A zero-turn option
  retained the 850ms floor. The console reported no warnings or errors.

## Acceptance Criteria

- The start pose matches the previous pictograph's final prop coordinates.
- Props visibly interpolate to the new pose while arrows fade in on the same
  timeline.
- The large pictograph remains readable on mobile.
- Grid rearrangement never competes with the staged motion.
- A wide non-LOOP Construct grid stays at four step columns after step four,
  with width-owned cell size that does not change when a row is added.
- Intentional LOOP and responsive reflows animate persistent grid items rather
  than repainting them at their destination rectangles in one frame.
- The final stage frame and first destination frame match in geometry and content.
- No twitch, stale prop position, duplicate pictograph, blank frame, or layout
  shift appears at handoff.
- The Play control and Sequence Viewer behavior remain unchanged.
