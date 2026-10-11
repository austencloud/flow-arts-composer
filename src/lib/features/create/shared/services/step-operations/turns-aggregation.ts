/**
 * Turns Aggregation
 *
 * Collapses a set of per-hand turn values (from a multi-select batch) into a
 * single "shared value or mixed" summary used by the batch step editor. `"fl"`
 * (float) is normalized to -0.5 for comparison/min/max, matching the numeric
 * turn axis used everywhere else in the create module.
 */

import type { TurnValue } from "#lib/shared/create/domain/turn-pattern-data.js";

export interface TurnsAggregate {
  /** True when the selected steps do NOT all share the same turn value. */
  mixed: boolean;
  /** The shared value when not mixed; null when mixed. */
  value: TurnValue | null;
  /** Lowest value across the selection, normalized (fl = -0.5). */
  min: number;
  /** Highest value across the selection, normalized (fl = -0.5). */
  max: number;
}

const normalize = (t: TurnValue | undefined): number =>
  t === "fl" ? -0.5 : Number(t) || 0;

/** Render a normalized numeric turn back to its display token (fl for -0.5). */
export function formatTurn(n: number): string {
  return n === -0.5 ? "fl" : `${n}`;
}

export function aggregateTurns(
  values: Array<TurnValue | undefined>
): TurnsAggregate {
  if (values.length === 0) {
    return { mixed: false, value: null, min: 0, max: 0 };
  }

  const nums = values.map(normalize);
  let min = nums[0]!;
  let max = nums[0]!;
  for (const n of nums) {
    if (n < min) min = n;
    if (n > max) max = n;
  }

  const mixed = min !== max;
  const value: TurnValue | null = mixed ? null : min === -0.5 ? "fl" : min;
  return { mixed, value, min, max };
}
