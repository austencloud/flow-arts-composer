# Post Studio Breakdown Strip and Tutorial Roadmap

Date: 2026-09-24. Owner surface: Post Studio
(`src/lib/shared/share/components/post-studio/`) on the media-composition model
(`src/lib/shared/media-composition/`).

## Why

Austen's contest tutorials (DCKΨ- now, ΩΛ-XJ next) are about 90 s vertical
videos edited in InShot:

1. 0–22 s: the full-speed performance on top, the app animation below, with the
   BPM matched by hand.
2. 22–77 s: a crossfade and zoom into a slow take, keyframed so the prop ends
   stay in frame, with handwritten captions.
3. 77–86 s: the sequence card with its QR code, held.

For the slow section he wants the performance on top and a bottom strip that
holds two things: a square that plays the animation at his pace, and a carousel
showing the current pictograph large with the upcoming ones visible.

Today's goal is the finishing pass: he can export DCKΨ- tonight with that
strip. The rest of the week grows the same model into a full tutorial template,
so Post Studio can rebuild the whole InShot edit.

## Phase 1: Breakdown Strip (today)

### What the user does

1. Opens Post Studio for the sequence and chooses his InShot export as the
   performance (a local file).
2. Turns on **Breakdown** in the layout control.
3. Sets the breakdown start and end: "Set to playhead", or edits the value.
   The defaults are 25% and 90% of the video.
4. Optionally taps the beats inside the section with the existing step-map
   editor. Until he does, the strip uses even timing spread across the section.
5. Plays or scrubs to check the result, then renders. Original audio passes
   through unchanged.

Outside the breakdown, the export is his video, full frame and untouched.
Inside it, the performance eases into the top of the frame and a 500 px strip
rises from the bottom. At the end of the section the strip drops away and the
performance eases back to full frame, finishing by the end marker so the card
section starts clean.

### Output geometry (1080×1920, 30 fps)

| Region            | Rect in pixels, during the section | Fractions (x, y, w, h)              |
| ----------------- | ---------------------------------- | ----------------------------------- |
| `performance`     | 0, 0, 1080, 1420                   | 0, 0, 1, 0.739583                   |
| `strip-animation` | 0, 1420, 500, 500                  | 0, 0.739583, 0.462963, 0.260417     |
| `strip-carousel`  | 500, 1420, 580, 500                | 0.462963, 0.739583, 0.537037, 0.260417 |

Outside the section:

- The performance region is full frame (0, 0, 1, 1).
- The strip regions sit just below the frame (y = 1) and are not visible.

The move in each direction takes 0.8 s with ease-in-out:

- **Entry:** runs over [start, start + 0.8 s].
- **Exit:** runs over [end − 0.8 s, end].

The strip clips also fade over 0.5 s at each edge.

Performance framing inside the section is a three-way choice. The default is
**Fit** because his lower captions ("Go slower to learn faster", "Now repeat
100x") and the floor would otherwise sit under the strip.

- **Fit:** contain in the top region. A 9:16 source becomes 799×1420 with black
  side bars, which blend into his black curtain.
- **Fill:** cover the top region. This crops about 250 px from the top and the
  bottom of the source.
- **Behind:** the performance stays full frame and the strip covers its bottom
  500 px.

### Beat carousel

The carousel is a canvas-painted, read-ahead version of `StepStrip`, matching
the mockup Austen was shown.

- **Cells.** Index 0 is the start position; index k is beat k. The sequence
  loops, so after beat N comes beat 1. Once the position has passed 1, cells to
  the left of index 1 count back from beat N.
- **Focus.** The focus cell uses the app's existing convention:
  `displayedBeatNumber = floor(sequencePosition)`, meaning the pose just landed.
  The card and the timing map already use this convention. The next cell to the
  right is the move the performer is travelling now.
- **Layout.** The focus square is `min(0.80 × height, 0.62 × width)`, centered
  at 40% of the region width so more of the upcoming beats show. Neighbor size
  and opacity follow `StepStrip`'s spotlight curves:
  - size relative to the focus: 0.84/1.32 at distance 1, then −0.09 per step,
    with a floor of 0.62/1.32
  - opacity: 0.66, 0.48, 0.30, with a floor of 0.14
  - gap between cells: 6% of the focus size
- **Slide.** The track slides at each landing. The slide runs over the last 18%
  of each beat's position interval with ease-in-out, so the new pose reaches
  focus exactly as it lands. Size and opacity interpolate on the continuous
  distance, so a cell grows while it slides in.
- **Look:**
  - background `#08080c` across the region, the same as the animation square,
    so the strip reads as one band
  - cells as rounded white squares holding the pictograph
  - focus ring 2 px (at 1080 scale) in `#d4813a`, `StepStrip`'s focus color
- **Progress ticks.** A row of N ticks along the bottom edge: landed beats dim
  white, the current beat gold, upcoming beats faint. There is no current tick
  before the first landing.

### Beat timing for the section

- **Tapped map.** When a performance carries a tapped map, the strip uses it:
  a saved catalog map, or a local-file map tapped this session.
- **Even timing otherwise.** A tempo grid spans the section:
  - position 0 sits at the start marker and the last position at the end marker
  - moves are weighted by their durations, the same weighting
    `createTempoGridTimeMap` already uses
- **Local-file tapping.** A local file can now be tapped with the existing
  `StepMapEditor`. The resulting map lives in memory and is also kept in
  `localStorage`, keyed by sequence id plus file name, size and modified time,
  so re-picking the same file after a reload restores it. Its alignment status
  reads "Tapped on this device".

## Architecture

### Preset model additions

All additions are optional and backward compatible. File:
`media-composition-preset-schema.ts`.

1. **`layoutModel: "slots" | "free"`.** The default is `"slots"`. A free preset
   defines its own regions:
   - `normalizePresetToSlots` returns it unchanged
   - the slot operations (`withSlotSource`, `withClearedSlot`,
     `withSwappedSlots`, split) return it unchanged
   - the preview hides slot-only affordances
2. **`markers: { id, label?, at }[]`.** `at` is a seconds or duration-fraction
   `PresetTimePoint`.
3. **Marker time point.** `PresetTimePoint` gains
   `{ unit: "marker", markerId, offsetSeconds }`. Markers cannot reference
   markers, so there are no cycles. Validation requires every referenced marker
   to exist.
4. **`regionMotion: { regionId, keyframes: { at, rect, easing }[] }[]`.**
   - `rect` may extend past the frame, so a strip can rise from below; values
     must be finite and width/height positive.
   - Keyframes resolve and sort by time.
   - Before the first keyframe the rect holds the first value; after the last it
     holds the last.
   - Easing is `linear` or `ease-in-out`, the same quadratic ease the evaluator
     already uses for crossfades.
5. **Clip fades.** Visual clips gain `fadeInSeconds` and `fadeOutSeconds`
   (non-negative). The ramp is eased and multiplies opacity.

`resolvePresetTimePoint(point, durationSeconds, markers)` becomes the single
resolver. The timeline and state consumers that hard-code the seconds/fraction
split move onto it. Dragging a clip edge that is bound to a marker moves the
marker, keeping the offset. So the strip clips' edges, the region motion, and
the section tempo grid all follow one pair of markers.

### Frame evaluation

`evaluatePresetFrame` adds `regionRect` to every `EvaluatedFrameLayer`: the
region's rect at that timestamp, the static rect when no motion applies. A new
`evaluateRegionRects(preset, duration, time)` returns every region's rect so
the preview can place empty regions too. Preview and export still consume one
evaluation.

### Painted layers

Some sources are pure functions of the evaluated frame (the carousel now;
captions, titles and counters later). A new owner covers them:

`media-composition/services/post-studio-layer-painter.ts`

```ts
interface PostStudioLayerPainter {
  prepare(target: { width: number; height: number }): Promise<void>;
  paint(
    context: CanvasRenderingContext2D,
    rect: { x: number; y: number; width: number; height: number },
    frame: PaintFrame
  ): void;
}
```

`PaintFrame` carries `sequencePosition`, `displayedBeatNumber`,
`projectProgress` and `sourceTimeSeconds`.

- **Binding.** A binding with `renderMode: "painted"` carries its painter.
- **Preview.** `PostStudioPaintedLayer.svelte` sizes a canvas to its box times
  the device pixel ratio, calls `prepare` on resize, and paints on each frame
  change.
- **Export.** `exportPostStudioVideo` receives `painters` by source role, awaits
  `prepare` at output resolution before the first frame, and has the compositor
  paint straight into the export canvas.

So export never samples a small preview canvas, and preview and export share
one draw path.

### Carousel

- **Painter.** `media-composition/services/beat-carousel-painter.ts` wraps a
  pure layout function, `layoutBeatCarousel(input) → cells[]`, which is unit
  tested.
- **Pictographs.** They come from `Canvas2DDirectRenderer.renderPictograph`,
  pre-rendered once per focus size and cached by sequence and size.
- **Spotlight curves.** These live inside `StepStrip.svelte` today. They move to
  `timeline/strip-window.ts` as shared exports, so the DOM strip and the painted
  strip share one spotlight model.
- **Source.** A new source role, `carousel` (resolution
  `linked-sequence-derived`), binds to the painter built from the hand-labeled
  display sequence.

### Preset and state

- **Preset.** `BREAKDOWN_POST_LAYOUT` in `post-studio-presets.ts` is a free
  layout containing:
  - markers `breakdown-start` and `breakdown-end`
  - a `performance` clip that follows the performance source
  - `strip-animation` and `strip-carousel` clips bound to the markers, with
    `useResolvedTimeMap`
  - region motion for all three regions
- **Switching.** Post Studio loads both presets. The layout control switches
  between the split layout and Breakdown.
- **New state methods:**
  - `setMarkerTime(id, seconds)`
  - `setBreakdownFraming(fit | fill | behind)`: rewrites the performance
    region's section keyframes and fit
  - getters `markers`, `regionRects`, and `breakdownSection`

### UI

A new `PostStudioBreakdownControls.svelte` sits at the top of the inspector
rail. It composes existing owners:

- the layout `SegmentedControl` (Split | Breakdown)
- start and end rows: time readout plus a "Set to playhead" button
- the framing `SegmentedControl` (Fit | Fill | Behind)
- a timing row: status plus "Tap beats", which opens the performance picker's
  step-map editor for the current file

Motion uses the shared `growFade` owner. No raw durations.

## Verification

- **Unit tests:**
  - marker resolution and validation
  - region motion interpolation: before, between, after, easing, off-frame rects
  - fades
  - free presets surviving slot normalization
  - section tempo grid
  - carousel layout: focus at integer positions, the slide window, loop
    wrap-around, the start cell
  - local step-map persistence keys
- **Browser, in the dedicated agent browser against a task-owned preview
  server:**
  - load a synthetic 1080×1920 test video with an on-screen timecode through the
    file input
  - turn on Breakdown, set the markers, play through both transitions, and check
    the three framings
  - render a short export and sample its frames in the page to confirm geometry,
    carousel focus and audio presence
- **Viewports.** Every changed surface is checked at 375×667, 820×1180,
  1440×900 and 1920×1080. The inspector rail is the only new UI; the frame
  itself is a fixed 9:16 artifact.
- **Real proof.** Austen's InShot export renders end to end, and the output is
  inspected at the section edges and mid-section.

## Owner decisions (never-hand-roll record)

Searches covered: keyframe, region motion, carousel, StepStrip, strip-window,
painter, renderPictograph, tempo grid, marker, step map, easing.

| Capability | Closest existing | Decision |
| --- | --- | --- |
| Region geometry over time | `ClipTransform` (pan clamped to overscan); `camera-keyframe-interpolator` (3D camera values) | Extend the preset and frame-evaluator owner with region motion; reuse the evaluator's easing |
| Section boundaries | none (clips carry absolute or fraction times) | Extend `PresetTimePoint` with marker references |
| Read-ahead beat strip | `StepStrip.svelte` (DOM/SVG, not exportable) plus `strip-window.ts` | Compose: extract the spotlight curves into `strip-window.ts`; the painted carousel is a new presentation of the same capability |
| Pictograph pixels | `Canvas2DDirectRenderer.renderPictograph` | Reuse |
| Frame-derived drawing | compositor branches that read DOM canvases | Create `PostStudioLayerPainter` as the owner for painted layers |
| Local-file beat taps | `StepMapEditor` (catalog videos only) | Reuse, with an in-memory and local `onSave` |
| Section even timing | `createTempoGridTimeMap` (whole media only) | Extend with a media start offset |
| Clip fades | crossfade transitions (pairs only) | Extend visual clips with fade fields in the same evaluator |

## Risks

- **Animation square resolution.** The animation square still exports from the
  preview's canvas, about 400 device px upscaled to 500. That is acceptable for
  tonight. The follow-up is a painter backed by `OffscreenExportRenderer`.
- **Export time.** Seeking the video every frame costs about 4–5 minutes for 86
  s. That is unchanged from today.
- **Getting the file to the desktop.** The InShot export has to reach the
  desktop from the phone. Changes stay local and nothing is deployed.

## Roadmap (rest of the week, each stage exportable)

1. **Tutorial template.** Acts as markers:
   - split intro, then breakdown, then card hold
   - a separate full-speed take and slow take, each with its own time map
   - automatic BPM sync for act 1, with the animation following the tapped or
     detected map instead of a hand-matched BPM
   - a crossfade-and-zoom transition across regions
   - the card-hold act with its QR code
2. **Captions track.** Text clips as painted layers, with a handwritten style
   preset, position, and pop and fade presets, editable on the timeline.
3. **Reframing.** Clip transform keyframes (scale and pan over time) with a
   keyframe lane, then LED tip tracking. Red and blue tip detection against the
   black curtain proposes keyframes that keep the prop ends in frame.
4. **Motion-detected beats.** The tip tracks propose the step map, and tapping
   becomes correction instead of creation.
5. **Saved projects.** Persist the composition (preset, markers, maps, captions)
   through the unused preset repository.
6. **AI editing.** Natural-language directives compile to validated patches on
   the composition document: markers, clips, captions, keyframes. Each patch is
   previewed before it applies, in the pattern of the Film Director channel
   architecture.
7. **Crisp animation export.** A painter-based animation layer rendered at
   output resolution.
