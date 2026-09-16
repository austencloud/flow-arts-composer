import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { BetaDetector } from "$lib/shared/pictograph/prop/services/beta-detector";

/**
 * Circular Sequence Type
 */
export type CircularType = "same" | "halved" | "quartered";

/**
 * LOOP (Linked Orbital Offset Pattern) Type
 */
export type StrictLoopType =
  | "rotated"
  | "mirrored"
  | "rotated-mirrored"
  | "static";

/**
 * Circularity Analysis Result
 */
export interface CircularityAnalysis {
  /** Whether the sequence forms a valid circular pattern */
  readonly isCircular: boolean;
  /** Type of circular relationship (same/halved/quartered) */
  readonly circularType: CircularType | null;
  /** Starting placement of the sequence */
  readonly startPlacement: GridPlacement | null;
  /** Ending placement of the sequence */
  readonly endPlacement: GridPlacement | null;
  /** Whether start placement is a beta placement */
  readonly startIsBeta: boolean;
  /** Whether end placement is a beta placement */
  readonly endIsBeta: boolean;
  /** Possible LOOP types this sequence could become */
  readonly possibleLoopTypes: readonly StrictLoopType[];
  /** Human-readable description of the circular relationship */
  readonly description: string;
}
import {
  HALVED_LOOPS,
  QUARTERED_LOOPS,
} from "../../generate/circular/domain/constants/circular-placement-maps";
import {
  SWAPPED_PLACEMENT_MAP,
  VERTICAL_MIRROR_PLACEMENT_MAP,
} from "../../generate/circular/domain/constants/strict-loop-placement-maps";

/**
 * Sequence Analysis Service Implementation
 *
 * Analyzes sequences to detect circular patterns and LOOP (Linked Orbital Offset Pattern) potential.
 *
 * Key Concepts:
 * - Circular sequences can be "autocompleted" by applying LOOP transformations
 * - The start→end placement relationship determines which LOOP types are possible
 * - Uses predefined position maps (quartered, halved, mirrored, swapped, inverted)
 * - Intermediate pictographs are irrelevant - only start/end placements matter
 */
export class SequenceAnalyzer {
  constructor(private readonly BetaDetector: BetaDetector) {}

  /**
   * Analyze a sequence for circular properties
   */
  analyzeCircularity(sequence: SequenceData): CircularityAnalysis {
    const startStep = this.getStartBeat(sequence);
    const endStep = this.getEndBeat(sequence);

    // Default non-circular result
    const defaultResult: CircularityAnalysis = {
      isCircular: false,
      circularType: null,
      startPlacement: null,
      endPlacement: null,
      startIsBeta: false,
      endIsBeta: false,
      possibleLoopTypes: [],
      description: "Not circular",
    };

    // Check if we have valid start and end steps
    if (!startStep || !endStep) {
      return defaultResult;
    }

    // Get start and end placements
    const startPlacement = startStep.startPlacement;
    const endPlacement = endStep.endPlacement;

    if (!startPlacement || !endPlacement) {
      return defaultResult;
    }

    // Check if both placements are in the same placement group
    const sameGroup = this.areSamePlacementGroup(startPlacement, endPlacement);
    const startIsBeta = this.isBetaPlacement(startPlacement);
    const endIsBeta = this.isBetaPlacement(endPlacement);

    if (!sameGroup) {
      return {
        ...defaultResult,
        startPlacement,
        endPlacement,
        startIsBeta,
        endIsBeta,
        description: "Placements are not in the same placement group",
      };
    }

    // Determine circular type
    const circularType = this.getCircularType(startPlacement, endPlacement);

    if (!circularType) {
      return {
        ...defaultResult,
        startPlacement,
        endPlacement,
        startIsBeta,
        endIsBeta,
        description: "Invalid circular relationship",
      };
    }

    // Get possible LOOP types based on circular type
    const possibleLoopTypes =
      this.getPossibleLoopTypesForCircularType(circularType);

    return {
      isCircular: true,
      circularType,
      startPlacement,
      endPlacement,
      startIsBeta,
      endIsBeta,
      possibleLoopTypes,
      description: this.buildCircularDescription(
        startPlacement,
        endPlacement,
        circularType
      ),
    };
  }

  /**
   * Check if a sequence is circular-capable (simple boolean check)
   */
  isCircularCapable(sequence: SequenceData): boolean {
    const analysis = this.analyzeCircularity(sequence);
    return analysis.isCircular;
  }

  /**
   * Get possible LOOP types for a circular sequence
   */
  getPossibleLoopTypes(sequence: SequenceData): readonly StrictLoopType[] {
    const analysis = this.analyzeCircularity(sequence);
    return analysis.possibleLoopTypes;
  }

  /**
   * Determine the circular relationship between two placements
   *
   * Uses the predefined transformation maps to check if the start→end pair
   * exists in any of the LOOP validation sets:
   * - Same placement → 'same' (inverted, mirrored, swapped)
   * - Quartered map → 'quartered' (90° rotation)
   * - Halved map → 'halved' (180° rotation)
   */
  getCircularType(
    startPlacement: GridPlacement,
    endPlacement: GridPlacement
  ): CircularType | null {
    const placementKey = `${startPlacement},${endPlacement}`;

    // Check if same placement (inverted LOOP)
    if (startPlacement === endPlacement) {
      return "same";
    }

    // Check quartered LOOPs (90° rotation)
    if (QUARTERED_LOOPS.has(placementKey)) {
      return "quartered";
    }

    // Check halved LOOPs (180° rotation)
    if (HALVED_LOOPS.has(placementKey)) {
      return "halved";
    }

    // Check mirrored placements (also 'same' type)
    if (VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement] === endPlacement) {
      return "same";
    }

    // Check swapped placements (also 'halved' type since alpha1→alpha5 is both)
    if (SWAPPED_PLACEMENT_MAP[startPlacement] === endPlacement) {
      return "halved";
    }

    return null;
  }

  /**
   * Check if a placement is a beta placement
   */
  isBetaPlacement(placement: GridPlacement): boolean {
    return this.BetaDetector.isBetaPlacement(placement);
  }

  /**
   * Check if both placements are in the same placement group
   */
  private areSamePlacementGroup(
    pos1: GridPlacement,
    pos2: GridPlacement
  ): boolean {
    const info1 = this.extractPlacementInfo(pos1);
    const info2 = this.extractPlacementInfo(pos2);

    if (!info1 || !info2) return false;

    return info1.group === info2.group;
  }

  /**
   * Get the first beat with valid pictograph data (start beat)
   */
  getStartBeat(sequence: SequenceData): StepData | null {
    if (!sequence.steps || sequence.steps.length === 0) {
      return null;
    }

    // Find first beat with a start placement
    for (const step of sequence.steps) {
      if (step.startPlacement && !step.isBlank) {
        return step;
      }
    }

    return null;
  }

  /**
   * Get the last beat with valid pictograph data (end beat)
   */
  getEndBeat(sequence: SequenceData): StepData | null {
    if (!sequence.steps || sequence.steps.length === 0) {
      return null;
    }

    // Find last beat with an end placement (iterate backwards)
    for (let i = sequence.steps.length - 1; i >= 0; i--) {
      const beat = sequence.steps[i];
      if (beat?.endPlacement && !beat.isBlank) {
        return beat;
      }
    }

    return null;
  }

  /**
   * Get a human-readable description of the circular relationship
   */
  getCircularDescription(analysis: CircularityAnalysis): string {
    return analysis.description;
  }

  /**
   * Detect the actual LOOP type of a COMPLETED sequence
   *
   * Analyzes ALL consecutive beat transformations to determine what type
   * of completed LOOP pattern the sequence represents.
   */
  detectCompletedLoopTypes(sequence: SequenceData): readonly StrictLoopType[] {
    if (!sequence.steps || sequence.steps.length === 0) {
      return [];
    }

    // Filter out blank steps
    const validSteps = sequence.steps.filter(
      (step) => !step.isBlank && step.endPlacement
    );

    if (validSteps.length === 0) {
      return [];
    }

    // Check 1: Static LOOP - all steps at the same placement
    const allSamePlacement = validSteps.every(
      (step) =>
        step.startPlacement === validSteps[0]!.startPlacement &&
        step.endPlacement === validSteps[0]!.endPlacement
    );

    if (allSamePlacement) {
      return ["static"] as const;
    }

    // Build consecutive pairs: each beat's end → next beat's start
    const consecutivePairs: Array<{ from: GridPlacement; to: GridPlacement }> =
      [];

    for (let i = 0; i < validSteps.length; i++) {
      const currentStep = validSteps[i];
      const nextStep = validSteps[(i + 1) % validSteps.length]; // Wrap around to first beat

      if (
        currentStep &&
        nextStep &&
        currentStep.endPlacement &&
        nextStep.startPlacement
      ) {
        consecutivePairs.push({
          from: currentStep.endPlacement,
          to: nextStep.startPlacement,
        });
      }
    }

    if (consecutivePairs.length === 0) {
      return [];
    }

    // Check 2: Rotated LOOP - all consecutive pairs show 90° rotation
    const allQuartered = consecutivePairs.every((pair) => {
      const key = `${pair.from},${pair.to}`;
      return QUARTERED_LOOPS.has(key);
    });

    if (allQuartered) {
      return ["rotated"] as const;
    }

    // Check 3: Mirrored LOOP - all consecutive pairs show mirroring
    const allMirrored = consecutivePairs.every((pair) => {
      const key = `${pair.from},${pair.to}`;

      // Check halved caps (180° mirroring)
      if (HALVED_LOOPS.has(key)) {
        return true;
      }

      // Check vertical mirror map
      if (VERTICAL_MIRROR_PLACEMENT_MAP[pair.from] === pair.to) {
        return true;
      }

      // Check swapped placements
      if (SWAPPED_PLACEMENT_MAP[pair.from] === pair.to) {
        return true;
      }

      // Check if same placement (like alpha1 → alpha1 with mirrored turns)
      if (pair.from === pair.to) {
        return true;
      }

      return false;
    });

    if (allMirrored) {
      return ["mirrored"] as const;
    }

    // If none of the patterns match, return empty
    return [];
  }

  /**
   * Get possible LOOP types based on circular type
   *
   * Mapping:
   * - 'same' → ['static']
   * - 'halved' → ['mirrored']
   * - 'quartered' → ['rotated']
   */
  private getPossibleLoopTypesForCircularType(
    circularType: CircularType
  ): readonly StrictLoopType[] {
    switch (circularType) {
      case "same":
        return ["static"] as const;
      case "halved":
        return ["mirrored"] as const;
      case "quartered":
        return ["rotated"] as const;
    }
  }

  /**
   * Build a human-readable description
   */
  private buildCircularDescription(
    startPlacement: GridPlacement,
    endPlacement: GridPlacement,
    circularType: CircularType
  ): string {
    const typeDescriptions: Record<CircularType, string> = {
      same: "Same placement",
      halved: "Opposite/halved placement (180°)",
      quartered: "Adjacent/quartered placement (90°)",
    };

    const typeDesc = typeDescriptions[circularType];
    return `${typeDesc}: ${startPlacement} → ${endPlacement}`;
  }

  /**
   * Extract placement group and number from a GridPlacement
   */
  private extractPlacementInfo(
    placement: GridPlacement
  ): { group: string; number: number; groupSize: number } | null {
    const placementStr = placement.toString().toLowerCase();
    const match = placementStr.match(/^(alpha|beta|gamma)(\d+)$/);
    if (!match) return null;

    const group = match[1]!;
    const num = parseInt(match[2]!, 10);

    let groupSize: number;
    let maxNum: number;

    if (group === "alpha" || group === "beta") {
      groupSize = 8;
      maxNum = 8;
    } else if (group === "gamma") {
      groupSize = 16;
      maxNum = 16;
    } else {
      return null;
    }

    if (num < 1 || num > maxNum) {
      return null;
    }

    return { group, number: num, groupSize };
  }

  // ============ Placement Extraction Methods ============

  /**
   * Get the starting placement from a sequence.
   * Checks multiple possible locations for start placement data.
   */
  getStartPlacement(sequence: SequenceData): GridPlacement | null {
    // Check for explicit start placement data object
    if (sequence.startPlacement) {
      const startPosData = sequence.startPlacement as unknown as Record<
        string,
        unknown
      >;

      // Internal format: startPlacement field
      if ("startPlacement" in startPosData && startPosData.startPlacement) {
        return startPosData.startPlacement as GridPlacement;
      }
      // External/JSON format: start field
      if ("start" in startPosData && startPosData.start) {
        return startPosData.start as GridPlacement;
      }
      // gridPlacement field (StartPlacementData format)
      if ("gridPlacement" in startPosData && startPosData.gridPlacement) {
        return startPosData.gridPlacement as GridPlacement;
      }
    }

    // Check for startingPlacement (legacy field)
    const startStep = sequence.startingPlacement as
      | Record<string, unknown>
      | undefined;
    if (startStep) {
      if ("startPlacement" in startStep && startStep.startPlacement) {
        return startStep.startPlacement as GridPlacement;
      }
      if ("start" in startStep && startStep.start) {
        return startStep.start as GridPlacement;
      }
    }

    // Check first beat (beat 0) if it's the start placement
    const steps = sequence.steps || [];
    const firstStep = steps.find(
      (b) =>
        b.stepNumber === 0 ||
        (b as unknown as Record<string, unknown>).beat === 0
    );
    if (firstStep) {
      const stepData = firstStep as unknown as Record<string, unknown>;
      if (stepData.startPlacement) {
        return stepData.startPlacement as GridPlacement;
      }
      if (stepData.start) {
        return stepData.start as GridPlacement;
      }
    }

    return null;
  }

  /**
   * Get the current end placement from the last beat in a sequence.
   */
  getCurrentEndPlacement(sequence: SequenceData): GridPlacement | null {
    const steps = sequence.steps || [];
    if (steps.length === 0) return null;

    // Helper to get beat number from either format
    const getStepNumber = (beat: Record<string, unknown>): number => {
      if (typeof beat.stepNumber === "number") return beat.stepNumber;
      if (typeof beat.beat === "number") return beat.beat;
      return 0;
    };

    // Helper to get end placement from either format
    const getEndPlacement = (beat: Record<string, unknown>): string | null => {
      if (beat.endPlacement) return beat.endPlacement as string;
      if (beat.end) return beat.end as string;
      return null;
    };

    // Find the last actual beat (not the start placement beat 0)
    const beatsAsRecords = steps as unknown as Record<string, unknown>[];
    const sortedSteps = [...beatsAsRecords].sort(
      (a, b) => getStepNumber(b) - getStepNumber(a)
    );
    const lastStep =
      sortedSteps.find((b) => getStepNumber(b) > 0) || sortedSteps[0];

    if (lastStep) {
      const endPos = getEndPlacement(lastStep);
      if (endPos) {
        return endPos as GridPlacement;
      }
    }

    return null;
  }

  /**
   * Convert a SequenceData to StepData array for LOOP executor.
   * The LOOP executor expects: [startPlacement (beat 0), beat 1, beat 2, ...]
   */
  convertSequenceToBeats(sequence: SequenceData): StepData[] {
    const steps = sequence.steps || [];
    const result: StepData[] = [];

    // Check if beat 0 (start placement) is already in steps array
    const step0 = steps.find((b) => b.stepNumber === 0);

    if (step0) {
      // Beat 0 exists in the array, just sort and return
      return [...steps]
        .filter((b) => b.stepNumber >= 0)
        .sort((a, b) => a.stepNumber - b.stepNumber);
    }

    // Beat 0 not in array - need to create it from startPlacement/startingPlacement
    const startPosData =
      sequence.startPlacement || sequence.startingPlacement;

    if (startPosData) {
      const startPos = this.getStartPlacement(sequence);
      // Create a beat 0 entry from the start placement data. The factory fills
      // any missing hand with an invisible placeholder (both-required shape).
      const startStep: StepData = createStepData({
        id: "start-placement",
        stepNumber: 0,
        startPlacement: startPos,
        endPlacement: startPos, // Start placement ends where it starts
        letter: null,
        motions: (startPosData as unknown as {
          motions?: Partial<Record<HandSide, MotionData | undefined>>;
        }).motions,
        duration: 1,
        isBlank: false,
      });
      result.push(startStep);
    }

    // Add all actual steps (beat 1+)
    const actualSteps = steps
      .filter((b) => b.stepNumber > 0)
      .sort((a, b) => a.stepNumber - b.stepNumber);

    result.push(...actualSteps);

    return result;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { betaDetector } from "$lib/shared/pictograph/prop/services/beta-detector";

export const sequenceAnalyzer = new SequenceAnalyzer(betaDetector);
