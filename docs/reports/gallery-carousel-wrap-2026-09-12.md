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
- [x] Focused tests written and run (22 assertions, jsdom + real Chromium)
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

Commit `897f9b76`.

1. **`src/lib/shared/timeline/loop-cycle.ts` (new).** Pure mapping from a
   free-running beat clock onto one repeat, in slots — one slot per notation
   cell. `resolveCycleStep` returns the float step the rest of the timeline
   stack already understands (`<1` = start pose, `1..N+1` = beats);
   `resolveCycleBeatIndex` resolves the beat, or `null` while the start pose is
   held.
2. **`CardHoverPreviewLayer`.** Uses that mapping, so the repeat is exactly the
   rail's cell list and the start pose is performed in its own slot.
   `orchestrator.calculateState(step)` already treats `step < 1` as the start
   position — the same contract the canonical players use for beat 0 — and the
   stage shows the sequence's `startPosition` during that slot. The strip now
   gets `loop={true}` (with `includeStartPosition` explicit), so the boundary is
   one ordinary stride into the next copy. The clock starts at beat 1
   (`FIRST_BEAT`): a reader who just tapped play sees motion immediately, and the
   start slot arrives when the cycle reaches it.
3. **`StepStrip`.** Window and loop-offset math extracted verbatim into
   `src/lib/shared/timeline/strip-window.ts` so the index behavior is testable,
   plus one new output: a looping window can render the same cell more than once,
   and a document may carry each `view-transition-name` only once, so the copy
   belonging to the focus's repeat is marked `data-cell-instance="primary"`.
   `CardHoverPreviewLayer`'s card-morph selectors pair against that copy, which
   keeps the play/stop morph (`SheetMorphOverlay`) intact for short sequences.

No behavior change for any other `StepStrip` consumer: `loopOffset` is still
only touched when `loop` is set, and without `loop` every rendered cell is
primary.

## Verification

Run in this container after `pnpm install --frozen-lockfile` and
`pnpm run build:packages` (pnpm 10.28.0, matching `packageManager`).

| Check                                                                                 | Result                                                        |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `vitest run --config tests/config/vitest.config.ts src/lib/shared/timeline`           | **20 passed** (loop-cycle 9, strip-window 11)                 |
| `StepStrip.svelte.test.ts` in real Chromium (components config)                       | **2 passed**                                                  |
| Related contracts: homepage-hero-notation, inbox-inline-sequence-player, shape-matrix | **51 passed** total with the two suites above                 |
| `prettier --check` on changed files                                                   | clean                                                         |
| `eslint` on changed `.ts`                                                             | clean (`.svelte` is ignored by the ESLint config)             |
| `stylelint` on both changed components                                                | clean                                                         |
| `pnpm run check:fast`                                                                 | 645 pre-existing project errors; **none in any changed file** |

What the tests actually assert (the silent behavior):

- the clock repeats on the rail's cell count, not the beat count, and the old
  formula's shorter repeat is pinned as a regression guard;
- the start slot is reached once per repeat, in order, with beats following;
- simulating the preview's clock at 30 frames/beat over ~13 beats, the carousel's
  focus index **never decreases and never advances by more than one stride** —
  the boundary is an ordinary advance;
- exactly one copy of each cell is morph-pairable while looping;
- in a real browser, across two full repeats the rendered `.step-track` never
  carries `no-anim` and its `translateX` is monotonic (it only ever travels
  forward, including through both boundaries).

The component test renders cells with empty pictograph payloads on purpose: the
rail's travel is what is under test, and real pictograph data pulls the SVG
preloader and the whole static asset tree into the browser run.

## Unresolved risks

- **No card-level visual pass.** This container has no dev server and the Browse
  gallery needs app data, so the wrap was verified as DOM/geometry behavior in
  Chromium, not as a screenshot of a real card. A local reviewer should watch one
  gallery card through a boundary at a narrow tier (rail below the stage) and a
  wide tier (vertical rail to the right), and confirm the play/stop morph still
  pairs on a short sequence (2–4 beats), where the looping rail now renders
  repeated cells.
- **The start slot is now a held beat on every repeat.** That is what "correct
  start-position/step ordering" means for a rail that displays the Start cell,
  and it matches the canonical controller's freeform loop. For a _seamlessly
  loopable_ sequence the canonical player instead skips the repeated start hold;
  this preview does not, so a loopable sequence pauses for one beat per repeat
  where it previously ran straight through. If that reads as a stutter in the
  card, the alternative is the endless-spinner treatment (drop the Start cell,
  `includeStartPosition={false}`) — but that also drops the `card-morph-cell-0`
  pair from the play/stop morph, so it is a product call, not a cleanup.
- **Beat durations are still uniform in this preview.** The clock assumes one
  beat per slot, as it did before; a sequence with variable beat durations will
  drift against the canonical duration-aware timeline. Out of scope here —
  `orchestrator.calculateStateDurationAware` is the seam if it ever matters.
