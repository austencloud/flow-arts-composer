/**
 * Kinetic Alphabet Sorting Utilities
 *
 * Provides proper sorting for kinetic alphabet letters respecting system order
 */

import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

/**
 * Complete kinetic alphabet letter order
 * Organized by type in the canonical sequence
 * Types 1-5: UPPERCASE, Type 6: Static letters (α, β, γ, etc.)
 */
const KINETIC_ALPHABET_ORDER = [
  // Type 1: Dual-Shift
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  // Type 2: Shift
  "W",
  "X",
  "Y",
  "Z",
  "Σ",
  "Δ",
  "Θ",
  "Ω",
  // Advanced Type 2s
  "μ",
  "ν",
  // Type 3: Cross-Shift
  "W-",
  "X-",
  "Y-",
  "Z-",
  "Σ-",
  "Δ-",
  "Θ-",
  "Ω-",
  // Type 4: Dash
  "Φ",
  "Ψ",
  "Λ",
  // Type 5: Dual-Dash
  "Φ-",
  "Ψ-",
  "Λ-",
  // Type 6: Static
  "α",
  "β",
  "γ",
  // Advanced Type 6s
  "ζ",
  "η",
  "τ",
  "⊕",
];

/**
 * Get the sort order index for a letter
 * Returns -1 if letter not found (sorts to end)
 */
function getLetterSortIndex(letter: string): number {
  return KINETIC_ALPHABET_ORDER.indexOf(letter);
}

/**
 * Extract the base letter from a word (first letter or first letter+dash)
 * Type 6 letters: α, β, γ, ζ, η, τ, ⊕
 */
export function extractBaseLetter(word: string): string {
  const bare = stripWordNotation(word ?? "");
  if (bare.length === 0) return "";

  const firstChar = bare[0]!;

  // Type 6 static letters (these should not be uppercased)
  const TYPE6_LETTERS = ["α", "β", "γ", "ζ", "η", "τ", "⊕"];

  let char: string;
  if (TYPE6_LETTERS.includes(firstChar)) {
    // Type 6 letter - keep as-is
    char = firstChar;
  } else {
    // Type 1-5, uppercase it
    char = firstChar.toUpperCase();
  }

  const secondChar = bare[1];

  // Check if it's a dash variant (e.g., "W-" or "Σ-")
  if (secondChar === "-") {
    return `${char}-`;
  }

  return char;
}

/**
 * Compare two letters in kinetic alphabet order
 * Returns negative if a < b, positive if a > b, 0 if equal
 */
export function compareKineticLetters(
  letterA: string,
  letterB: string
): number {
  const indexA = getLetterSortIndex(letterA);
  const indexB = getLetterSortIndex(letterB);

  // Both found in alphabet
  if (indexA !== -1 && indexB !== -1) {
    return indexA - indexB;
  }

  // One or both not found - fallback to standard comparison
  if (indexA === -1 && indexB === -1) {
    return letterA.localeCompare(letterB);
  }

  // Known letters come before unknown
  return indexA === -1 ? 1 : -1;
}

/**
 * Sort sequences by their first letter in kinetic alphabet order
 * Then by word name for sequences with the same first letter
 */
export function sortSequencesByKineticAlphabet<
  T extends { word: string; sequenceLength?: number },
>(sequences: T[]): T[] {
  return [...sequences].sort((a, b) => {
    const letterA = extractBaseLetter(a.word);
    const letterB = extractBaseLetter(b.word);

    const letterCompare = compareKineticLetters(letterA, letterB);
    if (letterCompare !== 0) {
      return letterCompare;
    }

    // Same letter, sort by sequence length then word
    const lengthDiff = (a.sequenceLength ?? 0) - (b.sequenceLength ?? 0);
    if (lengthDiff !== 0) {
      return lengthDiff;
    }

    return a.word.localeCompare(b.word);
  });
}
