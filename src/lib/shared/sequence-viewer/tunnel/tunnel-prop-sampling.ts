import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import { interpolatePropAngles } from "#lib/shared/animation-engine/services/prop-interpolator.js";
import { stepToIndexProgress } from "./tunnel-fold-math";

const DEFAULT_PROP_STATE: PropState = {
  centerPathAngle: 0,
  staffRotationAngle: 0,
};

/**
 * Resolve the cell that is being performed by one tunnel layer.
 *
 * This is the index counterpart to {@link sampleTunnelProps}: the canvas and
 * the choreography card must wrap speed and stagger in exactly the same way or
 * the border can point at a plausible-looking but incorrect pictograph.
 */
function tunnelStepFrameAt(
  length: number,
  currentStep: number,
  offset = 0,
  speed = 1
): { idx: number; progress: number } | null {
  if (length <= 0) return null;

  let effectiveStep = currentStep;
  if (speed !== 1 || offset !== 0) {
    let beat = (currentStep - 1) * speed + offset;
    beat = ((beat % length) + length) % length;
    effectiveStep = beat + 1;
  } else if (currentStep - 1 >= length) {
    effectiveStep = ((currentStep - 1) % length) + 1;
  }

  return stepToIndexProgress(effectiveStep, length);
}

export function tunnelStepIndexAt(
  length: number,
  currentStep: number,
  offset = 0,
  speed = 1
): number | null {
  return tunnelStepFrameAt(length, currentStep, offset, speed)?.idx ?? null;
}

/**
 * Sample one sequence's left+right prop states at the shared tunnel playhead.
 * `currentStep` is 1-indexed fractional (the start position is < 1). `ease`
 * optionally reshapes the within-step progress — the live controller passes the
 * global Effort easing so every kaleidoscope copy honors the sidebar's Effort
 * preset in lockstep; the judging gallery passes none (linear).
 *
 * `offset` (steps) and `speed` (rate) are the per-copy Stagger + Speed
 * modulators: the effective beat is `(beat × speed) + offset`, wrapped into the
 * sequence so a staggered/faster arm shows a different moment. Defaults (0, 1)
 * leave the playhead untouched — identical to a plain sample.
 *
 * Shared by {@link TunnelViewController} (live kaleidoscope) and the
 * `/test/tunnel-looks` gallery so both derive props identically.
 */
export function sampleTunnelProps(
  seq: SequenceData,
  currentStep: number,
  ease?: (progress: number) => number,
  offset = 0,
  speed = 1
): { left: PropState; right: PropState } {
  const steps = seq.steps ?? [];
  const length = steps.length;
  if (length === 0) {
    return {
      left: { ...DEFAULT_PROP_STATE },
      right: { ...DEFAULT_PROP_STATE },
    };
  }
  const { idx, progress } = tunnelStepFrameAt(
    length,
    currentStep,
    offset,
    speed
  ) ?? { idx: 0, progress: 0 };
  const step = steps[idx];
  if (!step)
    return {
      left: { ...DEFAULT_PROP_STATE },
      right: { ...DEFAULT_PROP_STATE },
    };
  const eased = ease ? ease(progress) : progress;
  const r = interpolatePropAngles(step, eased);
  return {
    left: r.isValid
      ? (r.leftAngles ?? { ...DEFAULT_PROP_STATE })
      : { ...DEFAULT_PROP_STATE },
    right: r.isValid
      ? (r.rightAngles ?? { ...DEFAULT_PROP_STATE })
      : { ...DEFAULT_PROP_STATE },
  };
}
