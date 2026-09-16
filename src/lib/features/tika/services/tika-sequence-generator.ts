/**
 * TikaSequenceGenerator - Generates valid TKA sequences
 *
 * Builds connected sequences by finding compatible variations
 * that chain together based on position groups.
 */

import type { PictographData } from "./tika-pictograph-loader";
import type { TikaPictographLoader } from "./tika-pictograph-loader";

export interface SequenceStepMotion {
  motionType: string;
  startLocation: string;
  endLocation: string;
  rotationDirection: string;
}
export interface SequenceStep {
  letter: string;
  variation: number;
  startPlacement: string;
  endPlacement: string;
  stepNumber: number;
  leftMotion: SequenceStepMotion;
  rightMotion: SequenceStepMotion;
}
export interface GeneratedSequenceResult {
  word: string;
  steps: SequenceStep[];
  startPlacement: string;
  endPlacement: string;
  isValid: boolean;
  error?: string;
}

const TYPE_6_LETTERS = ["α", "β", "γ"];

export class TikaSequenceGenerator {
  constructor(private pictographLoader: TikaPictographLoader) {}

  async generateSequence(
    letters: string[],
    maxAttempts: number = 100
  ): Promise<GeneratedSequenceResult> {
    this.pictographLoader.ensureLoaded();

    if (letters.length === 0) {
      return {
        word: "",
        steps: [],
        startPlacement: "",
        endPlacement: "",
        isValid: false,
        error: "No letters provided",
      };
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const result = this.attemptSequenceBuild(letters);
      if (result.isValid) {
        return result;
      }
    }

    return {
      word: letters.join(""),
      steps: [],
      startPlacement: "",
      endPlacement: "",
      isValid: false,
      error: `Failed to generate valid sequence after ${maxAttempts} attempts`,
    };
  }

  getStaticLetters(): string[] {
    return TYPE_6_LETTERS;
  }

  private attemptSequenceBuild(letters: string[]): GeneratedSequenceResult {
    const word = letters.join("");
    const steps: SequenceStep[] = [];
    const allPictographs = this.pictographLoader.getAllPictographs();

    const firstLetter = letters[0];
    if (!firstLetter) {
      return {
        word,
        steps: [],
        startPlacement: "",
        endPlacement: "",
        isValid: false,
        error: "No first letter",
      };
    }

    const firstLetterVariations = allPictographs.filter(
      (p) => p.letter === firstLetter
    );

    if (firstLetterVariations.length === 0) {
      return {
        word,
        steps: [],
        startPlacement: "",
        endPlacement: "",
        isValid: false,
        error: `No variations found for letter "${firstLetter}"`,
      };
    }

    const firstVariation = this.pickRandom(firstLetterVariations);
    if (!firstVariation) {
      return {
        word,
        steps: [],
        startPlacement: "",
        endPlacement: "",
        isValid: false,
        error: "Failed to pick first variation",
      };
    }

    const firstVariationIndex = firstLetterVariations.indexOf(firstVariation);
    const startPlacement = firstVariation.startPlacement;

    // Find a valid start position (Type 6 static letter)
    const validStartPlacements = allPictographs.filter((p) => {
      return (
        TYPE_6_LETTERS.includes(p.letter) &&
        p.startPlacement === startPlacement &&
        p.endPlacement === startPlacement
      );
    });

    if (validStartPlacements.length === 0) {
      return {
        word,
        steps: [],
        startPlacement: "",
        endPlacement: "",
        isValid: false,
        error: `No Type 6 static letter found at position ${startPlacement}`,
      };
    }

    const startPictograph = this.pickRandom(validStartPlacements);
    if (!startPictograph) {
      return {
        word,
        steps: [],
        startPlacement: "",
        endPlacement: "",
        isValid: false,
        error: "Failed to pick start position",
      };
    }

    // Add start position as step 0
    steps.push(this.toSequenceStep(startPictograph, 0, 0));

    // Add first letter as step 1
    steps.push(this.toSequenceStep(firstVariation, firstVariationIndex, 1));

    // Walk through remaining letters
    let currentEndPlacement = firstVariation.endPlacement;

    for (let i = 1; i < letters.length; i++) {
      const letter = letters[i];
      if (!letter) continue;

      const variations = allPictographs.filter(
        (p) => p.letter === letter && p.startPlacement === currentEndPlacement
      );

      if (variations.length === 0) {
        return {
          word,
          steps: [],
          startPlacement: "",
          endPlacement: "",
          isValid: false,
          error: `No valid continuation for letter "${letter}" from position ${currentEndPlacement}`,
        };
      }

      const chosenVariation = this.pickRandom(variations);
      if (!chosenVariation) {
        return {
          word,
          steps: [],
          startPlacement: "",
          endPlacement: "",
          isValid: false,
          error: `Failed to pick variation for letter "${letter}"`,
        };
      }

      const allLetterVariations = allPictographs.filter(
        (p) => p.letter === letter
      );
      const variationIndex = allLetterVariations.indexOf(chosenVariation);

      steps.push(
        this.toSequenceStep(
          chosenVariation,
          variationIndex >= 0 ? variationIndex : 0,
          i + 1
        )
      );

      currentEndPlacement = chosenVariation.endPlacement;
    }

    return {
      word,
      steps,
      startPlacement,
      endPlacement: currentEndPlacement,
      isValid: true,
    };
  }

  private toSequenceStep(
    pictograph: PictographData,
    variation: number,
    stepNumber: number
  ): SequenceStep {
    return {
      letter: pictograph.letter,
      variation,
      startPlacement: pictograph.startPlacement,
      endPlacement: pictograph.endPlacement,
      stepNumber,
      leftMotion: {
        motionType: pictograph.leftMotion.motionType,
        startLocation: pictograph.leftMotion.startLocation,
        endLocation: pictograph.leftMotion.endLocation,
        rotationDirection: pictograph.leftMotion.rotationDirection,
      },
      rightMotion: {
        motionType: pictograph.rightMotion.motionType,
        startLocation: pictograph.rightMotion.startLocation,
        endLocation: pictograph.rightMotion.endLocation,
        rotationDirection: pictograph.rightMotion.rotationDirection,
      },
    };
  }

  private pickRandom<T>(items: T[]): T | null {
    if (items.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * items.length);
    return items[randomIndex] ?? null;
  }
}
