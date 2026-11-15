/**
 * The front-page stage's timing, as pure steps. A piece first waits for its
 * live version to be ready. If it is ready within the wait, the live piece
 * plays for the dwell and the stage moves on. If not, its still holds for the
 * dwell (counted from the start of the piece) and the stage moves on.
 *
 * Each phase has a budget of time left. The host spends it only while the
 * stage is running, so a pause, a hidden tab or a list not on screen keeps the
 * rest of the budget for later.
 */
export const STAGE_DWELL_MS = 9000;
export const STAGE_READY_TIMEOUT_MS = 6000;

export type StagePhase = "waiting" | "live" | "held";

export interface StageBudget {
  readonly phase: StagePhase;
  /** Milliseconds of running time left in this phase. */
  readonly left: number;
}

export function startBudget(): StageBudget {
  return { phase: "waiting", left: STAGE_READY_TIMEOUT_MS };
}

/** The live piece reported its first frame. Only counts while waiting. */
export function whenReady(budget: StageBudget): StageBudget {
  if (budget.phase !== "waiting") return budget;
  return { phase: "live", left: STAGE_DWELL_MS };
}

/**
 * The current budget ran out. Returns the next budget, or null when the stage
 * should move to the next piece.
 */
export function whenSpent(budget: StageBudget): StageBudget | null {
  if (budget.phase === "waiting") {
    return { phase: "held", left: STAGE_DWELL_MS - STAGE_READY_TIMEOUT_MS };
  }
  return null;
}

/** Running time passed. Never goes below zero. */
export function spend(budget: StageBudget, elapsed: number): StageBudget {
  return { ...budget, left: Math.max(0, budget.left - elapsed) };
}
