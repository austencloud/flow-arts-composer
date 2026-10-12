# Joined grids in arrangement cells

Design, 2026-10-12. Status: awaiting Austen's review. Follows the 2026-10-11
arrangements-in-Studio spec (phases 1 to 4 on local main; phase 5, retiring
the nested editor, still to come) and the video editor extraction merge
(`f83d23b46c`), which moved the arrangement panels to
`src/lib/shared/post-studio-plugin/ui/`. Paths below are as of that merge.

## Why

Austen, 2026-10-11, on what arrangements inside Studio open up for promo
footage: two performers doing the same thing side by side, two doing different
things, and "two grids as a conjoined grid where one set of performers is
performing on one grid on the left and the other one is performing on the
conjoined version on the right ... two per grid instead of one per grid". He
asked whether the conjoined capabilities reach every cell and arrangement.

What the code does today (read 2026-10-11, not run):

- A join is the sequence's. `SequenceData.conjoined` holds one `GridJoin`
  (`toward`, `steps`) for the whole sequence; Create sets it (the Grid join
  tile, the step cells' right-click submenu) through `GridJoinController`;
  `GridJoinSection` is the one picker. Viewers never offer it.
- A cell stores each layer's whole sequence (`arrangement.ts`, `layerSchema`
  with `passthrough`), so a saved join survives into the cell, and
  `ArrangementCellCanvas` hands the first layer's sequence to `AnimatorCanvas`,
  which derives the join from it. A one-performer cell whose sequence was
  saved joined should therefore draw its pair. No fixture or test covers it.
- A cell with two or more performers drops the join on purpose.
  `resolveAnimationGridJoin(sequence, tunnelLayerCount, gridMode)` in
  `animation-engine/services/animation-grid-join.ts` returns null whenever
  `tunnelLayerCount > 0` ("Overlaid tunnel layers share one grid"), and
  `AnimatorCanvas`, `FrameSystem`, `PlaybackSync`, the engine's init and the
  offscreen exporter all make the same call. Only the first layer's join is
  ever read, and only when it is alone.
- Nothing inside an arrangement can set, change or remove a join. The cell
  menus never get the join controller.
- Export copies each cell's live canvas pixel for pixel
  (`post-studio-frame-compositor.ts`, `drawArrangementCanvases`), so the video
  shows whatever the cell draws.
- The 3D viewer already lets a performer own a join:
  `performer-settings-types.ts` (`gridJoin?: GridJoin | null`, "Undefined
  follows the score; null explicitly uses one shared grid"),
  `PerformerGridPanel.svelte` wrapping `GridJoinSection`, and
  `viewer.setGridJoinScoped`. `CharacterInstanceState` applies it by rewriting
  the loaded sequence with `withSequenceGridJoin`.

So the picture Austen described, two performers on each grid of one pair, is
not possible in a cell. The nearest thing today is two one-performer cells,
each with a joined sequence: two pairs, one performer per grid.

## Goal

A cell with any number of performers can draw one joined pair, every
performer's blue hand on blue's grid and red hand on red's. A cell follows its
first sequence's join by default and can own a join of its own, picked with
the same picker Create and the 3D viewer use, undone like any other cell edit,
saved with the project and exported as drawn. Viewing surfaces stay as they
are: the join is still never a viewer setting.

Non-goals: per-layer joins (one cell, two different pairs); one grid per
performer side by side (two cells already do that); an arrangement-wide join
default; changing how far apart or how large joined grids draw; 3D cells.

## Approaches considered

1. **Lift the layers rule only.** Every overlaid layer shares the first
   sequence's join; no new field, no UI. Smallest change, and it already gives
   "two per grid" for sequences saved joined. But composing a pair out of
   sequences saved on one grid means going back to Create, re-saving each, and
   re-picking them in the cell. Not enough on its own.
2. **Cell-owned join.** Lift the rule, and give the cell an optional join:
   undefined follows the first sequence, null forces one grid, a join is the
   cell's pair. Applied by rewriting the first layer's sequence with
   `withSequenceGridJoin`, the way a 3D performer applies its override, so the
   engine keeps reading the join off the sequence it plays. One new tool on
   the cell, reusing `GridJoinSection`. **Chosen.** It mirrors the 3D performer
   model field for field, and the arrangement cell, like a performer, is an
   authoring surface, not a viewer.
3. **Per-layer joins.** Each layer picks a join, or picks which grid of the
   pair its hands use. Two layers with different joins would put four grids on
   one canvas; the layout Austen described needs none of it. Not chosen.

## Design

Files, by owner:

| Concern                  | File                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| Join resolution, shifts  | `src/lib/shared/animation-engine/services/animation-grid-join.ts`          |
| Per-frame prop shift     | `src/lib/shared/animation-engine/services/managers/frame-system.ts`        |
| Sub-sample shift         | `src/lib/shared/animation-engine/services/motion-sub-sampler.ts`           |
| Cell schema and type     | `src/lib/shared/media-composition/domain/arrangement.ts`                   |
| Cell join rules          | `src/lib/shared/media-composition/domain/arrangement-grid-join.ts` (new)   |
| Snapshot edit            | `src/lib/shared/media-composition/domain/arrangement-edits.ts`             |
| Project edit, undo       | `src/lib/shared/media-composition/domain/post-project-edits.ts`            |
| Cell preview             | `src/lib/shared/media-composition/components/ArrangementCellCanvas.svelte` |
| Tool row and definitions | `src/lib/shared/post-studio-plugin/ui/tka-row.ts`, `tka-tools.ts`          |
| Grids panel              | `src/lib/shared/post-studio-plugin/ui/PostArrangementTool.svelte`          |
| Cell right-click menu    | `src/lib/shared/post-studio-plugin/ui/post-arrangement-cell-menu.ts`       |
| Harness                  | `src/routes/test/studio-arrangement/fixture.ts`, `+page.svelte`            |
| Canon                    | `docs/architecture/canonical-capabilities.md` (joined grids section)       |

### Engine: overlaid layers share the sequence's join

- `resolveAnimationGridJoin(sequence, gridMode)` loses its `tunnelLayerCount`
  parameter. The six callers change with it: `AnimatorCanvas.svelte` (the
  `gridJoin` derived), `frame-system.ts` (`buildFrameParams`),
  `playback-sync.ts` (`syncGridJoin`), `animation-engine.svelte.ts` (init),
  `video-export/services/offscreen-export-renderer.ts`, and the mandala test.
- `FrameSystem.applyGridJoin` already moves the base pair onto their grids
  with `shiftPropState` into two scratch states. It now does the same for
  every entry of `params.props.additionalLayers`, through a new pure helper in
  `animation-grid-join.ts`:
  `shiftLayerProps(layers, offsets, pool): AdditionalLayerProps[]`, which
  writes shifted copies into a reused pool (one scratch left and right state
  per slot, the layer's other fields copied over) and never mutates the host's
  layer objects. `params.props.additionalLayers` is replaced with the pooled
  array for the frame, as `leftProp` and `rightProp` are replaced today. With
  no join and no slide it returns the host's array untouched.
- Trails, effects and tips need no change of their own. Layer trails are
  captured live from the drawn props (`TrailCapturer.fillTrailPointArrays`),
  and fire, LED and the other effects read tips off
  `params.props.additionalLayers`, so they follow the shifted copies. The base
  pair's cached trail points keep their existing shift. The mandala guide draws
  the base pair only, and the elemental glyph already hides with layers.
- The motion sub-sampler compares each layer's sampled pose at the current
  step against the live layer and rejects the layer when they differ
  (`layerGuardRejections`). After the shift they always differ by the grid
  offset, so without a matching change every layer on a joined cell would
  silently lose its sub-samples. `MotionPlanInput` gains
  `gridJoinOffsets: HandOffsets | null`; `plan()` compares shifted samples to
  the live layers and fills `sample.layers[i].left/right` with shifted pooled
  states instead of raw references. `OrchestratorMotionSampleSource` already
  shifts the base pair the same way.
- Outside arrangements two hosts overlay layers: the viewer's Tunnel copies
  (`ViewerMotionSurface.svelte`, `tunnelLayers`) and Studio's tunnel hook
  (`PostStudioSequenceAnimationLayer.svelte`, `hookLayers`). With the rule
  gone, a joined sequence shown with either now draws its pair, copies shifted
  like the base pair, formation offsets added on top. Decision: accept. It is
  the sequence's own join and the copies are the same sequence; a formation of
  a joined sequence on one grid was a side effect of the rule, not a design.
  Flagged for Austen below.

### The cell's join

- `ArrangementCell` gains `gridJoin?: GridJoin | null`: undefined follows the
  first layer's sequence, null draws one grid, a join is the cell's pair. The
  same tri-state as the 3D performer, in the same words.
- `arrangementCellSchema` gains `gridJoin: z.unknown().optional()`. The
  resolver, not the schema, decides what a stored value means, so a malformed
  value from an older build follows the sequence instead of making the whole
  arrangement unreadable. Migration needs nothing: v2 cells pass unknown fields
  through, and v1 cells never carried one.
- New `arrangement-grid-join.ts`:
  - `arrangementCellGridJoin(cell): GridJoin | null`. Null when `gridJoin` is
    null; the stored join when `isGridJoin` accepts it; otherwise the first
    layer's `sequenceGridJoin`, or null with no layers.
  - `arrangementCellFollowsSequence(cell): boolean`, true when `gridJoin` is
    undefined.
  - `arrangementCellSequence(cell): SequenceData | null`, the first layer's
    sequence carrying the cell's resolved join through `withSequenceGridJoin`.
    This is the one place the join is applied. `withSequenceGridJoin` returns
    the same object when nothing changes, so a cell without an own join renders
    with the identical sequence object it uses today.
- `arrangement-edits.ts`: `setCellGridJoin(snapshot, cellId, join)` with
  `join: GridJoin | null | undefined`. Same snapshot back when the cell is
  missing or the value already matches (`gridJoinsEqual`, with undefined
  compared on its own); undefined removes the field rather than storing it.
  `clearCell` drops `gridJoin` along with the layers.
- `post-project-edits.ts`: `setArrangementCellGridJoin(project, itemId,
cellId, join, ctx)` through `editArrangement`, one undo step. The labels
  follow the 3D viewer's: "Join grids", "One grid", "Use sequence grids".

### Cell preview

- `ArrangementCellCanvas` derives `cellJoin = arrangementCellGridJoin(cell)`
  and `cellSequence = arrangementCellSequence(cell)`. `cellSequence` replaces
  `primaryLayer.sequence` as the `sequenceData` prop of `AnimatorCanvas` and as
  the card's sequence in the choreo-card branch, so a card cell draws the same
  pair. The orchestrators keep the stored sequences: a join moves where props
  are drawn, not how they move.
- The cell root gets `data-grid-join={animationGridJoinKey(cellJoin)}` ("e1",
  "n2", "" for one grid). It is the runtime evidence the harness and the
  browser pass read; nothing else uses it.
- Export is unchanged. The compositor copies the live cell canvases.
- A cell or arrangement Look with the grid hidden (`gridMode: "none"`) still
  places the hands on their grids; only the dots disappear, exactly as the
  single animation behaves with its grid hidden.

### The Grids panel

- The cell tool row becomes `back, sequence, layers, grids, offset, look,
effects, effort, clear` (`tka-row.ts`, with `tka-row.test.ts` updated).
  `tka-tools.ts` adds the panel tool `grids`, label "Grids", icon
  `faObjectGroup`, distinct from the arrangement's "Grid" tool
  (`faTableCellsLarge`), which sets rows and columns.
- `PostArrangementTool.svelte` renders the panel for `tool === "grids"`,
  modelled on `PerformerGridPanel`:
  - a status line: "Using sequence grids", "One grid" or "Joined grids";
  - a "Use sequence grids" button, disabled while the cell already follows;
  - `GridJoinSection` in controlled mode: `pictograph` is the first layer's
    start placement (`startPlacement`, else `startingPlacement`, else the
    first step), `gridMode` the first layer's `sequence.gridMode`, `join` the
    resolved cell join, `onChange` calls `setArrangementCellGridJoin`,
    `leftPropType` and `rightPropType` from `arrangementCellLook(...).propType`
    when set, `compact` inside the phone sheet, `embedded`.
  - An empty cell shows "Add a sequence under Sequence first." `locked`
    disables everything, as the other cell panels do.
- `post-arrangement-cell-menu.ts` adds a "Grids" entry that opens the tool
  (`ArrangementCellMenuTool` gains `"grids"`), beside Sequence, Layers and
  Offset.
- No new picker, no new styling: the panel is the existing section inside the
  existing panel frame.

### Canon

The joined grids section of `docs/architecture/canonical-capabilities.md`
names the arrangement cell as a join owner next to the 3D performer, replaces
the sentence that overlaid tunnel layers keep one grid, and corrects the
paragraph that still describes the retired 2D Conjoined switch (open chip
"Fix stale conjoined-switch lines in capabilities doc"). The rule "part of the
sequence, never a viewer setting" stays, with the cell listed as an authoring
owner.

### Errors

- A malformed stored `gridJoin` follows the sequence; nothing is logged and
  the arrangement opens.
- `setCellGridJoin` on a missing cell returns the snapshot unchanged and
  records no edit.
- A first layer with no start placement previews the picker on its first
  step; a cell with no layers shows the hint and no picker.
- A join changed while the cell plays goes through the engine's existing
  `syncGridJoin`: streaks and flames clear, the grid texture reloads, and the
  same sequence slides to the new layout.

### Testing

Silent-bug tests, run with `npm run test:ci -- <paths>`:

- `tests/unit/animation-engine/animation-grid-join.test.ts`: "keeps tunnel
  layers on one grid" becomes "layers share the sequence's join"; new cases
  for `shiftLayerProps`: each layer moves by the hand offsets, the host's
  layer objects are untouched, other fields (opacity, prop types, flags) are
  carried, and no join returns the host's array.
- Sub-sampler: with offsets set, layer samples carry the shift and the guard
  accepts live layers that were shifted the same way; with offsets null the
  behaviour is unchanged. Extend the existing sub-sampler test file if there
  is one, else add `tests/unit/animation-engine/motion-sub-sampler-join.test.ts`.
- New `tests/unit/media-composition/arrangement-grid-join.test.ts`:
  `arrangementCellGridJoin` for undefined, null, a join, a malformed value and
  an empty cell; `arrangementCellSequence` returns the identical object when
  nothing changes and a rewritten one otherwise; `setCellGridJoin` identity on
  equal values, removal on undefined, and `clearCell` dropping it; the schema
  round-trips a join and a null through `validateArrangementSnapshot`.
- `tka-row.test.ts`: the cell row includes `grids` after `layers`.
- The existing arrangement, persistence and migration tests keep passing.

### Visual verification

The fixture gains two cells: a two-layer cell with `gridJoin: {toward: "e",
steps: 1}` and a one-layer cell whose sequence carries
`conjoined: {toward: "n", steps: 2}` and no cell join. On
`/test/studio-arrangement` against the primary server after integration:

- `data-grid-join` reads "e1" on the first and "n2" on the second.
- A screenshot of the two-layer cell shows two grids with both layers' blue
  props over blue's grid and both red props over red's.
- Grids tool on the first cell: pick north, two points, and the attribute
  reads "n2"; undo returns "e1"; "Use sequence grids" reads "" because that
  layer's sequence has no join; redo and undo behave; the saved project
  (`__studioArrangementFixture.savedProject`) carries the field.
- Export runs to a blob; the cells are copied canvases, so no frame decode is
  planned.
- The viewer's Tunnel on a joined sequence: one screenshot showing the copies
  on the pair, as the accepted side effect.
- Viewports 375×667 (sheet), 820×1180 (panel below) and 1440×900 (panel
  beside), 200% zoom and reduced motion on the panel. The picker itself is an
  existing surface already verified in Create and the 3D viewer, so the full
  seven-tier matrix is not planned; a short `ui-bust` review of the panel runs
  at the end, calibration NOT CALIBRATED (2026-09-21) as in the sibling spec.

## Phases

Two merges, each through `wt:finish --route /post` from the primary checkout.

1. **Layers share the join.** The engine changes, their tests, the viewer
   Tunnel check and the canon sentence. Branch `codex/layers-share-join`. This
   is the shared, higher-risk half, so it lands and is looked at on its own.
2. **The cell's join.** Field, schema, resolver, edits, cell preview, Grids
   panel, menu entry, fixture, tests, canon owner list, the browser pass.
   Branch `codex/cell-grid-join`.

Coordination: the video editor extraction has merged, so its hold on the
arrangement files is over, but the 2026-10-11 agreement stands: tell that
session before editing `arrangement.ts`, `arrangement-edits.ts` or the plugin
UI files, and do not touch the shared editor package itself.

Decisions taken here rather than asked, for Austen to overturn: the viewer's
Tunnel and Studio's tunnel hook follow a joined sequence's join; no
arrangement-wide join default; the undefined, null, join tri-state is copied
from the 3D performer; Grids sits after Layers in the cell row; the schema is
lenient and the resolver strict.
