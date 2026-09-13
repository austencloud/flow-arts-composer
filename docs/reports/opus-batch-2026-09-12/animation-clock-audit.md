# Animation clock and sampling audit

Read-only audit of the playback clock: elapsed-time to step mapping, fractional
step durations, speed changes, backward stepping, seek endpoints, hidden-tab
resume, drift across many loops, and pose discontinuities.

| | |
| --- | --- |
| Date | 2026-09-13 |
| Base SHA | `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (`origin/main`) |
| Final SHA | `dd46ad64b4c68636f66a03f2ffa0f8c74bd70804` — every deliverable is complete at this commit; the line itself is recorded by its child commit |
| Branch | `claude/animation-clock-audit-ri0dna` |
| Production code changed | none |

## Owned files

Added, and owned entirely by this audit:

- `tests/unit/opus-animation-clock-audit/support/clock-harness.ts`
- `tests/unit/opus-animation-clock-audit/elapsed-to-step-mapping.test.ts`
- `tests/unit/opus-animation-clock-audit/loop-drift-and-suspension.test.ts`
- `tests/unit/opus-animation-clock-audit/seek-step-and-discontinuities.test.ts`
- `docs/reports/opus-batch-2026-09-12/animation-clock-audit.md` (this file)

Nothing under `src/` was modified. Excluded by the brief and untouched: the
gallery StepStrip/seam work, fire lifecycle, audio scheduling, generation
transforms, and video export encoding.

## Method

The suites drive production objects directly —
`AnimationPlaybackController`, `AnimationLoop`, `SequenceAnimationOrchestrator`,
`AnimationStateManager`, and the pure helpers in `step-calculator.ts` — over a
deterministic `requestAnimationFrame`/`performance.now` pair, so a frame budget
can be dictated exactly and a hidden tab (wall time advances, no frames
delivered) can be reproduced.

Sequences are canonical generator output from
`tests/fixtures/loop-audit/real-loop-fixtures.json`, produced by
`scripts/generate-loop-audit-fixtures.mjs` off the production LOOP pipeline. The
freeform variants are those same sequences with their closing beat removed, so
`isSeamlesslyLoopable` reports false for a real structural reason rather than a
mocked one. Step durations, where varied, stay inside the range the duration
editor allows (1.00–10.00 in 0.01 steps — `duration-handler.ts`).

Invariants are stated from the timeline definition, not copied from the
implementation: position is non-decreasing in time; step `k` starts at
`startHold + sum(d_0..d_{k-1})` (prefix sums computed in the test); position
advances at `1/d_k` inside step `k`; a seamless lap is worth `sum(d)` of
sequence time and a freeform lap `1 + sum(d) + 1`.

## What is sound

Measured, not assumed. Each bullet corresponds to passing assertions in the
suites above.

- **Elapsed-to-step mapping is exact under fractional durations.** With
  durations `[1, 2, 1.5, 1.25, 3, 1.1, 2.5, 1.75]`, every step boundary lands on
  its integer beat to 1e-10, the rate inside each step is `1/d_k` to 1e-9, and
  the position is non-decreasing when sampled at 1 ms across the whole timeline.
- **Both round trips close.** `time -> position -> time` and
  `position -> time -> position` agree to better than 1e-9 across the timeline
  and the scrub range.
- **The seek path and the clock path sample the same pose.**
  `calculateState(position)` (seeks, step buttons, export frames) and
  `calculateStateDurationAware(time)` (continuous playback) produce prop angles
  within 1e-9 of each other at equal positions, over the whole timeline. The one
  exception is C5 below.
- **Speed scaling is exactly proportional**, and is clamped to `[0.1, 3.0]` in
  both the panel state and the loop. A speed set while paused is not pushed to a
  stopped loop but is carried by the next `start()`.
- **Backward stepping is exactly invertible.** N full-beat steps forward then N
  back return to the exact origin, likewise for half-beat steps, and the
  transport refuses to move past either end of the timeline. There is no
  continuous reverse playback anywhere in the animation engine — "reverse" is
  the backward step transport and backward scrubbing.
- **The start hold behaves as designed, and the two cases differ correctly.** A
  seamless sequence shows the start hold on lap 1 only and restarts later laps at
  beat 1; a freeform sequence replays the start hold every lap and parks on the
  end beat for a further whole beat (≈60 frames each at 60 Hz in the
  measurement).
- **`stop()` resets cleanly** to position 0 and the opening pose.

## Findings

Severity is about reachable user impact, not code tidiness. Every "measured"
number below is printed or asserted by the committed suites.

### C1 — The loop boundary drops the frame remainder, so every lap runs long

**Confirmed. Moderate.** `animation-playback-controller.ts:719` computes
`boundaryOverrun` — the slice of the boundary frame that landed past the end of
the sequence — under a comment that says keeping it is what avoids "a tiny
cadence hitch at every boundary". The value is then consumed only by
`acceptSequenceBoundary` (`:803`). The same-sequence loop path, which is the
ordinary case, resets `timePosition` at `:737` without it and the remainder is
lost.

Measured, 8-beat canonical LOOP, durations summing to 12.51 beats, 60 Hz, speed
1.0:

| Case | Nominal lap | Measured lap | Drift |
| --- | --- | --- | --- |
| Seamless | 12 510.00 ms | 12 516.67 ms | +6.67 ms/lap; +133.3 ms after 20 laps |
| Freeform | 13 220.00 ms | 13 233.33 ms | +13.33 ms/lap |
| Seamless, jittered frames | 12 510.00 ms | — | +30.09 ms/lap mean, every lap strictly long |
| Seamless, speed 3× | 4 170.00 ms | — | +13.33 ms/lap = 0.04 beats of sequence time |

Two properties make this worse than noise. The error is **one-signed**: the
playhead is reset to a fixed point and then has to cover the full lap again, so
a lap can never come in short — `min(lap) > nominal` holds in every run,
including the jittered one. And under a steady cadence it is **identical every
lap** (`max − min < 1e-6`), so it is a straight line, not something that
averages out.

Bound on the loss: at most one frame of *sequence* time per lap, i.e.
`frameDelta × speed` — up to ~50 ms of sequence time per lap at 3× on a 60 Hz
display.

Why it matters beyond smoothness: `onLoopComplete` is the tick that drives the
tempo-practice BPM ramp (`sequence-viewer/components/playback-controller.svelte.ts:248`)
and the landing hero's sequence chaining. A metronome whose period is
systematically long is the specific failure mode this callback must not have. At
the measured 6.67 ms/lap, a five-minute practice run (~24 laps of this sequence)
finishes about 160 ms late.

**Bounded fix (≈3 lines, one file).** In the fallback branch, after the
re-initialise that recomputes `totalDuration`, carry the remainder the way
`acceptSequenceBoundary` already does:

```
const base = this._isSeamlesslyLoopable ? fallbackStartPositionDuration : 0;
this.timePosition = Math.min(base + boundaryOverrun, this.totalDuration);
```

The clamp is what keeps a pathological `deltaTime` (see C2) from skipping past
the new lap entirely. **Known cost:** two existing expectations assert that the
fallback path calls `calculateStateDurationAware(1)` exactly
(`animation-playback-controller-boundary-handoff.test.ts:143` and `:174`); they
would become `1 + overrun` and must be updated in the same change. The audit
suite's drift assertions are written against current behavior and would need to
flip to "lap === nominal" at the same time — they are marked in-file.

### C2 — No maximum timestep: one frame consumes an entire suspended tab

**Confirmed. Moderate.** `animation-loop.ts:154-158` takes
`timestamp - lastTimestamp` and multiplies by speed with no upper bound. The
only mitigation is `RenderActivityGate`, which nulls `lastTimestamp` when the
document goes hidden — and of the hosts that drive a playback controller, only
`AnimationPlayer.svelte:273` (standalone mode) and
`InlineAnimationPlayer.svelte:559` install one. The compose playback tab
(`SingleRenderer.svelte`, `TunnelRenderer.svelte`), train practice
(`CanvasSection.svelte`), `InlineSequencePlayer.svelte`,
`FuseAnimationPreview.svelte`, the onboarding play step and
`SequenceDrawerHost.svelte` all claim the same module singleton
(`getAnimationPlaybackController()`) without gating it. *(Host enumeration is
static grep evidence, not a runtime observation of which hosts mount together.)*

Measured:

- Ungated, non-looping freeform player: 12 frames of playback leave the playhead
  at position 0.033, inside the start hold. A 30 000 ms suspension followed by
  **one** frame moves it to `totalSteps + 1` and sets `isPlaying` false — the
  whole sequence is consumed between two paints.
- Ungated, looping: a suspension spanning three laps plus four seconds produces
  exactly **one** `onLoopComplete`. Two laps are simply not counted.
- Gated contrast, same 30 000 ms suspension with a real
  `createRenderActivityGate({ ignoreViewport: true })` and
  `document.visibilityState = "hidden"`: the playhead moves less than 0.05 beats
  and playback stays live.

**Bounded fix (1 line + 1 constant).** Clamp in `AnimationLoop.loop`:

```
const deltaTime = Math.min(timestamp - lastTimestamp, MAX_FRAME_DELTA_MS);
```

with the constant beside the other playback constants in
`domain/constants/timing.ts` (100 ms ≈ six dropped frames is the usual choice).
This is independent of gating, and it also removes the same jump after a long GC
pause or a debugger break. `AnimationLoop`'s consumers are all live-playback
hosts — the deterministic export drives frames through
`video-pre-renderer`/the externally-driven render loop, not through this loop —
so no deliberate large-delta caller is clamped by the change. Installing the
gate in the remaining hosts is the complementary fix; it is a larger diff and
still leaves the GC case, so the clamp should land first.

### C3 — Next-beat is a dead button in a 0.009-wide band below each beat line

**Confirmed. Low-moderate.** Three different tolerances surround one beat line.
The transport resolves its target with a 0.001 epsilon
(`animation-playback-controller.ts:482`, `:630`); `animateToStepInternal` then
swallows the move when `|currentStep − target| < 0.01` (`:365`);
`displayedBeatNumber` dwells at 0.01 (`step-calculator.ts:76`). Two bands
misbehave:

- `currentStep ∈ [k − 0.01, k − 0.001]`: the target resolves to `k`, the move is
  swallowed, and only `calculateState(k)` runs. The props snap to beat `k`'s
  opening pose but `currentStep` never moves — the step readout is stuck and
  pressing the button again does nothing. Measured at 2.998: after 90 frames
  (1.5 s) the position is still 2.998 and a second press changes nothing; at 2.95
  the transport advances to 3 normally.
- `currentStep ∈ (k − 0.001, k)`: the target resolves to `k + 1`, so beat `k`'s
  motion is never shown, while `displayedBeatNumber` still reads `k − 1`.
  Measured at 2.9995 → lands on 4.

Reachability: pausing continuous playback leaves an arbitrary fractional
position, so roughly 1% of pauses land in the dead band and 0.1% in the skip
band. The dead band is sticky — no number of presses gets out of it.

**Bounded fix (one file).** Give the transport a single shared tolerance: snap
`currentStep` to the nearest integer within `STEP_EPSILON` before computing the
next/previous boundary, and delete the separate 0.001. Both bands collapse and
the display tolerance and the transport tolerance stop disagreeing.

### C4 — Editing the sequence while paused snaps the pose to the opening pose

**Confirmed. Low.** `updateSequenceData` re-initialises the orchestrator
(`animation-playback-controller.ts:186`), and that re-initialisation resets prop
states to the opening pose (`sequence-animation-orchestrator.ts:174`). The pose
is then re-derived from the clock only on the "was playing" branch (`:211-220`);
the paused branch just republishes whatever the engine now holds.

Measured: seek to 4.5 (pose clearly different from the opening pose), then
`updateSequenceData` with the same steps → `currentStep` is still 4.5 while the
prop angles are exactly the opening pose. The playing branch keeps the two
together, which the suite asserts as the contrast case.

Reachability: `viewer-interactive-services-state.svelte.ts:142` calls
`updateSequenceData` whenever the content hash changes under a stable sequence
id — the viewer's re-hydration path.

**Bounded fix (3 lines).** Make both branches identical: call
`calculateStateDurationAware(this.timePosition)` and `syncCurrentStep` with its
result before `updatePropStatesFromEngine()` in the paused branch too.

### C5 — Live start pose and export sampler disagree when beat 1 is blank

**Confirmed. Low.** `calculateState` (`sequence-animation-orchestrator.ts:208`)
and `calculateStartPositionState` (`:705`) read the start pose off `steps[0]`
and return **without touching prop state** when that step has no visible motion.
`initializePropStates` (`:473`) and `samplePropStateAt` (`:372`) instead use
`findFirstBeatWithMotion()`.

Measured, with a canonical sequence whose beat 1 motions are replaced by
`createPlaceholderMotion` (the encoded "hand not really there" shape): seek to
4.5, then seek to 0 → the props keep beat 4.5's pose, because nothing wrote a
start pose. `samplePropStateAt(0)` returns a different, resolved opening pose.
So the "byte-for-byte what `calculateStateForStep` produced" claim on
`computePropStatesForStep` (`animation-playback-controller.ts:845-849`) does not
hold for sequences with a blank first beat.

**Bounded fix (2 call sites).** Resolve the start pose through
`findFirstBeatWithMotion()` in `calculateState` and `calculateStartPositionState`,
matching what the initialiser and the sampler already do.

### C6 — The step transport ignores per-step durations

**Confirmed. Design inconsistency, not a crash.** `getStepDuration`
(`animation-playback-controller.ts:435-440`) returns `1000 / speed × stepSize`
and nothing else; `runStepPlaybackTick` (`:675`) and all four step buttons pass
only the step size.

Measured with durations `[1, 4, 1, …]`: traversing position 1→2 (a 1-beat step)
and 2→3 (a 4-beat step) take the same wall time (both under 1100 ms), while the
clock's own map puts those traversals 1 and 4 time units apart.

Consequence: step mode and continuous mode play the same sequence with different
rhythms, and step mode silently ignores an edit made in the duration editor. The
fix is small (pass the step index and multiply by its duration), but whether step
mode is *meant* to be a uniform pager is a product call, so this is listed as a
follow-up rather than a defect to patch.

### C7 — `jumpToStep` and `seekToStep` clamp one beat apart

**Confirmed. Cosmetic.** `:282` clamps to `totalSteps`; `:306` clamps to
`totalSteps + 1`. Measured: the same "go to the end" intent lands a whole beat
apart depending on which entry point the caller used (`jumpToStep` is the
step-cell click path). Harmless today because the two are used for different
gestures, but it is the sort of asymmetry that makes the next end-of-timeline
change surprising.

### C8 — `isFirstLoop` is written and never read

**Observation.** Set in four places (`:56`, `:157`, `:258`, `:587`) and cleared
at `:724`, never read. The seamless-vs-freeform start-hold decision is carried
entirely by `_isSeamlesslyLoopable`. Dead state; worth removing in whatever
change touches the boundary code, so a future reader does not take it for a
live switch.

## Tests

No production code changed, so "before" and "after" refer to the state of the
suites with and without the added audit files.

| Run | Result |
| --- | --- |
| Before — `tests/unit/animation-engine` + `src/lib/shared/animation-engine` | 67 files, 397 tests, all passing |
| After — the same plus `tests/unit/opus-animation-clock-audit` | 70 files, 432 tests, all passing |

Command (project config, as `AGENTS.md` requires):

```
./node_modules/.bin/vitest run --config tests/config/vitest.config.ts \
  tests/unit/opus-animation-clock-audit tests/unit/animation-engine \
  src/lib/shared/animation-engine
```

The 35 added tests split as 9 mapping/round-trip invariants, 12 loop-drift,
start-hold, speed and suspension cases, and 14 seek/step/discontinuity cases.
Assertions that record a defect are named `MEASURED DEFECT` or
`MEASURED ASYMMETRY` in-file, with the expected post-fix assertion described in
the surrounding comment, so a later fix has an obvious place to flip.

The workspace packages had to be built once (`pnpm run build:packages`) before
`@tka/tka-types` resolved under the test config; that is an environment step,
not a repository change.

## Limitations

Stated so the numbers are not read as more than they are.

- All measurements are jsdom with a **dictated** frame cadence, not a real
  browser vsync. That is what makes the drift figure exact rather than noisy; it
  is not evidence about what a real display does between frames.
- The hidden-tab case is modelled by withholding `requestAnimationFrame`
  callbacks while wall time advances. This matches documented browser behavior
  and the gate's own design notes, but it is a model, not a capture from Chrome.
- The enumeration of which hosts install a `RenderActivityGate` is static grep
  evidence. It is not a runtime observation of which hosts are mounted together,
  and the controller is a module singleton, so a gate installed by one host can
  outlive the reason it was installed.
- `AnimationPanelState` is a plain double in the harness; the real one is
  rune-backed. It holds no timing logic — every number it stores is written by
  the controller — and its speed clamp mirrors production exactly.
- Prop angles are compared against each other across sampling paths, not against
  an external geometric ground truth. The audit proves the paths agree (or, in
  C5, do not); it does not certify the interpolation itself.
- The blank-first-beat case in C5 uses a canonical sequence with placeholder
  motions substituted. Whether real saved sequences reach playback in that shape
  was not measured.

## Follow-ups

1. Land C1 and C2 together — they interact through the clamp — and update the
   two boundary-handoff expectations and the audit's drift assertions in the
   same change.
2. C3 and C4 are independent, small, and each confined to one file.
3. C5 removes a real divergence between the live view and the export sampler;
   worth doing before anything else leans on that parity claim.
4. C6 needs a product decision first: is step mode a uniform pager, or should it
   honour the duration editor?
5. If C1's clamp lands, consider whether the tempo-practice ramp should count
   laps from the clock rather than from `onLoopComplete` callbacks, so a
   suspended tab cannot silently drop laps even with the delta clamp in place.
