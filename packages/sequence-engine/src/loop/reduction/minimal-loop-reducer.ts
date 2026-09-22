/**
 * Minimal-Loop Reducer
 *
 * Collapses a sequence that is a LITERAL repeat of a shorter, already-closing
 * loop down to that shortest closing loop.
 *
 * ## Why this exists
 *
 * The strict quartered LOOP executors (mirrored / flipped / swapped / inverted)
 * build `period` passes unconditionally. A pass beyond the natural period-2
 * close is only meaningful when orientation DRIFTS between passes (half-turn
 * seeds, per-hand turn total ≡ 1 or 3 mod 4). For a zero-turn seed the loop
 * already closes in location AND orientation at period 2, so the extra passes
 * come out byte-for-byte identical — a redundant literal repeat.
 *
 * Concrete failure this fixes (2026-07-10): a `YΦΔYΦΔYΦΔYΦΔ` (12-step) deck
 * card that is a 6-step mirrored loop (`YΦΔ` seed → vertical mirror) copied a
 * second time. The 6-step loop already closes; the outer doubling is noise.
 * Canonical smallest form of a repeating word is its shortest form
 * (`simplified-word-display` rule) — the same principle at the STEP level.
 *
 * ## What it collapses (and what it must NOT)
 *
 * Collapse ONLY a LITERAL repeat: the second (and any later) pass is identical
 * to the first in every motion field INCLUDING orientation. That guarantee is
 * what makes the shorter prefix a valid seamless loop on its own.
 *
 *   - Mirrored / rotated / swapped loops whose halves are TRANSFORMS of each
 *     other (not copies) do NOT collapse — the halves differ in location, so
 *     `motionEquivalent` returns false. The transform is preserved.
 *   - Orientation-cycle loops (genuine multi-pass, where the repeat carries a
 *     DIFFERENT start orientation each pass) do NOT collapse — the orientation
 *     fields differ, so the passes are not literal copies. Preserved.
 *
 * The reducer therefore only ever removes truly redundant content and never
 * changes what a sequence actually does.
 */

import type { Step } from "../../core/types/sequence-engine-types.js";

export interface MinimalLoopResult {
  /** The reduced steps (start-placement step at index 0, then the minimal loop). */
  steps: Step[];
  /** Original letter-step count. */
  originalLength: number;
  /** Reduced letter-step count. Equals originalLength when nothing collapsed. */
  reducedLength: number;
  /** True when a literal repeat was collapsed. */
  reduced: boolean;
}

export interface MinimalLoopOptions {
  /**
   * Smallest complete loop that may be emitted. Extension callers use this to
   * retain the authored seed and its first derived pass when a later pass is a
   * literal copy.
   */
  readonly minimumLetterSteps?: number;
  /** Number of authored leading letter steps whose IDs and numbering stay intact. */
  readonly preservePrefixSteps?: number;
}

/**
 * Reduce a sequence to its shortest literally-repeating closing loop.
 *
 * @param steps Full step array; index 0 is the start-placement step
 *   (`stepNumber === 0`), the rest are letter steps.
 * @returns The reduced steps and a report. Idempotent — a sequence that is
 *   already minimal is returned unchanged (a new array, same content).
 */
export function reduceToMinimalLoop(
  steps: readonly Step[],
  options: MinimalLoopOptions = {}
): MinimalLoopResult {
  const startStep = steps.find((s) => s.stepNumber === 0) ?? null;
  const letterSteps = steps.filter((s) => s.stepNumber > 0);
  const n = letterSteps.length;

  const unchanged = (): MinimalLoopResult => ({
    steps: [...steps],
    originalLength: n,
    reducedLength: n,
    reduced: false,
  });

  // Need at least 2 letter steps and a real divisor to have anything to fold.
  if (n < 2) return unchanged();

  // Smallest proper divisor first → the SHORTEST repeating unit wins.
  const minimumLetterSteps = options.minimumLetterSteps ?? 1;
  for (const period of properDivisors(n)) {
    if (period < minimumLetterSteps) continue;
    if (!isLiteralRepeat(letterSteps, period)) continue;
    if (!prefixClosesSeamlessly(letterSteps, period)) continue;

    const reducedLetters = renumber(
      letterSteps.slice(0, period),
      options.preservePrefixSteps ?? 0
    );
    const outSteps = startStep
      ? [startStep, ...reducedLetters]
      : reducedLetters;
    return {
      steps: outSteps,
      originalLength: n,
      reducedLength: period,
      reduced: true,
    };
  }

  return unchanged();
}

/** Proper divisors of n in ascending order (1..n/2 that divide n). */
function properDivisors(n: number): number[] {
  const out: number[] = [];
  for (let d = 1; d * 2 <= n; d++) {
    if (n % d === 0) out.push(d);
  }
  return out;
}

/**
 * True when `steps` is `period`-periodic in every semantic field. IDs,
 * letters, and step numbers are intentionally omitted: IDs are regenerated
 * bookkeeping and a caller may enrich derived letters after completion.
 */
function isLiteralRepeat(steps: readonly Step[], period: number): boolean {
  for (let i = period; i < steps.length; i++) {
    if (!stepMotionsEqual(steps[i]!, steps[i - period]!)) return false;
  }
  return true;
}

/**
 * True when the first `period` steps form a seamless loop on their own:
 * the loop returns to its start LOCATION and start ORIENTATION after `period`
 * steps. (For a literal repeat this is implied, but we verify rather than
 * assume — a sequence could be periodic without the whole thing being a valid
 * seamless loop, and we must never emit a broken shorter loop.)
 */
function prefixClosesSeamlessly(
  steps: readonly Step[],
  period: number
): boolean {
  const first = steps[0]!;
  const last = steps[period - 1]!;

  if (first.startPlacement == null || last.endPlacement == null) return false;
  if (first.startPlacement !== last.endPlacement) return false;

  for (const hand of ["left", "right"] as const) {
    const startOri = first.motions[hand]?.startOrientation;
    const endOri = last.motions[hand]?.endOrientation;
    if (startOri == null || endOri == null) return false;
    if (startOri !== endOri) return false;
  }
  return true;
}

/** Per-hand motion equality across the fields that define a step's identity. */
function stepMotionsEqual(a: Step, b: Step): boolean {
  return semanticValue(a) === semanticValue(b);
}

function semanticValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(semanticValue).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .filter((key) => key !== "id" && key !== "letter" && key !== "stepNumber")
      .sort()
      .map((key) => {
        const record = value as Record<string, unknown>;
        return `${JSON.stringify(key)}:${semanticValue(record[key])}`;
      })
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Re-emit steps with contiguous 1-based stepNumbers and stable ids. */
function renumber(
  letterSteps: readonly Step[],
  preservePrefixSteps: number
): Step[] {
  return letterSteps.map((s, i) => ({
    ...s,
    ...(i < preservePrefixSteps
      ? {}
      : { stepNumber: i + 1, id: `step-${i + 1}` }),
  }));
}
