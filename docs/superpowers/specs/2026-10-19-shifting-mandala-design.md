# Shifting mandala (Mandala 2.0) design

Date: 2026-10-19. Status: approved in conversation (sections 1 and 2 by Austen, section 3 delegated to the session).

## What it is

A mandala that shifts between a chosen, ordered set of sequences in time with the music, as a Studio clip and as an arrangement cell. The look Austen praised is the change morph in `SequenceMandala.svelte` (lines flow into lines). Today that morph runs on the wall clock and never meets the breathing; nothing in TKA draws a mandala as a function of post time, so a Studio preview and its exported file could not agree. This design adds one renderer that is a pure function of a beat clock, and two places that feed it that clock.

Decided in brainstorming: shifts between a chosen ordered set of sequences; rhythm from music beats; home is a new Studio clip; cells come in as a mandala cell media type; the morph look is lines flow into lines; Approach A (new time-driven item kind plus a cell type, one renderer shared by preview and export).

## 1. Model and clock

### The Mandala item

A new plugin item kind `mandala` in `src/lib/shared/post-studio-plugin/item-kinds.ts`:

```
PostMandalaItem = itemBase + {
  kind: "mandala"
  sequences: MandalaSequenceSnapshot[]   // 0..8, ordered; the mandala shifts down the list and wraps
  shift: MandalaShift                    // { every: 1 | 2 | 4, unit: "bars" | "beats", morph: 1 | 2 | 4 }  (morph in beats)
  look: MandalaLook                      // below
  sourceIn, sourceOut, speed             // the core's clip fields; speed stays 1
}
MandalaSequenceSnapshot = { id: string; name: string; sequence: SequenceData }   // the full record, as arrangement layers carry it
```

Defaults: shift every 1 bar, morph 2 beats. The kind is `mainTrack: true`, `transitionVisual: true`, and declares `sourceLength` as an endless source (`MANDALA_SOURCE_SECONDS`, one hour), so the core's trim, split and normalize treat it as a clip whose take never runs out. A new item is 16 seconds long, joins the main track when the track is empty and overlays the playhead otherwise (the arrangement's rule in `addArrangementItem`). It starts with the post's sequence when the post has one, else with no sequences.

### The look

`MandalaLook` lives in `src/lib/shared/mandala/domain/mandala-shift-types.ts` with its zod schema, shared by the item and the cell:

| field | values | default |
| --- | --- | --- |
| shape | `MandalaPathShape` (arc, linear, concave, hybrid) | arc |
| lineWeight | 1.5, 2.5, 4 | 2.5 |
| colorMode | solid, flow | flow |
| preset | `MandalaPresetId` minus custom | aurora |
| depth | 0..100 (tip reach = depth x 2.5, the viewer's `rangeMax`) | 100 |
| breathBeats | 1, 2, 4, 8 beats per breath | 4 |
| spinPerBar | 0, 15, 30, 60, 90 degrees per bar | 30 |

Background is the preset's stage colour (`PRESET_COLORS[preset].bg`). Every rate is in beats, so a slower song breathes and spins slower; the viewer's wall-clock speed slider has no place here. Colours belong to the look, not to a sequence, so the whole clip keeps one palette (sequence hand colours are not blended; that was a nice-to-have and is dropped).

### The clock

The renderer takes beats, not seconds: `beats` (fractional, counted from an anchor) and `beatsPerBar`. Pure math in `src/lib/shared/mandala/services/mandala-shift.ts`:

- `shiftHoldBeats(shift, beatsPerBar)`: beats per hold (`every` bars or beats).
- `shiftFrameAt(shift, count, beats, beatsPerBar)` returns `{ from, to, morphT, hold }`. Hold `h = floor(beats / holdBeats)`; `from = h mod count`, `to = (h + 1) mod count`. The morph runs in the last `morph` beats of a hold and ends on the boundary, so the new mandala lands on the beat: `morphT = bloom(clamp((phase - (holdBeats - morph)) / morph))`, with `morph` clamped to `holdBeats`. One sequence (or `from === to`) never morphs. Beats before the anchor count as hold 0.
- `breathAt(beats, breathBeats)` returns 0..1 (triangle wave through `breatheEase`, the frame renderer's curve).
- `spinAt(beats, beatsPerBar, spinPerBar)` returns degrees.
- `colorPhaseAt(beats, breathBeats)` returns 0..1, one flow cycle per `COLOR_CYCLE_BREATHS` (3) breaths, as the viewer and the export worker do.

The item's clock, in `src/lib/shared/post-studio-plugin/mandala-item-clock.ts`: with a music grid (`hasGrid(project.music)`), beats count from the music's downbeat (`trackSecondsAt`, `beatSeconds`, `grid.beatsPerBar`) and the anchor is the hold boundary at or before the item's start, so the item opens on its first sequence and shifts land on the grid. Without a grid: 120 BPM, 4 beats a bar, anchored at the item's start; the Look panel says so and points at the music tool. Post seconds for a frame come from the clip: `item.start + (layer.sourceTimeSeconds - item.sourceIn)`.

The cell's clock: the arrangement's own beat clock, `virtualTime x bpm / 60 - cell.beatOffset`, with 4 beats to a bar (an arrangement has a BPM and no bars).

## 2. Renderer and morph

### Morph plan

`createMandalaMorph(from, to)` pairs lines once for two fixed geometries. Breathing changes the geometry every frame (the tip offset `dx`), so the pairing has to be decided once and applied to fresh geometry each frame. The interpolator (`mandala-path-interpolator.ts`) gains:

```
planMandalaMorph(from: MandalaPaths, to: MandalaPaths): MandalaMorphPlan
MandalaMorphPlan.at(fromNow: MandalaPaths, toNow: MandalaPaths, t: number): MandalaPaths
```

The plan keeps what pairing decided: per group, the beat pairing (`pairBeats` result) when both sides carry matching beats, else the tip pairing (tip indices, sample counts). `at()` resamples and blends the frame's own point lists with that decision. Point counts do not change with `dx` (samples per beat are fixed), so a plan made at the standard tip offset holds for every breath. `createMandalaMorph` stays as it is, implemented on top of the plan.

### `ShiftingMandala.svelte`

In `src/lib/shared/mandala/components/`. Props: `sequences` (steps and prop types per entry), `shift`, `look`, `beats`, `beatsPerBar`, `stamp?` (a string written to `data-frame` once that frame is drawn), `exportSize?`, `reducedMotion?`. No loop of its own: it draws whenever `beats` changes, in one `$effect`, synchronously.

Per frame: `tipDx = look.depth x 2.5 x breathAt(...)`; `frame = shiftFrameAt(...)`; geometry for `from` at `tipDx` through `calculate(steps, left, right, getMandalaPathOptions(shape, pairTipEnds(left, right)), { dx: tipDx, dy: 0 })`; when `0 < morphT < 1`, geometry for `to` too, blended through the pair's plan (plans are made lazily per neighbouring pair including last to first, and dropped when the sequence list or shape changes). Colours: flow mode samples `flowPalette` and `flowGradientColors` at `colorPhaseAt`; solid mode uses the preset pair. Drawing: background fills the whole canvas, the mandala is the largest square that fits, centred, rotated by `spinAt` about its centre, drawn with `renderMandalaToCanvas` with the glow the frame renderer uses (`GLOW_STDDEV x renderScale`). The canvas backing store is the box x devicePixelRatio, or `exportSize` while exporting, so the file gets full-size pixels.

Reduced motion (preview only; the exported file never changes): breathing and spin stop at their rest values and a morph becomes an alpha crossfade of `from` over `to` across the same window.

### Where it mounts

- Studio clip: `TkaMediaSublayer.svelte` gets a `binding.renderMode === "shifting-mandala"` branch, fed by a binding `createTkaBindings` returns for the mandala role (`mandalaRole(itemId)` in `compile-hooks.ts`, mirroring `arrangementRole`). `compileMandalaItem` is `compileArrangementItem` with the kind swapped.
- Cell: `ArrangementCellCanvas.svelte` renders `ShiftingMandala` when `cell.mediaType === "mandala"`, with the cell's layers as the sequence list and `cell.mandala` (new optional `{ shift, look }`) or the defaults. `PostStudioArrangementLayer` passes the grid's BPM so the cell can count beats.

### Export

A fourth surface in `surfaces.ts` with `renderMode: "shifting-mandala"`: it waits (rAF loop, 10 s limit) until the layer's `canvas[data-shifting-mandala]` carries `data-frame` equal to the frame's `String(layer.sourceTimeSeconds)`, then draws that canvas through `resolveFrameLayerGeometry` (fit fill, the canvas's own pixel size) and `drawSource`. Inside an arrangement, `drawArrangementCanvases` accepts mandala cells beside animation cells and copies their canvas pixels; the export scale-up in `PostStudioArrangementLayer` covers grids whose cells are all animation or mandala.

## 3. Editing, timeline, tests

### Add panel

The Add panel's "Mandala" entry adds the new kind (the picture-in-picture mandala stays reachable through Moves, then Shows). A post with no sequence offers it too, since it needs none.

### Tools

Row for a mandala item: `back, sequence, split, look, timing, position, fade, rename, duplicate, delete`.

- **Sequences** (`sequence` tool, labelled "Sequences" for this kind): `PostMandalaSequencesTool.svelte`. An ordered list, each row a name, beat count, Up, Down, Replace and Remove pill buttons; an Add button opens `SequencePickerModal` (no beat-count constraint; unequal lengths pair by tip, which is the flowing look). Empty state: "Add the sequences this mandala shifts between."
- **Look** (`look` tool): `MandalaShiftLookPanel.svelte`, shared with the cell. Groups of visible choices only (`SegmentedControl`, `FilterChipBase`): Shift every (1 bar, 2 bars, 4 bars, 1 beat, 2 beats), Morph (1, 2, 4 beats), Shape, Colours (flow/solid), Palette (the preset chips), Weight, Depth (`ValueSlider`), Breath (1, 2, 4, 8 beats), Spin (0, 15, 30, 60, 90). A note when the post has no beat grid: "No beat grid yet: shifting at 120 BPM. Set the music's beats to lock it to the song."

Edits go through `editor.editSetting` and `updateItem` patches as `TkaKindTools` does; the patch type gains `sequences`, `shift` and `look` through the `PluginItemPatch` augmentation.

### Cell

In the cell's **Sequence** panel a `SegmentedControl` "Animation | Mandala" at the top sets `cell.mediaType`; as a mandala cell the layer list is introduced as the order the mandala shifts through. The cell's **Look** panel shows `MandalaShiftLookPanel` instead of the animation look when the cell is a mandala cell; edits go through a new `setArrangementCellMandala(project, itemId, cellId, { shift, look }, ctx)` and `setArrangementCellMediaType`.

### Timeline lane

`TKA_ARRANGEMENT_LANES.lanes` also answers for a mandala item: one lane per sequence, its bar on the sequence's first hold inside the clip (pinned at the end when none), description in the style "holds bars 1, 4, 7". No drag.

### Test page

`src/routes/test/shifting-mandala/+page.svelte`: three sample sequences, a beat slider and a Play toggle at 120 BPM, the Look panel beside it. It is where the morph is watched frame by frame without a Studio project.

### Tests

- `mandala-shift.test.ts`: hold index and wrap; morph window ends on the boundary and is clamped to the hold; one sequence never morphs; breath and colour phase periodic; the item clock anchors on the boundary at or before the start, with and without a grid.
- `mandala-path-interpolator.test.ts`: a plan made at the standard offset, applied to geometries at another offset, equals `createMandalaMorph` of those geometries at t = 0, 0.5 and 1 for beat-paired and tip-paired sequences.
- `plugin.test.ts`: the kind union and surfaces list include `mandala` and `shifting-mandala`; `tka-row.test.ts`: the mandala row and the add order.
- Arrangement schema: a cell with `mediaType: "mandala"` and `mandala` round-trips.
- Browser: /post with a new Mandala clip playing and exporting; /test/shifting-mandala watched at the morph; reduced motion checked once.

### Out of scope

Joined grids (hand offsets) in the shifting mandala; per-sequence colours; drag-reordering on the lane; a BPM picker of its own (the music tool owns the grid).

## Revision 2026-10-20: steady shifts, breath as its own switch

Austen watched the first build and asked for shifts that run "consistently, but gradually", and for breathing to be separate ("it does not have to breathe"). Changes:

- `MandalaShift` gains `pace: "steady" | "land"` (optional; missing means steady). Steady morphs at one rate across the whole interval between shifts, with no easing and no hold, so the picture is always moving and each sequence is whole exactly on its beat. Land is the first build's behaviour (hold, then `bloomEase` over the last `morph` beats). The default is steady; the Morph over control shows only for Land.
- `breathBeats` gains 0, shown as Off, which holds the tips at the depth's full reach (`breathAt` returns 1). The default is Off. Depth shows only while breathing; flow colours keep cycling as if the breath were 4 beats.
- The Look panel groups are Shift, Lines, Colours, Breath and Spin, so breath and spin are set apart from the shift.
