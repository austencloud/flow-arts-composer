---
status: active
value: null
effort: null
work_state: designed
remaining: Plan, then build the Level-chapter pilot and send it to Austen.
depends_on: "2026-09-26-post-studio-keyframes-design.md"
plan_path: ""
tags: [post-studio, feature-video, tutorial]
last_triaged: "2026-10-11"
---

# Walkthrough zoom and bubbles

Date: 2026-10-11. Approved by Austen the same day ("Both, in the video
editor", then "Looks right, go"). Owner surface: Post Studio on the
media-composition model (`src/lib/shared/media-composition/`), plus the
recording director (`scripts/demo-capture/browser-director.mjs`).

## Why

Generate tutorial draft 2 (5:26, sent 2026-10-11) puts every caption in the
bottom-left corner, even when the click it explains happens at the top right.
Austen: the words should sit next to the pointer, the way the ghost shows its
thoughts, and the video should zoom in on each click so viewers can find it.
Both are to happen in the video editor, so his own words can replace the
placeholder lines there without a new recording.

## What he approved

- The camera pushes in on the control being clicked and pulls back out when
  Generate shows the new sequence.
- Each line is a bubble beside the click, in the ghost's look: a dark rounded
  plate with a small tail pointing at the control.
- A bubble stays where its click happened. It does not ride along with the
  pointer (he chose this over the follow option).
- The bubbles are ordinary text items in Post Studio, so he edits the words
  there.
- The final cut uses a new recording at twice the pixel density, so zoomed
  shots stay sharp (he declined the option to skip it).
- The Level chapter is built first as a pilot and sent to him to judge before
  the rest of the video is redone.

## Pieces

### 1. Recording: target boxes and a sharper take

`browser-director.mjs` already knows each target's bounding box when it aims
the pointer (`target`, `onScreenMatch`, `canvas`). Every event it records
(`click`, `fill`, `pick`, `type`, `canvas`) also stores that box as
`rect: { x, y, width, height }` in CSS pixels. `capture.json` also records the
page size as `viewport: { width, height, deviceScaleFactor }`, so a builder
can turn event pixels into shares of the frame without guessing.

The tutorial's capture script (in the media folder,
`generate-tutorial/captures/generate-tutorial.capture.mjs`) moves from
`deviceScaleFactor: 1` to `2`. The page still lays out at 1920 by 1080; the
recording becomes 3840 by 2160. A push-in to 2× then shows one source pixel
per pixel of a 1920 by 1080 export.

A 4K screencast may deliver fewer frames per second. The take's rate
(`frames / elapsed`) must be at least 24. Below that, the script drops to
`deviceScaleFactor: 1.5` (2880 by 1620) and the zoom cap drops to 1.5.

Take 2 has neither `rect` nor `viewport`. The builder still accepts it: it
falls back to a 1920 by 1080 page and a 48 by 48 box around the click point.

### 2. The bubble: a callout on the text item

`PostTextItem` gains one optional field:

```text
callout?: { x: number; y: number }   // the point the tail aims at, shares of the frame
```

A text item with `callout` draws as a bubble. `text-item-painter.ts`, which
already draws every text item in the preview and the export, draws it:

- The plate fills the item's box: radius 20, fill `#101018` at 88%, a 1 px
  `rgba(255,255,255,0.14)` border and a soft shadow. These are the values in
  `ThoughtCaption.svelte`, copied as named constants with a comment naming
  that file. The live ghost keeps its own DOM bubble.
- The words are white (`#f4f4f8`), weight 600, in the app's own UI font stack
  (`system-ui`, Segoe UI on Windows), left-aligned with 24 by 18 px padding
  at 1080p and no outline. `size` sets the type as a share of the frame's
  height: s 0.026, m 0.0315 (34 px at 1080p), l 0.04. Words wrap inside the
  plate and shrink, down to 80% of that size, when they do not fit.
- The tail is a 16 px rotated square on the plate edge facing the callout
  point, placed along that edge at the point's position and kept clear of the
  rounded corners. A point inside the box draws no tail. The painter's
  `paintOverflow` reserves room for the tail outside the box.
- `style` and `animation` (the InShot import's styling) do not apply to a
  callout; the item fades in and out with its own `fadeIn` and `fadeOut`.

The compiler passes `callout` through `CompiledTextItem`. Dragging the bubble
in the editor keeps the tail aimed at the stored point. The editor gets no new
control for the point in this work.

### 3. The builder: capture to cut

A new pure module, `media-composition/domain/post-walkthrough.ts`, turns a
recording into a cut. Two helpers sit beside it:
`walkthrough-camera.ts` (shots and framing keyframes) and
`walkthrough-callouts.ts` (bubble timing and placement).

Input: the take id, the take's `capture.json` (events and viewport), the lines
file (below), the kept source ranges and, optionally, one chapter to build.

Output: the project with its main track replaced by one video clip per kept
range, and a `walkthrough` overlay track of callout text items, each anchored
to the clip it plays over.

**Lines file.** The per-video script moves from `LINES` in `build_spec.py`
to `walkthrough.json` in the feature's folder:

```json
{
  "keep": [
    [0, 207.15],
    [209.2, 219.0]
  ],
  "lines": [
    {
      "click": "Level 1",
      "after": 0.2,
      "text": "Level 1 uses base motions only, with no turns.",
      "chapter": "Level"
    },
    {
      "click": "Level 1",
      "after": 2.6,
      "sameClick": true,
      "text": "Without turns, the Turn Intensity card goes away."
    },
    {
      "click": "generate-button-card",
      "after": 0.6,
      "shot": "wide",
      "text": "At 16 steps the workbench shows four rows of four."
    }
  ]
}
```

`click` matches a piece of an event label, in order, as `build_spec.py` does
today. `sameClick` replaces that script's implicit "same piece, larger offset"
rule. `shot` is `close` (the default) or `wide`. An empty `text` ends the
previous bubble without starting one.

**Camera.** Positions are shares of the source frame, from the event pixels
and the recorded viewport.

- A close shot frames the target box with room for its bubble at up to 2×
  (1.5× on a 1.5 take). A box too big for that zoom gets the zoom that fits
  it.
- Consecutive close lines whose targets fit in one view at 1.6× or more, and
  whose clicks are under 6 s apart, share one shot. The three Level buttons
  are one shot, not three pans.
- The camera arrives 0.3 s before the click, over a 0.8 s ease-in-out move,
  so the viewer sees the pointer reach the control and press it.
- A wide line pulls out to the whole frame, starting at its click and
  arriving 0.8 s later, as the new sequence appears.
- Framing keyframes use the existing video `keyframes.framing` (zoom, panX,
  panY), with `t` in take media seconds. The pan for a wanted view centre is
  worked out from `media-fit.ts` (`calculateMediaFit`, `resolvePanOffset`), the
  same geometry the preview and the export draw with, and a test holds the two
  together.
- A clip that starts after a cut starts on the framing the previous clip
  ended on, since the cuts sit where the frames match.

**Bubbles.**

- A bubble shows from its line's time until the next line starts, ending 0.1 s
  before the camera next moves. It never shows while the camera is moving. It
  fades over 0.2 s at each end.
- Its box is sized from the words: one or two lines, at most 36% of the frame
  wide, using an average glyph width for the bubble font. The painter's
  shrink-to-fit covers the estimate being short.
- It sits 34 px (at 1080p) from the target box, trying above, below, right,
  then left, and takes the first spot that stays 24 px inside the frame and
  does not cover the target box. Horizontally it centres on the pointer
  before it is clamped. Its `callout` point is the click point.
- Generated bubbles use size `m`.
- A rebuild keeps the words of any bubble whose id already exists. Ids come
  from each line's placeholder text in the lines file, so a rebuild after a
  re-take, or after a line is added, keeps Austen's typed words on the right
  bubble. Two lines with the same placeholder text are refused.

**Checks.** The builder refuses a line whose click is missing or falls inside
a cut, and it warns when a bubble holds under 1.6 s (the same floor as the
promo renderer's check). It returns the chapter start times in post seconds,
for the YouTube description.

### 4. Running it

The builder runs as one project op, `build-walkthrough`, in
`post-project-ops.ts`. When an editor has the project open, the op goes
through that editor, so one undo takes the whole build back. Otherwise it
edits the file on disk.

`post-project.mjs walkthrough --feature SLUG --lines walkthrough.json
[--take ID] [--chapter NAME]` reads the take's `capture.json`, sends the op
and prints the chapters. `--chapter` builds only that chapter: from 1 s before
its first click to the start of the next chapter's first camera move. The existing
`render --feature SLUG --open` exports it.

## Pilot

1. Record take 3 of the Generate tutorial at the new density, signed in as
   the shared test account, with the director's new boxes. If other sessions'
   merges reload the page, cut the reloads with `keep` as in take 2.
2. Build the Level chapter only, into the `generate-tutorial` feature project
   (created for this tutorial, empty until now).
3. Export it with the editor and check it:
   - stills at each click (control in view and pressed, bubble beside it, no
     overlap, words readable) and mid-move;
   - the editor preview and the export compared at three times (one mid-move,
     two settled), the keyframe export acceptance the keyframes spec still
     owes;
   - the frame rate of the take.
4. Send Austen the clip and a still sheet. The rest of the chapters wait for
   his verdict.

## Owners

| Capability             | Decision                                                                                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bubble look in a video | Extending `text-item-painter.ts` with a callout plate. Searched: callout, bubble, speech, tail, tooltip, plate, ThoughtCaption. The only bubble is `ThoughtCaption.svelte`, a DOM element for the live ghost; it stays that surface's owner and lends its values.         |
| Zoom over time         | Reusing video `keyframes.framing` (`post-project-keyframes.ts`, sampled by `frame-evaluator.ts`) and `media-fit.ts` geometry.                                                                                                                                             |
| Capture to cut         | Creating `post-walkthrough.ts`. No owner turns recorded clicks into clips, framing and text. Closest matches: the `add-card` and `add-hook` builders in `post-project-ops.ts` (single items) and `build_spec.py` (captions for the old renderer, retired for this video). |
| Target boxes           | Extending `browser-director.mjs` events and `capture.json`.                                                                                                                                                                                                               |

## Tests

- `post-walkthrough`: shots group as described; every framing keyframe stays
  inside the zoom and pan bounds; no bubble covers its target box or leaves
  the frame; no bubble overlaps a camera move; a line in a cut is refused;
  words survive a rebuild; take-2 input without boxes still builds.
- The pan helper against `resolvePanOffset` and `calculateMediaFit` at several
  zooms and centres.
- `text-item-painter`: a callout draws its plate, its tail on the edge facing
  the point and no tail for a point inside the box, through the existing
  painter test's recording context.
- `browser-director`: events carry `rect`; `capture.json` carries `viewport`.
- The pilot's stills and the preview-to-export comparison above.

## Not in this work

Music, the final words, posting and the remaining chapters (after the pilot);
a click ring (the recorded pointer already shows each press); a control for
moving the tail's point; generated narration (rejected before, still
rejected); changes to the 1.0 promo or its renderer.
