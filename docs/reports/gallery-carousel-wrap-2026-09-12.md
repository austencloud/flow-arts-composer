# Gallery inline carousel wrap — report

Feedback: `uupNJxBpHcZa17cSvJwq` (duplicates `5tmLHHo7LchKwPniz9hI`,
`2zvtSQWeEIJbDSmHLbIY`).

- Branch: `claude/fix-gallery-carousel-wrap-snutx2` (cloud push policy requires a
  `claude/` branch; the requested `codex/opus-gallery-wrap` slug is recorded here
  instead of as a ref).
- Session: `session_015FHEuRbmPaYGWx9PxLgWBx`
- Environment: Claude Code cloud container (Linux). The Windows worktree
  lifecycle in `AGENTS.md` is adapted: this container is an isolated ephemeral
  clone with no dev server and no parallel agents, so the task branch is
  developed in the container checkout and pushed for the local coordinator to
  integrate. No `main` push, no deploy, no feedback/production mutation.

## Status

- [x] Reproduced by code inspection and traced the real carousel owner
- [x] Root cause identified
- [x] Fix implemented
- [x] Focused tests written and run (29 assertions, jsdom + real Chromium)
- [ ] Card-level visual pass (see "Unresolved risks")

## Where the carousel actually lives

The starting entry point, `InlineAnimationPlayer.svelte`, is **not** the owner of
the gallery card's inline playback. The Browse card play chip
(`ChoreoCardThumbnail/PreviewPlayChip.svelte`) toggles `cardHoverPreview`, which
mounts
`src/lib/shared/browse/components/hover-preview/CardHoverPreviewLayer.svelte`.
That layer owns its own `requestAnimationFrame` clock and renders the carousel
rail with the shared `src/lib/shared/timeline/StepStrip.svelte` ("focus-locked
read-ahead carousel").

## Root cause

`CardHoverPreviewLayer` drove the strip with a raw modulo clock:

```js
const step = (currentStep % stepCount) + 1; // 1 .. stepCount+1, never < 1
```

and mounted `StepStrip` with `loop={false}` while leaving `includeStartPosition`
at its default `true`.

Two defects follow, and they are exactly the two reported symptoms:

1. **Instant pop at the boundary.** The strip's active index runs
   `1 … stepCount` and then jumps back to `1`. `StepStrip` treats a decreasing
   active index as "backward scrub or init" (`isBackOrInit`), which sets
   `animateTrack = false` (`.step-track.no-anim`) — the rail hard-cuts back to
   the beginning instead of sliding. With `loop={false}` the virtual render
   window is also clamped to the real cell range, so no wrapped neighbours exist
   to slide into.
2. **Start position dropped from the cycle.** The rail's cells come from
   `buildNotationCells`, whose index 0 is the Start cell. Because the clock never
   produced a step below `1`, the Start cell rendered in the rail but could never
   take focus, and every wrap landed on beat 1 — the start pose was skipped in
   the ordering on every repeat.

In short: the clock repeated on `N` while the rail it fed repeated on `N + 1`.

## Fix

Commits `897f9b76` (first attempt) and `60ffb50e` (revision after review).

The first attempt made the rail and the clock share a modulus by performing the
start pose as a slot in every repeat. Review rejected that, correctly: it
inserted a beat of stillness into a seamlessly loopable sequence — a pause in
something meant to spin continuously — and it framed a false choice between that
pause and dropping the Start cell (and with it the card morph's `cell-0` pair).
The revision keeps playback time alone and solves the wrap entirely on the rail.

**1. Canonical loop semantics decide whether the start pose is performed.**
`src/lib/shared/timeline/loop-cycle.ts` (new) carries `performsStartSlot`, which
is the rule the playback controller already applies at its own boundary
(`onAnimationUpdate`): a seamlessly loopable sequence resumes at
`startPositionDuration`, skipping the repeated start hold because its last beat
already ends on the start pose; a freeform sequence restarts at 0 and replays
it, which is what makes its pose jump legible.

- **Loopable sequence: cadence untouched.** `resolvePreviewCycleStep` reduces to
  exactly the `(elapsed % stepCount) + 1` clock the preview has always run — no
  held pose, no padded cycle, no added beat. A test pins it against that formula
  frame by frame.
- **Freeform sequence:** the start hold is performed at the seam, one beat, the
  same duration the canonical controller uses. The first pass still opens in
  motion, so tapping play never shows a held pose.

**2. The wrap is fixed on the rail, not in the clock.** `CardHoverPreviewLayer`
keeps `includeStartPosition` (the Start cell stays in the rail, so the card
morph keeps its `card-morph-cell-0` pair) and now passes `loop={true}`.
StepStrip's loop offset makes the focus index monotonic across the seam, so the
slide transition is never cut:

- when the start hold is performed, the repeat and the rail are the same length
  and the seam is one ordinary stride;
- when it is not, the rail is one cell longer than the repeat, and that
  difference is spent as rail travel: a single forward slide carries the Start
  cell through the focus, marking the seam without costing playback time.

Either way the carousel travels forward; nothing resets, and no cell is
dropped.

**3. `StepStrip` gains one output, not new behavior.** Its window and
loop-offset math moved verbatim into `src/lib/shared/timeline/strip-window.ts`
so the index behavior is testable, plus one addition: a looping window can
render the same cell more than once, and a document may carry each
`view-transition-name` only once, so the copy belonging to the focus's repeat is
marked `data-cell-instance="primary"`. `CardHoverPreviewLayer`'s morph selectors
pair against that copy. Without `loop`, every rendered cell is primary and
`loopOffset` is never touched, so existing consumers are unchanged — asserted by
tests, see below.

## Verification

Run in this container after `pnpm install --frozen-lockfile` and
`pnpm run build:packages` (pnpm 10.28.0, matching `packageManager`).

| Check                                                                                                    | Result                                                          |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `vitest … src/lib/shared/timeline tests/unit/browse/gallery-preview-cycle`                               | **25 passed** (loop-cycle 10, strip-window 13, gallery 2)       |
| `StepStrip.svelte.test.ts` in real Chromium (components config)                                          | **4 passed**                                                    |
| Related contracts: homepage-hero-notation, inbox-inline-player, shape-matrix, effect-preview-loop-policy | **passed** alongside the suites above                           |
| `prettier --check` on changed files                                                                      | clean                                                           |
| `eslint` on changed `.ts`                                                                                | clean (`.svelte` and `tests/` are ignored by the ESLint config) |
| `stylelint` on both changed components                                                                   | clean                                                           |
| `pnpm run check:fast`                                                                                    | 582 pre-existing project errors; **none in any changed file**   |

What the tests assert — the silent behavior, in three groups:

_No injected playback time (the review's blocking concern):_

- against a real seam-closed LOOP fixture, `performsStartSlot` is false, the
  repeat is exactly `steps.length` beats, and the clock matches the pre-fix
  `(elapsed % stepCount) + 1` formula frame for frame;
- a loopable repeat never yields a step below 1 — no frame rests on the start
  pose;
- simulating the preview at 30 frames/beat over 13 beats, no focus frame lands
  on the Start cell, and the only index the seam steps over is that cell: the
  extra travel is spent on the rail, not on the clock;
- the freeform fixture (same sequence, seam broken) does perform the hold, one
  beat, in canonical order.

_Wrap continuity:_

- the carousel's focus index never decreases, for either seam kind;
- in a real browser, across two full repeats of both seam kinds, the rendered
  `.step-track` never carries `no-anim` and its `translateX` is monotonic — it
  only ever travels forward, including through both boundaries;
- exactly one copy of each cell — the Start cell included — is morph-pairable
  while looping.

_Existing consumers, unchanged:_

- a non-looping rail (practice lane, landing showcase, pattern strip) still
  clamps to its real cells, renders no wrapped duplicates, marks every cell
  primary, and — in the browser — still cuts (`no-anim`) on a genuine backward
  scrub, which is the behavior the wrap had to stop imitating;
- the endless spinner's lane (Start cell dropped, repeat equal to its cell
  count) still advances exactly one stride per beat, cell order intact across
  repeats.

The component test renders cells with empty pictograph payloads on purpose: the
rail's travel is what is under test, and real pictograph data pulls the SVG
preloader and the whole static asset tree into the browser run.

## Unresolved risks

- **No card-level visual pass.** This container has no dev server and the Browse
  gallery needs app data, so the wrap was verified as DOM/geometry behavior in
  Chromium, not as a screenshot of a real card. What a local reviewer should
  watch, in priority order:
  1. **The loopable seam** on a LOOP-badged card. The rail covers two strides in
     one slide there (the Start cell passes through the focus at roughly double
     the usual travel speed) while the animation itself keeps its exact cadence.
     That is the one place the fix could read as a hitch rather than a marker;
     it is rail-only motion and can be softened without touching playback.
  2. **The freeform seam**, where the animation now holds the start pose for one
     beat per repeat (it previously jumped straight back to beat 1). This
     matches the full viewer's freeform loop; confirm it reads as a settle
     rather than a stall on a short card.
  3. **The play/stop morph on a short sequence** (2–4 beats), where the looping
     rail now renders repeated cells and the morph pairs only against the copy
     marked `data-cell-instance="primary"`.
  4. Both rail orientations: rail below the stage on a tall card, vertical rail
     to the right on a wide one.
- **Beat durations are still uniform in this preview.** The clock assumes one
  beat per slot, as it did before; a sequence with variable beat durations will
  drift against the canonical duration-aware timeline. Out of scope here —
  `orchestrator.calculateStateDurationAware` is the seam if it ever matters.
- **Shared-component surface.** The `StepStrip` extraction touches a primitive
  with ~15 consumers. Behavior is unchanged by construction (the window math
  moved verbatim; the loop branch is still gated on `loop`) and is now covered
  by the consumer tests listed above, but the review surface is wider than the
  gallery.
