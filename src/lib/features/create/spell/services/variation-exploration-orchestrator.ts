/**
 * Variation Exploration Orchestrator Implementation
 *
 * Handles word parsing and bridge letter insertion for spell generation.
 */

import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { LetterSource } from "../domain/models/spell-models";
import type { WordParseResult, WordParseOptions } from "./types";
import type { LetterTransitionGraph } from "./letter-transition-graph";
import type { WordSequenceGenerator } from "./word-sequence-generator";

// Letters with dash motions (Type 3, 4, and 5)
const DASH_LETTERS: Set<string> = new Set([
  // Type 3: Cross-Shift (one hand shifts, one dashes)
  "W-", "X-", "Y-", "Z-", "Σ-", "Δ-", "Θ-", "Ω-",
  // Type 4: Dash (one hand dashes, one static)
  "Φ", "Ψ", "Λ",
  // Type 5: Dual-Dash (both hands dash)
  "Φ-", "Ψ-", "Λ-",
]);

interface ServiceLoader {
  getTransitionGraph(): Promise<LetterTransitionGraph>;
  getWordGenerator(): Promise<WordSequenceGenerator>;
}

export class VariationExplorationOrchestrator {
  constructor(private serviceLoader: ServiceLoader) {}

  async parseWord(word: string, options?: WordParseOptions): Promise<WordParseResult> {
    try {
      const graph = await this.serviceLoader.getTransitionGraph();
      const generator = await this.serviceLoader.getWordGenerator();

      const parseResult = generator.parseWord(word);
      if (!parseResult || parseResult.error) {
        return {
          success: false,
          error: parseResult?.error || "Could not parse word",
        };
      }

      const originalLetters = parseResult.letters;
      if (originalLetters.length === 0) {
        return { success: false, error: "No valid letters in word" };
      }

      const preferDash = options?.preferences?.motionTypeFilter === "prefer-dash";
      const avoidDash = options?.preferences?.motionTypeFilter === "no-dash";

      // Build expanded letters with bridge letters AND track letter sources
      const expandedLetters: Letter[] = [];
      const letterSources: LetterSource[] = [];

      for (let i = 0; i < originalLetters.length; i++) {
        const letter = originalLetters[i];
        if (!letter) continue;

        if (i === 0) {
          expandedLetters.push(letter);
          letterSources.push({
            letter,
            isOriginal: true,
            stepIndex: expandedLetters.length,
          });
        } else {
          const prevLetter = expandedLetters[expandedLetters.length - 1];
          if (prevLetter) {
            // Get ALL bridge options (not just a random one)
            const bridgeLetters = graph.findAllBridgeOptions(prevLetter, letter);

            // Select from available options based on dash preference
            if (bridgeLetters.length > 0) {
              let bridgeLetter: Letter;
              if (preferDash) {
                // Pick randomly from dash options only, fall back to all if no dash options
                const dashOptions = bridgeLetters.filter(b => DASH_LETTERS.has(b));
                const pool = dashOptions.length > 0 ? dashOptions : bridgeLetters;
                bridgeLetter = pool[Math.floor(Math.random() * pool.length)]!;
              } else if (avoidDash) {
                // Pick randomly from non-dash options only, fall back to all if no non-dash options
                const nonDashOptions = bridgeLetters.filter(b => !DASH_LETTERS.has(b));
                const pool = nonDashOptions.length > 0 ? nonDashOptions : bridgeLetters;
                bridgeLetter = pool[Math.floor(Math.random() * pool.length)]!;
              } else {
                // No preference - pick randomly from all options
                bridgeLetter = bridgeLetters[Math.floor(Math.random() * bridgeLetters.length)]!;
              }
              expandedLetters.push(bridgeLetter);
              letterSources.push({
                letter: bridgeLetter,
                isOriginal: false,
                stepIndex: expandedLetters.length,
              });
            }
          }
          expandedLetters.push(letter);
          letterSources.push({
            letter,
            isOriginal: true,
            stepIndex: expandedLetters.length,
          });
        }
      }

      if (expandedLetters.length === 0) {
        return {
          success: false,
          error: "Could not expand word to valid letters",
        };
      }

      return {
        success: true,
        originalLetters,
        expandedLetters,
        expandedWord: expandedLetters.join(""),
        letterSources,
      };
    } catch (error) {
      console.error(
        "[VariationExplorationOrchestrator] Failed to parse word:",
        error
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Sort bridge letters to put dash-type letters (Φ, Ψ, Λ and their Type 5 variants) first.
   */
  private sortBridgesByDashPreference(bridges: Letter[]): Letter[] {
    return [...bridges].sort((a, b) => {
      const aIsDash = DASH_LETTERS.has(a);
      const bIsDash = DASH_LETTERS.has(b);
      if (aIsDash && !bIsDash) return -1;
      if (!aIsDash && bIsDash) return 1;
      return 0;
    });
  }
}

import * as spellServiceLoader from "./spell-service-loader";

export const variationExplorationOrchestrator = new VariationExplorationOrchestrator(
  spellServiceLoader
);
