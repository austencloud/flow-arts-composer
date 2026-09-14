/**
 * Difficulty Calculator for MCP Server
 *
 * Calculates sequence difficulty level based on motion data.
 * Ported from the browser's SequenceDifficultyCalculator.
 *
 * Levels:
 * - Level 1: Default (0 turns, radial orientations IN/OUT only)
 * - Level 2: Has turns > 0 (but still radial orientations)
 * - Level 3: Has non-radial orientations (CLOCK/COUNTER)
 *
 * Note: CSV variations are all 0-turn variations with "in" start orientation,
 * so most sequences from the MCP will be Level 1.
 */

import type { SequenceStep } from "./sequence-builder-adapter.js";
import { calculateDifficultyLevelFromMotions } from "@tka/render-composition";
import type { TurnAllocation } from "./sequence-renderer.js";

/**
 * Calculate difficulty level from sequence steps
 *
 * @param steps Array of sequence steps
 * @returns Level 1, 2, or 3
 */
export function calculateDifficultyLevel(
  steps: SequenceStep[],
  turnAllocation?: TurnAllocation
): 1 | 2 | 3 {
  return calculateDifficultyLevelFromMotions(
    steps
      .filter((step) => step.stepNumber > 0)
      .flatMap((step) => {
        const index = step.stepNumber - 1;
        return [
          {
            ...step.leftMotion,
            turns: step.leftMotion.turns ?? turnAllocation?.left[index],
          },
          {
            ...step.rightMotion,
            turns: step.rightMotion.turns ?? turnAllocation?.right[index],
          },
        ];
      })
  );
}

/**
 * Convert numeric level to difficulty string
 */
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
