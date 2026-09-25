/**
 * Sequence Extender Implementation
 *
 * Detects when a sequence is in an extendable state and generates extension steps
 * using the LOOP (Linked Orbital Offset Pattern) executor infrastructure.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { deriveWordFromBeats } from "$lib/shared/foundation/services/word-deriver";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  GridMode,
  type GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { LOOPOption } from "./loop-validator";
import type { OrientationAlignment } from "./orientation-alignment-calculator";
import {
  Period,
  LOOPType,
} from "$lib/shared/foundation/domain/models/generation/circular-models";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { orientationCycleExtender } from "$lib/features/create/generate/circular/services/orientation-cycle-extender";
import { recalculateAllOrientations } from "$lib/shared/create/services/orientation-propagation";

/**
 * Describes the type of extension available for a sequence
 */
export type ExtensionType =
  | "already_complete"
  | "half_rotation"
  | "quarter_rotation"
  | "not_extendable";

/**
 * Result of analyzing whether a sequence can be extended
 */
export interface ExtensionAnalysis {
  /** Whether extension is available */
  canExtend: boolean;
  /** The type of extension possible */
  extensionType: ExtensionType;
  /** Start placement of the sequence */
  startPlacement: GridPlacement | null;
  /** Current end placement of the sequence */
  currentEndPlacement: GridPlacement | null;
  /** Available LOOP options for extension */
  availableLOOPOptions: LOOPOption[];
  /** Unavailable LOOP options */
  unavailableLOOPOptions: LOOPOption[];
  /**
   * Set when the sequence returns to its start PLACEMENT but not its start
   * ORIENTATION. `count` is how many total repeats of the sequence bring the
   * props back to their start orientation, so repeating it verbatim closes
   * the loop. Null when orientation already closes (count 1), or when the
   * sequence does not return to its start placement at all.
   */
  orientationRepeat: { count: 2 | 4 | 8 } | null;
  /** Human-readable description of the extension */
  description: string;
}

/**
 * Options for generating extension steps
 */
export interface ExtensionOptions {
  /** The LOOP type to use for extension */
  loopType: LOOPType;
  /** Period override */
  period?: Period;
  /** Difficulty level (1-3) */
  difficulty?: number;
  /** Turn intensity (0-1) */
  turnIntensity?: number;
}

/**
 * Describes the rotation relationship between end placement and start placement.
 */
export type RotationRelation = "exact" | "quarter" | "half";

/**
 * Option for making a non-loopable sequence circular via bridge letter.
 */
export interface CircularizationOption {
  /** Bridge letters needed to reach a loopable placement */
  bridgeLetters: Letter[];
  /** The placement we'd end at after adding bridge letters */
  endPlacement: string;
  /** Available LOOP types for this ending placement */
  availableLOOPs: LOOPOption[];
  /** Description for UI display */
  description: string;
  /** Pictograph data for visual display of the bridge letter */
  pictographData?: PictographData;
  /** Rotation relationship to start placement */
  rotationRelation?: RotationRelation;
  /** Orientation alignment info */
  orientationAlignment?: OrientationAlignment;
  /** Current sequence length */
  currentLength?: number;
  /** Resulting sequence length after applying LOOP with this bridge */
  resultingLength?: number;
}

/**
 * Result of starting an extension flow
 */
export interface ExtensionFlowStart {
  /** Whether extension is possible at all */
  canExtend: boolean;
  /** Analysis of the sequence's extension potential */
  analysis: ExtensionAnalysis | null;
  /** Bridge options if direct LOOPs not available */
  circularizationOptions: CircularizationOption[];
  /** Reason direct extension isn't available (if applicable) */
  directUnavailableReason: string | null;
  /** Error message if extension is impossible */
  errorMessage: string | null;
}

/**
 * Result of appending a bridge beat
 */
export interface BridgeAppendResult {
  /** Whether the bridge was successfully appended */
  success: boolean;
  /** The sequence with bridge appended (if successful) */
  sequence: SequenceData | null;
  /** Updated analysis after adding bridge */
  analysis: ExtensionAnalysis | null;
  /** Message to display to user */
  message: string;
}

/**
 * Result of applying a LOOP extension
 */
export interface ExtensionApplyResult {
  /** Whether the extension was successful */
  success: boolean;
  /** The extended sequence (if successful) */
  sequence: SequenceData | null;
  /** Number of steps added */
  stepsAdded: number;
  /** Message to display to user */
  message: string;
}
import type { ReversalDetector } from "$lib/shared/create/services/reversal-detector";
import type {
  ILetterQueryHandler,
  IMotionQueryHandler,
} from "$lib/shared/foundation/services/data/data-contracts";
import type { stepConverter as StepConverterSingleton } from "$lib/features/create/generate/shared/services/step-converter";
type StepConverter = typeof StepConverterSingleton;
import type { LOOPValidator } from "./loop-validator";
import type { SequenceAnalyzer } from "./sequence-analyzer";
import type { BridgeFinder } from "./bridge-finder";
import {
  HALVED_LOOPS,
  QUARTERED_LOOPS,
} from "$lib/shared/foundation/domain/models/generation/circular-placement-maps";
import {
  completeLOOPExtension,
  LOOPType as EngineLOOPType,
  Period as EnginePeriod,
} from "@tka/sequence-engine/loop";

export class SequenceExtender {
  constructor(
    private reversalDetector: ReversalDetector,
    private letterQueryHandler: ILetterQueryHandler,
    private stepConverter: StepConverter,
    private loopValidator: LOOPValidator,
    private sequenceAnalyzer: SequenceAnalyzer,
    private bridgeFinder: BridgeFinder,
    private motionQueryHandler: IMotionQueryHandler
  ) {}

  /**
   * Analyze a sequence to determine if it can be extended
   */
  analyzeSequence(sequence: SequenceData): ExtensionAnalysis {
    // Get start placement from sequence
    const startPlacement = this.sequenceAnalyzer.getStartPlacement(sequence);
    if (!startPlacement) {
      return {
        canExtend: false,
        extensionType: "not_extendable",
        startPlacement: null,
        currentEndPlacement: null,
        availableLOOPOptions: [],
        unavailableLOOPOptions: [],
        orientationRepeat: null,
        description: "No start placement defined",
      };
    }

    // Get current end placement from the last beat
    const currentEndPlacement =
      this.sequenceAnalyzer.getCurrentEndPlacement(sequence);
    if (!currentEndPlacement) {
      return {
        canExtend: false,
        extensionType: "not_extendable",
        startPlacement,
        currentEndPlacement: null,
        availableLOOPOptions: [],
        unavailableLOOPOptions: [],
        orientationRepeat: null,
        description: "No steps in sequence",
      };
    }

    // Check placement relationships
    const placementPair = `${startPlacement},${currentEndPlacement}`;
    const isHalvedValid = HALVED_LOOPS.has(placementPair);
    const isQuarteredValid = QUARTERED_LOOPS.has(placementPair);
    const isAlreadyComplete = currentEndPlacement === startPlacement;

    // Determine extension type
    let extensionType: ExtensionType = "not_extendable";
    let period = Period.HALVED;

    if (isAlreadyComplete) {
      extensionType = "already_complete";
    } else if (isHalvedValid) {
      extensionType = "half_rotation";
    } else if (isQuarteredValid) {
      extensionType = "quarter_rotation";
      period = Period.QUARTERED;
    }

    // Get LOOP options filtered by validity for this placement pair
    const { available, unavailable } =
      this.loopValidator.getLOOPOptionsForPlacementPair(
        startPlacement,
        currentEndPlacement,
        period
      );

    // A sequence back at its start PLACEMENT can still be open in ORIENTATION.
    // Repeating it verbatim closes that cycle, so it is a real extension
    // option alongside the transform-based LOOPs. Only meaningful when the
    // placement already closed — otherwise repeating walks further away.
    const cycleCount = isAlreadyComplete
      ? orientationCycleExtender.getCycleCount(sequence)
      : 1;
    const orientationRepeat =
      cycleCount > 1 ? { count: cycleCount as 2 | 4 | 8 } : null;

    const canExtend = available.length > 0 || orientationRepeat !== null;

    if (!canExtend) {
      return {
        canExtend: false,
        extensionType: "not_extendable",
        startPlacement,
        currentEndPlacement,
        availableLOOPOptions: [],
        unavailableLOOPOptions: unavailable,
        orientationRepeat: null,
        description: "No extension patterns available for this placement pair",
      };
    }

    let description = "";
    if (isAlreadyComplete) {
      description = `Sequence is complete - ${available.length} LOOP patterns available to extend`;
    } else if (isHalvedValid) {
      description = `${available.length} patterns available (180° rotation)`;
    } else if (isQuarteredValid) {
      description = `${available.length} patterns available (90° rotation)`;
    }

    return {
      canExtend: true,
      extensionType,
      startPlacement,
      currentEndPlacement,
      availableLOOPOptions: available,
      unavailableLOOPOptions: unavailable,
      orientationRepeat,
      description,
    };
  }

  /**
   * Generate steps to extend a sequence back to its starting placement
   */
  async generateExtensionSteps(
    sequence: SequenceData,
    options: ExtensionOptions
  ): Promise<StepData[]> {
    const analysis = this.analyzeSequence(sequence);

    if (!analysis.canExtend) {
      throw new Error(`Cannot extend: ${analysis.description}`);
    }

    const { loopType } = options;
    // Use explicitly provided period, otherwise derive from placement pair analysis
    const period =
      options.period ??
      (analysis.extensionType === "quarter_rotation"
        ? Period.QUARTERED
        : Period.HALVED);

    // Convert sequence to StepData array for the executor
    const sequenceSteps =
      this.sequenceAnalyzer.convertSequenceToBeats(sequence);

    if (sequenceSteps.length === 0) {
      throw new Error("No steps in sequence to extend");
    }

    const completion = completeLOOPExtension(sequenceSteps, {
      loopType: toEngineLOOPType(loopType),
      period:
        period === Period.QUARTERED
          ? EnginePeriod.QUARTERED
          : EnginePeriod.HALVED,
    });

    const derivedStepNumbers = new Set(completion.derivedStepIndices);
    return completion.steps.filter((step) =>
      derivedStepNumbers.has(step.stepNumber)
    ) as StepData[];
  }

  /**
   * Extend a sequence by appending the generated extension steps
   */
  async extendSequence(
    sequence: SequenceData,
    options: ExtensionOptions
  ): Promise<SequenceData> {
    const extensionSteps = await this.generateExtensionSteps(sequence, options);

    if (extensionSteps.length === 0) {
      return sequence;
    }

    // Renumber the extension steps to continue from the existing sequence
    const existingStepCount = sequence.steps?.length || 0;

    // IMPORTANT: The LOOP executors copy the letter from the source step,
    // but the motions are transformed (reversed, rotated, etc.), so the letter
    // is WRONG. We need to derive the correct letter from the transformed motions.
    const stepsWithDerivedLetters = await Promise.all(
      extensionSteps.map(async (beat, index) => {
        const derivedLetter = await this.deriveLetterForStep(
          beat,
          sequence.gridMode || GridMode.DIAMOND
        );
        const hasPairedVisibleMotions =
          isVisibleMotion(beat.motions?.left) &&
          isVisibleMotion(beat.motions?.right);
        if (hasPairedVisibleMotions && !derivedLetter) {
          throw new Error(
            `Cannot derive a canonical letter for generated step ${beat.stepNumber}`
          );
        }
        return {
          ...beat,
          id: crypto.randomUUID(),
          stepNumber: existingStepCount + index + 1,
          // A one-hand placeholder has no paired letter to look up. Its source
          // letter remains the only meaningful label for the extension UI.
          letter: derivedLetter ?? beat.letter,
        };
      })
    );

    // Combine existing steps with extension steps
    const newSteps = [...(sequence.steps || []), ...stepsWithDerivedLetters];

    // Build the updated word from all step letters
    const word = deriveWordFromBeats(newSteps);

    let extendedSequence: SequenceData = {
      ...sequence,
      steps: newSteps,
      word,
      isCircular: true,
      loopType: options.loopType,
    };

    // Process reversals for the extended sequence
    // This detects rotation direction changes between consecutive steps
    return this.reversalDetector.processReversals(extendedSequence);
  }

  /**
   * Derive the correct letter for a step based on its motion configuration.
   * Used after LOOP transformations to find what letter the transformed motions represent.
   */
  private async deriveLetterForStep(
    step: StepData,
    gridMode: GridMode
  ): Promise<Letter | null> {
    const leftMotion = step.motions?.left;
    const rightMotion = step.motions?.right;

    // Invisible placeholder = hand not really there (both-required Step shape).
    if (!isVisibleMotion(leftMotion) || !isVisibleMotion(rightMotion)) {
      return null;
    }

    try {
      const letter =
        await this.motionQueryHandler.findLetterByMotionConfiguration(
          leftMotion,
          rightMotion,
          gridMode
        );
      return letter as Letter | null;
    } catch (error) {
      console.warn(
        `Failed to derive letter for step ${step.stepNumber}:`,
        error
      );
      return null;
    }
  }

  // ============ Bridge Letter Methods ============

  /**
   * Get circularization options for a sequence that isn't directly loopable.
   * Delegates to BridgeFinder.
   */
  async getCircularizationOptions(
    sequence: SequenceData
  ): Promise<CircularizationOption[]> {
    return this.bridgeFinder.getCircularizationOptions(sequence);
  }

  /**
   * Get extension options that would bring the sequence to a loopable placement.
   * Delegates to BridgeFinder.
   */
  async getAllExtensionOptions(
    sequence: SequenceData
  ): Promise<CircularizationOption[]> {
    return this.bridgeFinder.getAllExtensionOptions(sequence);
  }

  /**
   * Append just a bridge beat to a sequence (without applying LOOP).
   * Used when user selects a bridge pictograph and wants to see it in the sequence
   * before choosing which LOOP to apply.
   *
   * @param sequence The sequence to append to
   * @param bridgeLetter The bridge letter to append
   * @param pictographData Optional specific pictograph to use. If provided, this exact
   *        pictograph will be used instead of randomly selecting a variation.
   */
  async appendBridgeBeat(
    sequence: SequenceData,
    bridgeLetter: Letter,
    pictographData?: PictographData
  ): Promise<SequenceData> {
    const endPlacement = this.sequenceAnalyzer.getCurrentEndPlacement(sequence);
    if (!endPlacement) {
      throw new Error("Cannot append bridge: no end placement found");
    }

    const gridMode = sequence.gridMode || GridMode.DIAMOND;

    let bridgeVariation: PictographData;

    // Use the specific pictograph if provided (preferred - ensures correct end placement)
    if (pictographData) {
      // Validate that the provided pictograph starts at the current end placement
      if (pictographData.startPlacement !== endPlacement) {
        throw new Error(
          `Provided pictograph for "${bridgeLetter}" starts at "${pictographData.startPlacement}" but sequence ends at "${endPlacement}"`
        );
      }
      bridgeVariation = pictographData;
    } else {
      // Fallback: Find a pictograph for the bridge letter that starts at current end placement
      const allPictographs =
        await this.letterQueryHandler.getAllPictographVariations(gridMode);

      const bridgeVariations = allPictographs.filter(
        (p) => p.letter === bridgeLetter && p.startPlacement === endPlacement
      );

      if (bridgeVariations.length === 0) {
        throw new Error(
          `No variation of "${bridgeLetter}" starts at placement "${endPlacement}"`
        );
      }

      // Pick a random variation for variety
      const randomIndex = Math.floor(Math.random() * bridgeVariations.length);
      const selected = bridgeVariations[randomIndex];
      if (!selected) {
        throw new Error("Failed to select bridge variation");
      }
      bridgeVariation = selected;
    }

    // Convert to beat and append
    const bridgeBeat = this.stepConverter.convertToStep(
      bridgeVariation,
      (sequence.steps?.length || 0) + 1,
      gridMode
    );

    // Create sequence with bridge letter
    let extendedSequence: SequenceData = {
      ...sequence,
      steps: [...(sequence.steps || []), bridgeBeat],
    };

    // Recalculate orientations
    extendedSequence = recalculateAllOrientations(extendedSequence);

    return extendedSequence;
  }

  /**
   * Extend a sequence by first appending a bridge letter, then applying a LOOP.
   */
  async extendWithBridge(
    sequence: SequenceData,
    bridgeLetter: Letter,
    loopType: LOOPType,
    pictographData?: PictographData,
    period?: Period
  ): Promise<SequenceData> {
    // Use appendBridgeBeat to add the bridge, then apply LOOP
    // Pass pictographData to ensure the exact variation (and thus end placement) is used
    const sequenceWithBridge = await this.appendBridgeBeat(
      sequence,
      bridgeLetter,
      pictographData
    );
    return this.extendSequence(sequenceWithBridge, { loopType, period });
  }
}

function toEngineLOOPType(loopType: LOOPType): EngineLOOPType {
  if (loopType === LOOPType.STRICT_REWOUND) return EngineLOOPType.REWOUND;
  // Every other app LOOP type shares its string value with the engine enum.
  return loopType as unknown as EngineLOOPType;
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
import { stepConverter } from "$lib/features/create/generate/shared/services/step-converter";
import { loopValidator } from "./loop-validator";
import { sequenceAnalyzer } from "./sequence-analyzer";
import { bridgeFinder } from "./bridge-finder";
import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";

export const sequenceExtender = new SequenceExtender(
  reversalDetector,
  letterQueryHandler,
  stepConverter,
  loopValidator,
  sequenceAnalyzer,
  bridgeFinder,
  motionQueryHandler
);
