/**
 * Public LOOP execution adapter.
 *
 * Structural execution, orientation propagation, orientation-cycle closure,
 * and letter recovery all use the same engine path as SequenceBuilder.
 */

import type { SequenceStep } from "../../core/types/sequence-engine-types.js";
import { findLetterByMotions } from "../LetterLookup.js";
import { LOOPType, Period } from "../loop-types.js";
import { completeLOOPExtension } from "./complete-loop-extension.js";

export interface MotionData {
  hand: string;
  startLocation: string;
  endLocation: string;
  motionType: string;
  rotationDirection: string;
  startOrientation: string;
  endOrientation: string;
}

export interface PictographData {
  letter: string;
  startPlacement: string;
  endPlacement: string;
  timing: string;
  direction: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
}

export interface LOOPExecutionResult {
  success: boolean;
  steps: SequenceStep[];
  word: string;
  /** Complete LOOP word after every derived step has been identified. */
  loopWord: string;
  seedWord: string;
  derivedWord: string;
  loopType: LOOPType;
  period: Period;
  isCircular: boolean;
  /** One-based step numbers belonging to the derived portion. */
  derivedStepIndices: number[];
  error?: string;
}

/**
 * Execute a LOOP transformation and return only a placement-and-orientation
 * closed result.
 */
export function executeLOOP(
  steps: SequenceStep[],
  word: string,
  loopType: LOOPType,
  period: Period = Period.HALVED,
  allPictographs: PictographData[] = []
): LOOPExecutionResult {
  const seedStepCount = steps.filter((step) => step.stepNumber > 0).length;
  if (seedStepCount < 1) {
    return failure(
      word,
      loopType,
      period,
      "Sequence must contain a start placement and at least one step"
    );
  }

  try {
    const completed = completeLOOPExtension(steps, {
      loopType,
      period,
    });
    const resolvedSteps = recoverLetters(
      completed.steps,
      allPictographs,
      seedStepCount
    );
    const letterSteps = resolvedSteps.filter((step) => step.stepNumber > 0);
    const derivedSteps = letterSteps.slice(seedStepCount);
    const derivedWord = derivedSteps.map((step) => step.letter ?? "").join("");

    return {
      success: true,
      steps: resolvedSteps,
      word,
      loopWord: letterSteps.map((step) => step.letter ?? "").join(""),
      seedWord: word,
      derivedWord,
      loopType,
      period,
      isCircular: true,
      derivedStepIndices: completed.derivedStepIndices,
    };
  } catch (error) {
    return failure(
      word,
      loopType,
      period,
      error instanceof Error ? error.message : String(error)
    );
  }
}

function recoverLetters(
  steps: SequenceStep[],
  allPictographs: PictographData[],
  seedStepCount: number
): SequenceStep[] {
  if (allPictographs.length === 0) return steps;

  return steps.map((step) => {
    if (step.stepNumber === 0 || step.stepNumber <= seedStepCount) return step;

    const letter = findLetterByMotions(
      step.motions.left,
      step.motions.right,
      allPictographs
    );
    return letter
      ? { ...step, letter: letter as SequenceStep["letter"] }
      : step;
  });
}

function failure(
  word: string,
  loopType: LOOPType,
  period: Period,
  error: string
): LOOPExecutionResult {
  return {
    success: false,
    steps: [],
    word,
    loopWord: "",
    seedWord: word,
    derivedWord: "",
    loopType,
    period,
    isCircular: false,
    derivedStepIndices: [],
    error,
  };
}
