/**
 * Sequence Validation Service
 *
 * Pure validation logic for sequences and steps.
 * All functions are pure - return validation results without side effects.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { ValidationResult } from "../../../../shared/validation/validation-result";

/**
 * Interface describing the shape of the sequence validator module.
 * Consumers that previously held a class instance can use this type.
 */
export interface SequenceValidator {
  validateSequence: (sequence: SequenceData) => ValidationResult;
  validateStep: (beat: StepData, expectedStepNumber: number) => string[];
  isValidStepIndex: (sequence: SequenceData | null, stepIndex: number) => boolean;
  validateSequenceName: (name: string) => { isValid: boolean; error?: string };
  validateSequenceLength: (length: number) => { isValid: boolean; error?: string };
}

/**
 * Validate a complete sequence
 */
export function validateSequence(sequence: SequenceData): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name validation
  if (!sequence.name.trim()) {
    errors.push("Sequence name is required");
  }

  // Length validation
  if (sequence.steps.length === 0) {
    warnings.push("Sequence has no steps");
  }

  if (sequence.steps.length > 64) {
    errors.push("Sequence cannot have more than 64 steps");
  }

  // Beat validation
  sequence.steps.forEach((step, index) => {
    const beatErrors = validateStep(step, index);
    errors.push(...beatErrors);
  });

  return {
    isValid: errors.length === 0,
    errors: errors.map((err) => ({
      code: "VALIDATION_ERROR",
      message: err,
      severity: "error" as const,
    })),
    warnings: warnings.map((warn) => ({
      code: "VALIDATION_WARNING",
      message: warn,
    })),
  };
}

/**
 * Validate a single beat
 */
export function validateStep(beat: StepData, expectedStepNumber: number): string[] {
  const errors: string[] = [];

  if (beat.stepNumber !== expectedStepNumber + 1) {
    errors.push(
      `Beat ${expectedStepNumber + 1} has incorrect beat number: ${beat.stepNumber}`
    );
  }

  if (beat.duration <= 0) {
    errors.push(
      `Beat ${expectedStepNumber + 1} has invalid duration: ${beat.duration}`
    );
  }

  return errors;
}

/**
 * Validate beat index is within bounds
 */
export function isValidStepIndex(sequence: SequenceData | null, stepIndex: number): boolean {
  if (!sequence) return false;
  return stepIndex >= 0 && stepIndex < sequence.steps.length;
}

/**
 * Validate sequence name
 */
export function validateSequenceName(name: string): { isValid: boolean; error?: string } {
  if (!name.trim()) {
    return { isValid: false, error: "Sequence name is required" };
  }
  return { isValid: true };
}

/**
 * Validate sequence length
 */
export function validateSequenceLength(length: number): { isValid: boolean; error?: string } {
  if (length < 1 || length > 64) {
    return {
      isValid: false,
      error: "Sequence length must be between 1 and 64 steps",
    };
  }
  return { isValid: true };
}
