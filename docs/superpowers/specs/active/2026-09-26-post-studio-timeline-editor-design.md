---
status: active
value: null
effort: null
work_state: verification
remaining: Verify the shipped Post Studio timeline editor against clip editing, zoom, keyboard, and responsive acceptance.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Post Studio Timeline Editor

Date: 2026-09-26. Supersedes the act-based builder in
`2026-09-24-post-studio-tutorial-builder-design.md` for editing; its
evaluator, export and timing work stay.

## Why

Austen films the run-through and the slow version in one raw video, one after
the other. He needs to cut both parts out of that one file, and every piece
of the post (the dual-view animation, the PIP moves square, the mandala, the
carousel, the card, the captions) must be something he can place, resize,
retime and remove, the way InShot works. The tutorial layout becomes a
preset that builds those pieces, not a fixed template.

Decisions Austen made on 2026-09-26:

- One editor screen: preview on top, timeline along the bottom, settings
  beside the preview (below it on a phone). Beat tapping is a tool on the
  selected clip, not a separate step.
- Two drops. Drop 1: clips, timeline, movable pieces and the Tutorial preset,
  enough to make the DCKΨ- video. Drop 2: keyframes with easing curves.
- Parallel helpers, one bug-hunting review before each merge.

## Model: `PostProject` v2

`src/lib/shared/media-composition/domain/post-project.ts` (zod schema).

- `takes`: unchanged `PostTake[]` from v1 (local, catalog or linked media).
- `tracks`: `tracks[0]` is the **main track** and is magnetic; every later
  track is an **overlay track** drawn above the tracks before it.
- `audio`: `"takes" | "silent"`.

Every item has `id`, `kind`, `label` (optional), `start`, `duration`,
`box` (x, y, width, height in frame fractions, kept inside the frame),
`opacity`, `fadeIn`, `fadeOut`. Overlay items also have `anchor` and `fill`.

| Kind        | Where       | Own fields                                                                                   |
| ----------- | ----------- | -------------------------------------------------------------------------------------------- |
| `video`     | any track   | `takeId`, `sourceIn`, `sourceOut`, `speed` 0.25–4, `fit`, `zoom`, `panX`, `panY`, `rotation`, `flip`, `volume` 0–2 |
| `card`      | any track   | none                                                                                         |
| `animation` | overlay     | `overlay` (beat number, letter and progress painted on top)                                  |
| `moves`     | overlay     | `mode`: `arrows`, `mandala` or `alternate` (the PIP square)                                   |
| `carousel`  | overlay     | none                                                                                         |
| `text`      | overlay     | `text` (≤140), `size` s/m/l                                                                   |

### Time rules (`normalizeProject`)

Every edit ends in `normalizeProject`, which rewrites the derived fields:

1. Main items sit end to end from 0 in array order. A video's duration is
   `(sourceOut − sourceIn) / speed`; a card keeps its stored duration.
2. An overlay's `anchor` is `{ itemId, offset }` naming a main item. With
   `fill`, the overlay spans exactly its anchor. Otherwise its start is
   `anchor.start + offset` and its duration is its own. An overlay video's
   duration follows its source span and speed; it never fills.
3. An anchor that no longer exists is replaced by the main item under the
   overlay's current start (or `null` when there is none).
4. No two items on one overlay track overlap. An overlapping item moves to
   the first overlay track where it fits, or a new track. Empty overlay
   tracks are removed.
5. Post duration is the latest item end on any track.

Consequences: reordering, trimming or re-speeding a main clip carries the
overlays anchored to it. Deleting a main clip ripples, deletes its `fill`
overlays and re-anchors its other overlays where they stand. Splitting a main
clip duplicates its `fill` overlays onto the second piece.

### Edit operations

`post-project-edits.ts`, pure, each returning a normalized project (or the
same object when nothing changed): add and remove takes, append a video
clip, split at a time, delete, duplicate, move a main clip to an index, move
an overlay to a start and track, trim either edge, set speed, update fields,
add an overlay item, set `fill`, apply a look to a main clip, apply the
Tutorial preset, hide or lock a track.

### Looks and the Tutorial preset (`post-project-presets.ts`)

A look rewrites one main clip's box and replaces the `fill` overlays that
belong to looks (animation, moves, carousel) on it:

- **Dual**: clip in the top half; a filled `animation` item (overlay on) in
  the bottom half.
- **Breakdown**: clip full frame; a filled `moves` item (`alternate`) in the
  strip square and a filled `carousel` beside it, using `BREAKDOWN_GEOMETRY`.
- **Full**: clip full frame, no look overlays.

**Tutorial** builds the whole post: Run-through (Dual), Slow-mo (Breakdown,
0.25 s fade in) and a 5 s card (0.25 s fade in). With one raw video it cuts
the take in half as a starting point for Austen to trim; with two takes or
two existing clips it uses them. When both clips come from one take, it
splits that take's timing at the Slow-mo clip's start with `restarts`, so
the slow performance counts from move 1.

## Compile (`post-project-compiler.ts`)

`compilePostProject(project, context)` returns the free-layout
`MediaCompositionPreset` the evaluator, preview and export already play,
plus the resolved video segments and text items.

- One region per item at its box; `zIndex` rises with track index.
- A video item is one clip with `timeMapRole: take:<id>`, rate `speed`,
  transform from zoom, pan, rotation and flip.
- A sequence item (animation, moves, carousel) is split at main-track video
  boundaries. Each piece copies that video's source mapping and time map, so
  every square reads the move of the footage under it. Pieces over a card or
  a gap hold the opening pose. Piece ids are `<itemId>~<k>`; fade in goes on
  the first piece and fade out on the last.
- A text item uses role `text:<itemId>` and a per-item painter that centres
  the wrapped text in its box, font scaled to box width.

## Audio

Segments come from video items with `volume > 0` when the post's audio is
`takes`. The mixer reads each source at `speed`, so slowed footage carries
slowed (and lower) sound, and scales it by `volume`. The existing 8 ms edge
fade stays. Austen's slow-mo is performed slowly at speed 1, so its sound is
untouched.

## Timing tool

`post-timing-session.svelte.ts` takes a `TimingHost` interface instead of the
old builder. "Beats" on a selected video clip opens the existing tap stage
over the preview, starting at the clip's first frame; Done returns to the
editor. Timing stays per take and per media time, so both clips cut from one
raw video share one timing with a `restarts` section at the slow-mo start.

## Editor state (`post-editor-state.svelte.ts`)

Owns the project with undo and redo (drags coalesce into one step), take
media and timings, selection, edit or timing mode, playhead and playback,
the compiled preset and the evaluated frame. Persists through
`post-project-store.ts`, which reads a v1 plan when no v2 project exists and
migrates it (`post-project-migration.ts`).

## Screen

- **Toolbar**: undo, redo, split, delete, duplicate, Add (video, animation,
  PIP moves, mandala, carousel, card, text), Tutorial preset, export.
- **Preview**: the canvas at 9:16. Clicking selects the item on top; the
  selected item's box can be dragged and resized; the strip guide stays.
- **Transport**: play, time and duration, timeline zoom.
- **Timeline**: ruler, main track and overlay tracks with hide and lock,
  item blocks with trim handles, a draggable playhead, snapping to the
  playhead, item edges and zero, horizontal scroll and zoom.
- **Inspector**: the selected item's settings (trim with set-to-playhead and
  frame nudges, speed, volume, framing, box presets, opacity and fades,
  look, text), or the post's settings when nothing is selected.
- Keys: Space play, S split, Delete remove, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y,
  ←/→ one frame (Shift one second), Home/End, Ctrl+D duplicate, +/− zoom.

## Drop 2: keyframes

Items gain `keyframes` per property (zoom, panX, panY, rotation, opacity, x,
y, width, height): `{ t, value, easing }`, with `t` in item seconds and
`easing` a cubic bezier `[x1, y1, x2, y2]` or `hold`, applying to the segment
toward the next keyframe. Named presets map to bezier values evaluated with
`motion`'s `cubicBezier`. The evaluator gains clip motion; the timeline gains
a keyframe lane and a curve editor; moving the box or changing a value at
the playhead adds or updates a keyframe when the property is keyed.

## Ownership (never-hand-roll)

Searched: timeline, track, clip, trim, split, ripple, magnetic, undo, redo,
keyframe, easing, ruler, playhead, snap. Closest: Compose
`features/compose/timeline` (beat-based sequence timeline with its own
state), Stage `StageTimeline`, `timeline-undo-manager.ts`, Grip Lab
`KeyframeTimeline`.

- **Reuse** `evaluatePresetFrame`, the Post Studio exporter, compositor,
  painters and take timing.
- **Compose** `TimeRuler` after moving it to `src/lib/shared/timeline/`
  (Stage already imported it across features).
- **Create** `PostTimeline` and the post-project edit operations. The
  interaction contract differs from Compose: a magnetic main track with
  anchored overlay tracks over source media, not beats on a sequence clock.
- **Create** a small snapshot history in the editor state;
  `timeline-undo-manager.ts` is bound to `TimelineProject` and localStorage.
- **Reuse** `motion` (installed 12.42) for bezier easing in drop 2.
- Packages considered: IMG.LY CE.SDK (commercial editor with its own engine
  and export, found by a 2026-09-26 search), `svelte-gantt` (date
  scheduling), `animation-timeline-js` (canvas keyframe lanes only) and
  `@xzdarcy/react-timeline-editor` (React). None fits a Svelte 5 magnetic
  timeline over this project's evaluator and export.

## Tests and checks

Pure units: normalize, every edit operation, looks and preset, migration,
compiler pieces and time maps, audio segments and mixing with rate and gain.
Type check across the project at the merge gate. Browser: the full seven
viewports and 200% zoom for the new screen, plus real split, trim, drag,
resize, undo, timing, preview playback and a short export.
