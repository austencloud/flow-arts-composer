/**
 * The page's one clock, read by both players so they stay in step. The
 * player's step scale puts step k (0-based) between k + 1 and k + 2, so a
 * player shows step k at fraction f with externalStep k + 1 + f.
 *
 * A play is one pass of the step: rest on the start pose, move, rest on the
 * end pose. Reduced motion drops the move: the start pose holds, then the end
 * pose holds.
 */

/** One step's move, at the pace of the app's 60 BPM examples. */
export const MOVE_MS = 1100;
/** The rest on the start pose. The right player changes type here. */
export const HOLD_START_MS = 350;
/** The rest on the end pose. */
export const HOLD_END_MS = 750;
/** Reduced motion: how long each pose holds. */
export const STILL_HOLD_MS = 1800;

export interface PlayPosition {
  /** How many plays have finished since the clock started. */
  readonly index: number;
  /** How far through the move, 0 to 1. */
  readonly frac: number;
  /** True while the props move. */
  readonly moving: boolean;
}

/** Where the clock is `elapsed` ms after it started. */
export function playAt(elapsed: number, still: boolean): PlayPosition {
  const t = Math.max(0, elapsed);
  if (still) {
    const span = 2 * STILL_HOLD_MS;
    const local = t % span;
    return {
      index: Math.floor(t / span),
      frac: local < STILL_HOLD_MS ? 0 : 1,
      moving: false,
    };
  }
  const span = HOLD_START_MS + MOVE_MS + HOLD_END_MS;
  const local = t % span;
  return {
    index: Math.floor(t / span),
    frac: Math.min(1, Math.max(0, (local - HOLD_START_MS) / MOVE_MS)),
    moving: local >= HOLD_START_MS && local < HOLD_START_MS + MOVE_MS,
  };
}

/**
 * The player's externalStep for step `index` (0-based) at `frac`. A whole
 * number would already be the next step's start, which for a Rewound twin is
 * a different pose, so the end stops just short.
 */
export function stepAt(index: number, frac: number): number {
  return index + 1 + Math.min(frac, 0.9999);
}
