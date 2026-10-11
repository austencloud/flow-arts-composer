/**
 * rotation-direction-pattern-manager.ts
 *
 * Handles extraction, application, and persistence of rotation direction patterns.
 * Rotation direction patterns capture rotation direction (CW/CCW) per beat to transform sequences.
 *
 * Key difference from Turn Pattern Service:
 * - Turn patterns modify the NUMBER of turns (0, 1, 2, fl, etc.)
 * - This module modifies the DIRECTION of rotation (CW vs CCW)
 * - This module NEVER adds or removes turns - only changes direction where rotation exists
 *
 * Critical behavior when applying:
 * - PRO/ANTI flip when rotation direction changes (matches RotationDirectionHandler)
 * - Floats are skipped (they have no rotation)
 * - DASH/STATIC at 0 turns are skipped (don't add rotation)
 */

import type { Timestamp } from "firebase/firestore";
import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type {
  RotationDirectionPattern,
  RotationDirectionPatternCreateData,
  RotationDirectionPatternEntry,
  RotationDirectionValue,
} from "../domain/models/rotation-direction-pattern-data";
import type { TargetHand } from "#lib/shared/create/services/turn-pattern-manager.js";

/**
 * Result of applying a rotation direction pattern to a sequence
 */
export interface RotationDirectionPatternApplyResult {
  /** Whether the application was successful */
  readonly success: boolean;
  /** The modified sequence (if successful) */
  readonly sequence?: SequenceData;
  /** Error message if not successful */
  readonly error?: string;
  /** Number of steps that were modified */
  readonly modifiedSteps?: number;
  /** Warnings about edge cases encountered (e.g., skipped motions) */
  readonly warnings?: readonly string[];
}
import {
  createMotionData,
  isVisibleMotion,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  RotationDirection,
  type Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { motionQueryHandler } from "#lib/shared/pictograph/shared/services/motion-query-handler.js";
import { calculateEndOrientation } from "#lib/shared/pictograph/prop/services/orientation-calculator.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";

const logger = createComponentLogger("RotationDirectionPatternManager");

/**
 * Extract a rotation direction pattern from a sequence.
 *
 * Rules for extraction:
 * - FLOAT → "none" (floats have no rotation)
 * - STATIC @ 0 turns → "none"
 * - DASH @ 0 turns → "none"
 * - PRO/ANTI/DASH/STATIC with turns > 0 → actual direction ("cw" or "ccw")
 */
export function extractPattern(
  sequence: SequenceData,
  name: string
): RotationDirectionPatternCreateData {
  const entries: RotationDirectionPatternEntry[] = [];

  for (let i = 0; i < sequence.steps.length; i++) {
    const beat = sequence.steps[i];
    if (!beat) continue;

    // Invisible placeholders must extract as null ("skip this hand" in
    // applyPattern) — otherwise placeholder rotation values get baked into
    // saved patterns. Mirrors turn-pattern-manager's extract side
    // (Wave 0 straggler fix).
    const leftMotion = isVisibleMotion(beat.motions?.left)
      ? beat.motions.left
      : undefined;
    const rightMotion = isVisibleMotion(beat.motions?.right)
      ? beat.motions.right
      : undefined;

    entries.push({
      stepIndex: i,
      left: leftMotion ? extractRotationDirection(leftMotion) : null,
      right: rightMotion ? extractRotationDirection(rightMotion) : null,
    });
  }

  return {
    name,
    userId: "", // Will be set when saving
    stepCount: sequence.steps.length,
    entries,
  };
}

/**
 * Apply a rotation direction pattern to a sequence.
 *
 * Key behavior: NEVER adds or removes turns - only modifies direction.
 */
export async function applyPattern(
  pattern: RotationDirectionPattern,
  sequence: SequenceData,
  targetHand: TargetHand = "both"
): Promise<RotationDirectionPatternApplyResult> {
  // Validate beat count match
  const validation = validateForSequence(pattern, sequence);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const warnings: string[] = [];
  let modifiedSteps = 0;
  const modifiedBeatIndices: number[] = [];

  // Step 1: Apply all rotation direction changes
  const updatedSteps: StepData[] = sequence.steps.map((step, stepIndex) => {
    const entry = pattern.entries.find((e) => e.stepIndex === stepIndex);
    if (!entry) return step;

    let stepModified = false;
    const updatedMotions = { ...step.motions };

    // Apply left-hand rotation direction (if targeting left or both).
    // Invisible placeholder = hand not really there (both-required Step shape).
    if (
      (targetHand === "both" || targetHand === "left") &&
      entry.left !== null &&
      isVisibleMotion(step.motions?.left)
    ) {
      const result = applyRotationToMotion(
        entry.left,
        step.motions.left,
        HandSide.LEFT,
        stepIndex
      );
      if (result.motion) {
        updatedMotions.left = result.motion;
        stepModified = true;
      }
      if (result.warning) {
        warnings.push(`Beat ${stepIndex + 1} left: ${result.warning}`);
      }
    }

    // Apply right-hand rotation direction (if targeting right or both)
    if (
      (targetHand === "both" || targetHand === "right") &&
      entry.right !== null &&
      isVisibleMotion(step.motions?.right)
    ) {
      const result = applyRotationToMotion(
        entry.right,
        step.motions.right,
        HandSide.RIGHT,
        stepIndex
      );
      if (result.motion) {
        updatedMotions.right = result.motion;
        stepModified = true;
      }
      if (result.warning) {
        warnings.push(`Beat ${stepIndex + 1} right: ${result.warning}`);
      }
    }

    if (stepModified) {
      modifiedSteps++;
      modifiedBeatIndices.push(stepIndex);
      return { ...step, motions: updatedMotions };
    }
    return step;
  });

  // Step 2: Propagate orientations forward through the sequence
  propagateOrientations(updatedSteps);

  // Step 3: Look up correct letters for all modified steps
  const gridMode = sequence.gridMode ?? GridMode.DIAMOND;
  await recalculateLettersForBeats(updatedSteps, modifiedBeatIndices, gridMode);

  // Create updated sequence
  const updatedSequence: SequenceData = {
    ...sequence,
    steps: updatedSteps,
  };

  logger.log(
    `Applied rotation pattern "${pattern.name}" - modified ${modifiedSteps} steps`
  );

  return {
    success: true,
    sequence: updatedSequence,
    modifiedSteps,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Save a rotation direction pattern to Firebase
 */
export async function savePattern(
  data: RotationDirectionPatternCreateData,
  userId: string
): Promise<RotationDirectionPattern> {
  const firestore = await getFirestoreInstance();
  const patternsRef = collection(
    firestore,
    "users",
    userId,
    "rotationDirectionPatterns"
  );

  const docData = {
    name: data.name,
    userId,
    stepCount: data.stepCount,
    entries: data.entries,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(patternsRef, docData);

  logger.log(`Saved rotation pattern "${data.name}" with ID ${docRef.id}`);

  return {
    id: docRef.id,
    name: data.name,
    userId,
    stepCount: data.stepCount,
    entries: data.entries,
    createdAt: null as Timestamp | null, // Will be populated by Firestore
  };
}

/**
 * Load all rotation direction patterns for a user
 */
export async function loadPatterns(
  userId: string
): Promise<RotationDirectionPattern[]> {
  const firestore = await getFirestoreInstance();
  const patternsRef = collection(
    firestore,
    "users",
    userId,
    "rotationDirectionPatterns"
  );
  const q = query(patternsRef, orderBy("createdAt", "desc"));

  const snapshot = await getDocs(q);
  const patterns: RotationDirectionPattern[] = [];

  snapshot.forEach((doc) => {
    const data = doc.data();
    patterns.push({
      id: doc.id,
      name: data.name,
      userId: data.userId,
      stepCount: data.stepCount,
      entries: data.entries,
      createdAt: data.createdAt,
    });
  });

  logger.log(`Loaded ${patterns.length} rotation patterns for user ${userId}`);
  return patterns;
}

/**
 * Delete a rotation direction pattern
 */
export async function deletePattern(
  patternId: string,
  userId: string
): Promise<void> {
  const firestore = await getFirestoreInstance();
  const patternRef = doc(
    firestore,
    "users",
    userId,
    "rotationDirectionPatterns",
    patternId
  );
  await deleteDoc(patternRef);
  logger.log(`Deleted rotation pattern ${patternId}`);
}

/**
 * Validate that a pattern can be applied to a sequence
 */
export function validateForSequence(
  pattern: RotationDirectionPattern,
  sequence: SequenceData
): { valid: boolean; error?: string } {
  if (pattern.stepCount !== sequence.steps.length) {
    return {
      valid: false,
      error: `Pattern has ${pattern.stepCount} steps but sequence has ${sequence.steps.length} steps`,
    };
  }
  return { valid: true };
}

// ============================================================================
// MOTION TYPE DERIVATION
// ============================================================================

// CW hand orbital pairs: startLocation → endLocation traces a clockwise arc
const CW_PAIRS: [string, string][] = [
  ["s", "w"],
  ["w", "n"],
  ["n", "e"],
  ["e", "s"],
  ["ne", "se"],
  ["se", "sw"],
  ["sw", "nw"],
  ["nw", "ne"],
];

// CCW hand orbital pairs
const CCW_PAIRS: [string, string][] = [
  ["w", "s"],
  ["n", "w"],
  ["e", "n"],
  ["s", "e"],
  ["ne", "nw"],
  ["nw", "sw"],
  ["sw", "se"],
  ["se", "ne"],
];

function deriveHandOrbitalDirection(
  startLocation: string,
  endLocation: string
): RotationDirection | null {
  const s = startLocation.toLowerCase();
  const e = endLocation.toLowerCase();

  if (CW_PAIRS.some(([a, b]) => a === s && b === e))
    return RotationDirection.CLOCKWISE;
  if (CCW_PAIRS.some(([a, b]) => a === s && b === e))
    return RotationDirection.COUNTER_CLOCKWISE;

  return null;
}

function deriveMotionType(
  motion: MotionData,
  newRotationDirection: RotationDirection
): MotionType {
  if (
    motion.motionType !== MotionType.PRO &&
    motion.motionType !== MotionType.ANTI
  ) {
    return motion.motionType;
  }

  const handDirection = deriveHandOrbitalDirection(
    motion.startLocation,
    motion.endLocation
  );

  if (!handDirection) {
    return motion.motionType;
  }

  return newRotationDirection === handDirection
    ? MotionType.PRO
    : MotionType.ANTI;
}

// ============================================================================
// MODULE-PRIVATE HELPERS
// ============================================================================

function extractRotationDirection(motion: MotionData): RotationDirectionValue {
  const { motionType, turns, rotationDirection } = motion;

  if (motionType === MotionType.FLOAT) {
    return "none";
  }

  if (
    (motionType === MotionType.STATIC || motionType === MotionType.DASH) &&
    turns === 0
  ) {
    return "none";
  }

  if (rotationDirection === RotationDirection.NO_ROTATION) {
    return "none";
  }

  if (rotationDirection === RotationDirection.CLOCKWISE) {
    return "cw";
  }
  if (rotationDirection === RotationDirection.COUNTER_CLOCKWISE) {
    return "ccw";
  }

  return "none";
}

async function recalculateLettersForBeats(
  steps: StepData[],
  modifiedBeatIndices: number[],
  gridMode: GridMode
): Promise<void> {
  for (const stepIndex of modifiedBeatIndices) {
    const beat = steps[stepIndex];
    if (!beat) continue;

    const leftMotion = beat.motions?.left;
    const rightMotion = beat.motions?.right;

    if (!leftMotion || !rightMotion) continue;

    try {
      const foundLetter =
        await motionQueryHandler.findLetterByMotionConfiguration(
          leftMotion,
          rightMotion,
          gridMode
        );

      if (foundLetter) {
        const newLetter = foundLetter as Letter;
        if (newLetter !== beat.letter) {
          logger.log(
            `Beat ${stepIndex + 1}: Updated letter "${beat.letter}" → "${newLetter}"`
          );
          steps[stepIndex] = createStepData({
            ...beat,
            letter: newLetter,
          });
        }
      } else {
        logger.warn(
          `Beat ${stepIndex + 1}: Could not find letter for modified motion configuration`
        );
      }
    } catch (error) {
      logger.warn(`Beat ${stepIndex + 1}: Error looking up letter:`, error);
    }
  }
}

function applyRotationToMotion(
  patternValue: RotationDirectionValue,
  currentMotion: MotionData,
  color: HandSide,
  _stepIndex: number
): { motion: MotionData | null; warning?: string } {
  const { motionType, turns, rotationDirection } = currentMotion;

  if (motionType === MotionType.FLOAT) {
    return { motion: null, warning: "Skipped float (no rotation)" };
  }

  if (motionType === MotionType.STATIC && turns === 0) {
    return { motion: null, warning: "Skipped static@0 (no rotation)" };
  }

  if (motionType === MotionType.DASH && turns === 0) {
    return { motion: null, warning: "Skipped dash@0 (no rotation)" };
  }

  if (patternValue === "none") {
    return { motion: null };
  }

  const newRotationDirection =
    patternValue === "cw"
      ? RotationDirection.CLOCKWISE
      : RotationDirection.COUNTER_CLOCKWISE;

  if (rotationDirection === newRotationDirection) {
    return { motion: null };
  }

  const newMotionType = deriveMotionType(currentMotion, newRotationDirection);

  const tempMotion = createMotionData({
    ...currentMotion,
    rotationDirection: newRotationDirection,
    motionType: newMotionType,
  });
  const newEndOrientation = calculateEndOrientation(tempMotion, color);

  return {
    motion: createMotionData({
      ...currentMotion,
      rotationDirection: newRotationDirection,
      motionType: newMotionType,
      endOrientation: newEndOrientation,
    }),
  };
}

function propagateOrientations(steps: StepData[]): void {
  for (let i = 0; i < steps.length - 1; i++) {
    const currentStep = steps[i];
    const nextStep = steps[i + 1];
    if (!currentStep || !nextStep) continue;

    if (
      isVisibleMotion(currentStep.motions?.left) &&
      isVisibleMotion(nextStep.motions?.left)
    ) {
      const currentEndOrientation = currentStep.motions.left.endOrientation;
      const nextStartOrientation = nextStep.motions.left.startOrientation;

      if (currentEndOrientation !== nextStartOrientation) {
        const updatedNextMotion = updateMotionStartOrientation(
          nextStep.motions.left,
          currentEndOrientation,
          HandSide.LEFT
        );

        steps[i + 1] = {
          ...nextStep,
          motions: {
            ...nextStep.motions,
            left: updatedNextMotion,
          },
        };
      }
    }

    if (
      isVisibleMotion(currentStep.motions?.right) &&
      isVisibleMotion(nextStep.motions?.right)
    ) {
      const currentEndOrientation = currentStep.motions.right.endOrientation;
      const nextStartOrientation = nextStep.motions.right.startOrientation;

      if (currentEndOrientation !== nextStartOrientation) {
        const updatedNextMotion = updateMotionStartOrientation(
          nextStep.motions.right,
          currentEndOrientation,
          HandSide.RIGHT
        );

        const latestNextStep = steps[i + 1];
        if (!latestNextStep) continue;
        steps[i + 1] = {
          ...latestNextStep,
          motions: {
            ...latestNextStep.motions,
            right: updatedNextMotion,
          },
        };
      }
    }
  }
}

function updateMotionStartOrientation(
  motion: MotionData,
  newStartOrientation: Orientation,
  color: HandSide
): MotionData {
  const tempMotion = createMotionData({
    ...motion,
    startOrientation: newStartOrientation,
  });

  const newEndOrientation = calculateEndOrientation(tempMotion, color);

  return createMotionData({
    ...motion,
    startOrientation: newStartOrientation,
    endOrientation: newEndOrientation,
  });
}
