/**
 * Turn Pattern Domain Models
 *
 * Data structures for storing and applying turn patterns.
 * Turn patterns capture the turn values (rotation amounts) per beat
 * and can be saved/applied to transform sequences.
 */

import type { Timestamp } from "firebase/firestore";
import { getTurnPool, type TurnLanes } from "@tka/sequence-engine/generation";
import { clampTurnToLevel } from "#lib/shared/create/services/level-turn-values.js";

/**
 * Turn value type - can be a number (0, 0.5, 1, etc.) or "fl" for float
 */
export type TurnValue = number | "fl";

/**
 * Single entry in a turn pattern - captures turns for one beat
 */
export interface TurnPatternEntry {
  /** 0-based index into the sequence steps array */
  readonly stepIndex: number;
  /** Blue motion turn value, or null if no blue motion on this beat */
  readonly left: TurnValue | null;
  /** Red motion turn value, or null if no red motion on this beat */
  readonly right: TurnValue | null;
}

/**
 * Complete turn pattern stored in Firebase
 */
export interface TurnPattern {
  /** Firebase document ID */
  readonly id: string;
  /** User-provided name for the pattern */
  readonly name: string;
  /** Owner's user ID */
  readonly userId: string;
  /** When the pattern was created */
  readonly createdAt: Timestamp;
  /** Number of steps in this pattern (must match target sequence) */
  readonly stepCount: number;
  /** Turn values for each beat */
  readonly entries: readonly TurnPatternEntry[];
}

/**
 * Data for creating a new turn pattern (before Firebase assigns ID)
 */
export interface TurnPatternCreateData {
  readonly name: string;
  readonly userId: string;
  readonly stepCount: number;
  readonly entries: readonly TurnPatternEntry[];
}

/**
 * Type guard to check if a value is a valid TurnValue
 */
export function isTurnValue(value: unknown): value is TurnValue {
  return typeof value === "number" || value === "fl";
}

/**
 * Type guard to check if an object is a valid TurnPatternEntry
 */
export function isTurnPatternEntry(obj: unknown): obj is TurnPatternEntry {
  if (typeof obj !== "object" || obj === null) return false;
  const entry = obj as Record<string, unknown>;
  return (
    typeof entry.stepIndex === "number" &&
    (entry.left === null || isTurnValue(entry.left)) &&
    (entry.right === null || isTurnValue(entry.right))
  );
}

/**
 * Type guard to check if an object is a valid TurnPattern
 */
export function isTurnPattern(obj: unknown): obj is TurnPattern {
  if (typeof obj !== "object" || obj === null) return false;
  const pattern = obj as Record<string, unknown>;
  return (
    typeof pattern.id === "string" &&
    typeof pattern.name === "string" &&
    typeof pattern.userId === "string" &&
    typeof pattern.stepCount === "number" &&
    Array.isArray(pattern.entries) &&
    pattern.entries.every(isTurnPatternEntry)
  );
}

/**
 * Validate that a pattern can be applied to a sequence with the given beat count
 */
export function validatePatternForSequence(
  pattern: TurnPattern,
  sequenceStepCount: number
): { valid: boolean; error?: string } {
  if (pattern.stepCount !== sequenceStepCount) {
    return {
      valid: false,
      error: `Pattern has ${pattern.stepCount} steps but sequence has ${sequenceStepCount} steps`,
    };
  }
  return { valid: true };
}

/**
 * Bring a drawn turn pattern into the values a level actually offers.
 *
 * Levels differ in which turns exist at all: level 2 has whole ones, level 3
 * adds halves and floats. Dropping a level therefore has to do something with
 * the halves already on the strip, and quietly leaving them there would produce
 * a sequence that is not the level it claims to be. The per-value rules are
 * `clampTurnToLevel`'s, so the strip and the intensity stepper answer the same
 * way: a half becomes a whole turn with the tie going down, and a float becomes
 * no turn rather than being rounded into a spin nobody asked for.
 *
 * The intensity ceiling is applied on top, because it can fall at the same time
 * the level does — a level 3 pattern capped at 0.5 becomes a level 2 pattern
 * capped at 1, and a 3 drawn earlier is no longer allowed.
 */
export function clampLanesToLevel(
  lanes: TurnLanes,
  level: number,
  maxTurnIntensity: number
): { left: TurnValue[]; right: TurnValue[] } {
  const pool = getTurnPool(level, maxTurnIntensity, { allowFloat: level >= 3 });
  const ceiling = pool.reduce<number>(
    (highest, value) =>
      typeof value === "number" && value > highest ? value : highest,
    0
  );

  const clamp = (lane: readonly TurnValue[]): TurnValue[] =>
    lane.map((value) => {
      const atLevel = clampTurnToLevel(value, level);
      return atLevel === "fl" ? "fl" : Math.min(atLevel, ceiling);
    });

  return { left: clamp(lanes.left), right: clamp(lanes.right) };
}

/**
 * Format a turn value for display
 */
export function formatTurnValue(value: TurnValue | null): string {
  if (value === null) return "-";
  if (value === "fl") return "fl";
  return value.toString();
}
