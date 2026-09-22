/**
 * sequence-domain-manager.ts
 *
 * Sequence Domain logic - REAL Business Logic from Desktop
 *
 * Ported from desktop.modern.application.services.sequence.beat_sequence_service
 * and desktop.modern.domain.models for actual validation and business rules.
 */

import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type {
  ValidationErrorInfo,
  ValidationResult,
} from "$lib/shared/validation/validation-result";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { deriveWordFromBeats } from "$lib/shared/foundation/services/word-deriver";

import type { SequenceCreateRequest } from "$lib/shared/create/domain/sequence-models";

/**
 * Validate a sequence according to business rules
 */
export function validateSequence(sequence: SequenceData): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!sequence.name || sequence.name.trim().length === 0) {
    errors.push("Sequence name is required");
  }

  if (sequence.name && sequence.name.length > 100) {
    errors.push("Sequence name must be less than 100 characters");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Calculate sequence statistics
 */
export function calculateStatistics(sequence: SequenceData): {
  totalSteps: number;
  filledSteps: number;
  emptySteps: number;
  duration: number;
} {
  const steps = sequence.steps || [];
  const totalSteps = steps.length;
  const filledSteps = steps.filter((b) => !b?.isBlank && b?.letter).length;
  const emptySteps = totalSteps - filledSteps;
  const duration = steps.reduce((sum, b) => sum + (b?.duration || 1), 0);

  return { totalSteps, filledSteps, emptySteps, duration };
}

/**
 * Generate a word from sequence pictograph letters
 */
export function generateWord(sequence: SequenceData): string {
  return calculateSequenceWord(sequence);
}

/**
 * Check if a beat is valid for the sequence
 */
export function isValidBeat(_sequence: SequenceData, beat: StepData): boolean {
  if (!beat) return false;
  if (beat.duration !== undefined && beat.duration < 0) return false;
  return true;
}

export function transformSequence(sequence: unknown): unknown {
  // TODO: Implement sequence transformation
  return sequence;
}

/**
 * Validate sequence creation request - REAL validation from desktop
 */
export function validateCreateRequest(request: unknown): ValidationResult {
  const errors: ValidationErrorInfo[] = [];
  const typedRequest = request as {
    name?: string;
    length?: number;
    gridMode?: string;
  };

  // Validation from desktop SequenceData.__post_init__
  if (!typedRequest.name || typedRequest.name.trim().length === 0) {
    errors.push({
      code: "MISSING_NAME",
      message: "Sequence name is required",
      field: "name",
      severity: "error",
    });
  }

  if (typedRequest.name && typedRequest.name.length > 100) {
    errors.push({
      code: "NAME_TOO_LONG",
      message: "Sequence name must be less than 100 characters",
      field: "name",
      severity: "error",
    });
  }

  // Length validation from desktop domain models
  // Allow 0 length for progressive creation (start placement only)
  if (
    typedRequest.length !== undefined &&
    (typedRequest.length < 0 || typedRequest.length > 64)
  ) {
    errors.push({
      code: "INVALID_LENGTH",
      message: "Sequence length must be between 0 and 64",
      field: "length",
      severity: "error",
    });
  }

  // Grid mode validation from desktop enums
  const allowedGridModes: GridMode[] = [GridMode.DIAMOND, GridMode.BOX];
  if (
    typedRequest.gridMode &&
    !allowedGridModes.includes(typedRequest.gridMode as GridMode)
  ) {
    errors.push({
      code: "INVALID_GRID_MODE",
      message: "Grid mode must be either GridMode.DIAMOND or GridMode.BOX",
      field: "gridMode",
      severity: "error",
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings: [],
  };
}

/**
 * Create sequence with proper beat numbering - from desktop SequenceData
 */
export function createSequence(request: SequenceCreateRequest): SequenceData {
  const validation = validateCreateRequest(request);
  if (!validation.isValid) {
    throw new Error(
      `Invalid sequence request: ${validation.errors.join(", ")}`
    );
  }

  const typedRequest = request;

  // Create steps with proper numbering (desktop logic)
  const steps: StepData[] = [];
  const length = typedRequest.length || 0;
  for (let i = 1; i <= length; i++) {
    steps.push(createEmptyBeat(i));
  }

  // Create sequence following desktop SequenceData structure
  const sequence: SequenceData = {
    id: generateId(),
    name: typedRequest.name.trim(),
    word: "",
    steps,
    thumbnails: [],
    isFavorite: false,
    isCircular: false,
    tags: [],
    metadata: { length: typedRequest.length },
  };

  return sequence;
}

/**
 * Update beat with proper validation - from desktop BeatSequenceService
 */
export function updateStep(
  sequence: SequenceData,
  stepIndex: number,
  stepData: StepData
): SequenceData {
  // Validation from desktop BeatSequenceService
  if (stepIndex < 0 || stepIndex >= sequence.steps.length) {
    throw new Error(`Invalid beat index: ${stepIndex}`);
  }

  // Validate step data
  if (stepData.duration && stepData.duration < 0) {
    throw new Error("Beat duration must be positive");
  }

  // Legacy field guard (stepNumber) for migrated data
  if ("stepNumber" in stepData) {
    const stepNumber = (stepData as { stepNumber?: unknown }).stepNumber;
    if (typeof stepNumber === "number" && stepNumber < 0) {
      throw new Error("Beat number must be non-negative");
    }
  }

  // Create new steps array with updated beat
  const newSteps = [...sequence.steps];
  newSteps[stepIndex] = { ...stepData };

  return { ...sequence, steps: newSteps } as SequenceData;
}

/**
 * Calculate sequence word - from desktop SequenceWordCalculator
 */
export function calculateSequenceWord(sequence: SequenceData): string {
  if (!sequence.steps || sequence.steps.length === 0) {
    return "";
  }

  // Extract letters from steps (desktop logic)
  const word = deriveWordFromBeats(sequence.steps);

  // Apply word simplification for circular sequences (desktop logic)
  return simplifyRepeatedWord(word);
}

// ============================================================================
// MODULE-PRIVATE HELPERS
// ============================================================================

function simplifyRepeatedWord(word: string): string {
  if (!word) return word;

  const canFormByRepeating = (s: string, pattern: string): boolean => {
    const patternLen = pattern.length;
    for (let i = 0; i < s.length; i += patternLen) {
      if (s.slice(i, i + patternLen) !== pattern) {
        return false;
      }
    }
    return true;
  };

  const n = word.length;

  // Try each possible pattern length from smallest to largest
  for (let i = 1; i <= Math.floor(n / 2); i++) {
    const pattern = word.slice(0, i);
    if (n % i === 0 && canFormByRepeating(word, pattern)) {
      return pattern;
    }
  }

  return word;
}

function createEmptyBeat(stepNumber: number): StepData {
  // Blank beat: the factory fills both hands with invisible static
  // placeholders (both-required canonical Step shape).
  return createStepData({ stepNumber, isBlank: true });
}

function generateId(): string {
  return `seq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
