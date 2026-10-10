/**
 * duration-pattern-manager.ts
 *
 * Handles extraction, application, and persistence of duration patterns.
 * Duration patterns capture timing multipliers per beat to transform sequences.
 *
 * Unlike turn patterns, duration is a step-level property - it affects
 * the entire beat, not individual motions.
 */

import {
  collection,
  query,
  orderBy,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type {
  DurationPattern,
  DurationPatternCreateData,
  DurationPatternEntry,
} from "../domain/models/duration-pattern-data";
/**
 * Result of applying a duration pattern to a sequence
 */
export interface DurationPatternApplyResult {
  /** Whether the application was successful */
  readonly success: boolean;
  /** The modified sequence (if successful) */
  readonly sequence?: SequenceData;
  /** Error message if not successful */
  readonly error?: string;
  /** Number of steps that were modified */
  readonly modifiedSteps?: number;
  /** Warnings about edge cases encountered */
  readonly warnings?: readonly string[];
}
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";

const logger = createComponentLogger("DurationPatternManager");

/**
 * Extract a duration pattern from a sequence
 */
export function extractPattern(
  sequence: SequenceData,
  name: string
): DurationPatternCreateData {
  const entries: DurationPatternEntry[] = [];

  for (let i = 0; i < sequence.steps.length; i++) {
    const step = sequence.steps[i];
    if (!step) continue;

    // Duration is stored at the step level, default to 1.0 if not set
    const duration = step.duration ?? 1.0;

    entries.push({
      stepIndex: i,
      duration,
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
 * Validate that a pattern can be applied to a sequence
 */
export function validateForSequence(
  pattern: DurationPattern,
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

/**
 * Apply a duration pattern to a sequence
 */
export function applyPattern(
  pattern: DurationPattern,
  sequence: SequenceData
): DurationPatternApplyResult {
  // Validate beat count match
  const validation = validateForSequence(pattern, sequence);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const warnings: string[] = [];
  let modifiedSteps = 0;

  // Apply duration changes
  const updatedSteps: StepData[] = sequence.steps.map((step, stepIndex) => {
    const entry = pattern.entries.find((e) => e.stepIndex === stepIndex);
    if (!entry) return step;

    const currentDuration = step.duration ?? 1.0;
    const newDuration = entry.duration;

    // Only mark as modified if duration actually changed
    if (Math.abs(currentDuration - newDuration) > 0.001) {
      modifiedSteps++;

      // Validate duration range
      if (newDuration < 0.1) {
        warnings.push(
          `Beat ${stepIndex + 1}: Duration clamped to minimum (0.1)`
        );
      }
      if (newDuration > 10.0) {
        warnings.push(
          `Beat ${stepIndex + 1}: Duration clamped to maximum (10.0)`
        );
      }

      return {
        ...step,
        duration: Math.max(0.1, Math.min(10.0, newDuration)),
      };
    }

    return step;
  });

  // Create updated sequence
  const updatedSequence: SequenceData = {
    ...sequence,
    steps: updatedSteps,
  };

  logger.log(
    `Applied duration pattern "${pattern.name}" - modified ${modifiedSteps} steps`
  );

  return {
    success: true,
    sequence: updatedSequence,
    modifiedSteps,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Save a duration pattern to Firebase
 */
export async function savePattern(
  data: DurationPatternCreateData,
  userId: string
): Promise<DurationPattern> {
  const firestore = await getFirestoreInstance();
  const patternsRef = collection(
    firestore,
    "users",
    userId,
    "durationPatterns"
  );

  const docData = {
    name: data.name,
    userId,
    stepCount: data.stepCount,
    entries: data.entries,
    createdAt: serverTimestamp(),
  };

  const docRef = await addDoc(patternsRef, docData);

  logger.log(`Saved duration pattern "${data.name}" with ID ${docRef.id}`);

  return {
    id: docRef.id,
    name: data.name,
    userId,
    stepCount: data.stepCount,
    entries: data.entries,
    createdAt: null as unknown as Timestamp, // Will be populated by Firestore
  };
}

/**
 * Load all duration patterns for a user
 */
export async function loadPatterns(userId: string): Promise<DurationPattern[]> {
  const firestore = await getFirestoreInstance();
  const patternsRef = collection(
    firestore,
    "users",
    userId,
    "durationPatterns"
  );
  const q = query(patternsRef, orderBy("createdAt", "desc"));

  const snapshot = await getDocs(q);
  const patterns: DurationPattern[] = [];

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

  logger.log(`Loaded ${patterns.length} duration patterns for user ${userId}`);
  return patterns;
}

/**
 * Delete a duration pattern
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
    "durationPatterns",
    patternId
  );
  await deleteDoc(patternRef);
  logger.log(`Deleted duration pattern ${patternId}`);
}
