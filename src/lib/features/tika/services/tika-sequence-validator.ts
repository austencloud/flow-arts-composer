/**
 * TikaSequenceValidator - Validates TKA letter sequences
 *
 * Checks if letters can chain together based on position groups,
 * and suggests bridge letters to fix invalid sequences.
 */

import type { TikaPictographLoader } from "./tika-pictograph-loader";
import { LETTER_TO_TYPE } from "@tka/domain";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

export interface SequenceTransition {
  from: string;
  to: string;
  fromEndGroup: string;
  toStartGroup: string;
  isValid: boolean;
  bridgeOptions?: string[];
}
export interface InvalidTransition {
  position: number;
  from: string;
  to: string;
  reason: string;
  suggestedBridges: string[];
}
export interface SequenceValidationResult {
  isValid: boolean;
  word: string;
  letters: string[];
  transitions: SequenceTransition[];
  invalidTransitions: InvalidTransition[];
  interpolatedSequence?: string;
  explanation: string;
}

export class TikaSequenceValidator {
  constructor(private pictographLoader: TikaPictographLoader) {}

  validateChaining(letters: string[]): SequenceValidationResult {
    const mappings = this.pictographLoader.getLetterPositionMappings();
    const bridgesByTransition =
      this.pictographLoader.getBridgeLettersByTransition();

    const transitions: SequenceTransition[] = [];
    const invalidTransitions: InvalidTransition[] = [];

    for (let i = 0; i < letters.length - 1; i++) {
      const fromLetter = letters[i]!;
      const toLetter = letters[i + 1]!;

      const fromMapping = mappings[fromLetter];
      const toMapping = mappings[toLetter];

      if (!fromMapping || !toMapping) {
        transitions.push({
          from: fromLetter,
          to: toLetter,
          fromEndGroup: fromMapping?.endGroup || "unknown",
          toStartGroup: toMapping?.startGroup || "unknown",
          isValid: false,
        });
        invalidTransitions.push({
          position: i + 1,
          from: fromLetter,
          to: toLetter,
          reason: `Unknown letter: ${!fromMapping ? fromLetter : toLetter}`,
          suggestedBridges: [],
        });
        continue;
      }

      const fromEndGroup = fromMapping.endGroup;
      const toStartGroup = toMapping.startGroup;
      const isValid = fromEndGroup === toStartGroup;

      const bridgeTransition = `${fromEndGroup}->${toStartGroup}`;
      const bridgeOptions = isValid
        ? undefined
        : bridgesByTransition[bridgeTransition] || [];

      transitions.push({
        from: fromLetter,
        to: toLetter,
        fromEndGroup,
        toStartGroup,
        isValid,
        bridgeOptions,
      });

      if (!isValid) {
        invalidTransitions.push({
          position: i + 1,
          from: fromLetter,
          to: toLetter,
          reason: `${fromLetter} ends in ${fromEndGroup}, but ${toLetter} starts in ${toStartGroup}`,
          suggestedBridges: bridgeOptions?.slice(0, 3) || [],
        });
      }
    }

    const isValid = invalidTransitions.length === 0;
    const word = letters.join("");

    // Build explanation
    let explanation: string;
    if (isValid) {
      explanation = `"${word}" is a valid sequence. All ${letters.length} letters chain correctly.`;
    } else {
      const breakPoints = invalidTransitions
        .map((t) => `${t.from}→${t.to} (${t.reason})`)
        .join("; ");
      explanation = `"${word}" cannot chain directly. Position breaks: ${breakPoints}`;

      if (invalidTransitions.every((t) => t.suggestedBridges.length > 0)) {
        explanation += `. Can be fixed with bridge letters.`;
      }
    }

    // Build interpolated sequence if possible
    let interpolatedSequence: string | undefined;
    if (
      !isValid &&
      invalidTransitions.every((t) => t.suggestedBridges.length > 0)
    ) {
      const interpolated: string[] = [letters[0]!];
      for (let i = 0; i < letters.length - 1; i++) {
        const invalidT = invalidTransitions.find((t) => t.position === i + 1);
        if (invalidT && invalidT.suggestedBridges.length > 0) {
          interpolated.push(invalidT.suggestedBridges[0]!);
        }
        interpolated.push(letters[i + 1]!);
      }
      interpolatedSequence = interpolated.join("");
    }

    return {
      isValid,
      word,
      letters,
      transitions,
      invalidTransitions,
      interpolatedSequence,
      explanation,
    };
  }

  parseWordToLetters(word: string): string[] {
    // Strip skew-frame braces first: they mark a span of the word, not a
    // letter, and the scan below has no notation awareness of its own.
    const bareWord = stripWordNotation(word);
    const letters: string[] = [];
    let i = 0;

    while (i < bareWord.length) {
      const char = bareWord[i];
      if (!char) {
        i++;
        continue;
      }

      // Check if next char is a dash (for Type 3/5 letters)
      const nextChar = bareWord[i + 1];
      if (nextChar === "-") {
        letters.push(char + "-");
        i += 2;
      } else {
        letters.push(char);
        i++;
      }
    }

    return letters;
  }

  isValidLetter(letter: string): boolean {
    return LETTER_TO_TYPE[letter] !== undefined;
  }

  getLetterType(letter: string): { type: string; name: string } | undefined {
    return LETTER_TO_TYPE[letter];
  }
}

