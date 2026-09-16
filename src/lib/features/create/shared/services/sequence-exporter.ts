import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

/**
 * Input sequence data structure with required fields for export
 */
export interface ExportableSequenceData {
  word: string;
  startingPlacement?: StepData;
  startPlacement?: StepData;
  steps?: readonly StepData[];
}

/**
 * Condensed sequence data structure
 */
export interface CondensedSequenceData {
  word: string;
  startPlacement?: CondensedStartPlacement;
  steps: CondensedStepData[];
}

/**
 * Condensed start placement data
 */
export interface CondensedStartPlacement {
  letter: string;
  gridPlacement?: string;
  motions: {
    left: CondensedStartMotion;
    right: CondensedStartMotion;
  };
}

/**
 * Condensed start motion data (location and orientation only)
 */
export interface CondensedStartMotion {
  startLocation: string;
  startOrientation: string;
}

/**
 * Condensed step data
 */
export interface CondensedStepData {
  letter: string;
  stepNumber: number;
  gridPlacement?: string;
  duration: number;
  leftReversal: boolean;
  rightReversal: boolean;
  motions: {
    left: CondensedMotionData;
    right: CondensedMotionData;
  };
}

/**
 * Condensed motion data (essential fields only)
 */
export interface CondensedMotionData {
  motionType: string;
  rotationDirection: string;
  startLocation: string;
  endLocation: string;
  turns: number;
  startOrientation: string;
  endOrientation: string;
}

/**
 * sequence-exporter.ts
 *
 * Functions for exporting sequence data in various formats.
 * Pure business logic - no Svelte dependencies.
 */

/**
 * Create a condensed, human-readable version of sequence data.
 * Removes: IDs, placement data, metadata, redundant fields.
 * Keeps: Essential motion data for reconstruction.
 */
export function createCondensedSequence(
  sequenceData: ExportableSequenceData
): CondensedSequenceData {
  const condensed: CondensedSequenceData = {
    word: sequenceData.word,
    steps: [],
  };

  // Include start placement FIRST if it exists
  if (sequenceData.startingPlacement ?? sequenceData.startPlacement) {
    const startPos =
      sequenceData.startingPlacement ?? sequenceData.startPlacement;
    if (startPos) {
      condensed.startPlacement = extractStartPlacement(startPos);
    }
  }

  // Process each beat AFTER start placement
  if (sequenceData.steps) {
    condensed.steps = sequenceData.steps.map((step) => extractStepData(step));
  }

  return condensed;
}


function extractStartPlacement(startPos: StepData): CondensedStartPlacement {
  const letter = startPos.letter ?? "";
  const gridPlacement = startPos.startPlacement ?? undefined;
  const leftMotion = startPos.motions.left;
  const rightMotion = startPos.motions.right;

  return {
    letter,
    gridPlacement,
    motions: {
      left: extractStartMotion(leftMotion),
      right: extractStartMotion(rightMotion),
    },
  };
}

function extractStartMotion(
  motion: MotionData | undefined
): CondensedStartMotion {
  if (!motion) {
    return {
      startLocation: "",
      startOrientation: "",
    };
  }

  return {
    startLocation: motion.startLocation,
    startOrientation: motion.startOrientation,
  };
}

function extractStepData(beat: StepData): CondensedStepData {
  const letter = beat.letter ?? "";
  const gridPlacement = beat.startPlacement ?? undefined;
  const leftMotion = beat.motions.left;
  const rightMotion = beat.motions.right;

  return {
    letter,
    stepNumber: beat.stepNumber,
    gridPlacement,
    duration: beat.duration,
    leftReversal: beat.leftReversal,
    rightReversal: beat.rightReversal,
    motions: {
      left: extractMotionData(leftMotion),
      right: extractMotionData(rightMotion),
    },
  };
}

function extractMotionData(motion: MotionData | undefined): CondensedMotionData {
  if (!motion) {
    return {
      motionType: "",
      rotationDirection: "",
      startLocation: "",
      endLocation: "",
      turns: 0,
      startOrientation: "",
      endOrientation: "",
    };
  }

  return {
    motionType: motion.motionType,
    rotationDirection: motion.rotationDirection,
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    turns: typeof motion.turns === "string" ? 0 : motion.turns,
    startOrientation: motion.startOrientation,
    endOrientation: motion.endOrientation,
  };
}
