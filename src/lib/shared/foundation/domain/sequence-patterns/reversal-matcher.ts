/**
 * Reversal Pattern Matcher
 *
 * Given a sequence's per-beat `leftReversal`/`rightReversal` flags, compute
 * a signature string using P/R/B/- symbols, then match it against the
 * known reversal patterns in `reversal-patterns.ts`.
 *
 * Signature symbols (per beat):
 *   P - both hands reversed
 *   R - right hand reversed (canonical red display), left continuous
 *   B - left hand reversed (canonical blue display), right continuous
 *   - - neither reversed
 *
 * A sequence matches a pattern when the pattern's base sequence, repeated
 * modulo its period to the sequence length, equals the observed signature.
 */

import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { ReversalGlyphData } from "@tka/render-composition";
import {
  REVERSAL_PATTERNS,
  type ReversalPatternDef,
} from "./reversal-patterns";

export type ReversalSymbol = "P" | "R" | "B" | "-";

type ReversalFields = Pick<StepData, "leftReversal" | "rightReversal">;

export function stepToReversalSymbol(step: ReversalFields): ReversalSymbol {
  const l = step.leftReversal === true;
  const r = step.rightReversal === true;
  if (l && r) return "P";
  if (r) return "R";
  if (l) return "B";
  return "-";
}

export function computeReversalSignature(steps: readonly ReversalFields[]): string {
  return steps.map(stepToReversalSymbol).join("");
}

/** Preserve the raw signature, including patterns absent from the deck catalog. */
export function deriveReversalGlyphData(
  steps: readonly ReversalFields[],
): ReversalGlyphData | null {
  const sequence = computeReversalSignature(steps);
  if (sequence.length === 0) return null;

  const n = sequence.length;
  outer:
  for (let period = 1; period <= n; period++) {
    if (n % period !== 0) continue;
    for (let i = period; i < n; i++) {
      if (sequence[i] !== sequence[i % period]) continue outer;
    }
    return { sequence, period };
  }
  return { sequence, period: n };
}

function signatureMatchesPattern(signature: string, pattern: ReversalPatternDef): boolean {
  const base = pattern.sequence;
  if (signature.length === 0) return false;
  if (signature.length < pattern.minBeats) return false;
  if (signature.length % pattern.period !== 0) return false;

  for (let i = 0; i < signature.length; i++) {
    if (signature[i] !== base[i % base.length]) return false;
  }
  return true;
}

export function findMatchingReversalPattern(
  steps: readonly ReversalFields[],
): ReversalPatternDef | null {
  const signature = computeReversalSignature(steps);
  if (signature.length === 0) return null;

  for (const pattern of REVERSAL_PATTERNS) {
    if (signatureMatchesPattern(signature, pattern)) {
      return pattern;
    }
  }
  return null;
}

export function matchReversalPatternId(
  steps: readonly ReversalFields[],
): string | null {
  return findMatchingReversalPattern(steps)?.id ?? null;
}
