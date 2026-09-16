/**
 * Overlay inversion — applies INVERTED in place over a completed sequence.
 *
 * Partition the letter steps into `period` equal blocks; on odd blocks flip
 * motionType pro<->anti and rotationDirection cw<->ccw. Dash and static
 * motions keep their motionType, but any active prop rotation still flips.
 * Hand locations are never touched, so placements and closure are preserved.
 * The orientation chain is recomputed forward from the start placement.
 * Letters are NOT re-derived here — callers (SequenceBuilder) own letter
 * lookup, per the canonical law in
 * docs/superpowers/plans/2026-07-12-compositional-loop-p1-p2.md.
 *
 * Verified semantics: variant E, 2026-07-12 spec.
 */
import type {
  SequenceStep,
  MotionData,
} from "../../core/types/sequence-engine-types.js";
import { updateStepOrientations } from "./orientation-helpers.js";

function invertType(motionType: string): string {
  if (motionType === "pro") return "anti";
  if (motionType === "anti") return "pro";
  return motionType;
}

function flipRot(rotationDirection: string): string {
  if (rotationDirection === "cw") return "ccw";
  if (rotationDirection === "ccw") return "cw";
  return rotationDirection;
}

function invertMotion(motion: MotionData): MotionData {
  return {
    ...motion,
    motionType: invertType(motion.motionType) as MotionData["motionType"],
    rotationDirection: flipRot(
      motion.rotationDirection
    ) as MotionData["rotationDirection"],
    ...(motion.prefloatMotionType !== undefined && {
      prefloatMotionType: invertType(
        motion.prefloatMotionType
      ) as MotionData["motionType"],
    }),
    ...(motion.prefloatRotationDirection !== undefined && {
      prefloatRotationDirection: flipRot(
        motion.prefloatRotationDirection
      ) as MotionData["rotationDirection"],
    }),
  };
}

export function applyOverlayInversion(
  sequence: SequenceStep[],
  period: number
): SequenceStep[] {
  const letterCount = sequence.length - 1; // index 0 = start placement
  if (letterCount <= 0) return sequence;
  if (letterCount % period !== 0) {
    throw new Error(
      `Overlay inversion requires the step count (${letterCount}) to be divisible by the period (${period}).`
    );
  }
  const blockSize = letterCount / period;

  const out: SequenceStep[] = sequence.map((s, i) => {
    if (i === 0) return s;
    const blockIdx = Math.floor((i - 1) / blockSize);
    if (blockIdx % 2 !== 1) return s;
    return {
      ...s,
      motions: {
        left: invertMotion(s.motions.left),
        right: invertMotion(s.motions.right),
      },
    };
  });

  for (let i = 1; i < out.length; i++) {
    out[i] = updateStepOrientations(out[i]!, out[i - 1]!);
  }
  return out;
}
