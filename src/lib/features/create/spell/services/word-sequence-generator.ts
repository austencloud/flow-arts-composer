/**
 * Word Sequence Generator Implementation
 *
 * Converts typed words into valid TKA sequences with bridge letters.
 */

import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { ILetterQueryHandler } from "$lib/shared/foundation/services/data/data-contracts";
import type { stepConverter as StepConverterSingleton } from "$lib/features/create/generate/shared/services/step-converter";
type StepConverter = typeof StepConverterSingleton;
import type { SequenceExtender } from "../../shared/services/sequence-extender";
import type { ReversalDetector } from "$lib/shared/create/services/reversal-detector";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { deriveWordFromBeats } from "$lib/shared/foundation/services/word-deriver";

import type { LetterTransitionGraph } from "./letter-transition-graph";
import type { StartPlacementValidator } from "./start-placement-validator";
import type { OrientationContinuityValidator } from "./orientation-continuity-validator";
import type {
  SpellGenerationOptions,
  SpellResult,
  LetterSource,
  CircularizationOption,
} from "../domain/models/spell-models";
import {
  GREEK_LETTER_ALIASES,
  MAX_WORD_LENGTH,
} from "$lib/shared/create/domain/spell-constants";
import { DifficultyLevel } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { recalculateAllOrientations } from "$lib/shared/create/services/orientation-propagation";

export class WordSequenceGenerator {
  constructor(
    private transitionGraph: LetterTransitionGraph,
    private letterQueryHandler: ILetterQueryHandler,
    private stepConverter: StepConverter,
    private sequenceExtender: SequenceExtender,
    private startPlacementValidator: StartPlacementValidator,
    private orientationContinuityValidator: OrientationContinuityValidator,
    private reversalDetector: ReversalDetector
  ) {}

  async generateFromWord(
    options: SpellGenerationOptions
  ): Promise<SpellResult> {
    const validation = this.validateWord(options.word);
    if (!validation.valid) {
      return this.createErrorResult(
        options.word,
        validation.error || "Invalid word"
      );
    }

    // Parse word into letters
    const parseResult = this.parseWord(options.word);
    if (!parseResult) {
      return this.createErrorResult(options.word, "Failed to parse word");
    }

    const { letters } = parseResult;

    // Ensure transition graph is initialized
    if (!this.transitionGraph.isInitialized()) {
      await this.transitionGraph.initialize();
    }

    try {
      // Build expanded letter sequence with bridge letters
      // Always use 1 bridge letter max - any transition can be done with 1 bridge
      const { expandedLetters, letterSources } = this.buildExpandedSequence(
        letters,
        1
      );

      if (expandedLetters.length === 0) {
        return this.createErrorResult(options.word, "No letters to generate");
      }

      const firstLetter = expandedLetters[0]!;

      // Get start placement for first letter
      const gridMode = GridMode.DIAMOND; // Default for now
      const startPlacement = await this.selectStartPlacement(
        firstLetter,
        gridMode
      );

      if (!startPlacement) {
        return this.createErrorResult(
          options.word,
          `Could not find start placement for letter ${firstLetter}`
        );
      }

      // Generate steps for each letter
      const steps = await this.generateBeats(
        expandedLetters,
        startPlacement,
        gridMode
      );

      if (steps.length === 0) {
        return this.createErrorResult(
          options.word,
          "Failed to generate steps for sequence"
        );
      }

      // Build sequence data (non-circular initially)
      let sequence = this.buildSequenceData(
        options.word,
        startPlacement,
        steps,
        gridMode,
        false // Initially not circular - LOOP is applied after
      );

      // Recalculate all orientations to ensure chain integrity
      // The CSV data may not have proper orientation continuity,
      // so we propagate orientations from the start placement
      sequence = recalculateAllOrientations(sequence);

      // Detect reversals in the sequence
      sequence = this.reversalDetector.processReversals(sequence);

      // If a forced bridge letter was specified (for circularization), append it
      if (options.forceBridgeLetter) {
        const bridgeResult = await this.appendForcedBridgeLetter(
          sequence,
          options.forceBridgeLetter,
          gridMode
        );
        if (bridgeResult.success) {
          sequence = bridgeResult.sequence;
          expandedLetters.push(options.forceBridgeLetter);
          letterSources.push({
            letter: options.forceBridgeLetter,
            isOriginal: false,
            stepIndex: expandedLetters.length,
          });
        } else {
          return this.createErrorResult(
            options.word,
            bridgeResult.error || "Failed to add bridge letter"
          );
        }
      }

      // Build expanded word string (may be updated if LOOP is applied)
      let expandedWord = expandedLetters.join("");

      // Store spell metadata in sequence for persistence
      sequence = {
        ...sequence,
        metadata: {
          ...sequence.metadata,
          spellData: {
            originalWord: options.word,
            expandedWord,
            letterSources,
          },
        },
      };

      // Analyze what LOOP types are available for this sequence
      const loopAnalysis = this.sequenceExtender.analyzeSequence(sequence);

      // If makeCircular is enabled, apply a LOOP transformation
      // Default to REWOUND if no specific type is selected (REWOUND is always available)
      if (options.preferences.makeCircular && loopAnalysis.canExtend) {
        // Use selected LOOP type, or default to REWOUND
        const loopTypeToApply = options.preferences.selectedLOOPType || LOOPType.STRICT_REWOUND;

        // Check if the LOOP type is available
        const isLOOPAvailable =
          loopTypeToApply === LOOPType.STRICT_REWOUND || // REWOUND is always available
          loopAnalysis.availableLOOPOptions.some((opt) => opt.loopType === loopTypeToApply);

        if (isLOOPAvailable) {
          // Apply the LOOP transformation
          // This now correctly derives letters for the extended steps
          sequence = await this.sequenceExtender.extendSequence(sequence, {
            loopType: loopTypeToApply,
          });

          // Build updated expandedWord and letterSources from the extended sequence
          // The extended sequence has the correct letters derived from motion data
          const extendedExpandedWord = sequence.word || deriveWordFromBeats(sequence.steps);
          const originalStepCount = expandedLetters.length;
          const extendedLetterSources: LetterSource[] = sequence.steps.map((step, index) => ({
            letter: (step.letter || "") as Letter,
            isOriginal: index < originalStepCount ? letterSources[index]?.isOriginal ?? false : false,
            stepIndex: index + 1,
          }));

          // Update local variables for return value
          expandedWord = extendedExpandedWord;
          letterSources.length = 0;
          letterSources.push(...extendedLetterSources);

          // Update metadata to reflect the LOOP was applied with extended data
          sequence = {
            ...sequence,
            metadata: {
              ...sequence.metadata,
              spellData: {
                originalWord: options.word,
                expandedWord: extendedExpandedWord,
                letterSources: extendedLetterSources,
                appliedLOOPType: loopTypeToApply,
              },
            },
          };
        }
      }

      // If placement groups don't match, compute circularization options
      // These show what bridge letters could be added to enable placement-dependent LOOPs
      // Note: REWOUND is always available (it's placement-independent), but we still
      // want to show circularization options for users who want other LOOP types
      let circularizationOptions: CircularizationOption[] | undefined;
      let directLoopUnavailableReason: string | undefined;

      if (options.preferences.makeCircular) {
        const startPosGroup = this.placementToGroup(
          startPlacement.startPlacement || startPlacement.endPlacement || ""
        );
        const endStep = steps[steps.length - 1];
        const endPosGroup = endStep
          ? this.placementToGroup(endStep.endPlacement || "")
          : null;

        // Check if placement groups don't match - this means placement-dependent LOOPs
        // (ROTATED, MIRRORED, etc.) won't work without bridge letters
        if (startPosGroup && endPosGroup && startPosGroup !== endPosGroup) {
          directLoopUnavailableReason = `Sequence ends at ${endPosGroup}, needs to reach ${startPosGroup} for placement-dependent LOOPs`;

          // Compute circularization options to show what bridge letters enable which LOOPs
          circularizationOptions = await this.computeCircularizationOptions(
            sequence,
            startPlacement,
            endStep,
            gridMode
          );
        }
      }

      return {
        sequence,
        originalWord: options.word,
        expandedWord,
        letterSources,
        success: true,
        loopAnalysis,
        circularizationOptions,
        directLoopUnavailableReason,
      };
    } catch (error) {
      return this.createErrorResult(
        options.word,
        `Generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  parseWord(word: string): { letters: Letter[]; error?: string } | null {
    const letters: Letter[] = [];
    let i = 0;

    while (i < word.length) {
      // Try to match Greek letter aliases (longest match first)
      let matched = false;

      // Sort aliases by length descending to match longest first
      const sortedAliases = [...GREEK_LETTER_ALIASES].sort(
        (a, b) => b.alias.length - a.alias.length
      );

      for (const { alias, letter } of sortedAliases) {
        const remaining = word.slice(i).toLowerCase();
        if (remaining.startsWith(alias.toLowerCase())) {
          // Word boundary check: only match alias if the next character
          // is NOT an alphabetic letter. This prevents "BETSY" from matching
          // "beta" (β) instead of parsing as B, E, T, S, Y.
          // Valid boundaries: end of string, space, dash, or non-alpha char.
          const nextCharIndex = i + alias.length;
          const nextChar = word.charAt(nextCharIndex);
          const isAtBoundary = !nextChar || !/[a-zA-Z]/.test(nextChar);

          if (isAtBoundary) {
            letters.push(letter);
            i += alias.length;
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        // Try single character match
        const char = word.charAt(i);
        if (!char) {
          i++;
          continue;
        }
        const upperChar = char.toUpperCase();

        // Check if it's a direct Letter enum value
        const letterValues = Object.values(Letter) as string[];
        if (letterValues.includes(upperChar)) {
          letters.push(upperChar as Letter);
          i++;
        } else if (letterValues.includes(char)) {
          // Greek symbols like Σ, Δ, etc.
          letters.push(char as Letter);
          i++;
        } else {
          // Skip spaces and unknown characters for now
          if (char === " " || char === "-") {
            i++;
          } else {
            return { letters: [], error: `Unknown character: ${char}` };
          }
        }
      }
    }

    return { letters };
  }

  validateWord(word: string): { valid: boolean; error?: string } {
    if (!word || word.trim().length === 0) {
      return { valid: false, error: "Word cannot be empty" };
    }

    if (word.length > MAX_WORD_LENGTH * 3) {
      // Allow for Greek aliases which are longer
      return {
        valid: false,
        error: `Word is too long (max ${MAX_WORD_LENGTH} letters)`,
      };
    }

    const parseResult = this.parseWord(word);
    if (!parseResult || parseResult.error) {
      return {
        valid: false,
        error: parseResult?.error || "Invalid characters",
      };
    }

    if (parseResult.letters.length === 0) {
      return { valid: false, error: "No valid letters found" };
    }

    if (parseResult.letters.length > MAX_WORD_LENGTH) {
      return {
        valid: false,
        error: `Word has too many letters (max ${MAX_WORD_LENGTH}, got ${parseResult.letters.length})`,
      };
    }

    return { valid: true };
  }

  /**
   * Build the expanded letter sequence with bridge letters inserted
   */
  private buildExpandedSequence(
    originalLetters: Letter[],
    maxBridgeLetters: number
  ): { expandedLetters: Letter[]; letterSources: LetterSource[] } {
    const expandedLetters: Letter[] = [];
    const letterSources: LetterSource[] = [];

    for (let i = 0; i < originalLetters.length; i++) {
      const letter = originalLetters[i];
      if (!letter) continue;

      if (i === 0) {
        // First letter - just add it
        expandedLetters.push(letter);
        letterSources.push({
          letter,
          isOriginal: true,
          stepIndex: expandedLetters.length,
        });
      } else {
        // Check if we need bridge letters
        const prevLetter = expandedLetters[expandedLetters.length - 1];
        if (!prevLetter) continue;

        const bridgeLetters = this.transitionGraph.findBridgeLetters(
          prevLetter,
          letter
        );

        // Add bridge letters (up to max)
        const bridgesToAdd = bridgeLetters.slice(0, maxBridgeLetters);
        for (const bridge of bridgesToAdd) {
          expandedLetters.push(bridge);
          letterSources.push({
            letter: bridge,
            isOriginal: false,
            stepIndex: expandedLetters.length,
          });
        }

        // Add the original letter
        expandedLetters.push(letter);
        letterSources.push({
          letter,
          isOriginal: true,
          stepIndex: expandedLetters.length,
        });
      }
    }

    return { expandedLetters, letterSources };
  }

  /**
   * Select a start placement that works for the first letter.
   * Uses StartPlacementValidator to ensure only static (Type 6) pictographs are used.
   */
  private async selectStartPlacement(
    firstLetter: Letter,
    gridMode: GridMode
  ): Promise<PictographData | null> {
    try {
      // Get valid start placements using the validator
      // This ensures only Type 6 (static) letters are used
      const validStartPlacements =
        await this.startPlacementValidator.getValidStartPlacements(
          firstLetter,
          gridMode
        );

      if (validStartPlacements.length === 0) {
        return null;
      }

      // Return random start placement
      const randomIndex = Math.floor(Math.random() * validStartPlacements.length);
      return validStartPlacements[randomIndex] ?? null;
    } catch (error) {
      console.error("Error selecting start placement:", error);
      return null;
    }
  }

  /**
   * Generate steps for the expanded letter sequence.
   * Throws an error if a valid pictograph cannot be found for any letter.
   */
  private async generateBeats(
    letters: Letter[],
    startPlacement: PictographData,
    gridMode: GridMode
  ): Promise<StepData[]> {
    const steps: StepData[] = [];
    let lastPictograph = startPlacement;

    for (let i = 0; i < letters.length; i++) {
      const letter = letters[i];
      if (!letter) continue;

      // Get pictograph for this letter that properly chains from the last one
      const pictograph = await this.findPictographForLetter(
        letter,
        lastPictograph,
        gridMode
      );

      if (!pictograph) {
        // No valid pictograph found - this means the transition graph
        // didn't correctly identify needed bridge letters, or no valid
        // pictograph variation exists for this transition
        throw new Error(
          `Cannot chain letter "${letter}" from placement "${lastPictograph.endPlacement}". ` +
            `No pictograph variation for "${letter}" starts at this placement.`
        );
      }

      // Convert to beat
      const beat = this.stepConverter.convertToStep(
        pictograph,
        i + 1,
        gridMode
      );
      steps.push(beat);
      lastPictograph = pictograph;
    }

    return steps;
  }

  /**
   * Find a pictograph for a letter that can follow the last pictograph.
   * Ensures placement continuity (startPlacement === lastPictograph.endPlacement).
   * Orientations are recalculated afterward by recalculateAllOrientations().
   */
  private async findPictographForLetter(
    letter: Letter,
    lastPictograph: PictographData,
    gridMode: GridMode
  ): Promise<PictographData | null> {
    // Get ALL pictograph variations
    const allPictographs =
      await this.letterQueryHandler.getAllPictographVariations(gridMode);

    // Filter to variations for this letter
    const letterVariations = allPictographs.filter((p) => p.letter === letter);

    if (letterVariations.length === 0) {
      console.warn(`No pictograph variations found for letter ${letter}`);
      return null;
    }

    // Get the end placement from the last pictograph
    const requiredStartPlacement = lastPictograph.endPlacement;

    // Filter by placement continuity
    const placementMatches = letterVariations.filter(
      (p) => p.startPlacement === requiredStartPlacement
    );

    if (placementMatches.length === 0) {
      console.warn(
        `No pictograph for letter ${letter} starts at placement ${requiredStartPlacement}`
      );
      // Return null - this means we need a bridge letter
      return null;
    }

    // Return a random match from valid candidates for variety
    const randomIndex = Math.floor(Math.random() * placementMatches.length);
    return placementMatches[randomIndex] ?? null;
  }

  /**
   * Build the final SequenceData object
   */
  private buildSequenceData(
    name: string,
    startPlacement: PictographData,
    steps: StepData[],
    gridMode: GridMode,
    isCircular: boolean = false
  ): SequenceData {
    const startPlacementData = this.stepConverter.convertToStartPlacement(
      startPlacement,
      gridMode
    );

    return {
      id: crypto.randomUUID(),
      name,
      word: deriveWordFromBeats(steps),
      steps,
      startPlacement: startPlacementData, // Primary field for orientation propagation
      startingPlacement: startPlacementData, // Legacy field for backward compatibility
      gridMode,
      // propType removed - prop type is viewer preference, not sequence data
      difficultyLevel: DifficultyLevel.INTERMEDIATE,
      isCircular,
      isFavorite: false,
      thumbnails: [],
      tags: isCircular
        ? ["generated", "spell", "loop"]
        : ["generated", "spell"],
      metadata: {
        createdAt: new Date().toISOString(),
        source: "spell",
      },
    };
  }

  private createErrorResult(word: string, error: string): SpellResult {
    return {
      sequence: null,
      originalWord: word,
      expandedWord: "",
      letterSources: [],
      success: false,
      error,
    };
  }

  private getEndPlacement(pictograph: PictographData): string {
    return pictograph.endPlacement || "";
  }

  private placementToGroup(placement: string): string | null {
    if (!placement) return null;
    if (placement.startsWith("alpha")) return "alpha";
    if (placement.startsWith("beta")) return "beta";
    if (placement.startsWith("gamma")) return "gamma";
    return null;
  }

  private isStartPlacementPictograph(pictograph: PictographData): boolean {
    return pictograph.startPlacement === pictograph.endPlacement;
  }

  /**
   * Compute circularization options for a non-loopable sequence.
   * When a sequence ends at a different placement group than it starts,
   * we need bridge letters to return to the start group. Different bridge
   * letters will end at different specific placements, enabling different LOOPs.
   */
  private async computeCircularizationOptions(
    sequence: SequenceData,
    startPlacement: PictographData,
    endStep: StepData | undefined,
    gridMode: GridMode
  ): Promise<CircularizationOption[]> {
    if (!endStep) return [];

    const startPos = startPlacement.startPlacement || startPlacement.endPlacement;
    const endPos = endStep.endPlacement;
    if (!startPos || !endPos) return [];

    const startGroup = this.placementToGroup(startPos);
    const endGroup = this.placementToGroup(endPos);
    if (!startGroup || !endGroup || startGroup === endGroup) return [];

    const options: CircularizationOption[] = [];
    const allPictographs =
      await this.letterQueryHandler.getAllPictographVariations(gridMode);

    // Find ALL pictograph variations that:
    // 1. Start at the sequence's end placement (endPos)
    // 2. End at a placement in the start group (startGroup)
    // This gives us all possible bridge letters (X, W-, X-, etc.)
    const bridgeCandidates = allPictographs.filter((p) => {
      if (p.startPlacement !== endPos) return false;
      const pEndGroup = this.placementToGroup(p.endPlacement || "");
      return pEndGroup === startGroup;
    });

    if (bridgeCandidates.length === 0) return [];

    // Group candidates by letter and ending placement to avoid duplicates
    // Key: "letter|endPlacement" -> PictographData
    const uniqueBridges = new Map<string, PictographData>();
    for (const variation of bridgeCandidates) {
      const key = `${variation.letter}|${variation.endPlacement}`;
      if (!uniqueBridges.has(key)) {
        uniqueBridges.set(key, variation);
      }
    }

    // For each unique bridge variation, check available LOOPs
    for (const [_key, variation] of uniqueBridges) {
      const bridgeLetter = variation.letter as Letter;
      const bridgeEndPos = variation.endPlacement || "";

      // Create a temporary beat for the bridge letter (factory fills any
      // missing hand with an invisible placeholder)
      const bridgeBeat: StepData = createStepData({
        ...variation,
        stepNumber: sequence.steps.length + 1,
        duration: 1,
        isBlank: false,
      });

      // Create a temporary sequence with the bridge letter to analyze
      const tempSequence: SequenceData = {
        ...sequence,
        steps: [...sequence.steps, bridgeBeat],
      };

      // Analyze what LOOPs are available for this extended sequence
      // Filter out REWOUND since it's always available and shown separately
      const analysis = this.sequenceExtender.analyzeSequence(tempSequence);
      const placementDependentLOOPs = analysis.availableLOOPOptions.filter(
        (opt) => opt.loopType !== LOOPType.STRICT_REWOUND
      );

      if (placementDependentLOOPs.length > 0) {
        options.push({
          bridgeLetters: [bridgeLetter],
          endPlacement: bridgeEndPos,
          availableLOOPs: placementDependentLOOPs,
          description: `Add "${bridgeLetter}" to end at ${bridgeEndPos}`,
        });
      }
    }

    return options;
  }

  /**
   * Get a representative letter that starts at a given placement group.
   * Used to find bridge paths.
   */
  private getFirstLetterInGroup(group: string): Letter {
    // These are known letters that start at each placement group
    const groupStarters: Record<string, Letter> = {
      alpha: Letter.A,
      beta: Letter.B,
      gamma: Letter.G,
    };
    return groupStarters[group] || Letter.A;
  }

  /**
   * Append a forced bridge letter to the sequence.
   * This is used when user selects a circularization option that requires a specific bridge letter.
   */
  private async appendForcedBridgeLetter(
    sequence: SequenceData,
    bridgeLetter: Letter,
    gridMode: GridMode
  ): Promise<{ success: boolean; sequence: SequenceData; error?: string }> {
    const lastStep = sequence.steps[sequence.steps.length - 1];
    if (!lastStep) {
      return { success: false, sequence, error: "No steps in sequence" };
    }

    // Get all pictographs for the bridge letter
    const allPictographs =
      await this.letterQueryHandler.getAllPictographVariations(gridMode);

    // Find a pictograph variation that starts at the last beat's end placement
    const bridgeVariations = allPictographs.filter(
      (p) =>
        p.letter === bridgeLetter && p.startPlacement === lastStep.endPlacement
    );

    if (bridgeVariations.length === 0) {
      return {
        success: false,
        sequence,
        error: `No variation of "${bridgeLetter}" starts at placement "${lastStep.endPlacement}"`,
      };
    }

    // Pick a random variation for variety
    const randomIndex = Math.floor(Math.random() * bridgeVariations.length);
    const bridgeVariation = bridgeVariations[randomIndex];
    if (!bridgeVariation) {
      return {
        success: false,
        sequence,
        error: "Failed to select bridge variation",
      };
    }

    // Convert to beat and append
    const bridgeBeat = this.stepConverter.convertToStep(
      bridgeVariation,
      sequence.steps.length + 1,
      gridMode
    );

    const newSequence: SequenceData = {
      ...sequence,
      steps: [...sequence.steps, bridgeBeat],
    };

    // Recalculate orientations for the new sequence
    const recalculatedSequence = recalculateAllOrientations(newSequence);

    return { success: true, sequence: recalculatedSequence };
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { letterTransitionGraph } from "./letter-transition-graph";
import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
import { stepConverter } from "$lib/features/create/generate/shared/services/step-converter";
import { sequenceExtender } from "$lib/features/create/shared/services/sequence-extender";
import { startPlacementValidator } from "./start-placement-validator";
import * as orientationContinuityValidator from "./orientation-continuity-validator";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";

export const wordSequenceGenerator = new WordSequenceGenerator(
  letterTransitionGraph,
  letterQueryHandler,
  stepConverter,
  sequenceExtender,
  startPlacementValidator,
  orientationContinuityValidator,
  reversalDetector
);
