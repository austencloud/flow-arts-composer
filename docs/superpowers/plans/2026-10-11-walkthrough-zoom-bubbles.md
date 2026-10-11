# Walkthrough Zoom and Bubbles Implementation Plan

> **For agentic workers:** executed inline in the main session (Agent Budget).
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a recorded app walkthrough into a Post Studio cut whose camera
pushes in on each click and whose lines show as ghost-style bubbles beside the
click, then build the Generate tutorial's Level chapter as a pilot.

**Architecture:** The director records each target's box and the page size. A
pure builder in `media-composition/domain/` turns the capture, a lines file and
the kept ranges into main-track clips with framing keyframes and an overlay
track of callout text items. `text-item-painter.ts` draws a text item with a
`callout` point as a plate with a tail. One op, `build-walkthrough`, applies
the build through the open editor or the file on disk; the CLI sends it.

**Tech Stack:** TypeScript, zod, Vitest, Node ESM scripts, Canvas 2D.

**Spec:** `docs/superpowers/specs/active/2026-10-11-walkthrough-zoom-bubbles-design.md`

---

## Decisions made while planning

These refine the spec; the spec is updated to match in Task 0.

1. **Every click moves the camera, not only captioned ones.** Each pointer
   event in the build range is a beat. A close beat frames the event's box.
   The lines file's top-level `wideAfter` lists label pieces (the Generate
   button) whose clicks get a close beat and then pull out wide 0.2 s after
   the press, arriving 0.8 s later, so each new sequence is seen whole.
2. **`include`** (optional, page CSS px rect on a line) names the area a line
   talks about when that is not the clicked control. It joins the shot's
   region, the bubble avoids it and the tail points at its centre.
3. **sameClick lines with their own `shot` or `include` are beats at the line's
   time.** A close one arrives 0.3 s before the line; a wide one moves over
   the 0.8 s ending 0.1 s before it.
4. **Region and zoom.** Close shot region = union of member boxes, widened by
   0.10 of the frame width and 0.30 of its height (room for the bubble).
   Zoom = min(maxZoom, 1 / regionWidthShare, 1 / regionHeightShare), at
   least 1. `maxZoom` = script value, else `min(2, max(1.5, dpr))` (2 when the
   take has no viewport). Close beats group when the union's zoom is at least
   0.8 × maxZoom and they are under 6 s apart; a wide beat or a chapter's first
   line starts a new shot.
5. **Move scheduling.** Moves run in order; a move whose wanted start falls
   before the previous move's end starts at that end, takes at least 0.4 s,
   and warns when it lands after its click.
6. **Clip boundaries.** The camera is one keyframe list over the build range.
   Each kept clip gets the keys inside it plus keys at its own `sourceIn` and
   `sourceOut`, sampled with the engine's own `framingAt`, so a cut never
   jumps the framing. Keys within 1/60 s of a boundary are dropped (the
   normalizer would merge them).
7. **Chapters.** The first bubble of each chapter carries the chapter's name
   as its item `label` (it shows on the timeline). The CLI reads the result
   back and prints `m:ss Name` at 1.5 s before that bubble, and lists bubbles
   under 1.6 s. The op path cannot return extra data, so the report reads the
   project.
8. **A chapter build** runs from 2 s before its first click (the camera is
   wide there and pushes in) to the start of the next chapter's first camera
   move, or the end of the take.
9. **Every line needs a click.** A line without one is refused (the opening
   "no click" line returns with the full video, after the pilot).
10. **The canvas must have the recording's shape** (16:9 for a 1920 by 1080
    page); otherwise the build is refused, since a cover crop would move every
    share.
11. **Capture file.** The CLI takes `--capture FILE`, default
    `<feature folder>/captures/frames/<slug>/capture.json`.
12. **Pilot take.** Take 3 re-paces the Level waits so every line holds at
    least 3 s: 6.5 s after Level 1, 3.5 s after Level 2 and Level 3. The
    pilot records the opening, the Level chapter and the first Turn Intensity
    click, and stops; the full re-paced take follows Austen's verdict.

## Files

| File                                                                                | Change                                                            |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `scripts/demo-capture/browser-director.mjs`                                         | events carry `rect`; `capture.json` carries `viewport`            |
| `tests/unit/scripts/browser-director.test.ts`                                       | rect and viewport tests                                           |
| `src/lib/shared/media-composition/domain/post-project.ts`                           | `PostTextItem.callout`                                            |
| `src/lib/shared/media-composition/domain/post-project-compiler.ts`                  | `CompiledTextItem.callout` pass-through                           |
| `src/lib/shared/media-composition/services/callout-plate.ts`                        | new: pure plate, tail and type geometry                           |
| `src/lib/shared/media-composition/services/text-item-painter.ts`                    | callout branch in `paint` and `paintOverflow`                     |
| `tests/unit/media-composition/callout-plate.test.ts`                                | new                                                               |
| `tests/unit/media-composition/text-item-painter.test.ts`                            | callout paint test                                                |
| `src/lib/shared/media-composition/domain/walkthrough-camera.ts`                     | new: shares, regions, framing for a view, beats, shots, keyframes |
| `src/lib/shared/media-composition/domain/walkthrough-callouts.ts`                   | new: bubble timing, size, placement, ids                          |
| `src/lib/shared/media-composition/domain/post-walkthrough.ts`                       | new: line resolution, range, clips, applying to the project       |
| `src/lib/shared/media-composition/domain/post-project-edits.ts`                     | export `newVideoFields`                                           |
| `src/lib/shared/media-composition/domain/post-project-ops.ts`                       | `build-walkthrough` op                                            |
| `tests/unit/media-composition/walkthrough-camera.test.ts`                           | new                                                               |
| `tests/unit/media-composition/post-walkthrough.test.ts`                             | new (builder, callouts, op)                                       |
| `scripts/feature-video/walkthrough-report.mjs`                                      | new: chapters and short holds from a snapshot                     |
| `tests/unit/scripts/walkthrough-report.test.ts`                                     | new                                                               |
| `scripts/post-project.mjs`                                                          | `walkthrough` command and usage line                              |
| media folder (not in the repo): `generate-tutorial.capture.mjs`, `walkthrough.json` | DSF 2, re-paced waits, pilot stop; the lines file                 |

Run tests with `npx vitest run --config tests/config/vitest.config.ts <file>`
from the worktree (its `node_modules` is a junction to the primary's).

---

### Task 0: Fold the planning decisions into the spec

- [ ] Edit the spec's Pieces 1, 3 and 4 and the Pilot to match the decisions
      above. Set `plan_path` to this file and `work_state: planned`.
- [ ] Prettier (primary checkout's binary, stdin) and commit the spec and this
      plan with explicit pathspecs.

### Task 1: Director boxes and page size

**Files:** `scripts/demo-capture/browser-director.mjs`,
`tests/unit/scripts/browser-director.test.ts`

- [ ] Tests first, in the existing file's style:
  - a `click(label)` event carries `rect` equal to the element box the page
    returned (extend the fake to return `{x, y, rect}`);
  - a `pick(selector)` event carries `rect`;
  - `shot()` writes `capture.json` with `viewport` from the page (the
    `innerWidth` fake), and `viewport: null` when that evaluate throws.
- [ ] Implementation:
  - `onScreenMatch` and `target`'s page function return
    `{ x, y, rect: { x: r.x, y: r.y, width: r.width, height: r.height } }`;
    `canvas()` returns the canvas box the same way.
  - A `let aimed = null;` set by `target`, `pick` and `canvas` to the rect
    (or null when the page function returned none, so old fakes still pass);
    every `events.push` adds `...(aimed ? { rect: aimed } : {})`.
  - `shot()` adds `viewport` to `proof`:
    `await Promise.resolve().then(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight, deviceScaleFactor: devicePixelRatio }))).catch(() => null)`.
- [ ] Run the director tests; commit both paths.

### Task 2: Callout bubbles in the painter

**Files:** `post-project.ts`, `post-project-compiler.ts`, new
`services/callout-plate.ts`, `services/text-item-painter.ts`, tests.

- [ ] Schema: `PostTextItemSchema` gains
      `callout: z.object({ x: z.number().finite().min(0).max(1), y: z.number().finite().min(0).max(1) }).strict().optional()`
      with a doc comment (the point the bubble's tail aims at, shares of the
      frame; a text item with it draws as a bubble). Export `PostCallout`.
- [ ] Compiler: `CompiledTextItem` gains `callout?: PostCallout`; the text case
      spreads `...(item.callout ? { callout: item.callout } : {})`.
- [ ] `callout-plate.ts` (pure, no canvas):
  - Constants copied from `ThoughtCaption.svelte` with a comment naming it:
    `CALLOUT_FILL = "rgba(16, 16, 24, 0.88)"`,
    `CALLOUT_BORDER = "rgba(255, 255, 255, 0.14)"`,
    `CALLOUT_TEXT = "#f4f4f8"`, radius 20, tail 16, padding 24 by 18, all in
    px at 1080 frame height; `CALLOUT_SIZE_FRACTION = { s: 0.026, m: 0.0315, l: 0.04 }`,
    `CALLOUT_MIN_SCALE = 0.8`, `CALLOUT_LINE_HEIGHT = 1.3`,
    `CALLOUT_FONT_STACK = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'`.
  - `calloutGeometry(rect, box, callout, size)` returns
    `{ unit, radius, padX, padY, fontPx, tail }` where
    `unit = frameHeight / 1080`, `frameHeight = rect.height / box.height`,
    and `tail` is null when the point (in painter pixels:
    `rect.x + (callout.x - box.x) * frameWidth`, same for y) is inside the
    plate, else `{ side, base1, tip, base2 }`. Side: top when the point is
    above the plate, bottom when below, else left or right. The tail is the
    outer half of a rotated square of side `16 * unit`: half-width
    `16 * unit / Math.SQRT2` along the edge, tip the same distance out. Its
    centre along the edge is the point's coordinate clamped to
    `[edge start + radius + half-width, edge end - radius - half-width]`.
  - `calloutOverflow(target, box)` returns insets: 24 units each side, 36 at
    the bottom (tail plus shadow).
  - `calloutPlatePath(context-like, rect, geometry)` traces one closed path:
    rounded corners with `arcTo`, and the tail's three points inserted on its
    side, so the plate and tail fill and stroke once with no double alpha.
- [ ] Painter: `paintOverflow` returns `calloutOverflow` when `compiled.callout`
      is set. `paint` branches first on `compiled.callout`: save; shadow
      (`rgba(0,0,0,0.45)`, blur `20u`, offsetY `12u`); fill path with
      `CALLOUT_FILL`; clear the shadow; stroke with `CALLOUT_BORDER` at `1u`;
      words: `600 ${fontPx}px ${CALLOUT_FONT_STACK}`, `wrapCaptionText`
      within `rect.width - 2 padX`, shrink by 1 px while the block is taller
      than `rect.height - 2 padY` and above `CALLOUT_MIN_SCALE` of the start
      size; `textAlign = "left"`, `textBaseline = "middle"`, lines from
      `captionLineYPositions(centre, n, fontPx * 1.3)`, fill only, no stroke.
      `style` and `animation` are ignored for a callout.
- [ ] Tests:
  - `callout-plate.test.ts`: a point above the plate gives a top tail whose
    tip is above the plate's top and whose centre follows the point's x; a
    point far left clamps the tail clear of the corner; a point inside gives
    no tail; a point beside the plate (vertically within it) gives a left or
    right tail; `unit` scales with the frame height (a 1080 vs 2160 frame).
  - `text-item-painter.test.ts`: a `PathContext` fake extending `FakeContext`
    with `beginPath`, `moveTo`, `lineTo`, `arcTo`, `closePath`, `fill`,
    `stroke` recording calls and the `fillStyle` at each fill. A callout item
    fills once with `CALLOUT_FILL`, strokes once, draws words with
    `fillText` only (no `strokeText`), left-aligned at `rect.x + padX`; a long
    text shrinks no lower than 80% of the start size; `paintOverflow` is
    non-zero for a callout and zero for a plain item.
- [ ] Run both test files plus `tests/unit/media-composition/post-project*.test.ts`
      that touch the schema; commit.

### Task 3: The walkthrough builder

**Files:** new `walkthrough-camera.ts`, `walkthrough-callouts.ts`,
`post-walkthrough.ts`; `post-project-edits.ts` (export `newVideoFields`);
tests `walkthrough-camera.test.ts`, `post-walkthrough.test.ts`.

Types (in `post-walkthrough.ts`, exported):

```ts
export interface WalkthroughRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface WalkthroughEvent {
  label: string;
  action: string;
  time: number;
  x: number;
  y: number;
  rect?: WalkthroughRect;
}
export interface WalkthroughCapture {
  events: WalkthroughEvent[];
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
  } | null;
}
export interface WalkthroughLine {
  click: string;
  after: number;
  text: string;
  chapter?: string;
  shot?: "close" | "wide";
  sameClick?: boolean;
  include?: WalkthroughRect;
}
export interface WalkthroughScript {
  keep?: [number, number][];
  wideAfter?: string[];
  maxZoom?: number;
  lines: WalkthroughLine[];
}
export interface WalkthroughBuild {
  project: PostProject;
  chapters: { name: string; seconds: number }[];
  warnings: string[];
}
export function buildWalkthrough(
  project: PostProject,
  input: {
    takeId: string;
    capture: WalkthroughCapture;
    script: WalkthroughScript;
    chapter?: string;
  },
  ctx: EditContext
): WalkthroughBuild;
```

`walkthrough-camera.ts`:

- `framingForView(view: {cx, cy, zoom}, maxZoom)` returns a `PostFraming`
  (`rotation: 0`): zoom clamped to `[1, maxZoom]`; at zoom 1 the pans are 0;
  else `panX = clamp(-zoom * (cx - 0.5) / (zoom - 1), -0.5, 0.5)`, same for y.
- `viewOfFraming(framing)` returns the visible source share rect
  (`left = 0.5 + (-0.5 - panX * (zoom - 1)) / zoom`, width `1 / zoom`).
- `toOutput(framing, point)` maps a source share point to an output share:
  `0.5 + panX * (zoom - 1) + zoom * (u - 0.5)`.
- `regionZoom(rect, maxZoom)`: pad by 0.10 width and 0.30 height, then
  `min(maxZoom, 1 / w, 1 / h)`, at least 1.
- `planShots(beats, maxZoom)`: groups close beats as in decision 4, returns
  shots `{ kind, framing, arriveBy | startAt, beatIndexes }`.
- `scheduleMoves(shots, rangeStart)`: the move list
  `{ start, end, from, to, beatTime }` per decisions 1, 3 and 5, plus
  warnings; starts wide.
- `cameraKeyframes(moves, rangeStart, rangeEnd)`: one key at `rangeStart`
  (wide, `DEFAULT_EASING`), then per move a key at `start` holding the
  previous value with `DEFAULT_EASING` and one at `end` with the new value
  (`DEFAULT_EASING`).
- `splitKeyframes(keys, clip: {sourceIn, sourceOut}, sample)` per decision 6,
  where `sample(t)` is `framingAt` over a synthetic video item spanning the
  whole range with `start = sourceIn = rangeStart`, `speed = 1`.

`walkthrough-callouts.ts`:

- `bubbleId(text)`: `bubble-` + the first six words slugged (lowercase,
  `[a-z0-9]+` joined by `-`, at most 40 chars) + `-` + six hex chars of an
  FNV-1a hash of the trimmed text.
- `bubbleSize(text, frame: {width, height})`: font
  `0.0315 * frame.height`, glyph estimate `0.55 * fontPx`, greedy word wrap
  into lines no wider than `0.36 * frame.width - 2 * 24u`; at most two lines
  (more leaves the painter to shrink); width = widest line + `2 * 24u`, at
  least `160u`; height = `lines * 1.3 * fontPx + 2 * 18u`. Returned in shares.
- `placeBubble(size, target: rect in output shares, point, frame)`: 34 units
  away, tries above, below, right, left; centred on the point along the free
  axis, clamped 24 units inside the frame; accepts the first spot inside the
  frame that does not overlap the target; else below, clamped, with a
  warning.
- `bubbleTimes(lines, moves, rangeEnd)`: start `max(lineTime, end of a move
covering it)`; end `min(next line time, next move start after the start,
rangeEnd) - 0.1`; warns under 1.6 s; drops one under 0.5 s with a warning.

`post-walkthrough.ts`:

- Resolve lines: cursor over events; `sameClick` reuses the previous line's
  event; a missing match throws `No click matching "<click>" for "<text>".`
  Duplicate texts throw. A line without `click` throws.
- Range: whole take, or for `chapter` decision 8; unknown chapter throws.
- Clips: `keep` ranges (default `[[0, take duration]]`) intersected with the
  range; a line whose click or time is in no clip throws
  `"<text>" falls inside a cut.`
- Canvas check (decision 10) using `postOutputSize(postCanvasOf(project))`
  against the viewport aspect within 1%.
- Beats from every event in range (decision 1), lines' `include` and `shot`
  applied to their event's beat, sameClick beats per decision 3.
- Apply: drop every main-track item; append one video item per clip
  (`newVideoFields(take, a, b)`, id from `createIdAllocator`, box full,
  keyframes `{ framing: split keys }`, static zoom/pan from the first key);
  replace or add an overlay track with id `walkthrough` holding the bubbles:
  `{ kind: "text", text, size, callout, box, start, duration, opacity: 1,
fadeIn: 0.2, fadeOut: 0.2, anchor: { itemId: clip id, offset }, fill: false,
label? }`, keeping `text` and `size` of an existing item with the same id.
  `finish(next, ctx)`.
- Chapters: `seconds` = post time of the chapter's first move start.

Tests (`walkthrough-camera.test.ts`):

- `framingForView` centres the asked point: for zooms 1.25, 1.6, 2 and centres
  (0.2, 0.3), (0.5, 0.5), (0.8, 0.9) where unclamped, the output position from
  `resolvePanOffset` (drawWidth 1920, region 1920 by 1080, scale = zoom) and
  `X = 960 + pan.x + zoom * (u * 1920 - 960)` is 960 within 0.5 px; clamped
  cases keep the point inside the frame.
- `toOutput` agrees with the same compositor formula.
- `regionZoom` caps at maxZoom and never goes below 1.
- `planShots` groups the three Level buttons (y 49, x 1246 to 1718 on a 1920
  page) into one shot and keeps a Generate press at y 875 apart.
- `scheduleMoves`: a close move arrives 0.3 s before its click over 0.8 s; a
  wideAfter press pulls out from 0.2 s to 1.0 s after; overlapping moves
  start at the previous end and warn when late.
- `splitKeyframes`: each clip starts and ends on the sampled value; keys stay
  within zoom 0.5 to 4 and pan ±0.5.

Tests (`post-walkthrough.test.ts`), with a fixture of take-2-like Level
events with rects and a 1920 by 1080 viewport and a 16:9 project with one
take:

- builds one main clip per kept range in order, with framing keys;
- a chapter build spans 2 s before its first click to the next chapter's
  first move start;
- no bubble overlaps a camera move, leaves the frame, or covers its target
  (checked in output shares through the clip's framing at the bubble's
  start);
- a line in a cut, a missing click and a duplicate text are refused with
  their messages;
- a rebuild keeps a bubble's edited words and size;
- take-2 input without `rect` or `viewport` builds (48 by 48 boxes, 1920 by
  1080 page);
- the first bubble of a chapter carries the chapter name as its label;
- a 9:16 project is refused.

- [ ] Write the camera tests, run (fail), implement `walkthrough-camera.ts`,
      run (pass).
- [ ] Write the builder tests, run (fail), implement callouts and builder,
      run (pass).
- [ ] Commit the five new files and the `newVideoFields` export.

### Task 4: The op and the CLI

**Files:** `post-project-ops.ts`, `scripts/feature-video/walkthrough-report.mjs`,
`scripts/post-project.mjs`, tests.

- [ ] Op union member:
      `{ op: "build-walkthrough"; take: string; capture: WalkthroughCapture; script: WalkthroughScript; chapter?: string }`;
      the case validates shapes (arrays, finite numbers, strings) with plain
      messages and returns `buildWalkthrough(...).project`.
- [ ] `walkthrough-report.mjs`: `walkthroughReport(snapshot)` reads the track
      with id `walkthrough` and returns
      `{ bubbles, chapters: [{ name, at: "m:ss" }], short: [{ text, seconds }] }`
      (chapter time = labelled bubble start minus 1.5 s, floored at 0).
- [ ] CLI `walkthrough --feature SLUG --lines FILE [--capture FILE] [--take ID] [--chapter NAME]`:
      reads both files, keeps only `label, action, time, x, y, rect` of each
      event, finds the take (`--take`, else the only take, else an error
      listing them), sends the op through `sendOps`, then prints
      `walkthroughReport(await currentSnapshot())` with the edit status.
      Usage line added.
- [ ] Tests: an op test in `post-walkthrough.test.ts` through
      `applyPostProjectOps` (one call gives the built project; a bad payload
      names the op in its error); `walkthrough-report.test.ts` for chapters,
      times and short holds.
- [ ] Run the focused tests, then `npm run check:fast` (after the resource
      gate) for types; commit.

### Task 5: Pilot

All in `E:/tka-platform-media/feature-videos/generate-tutorial/` unless noted.

- [ ] Read `scripts/feature-video/capture.mjs` and the capture script; set
      `deviceScaleFactor: 2`, re-pace the Level waits (decision 12), and stop
      after the first Turn Intensity click plus 3 s.
- [ ] Write `walkthrough.json`: `wideAfter: ["generate-button-card"]`, the four
      Level lines (Level 1 line 2 `sameClick`, `shot: "wide"`, `after: 3.4`,
      `include` = the Turn Intensity card's box from take 2's page), and the
      Turn Intensity chapter's first line so the range ends there.
- [ ] Probe 5173 (`curl.exe -k -g "https://[::1]:5173/"`), check no other
      capture runs, record take 3 signed in as the shared test account
      (credential script only, clipboard cleared). Check fps (frames over
      elapsed) is at least 24, else re-record at DSF 1.5. Cut any reload with
      `keep`.
- [ ] `link-capture`, then `walkthrough --chapter Level`, then
      `render --feature generate-tutorial --name generate-tutorial-level-pilot --open`.
- [ ] Check: stills at each click and one mid-move (`stills --at`); a contact
      sheet; open the project in the editor (agent browser) and compare the
      preview with export stills at one mid-move and two settled times.
- [ ] Send Austen the clip (under 30 MiB) and the still sheet, with a short
      plain note.

### Task 6: Integrate

- [ ] `npm run wt:finish -- codex/walkthrough-zoom --nonvisual` from the
      primary checkout (the change is editor drawing plus tooling; the pilot
      export is the visual proof). No push.
- [ ] Update memory (`project_promo_video_1_0.md` and its MEMORY.md line).
