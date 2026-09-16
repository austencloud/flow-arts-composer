/**
 * Orientation Propagation for MCP Server
 *
 * Thin wrapper around the shared OrientationPropagator implementation.
 * Maintains backward compatibility with existing MCP code.
 */

import { calculateEndOrientation as mcpCalculateEndOrientation, Orientation as McpOrientation } from "./orientation-calculator.js";
import type { SequenceStep, SequenceResult } from "./sequence-builder-adapter.js";
import type { HandSide } from "@tka/tka-types";

/**
 * Propagate orientations for one performer hand through all steps.
 * Each step's start orientation = previous step's end orientation.
 *
 * @param steps - The sequence steps (including start placement at index 0)
 * @param hand - Which performer hand to propagate
 * @param initialOrientation - The starting orientation (from step 0's end orientation)
 * @returns Updated steps with correct orientations
 */
export function propagateOrientationsForHand(
  steps: SequenceStep[],
  hand: HandSide,
  initialOrientation: McpOrientation
): SequenceStep[] {
  const updatedSteps = [...steps];
  let previousEndOrientation = initialOrientation;

  // Start from step 1 (skip the start placement at step 0)
  for (let i = 1; i < updatedSteps.length; i++) {
    const step = updatedSteps[i];
    if (!step) continue;

    const motion = hand === "left" ? step.leftMotion : step.rightMotion;
    if (!motion) continue;

    // Calculate new end orientation based on this step's motion
    const newEndOrientation = mcpCalculateEndOrientation({
      motionType: motion.motionType,
      turns: 0, // CSV variations are all 0 turns
      rotationDirection: motion.rotationDirection || "cw",
      startLocation: motion.startLocation,
      endLocation: motion.endLocation,
      startOrientation: previousEndOrientation,
    });

    // Update this step with correct orientations
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

/**
 * Recalculate all prop orientations through the entire sequence.
 * Uses the start placement (step 0) orientations as the baseline.
 *
 * @param result - The sequence result to fix orientations on
 * @returns Updated sequence result with corrected orientations
 */
export function recalculateAllOrientations(result: SequenceResult): SequenceResult {
  if (!result.isValid || result.steps.length === 0) {
    return result;
  }

  // Get the start placement (step 0)
  const startPlacement = result.steps[0];
  if (!startPlacement) {
    return result;
  }

  let updatedSteps = [...result.steps];

  // Recalculate orientations for the left prop.
  // Start with the end orientation of the start placement
  const leftStartOrientation = (startPlacement.leftMotion.endOrientation || "in") as McpOrientation;
  updatedSteps = propagateOrientationsForHand(updatedSteps, "left", leftStartOrientation);

  // Recalculate orientations for the right prop.
  const rightStartOrientation = (startPlacement.rightMotion.endOrientation || "in") as McpOrientation;
  updatedSteps = propagateOrientationsForHand(updatedSteps, "right", rightStartOrientation);

  return {
    ...result,
    steps: updatedSteps,
  };
}

/**
 * Recalculate orientations with explicit overrides for the start placement.
 * Updates step 0's orientations and re-propagates through the entire sequence.
 */
export function recalculateOrientationsWithOverrides(
  steps: SequenceStep[],
  leftStartOrientation?: string,
  rightStartOrientation?: string,
): SequenceStep[] {
  if (steps.length === 0) return steps;

  let updatedSteps = [...steps];
  const sp = updatedSteps[0];
  if (!sp) return updatedSteps;

  // Override step 0 (start placement) orientations
  if (leftStartOrientation) {
    const leftOri = leftStartOrientation as McpOrientation;
    updatedSteps[0] = {
      ...sp,
      leftMotion: { ...sp.leftMotion, startOrientation: leftOri, endOrientation: leftOri },
    };
  }
  if (rightStartOrientation) {
    const updatedSp = updatedSteps[0]!;
    updatedSteps[0] = {
      ...updatedSp,
      rightMotion: { ...updatedSp.rightMotion, startOrientation: rightStartOrientation as McpOrientation, endOrientation: rightStartOrientation as McpOrientation },
    };
  }

  // Re-propagate from the (possibly overridden) step 0
  const finalSp = updatedSteps[0]!;
  const leftOri = (finalSp.leftMotion.endOrientation || "in") as McpOrientation;
  updatedSteps = propagateOrientationsForHand(updatedSteps, "left", leftOri);

  const rightOri = (finalSp.rightMotion.endOrientation || "in") as McpOrientation;
  updatedSteps = propagateOrientationsForHand(updatedSteps, "right", rightOri);

  return updatedSteps;
}

// Re-export the shared calculator for direct use
export { calculateEndOrientation } from "./orientation-calculator.js";
