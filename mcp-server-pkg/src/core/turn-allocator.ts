/**
 * Turn Allocator for MCP Server
 *
 * Allocates turn values for each step in a sequence based on level and max intensity.
 * Ported from: src/lib/features/create/generate/shared/services/implementations/LOOPParameterProvider.ts
 *
 * Logic:
 * - Level 1: Only 0 turns allowed
 * - Level 2: 0, 1, 2, 3 (whole numbers)
 * - Level 3: 0, 0.5, 1, 1.5, 2, 2.5, 3, "fl" (all values including float)
 *
 * For each step, left and right get independently randomized turn values
 * filtered by the maxTurnIntensity.
 */

export interface TurnAllocation {
  left: (number | "fl")[];
  right: (number | "fl")[];
}

function getPossibleTurnsForLevel(level: number): (number | "fl")[] {
  switch (level) {
    case 1:
      return [0];
    case 2:
      return [0, 1, 2, 3];
    case 3:
      return [0, 0.5, 1, 1.5, 2, 2.5, 3, "fl"];
    default:
      return [0];
  }
}

function randomChoice<T>(array: T[]): T {
  if (array.length === 0) {
    throw new Error("Cannot choose from empty array");
  }
  return array[Math.floor(Math.random() * array.length)]!;
}

/**
 * Allocate turns for a sequence
 * @param stepCount - Number of steps (excluding start placement)
 * @param level - Difficulty level (1-3)
 * @param maxTurnIntensity - Maximum turn intensity allowed (0-3, or undefined for level default)
 * @returns Turn allocations for left and right props per step
 */
export function allocateTurns(
  stepCount: number,
  level: number,
  maxTurnIntensity?: number
): TurnAllocation {
  const possibleTurns = getPossibleTurnsForLevel(level);

  // Default max intensity based on level
  const effectiveMax = maxTurnIntensity ?? (level >= 2 ? 3 : 0);

  // Filter possible turns by max intensity
  // "fl" always passes the filter (it's a special case)
  const validTurns = possibleTurns.filter((t) => {
    if (t === "fl") return true;
    return typeof t === "number" && t <= effectiveMax;
  });

  // If filtering removed everything except possibly "fl", ensure we have at least 0
  const turnsPool = validTurns.length > 0 ? validTurns : [0];

  const turnsLeft: (number | "fl")[] = [];
  const turnsRight: (number | "fl")[] = [];

  for (let i = 0; i < stepCount; i++) {
    turnsLeft.push(randomChoice(turnsPool));
    turnsRight.push(randomChoice(turnsPool));
  }

  return {
    left: turnsLeft,
    right: turnsRight,
  };
}

export function getDefaultMaxTurnIntensity(level: number): number {
  switch (level) {
    case 1:
      return 0;
    case 2:
    case 3:
      return 3;
    default:
      return 0;
  }
}
