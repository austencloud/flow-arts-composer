/**
 * Word Simplifier Utility
 *
 * Simplifies long words by detecting and removing repeated patterns.
 * Ported from desktop application: legacy/src/utils/word_simplifier.py
 *
 * Example:
 * - "ABCABCABC" → "ABC"
 * - "TESTTEST" → "TEST"
 * - "HELLO" → "HELLO" (no pattern, returns original)
 */

import { Letter } from "../domain/models/letter";
import {
  compressWord as compressPortableWord,
  simplifyRepeatedWord as simplifyPortableWord,
  splitWordLetterUnits,
} from "@tka/render-composition";

/** Every canonical letter value, for {@link isTkaWord}'s membership test. */
const TKA_LETTER_UNITS: ReadonlySet<string> = new Set<string>(
  Object.values(Letter)
);

/**
 * Simplify a word by detecting and removing repeated patterns
 *
 * @param word - The word to simplify (e.g., "ABCABCABC")
 * @returns The simplified word (e.g., "ABC")
 *
 * Algorithm:
 * 1. Try patterns of increasing length (1, 2, 3, ... up to half the word length)
 * 2. For each pattern length, check if the word is formed by repeating that pattern
 * 3. Return the first (shortest) repeating pattern found
 * 4. If no pattern found, return the original word
 */
export function simplifyRepeatedWord(word: string): string {
  return simplifyPortableWord(word);
}

/**
 * Split a word into letter units, treating letter+dash combinations as single units
 *
 * Examples:
 * - "ABC" → ["A", "B", "C"] (3 letters)
 * - "AW-B" → ["A", "W-", "B"] (3 letters, not 4)
 * - "Φ-Ψ-Ω-" → ["Φ-", "Ψ-", "Ω-"] (3 letters)
 * - "A-B-C" → ["A-", "B-", "C"] (3 letters)
 */
export function splitIntoLetterUnits(word: string): string[] {
  return splitWordLetterUnits(word);
}

/**
 * Truncate a word to a maximum number of letter units,
 * treating letter+dash combinations as single letters
 *
 * @param word - The word to truncate
 * @param maxLetters - Maximum number of letter units (default: 8)
 * @returns The truncated word with "..." if it was truncated
 *
 * Example:
 * - simplifyAndTruncate("ABC-DEF-GHI-JKL", 8) → "ABC-DEF-..." (6 letter units)
 * - simplifyAndTruncate("AW-BX-CY-DZ-", 8) → "AW-BX-CY-DZ-" (4 letter units, no truncation)
 * - simplifyAndTruncate("ABCDEFGHIJK", 8) → "ABCDEFGH..." (truncated to 8)
 */
export function simplifyAndTruncate(
  word: string,
  maxLetters: number = 8
): string {
  // First simplify the word
  const simplified = simplifyRepeatedWord(word);

  // Split into letter units
  const letterUnits = splitIntoLetterUnits(simplified);

  // If within limit, return as-is
  if (letterUnits.length <= maxLetters) {
    return simplified;
  }

  // Truncate to maxLetters units and add ellipsis
  const truncatedUnits = letterUnits.slice(0, maxLetters);
  return truncatedUnits.join("") + "...";
}

export interface CompressedSegment {
  tokens: string[];
  repeat: number;
}

/**
 * Compress a word by detecting repeated consecutive subsequences.
 *
 * Unlike simplifyRepeatedWord (which only handles full-word repetition like
 * ABCABC → ABC), this detects partial runs:
 *   "AKEAAαΦ-AAKEAAαΦ-AAAAABαΦ-BAAAABαΦ-B"
 *   → [{tokens: [A,K,E,A,A,α,Φ-,A], repeat: 2},
 *      {tokens: [A,A,A,A,B,α,Φ-,B], repeat: 2}]
 *
 * Falls back to a single segment with repeat=1 when no runs are found.
 */
export function compressWord(word: string): CompressedSegment[] {
  return compressPortableWord(word);
}

/**
 * Render compressed segments back to a flat display string.
 * Repeated segments get (tokens)×N notation.
 */
export function compressedToDisplayString(
  segments: CompressedSegment[]
): string {
  return segments
    .map((seg) => {
      const inner = seg.tokens.join("");
      return seg.repeat > 1 ? `(${inner})×${seg.repeat}` : inner;
    })
    .join("");
}

/**
 * True when `text` is a Kinetic Alphabet word — a single unbroken run of
 * canonical TKA letters, dash letters included ("BBBA", "ΩORZ", "AW-B", "Φ-").
 *
 * The question this answers is a display one: only a real TKA word may be drawn
 * with the alphabet's glyphs. Anything a person typed as a name ("Sunrise",
 * "Tunnel #3", "Mandala Duo") has to stay text, so the test is deliberately
 * strict on both ends — no whitespace, no punctuation, and every unit has to be
 * an actual member of {@link Letter}. Lowercase Latin fails on membership
 * (`Letter.ALPHA` is "α", never "a"), which is what keeps ordinary English words
 * out even though the tokenizer happily splits them.
 */
export function isTkaWord(text: string): boolean {
  if (!text) return false;
  const units = splitIntoLetterUnits(text);
  // The tokenizer skips characters it does not recognize; rejoining proves that
  // nothing was dropped, so "A B" and "A!" fail here rather than passing as "AB".
  if (units.length === 0 || units.join("") !== text) return false;
  return units.every((unit) => TKA_LETTER_UNITS.has(unit));
}
