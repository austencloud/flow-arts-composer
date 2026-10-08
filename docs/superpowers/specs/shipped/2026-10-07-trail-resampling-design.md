---
status: shipped
value: 4
effort: M
work_state: complete
remaining: "None. Motion sub-sampler, both trail overlays, fire path sweep and LED prior passes are implemented and tested; browser proof recorded in the plan."
depends_on: ''
plan_path: 'docs/superpowers/plans/shipped/2026-10-07-trail-resampling.md'
tags: [animation-engine, trails, effects, performance]
last_triaged: '2026-10-07'
---

# Frame-rate-independent trail sampling

**Date:** 2026-10-07
**Branch:** `codex/trail-resampling`
**Decision owner:** Austen chose approach A (resample the real motion) and the
widest scope (base pair, tunnel copies, fire and LED) on 2026-10-07.

## Problem

Live 2D trails capture one tip point per rendered frame straight from the
prop state the host hands the engine. When the machine is busy (recording,
exports in another tab, a heavy scene) the frame rate drops, the captured
points spread out along the arc, and the Catmull-Rom smoothing in both overlays
has nothing to recover the curve from. The trail turns into a polygon. Fire
and LED show the same defect in their own way: both renderers sweep a straight
chord from each tip's previous frame position to its current one, so a slow
frame paints a straight streak where the prop actually travelled an arc.

The motion itself is known exactly. The engine's own
`SequenceAnimationOrchestrator` is loaded with the live sequence by
`PlaybackSync` and already exposes `samplePropStateAt(step)`, the pure sampler
the video exporter uses to over-sample trails. Nothing live uses it.

## Goal

While playback runs, every slow frame contributes as many trail points as a
60 Hz frame sequence would have, placed on the real path. Fire and LED sweep
along that same path instead of a chord. At a healthy frame rate the output is
byte-identical to today. Export output is unchanged.

## Non-goals

- The 3D worker trails (separate pipeline).
- The legacy `TrailCapturer` and `AnimationPathCache` path (only active when no
  trails overlay renderer exists).
- Charcoal, zap, sparkles, ghost and the other per-tip registry effects. They
  keep reading `prevX/prevY` and `x/y` and are unaffected.
- Smoothing paused scrubbing or step mode. Sub-samples only exist while
  `isPlaying` is true and the step advanced.

## Design

### Owners

| Piece | Owner | Relationship |
| --- | --- | --- |
| Pure sampler | `SequenceAnimationOrchestrator.samplePropStateAt` | reuse |
| Sub-frame planner, sample pool, consistency guard | new `animation-engine/services/motion-sub-sampler.ts` | create |
| Sample source on the frame | `FrameSystem.buildFrameParams` sets `params.motionSampleSource` | extend |
| Tunnel copy sampler | `AnimationEngineProps.additionalLayersAt` to `RenderFrameParams.additionalLayersAt`; `ViewerMotionSurface` passes `tunnelController.preparedAdditionalLayersAt` | extend |
| Per-frame orchestration | `AnimationRenderLoop.render` | extend |
| Trail capture | `TrailOverlayWebGL2`, `TrailOverlayCanvas` (`motionSamples` on `TrailOverlayRenderParams`) | extend |
| Fire path | `FireTipTracker.update(..., motionSamples)` writes `PropTipData.path`; `WebGLFireRenderer` sweeps the polyline | extend |
| LED path | `LedSampler.update(..., out)`; `LedFrameInput.priorSamples`; `WebGLLedRenderer.buildSegments` runs one pass per sub-frame | extend |

Search terms used: substep, sub-sample, resample, interpolat, samplePropStateAt,
pathCache, TrailCapturer, prevX, chord. Closest matches:
`video-export/services/export-substep.ts` (beat-based cadence for the
deterministic exporter, stays export-only because the live cadence is
time-based), `AnimationPathCache` (120 fps precompute, dead when an overlay is
active), the LED renderer's rigid-body sub-steps and the fire renderer's chord
sweep (both already interpolate, but only along a chord). One new owner is
created for the live planner because no existing module turns a wall-clock
frame delta into sequence steps.

### Cadence

For a rendered frame with wall-clock delta `dt` seconds:

```
n = clamp(round(dt * 60), 1, 64)
```

`n - 1` sub-samples are inserted between the previous frame's step and this
frame's step. At 50 fps and above `n` is 1 and nothing changes. 40 fps gives
one extra sample, 30 fps one, 20 fps two, 10 fps five. The cap of 64 covers a
one-second stall; longer gaps are already treated as teleports by the ring
buffers (distance test) and as gaps by the fire tracker (200 ms rule).

The cadence is time-based on purpose. Tail length, tail recession and the
leading edge are all authored in "points at 60 Hz"; keeping points per second
at 60 preserves those semantics exactly. A beat-based cadence would shorten
the visible tail at high BPM.

### Planner (pure)

`planMotionSubSteps(prevStep, currentStep, n, totalBeats, seamless,
loopDetected, out)` writes the intermediate steps, oldest first, excluding
both ends, and returns the count.

- No loop and `currentStep > prevStep`: evenly spaced between them.
- Seamless loop detected (`prevStep - currentStep > 0.5`): the path runs
  `prevStep`, then `totalBeats + 1`, then `1`, then `currentStep`; steps past
  the end wrap by subtracting `totalBeats`. Steps handed to the sampler are
  clamped below `totalBeats + 1` because the orchestrator returns its fallback
  pose at the exact end.
- Non-seamless loop: both overlays drop their rings on this frame, and the
  playback controller restarts at time 0, so the path runs from `0` to
  `currentStep` only. Nothing before the wrap is sampled.
- Paused, backward (not a loop), or static step: zero samples.
- `n <= 1`: zero samples.

### Sample source and consistency guard

`FrameSystem.buildFrameParams` attaches `params.motionSampleSource =
{ totalBeats, sampleAt(step, outLeft, outRight) }` when the lifecycle
orchestrator is initialized. `sampleAt` calls `samplePropStateAt` and applies
this frame's `gridJoinOffsets` through the existing `shiftPropState`, so joined
grids place sub-samples where the live props are placed.

Hosts other than the sequence viewer (Studio frames, Post Studio layers,
compose cells, hover previews) feed props that may not come from this
orchestrator. Before inserting any sample the render loop samples the current
step and compares it with the frame's live `leftProp`/`rightProp` (Cartesian
center and staff angle, tolerance 1e-3 after unwrapping the angle). On a
mismatch the frame gets no sub-samples and a diagnostics counter increments.
The same check runs per tunnel layer against `additionalLayersAt(currentStep)`;
a mismatching layer (for example during the tunnel's authored formation travel)
gets no layer samples while the base pair keeps its own.

### Render loop

`render()` already knows `previousStep`, `currentStep`, `isPlaying`,
`loopDetectedThisFrame`, `isSeamlesslyLoopable` and the frame clock. The rAF
path computes `dt` from the effective frame time, plans the steps, fills a
pooled `MotionSubSample[]` (`left`, `right`, `layers[]`, `timeMs` interpolated
between the previous frame time and now) and hands that view to the trails
overlay, the fire tracker and the LED sampler. `renderSync` (export driver)
never plans samples; the exporter already renders 24 sub-steps per beat.

`window.__TKA_MOTION_RESAMPLE === false` disables the planner. It mirrors the
existing `__TKA_TRAIL_GPU` switch and exists for A/B proof in the browser.

### Trail overlays

Both overlays gain `motionSamples?: readonly MotionSubSample[]`. The capture
block becomes a loop: each sample runs the existing `capturePropTips` /
`capturePropTipsInto` for the base pair and each layer with the sample's prop
states, then the current frame runs as before. Every gate that applies to the
current frame applies to each sample: hand visibility and fade envelopes, prop
swap suppression, layer `trailCaptureSuppressed`, tip effect mask, flip
state. Hidden hands never sample.

Tail recession runs once per sub-sample and once for the current frame with
`dtMs / n` and that slice's own `moved` flag, so `visibleCount` grows by one
per appended point and the speed EMA sees the real per-point interval.

Canvas2D ring points take the sample's interpolated `timeMs`. The WebGL2 ring
stores a timestamp nothing reads; it records the same interpolated time for
consistency. Ring capacity and leading edge are unchanged because points per
second are unchanged.

### Fire

`PropTipData.path?: readonly { x: number; y: number }[]` carries the tip's
positions at the sub-frame instants, oldest first, strictly between
`prevX/prevY` and `x/y`. `FireTipTracker.update` takes the sample list and, for
each emitted base or layer tip, computes the path with the fallback position
math (`calculatePropCenter` plus `staffRotationAngle`). When the current tip
came from a rendered transform, each path point is offset by the difference
between the rendered tip and the fallback tip at the current step, so the path
stays continuous with the drawn position. `toFrameTips` offsets path points
like the endpoints. The tracker's 200 ms gap rule is unchanged; a frame that
long resets instead of sweeping.

`WebGLFireRenderer` builds the polyline `[prev, ...path, cur]`, takes its total
length for `splatCount` (same `ceil(dist / stepUV)`, same cap of 32) and
distributes the splats by arc length along the polyline. Fuel, temperature,
velocity and reaction injection per splat are divided by the same count, so
total energy per frame is unchanged. Velocity injection stays the chord
velocity. A tip without a path takes the existing two-point sweep.

### LED

`LedSampler.update` gains an output array parameter so the loop can hold one
LED set per sub-frame without aliasing the sampler's reused array.
`LedFrameInput.priorSamples?: readonly (readonly LedSample[])[]` carries the
sub-frame LED sets, oldest first. To bound instance count, the loop passes at
most 15 prior sets, picked evenly from the sub-samples.

`WebGLLedRenderer.buildSegments` runs one pass per set, then the final pass
for `input.leds`, each with `dt / passes` and the stored previous positions
updated between passes. The 100 ms streak rule (`MAX_STREAK_DT`) is evaluated
on the per-pass delta when prior sets exist, so a slow frame the sampler
bridged is a streak rather than a gap. Round caps keep their meaning: a start
cap only on the first pass when the whole frame path is isolated or follows a
discontinuity, an end cap only on the last pass when the whole frame path is
isolated, no caps at any join. Isolation is judged on the whole frame path
(first-pass start to final position), not per pass. The rigid-body sub-steps
inside each pass are unchanged.

## Edge cases

- **Seamless loop:** samples cross the boundary; the overlay rings are not
  reset, matching today's behavior for the single captured point.
- **Non-seamless loop:** rings reset first, then only post-wrap samples append.
  The fire tracker still resets on that frame.
- **Grid join slide:** `gridJoinSlide` already suppresses capture for the base
  pair; samples obey the same flag.
- **Prop hot-swap:** swap suppression skips captures for that hand; samples
  obey it. Tip geometry changes do not reach sub-samples because the same
  render key is used for all slices of one frame.
- **Hidden hand or hand fading out:** `hasLeft` and fade alpha gates apply per
  slice exactly as for the current frame.
- **Tab hidden then shown:** the first visible frame has a huge `dt`; `n`
  caps at 64 and the ring's teleport test still clears discontinuities. The
  fire tracker resets on gaps over 200 ms as before.
- **Sequence switch mid-frame:** the guard compares the orchestrator's pose
  with the live props and skips sampling when they disagree.
- **Export:** `renderSync` passes no samples; output is unchanged.
- **Reduced motion:** unaffected. Sub-sampling changes geometry, not motion
  timing or duration.

## Testing

Unit tests under `src/lib/shared/animation-engine/services/__tests__/` using
the project Vitest config:

- `motion-sub-sampler.test.ts`: cadence table (16.7 ms gives 0 samples, 25 ms
  gives 1, 100 ms gives 5, 2 s gives 63), even spacing, seamless wrap through
  `totalBeats + 1` back to 1, non-seamless loop from 0, zero samples when
  paused, backward or static, clamp below the end pose, guard accepts equal
  poses and rejects a shifted one.
- Overlay tests (both overlays through the existing jsdom harness): one slow
  frame with a quarter-turn arc and five samples yields six ring points on
  the arc radius, versus two without samples; tail `visibleCount` grows per
  appended point; samples obey swap suppression and hidden hands.
- Render loop test (fake overlay, fake sample source): samples are passed
  only while playing, skipped on guard mismatch, absent on `renderSync`.
- Fire tracker test: path length equals the sample count, path points are
  continuous with the rendered tip when a rendered transform is present.
- Fire sweep test: a pure `sweepPolyline(points, stepUV, cap)` helper spreads
  splats by arc length and matches the two-point result for a bare chord.
- LED: sampler writes to the supplied array; the loop's even pick of at most
  15 prior sets. The GL pass is verified in the browser.

Browser proof in the in-app browser against a worktree preview, then the
integrated route on 5173: patch `requestAnimationFrame` to fire every 100 ms
on a playing sequence with trails, fire and LED enabled, screenshot with
`__TKA_MOTION_RESAMPLE` on and off. On: round trails and curved fire and LED
streaks. Off: polygons and straight streaks. Also confirm an unthrottled frame
is unchanged (sample count stays 0 in diagnostics).

## Phasing

1. Planner, sample source, guard, render loop plumbing, both overlays, tunnel
   layer sampler. Shippable alone.
2. Fire path.
3. LED prior sets.

Each phase is its own scoped commit on `codex/trail-resampling`.

## Risks

- A mismatch between the orchestrator's pose and the host's pose that passes
  the tolerance would place a sub-sample slightly off the path. Tolerance is
  tight (1e-3) and the live viewer's controller and the engine's orchestrator
  run the same interpolation code on the same sequence data.
- More ring points per slow frame means more Catmull-Rom segments per frame on
  an already slow machine. The work is bounded (64 points per hand per frame)
  and far cheaper than the frame that caused it.
- LED instance count grows with prior sets; capped at 15 sets and by the
  renderer's existing `MAX_SEGMENT_CAPACITY`.
