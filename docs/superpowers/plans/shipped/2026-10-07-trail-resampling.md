# Trail Resampling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While playback runs, a slow rendered frame feeds the trail overlays, the fire tracker and the LED renderer as many on-path points as a 60 Hz frame sequence would have, so trails stay round and fire and LED streaks stay curved when the machine is bogged down.

**Architecture:** A new pure module `motion-sub-sampler.ts` turns the wall-clock frame delta into evenly spaced intermediate sequence steps, samples each through the engine's own `SequenceAnimationOrchestrator.samplePropStateAt` (the exporter's pure sampler), guards the result against the live prop pose, and pools the samples as `MotionSubSample[]`. `AnimationRenderLoop.render` plans the samples once per live frame and hands the same list to the trail overlays (`motionSamples`), the fire tracker (which writes `PropTipData.path`) and the LED sampler (which produces `LedFrameInput.priorSamples`). The export driver (`renderSync`) never plans samples, so exports are unchanged.

**Tech Stack:** TypeScript, Svelte 5 (two prop pass-throughs), Vitest with the project jsdom config.

**Spec:** `docs/superpowers/specs/shipped/2026-10-07-trail-resampling-design.md`

**Worktree:** `E:/worktrees/tka-platform/trail-resampling`, branch `codex/trail-resampling`. `node_modules` is a junction into `E:/tka-platform/node_modules`: never run `pnpm install` or `npm install` here, never delete `node_modules`.

**House rules:** no em dashes, no emojis, ASCII quotes in prose. Commit only the paths named in the task with an explicit pathspec: `git commit -m "..." -- <paths>`. No `git add -A`, `.` or `-u`. End every commit message with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never touch port 5173.

**Commands (run from the worktree root):**
- One test file: `pnpm exec vitest --config tests/config/vitest.config.ts run <file>`
- Scoped type check: write `tsconfig.trail-resampling.json` next to `tsconfig.json` extending it with `"include": ["src/lib/shared/animation-engine/**/*.ts", "src/lib/shared/sequence-viewer/tunnel/*.ts", ".svelte-kit/ambient.d.ts", ".svelte-kit/types/**/*"]` and run `pnpm exec tsc -p tsconfig.trail-resampling.json --noEmit`. Delete the scratch tsconfig before the final commit. `check:fast` reports pre-existing false errors; only errors in files this branch touches count.
- Spec queue check: `npm run specs:check`

---

## File structure

| Path | Responsibility | Change |
| --- | --- | --- |
| `src/lib/shared/animation-engine/services/motion-sub-sampler.ts` | Cadence, planner, pose guard, even pick, orchestrator sample source, pooled sampler | create |
| `src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts` | Unit tests for the module above | create |
| `src/lib/shared/animation-engine/services/IAnimationRenderLoop.ts` | `RenderFrameParams.motionSampleSource`, `additionalLayersAt` | modify |
| `src/lib/shared/animation-engine/services/animation-engine.svelte.ts` | `AnimationEngineProps.additionalLayersAt` | modify |
| `src/lib/shared/animation-engine/services/frame-parameter-builder.ts` | copies `additionalLayersAt` onto the frame | modify |
| `src/lib/shared/animation-engine/services/managers/frame-system.ts` | owns `OrchestratorMotionSampleSource`, sets `params.motionSampleSource` | modify |
| `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte`, `CanvasSurface.svelte` | pass `additionalLayersAt` through | modify |
| `src/lib/shared/sequence-viewer/components/ViewerMotionSurface.svelte` | passes the tunnel controller's sampler | modify |
| `src/lib/shared/animation-engine/services/animation-render-loop.ts` | plans samples per live frame, passes them on, diagnostics | modify |
| `src/lib/shared/animation-engine/services/__tests__/render-loop-motion-resample.test.ts` | render loop gating test | create |
| `src/lib/shared/animation-engine/services/ITrailOverlayCanvas.ts` | `TrailOverlayRenderParams.motionSamples` | modify |
| `src/lib/shared/animation-engine/services/trail-overlay-web-gl2.ts` | capture loop over samples, per-slice tails, ring timestamps | modify |
| `src/lib/shared/animation-engine/services/trail-overlay-canvas.ts` | capture loop over samples, ring timestamps | modify |
| `src/lib/shared/animation-engine/services/__tests__/trail-overlay-web-gl2-motion-samples.test.ts` | overlay sample test | create |
| `src/lib/shared/animation-engine/services/__tests__/trail-overlay-canvas-motion-samples.test.ts` | overlay sample test | create |
| `src/lib/shared/animation-engine/domain/types/fire-types.ts` | `PropTipData.path` | modify |
| `src/lib/shared/animation-engine/services/fire-tip-tracker.ts` | computes `path` from samples | modify |
| `src/lib/shared/animation-engine/services/__tests__/fire-tip-tracker-path.test.ts` | tracker path test | create |
| `src/lib/shared/animation-engine/services/fire/fire-sweep.ts` | pure `sweepPolyline` | create |
| `src/lib/shared/animation-engine/services/fire/__tests__/fire-sweep.test.ts` | sweep test | create |
| `src/lib/shared/animation-engine/services/fire/web-gl-fire-renderer.ts` | sweeps the polyline | modify |
| `src/lib/shared/animation-engine/domain/types/led-types.ts` | `LedFrameInput.priorSamples` | modify |
| `src/lib/shared/animation-engine/services/led-sampler.ts` | `update(..., out)` | modify |
| `src/lib/shared/animation-engine/services/__tests__/led-sampler-output-target.test.ts` | sampler out param test | create |
| `src/lib/shared/animation-engine/services/led/web-gl-led-renderer.ts` | one `buildSegments` pass per prior set | modify |

---

### Task 1: Motion sub-sampler module

**Files:**
- Create: `src/lib/shared/animation-engine/services/motion-sub-sampler.ts`
- Test: `src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from "vitest";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import {
  MotionSubSampler,
  motionSubStepCount,
  pickEvenIndices,
  planMotionSubSteps,
  propPosesMatch,
  type MotionSampleSource,
} from "../motion-sub-sampler";

const TOTAL_BEATS = 4;

/** A source whose pose is a function of the step, so tests can check where a
 *  sample landed. */
function circleSource(totalBeats = TOTAL_BEATS): MotionSampleSource {
  return {
    totalBeats,
    sampleAt(step, outLeft, outRight) {
      outLeft.centerPathAngle = step;
      outLeft.staffRotationAngle = step * 2;
      outLeft.x = undefined;
      outLeft.y = undefined;
      outRight.centerPathAngle = -step;
      outRight.staffRotationAngle = -step * 2;
      outRight.x = undefined;
      outRight.y = undefined;
      return true;
    },
  };
}

function poseAt(step: number): { left: PropState; right: PropState } {
  return {
    left: { centerPathAngle: step, staffRotationAngle: step * 2 },
    right: { centerPathAngle: -step, staffRotationAngle: -step * 2 },
  };
}

describe("motionSubStepCount", () => {
  it("follows the 60 Hz cadence table", () => {
    expect(motionSubStepCount(1 / 60)).toBe(1);
    expect(motionSubStepCount(0.025)).toBe(2);
    expect(motionSubStepCount(0.1)).toBe(6);
    expect(motionSubStepCount(2)).toBe(64);
    expect(motionSubStepCount(0)).toBe(1);
    expect(motionSubStepCount(Number.NaN)).toBe(1);
  });
});

describe("planMotionSubSteps", () => {
  const out: number[] = [];

  it("spaces forward motion evenly, excluding both ends", () => {
    const n = planMotionSubSteps(1, 2, 5, TOTAL_BEATS, false, false, out);
    expect(n).toBe(4);
    expect(out.slice(0, n)).toEqual([1.2, 1.4, 1.6, 1.8]);
  });

  it("returns zero when n is 1, paused or static", () => {
    expect(planMotionSubSteps(1, 2, 1, TOTAL_BEATS, false, false, out)).toBe(0);
    expect(planMotionSubSteps(2, 2, 5, TOTAL_BEATS, false, false, out)).toBe(0);
  });

  it("returns zero for a backward scrub that is not a loop", () => {
    expect(planMotionSubSteps(2, 1.8, 5, TOTAL_BEATS, false, false, out)).toBe(0);
  });

  it("wraps a seamless loop through the end and back to one", () => {
    // 4.8 -> 5 (end) -> 1 -> 1.2 is a path of length 0.4; four samples at 0.08.
    const n = planMotionSubSteps(4.8, 1.2, 5, TOTAL_BEATS, true, true, out);
    expect(n).toBe(4);
    const steps = out.slice(0, n);
    expect(steps[0]).toBeCloseTo(4.88, 6);
    expect(steps[1]).toBeCloseTo(4.96, 6);
    expect(steps[2]).toBeCloseTo(1.04, 6);
    expect(steps[3]).toBeCloseTo(1.12, 6);
    for (const s of steps) expect(s).toBeLessThan(TOTAL_BEATS + 1);
  });

  it("clamps pre-wrap steps below the end pose", () => {
    // 4.99 -> 5 -> 1 -> 1.03: the first sample lands past 4.999 and is clamped.
    const n = planMotionSubSteps(4.99, 1.03, 3, TOTAL_BEATS, true, true, out);
    expect(n).toBe(2);
    for (const s of out.slice(0, n)) expect(s).toBeLessThan(TOTAL_BEATS + 1);
  });

  it("samples only after the wrap for a non-seamless loop", () => {
    const n = planMotionSubSteps(4.8, 1, 5, TOTAL_BEATS, false, true, out);
    expect(n).toBe(4);
    expect(out.slice(0, n)).toEqual([0.2, 0.4, 0.6, 0.8]);
  });
});

describe("propPosesMatch", () => {
  it("accepts equal poses and an angle offset by a full turn", () => {
    const a: PropState = { centerPathAngle: 1, staffRotationAngle: 0.5 };
    const b: PropState = {
      centerPathAngle: 1,
      staffRotationAngle: 0.5 + Math.PI * 2,
    };
    expect(propPosesMatch(a, b)).toBe(true);
  });

  it("compares Cartesian centers when one side carries x and y", () => {
    const polar: PropState = { centerPathAngle: 0, staffRotationAngle: 0 };
    const cartesian: PropState = {
      centerPathAngle: 0,
      staffRotationAngle: 0,
      x: 1,
      y: 0,
    };
    expect(propPosesMatch(polar, cartesian)).toBe(true);
    expect(
      propPosesMatch(polar, { ...cartesian, x: 1.5 })
    ).toBe(false);
  });

  it("rejects a shifted pose", () => {
    expect(
      propPosesMatch(
        { centerPathAngle: 1, staffRotationAngle: 0 },
        { centerPathAngle: 1.01, staffRotationAngle: 0 }
      )
    ).toBe(false);
  });
});

describe("pickEvenIndices", () => {
  const out: number[] = [];

  it("keeps everything when under the cap", () => {
    expect(pickEvenIndices(3, 15, out)).toBe(3);
    expect(out.slice(0, 3)).toEqual([0, 1, 2]);
  });

  it("picks evenly, ending on the newest, when over the cap", () => {
    const n = pickEvenIndices(63, 15, out);
    expect(n).toBe(15);
    const picked = out.slice(0, n);
    expect(picked[0]).toBe(0);
    expect(picked[n - 1]).toBe(62);
    for (let i = 1; i < n; i++) expect(picked[i]).toBeGreaterThan(picked[i - 1]!);
  });

  it("returns zero for an empty list", () => {
    expect(pickEvenIndices(0, 15, out)).toBe(0);
  });
});

describe("MotionSubSampler", () => {
  it("inserts samples between the previous and current step", () => {
    const sampler = new MotionSubSampler();
    const samples = sampler.plan({
      source: circleSource(),
      previousStep: 1,
      currentStep: 2,
      dtSeconds: 0.1,
      isSeamlesslyLoopable: false,
      loopDetected: false,
      liveLeft: poseAt(2).left,
      liveRight: poseAt(2).right,
      layerCount: 0,
      layersAt: null,
      liveLayers: null,
      previousTimeMs: 1000,
      currentTimeMs: 1100,
    });
    expect(samples.length).toBe(5);
    expect(samples[0]!.left.centerPathAngle).toBeCloseTo(1 + 1 / 6, 6);
    expect(samples[4]!.left.centerPathAngle).toBeCloseTo(1 + 5 / 6, 6);
    expect(samples[0]!.timeMs).toBeCloseTo(1000 + 100 / 6, 6);
    expect(samples[4]!.right.centerPathAngle).toBeCloseTo(-(1 + 5 / 6), 6);
    expect(sampler.stats.samplesInserted).toBe(5);
  });

  it("returns no samples when the live pose disagrees with the source", () => {
    const sampler = new MotionSubSampler();
    const samples = sampler.plan({
      source: circleSource(),
      previousStep: 1,
      currentStep: 2,
      dtSeconds: 0.1,
      isSeamlesslyLoopable: false,
      loopDetected: false,
      liveLeft: { centerPathAngle: 2.5, staffRotationAngle: 4 },
      liveRight: poseAt(2).right,
      layerCount: 0,
      layersAt: null,
      liveLayers: null,
      previousTimeMs: 0,
      currentTimeMs: 100,
    });
    expect(samples.length).toBe(0);
    expect(sampler.stats.guardRejections).toBe(1);
  });

  it("nulls a mismatching layer while the base pair keeps sampling", () => {
    const sampler = new MotionSubSampler();
    const samples = sampler.plan({
      source: circleSource(),
      previousStep: 1,
      currentStep: 2,
      dtSeconds: 0.05,
      isSeamlesslyLoopable: false,
      loopDetected: false,
      liveLeft: poseAt(2).left,
      liveRight: poseAt(2).right,
      layerCount: 2,
      layersAt: (step) => [
        { leftProp: poseAt(step + 1).left, rightProp: poseAt(step + 1).right },
        { leftProp: poseAt(step + 2).left, rightProp: poseAt(step + 2).right },
      ],
      liveLayers: [
        { leftProp: poseAt(3).left, rightProp: poseAt(3).right },
        { leftProp: poseAt(9).left, rightProp: null },
      ],
      previousTimeMs: 0,
      currentTimeMs: 50,
    });
    expect(samples.length).toBe(2);
    expect(samples[0]!.layers.length).toBe(2);
    expect(samples[0]!.layers[0]!.left?.centerPathAngle).toBeCloseTo(
      1 + 1 / 3 + 1,
      6
    );
    expect(samples[0]!.layers[1]!.left).toBeNull();
    expect(samples[0]!.layers[1]!.right).toBeNull();
    expect(sampler.stats.layerGuardRejections).toBe(1);
  });

  it("returns no samples while paused or at a healthy frame rate", () => {
    const sampler = new MotionSubSampler();
    const base = {
      source: circleSource(),
      previousStep: 1,
      currentStep: 2,
      isSeamlesslyLoopable: false,
      loopDetected: false,
      liveLeft: poseAt(2).left,
      liveRight: poseAt(2).right,
      layerCount: 0,
      layersAt: null,
      liveLayers: null,
      previousTimeMs: 0,
      currentTimeMs: 16,
    };
    expect(sampler.plan({ ...base, dtSeconds: 1 / 60 }).length).toBe(0);
    expect(
      sampler.plan({ ...base, dtSeconds: 0.1, currentStep: 1 }).length
    ).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test file and confirm it fails because the module does not exist**

Run: `pnpm exec vitest --config tests/config/vitest.config.ts run src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts`
Expected: FAIL, "Failed to resolve import ../motion-sub-sampler".

- [ ] **Step 3: Write the module**

```ts
/**
 * Motion sub-sampler
 *
 * Live 2D trails, fire and LED capture one tip position per rendered frame.
 * When the machine is busy the frames spread out and the captured points turn
 * the arc into a polygon. The sequence motion itself is known exactly, so a
 * slow frame can be filled in with the poses the props passed through.
 *
 * This module is pure apart from the pooled sample arrays: it turns a frame's
 * wall-clock delta into a count of 60 Hz slices, plans the intermediate
 * sequence steps (including loop wraps), samples them through a
 * `MotionSampleSource` (the engine's orchestrator) and guards the result
 * against the live pose the host handed the engine.
 */

import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import type { SequenceAnimationOrchestrator } from "./sequence-animation-orchestrator";
import type { AdditionalLayerProps } from "./ITrailCapturer";
import type { HandOffsets } from "./grid-join-tween";
import { shiftPropState } from "./animation-grid-join";

/** Target points per second. Tail length, recession and the leading edge are
 *  authored in "points at 60 Hz", so the cadence keeps that rate. */
export const MOTION_SAMPLE_HZ = 60;
/** One-second stall. Longer gaps are teleports to the ring buffers anyway. */
export const MAX_MOTION_SUB_STEPS = 64;
/** Pose agreement needed before a sub-sample is trusted (radians and
 *  hand-point radii). */
export const MOTION_POSE_TOLERANCE = 1e-3;

/** Pure pose source for a step. Returns false when it has no pose. */
export interface MotionSampleSource {
  readonly totalBeats: number;
  sampleAt(step: number, outLeft: PropState, outRight: PropState): boolean;
}

export interface MotionSubSampleLayer {
  left: PropState | null;
  right: PropState | null;
}

/** One intermediate pose between the previous frame and the current one. */
export interface MotionSubSample {
  readonly left: PropState;
  readonly right: PropState;
  /** Tunnel copies at this instant, index-aligned with the frame's layers.
   *  A layer whose live pose did not match the sampler is null on both hands. */
  readonly layers: MotionSubSampleLayer[];
  /** Interpolated frame clock, ms, strictly between the previous frame and now. */
  timeMs: number;
}

/** How many 60 Hz slices this frame spans: 1 at a healthy rate, up to 64. */
export function motionSubStepCount(dtSeconds: number): number {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return 1;
  return Math.max(
    1,
    Math.min(MAX_MOTION_SUB_STEPS, Math.round(dtSeconds * MOTION_SAMPLE_HZ))
  );
}

/**
 * Writes the `n - 1` intermediate steps between `prevStep` and `currentStep`
 * into `out`, oldest first, excluding both ends. Returns the count.
 *
 * - Forward motion: evenly spaced.
 * - Seamless loop: the path runs to `totalBeats + 1` (the end pose) and
 *   continues from 1. Steps past the end wrap by subtracting `totalBeats`;
 *   pre-wrap steps stay below `totalBeats + 1` because the sampler returns its
 *   fallback pose exactly at the end.
 * - Non-seamless loop: the props teleport and the overlays reset their rings,
 *   so only the path from 0 to `currentStep` is sampled.
 * - Paused, backward (not a loop) or static: zero.
 */
export function planMotionSubSteps(
  prevStep: number,
  currentStep: number,
  n: number,
  totalBeats: number,
  isSeamlesslyLoopable: boolean,
  loopDetected: boolean,
  out: number[]
): number {
  if (n <= 1 || totalBeats <= 0) return 0;
  const count = n - 1;
  if (loopDetected) {
    if (isSeamlesslyLoopable) {
      const end = totalBeats + 1;
      const endClamp = end - 1e-3;
      const before = Math.max(0, end - prevStep);
      const after = Math.max(0, currentStep - 1);
      const length = before + after;
      if (length <= 0) return 0;
      for (let i = 1; i <= count; i++) {
        const d = (length * i) / n;
        out[i - 1] =
          d < before ? Math.min(prevStep + d, endClamp) : 1 + (d - before);
      }
      return count;
    }
    if (currentStep <= 0) return 0;
    for (let i = 1; i <= count; i++) {
      out[i - 1] = (currentStep * i) / n;
    }
    return count;
  }
  if (currentStep <= prevStep) return 0;
  const span = currentStep - prevStep;
  for (let i = 1; i <= count; i++) {
    out[i - 1] = prevStep + (span * i) / n;
  }
  return count;
}

const TWO_PI = Math.PI * 2;

function wrapAngle(a: number): number {
  let r = a % TWO_PI;
  if (r < 0) r += TWO_PI;
  return r;
}

function angleDistance(a: number, b: number): number {
  const d = Math.abs(wrapAngle(a) - wrapAngle(b));
  return Math.min(d, TWO_PI - d);
}

/** True when two prop states place the prop at the same center (Cartesian,
 *  with the polar fallback) and the same staff angle, within `tol`. */
export function propPosesMatch(
  a: PropState,
  b: PropState,
  tol = MOTION_POSE_TOLERANCE
): boolean {
  const ax = a.x ?? Math.cos(a.centerPathAngle);
  const ay = a.y ?? Math.sin(a.centerPathAngle);
  const bx = b.x ?? Math.cos(b.centerPathAngle);
  const by = b.y ?? Math.sin(b.centerPathAngle);
  if (Math.abs(ax - bx) > tol || Math.abs(ay - by) > tol) return false;
  return angleDistance(a.staffRotationAngle, b.staffRotationAngle) <= tol;
}

/** Writes up to `max` indices into `out`, spread evenly over `total` items
 *  and always ending on the newest. Returns the count. */
export function pickEvenIndices(
  total: number,
  max: number,
  out: number[]
): number {
  if (total <= 0 || max <= 0) return 0;
  if (total <= max) {
    for (let i = 0; i < total; i++) out[i] = i;
    return total;
  }
  for (let i = 0; i < max; i++) {
    out[i] = Math.round(((i + 1) * total) / max) - 1;
  }
  return max;
}

/**
 * Adapts the engine's orchestrator to `MotionSampleSource`. Applies this
 * frame's grid-join offsets through the same `shiftPropState` the frame
 * system uses, so joined grids place sub-samples where the live props are.
 */
export class OrchestratorMotionSampleSource implements MotionSampleSource {
  private offsets: HandOffsets | null = null;

  constructor(
    private readonly getOrchestrator: () => SequenceAnimationOrchestrator | null
  ) {}

  get totalBeats(): number {
    return this.getOrchestrator()?.getTotalBeats() ?? 0;
  }

  /** The shift each hand gets this frame, or null for one centered grid. */
  setGridJoinOffsets(offsets: HandOffsets | null): void {
    this.offsets = offsets;
  }

  isReady(): boolean {
    const o = this.getOrchestrator();
    return !!o && o.isInitialized() && o.getTotalBeats() > 0;
  }

  sampleAt(step: number, outLeft: PropState, outRight: PropState): boolean {
    const o = this.getOrchestrator();
    if (!o || !o.isInitialized()) return false;
    const pose = o.samplePropStateAt(step);
    if (this.offsets) {
      shiftPropState(pose.left, this.offsets.left, outLeft);
      shiftPropState(pose.right, this.offsets.right, outRight);
    } else {
      copyPose(pose.left, outLeft);
      copyPose(pose.right, outRight);
    }
    return true;
  }
}

function copyPose(from: PropState, to: PropState): void {
  to.centerPathAngle = from.centerPathAngle;
  to.staffRotationAngle = from.staffRotationAngle;
  to.x = from.x;
  to.y = from.y;
}

function newPose(): PropState {
  return { centerPathAngle: 0, staffRotationAngle: 0 };
}

export interface MotionPlanInput {
  source: MotionSampleSource;
  previousStep: number;
  currentStep: number;
  dtSeconds: number;
  isSeamlesslyLoopable: boolean;
  loopDetected: boolean;
  /** The frame's live base props, after any grid-join shift. */
  liveLeft: PropState | null;
  liveRight: PropState | null;
  layerCount: number;
  /** Tunnel copies at a step, index-aligned with `liveLayers`. */
  layersAt: ((step: number) => readonly AdditionalLayerProps[]) | null;
  liveLayers: readonly AdditionalLayerProps[] | null;
  previousTimeMs: number;
  currentTimeMs: number;
}

export interface MotionSubSamplerStats {
  framesSampled: number;
  samplesInserted: number;
  guardRejections: number;
  layerGuardRejections: number;
}

/**
 * Plans and fills the pooled sample list for one frame. The returned array is
 * reused on the next call; consumers read it synchronously.
 */
export class MotionSubSampler {
  readonly stats: MotionSubSamplerStats = {
    framesSampled: 0,
    samplesInserted: 0,
    guardRejections: 0,
    layerGuardRejections: 0,
  };
  private readonly steps: number[] = [];
  private readonly pool: MotionSubSample[] = [];
  private readonly view: MotionSubSample[] = [];
  private readonly guardLeft = newPose();
  private readonly guardRight = newPose();

  /** Fills and returns the samples for this frame; empty when none apply. */
  plan(input: MotionPlanInput): readonly MotionSubSample[] {
    this.view.length = 0;
    const n = motionSubStepCount(input.dtSeconds);
    const count = planMotionSubSteps(
      input.previousStep,
      input.currentStep,
      n,
      input.source.totalBeats,
      input.isSeamlesslyLoopable,
      input.loopDetected,
      this.steps
    );
    if (count === 0) return this.view;

    // The host's pose must be the sampler's pose at this step, or the
    // sub-samples would sit on a different path than the drawn props.
    if (!input.source.sampleAt(input.currentStep, this.guardLeft, this.guardRight)) {
      return this.view;
    }
    if (
      (input.liveLeft && !propPosesMatch(this.guardLeft, input.liveLeft)) ||
      (input.liveRight && !propPosesMatch(this.guardRight, input.liveRight))
    ) {
      this.stats.guardRejections++;
      return this.view;
    }

    // Same check per tunnel copy; a copy that is mid formation travel is
    // skipped on its own while the base pair keeps its samples.
    const layerCount = input.layersAt && input.liveLayers ? input.layerCount : 0;
    let layerOk: boolean[] | null = null;
    if (layerCount > 0) {
      const liveAt = input.layersAt!(input.currentStep);
      layerOk = [];
      for (let li = 0; li < layerCount; li++) {
        const sampled = liveAt[li];
        const live = input.liveLayers![li];
        const ok =
          !!sampled &&
          !!live &&
          (!live.leftProp ||
            (!!sampled.leftProp &&
              propPosesMatch(sampled.leftProp, live.leftProp))) &&
          (!live.rightProp ||
            (!!sampled.rightProp &&
              propPosesMatch(sampled.rightProp, live.rightProp)));
        if (!ok) this.stats.layerGuardRejections++;
        layerOk.push(ok);
      }
    }

    const span = input.currentTimeMs - input.previousTimeMs;
    for (let i = 0; i < count; i++) {
      const step = this.steps[i]!;
      const sample = this.slot(i, layerCount);
      if (!input.source.sampleAt(step, sample.left, sample.right)) break;
      sample.timeMs = input.previousTimeMs + (span * (i + 1)) / n;
      if (layerCount > 0) {
        const at = input.layersAt!(step);
        for (let li = 0; li < layerCount; li++) {
          const layer = sample.layers[li]!;
          const src = layerOk![li] ? at[li] : undefined;
          layer.left = src?.leftProp ?? null;
          layer.right = src?.rightProp ?? null;
        }
      }
      this.view.push(sample);
    }
    if (this.view.length > 0) {
      this.stats.framesSampled++;
      this.stats.samplesInserted += this.view.length;
    }
    return this.view;
  }

  private slot(index: number, layerCount: number): MotionSubSample {
    let sample = this.pool[index];
    if (!sample) {
      sample = { left: newPose(), right: newPose(), layers: [], timeMs: 0 };
      this.pool[index] = sample;
    }
    while (sample.layers.length < layerCount) {
      sample.layers.push({ left: null, right: null });
    }
    sample.layers.length = layerCount;
    return sample;
  }
}
```

- [ ] **Step 4: Run the test file and confirm it passes**

Run: `pnpm exec vitest --config tests/config/vitest.config.ts run src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts`
Expected: PASS, every test green.

### Task 2: Sample source and layer sampler on the frame

**Files:**
- Modify: `src/lib/shared/animation-engine/services/IAnimationRenderLoop.ts` (imports near line 15, `RenderFrameParams` near line 224)
- Modify: `src/lib/shared/animation-engine/services/animation-engine.svelte.ts` (`AnimationEngineProps` near line 84)
- Modify: `src/lib/shared/animation-engine/services/frame-parameter-builder.ts` (near line 279)
- Modify: `src/lib/shared/animation-engine/services/managers/frame-system.ts`
- Modify: `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte` (lines 90, 175, 873)
- Modify: `src/lib/shared/animation-engine/components/CanvasSurface.svelte` (lines 87, 158, 508)
- Modify: `src/lib/shared/sequence-viewer/components/ViewerMotionSurface.svelte` (line 700)

- [ ] **Step 1: Frame params.** In `IAnimationRenderLoop.ts` add after the `HandOffsets` import:

```ts
import type { MotionSampleSource } from "./motion-sub-sampler";
```

and after `gridJoinSlide?: GridJoinTweenSample | null;`:

```ts
  /**
   * Pure pose source for the sequence being played, with this frame's grid
   * join applied. The render loop fills slow frames with poses sampled from
   * it. Absent when the engine's orchestrator has no sequence.
   */
  motionSampleSource?: MotionSampleSource;
  /**
   * The host's tunnel copies at an arbitrary step, index-aligned with
   * `props.additionalLayers`. Lets slow frames sample the copies too.
   */
  additionalLayersAt?: (step: number) => AdditionalLayerProps[];
```

- [ ] **Step 2: Engine props.** In `animation-engine.svelte.ts` after `preloadAdditionalLayers?: AdditionalLayerProps[];` add:

```ts
  /** The same copies at any step, for frame-rate-independent trail sampling. */
  additionalLayersAt?: (step: number) => AdditionalLayerProps[];
```

- [ ] **Step 3: Builder.** In `frame-parameter-builder.ts` after `fp.props.additionalLayers = props.additionalLayers ?? [];` add:

```ts
    fp.additionalLayersAt = props.additionalLayersAt;
```

- [ ] **Step 4: Frame system.** In `frame-system.ts` import `OrchestratorMotionSampleSource` from `"../motion-sub-sampler"`, add the field

```ts
  /** Pure pose source for slow-frame trail sampling; reads the lifecycle
   *  orchestrator lazily so a sequence switch needs no re-wiring. */
  private readonly motionSampleSource = new OrchestratorMotionSampleSource(
    () => this.deps.lifecycleManager.orchestrator
  );
```

and at the end of `buildFrameParams`, after `this.applyGridJoin(...)` and before `return params;`:

```ts
    if (this.motionSampleSource.isReady()) {
      this.motionSampleSource.setGridJoinOffsets(
        params.gridJoin || params.gridJoinSlide
          ? (params.gridJoinOffsets ?? null)
          : null
      );
      params.motionSampleSource = this.motionSampleSource;
    } else {
      params.motionSampleSource = undefined;
    }
```

- [ ] **Step 5: Component plumbing.** `AnimatorCanvas.svelte`: destructure `additionalLayersAt = undefined,` after `preloadAdditionalLayers = [],`; type `additionalLayersAt?: (step: number) => AdditionalLayerProps[];` after the `preloadAdditionalLayers` type; pass `{additionalLayersAt}` to `<CanvasSurface>` after `{preloadAdditionalLayers}`. `CanvasSurface.svelte`: same destructure and type; add `additionalLayersAt,` to the `props` object after `preloadAdditionalLayers,`. `ViewerMotionSurface.svelte`: after `preloadAdditionalLayers={preparedTunnelLayers}` add

```svelte
          additionalLayersAt={inStudio
            ? undefined
            : (step) => tunnelController.preparedAdditionalLayersAt(step)}
```

- [ ] **Step 6: Scoped type check.** Write the scratch tsconfig and run `pnpm exec tsc -p tsconfig.trail-resampling.json --noEmit`. Only errors in touched files count; fix them.

### Task 3: Render loop planning, overlay parameter and diagnostics

**Files:**
- Modify: `src/lib/shared/animation-engine/services/ITrailOverlayCanvas.ts`
- Modify: `src/lib/shared/animation-engine/services/animation-render-loop.ts` (imports line 74, fields near line 258, `getDiagnostics` line 608, `render` lines 1425 to 1510 and 1693)
- Test: `src/lib/shared/animation-engine/services/__tests__/render-loop-motion-resample.test.ts`

- [ ] **Step 1: Overlay params.** In `ITrailOverlayCanvas.ts` import `type { MotionSubSample } from "./motion-sub-sampler"` and add to `TrailOverlayRenderParams` after `rightPropSwapSuppressed?: boolean;`:

```ts
  /**
   * Poses the props passed through since the previous frame, oldest first.
   * Each one is captured before the current frame with the same gates.
   * Absent or empty at a healthy frame rate and during export.
   */
  motionSamples?: readonly MotionSubSample[];
```

- [ ] **Step 2: Write the failing render loop test**

```ts
import { describe, expect, it, vi } from "vitest";
import { AnimationRenderLoop } from "../animation-render-loop";
import type {
  RenderFrameParams,
  RenderLoopConfig,
} from "../IAnimationRenderLoop";
import type { IAnimationRenderer } from "../IAnimationRenderer";
import type {
  ITrailOverlayCanvas,
  TrailOverlayRenderParams,
} from "../ITrailOverlayCanvas";
import type { MotionSampleSource } from "../motion-sub-sampler";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import { DEFAULT_TRAIL_SETTINGS } from "../../domain/types/trail-types";

function pose(step: number): { left: PropState; right: PropState } {
  return {
    left: { centerPathAngle: step, staffRotationAngle: 0 },
    right: { centerPathAngle: -step, staffRotationAngle: 0 },
  };
}

function source(): MotionSampleSource {
  return {
    totalBeats: 4,
    sampleAt(step, l, r) {
      const p = pose(step);
      l.centerPathAngle = p.left.centerPathAngle;
      l.staffRotationAngle = 0;
      r.centerPathAngle = p.right.centerPathAngle;
      r.staffRotationAngle = 0;
      return true;
    },
  };
}

class FakeTrailOverlay implements ITrailOverlayCanvas {
  readonly frames: TrailOverlayRenderParams[] = [];
  initialize(): void {}
  resize(): void {}
  renderFrame(params: TrailOverlayRenderParams): void {
    this.frames.push({ ...params });
  }
  clear(): void {}
  clearSourceTrails(): void {}
  setVisible(): void {}
  refreshStyle(): void {}
  dispose(): void {}
}

function params(step: number, overrides: Partial<RenderFrameParams> = {}) {
  const p = pose(step);
  return {
    stepData: null,
    currentStep: step,
    trailSettings: { ...DEFAULT_TRAIL_SETTINGS },
    gridVisible: false,
    gridMode: null,
    letter: null,
    props: {
      leftProp: p.left,
      rightProp: p.right,
      additionalLayers: [],
      leftPropDimensions: { width: 252.8, height: 77.8 },
      rightPropDimensions: { width: 252.8, height: 77.8 },
      tunnelSpectrum: false,
    },
    visibility: {
      gridVisible: false,
      propsVisible: true,
      trailsVisible: true,
      leftMotionVisible: true,
      rightMotionVisible: true,
    },
    isPlaying: true,
    leftPropType: "staff",
    rightPropType: "staff",
    tipEffectMap: { "*": { effect: "trails" } },
    motionSampleSource: source(),
    ...overrides,
  } as RenderFrameParams;
}

function createLoop(trails: FakeTrailOverlay) {
  const renderer = {
    renderScene: vi.fn(),
    isLeftPropCrossfadeInProgress: () => false,
    isRightPropCrossfadeInProgress: () => false,
  } as unknown as IAnimationRenderer;
  const loop = new AnimationRenderLoop();
  loop.initialize({
    renderer,
    TrailCapturer: null,
    pathCache: null,
    canvasSize: 500,
    renderers: { trails } as never,
  } satisfies RenderLoopConfig);
  return loop as unknown as {
    render(p: RenderFrameParams, t: number, dt?: number): void;
    renderSync(p: RenderFrameParams, t: number, dt: number): void;
    getDiagnostics(): Record<string, unknown>;
  };
}

describe("AnimationRenderLoop motion resampling", () => {
  it("passes sub-samples to the trail overlay on a slow live frame", () => {
    const trails = new FakeTrailOverlay();
    const loop = createLoop(trails);
    loop.render(params(1), 1000);
    loop.render(params(1.1), 1016);
    loop.render(params(1.7), 1116);
    const last = trails.frames.at(-1)!;
    expect(last.motionSamples?.length).toBe(5);
    expect(last.motionSamples![0]!.left.centerPathAngle).toBeCloseTo(1.2, 6);
    expect(last.motionSamples![0]!.timeMs).toBeCloseTo(1016 + 100 / 6, 6);
    const healthy = trails.frames.at(-2)!;
    expect(healthy.motionSamples?.length ?? 0).toBe(0);
    const diag = loop.getDiagnostics().motionResample as {
      samplesInserted: number;
    };
    expect(diag.samplesInserted).toBe(5);
  });

  it("skips samples when paused, on a guard mismatch, and under renderSync", () => {
    const trails = new FakeTrailOverlay();
    const loop = createLoop(trails);
    loop.render(params(1), 1000);
    loop.render(params(1.7, { isPlaying: false }), 1100);
    expect(trails.frames.at(-1)!.motionSamples?.length ?? 0).toBe(0);

    const shifted = params(2.4);
    shifted.props.leftProp = { centerPathAngle: 0.3, staffRotationAngle: 0 };
    loop.render(shifted, 1200);
    expect(trails.frames.at(-1)!.motionSamples?.length ?? 0).toBe(0);
    const diag = loop.getDiagnostics().motionResample as {
      guardRejections: number;
    };
    expect(diag.guardRejections).toBe(1);

    loop.renderSync(params(3.1), 1300, 0.1);
    expect(trails.frames.at(-1)!.motionSamples?.length ?? 0).toBe(0);
  });

  it("honours the window kill switch", () => {
    const trails = new FakeTrailOverlay();
    const loop = createLoop(trails);
    (globalThis as { __TKA_MOTION_RESAMPLE?: boolean }).__TKA_MOTION_RESAMPLE =
      false;
    try {
      loop.render(params(1), 1000);
      loop.render(params(1.7), 1100);
      expect(trails.frames.at(-1)!.motionSamples?.length ?? 0).toBe(0);
    } finally {
      delete (globalThis as { __TKA_MOTION_RESAMPLE?: boolean })
        .__TKA_MOTION_RESAMPLE;
    }
  });
});
```

The test calls the private `render` directly because the rAF loop needs a browser clock; `render` is the one method both drivers share. Add `// @vitest-environment jsdom` as the first line so `window` exists for the kill switch.

- [ ] **Step 3: Run the test, confirm it fails** (no `motionSamples`, no `motionResample` diagnostics).

- [ ] **Step 4: Render loop.** In `animation-render-loop.ts`:

Import after line 74:

```ts
import {
  MotionSubSampler,
  type MotionSubSample,
} from "./motion-sub-sampler";
```

Fields after `private offset = { x: 0, y: 0 };`:

```ts
  /** Fills slow live frames with on-path poses; see motion-sub-sampler.ts. */
  private readonly motionSubSampler = new MotionSubSampler();
  private motionSamples: readonly MotionSubSample[] = [];
```

In `getDiagnostics()` add after `hasTrailOverlay: !!trailOverlay,`:

```ts
      motionResample: {
        ...this.motionSubSampler.stats,
        lastFrameSamples: this.motionSamples.length,
      },
```

In `render`, right after the `if (this.loopDetectedThisFrame) { this.loopStartTime = currentTime; }` block (line 1510), add:

```ts
    // Slow live frames are filled with the poses the props passed through.
    // Only the free-running loop plans them: the export driver renders 24
    // sub-steps per beat already and passes an explicit dt.
    const resampleEnabled =
      typeof window === "undefined" ||
      (window as { __TKA_MOTION_RESAMPLE?: boolean }).__TKA_MOTION_RESAMPLE !==
        false;
    this.motionSamples =
      providedDtSeconds === undefined &&
      isPlaying &&
      resampleEnabled &&
      params.motionSampleSource &&
      rafGap > 0
        ? this.motionSubSampler.plan({
            source: params.motionSampleSource,
            previousStep,
            currentStep,
            dtSeconds,
            isSeamlesslyLoopable: params.isSeamlesslyLoopable ?? false,
            loopDetected: this.loopDetectedThisFrame,
            liveLeft: props.leftProp,
            liveRight: props.rightProp,
            layerCount: props.additionalLayers.length,
            layersAt: params.additionalLayersAt ?? null,
            liveLayers: props.additionalLayers,
            previousTimeMs: currentTime - rafGap,
            currentTimeMs: currentTime,
          })
        : [];
```

Note `rafGap > 0`: the first frame has no previous frame time, so it never plans. In the `trailOverlay.renderFrame({...})` call add after `rightPropSwapSuppressed,`:

```ts
          motionSamples:
            this.motionSamples.length > 0 ? this.motionSamples : undefined,
```

- [ ] **Step 5: Run the test, confirm it passes.**

### Task 4: WebGL2 overlay captures the samples

**Files:**
- Modify: `src/lib/shared/animation-engine/services/trail-overlay-web-gl2.ts` (capture block lines 560 to 755, `appendToRing` line 1263)
- Test: `src/lib/shared/animation-engine/services/__tests__/trail-overlay-web-gl2-motion-samples.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { TrailOverlayWebGL2 } from "../trail-overlay-web-gl2";
import type { TrailOverlayRenderParams } from "../ITrailOverlayCanvas";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
} from "../../domain/types/trail-types";
import type {
  RenderBackend,
  BackendStats,
} from "$lib/shared/render-graph/domain/backend";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import type { MotionSubSample } from "../motion-sub-sampler";

function makeOverlay(): TrailOverlayWebGL2 {
  const overlay = new TrailOverlayWebGL2();
  const internals = overlay as unknown as {
    canvas: HTMLCanvasElement | null;
    backend: RenderBackend | null;
    width: number;
    height: number;
    warmupFramesRemaining: number;
  };
  internals.canvas = document.createElement("canvas");
  internals.backend = {
    kind: "webgl2",
    initialize: async () => {},
    executeFrame: () => {},
    resize: () => {},
    clearScreen: () => {},
    dispose: () => {},
    getStats: (): BackendStats => ({
      lastFrameMs: 0,
      longestPassMs: 0,
      fboCount: 0,
    }),
  };
  internals.width = 500;
  internals.height = 500;
  internals.warmupFramesRemaining = 0;
  return overlay;
}

function propAt(angle: number): PropState {
  return { centerPathAngle: angle, staffRotationAngle: angle };
}

function sample(angle: number, timeMs: number): MotionSubSample {
  return { left: propAt(angle), right: propAt(-angle), layers: [], timeMs };
}

function baseParams(
  overrides: Partial<TrailOverlayRenderParams>
): TrailOverlayRenderParams {
  return {
    leftTrailPoints: [],
    rightTrailPoints: [],
    trailSettings: {
      ...DEFAULT_TRAIL_SETTINGS,
      trackingMode: TrackingMode.BOTH_ENDS,
    },
    deltaTime: 1 / 60,
    currentTime: 0,
    canvasSize: 500,
    hasLeft: true,
    hasRight: false,
    leftPropType: "staff",
    ...overrides,
  };
}

type Ring = Array<{ x: number; y: number; timestamp: number }>;
function leftRightRingOf(overlay: TrailOverlayWebGL2): Ring {
  return (overlay as unknown as { leftRightRing: Ring }).leftRightRing;
}
function leftRightTailOf(overlay: TrailOverlayWebGL2): { visibleCount: number } {
  return (overlay as unknown as { leftRightTail: { visibleCount: number } })
    .leftRightTail;
}
function layerLeftRightRingOf(overlay: TrailOverlayWebGL2): Ring {
  return (
    (overlay as unknown as { layerRings: Array<{ leftRight: Ring }> })
      .layerRings[0]?.leftRight ?? []
  );
}

const QUARTER = Math.PI / 2;

describe("TrailOverlayWebGL2 motion samples", () => {
  it("appends one ring point per sample, in time order, before the frame point", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    const samples = [1, 2, 3, 4, 5].map((i) =>
      sample((QUARTER * i) / 6, (100 * i) / 6)
    );
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        motionSamples: samples,
      })
    );
    const ring = leftRightRingOf(overlay);
    expect(ring.length).toBe(7);
    const radii = ring.map((p) => Math.hypot(p.x - 250, p.y - 250));
    const spread = Math.max(...radii) - Math.min(...radii);
    expect(spread).toBeLessThan(1e-6);
    for (let i = 1; i < ring.length; i++) {
      expect(ring[i]!.timestamp).toBeGreaterThan(ring[i - 1]!.timestamp);
    }
    expect(ring[6]!.timestamp).toBe(100);
  });

  it("grows the tail by one per appended point", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    const before = leftRightTailOf(overlay).visibleCount;
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        motionSamples: [1, 2, 3].map((i) => sample((QUARTER * i) / 4, 25 * i)),
      })
    );
    expect(leftRightTailOf(overlay).visibleCount).toBe(before + 4);
  });

  it("obeys swap suppression and hidden hands per sample", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        leftPropSwapSuppressed: true,
        motionSamples: [sample(QUARTER / 2, 50)],
      })
    );
    expect(leftRightRingOf(overlay).length).toBe(1);

    const hidden = makeOverlay();
    hidden.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        hasLeft: false,
        currentTime: 100,
        deltaTime: 0.1,
        motionSamples: [sample(QUARTER / 2, 50)],
      })
    );
    expect(leftRightRingOf(hidden).length).toBe(0);
  });

  it("captures tunnel layers from each sample's layer pose", () => {
    const overlay = makeOverlay();
    const layer = (angle: number) => ({
      leftProp: propAt(angle + 1),
      rightProp: null,
      leftTrailPoints: [],
      rightTrailPoints: [],
      hasLeft: true,
      hasRight: false,
      opacity: 1,
      leftColor: "#fff",
      rightColor: "#fff",
    });
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(0),
        currentTime: 0,
        additionalLayers: [layer(0)],
      })
    );
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        additionalLayers: [layer(QUARTER)],
        motionSamples: [
          {
            ...sample(QUARTER / 2, 50),
            layers: [{ left: propAt(QUARTER / 2 + 1), right: null }],
          },
          {
            ...sample(QUARTER * 0.75, 75),
            layers: [{ left: null, right: null }],
          },
        ],
      })
    );
    expect(layerLeftRightRingOf(overlay).length).toBe(3);
    expect(leftRightRingOf(overlay).length).toBe(4);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails** (ring length 2, not 7).

- [ ] **Step 3: Restructure the capture block.** Replace lines 560 to 755 (from `let leftLeftMoved = false;` through the fourth base `advanceTail`) with a slice loop. Keep every existing gate. The new block:

```ts
    // Keep capturing while the envelope is still fading so the trail
    // tracks the prop through the fade-out instead of freezing in place.
    const leftCaptureLive = hasLeft || leftAlpha > 0;
    const rightCaptureLive = hasRight || rightAlpha > 0;
    // leftPropSwapSuppressed/rightPropSwapSuppressed: skip the capture (freeze the
    // tip in place) while that color's prop-type swap is in flight. See the
    // TrailOverlayRenderParams doc. leftLeftMoved/rightMoved staying false
    // feeds the normal "prop is stationary" path into advanceTail below, so
    // the tail recedes/shrinks toward the frozen point exactly like a real
    // stationary prop, instead of jumping to the new (mismatched) geometry.
    const additionalLayers = params.additionalLayers;
    const layerCount = additionalLayers?.length ?? 0;
    if (layerCount > 0) {
      this.ensureLayerState(layerCount, leadingEdge);
      for (let i = 0; i < layerCount; i++) {
        const layer = additionalLayers![i]!;
        const rings = this.layerRings[i]!;
        const tails = this.layerTails[i]!;
        const captureSuppressed = layer.trailCaptureSuppressed === true;
        if (this.layerTrailCaptureSuppressed[i] !== captureSuppressed) {
          rings.leftLeft.length = 0;
          rings.leftRight.length = 0;
          rings.rightLeft.length = 0;
          rings.rightRight.length = 0;
          tails.leftLeft = createTailState(leadingEdge);
          tails.leftRight = createTailState(leadingEdge);
          tails.rightLeft = createTailState(leadingEdge);
          tails.rightRight = createTailState(leadingEdge);
        }
        this.layerTrailCaptureSuppressed[i] = captureSuppressed;
      }
      this.layerTrailCaptureSuppressed.length = layerCount;
    } else if (this.layerRings.length > 0) {
      this.resetLayerState();
    }

    // A slow frame is captured as several slices: each sub-sample first, then
    // the current frame. Every slice runs the same gates as the frame and
    // advances the tails by its share of the frame time, so points per second
    // and the recession speed EMA stay at their 60 Hz authoring.
    const samples = params.motionSamples;
    const sliceCount = (samples?.length ?? 0) + 1;
    const sliceDtMs = Math.max(0, params.deltaTime * 1000) / sliceCount;
    let formationTrailCaptures = 0;
    const captureSlice = (
      sliceLeft: PropState | null | undefined,
      sliceRight: PropState | null | undefined,
      sliceLayers: readonly { left: PropState | null; right: PropState | null }[] | null,
      timestamp: number
    ): void => {
      let leftLeftMoved = false;
      let leftRightMoved = false;
      let rightLeftMoved = false;
      let rightRightMoved = false;
      if (sliceLeft && leftCaptureLive && !leftPropSwapSuppressed) {
        const r = this.capturePropTips(
          sliceLeft,
          canvasSize,
          leftPropType,
          0,
          leftTrackLeft && leftLeftTrails,
          leftTrackRight && leftRightTrails,
          leftTrailConfig,
          timestamp
        );
        leftLeftMoved = r.leftMoved;
        leftRightMoved = r.rightMoved;
      }
      if (sliceRight && rightCaptureLive && !rightPropSwapSuppressed) {
        const r = this.capturePropTips(
          sliceRight,
          canvasSize,
          rightPropType,
          1,
          rightTrackLeft && rightLeftTrails,
          rightTrackRight && rightRightTrails,
          rightTrailConfig,
          timestamp
        );
        rightLeftMoved = r.leftMoved;
        rightRightMoved = r.rightMoved;
      }

      // Capture overlaid tunnel-layer tips into per-layer rings (same color/tip
      // gating as the base pair). Each layer's left prop feeds a left tip, right
      // prop a red tip, so every kaleidoscope copy trails in its own color.
      for (let i = 0; i < layerCount; i++) {
        const layer = additionalLayers![i]!;
        const rings = this.layerRings[i]!;
        const tails = this.layerTails[i]!;
        const captureSuppressed = layer.trailCaptureSuppressed === true;
        const layerLeft = sliceLayers ? sliceLayers[i]?.left ?? null : layer.leftProp;
        const layerRight = sliceLayers ? sliceLayers[i]?.right ?? null : layer.rightProp;
        const pointsBefore =
          rings.leftLeft.length +
          rings.leftRight.length +
          rings.rightLeft.length +
          rings.rightRight.length;
        let bL = false,
          bR = false,
          rL = false,
          rR = false;
        if (
          layerLeft &&
          layer.hasLeft &&
          leftCaptureLive &&
          !leftPropSwapSuppressed &&
          !captureSuppressed
        ) {
          const m = this.capturePropTipsInto(
            layerLeft,
            canvasSize,
            leftNotationType,
            0,
            rings.leftLeft,
            rings.leftRight,
            leftTrackLeft && leftLeftTrails,
            leftTrackRight && leftRightTrails,
            leftTrailConfig,
            timestamp
          );
          bL = m.leftMoved;
          bR = m.rightMoved;
        }
        if (
          layerRight &&
          layer.hasRight &&
          rightCaptureLive &&
          !rightPropSwapSuppressed &&
          !captureSuppressed
        ) {
          const m = this.capturePropTipsInto(
            layerRight,
            canvasSize,
            rightNotationType,
            1,
            rings.rightLeft,
            rings.rightRight,
            rightTrackLeft && rightLeftTrails,
            rightTrackRight && rightRightTrails,
            rightTrailConfig,
            timestamp
          );
          rL = m.leftMoved;
          rR = m.rightMoved;
        }
        // Advance every tail each slice (moved=false freezes recession during a
        // fade-out the same way the base pair does), so layer trails recede
        // identically whether the prop is moving, stationary, or fading out.
        tails.leftLeft = advanceTail(tails.leftLeft, rings.leftLeft, bL, sliceDtMs, leadingEdge);
        tails.leftRight = advanceTail(tails.leftRight, rings.leftRight, bR, sliceDtMs, leadingEdge);
        tails.rightLeft = advanceTail(tails.rightLeft, rings.rightLeft, rL, sliceDtMs, leadingEdge);
        tails.rightRight = advanceTail(tails.rightRight, rings.rightRight, rR, sliceDtMs, leadingEdge);
        if (layer.formationTransitionActive) {
          const pointsAfter =
            rings.leftLeft.length +
            rings.leftRight.length +
            rings.rightLeft.length +
            rings.rightRight.length;
          formationTrailCaptures += Math.max(0, pointsAfter - pointsBefore);
        }
      }

      // Advance per-ring tail recession state. Moving slices update the
      // per-ring speed EMA and keep visibleCount at LEADING_EDGE. Stationary
      // slices walk the visible endpoint forward along the captured path at
      // the pre-stop speed, so stopping on a dime reads as "the trail
      // finishes the motion" instead of freezing at constant length.
      this.leftLeftTail = advanceTail(this.leftLeftTail, this.leftLeftRing, leftLeftMoved, sliceDtMs, leadingEdge);
      this.leftRightTail = advanceTail(this.leftRightTail, this.leftRightRing, leftRightMoved, sliceDtMs, leadingEdge);
      this.rightLeftTail = advanceTail(this.rightLeftTail, this.rightLeftRing, rightLeftMoved, sliceDtMs, leadingEdge);
      this.rightRightTail = advanceTail(this.rightRightTail, this.rightRightRing, rightRightMoved, sliceDtMs, leadingEdge);
    };

    if (samples) {
      for (const s of samples) {
        captureSlice(s.left, s.right, s.layers, s.timeMs);
      }
    }
    captureSlice(leftProp, rightProp, null, params.currentTime);
    recordTunnelFormationTrailCaptures(formationTrailCaptures);
```

Then thread `timestamp: number` through `capturePropTips` and `capturePropTipsInto` (last parameter, passed to `appendToRing`), and change `appendToRing` to take `timestamp: number` as its last parameter and write `timestamp` instead of `performance.now()`. Update the WebGL2 ring comment near line 210 that says the timestamp is unused: it now records the slice's frame clock.

- [ ] **Step 4: Run the new test and the existing `trail-overlay-web-gl2-prop-swap-suppression.test.ts`; both pass.**

### Task 5: Canvas2D overlay captures the samples

**Files:**
- Modify: `src/lib/shared/animation-engine/services/trail-overlay-canvas.ts` (capture block lines 521 to 630)
- Test: `src/lib/shared/animation-engine/services/__tests__/trail-overlay-canvas-motion-samples.test.ts`

- [ ] **Step 1: Write the failing test** (same shape as Task 4, Canvas2D harness from `trail-overlay-canvas-prop-swap-suppression.test.ts`: `makeOverlay` sets `ctx = { clearRect }`, width/height 500, warmup 0). Assert: seven ring points on one radius with increasing timestamps after one slow frame with five samples; swap suppression leaves one point; a hidden hand leaves none; a layer ring gets three points from two samples plus the frame when the second sample's layer is null.

```ts
import { describe, expect, it } from "vitest";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import {
  DEFAULT_TRAIL_SETTINGS,
  TrackingMode,
} from "../../domain/types/trail-types";
import type { TrailOverlayRenderParams } from "../ITrailOverlayCanvas";
import { TrailOverlayCanvas } from "../trail-overlay-canvas";
import type { MotionSubSample } from "../motion-sub-sampler";

function propAt(angle: number): PropState {
  return { centerPathAngle: angle, staffRotationAngle: angle };
}
function sample(angle: number, timeMs: number): MotionSubSample {
  return { left: propAt(angle), right: propAt(-angle), layers: [], timeMs };
}
function makeOverlay(): TrailOverlayCanvas {
  const overlay = new TrailOverlayCanvas();
  const internals = overlay as unknown as {
    ctx: CanvasRenderingContext2D | null;
    width: number;
    height: number;
    warmupFramesRemaining: number;
  };
  internals.ctx = { clearRect: () => {} } as unknown as CanvasRenderingContext2D;
  internals.width = 500;
  internals.height = 500;
  internals.warmupFramesRemaining = 0;
  return overlay;
}
function baseParams(
  overrides: Partial<TrailOverlayRenderParams>
): TrailOverlayRenderParams {
  return {
    leftTrailPoints: [],
    rightTrailPoints: [],
    trailSettings: { ...DEFAULT_TRAIL_SETTINGS, trackingMode: TrackingMode.BOTH_ENDS },
    deltaTime: 1 / 60,
    currentTime: 0,
    canvasSize: 500,
    hasLeft: true,
    hasRight: false,
    leftPropType: "staff",
    ...overrides,
  };
}
type Ring = Array<{ x: number; y: number; timestamp: number }>;
function leftRightRingOf(overlay: TrailOverlayCanvas): Ring {
  return (overlay as unknown as { leftRightRing: Ring }).leftRightRing;
}
function layerLeftRightRingOf(overlay: TrailOverlayCanvas): Ring {
  return (
    (overlay as unknown as { leftLayerRings: Array<{ right: Ring }> })
      .leftLayerRings[0]?.right ?? []
  );
}
const QUARTER = Math.PI / 2;

describe("TrailOverlayCanvas motion samples", () => {
  it("appends one ring point per sample before the frame point", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        motionSamples: [1, 2, 3, 4, 5].map((i) => sample((QUARTER * i) / 6, (100 * i) / 6)),
      })
    );
    const ring = leftRightRingOf(overlay);
    expect(ring.length).toBe(7);
    const radii = ring.map((p) => Math.hypot(p.x - 250, p.y - 250));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);
    for (let i = 1; i < ring.length; i++) {
      expect(ring[i]!.timestamp).toBeGreaterThan(ring[i - 1]!.timestamp);
    }
  });

  it("obeys swap suppression and hidden hands per sample", () => {
    const overlay = makeOverlay();
    overlay.renderFrame(baseParams({ leftProp: propAt(0), currentTime: 0 }));
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        leftPropSwapSuppressed: true,
        motionSamples: [sample(QUARTER / 2, 50)],
      })
    );
    expect(leftRightRingOf(overlay).length).toBe(1);
    const hidden = makeOverlay();
    hidden.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        hasLeft: false,
        currentTime: 100,
        deltaTime: 0.1,
        motionSamples: [sample(QUARTER / 2, 50)],
      })
    );
    expect(leftRightRingOf(hidden).length).toBe(0);
  });

  it("captures tunnel layers from each sample's layer pose", () => {
    const overlay = makeOverlay();
    const layer = (angle: number) => ({
      leftProp: propAt(angle + 1),
      rightProp: null,
      leftTrailPoints: [],
      rightTrailPoints: [],
      hasLeft: true,
      hasRight: false,
      opacity: 1,
      leftColor: "#fff",
      rightColor: "#fff",
    });
    overlay.renderFrame(
      baseParams({ leftProp: propAt(0), currentTime: 0, additionalLayers: [layer(0)] })
    );
    overlay.renderFrame(
      baseParams({
        leftProp: propAt(QUARTER),
        currentTime: 100,
        deltaTime: 0.1,
        additionalLayers: [layer(QUARTER)],
        motionSamples: [
          { ...sample(QUARTER / 2, 50), layers: [{ left: propAt(QUARTER / 2 + 1), right: null }] },
          { ...sample(QUARTER * 0.75, 75), layers: [{ left: null, right: null }] },
        ],
      })
    );
    expect(layerLeftRightRingOf(overlay).length).toBe(3);
    expect(leftRightRingOf(overlay).length).toBe(4);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails.**

- [ ] **Step 3: Restructure the capture block** (lines 521 to 630) into the same slice loop as Task 4 without tails. Layer ring reset on `trailCaptureSuppressed` change moves before the loop; `ensureLayerRings` likewise. The slice closure takes `(sliceLeft, sliceRight, sliceLayers, timestamp)` and calls `capturePropTips(..., timestamp)` / `capturePropTipsInto(..., timestamp)`; layer props come from `sliceLayers[i]` when a sample is being captured and from `layer.leftProp/rightProp` for the frame. Run the samples oldest first, then the frame with `currentTime`.

- [ ] **Step 4: Run the new test and `trail-overlay-canvas-prop-swap-suppression.test.ts`; both pass.**

- [ ] **Step 5: Commit phase 1**

```bash
git add src/lib/shared/animation-engine/services/motion-sub-sampler.ts src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts src/lib/shared/animation-engine/services/__tests__/render-loop-motion-resample.test.ts src/lib/shared/animation-engine/services/__tests__/trail-overlay-web-gl2-motion-samples.test.ts src/lib/shared/animation-engine/services/__tests__/trail-overlay-canvas-motion-samples.test.ts
git commit -m "feat(trails): resample motion on slow frames so live trails stay round" -- src/lib/shared/animation-engine/services/motion-sub-sampler.ts src/lib/shared/animation-engine/services/__tests__/motion-sub-sampler.test.ts src/lib/shared/animation-engine/services/__tests__/render-loop-motion-resample.test.ts src/lib/shared/animation-engine/services/__tests__/trail-overlay-web-gl2-motion-samples.test.ts src/lib/shared/animation-engine/services/__tests__/trail-overlay-canvas-motion-samples.test.ts src/lib/shared/animation-engine/services/IAnimationRenderLoop.ts src/lib/shared/animation-engine/services/animation-engine.svelte.ts src/lib/shared/animation-engine/services/frame-parameter-builder.ts src/lib/shared/animation-engine/services/managers/frame-system.ts src/lib/shared/animation-engine/components/AnimatorCanvas.svelte src/lib/shared/animation-engine/components/CanvasSurface.svelte src/lib/shared/sequence-viewer/components/ViewerMotionSurface.svelte src/lib/shared/animation-engine/services/animation-render-loop.ts src/lib/shared/animation-engine/services/ITrailOverlayCanvas.ts src/lib/shared/animation-engine/services/trail-overlay-web-gl2.ts src/lib/shared/animation-engine/services/trail-overlay-canvas.ts docs/superpowers/specs/active/2026-10-07-trail-resampling-design.md docs/superpowers/plans/active/2026-10-07-trail-resampling.md
```

The message body ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

### Task 6: Fire path

**Files:**
- Modify: `src/lib/shared/animation-engine/domain/types/fire-types.ts` (`PropTipData` line 45)
- Modify: `src/lib/shared/animation-engine/services/fire-tip-tracker.ts`
- Create: `src/lib/shared/animation-engine/services/fire/fire-sweep.ts`
- Test: `src/lib/shared/animation-engine/services/fire/__tests__/fire-sweep.test.ts`
- Test: `src/lib/shared/animation-engine/services/__tests__/fire-tip-tracker-path.test.ts`
- Modify: `src/lib/shared/animation-engine/services/fire/web-gl-fire-renderer.ts` (sweep lines 1122 to 1170)
- Modify: `src/lib/shared/animation-engine/services/animation-render-loop.ts` (`toFrameTips` line 1160, tracker call line 1865)

- [ ] **Step 1: `PropTipData.path`.** After `prevY: number;` add:

```ts
  /**
   * Positions this tip passed through since the previous frame, oldest first,
   * strictly between (prevX, prevY) and (x, y). Present only when the render
   * loop resampled a slow frame. Renderers that sweep prev to cur follow this
   * polyline instead of the chord.
   */
  path?: readonly { x: number; y: number }[];
```

- [ ] **Step 2: Fire sweep test (failing first)**

```ts
import { describe, expect, it } from "vitest";
import { sweepPolyline } from "../fire-sweep";

describe("sweepPolyline", () => {
  it("matches the two-point chord sweep for a bare chord", () => {
    const out: Array<{ x: number; y: number }> = [];
    const n = sweepPolyline([{ x: 0, y: 0 }, { x: 0.3, y: 0 }], 0.1, 32, out);
    expect(n).toBe(3);
    expect(out.slice(0, n)).toEqual([
      { x: 0, y: 0 },
      { x: 0.15, y: 0 },
      { x: 0.3, y: 0 },
    ]);
  });

  it("returns only the end point when the path is shorter than a step", () => {
    const out: Array<{ x: number; y: number }> = [];
    const n = sweepPolyline([{ x: 0, y: 0 }, { x: 0.01, y: 0 }], 0.1, 32, out);
    expect(n).toBe(1);
    expect(out[0]).toEqual({ x: 0.01, y: 0 });
  });

  it("spreads splats by arc length along a bent path", () => {
    const out: Array<{ x: number; y: number }> = [];
    const n = sweepPolyline(
      [{ x: 0, y: 0 }, { x: 0.2, y: 0 }, { x: 0.2, y: 0.2 }],
      0.1,
      32,
      out
    );
    expect(n).toBe(5);
    expect(out[2]).toEqual({ x: 0.2, y: 0 });
    expect(out[3]!.x).toBeCloseTo(0.2, 9);
    expect(out[3]!.y).toBeCloseTo(0.1, 9);
  });

  it("caps the count", () => {
    const out: Array<{ x: number; y: number }> = [];
    const n = sweepPolyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], 0.1, 32, out);
    expect(n).toBe(32);
    expect(out[31]).toEqual({ x: 10, y: 0 });
  });
});
```

- [ ] **Step 3: `fire-sweep.ts`**

```ts
/**
 * Spreads fire splats along the path a tip travelled this frame. For a bare
 * chord (two points) the result equals the renderer's original sweep: the same
 * count from `ceil(length / stepUV)` and evenly spaced points from start to
 * end. With intermediate points the splats follow the polyline by arc length,
 * so a slow frame paints a curve instead of a straight streak.
 */

export interface SweepPoint {
  x: number;
  y: number;
}

/** Writes the splat positions into `out` (reused objects) and returns the
 *  count: `min(cap, max(1, ceil(length / stepUV)))`. A count of one places
 *  the single splat at the end point, as the chord sweep did. */
export function sweepPolyline(
  points: readonly SweepPoint[],
  stepUV: number,
  cap: number,
  out: SweepPoint[]
): number {
  const last = points[points.length - 1];
  if (!last) return 0;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const count = Math.min(cap, Math.max(1, Math.ceil(length / stepUV)));
  if (count === 1 || length === 0) {
    write(out, 0, last.x, last.y);
    return 1;
  }
  let seg = 1;
  let segStart = 0;
  let segLen = Math.hypot(points[1]!.x - points[0]!.x, points[1]!.y - points[0]!.y);
  for (let s = 0; s < count; s++) {
    const d = (length * s) / (count - 1);
    while (seg < points.length - 1 && d > segStart + segLen) {
      segStart += segLen;
      seg++;
      segLen = Math.hypot(
        points[seg]!.x - points[seg - 1]!.x,
        points[seg]!.y - points[seg - 1]!.y
      );
    }
    const a = points[seg - 1]!;
    const b = points[seg]!;
    const t = segLen > 0 ? Math.min(1, (d - segStart) / segLen) : 1;
    write(out, s, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  return count;
}

function write(out: SweepPoint[], i: number, x: number, y: number): void {
  const p = out[i];
  if (p) {
    p.x = x;
    p.y = y;
  } else {
    out[i] = { x, y };
  }
}
```

- [ ] **Step 4: Run the sweep test; it passes.**

- [ ] **Step 5: Tracker test (failing first)**

```ts
import { describe, expect, it } from "vitest";
import { FireTipTracker } from "../fire-tip-tracker";
import type { FireTipTrackerConfig } from "../fire-tip-tracker";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import type { MotionSubSample } from "../motion-sub-sampler";

function propAt(angle: number): PropState {
  return { centerPathAngle: angle, staffRotationAngle: angle };
}
function sample(angle: number, timeMs: number): MotionSubSample {
  return { left: propAt(angle), right: null as unknown as PropState, layers: [], timeMs };
}
const config: FireTipTrackerConfig = {
  canvasSize: 500,
  leftPropDimensions: { width: 252.8, height: 77.8 },
  rightPropDimensions: { width: 252.8, height: 77.8 },
  leftPropType: "staff",
  rightPropType: "staff",
};
const QUARTER = Math.PI / 2;

function warm(tracker: FireTipTracker): number {
  let t = 0;
  for (let i = 0; i < 3; i++) {
    tracker.update(propAt(0), null, config, t);
    t += 16;
  }
  return t;
}

describe("FireTipTracker path", () => {
  it("writes one path point per sample, on the arc, between prev and cur", () => {
    const tracker = new FireTipTracker();
    let t = warm(tracker);
    tracker.update(propAt(0), null, config, t);
    t += 100;
    const samples = [1, 2, 3].map((i) => sample((QUARTER * i) / 4, t - 100 + 25 * i));
    const result = tracker.update(propAt(QUARTER), null, config, t, samples);
    const tip = result.tips[0]!;
    expect(tip.path?.length).toBe(3);
    const radius = (p: { x: number; y: number }) => Math.hypot(p.x - 250, p.y - 250);
    const r0 = radius({ x: tip.prevX, y: tip.prevY });
    for (const p of tip.path!) expect(radius(p)).toBeCloseTo(r0, 6);
    expect(radius({ x: tip.x, y: tip.y })).toBeCloseTo(r0, 6);
  });

  it("omits the path on the first valid frame and when no samples are given", () => {
    const tracker = new FireTipTracker();
    const t = warm(tracker);
    const first = tracker.update(propAt(0), null, config, t, [sample(0.1, t - 5)]);
    expect(first.tips[0]!.path).toBeUndefined();
    const second = tracker.update(propAt(0.2), null, config, t + 16);
    expect(second.tips[0]!.path).toBeUndefined();
  });

  it("keeps the path continuous with a rendered transform", () => {
    const tracker = new FireTipTracker();
    let t = warm(tracker);
    const shifted = {
      ...config,
      renderedTransforms: {
        left: { centerX: 260, centerY: 240, angle: QUARTER, scaleFactor: 500 / 950 },
        right: null,
      },
    };
    tracker.update(propAt(0), null, config, t);
    t += 100;
    const result = tracker.update(
      propAt(QUARTER),
      null,
      shifted,
      t,
      [sample(QUARTER * 0.999, t - 1)]
    );
    const tip = result.tips[0]!;
    const p = tip.path![0]!;
    // The last sample sits a hair before the current step, so its path point
    // lands next to the rendered tip, not next to the fallback tip.
    expect(Math.hypot(p.x - tip.x, p.y - tip.y)).toBeLessThan(1);
  });
});
```

- [ ] **Step 6: Tracker implementation.** In `fire-tip-tracker.ts`:

Import `type { MotionSubSample } from "./motion-sub-sampler"`. Add a module-level scratch:

```ts
/** Reused per tip while computing its sub-frame path. */
const pathScratch: { x: number; y: number }[] = [];
```

`update` gains `motionSamples?: readonly MotionSubSample[]` as its fifth parameter and passes it on. `emitPropTips` and `emitLayerPropTips` gain a `samples: readonly MotionSubSample[] | undefined` parameter plus `hand: "left" | "right"` and, for layers, `layerIndex: number`. Inside each tip loop, before `emitTip`, compute the path when `prev.valid` and `samples` has entries:

```ts
      const path = this.computeTipPath(
        prev,
        samples,
        (s) => (hand === "left" ? s.left : s.right),   // base; layers use s.layers[layerIndex]?.left/right
        canvasSize,
        propDimensions,
        tp,
        mirror,
        renderedTransform ? worldX : null,
        renderedTransform ? worldY : null
      );
      this.emitTip(prev, worldX, worldY, propIndex, i, flameScale, currentTime, outputIndex, path);
```

with the helper:

```ts
  /**
   * The tip's positions at the sub-frame instants, oldest first, with the
   * fallback position math. When the drawn tip came from a rendered transform,
   * every point is shifted by (rendered tip - fallback tip at the current
   * step) so the path stays continuous with the drawn position. Returns
   * undefined when there is no previous position to connect from.
   */
  private computeTipPath(
    prev: StoredTip,
    samples: readonly MotionSubSample[] | undefined,
    poseOf: (s: MotionSubSample) => PropState | null | undefined,
    canvasSize: number,
    propDimensions: { width: number; height: number },
    tp: TipPoint,
    mirror: number,
    currentProp: PropState,
    renderedX: number | null,
    renderedY: number | null
  ): readonly { x: number; y: number }[] | undefined {
    if (!prev.valid || !samples || samples.length === 0) return undefined;
    const endpointConfig: PropEndpointConfig = { canvasSize, propDimensions };
    const gridScaleFactor = canvasSize / VIEWBOX_SIZE;
    const dx = tp.dx * mirror;
    const tipAt = (prop: PropState): { x: number; y: number } => {
      const center = calculatePropCenter(prop, endpointConfig);
      const cosA = Math.cos(prop.staffRotationAngle);
      const sinA = Math.sin(prop.staffRotationAngle);
      return {
        x: center.x + (dx * cosA - tp.dy * sinA) * gridScaleFactor,
        y: center.y + (dx * sinA + tp.dy * cosA) * gridScaleFactor,
      };
    };
    let offsetX = 0;
    let offsetY = 0;
    if (renderedX !== null && renderedY !== null) {
      const fallback = tipAt(currentProp);
      offsetX = renderedX - fallback.x;
      offsetY = renderedY - fallback.y;
    }
    const path: { x: number; y: number }[] = [];
    for (const s of samples) {
      const prop = poseOf(s);
      if (!prop) continue;
      const p = tipAt(prop);
      path.push({ x: p.x + offsetX, y: p.y + offsetY });
    }
    return path.length > 0 ? path : undefined;
  }
```

(The helper allocates a small array per tip only on resampled frames; the zero-alloc hot path is unchanged at a healthy frame rate.) `emitTip` gains a trailing `path` parameter and sets `existing.path = path` / includes `path` in the pushed object. Pass `currentProp` (the prop being emitted) into the helper.

- [ ] **Step 7: Run the tracker test; it passes.** Also run `render-loop-fire-prop-switch-fade.test.ts`.

- [ ] **Step 8: Renderer.** In `web-gl-fire-renderer.ts` import `sweepPolyline, type SweepPoint` from `"./fire-sweep"` and add module scratch `const sweepPointsScratch: SweepPoint[] = []; const sweepOutScratch: SweepPoint[] = [];`. Replace the per-tip loop body from `const dxUV = ...` through the inner `for (let s ...)` with:

```ts
      // The path is prev, any sub-frame points, cur, in UV space. Fuel and
      // temperature per splat divide by the same count as before, so a slow
      // frame deposits the same total energy, spread along the arc.
      sweepPointsScratch.length = 0;
      sweepPointsScratch.push({ x: prevUvX, y: prevUvY });
      if (tip.path) {
        for (const p of tip.path) {
          sweepPointsScratch.push({
            x: p.x / input.canvasWidth,
            y: 1.0 - p.y / input.canvasHeight,
          });
        }
      }
      sweepPointsScratch.push({ x: curUvX, y: curUvY });
      const splatCount = sweepPolyline(sweepPointsScratch, stepUV, 32, sweepOutScratch);

      const velScale = config.velocityReactive ? p.velocityInjectScale : 0;
      const injectVx = -tip.velocityX * velScale * fs;
      const injectVy =
        tip.velocityY * velScale * fs + p.upwardBias * config.flameHeight * fs;

      const fuelPerSplat = (p.fuelAmount * config.intensity * fs) / splatCount;
      const baseTempPerSplat =
        (p.temperatureInjection * config.intensity * fs) / splatCount;

      const tc = this.turbulenceClock;
      const tipPhase = tip.propIndex * 3.7 + tip.tipIndex * 2.3;

      for (let s = 0; s < splatCount; s++) {
        const uvX = sweepOutScratch[s]!.x;
        const uvY = sweepOutScratch[s]!.y;
        // (temperature noise, propColor and splats.push unchanged)
```

- [ ] **Step 9: Render loop.** `toFrameTips` maps `path` too:

```ts
        path: t.path?.map((p) => ({ x: p.x + x, y: p.y + y })),
```

and the tracker call passes `this.motionSamples.length > 0 ? this.motionSamples : undefined` as the fifth argument.

- [ ] **Step 10: Run the fire tests, scoped tsc, then commit phase 2**

```bash
git commit -m "feat(fire): sweep flames along the resampled tip path on slow frames" -- src/lib/shared/animation-engine/domain/types/fire-types.ts src/lib/shared/animation-engine/services/fire-tip-tracker.ts src/lib/shared/animation-engine/services/fire/fire-sweep.ts src/lib/shared/animation-engine/services/fire/__tests__/fire-sweep.test.ts src/lib/shared/animation-engine/services/__tests__/fire-tip-tracker-path.test.ts src/lib/shared/animation-engine/services/fire/web-gl-fire-renderer.ts src/lib/shared/animation-engine/services/animation-render-loop.ts
```

(`git add` the two new files first.)

### Task 7: LED prior sets

**Files:**
- Modify: `src/lib/shared/animation-engine/domain/types/led-types.ts` (`LedFrameInput` line 149)
- Modify: `src/lib/shared/animation-engine/services/led-sampler.ts` (`update` line 101, `emitLed` line 334)
- Test: `src/lib/shared/animation-engine/services/__tests__/led-sampler-output-target.test.ts`
- Modify: `src/lib/shared/animation-engine/services/led/web-gl-led-renderer.ts` (`renderLeds` lines 442 to 456, `buildSegments` line 770)
- Modify: `src/lib/shared/animation-engine/services/animation-render-loop.ts` (LED block lines 2043 to 2096, `toFrameLeds` line 1207)

- [ ] **Step 1: `LedFrameInput.priorSamples`**

```ts
  /**
   * LED sets at the sub-frame instants since the previous frame, oldest
   * first, each the same shape as `leds`. The renderer deposits one streak
   * pass per set, then the final pass for `leds`, sharing the frame's shutter.
   * Absent at a healthy frame rate and during export.
   */
  priorSamples?: readonly (readonly LedSample[])[];
```

- [ ] **Step 2: Sampler test (failing first)**

```ts
import { describe, expect, it } from "vitest";
import { LedSampler } from "../led-sampler";
import type { LedSamplerConfig } from "../led-sampler";
import { DEFAULT_LED_CONFIG } from "../../domain/types/led-types";
import type { LedSample } from "../../domain/types/led-types";

const config: LedSamplerConfig = {
  canvasSize: 500,
  leftPropDimensions: { width: 252.8, height: 77.8 },
  rightPropDimensions: { width: 252.8, height: 77.8 },
  leftPropType: "staff",
  rightPropType: "staff",
};

describe("LedSampler output target", () => {
  it("writes into the supplied array without touching its own", () => {
    const sampler = new LedSampler();
    const t0 = 0;
    for (let i = 0; i < 3; i++) {
      sampler.update({ centerPathAngle: 0, staffRotationAngle: 0 }, null, config, t0 + i * 16, DEFAULT_LED_CONFIG);
    }
    const own = sampler.update(
      { centerPathAngle: 0, staffRotationAngle: 0 },
      null,
      config,
      100,
      DEFAULT_LED_CONFIG
    );
    const ownCount = own.length;
    expect(ownCount).toBeGreaterThan(0);
    const ownFirstX = own[0]!.x;

    const out: LedSample[] = [];
    const prior = sampler.update(
      { centerPathAngle: 1, staffRotationAngle: 1 },
      null,
      config,
      110,
      DEFAULT_LED_CONFIG,
      out
    );
    expect(prior).toBe(out);
    expect(out.length).toBe(ownCount);
    expect(own[0]!.x).toBe(ownFirstX);
    expect(out[0]!.x).not.toBe(ownFirstX);
  });
});
```

- [ ] **Step 3: Sampler.** Add a field `private target: LedSample[] = this.outputLeds;`. `update` gains `out?: LedSample[]` after `ledConfig`; at the top set `this.target = out ?? this.outputLeds;`, replace every `this.outputLeds.length = 0` in `update` with `this.target.length = 0` and `return this.outputLeds` with `return this.target`. `emitLed` reads and pushes on `this.target`. `reset()` keeps clearing `this.outputLeds`.

- [ ] **Step 4: Run the sampler test; passes.**

- [ ] **Step 5: Renderer.** In `renderLeds`, replace the dt block and the `buildSegments` call:

```ts
		const currentTimeSec = input.currentTime / 1000;
		const rawDt = this.lastFrameTime >= 0 ? currentTimeSec - this.lastFrameTime : 0;
		// Prior sets bridge a slow frame: judge the streak rule on the per-pass
		// delta so the bridged frame is a streak, not a gap.
		const priors = input.priorSamples ?? [];
		const passes = priors.length + 1;
		const perPassRaw = rawDt / passes;
		const isDiscontinuity = rawDt <= 0 || perPassRaw > MAX_STREAK_DT;
		const passDt = isDiscontinuity
			? FALLBACK_DT
			: Math.min(Math.max(perPassRaw, MIN_DT), MAX_STREAK_DT);
		// The shutter integrates the whole frame; a discontinuity still counts
		// as one reference step.
		const dt = isDiscontinuity ? FALLBACK_DT : passDt * passes;
		this.lastFrameTime = currentTimeSec;

		// A change of input frame size keeps the streak: buildSegments carries
		// the stored positions onto the new square.
		this.frameStart.clear();
		let segmentCount = 0;
		for (let pass = 0; pass < passes; pass++) {
			const leds = pass < priors.length ? priors[pass]! : input.leds;
			segmentCount = this.buildSegments(
				leds,
				input.canvasWidth,
				input.canvasHeight,
				config,
				passDt,
				isDiscontinuity && pass === 0,
				pass === 0,
				pass === passes - 1,
				segmentCount,
			);
		}
```

`buildSegments` signature becomes `(leds: readonly LedSample[], canvasWidth: number, canvasHeight: number, config, dt, timeDiscontinuity, firstPass, lastPass, startIndex): number`. Inside: `ledCount = Math.min(leds.length, MAX_LEDS)`, `written = startIndex`, every `input.leds[...]` becomes `leds[...]`, `adoptFrame(canvasWidth, canvasHeight)`. The cap logic:

```ts
				// Caps are judged on the whole frame path: the first pass records
				// where each LED started, the last pass measures to the final
				// position and patches the first pass's start cap when the whole
				// frame turned out isolated.
				const key = led.propIndex * 1000 + led.ledIndex;
				let start = this.frameStart.get(key);
				if (firstPass || !start) {
					start = { x: ax, y: ay, firstSegment: written, startCap: isDiscontinuity ? 1 : 0 };
					this.frameStart.set(key, start);
				}
				const framePathPx = Math.hypot(currX - start.x, currY - start.y);
				const isolated = lastPass && framePathPx < sigmaEff;
				const pathStartCap = firstPass ? (isolated || isDiscontinuity ? 1 : 0) : 0;
				const pathEndCap = isolated ? 1 : 0;
				if (isolated && !firstPass && start.startCap === 0) {
					this.instanceData[start.firstSegment * INSTANCE_STRIDE_FLOATS + 9] = 1;
					start.startCap = 1;
				}
```

with the field `private readonly frameStart = new Map<number, { x: number; y: number; firstSegment: number; startCap: number }>();`. The end cap write stays `kNext === subSteps ? pathEndCap : 0`; the start cap write stays `k === 0 ? pathStartCap : 0`. `ensureSegmentCapacity` and the `MAX_SEGMENT_CAPACITY` break are unchanged. Update `renderLeds` so the repeat guard records `!isDiscontinuity` as before.

- [ ] **Step 6: Render loop LED block.** Build the prior sets after the current-frame update so warmup frames are not burned on priors:

```ts
        const allLeds = this.toFrameLeds(
          this.ledSampler.update(visibleLeftProp, visibleRightProp, ledSamplerConfig, currentTime, params.ledConfig)
        );
        const ledTipMap = params.tipEffectMap ?? {};
        const isLedTip = (l: LedSample) =>
          resolveEffect(l.propIndex, l.endpointIndex, ledTipMap, {}) === "led";
        const leds = allLeds.filter(isLedTip);

        // One LED set per sub-frame, at most LED_PRIOR_SET_CAP picked evenly,
        // so a slow frame deposits a curved streak instead of a chord.
        let priorSamples: LedSample[][] | undefined;
        if (this.motionSamples.length > 0 && leds.length > 0) {
          const pickCount = pickEvenIndices(this.motionSamples.length, LED_PRIOR_SET_CAP, this.ledPriorPick);
          priorSamples = [];
          for (let i = 0; i < pickCount; i++) {
            const s = this.motionSamples[this.ledPriorPick[i]!]!;
            const sampleConfig: LedSamplerConfig = {
              ...ledSamplerConfig,
              additionalLayers:
                s.layers.length > 0
                  ? s.layers.map((layer, li) => ({
                      leftProp: effectiveLeftMotionVisible ? layer.left : null,
                      rightProp: effectiveRightMotionVisible ? layer.right : null,
                      opacity: props.additionalLayers[li]?.opacity,
                    }))
                  : undefined,
            };
            const set = this.toFrameLeds(
              this.ledSampler.update(
                visibleLeftProp ? s.left : null,
                visibleRightProp ? s.right : null,
                sampleConfig,
                s.timeMs,
                params.ledConfig,
                this.ledPriorBuffers[i] ?? (this.ledPriorBuffers[i] = [])
              )
            ).filter(isLedTip);
            priorSamples.push(set as LedSample[]);
          }
        }

        activeLedRenderer.renderLeds(
          { leds, currentTime, canvasWidth: this.canvasFrame.width, canvasHeight: this.canvasFrame.height, priorSamples },
          params.ledConfig
        );
```

Fields: `private readonly ledPriorBuffers: LedSample[][] = [];` and `private readonly ledPriorPick: number[] = [];`; constant `const LED_PRIOR_SET_CAP = 15;` at module level; import `pickEvenIndices` from `./motion-sub-sampler`. `toFrameLeds` is unchanged (it already maps every element).

- [ ] **Step 7: Run the LED sampler test, `render-loop-motion-resample.test.ts`, scoped tsc. Commit phase 3**

```bash
git commit -m "feat(led): deposit one streak pass per resampled sub-frame" -- src/lib/shared/animation-engine/domain/types/led-types.ts src/lib/shared/animation-engine/services/led-sampler.ts src/lib/shared/animation-engine/services/__tests__/led-sampler-output-target.test.ts src/lib/shared/animation-engine/services/led/web-gl-led-renderer.ts src/lib/shared/animation-engine/services/animation-render-loop.ts
```

### Task 8: Browser proof, queue update, integration

- [ ] **Step 1: Worktree preview.** Add a temporary entry to `E:/tka-platform/.claude/launch.json` named `verify-trail-resampling` running `pnpm --dir E:/worktrees/tka-platform/trail-resampling exec vite --port <free port> --strictPort --host 127.0.0.1` with `"url": "http://localhost:<port>"`. Open a playing sequence with trails, fire and LED in the in-app browser.
- [ ] **Step 2: Throttle.** In the page, patch `requestAnimationFrame` to fire every 100 ms (`window.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 100)`). Screenshot with `__TKA_MOTION_RESAMPLE` unset (round trails, curved fire and LED) and with it `false` (polygons and chords). Read `motionResample` from the render loop diagnostics: `samplesInserted` grows while throttled and `lastFrameSamples` is 0 after restoring rAF.
- [ ] **Step 3: Remove the temporary launch entry** and stop the preview server.
- [ ] **Step 4: Spec queue.** Set the spec's `work_state: complete`, `remaining: "Shipped: ..."`, move spec and plan to `docs/superpowers/specs/shipped/` and `docs/superpowers/plans/shipped/`, update `plan_path`, run `npm run specs:check`. Delete `tsconfig.trail-resampling.json`. Commit the docs with an explicit pathspec.
- [ ] **Step 5: Integrate.** From PowerShell: `Set-Location E:/tka-platform; npm run wt:finish -- codex/trail-resampling --route /<viewer route used in step 1>`. Then open the route on `https://localhost:5173` and repeat the throttled check once. No push.

---

## Self-review

- Spec coverage: cadence and planner (Task 1), sample source and guard (Tasks 1, 2), render loop and kill switch (Task 3), both overlays with per-slice tails and timestamps (Tasks 4, 5), fire path and polyline sweep (Task 6), LED prior sets with per-pass streak rule and whole-frame caps (Task 7), browser proof and export unchanged (Tasks 3, 8).
- Type consistency: `MotionSubSample.layers[i]` is `{ left, right }`; `MotionSampleSource.sampleAt(step, outLeft, outRight)`; `LedSampler.update(..., ledConfig, out?)`; `FireTipTracker.update(..., currentTime, motionSamples?)`; `buildSegments(leds, canvasWidth, canvasHeight, config, dt, timeDiscontinuity, firstPass, lastPass, startIndex)`.
