# Arrangements inside Studio

Design, 2026-10-11. Status: awaiting Austen's review. Follows the 2026-10-08
consolidation brief (`docs/specs/studio-compose-consolidation.md`), which moved
Compose into Studio by nesting the old Arrange screen inside it. This spec
replaces that nested screen with Studio's own surfaces. The dead-code sweep of
`features/compose` landed the same day and is assumed here.

## Why

Observed on 2026-10-11 in the editor at `/post`:

- A new arrangement is a Studio project with one `arrangement` item. Selecting
  it offers nine tools: back, arrangement, split, timing, position, fade,
  rename, duplicate, delete. An animation gets look, speed, crop, sequence,
  timing and a transition on top of those; a video adds trim, volume, border,
  effects and beats.
- The arrangement tool is one button, "Edit arrangement". It hides Studio's
  layout, timeline and tools and mounts `ArrangementEditor.svelte`, which is the
  old `ArrangeTab` with persistence off: its own play bar and BPM field, its own
  undo stack, a pill rail (grid, layers, effects, effort, playback, display,
  export) with scope levels (grid, cell, layer, hand, tip), a save-composition
  modal and its own keyboard handler. Apply folds the result into one Studio
  undo step. Cancel discards.
- Cells carry their own effect model (`effect` with five values,
  `tipEffectMap`, `trailMode`, `effort`). Studio animations carry
  `animationAppearance.effects`, a full `EffectsConfig`. Two pickers, two
  translations into the renderer.
- Beat offsets are numbers in a side panel. Studio's timeline shows the
  arrangement as one block with no view of what plays when.
- The Library shows "From Compose" under every filter, does not count those
  rows as arrangements, and lists an opened composition twice: once as a
  project card and once as a From Compose row.

The October 8 brief chose this on purpose as a first step: reuse the Arrange
cell controls, load Arrange only when used, keep nested state isolated. It got
arrangements into Studio projects and exports. It did not make them Studio
clips.

## Goal

Editing an arrangement feels like editing any other Studio clip. The preview is
where cells are picked, moved and resized. The side panel (bottom sheet on
phones) edits the selected cell. Studio's play bar, playhead, music and undo
drive it. The timeline shows each cell's span under the arrangement so offsets
can be dragged. An arrangement gets the same look, speed, effects and
transition tools as an animation, and its cells use the effects system
animations use. Saved arrangements and old Compose compositions keep opening.

Non-goals: a standalone arrangement screen; reviving Compose's timeline, Browse
gallery or full-screen playback (deleted in the sweep); cell media beyond what
the snapshot already allows; a 3D cell.

## Approaches considered

1. **Restyle the nested editor.** Keep `ArrangementEditor`, swap its controls
   for Studio primitives and theme tokens. Cheapest. Still two play bars, two
   undo stacks, two effect pickers, no timeline for offsets, and every Studio
   improvement has to be copied into it by hand. Not chosen.
2. **Grid inside Studio.** Dissolve `ArrangeTab` into Studio: the preview edits
   the grid, Studio panels edit cells, the timeline grows cell lanes, cells
   adopt `PostAnimationAppearance`. The largest build. It touches the editor
   state, the workspace, the timeline, the tool table, the domain schema and the
   preview layer, but each piece reuses something Studio already has, and the
   arrangement stays one clip that splits, fades, transitions and keyframes
   like any other. **Chosen.**
3. **Cells as Studio items.** Each cell becomes an animation item on its own
   track and the arrangement is a layout preset. Most Studio-native, and it
   loses the grid's identity: shared tempo, spans, `skipStartPlacement`,
   four-layer tunnels per cell and the 64-cell backing array would all have to
   be re-expressed as item constraints, a 3×3 grid would be nine timeline items,
   and splitting or transitioning "the arrangement" would stop meaning
   anything. Not chosen. The per-cell lane idea is borrowed from it.

## Design

### Selection

`post-editor-state` keeps `selectedItemId` and gains
`selectedCellId: string | null`, valid only while the selected item is an
arrangement and cleared whenever the item selection changes. Selecting an
arrangement item selects the grid. Clicking a cell in the preview selects that
cell (and the item, if it was not selected). Back from a cell returns to the
grid. Back from the grid clears the selection, as today.

`PostToolSelection` gains `cell?: boolean`. Tool rows in
`post-editor-tools.ts`:

- Arrangement, no cell: back, grid, split, speed, look, effects, transition,
  timing, position, fade, rename, duplicate, delete. `availablePanels` adds
  `transition` for `arrangement`.
- Arrangement cell: back, sequence, layers, offset, look, effects, effort,
  clear.

`grid`, `layers`, `offset` and `clear` are new tool ids. `look`, `effects`,
`effort`, `sequence` and `speed` reuse the existing panels.

### The preview edits the grid

`PostStudioArrangementLayer` gains an `editable` prop, true while its item is
selected, the editor is not exporting and no other layer owns a gesture. In
that mode:

- Each cell is a pointer target. Tap selects it. The selected cell shows a full
  ring (canon §6), never an edge accent.
- Dragging a cell onto another swaps their positions, the rule
  `CompositionGrid` applies today. The drag follows the pointer without easing.
- The selected cell shows `CellResizeHandles`. Spans clamp to the grid and to
  empty neighbours, the rule `applySpanningPreset` and the occupied-position
  map already enforce.
- Empty cells inside `gridRows × gridCols` draw a dashed "Add sequence" target.
  Tapping one opens the Sequence panel for that cell. These targets never draw
  while exporting or when the layer is not editable.
- Right-click or long-press opens the cell menu built by
  `cell-context-menu-builder` (copy, paste, clear, mirror to, duplicate to),
  hosted the way `PostStudioMediaLayer` hosts its menu.
- Pointer gestures run through `beginGesture / gestureStep / endGesture`, so
  one drag is one undo entry.

The layer keeps drawing cells with `ArrangementCellCanvas`. Playback and export
rendering do not change in this section.

### Panels

Every panel mounts in `PostToolPanel`, the side panel on wide screens and the
bottom sheet on phones, like every other tool.

- **Grid** (arrangement): rows × cols as the nine `LAYOUT_PRESETS` chips plus
  steppers up to 8×8; a "Skip start placement" switch; Tempo as a
  `TypeableValue` in BPM with a "Use music tempo" button that appears when
  `hasGrid(project.music)`; a Stagger row with the three offset presets from
  `StaggerControls`, applied across cells in reading order.
- **Sequence** (cell): the existing sequence picker, extended to list the
  cell's layers (up to four) with Replace, Add layer and Remove.
- **Layers** (cell): per layer, the colour pair from `ColorsSection`, the
  mirror / rotate / swap-hands transforms from `TransformSection` applied
  through `arrange-layer-transformer`, a per-layer beat offset, reorder and
  remove.
- **Offset** (cell): beat offset and speed multiplier as `TypeableValue`
  fields. These are the values the timeline lane drags.
- **Look**: `PostAnimationAppearanceTool` on the grid's `appearance` when no
  cell is selected and on the cell's override when one is. The cell's
  left/right prop switches (`leftMotionVisible`, `rightMotionVisible`) live
  here.
- **Effects**: `PostScopedEffectsPanel` on the same appearance object, plus a
  scope row (Cell · Left · Right · Tips) that writes `tipEffectMap` through
  `EffectSelector`. The scope row appears only for a cell.
- **Effort**: `EffortPanel`, writing `appearance.effortPreset`; per-tip efforts
  stay in `tipEffortMap` through the same scope row.
- **Clear** (action): empties the cell's layers in one undo entry.
- **Speed, transition, timing, position, fade, split, rename, duplicate,
  delete** behave as they do for animations. Speed scales item playback the
  way a video clip's speed does.

### Timeline: cell lanes

While an arrangement item is selected, `PostTimeline` draws a `CellLanesBand`
beneath the item's row, after the existing `KeyLanesBand` when the item has
keyframes. The band holds one lane per cell with layers, in reading order,
`KEY_LANE_HEIGHT_PX` tall each, with no cap (grids past 4×4 are rare and the
timeline simply grows). Each lane is labelled with the cell's words, layer
words joined with "+", and draws one bar from the cell's first beat to its
last, in project seconds:

`laneStart = item.start + (beatOffset × 60 / bpm − sourceIn) / speed`, with the
length from `arrange-step-calculator`'s per-cell beat count.

Dragging a bar changes `beatOffset`, snapped to whole beats, Alt for quarter
beats, never below 0. Clicking a lane selects its cell. The arrangement's own
bar on the main row is unchanged. The geometry lives in
`post-timeline-geometry.ts` beside the key-lane functions.

### Playback and tempo

Studio's clock owns playback. `arrangementBeatAt` already maps source seconds
to beats, so `ArrangePlaybackEngine` and its polling go. `snapshot.bpm` stays
the arrangement's tempo. Changing it rescales `sourceIn` and `sourceOut` by
old/new so the clip keeps the same beats, and `duration` follows. "Use music
tempo" copies the music grid's BPM once. It is not a live link.

### One effects system

`ArrangementSnapshot` moves to `schemaVersion: 2`:

- `snapshot.appearance?: PostAnimationAppearance` is the grid default.
- `cell.appearance?: PostAnimationAppearance` overrides it, set flags only,
  read the way `tunnelAppearance` is read over `animationAppearance`.
- `cell.effect`, `cell.trailMode` and `cell.effort` are removed.
  `tipEffectMap` and `tipEffortMap` stay for per-hand and per-tip choices; the
  active effect's parameters come from the resolved `appearance.effects`.
- `beatOffset`, `colSpan`, `rowSpan`, `mediaType`, `speedMultiplier`,
  `leftMotionVisible`, `rightMotionVisible` and `layers` are unchanged.

`migrateArrangementSnapshot(v1): v2` is a pure function. `effect` other than
`none` becomes `appearance.effects = { ...DEFAULT_EFFECTS_CONFIG, activeEffect:
effect }`; `trailMode` becomes `appearance.trail.settings.mode`; `effort`
becomes `appearance.effortPreset` when it names one of the eight presets and is
dropped otherwise. `validateArrangementSnapshot` accepts v1 and returns v2.
`ArrangementCellCanvas` resolves `appearance` into its additional-layer props
the way `PostStudioSequenceAnimationLayer` does, through
`createEffectsConfigState` and `postAnimationTrailSettings`.

Old Compose records (`users/{uid}/compositions` and local legacy records) still
open through `compositionToGridState`, a v1 snapshot and the migration. Nothing
is written back to those records.

### Retired

`ArrangementEditor.svelte`; `composition-root/arrangement-editor.ts`; the
`editingArrangementId` branch and `.arrangement-workspace` in
`PostEditorWorkspace`; `ArrangeTab.svelte`; `PlaybackBar`; `StaggerControls`;
`GridLayoutControls`; `SaveCompositionModal`; `CellEditorPanel` with its
sections, `cell-editor-panel-state` and `ScopeBreadcrumb`;
`CellContextMenuHost` (its builder stays); `arrange-keyboard-handler`;
`arrange-undo-manager`; `arrange-playback-engine`; `arrange-grid-state`, whose
cell operations become pure edits in `post-project-edits.ts`
(`setArrangementGrid`, `setArrangementCellLayers`, `moveArrangementCell`,
`resizeArrangementCell`, `setArrangementCellOffset`,
`setArrangementCellAppearance`, `clearArrangementCell`,
`staggerArrangement`); `arrange-grid-persister` and its test (Studio persists
projects); and the `compose_ui_*` strings only those components used.

Kept and moved: `arrange-composition-converter`, `arrange-grid-serializer`,
`arrange-layer-transformer`, `arrange-step-calculator` and `types` to
`src/lib/shared/media-composition/arrangement/`; `composition-syncer`, the two
repositories, `composition-schemas`, `firestore-paths` and `compose-events` to
`src/lib/features/post/compose-import/`. `ComposeModule.svelte` stays as the
`/compose` redirect until that route retires; then `features/compose` and the
`compose` entry in `feature-flags.ts` go.

### Library

- The "From Compose" section renders only under the All and Arrangements
  filters.
- The Arrangements chip counts Studio arrangement projects plus From Compose
  rows.
- A composition whose Studio project (`studio-arrangement:<id>`) already exists
  is hidden from From Compose. Its card is the one entry.
- The arrangement card subtitle reads "{cols} × {rows} · {n} sequences", with
  `n` the cells that have layers, instead of "Saved arrangement".
- The legacy device-timeline import is unchanged.

### Errors

- A snapshot that fails validation after migration renders a "This arrangement
  can't be read" plate in the preview; its tools reduce to back, rename and
  delete; the project still opens. Logged once with the item id.
- Cell init failures keep the retry overlay `ArrangementCellCanvas` has.
- Sequence picker and cloud errors go through the error handler's toast, once
  per action.
- Drags clamp: cells stay inside the grid, spans stay within empty neighbours,
  offsets stay at or above 0. An invalid drop snaps back and records no edit.
- Migration never throws on missing optional fields. Unknown `effort` or
  `trailMode` values are dropped, not rejected.

### Testing

Silent-bug tests in `tests/unit/post` and `tests/unit/media-composition`:

- `migrateArrangementSnapshot`: v1 fixtures for each effect, trail mode,
  effort and empty value; idempotent on v2; round trip through
  `validateArrangementSnapshot`.
- Pure edits: swap, resize clamp, grid resize keeping out-of-range cells in the
  backing array, stagger order, clear, offset floor.
- Tempo change rescales `sourceIn` / `sourceOut` and keeps the same beats.
- Lane geometry: beats to seconds and back across `speed` and `sourceIn`,
  whole- and quarter-beat snapping, label joining.
- `toolRow` and `availablePanels` for arrangement and cell selections.
- Library: filter visibility, counts, de-duplication, subtitle.
- The existing `studio-arrangement-projects`, `arrangement-persistence` and
  `transform-migration` tests keep passing.

Browser, on the `/test/studio-arrangement` fixture route extended with a probe
for the selected cell and a lane drag: select a cell, change its sequence, drag
an offset lane, undo, redo, reopen, export. Export frames show the cell effect.

### Visual verification

New-surface rules apply: the seven viewports (375×667, 960×412, 820×1180,
1440×900, 1920×1080, 2560×1440, 3840×2160) plus 200% zoom and reduced motion,
on the fixture route and on `/post?project=<arrangement>` against the primary
server after integration. `ui-bust` runs in plan mode before the preview and
panel work starts, comparing two compositions with a real four-cell LOOP grid
(panel beside the preview versus panel below it at tablet widths), and in
review mode after the final phase with a separate reviewer dispatched per
`model-routing.md`, otherwise labelled `self-review — less independent`.
Rubric VR-1; evidence ledger 2026-09-21; calibration NOT CALIBRATED
(2026-09-21).

## Phases

Each phase ships on its own through `wt:finish --route /post`. The nested
editor stays reachable until phase 5, so no phase removes a capability before
its replacement exists.

1. **Schema v2 and pure edits.** Migration, validation, the
   `post-project-edits` functions, tests. No visible change.
2. **Select and edit in the preview.** `selectedCellId`, the editable
   `PostStudioArrangementLayer`, the Grid, Sequence, Layers, Offset and Clear
   panels, the tool rows. The "Edit arrangement" button remains for anything
   not yet covered.
3. **Cell lanes.** `CellLanesBand`, lane drags, Studio's clock owning playback,
   tempo rescale, the music tempo button.
4. **Look and effects.** Appearance at grid and cell level, the scoped effects
   and effort panels, the speed, transition and effects tools on the item,
   `ArrangementCellCanvas` reading `appearance`.
5. **Retire and tidy.** Delete the nested editor and the Arrange UI, move the
   kept services, the Library fixes, string cleanup, the feature flag.

Decisions taken here instead of asked, since Austen said to take the
recommendations: no cap on cell lanes; per-hand and per-tip effect scopes
survive; tempo stays per arrangement with a one-shot copy from the music; the
stagger presets survive inside the Grid panel; there is no long-lived
"classic" editor after phase 5.
