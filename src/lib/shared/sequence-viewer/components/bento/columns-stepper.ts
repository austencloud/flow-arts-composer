/**
 * Column-count options for the card export Columns control.
 *
 * The value null represents "Auto". Numeric values are step-column counts.
 * The render policy owns the canonical counts. This adapter keeps the desktop
 * chip group and mobile inline stepper on that same set.
 */

import { getCanonicalCardStepColumnCounts } from "#lib/shared/render/services/card-step-column-options.js";

/**
 * Valid numeric column counts for a sequence of `stepCount` steps.
 *
 * Only exact divisors of the step count are offered, so every layout fills a
 * complete rectangle with no ragged orphan row. A 16-step sequence yields
 * [2, 4, 8]; non-divisors like 3, 5, 6, 7 are hidden because they leave an
 * incomplete final row. Counts with no divisor in range (e.g. primes like 13)
 * return [] — only "Auto" makes sense, which owns the ragged-layout tradeoff.
 *
 * Range is clamped to [MIN_COLUMNS, MAX_COLUMNS]; a single tall column and a
 * single wide row are both degenerate and excluded.
 */
export function columnOptionsFor(stepCount: number): number[] {
  return getCanonicalCardStepColumnCounts(stepCount);
}

export function nextColumnValue(
  current: number | null,
  stepCount: number
): number | null {
  const opts: (number | null)[] = [null, ...columnOptionsFor(stepCount)];
  if (opts.length <= 1) return null;
  const i = opts.indexOf(current);
  if (i === -1) return null; // stale/out-of-range selection → Auto
  return opts[(i + 1) % opts.length] ?? null;
}

export function prevColumnValue(
  current: number | null,
  stepCount: number
): number | null {
  const opts: (number | null)[] = [null, ...columnOptionsFor(stepCount)];
  if (opts.length <= 1) return null;
  const i = opts.indexOf(current);
  if (i === -1) return null;
  return opts[(i - 1 + opts.length) % opts.length] ?? null;
}
