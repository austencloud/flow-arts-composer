/**
 * The page's one clock, read by every player on a screen so they stay in
 * step. The player's step scale puts step k (0-based) between k + 1 and
 * k + 2, so a player shows step k at fraction f with externalStep k + 1 + f.
 *
 * Reduced motion keeps the walk but drops the moves: each step's end pose
 * holds, then the next one appears.
 */

/** One step's move, at the pace of the app's 60 BPM examples. */
export const MOVE_MS = 1100;
/** A pause on the step's start pose, so a jump to the next pair reads. */
export const HOLD_START_MS = 350;
/** A pause on the step's end pose. */
export const HOLD_END_MS = 750;
/** Reduced motion: how long each end pose holds. */
export const STILL_HOLD_MS = 1800;

export interface WalkPosition {
  /** Which step of the walk is showing, 0-based. */
  readonly index: number;
  /** How far through that step, 0 to 1. */
  readonly frac: number;
  /** True while the props move. */
  readonly moving: boolean;
}

/**
 * Walk through `count` steps on repeat: hold the start, move, hold the end,
 * then the next step.
 */
export function walk(elapsed: number, count: number, still: boolean): WalkPosition {
  const span = still ? STILL_HOLD_MS : HOLD_START_MS + MOVE_MS + HOLD_END_MS;
  const t = Math.max(0, elapsed);
  const index = Math.floor(t / span) % Math.max(1, count);
  if (still) return { index, frac: 1, moving: false };
  const local = t % span;
  const frac = Math.min(1, Math.max(0, (local - HOLD_START_MS) / MOVE_MS));
  return { index, frac, moving: local >= HOLD_START_MS && local < HOLD_START_MS + MOVE_MS };
}

/** Screen 1: one LOOP played through, then a rest on its start. */
export const THROUGH_START_MS = 500;
export const THROUGH_END_MS = 1800;

export interface ThroughPosition {
  /** The player's externalStep. */
  readonly step: number;
  /** How much of the LOOP has played, 0 to 1. */
  readonly progress: number;
  readonly moving: boolean;
  /** True during the rest after it lands back on its start. */
  readonly landed: boolean;
}

export function through(elapsed: number, count: number, still: boolean): ThroughPosition {
  const per = still ? STILL_HOLD_MS : MOVE_MS;
  const playing = count * per;
  const total = THROUGH_START_MS + playing + THROUGH_END_MS;
  const t = Math.max(0, elapsed) % total;
  if (t < THROUGH_START_MS) {
    return { step: 0, progress: 0, moving: false, landed: false };
  }
  const into = t - THROUGH_START_MS;
  if (into >= playing) {
    // Just short of the end, so the engine stays on the last step's end pose.
    return { step: count + 1 - 1e-4, progress: 1, moving: false, landed: true };
  }
  if (still) {
    const done = Math.floor(into / per) + 1;
    return {
      step: done + 1 - 1e-4,
      progress: done / count,
      moving: false,
      landed: false,
    };
  }
  const played = into / per;
  return { step: 1 + played, progress: played / count, moving: true, landed: false };
}

/**
 * The player's externalStep for step `index` (0-based) at `frac`. A whole
 * number would already be the next step's start, which for a Rewound twin is
 * a different pose, so the end stops just short.
 */
export function stepAt(index: number, frac: number): number {
  return index + 1 + Math.min(frac, 0.9999);
}
