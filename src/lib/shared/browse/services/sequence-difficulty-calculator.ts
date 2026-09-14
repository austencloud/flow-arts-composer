/**
 * Sequence Difficulty Calculator
 *
 * Analyzes sequence step data to determine difficulty level based on:
 * - Turn values (0, whole numbers, half values, floats)
 * - Orientation types (radial IN/OUT vs non-radial CLOCK/COUNTER)
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  analyzeDifficultyMotions,
  type DifficultyAnalysis,
  type DifficultyTrigger,
} from "@tka/render-composition";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

export type { DifficultyAnalysis, DifficultyTrigger };

export function analyzeDifficulty(steps: StepData[]): DifficultyAnalysis {
  if (!steps || steps.length === 0) {
    return { level: 1, trigger: "none" };
  }

  const visibleMotions = [];
  for (const step of steps) {
    if (!step.motions) continue;

    // Invisible placeholders (blank beats / stripped hands after the
    // 2026-07-02 both-required flip) must not contribute — a decode-path
    // placeholder carrying a non-radial last-known orientation would
    // silently inflate the difficulty badge (Wave 0 straggler fix).
    const leftRaw = step.motions[HandSide.LEFT];
    const rightRaw = step.motions[HandSide.RIGHT];
    const leftMotion = isVisibleMotion(leftRaw) ? leftRaw : undefined;
    const rightMotion = isVisibleMotion(rightRaw) ? rightRaw : undefined;

    visibleMotions.push(leftMotion, rightMotion);
  }
  return analyzeDifficultyMotions(visibleMotions);
}

export function calculateDifficultyLevel(steps: StepData[]): number {
  return analyzeDifficulty(steps).level;
}

export function levelToString(level: number): string {
  switch (level) {
    case 1:
      return "beginner";
    case 2:
      return "intermediate";
    case 3:
      return "advanced";
    default:
      return "beginner";
  }
}
