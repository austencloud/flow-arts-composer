import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

/**
 * The repeat that a LOOP being built will add, shown under the steps before it
 * is made. It holds one waiting place per step, then the real repeat drawn
 * faintly once the steps can close. None of it is part of the sequence.
 */
export interface PendingRepeat {
  /** The steps built so far, which is also how many the waiting row holds. */
  readonly count: number;
  /** The repeat's own steps once they are known, else null. */
  readonly steps: readonly StepData[] | null;
  /** Whether the steps can close now. */
  readonly ready: boolean;
  readonly color: string;
  readonly ink: string;
  readonly icon: string;
  readonly label: string;
  /** How many times it repeats: three for a LOOP made of quarters, else one. */
  readonly times: number;
}

/** What the LOOP tab asks the workspace's step grid to show beside the steps. */
export interface LoopGoalDisplay {
  /** The waiting repeat, or null before the first step and once it is made. */
  readonly pending: PendingRepeat | null;
  /** Steps in one repetition of the made LOOP, so each starts its own row. */
  readonly partLength: number | null;
}
