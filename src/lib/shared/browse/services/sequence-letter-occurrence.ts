import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { splitIntoLetterUnits } from "#lib/shared/foundation/utils/word-simplifier.js";

/**
 * Does this sequence's notation contain one exact TKA letter?
 *
 * Loaded sequences carry the real per-step letters, so those win. Browse
 * metadata may intentionally omit steps; in that case `word` is the canonical
 * public projection and its letter-unit tokenizer preserves dash letters such
 * as W- as distinct values. Names, notes, and other prose never participate.
 */
export function sequenceContainsExactLetter(
  sequence: SequenceData,
  letter: string
): boolean {
  if (!letter) return false;
  if (sequence.steps.length > 0) {
    return sequence.steps.some((step) => step.letter === letter);
  }
  return splitIntoLetterUnits(sequence.word).includes(letter);
}

export function filterSequencesByExactLetter(
  sequences: readonly SequenceData[],
  letter: string
): SequenceData[] {
  return sequences.filter((sequence) =>
    sequenceContainsExactLetter(sequence, letter)
  );
}
