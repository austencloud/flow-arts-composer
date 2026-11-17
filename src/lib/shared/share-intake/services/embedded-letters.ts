/**
 * Letters a shared file carried, kept for the moment its card opens.
 *
 * A file that carries its sequence is filed as a card by re-wrapping the
 * sequence in the same `s~` code a printed QR holds, and that code has no
 * letter column. A float saved without its prefloat direction then reads back
 * as a different letter (KΘY-E opened as LΘY-F). The classifier notes the
 * letters the file carried under that code, and the card opener puts them back
 * before hydrating, so this entry shows what the menu row's open shows.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

const lettersByCode = new Map<string, (string | null)[]>();

/** Remember the letters of a sequence read from a file, under its card code. */
export function rememberEmbeddedLetters(
  code: string,
  sequence: SequenceData
): void {
  const letters = sequence.steps.map((step) => step.letter ?? null);
  if (letters.some(Boolean)) lettersByCode.set(code, letters);
}

/**
 * Put the remembered letters back on a sequence opened from that code, once.
 * Applies nothing when the step count differs, and never replaces a letter the
 * sequence already has.
 */
export function applyEmbeddedLetters(
  code: string,
  sequence: SequenceData
): SequenceData {
  const letters = lettersByCode.get(code);
  lettersByCode.delete(code);
  if (!letters || letters.length !== sequence.steps.length) return sequence;
  return {
    ...sequence,
    steps: sequence.steps.map((step, index) =>
      step.letter || !letters[index]
        ? step
        : ({ ...step, letter: letters[index] } as typeof step)
    ),
  };
}
