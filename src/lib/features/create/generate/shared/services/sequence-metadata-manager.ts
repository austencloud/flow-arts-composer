/**
 * Sequence Metadata — name generation, metadata creation, and word calculation.
 */

import type { Step } from "@tka/tka-types";
import {
  DifficultyLevel,
  type GenerationOptions,
} from "../domain/models/generate-models";
import { DIFFICULTY_TO_LEVEL } from "#lib/shared/create/utils/config-mapper.js";

export function generateSequenceName(options: GenerationOptions): string {
  const timestamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const difficulty =
    options.difficulty.charAt(0).toUpperCase() + options.difficulty.slice(1);
  return `${difficulty} ${options.length}-Step (${timestamp})`;
}

export function calculateWordFromBeats(steps: Step[]): string {
  return steps
    .filter((step) => step.letter)
    .map((step) => step.letter)
    .join("");
}

export function mapDifficultyToLevel(difficulty: DifficultyLevel): number {
  // Single source of truth for difficulty<->level lives in config-mapper.ts
  // (DIFFICULTY_TO_LEVEL). This used to be a hand-maintained switch that never
  // learned about SKEWED, so a Level 4 request silently built at Level 2.
  //
  // DIFFICULTY_TO_LEVEL is keyed by the shared/foundation DifficultyLevel
  // enum; this module's DifficultyLevel is a separate, module-local enum with
  // the same string values ("beginner" | "intermediate" | "advanced" |
  // "skewed"), so the lookup is cast through Record<string, number> — safe
  // because the comparison only ever happens on the underlying string value.
  return (DIFFICULTY_TO_LEVEL as Record<string, number>)[difficulty] ?? 2;
}

export function createGenerationMetadata(options: {
  stepsGenerated: number;
  propContinuity: string;
  leftRotationDirection: string;
  rightRotationDirection: string;
  turnIntensity: number;
  level: number;
}): Record<string, unknown> {
  return {
    generated: true,
    generatedAt: new Date().toISOString(),
    algorithm: "freeform",
    stepsGenerated: options.stepsGenerated,
    propContinuity: options.propContinuity,
    leftRotationDirection: options.leftRotationDirection,
    rightRotationDirection: options.rightRotationDirection,
    turnIntensity: options.turnIntensity,
    level: options.level,
  };
}

/**
 * Drop-in replacement for the old singleton — keeps all constructor-injected
 * call-sites working without changes.
 */
export const sequenceMetadataManager = {
  generateSequenceName,
  calculateWordFromBeats,
  mapDifficultyToLevel,
  createGenerationMetadata,
};
