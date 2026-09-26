# Post Studio keyframes with easing (drop 2)

Status: approved 2026-09-26 (Austen: "Timeline, then keyframes"; zoom first).
Builds on `2026-09-26-post-studio-timeline-editor-design.md`, whose Drop 2
section this replaces.

## Goal

Austen keyframes a clip's zoom, position and opacity on the timeline and
chooses how each move eases, the way InShot and CapCut do: park the
playhead, set a value, move on, set another. The preview and the export play
the same motion.

## Model (`post-project.ts`)

Every item gains an optional `keyframes` object. Old projects parse
unchanged, so there is no migration and the schema version stays 2.

```ts
type PostEasing = "hold" | [x1: number, y1: number, x2: number, y2: number];
// CSS cubic-bezier(x1, y1, x2, y2). x in [0, 1]; y in [-1, 2].

interface PostKeyframe<V> {
  t: number;          // content time, see below; any finite number
  value: V;
  easing: PostEasing; // how the value travels to the NEXT keyframe
}

interface PostFraming { zoom: number; panX: number; panY: number; rotation: number }

// every kind
keyframes?: {
  box?: PostKeyframe<PostBox>[];
  opacity?: PostKeyframe<number>[];
};
// video only (its schema adds the channel)
keyframes?: { framing?: PostKeyframe<PostFraming>[]; box?: ...; opacity?: ... };
```

Channels group what moves together. `framing` is zoom, pan and turn, so one
keyframe holds the picture's whole framing, as in InShot. `box` is where the
item sits in the frame. `opacity` multiplies with the item's fades.

**Content time.** A video keyframe's `t` is take media seconds, the clock of
`sourceIn`/`sourceOut`, so a zoom stays on the move it frames when the clip is
trimmed, split or sped up. Every other kind uses seconds from the item's
start, so moving the item carries its motion along. Keyframes outside the
item's visible span are kept: a trim can bring them back, and they shape the
curve at the edges.

- post → content: video `sourceIn + (s - start) × speed`; other `s - start`.
- content → post: video `start + (t - sourceIn) / speed`; other `start + t`.

**Canonical form** (`normalizeProject` enforces it and keeps the item's
reference when already canonical): each channel sorted by `t`; keyframes
within half a frame (1/60 s of post time) merge, the later array entry
winning; values clamped (box through `clampBox`, framing to the item's
bounds with rotation wrapped, opacity to [0, 1]); empty channels and an
empty `keyframes` object removed.

**Sampling.** Before the first keyframe the channel holds the first value;
after the last, the last. Between keyframe `i` and `i + 1`, progress
`p = (t - tᵢ) / (tᵢ₊₁ - tᵢ)` goes through `easingᵢ`: `hold` keeps `valueᵢ`
until `tᵢ₊₁`; a bezier gives `e = cssCubicBezier(...)(p)` and each number
lerps by `e` (rotation numerically, with no shortest-path wrap). Overshoot can
leave a value's range, so sampled values are clamped: box through `clampBox`,
zoom to its bounds, opacity to [0, 1]. A channel with no keyframes reads the
item's static field.

**Auto-key.** While a channel has keyframes, changing its value at the
playhead writes a keyframe there (adding one or updating the one within half
a frame); otherwise it changes the static field. A new keyframe takes the
easing of the segment it lands in, else `DEFAULT_EASING` (ease in-out). Adding
a keyframe with no value records the value already showing, so adding one
never changes the picture. Removing a channel's last keyframe writes its value
to the static field, so nothing jumps. Keyframe writes at a time outside the
item's span do nothing.

## Easing presets

| id            | value                   |
| ------------- | ----------------------- |
| `linear`      | `[0, 0, 1, 1]`          |
| `ease-in`     | `[0.42, 0, 1, 1]`       |
| `ease-out`    | `[0, 0, 0.58, 1]`       |
| `ease-in-out` | `[0.42, 0, 0.58, 1]`    |
| `smooth`      | `[0.65, 0, 0.35, 1]`    |
| `overshoot`   | `[0.34, 1.56, 0.64, 1]` |
| `hold`        | `"hold"`                |

Anything else reads as `custom`. These are content curves, like InShot's, not
the app's UI motion tokens, so they live with the post model.

## Keyframe module (`post-project-keyframes.ts`, new)

Pure item-level functions; an edit returns the same item when nothing
changes. `s` is post seconds.

- Time: `keyframeTimeOf(item, s)`, `postSecondsOfKeyframe(item, t)`,
  `keyframeInView(item, t)` (inside `[start, end]` with epsilon).
- Reading: `channelsOf(item)`, `isAnimated(item, ch)`,
  `channelValueAt(item, ch, s)`, `framingAt`, `boxAt`, `opacityAt`,
  `keyframeIndexAt(item, ch, s)` (within half a frame, else -1),
  `adjacentKeyframeSeconds(item, ch, s, "previous" | "next")` (in view),
  `keyframeMarkers(item)` (in-view keyframes merged across channels within
  half a frame: `{ seconds, channels }[]`), `segmentAt(item, ch, s)`
  (`{ fromSeconds, toSeconds, easing, index }`: the segment holding `s`; on a
  keyframe, the one leaving it, or the one arriving when it is the last).
- Edits: `setKeyframe(item, ch, s, value?)`, `removeKeyframe(item, ch, s)`,
  `toggleKeyframe(item, ch, s)`, `removeKeyframesAt(item, s)` (all channels),
  `moveKeyframes(item, fromS, toS)` (every channel's keyframe at `fromS`,
  clamped to the span; one landing on another replaces it; pure, so a drag
  re-applies it to its gesture base), `setSegmentEasing(item, ch, s, easing)`,
  `writeChannelValue(item, ch, s, value)` (the auto-key rule),
  `clearChannel(item, ch, s)` (static field takes the value at `s`),
  `shiftKeyframes(item, headCut)` (non-video `t -= headCut`).
- Easing: `EASING_PRESETS`, `DEFAULT_EASING`, `easingPresetOf(easing)`,
  `sampleEasing(easing, p)` through a cache of `cssCubicBezier` functions.

## Project edits (`post-project-edits.ts`)

- `updateItemAt(project, id, patch, s, ctx)`: `updateItem`, except that the
  fields of an animated channel go through `writeChannelValue` at `s`
  (zoom/panX/panY/rotation merge into the framing at `s`, clamped as
  `updateItem` clamps).
- `editItemKeyframes(project, id, (item) => item, ctx)`: applies an
  item-level keyframe edit and finishes.
- `resetFraming(project, id, ctx)`: the old Reset framing plus dropping
  framing keyframes.
- Hooks: a start trim on a non-video item shifts its keyframes by the head
  cut (overlay: new start minus old start; main-track card: old duration
  minus new duration), so trimming never moves an animation. A split's second
  non-video piece shifts by the cut. `applyLook` drops the clip's box
  keyframes with its box. Duplicates copy keyframes as they are.

## Preset and evaluator

Additive, optional fields in `media-composition-preset-schema.ts`, with times
in absolute post seconds (any finite number, since a keyframe on a trimmed
head can sit before zero):

```ts
PresetEasing = "hold" | [x1, y1, x2, y2];
MotionKey<V> = { atSeconds: number; value: V; easing: PresetEasing };
PresetVisualClip.motion?: {
  transform?: MotionKey<{ scale; rotationDegrees; translateX; translateY }>[];
  opacity?: MotionKey<number>[];
};
MediaCompositionPreset.regionKeyframes?: { regionId; keyframes: MotionKey<MotionRect>[] }[];
```

Validation: `atSeconds` strictly increasing per track; a region id must exist
and has at most one `regionKeyframes` track and not also a `regionMotion` one.
The older `regionMotion` stays for the breakdown presets.

`frame-evaluator.ts` samples these with the same rules. `evaluateRegionRects`
applies `regionKeyframes` (width and height floored at 0.001), and each layer
gets `opacity = sampled or static × fades × transitions` and
`transform = { ...clip.transform, ...sampled }` (scale floored at 0.01;
`flipHorizontal` stays static).

The compiler emits a video's framing keyframes as `motion.transform`, any
item's opacity keyframes as `motion.opacity` (every piece of a sequence item
carries the same track), and box keyframes as a `regionKeyframes` track for
the item's region. The export already draws from the evaluated layer, so it
animates with no further change.

**Painter sizes.** The carousel and strip painters render and cache per exact
size, so a box whose size animates would re-render every frame. A shared
`paintSizeBucket(px)` in `post-studio-layer-painter.ts` rounds sizes up a 6%
ladder for their cache keys, and `paint` falls back to the nearest cached size
while a new one renders, so the square and the carousel never blank mid-move.

## Editor

- State: `regionRects` (evaluated at the playhead) and `previewDragTarget`
  (`"box" | "picture"`, not saved).
- Preview: region divs, the selection box and hit tests use the rect at the
  playhead. A box drag or nudge writes through `updateItemAt`. In Picture mode,
  and always for a video that fills the frame, a drag pans the picture: the
  change in pan is the change in pixels over the overscan (`resolvePanOffset`
  with the mounted video's own size), and an axis with no overscan stays put.
  Ctrl or ⌘ + wheel, which is also a trackpad pinch, zooms the selected video;
  a two-finger pinch zooms and pans it. Each is one undo step.
- Inspector: framing, box and opacity each get `◀ ◆ ▶` (previous, toggle at
  the playhead, next) and a Curve chip for the segment under the playhead.
  The chip opens a `FilterChipBase` dropdown with the presets and a curve
  editor: an SVG plot with two draggable control points, with keyboard steps
  and four number fields. Values show at the playhead. While the playhead is
  outside the item, animated values are read-only, with a hint. A "Drag in
  preview: Box | Picture" control sits in Framing.
- Timeline: the selected block shows a diamond per marker. Clicking one seeks
  to it, dragging retimes it (snapped to frames, Escape cancels), Delete
  removes it, and the arrow keys move it by a frame (Shift: ten). An
  unselected block that has keyframes shows a diamond glyph.
- Shortcut: `K` toggles a keyframe at the playhead on the selected item's
  first channel (framing for video, box otherwise).

## Owners (never-hand-roll)

Searched: bezier, cubicBezier, easing, curve editor, keyframe, interpolate,
regionMotion.

- Bezier solving reuses `cssCubicBezier` in `shared/transitions/ws-ease.ts`,
  not `motion`'s `cubicBezier` as the drop-1 doc said. It is the repo's
  owner, it matches the browser's CSS curve (so the editor's drawn curve is
  the curve that plays), and the export path does not have to import `motion`.
- Interpolation over time extends the frame evaluator, which already owns
  region motion.
- Popover: `FilterChipBase` dropdown with `ChipPopoverOption`. Numbers:
  `ScrubbableNumber`. Choices: `SegmentedControl`.
- The curve editor is new; the repo has no bezier or easing editor.
  `PostCurveEditor.svelte` owns it.
- Timeline diamonds compose inside `PostTimelineItem`, which owns the block.

## Out of scope

Boxes that leave the frame (slide-ins from off screen), shortest-path
rotation, per-property keyframes inside a channel, keyframes on audio volume,
and speed ramps.
