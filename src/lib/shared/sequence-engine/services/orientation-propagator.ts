/**
 * Orientation Propagator
 *
 * Delegates orientation calculation to render/core/calculations/orientation.ts
 * (the single source of truth). Chains orientations through a sequence.
 */

import {
  calculateEndOrientation as calculateEndOrientationCore,
} from "../../render/core/calculations/orientation";
import type {
  SequenceStep,
  SequenceResult,
  Orientation,
} from "../domain/models/sequence-engine-types";

export function calculateEndOrientation(
  motionType: string,
  turns: number | "fl",
  rotationDirection: string,
  startLocation: string,
  endLocation: string,
  startOrientation: Orientation
): Orientation {
  return calculateEndOrientationCore({
    motionType,
    turns,
    rotationDirection,
    startLocation,
    endLocation,
    startOrientation,
  });
}

export function propagateForHand(
  steps: SequenceStep[],
  hand: "left" | "right",
  initialOrientation: Orientation
): SequenceStep[] {
  const updatedSteps = [...steps];
  let previousEndOrientation = initialOrientation;

  for (let i = 1; i < updatedSteps.length; i++) {
    const step = updatedSteps[i];
    if (!step) continue;

    const motion = hand === "left" ? step.leftMotion : step.rightMotion;
    if (!motion) continue;

    const newEndOrientation = calculateEndOrientation(
      motion.motionType,
      motion.turns ?? 0,
      motion.rotationDirection || "cw",
      motion.startLocation,
      motion.endLocation,
      previousEndOrientation
    );

    const updatedMotion = {
      ...motion,
      startOrientation: previousEndOrientation,
      endOrientation: newEndOrientation,
    };

    updatedSteps[i] = {
      ...step,
      leftMotion: hand === "left" ? updatedMotion : step.leftMotion,
      rightMotion: hand === "right" ? updatedMotion : step.rightMotion,
    };

    previousEndOrientation = newEndOrientation;
  }

  return updatedSteps;
}

export function recalculateAll(result: SequenceResult): SequenceResult {
  if (!result.isValid || result.steps.length === 0) {
    return result;
  }

  const startPlacement = result.steps[0];
  if (!startPlacement) {
    return result;
  }

  let updatedSteps = [...result.steps];

  const leftStartOrientation = (startPlacement.leftMotion.endOrientation || "in") as Orientation;
  updatedSteps = propagateForHand(updatedSteps, "left", leftStartOrientation);

  const rightStartOrientation = (startPlacement.rightMotion.endOrientation || "in") as Orientation;
  updatedSteps = propagateForHand(updatedSteps, "right", rightStartOrientation);

  return {
    ...result,
    steps: updatedSteps,
  };
}
