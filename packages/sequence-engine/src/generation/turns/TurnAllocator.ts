/**
 * Turn Allocator
 *
 * Allocates turn values for each step in a sequence based on level and max intensity.
 *
 * Logic:
 * - Level 1: Only 0 turns allowed
 * - Level 2: 0, 1, 2, 3 (whole numbers)
 * - Level 3: 0, 0.5, 1, 1.5, 2, 2.5, 3, "fl" (all values including float)
 *
 * For each step, left and right get independently randomized turn values
 * filtered by the maxTurnIntensity cap, unless `matchHands` asks for one roll
 * shared by both hands.
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

/**
 * Every turn value a step is allowed to take at this level, once the request's
 * own intensity cap is applied.
 *
 * This is the single answer to "what turns may this sequence use", so anything
 * that rewrites a turn after allocation — layer targeting, for one — asks here
 * rather than deciding for itself. Writing a half turn into a level 2 sequence
 * because it happened to be under the cap is exactly the mistake this prevents.
 */
export function getTurnPool(
  level: number,
  maxTurnIntensity?: number,
  options?: { allowFloat?: boolean }
): (number | "fl")[] {
  const effectiveMax = maxTurnIntensity ?? (level >= 2 ? 3 : 0);
  const pool = getPossibleTurnsForLevel(level).filter((t) => {
    if (t === "fl") return options?.allowFloat !== false;
    return typeof t === "number" && t <= effectiveMax;
  });
  return pool.length > 0 ? pool : [0];
}

function randomChoice<T>(array: T[], random: () => number): T {
  if (array.length === 0) {
    throw new Error("Cannot choose from empty array");
  }
  return array[Math.floor(random() * array.length) % array.length]!;
}

export interface TurnAllocationOptions {
  /** Injectable entropy for deterministic generators and tests. */
  random?: () => number;

  /** Use this exact numeric turn value on every step for both hands. */
  requiredTurns?: number;

  /**
   * Whether the level-3 float marker may be allocated. Set false when a hard
   * pro/anti motion requirement is active because post-processing turns `fl`
   * into the distinct float motion type.
   */
  allowFloat?: boolean;

  /**
   * When true, require an odd wheel-quarter total per hand so the orientation
   * pattern itself takes four repetitions instead of closing after two.
   * Requires L3+ so half-turn (0.5) values are available. The final step in
   * each hand's allocation is selected to hit the target parity; earlier
   * steps remain random.
   *
   * This shapes the requested pattern. Final closure is calculated after LOOP
   * execution by the orientation-cycle module.
   */
  forcePeriod4OrientationCycle?: boolean;

  /**
   * Roll one lane and give both hands the same value on every step, float
   * included. The Generate "Match turns" toggle: a mirrored or unison pair of
   * hands reads as one figure only when their turn counts agree.
   */
  matchHands?: boolean;
}

/**
 * 1 turn = 180° = 2 wheel-quarters. 0.5 turn = 90° = 1 wheel-quarter.
 * "fl" is a float (special motion state), which contributes 0 wheel-quarters.
 */
function wheelQuarters(turn: number | "fl"): number {
  if (turn === "fl") return 0;
  return Math.round(turn * 2) % 4;
}

/**
 * Allocate turns for a sequence.
 * @param stepCount - Number of steps (excluding start position)
 * @param level - Difficulty level (1-3)
 * @param maxTurnIntensity - Maximum turn intensity allowed (0-3, or undefined for level default)
 * @param options - Optional allocation constraints (e.g. period-4 parity)
 * @returns Turn allocations for left and right props per step
 */
export function allocateTurns(
  stepCount: number,
  level: number,
  maxTurnIntensity?: number,
  options?: TurnAllocationOptions
): TurnAllocation {
  const effectiveMax = maxTurnIntensity ?? (level >= 2 ? 3 : 0);
  const turnsPool = getTurnPool(level, maxTurnIntensity, {
    allowFloat: options?.allowFloat !== false,
  });
  const requiredTurns = options?.requiredTurns;
  const random = options?.random ?? Math.random;

  if (requiredTurns !== undefined) {
    if (!turnsPool.includes(requiredTurns)) {
      throw new Error(
        `Required turn value ${requiredTurns} is unavailable at level ${level} ` +
          `with maximum turn intensity ${effectiveMax}`
      );
    }
    return {
      left: Array(stepCount).fill(requiredTurns),
      right: Array(stepCount).fill(requiredTurns),
    };
  }

  const turnsLeft = allocateSingleHand(stepCount, turnsPool, random, options);
  const turnsRight = options?.matchHands
    ? [...turnsLeft]
    : allocateSingleHand(stepCount, turnsPool, random, options);

  // A short LOOP repeats a tiny seed. If both hands roll only zeros, selecting
  // Level 2 appears to do nothing across the entire generated sequence.
  // Keep explicit zero requests above, but give a random figure an actual turn.
  if (
    stepCount > 0 &&
    [...turnsLeft, ...turnsRight].every((turn) => turn === 0)
  ) {
    const positiveTurns = turnsPool.filter(
      (turn): turn is number => typeof turn === "number" && turn > 0
    );
    if (positiveTurns.length > 0) {
      const index = Math.floor(random() * stepCount) % stepCount;
      const turn = randomChoice(positiveTurns, random);
      if (options?.matchHands) {
        turnsLeft[index] = turn;
        turnsRight[index] = turn;
      } else {
        const hand = randomChoice([turnsLeft, turnsRight], random);
        hand[index] = turn;
      }
    }
  }

  return {
    left: turnsLeft,
    right: turnsRight,
  };
}

function allocateSingleHand(
  stepCount: number,
  turnsPool: (number | "fl")[],
  random: () => number,
  options?: TurnAllocationOptions
): (number | "fl")[] {
  const result: (number | "fl")[] = [];

  const forceFourRepetitions = options?.forcePeriod4OrientationCycle === true;

  // Period-4 parity requires at least one half-integer option in the pool
  // (otherwise totals can only be ≡ 0 or 2 mod 4). If we can't satisfy it,
  // fall back to pure random — the executor viability gate should have
  // prevented this path, but we don't crash the generator either way.
  const halfTurnOptions = turnsPool.filter(
    (t) => t !== "fl" && typeof t === "number" && (t * 2) % 2 !== 0
  );
  const wholeTurnOptions = turnsPool.filter(
    (t) => t !== "fl" && typeof t === "number" && (t * 2) % 2 === 0
  );
  const canEnforce =
    forceFourRepetitions &&
    halfTurnOptions.length > 0 &&
    wholeTurnOptions.length > 0;

  const stepsToPreallocate = canEnforce ? stepCount - 1 : stepCount;

  for (let i = 0; i < stepsToPreallocate; i++) {
    result.push(randomChoice(turnsPool, random));
  }

  if (!canEnforce) {
    return result;
  }

  // Compute the running total mod 4 and pick the final step to hit odd parity.
  let runningTotal = 0;
  for (const t of result) {
    runningTotal = (runningTotal + wheelQuarters(t)) % 4;
  }

  // Target the final step's wheel-quarter contribution so total ≡ 1 (mod 4).
  // (1 and 3 are both odd; pick 1 as canonical.)
  const targetContribution = (1 - runningTotal + 4) % 4;

  const matching = turnsPool.filter(
    (t) => t !== "fl" && wheelQuarters(t) === targetContribution
  );

  if (matching.length > 0) {
    result.push(randomChoice(matching, random));
  } else {
    // Shouldn't happen given canEnforce, but guard defensively.
    result.push(randomChoice(turnsPool, random));
  }

  return result;
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
