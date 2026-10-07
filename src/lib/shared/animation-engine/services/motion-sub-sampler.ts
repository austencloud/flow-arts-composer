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
    if (
      !input.source.sampleAt(input.currentStep, this.guardLeft, this.guardRight)
    ) {
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
    const layerCount =
      input.layersAt && input.liveLayers ? input.layerCount : 0;
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
