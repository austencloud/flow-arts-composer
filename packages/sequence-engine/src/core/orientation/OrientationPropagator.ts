/**
 * Orientation Propagator
 *
 * Delegates orientation calculation to the engine's own inlined calculator.
 * Retains propagation logic that chains orientations through a sequence.
 */

import {
  calculateEndOrientation as calculateEndOrientationCore,
} from "./OrientationCalculator.js";
import type {
  IOrientationPropagator,
  IOrientationCalculator,
} from "./IOrientationPropagator.js";
import type {
  SequenceStep,
  SequenceResult,
  Orientation,
} from "../types/sequence-engine-types.js";

export class OrientationCalculator implements IOrientationCalculator {
  calculateEndOrientation(
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
}

/**
 * Propagates orientations through a sequence.
 * Each step's start orientation = previous step's end orientation.
 */
export class OrientationPropagator implements IOrientationPropagator {
  constructor(private readonly calculator: IOrientationCalculator) {}

  propagateForColor(
    steps: SequenceStep[],
    hand: "left" | "right",
    initialOrientation: Orientation
  ): SequenceStep[] {
    const updatedSteps = [...steps];
    let previousEndOrientation = initialOrientation;

    for (let i = 1; i < updatedSteps.length; i++) {
      const step = updatedSteps[i];
      if (!step) continue;

      const motion = hand === "left" ? step.motions.left : step.motions.right;
      if (!motion) continue;

      const newEndOrientation = this.calculator.calculateEndOrientation(
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
        motions: {
          left: hand === "left" ? updatedMotion : step.motions.left,
          right: hand === "right" ? updatedMotion : step.motions.right,
        },
      };

      previousEndOrientation = newEndOrientation;
    }

    return updatedSteps;
  }

  recalculateAll(result: SequenceResult): SequenceResult {
    if (!result.isValid || result.steps.length === 0) {
      return result;
    }

    const startPlacement = result.steps[0];
    if (!startPlacement) {
      return result;
    }

    let updatedSteps = [...result.steps];

    const leftStartOrientation = (startPlacement.motions.left.endOrientation || "in") as Orientation;
    updatedSteps = this.propagateForColor(updatedSteps, "left", leftStartOrientation);

    const rightStartOrientation = (startPlacement.motions.right.endOrientation || "in") as Orientation;
    updatedSteps = this.propagateForColor(updatedSteps, "right", rightStartOrientation);

    return {
      ...result,
      steps: updatedSteps,
    };
  }
}
