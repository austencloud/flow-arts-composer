import { calculateEndOrientation } from "../../core/orientation/OrientationCalculator.js";
import type {
  Orientation,
  SequenceStep,
} from "../../core/types/sequence-engine-types.js";
import { updateStepOrientations } from "./orientation-helpers.js";

export const MAX_ORIENTATION_CYCLE_REPETITIONS = 8;

export type OrientationCycleCount = 1 | 2 | 4 | 8;

export interface OrientationCycleAnalysis {
  cycleCount: OrientationCycleCount;
  leftOrientations: Orientation[];
  rightOrientations: Orientation[];
}

export interface OrientationCycleClosure {
  steps: SequenceStep[];
  /**
   * Minimum number of completed placement-pattern repetitions required solely
   * for orientation closure.
   */
  orientationCycleCount: OrientationCycleCount;
  /** Number of completed placement-pattern repetitions emitted. */
  patternRepetitions: number;
  /** Final output step count divided by the original seed step count. */
  expansionMultiplier: number;
}

export interface OrientationCycleOptions {
  /**
   * Original seed size. Defaults to the number of non-start-placement steps,
   * which is appropriate when analyzing an unexpanded sequence.
   */
  seedStepCount?: number;
  /**
   * Preserve at least this output-to-seed multiplier. Exact-length generation
   * uses this after an earlier candidate proves that more repetitions are
   * required.
   */
  minimumExpansionMultiplier?: number;
  /**
   * Explicit start orientations for callers whose start placement is stored
   * separately from the sequence steps.
   */
  startOrientations?: {
    left: Orientation;
    right: Orientation;
  };
}

/**
 * Find the smallest number of complete placement-pattern repetitions that
 * returns both props to their starting orientations.
 *
 * The orientation wheel has eight states, so a deterministic pattern must
 * return after 1, 2, 4, or 8 repetitions. Failing to return within eight is an
 * engine error, not an invitation to label an open sequence as closed.
 */
export function analyzeOrientationCycle(
  sequence: readonly SequenceStep[],
  options: Pick<OrientationCycleOptions, "startOrientations"> = {}
): OrientationCycleAnalysis {
  const pattern = getPatternSteps(sequence);
  const startOrientations =
    options.startOrientations ?? getStartingOrientations(sequence, pattern[0]);

  if (pattern.length === 0) {
    return {
      cycleCount: 1,
      leftOrientations: [startOrientations.left],
      rightOrientations: [startOrientations.right],
    };
  }

  const leftOrientations: Orientation[] = [startOrientations.left];
  const rightOrientations: Orientation[] = [startOrientations.right];
  let left = startOrientations.left;
  let right = startOrientations.right;

  for (
    let repetition = 1;
    repetition <= MAX_ORIENTATION_CYCLE_REPETITIONS;
    repetition++
  ) {
    for (const step of pattern) {
      left = calculateMotionEndOrientation(step, "left", left);
      right = calculateMotionEndOrientation(step, "right", right);
    }

    leftOrientations.push(left);
    rightOrientations.push(right);

    if (left === startOrientations.left && right === startOrientations.right) {
      if (!isOrientationCycleCount(repetition)) {
        throw new Error(
          `Orientation returned after unsupported repetition count ${repetition}`
        );
      }
      return {
        cycleCount: repetition,
        leftOrientations,
        rightOrientations,
      };
    }
  }

  throw new Error(
    `Orientation did not close after ${MAX_ORIENTATION_CYCLE_REPETITIONS} ` +
      `placement-pattern repetitions (left ${startOrientations.left} -> ${left}, ` +
      `right ${startOrientations.right} -> ${right})`
  );
}

/**
 * Repeat a completed placement pattern until both prop orientations close.
 *
 * LOOP classification ignores orientation, but performance does not. A
 * placement pattern may return home while one or both props still point
 * elsewhere. Repeating the complete pattern preserves its placement-domain LOOP
 * identity while advancing the propagated orientation state.
 */
export function closeOrientationCycle(
  sequence: readonly SequenceStep[],
  options: OrientationCycleOptions = {}
): OrientationCycleClosure {
  const pattern = getPatternSteps(sequence);
  const seedStepCount = options.seedStepCount ?? pattern.length;
  const minimumExpansionMultiplier =
    options.minimumExpansionMultiplier ?? 1;

  if (pattern.length === 0) {
    return {
      steps: [...sequence],
      orientationCycleCount: 1,
      patternRepetitions: 1,
      expansionMultiplier: 1,
    };
  }
  if (seedStepCount < 1) {
    throw new Error("Seed step count must be at least 1");
  }
  if (pattern.length % seedStepCount !== 0) {
    throw new Error(
      `LOOP output length ${pattern.length} is not a multiple of its ` +
        `${seedStepCount}-step seed`
    );
  }

  const first = pattern[0]!;
  const last = pattern[pattern.length - 1]!;
  if (last.endPlacement !== first.startPlacement) {
    throw new Error(
      `Cannot close orientation on an open placement pattern ` +
        `(${first.startPlacement} -> ${last.endPlacement})`
    );
  }

  const analysis = analyzeOrientationCycle(
    sequence,
    options.startOrientations
      ? { startOrientations: options.startOrientations }
      : {}
  );
  const structuralMultiplier = pattern.length / seedStepCount;
  const minimumPatternRepetitions = Math.max(
    1,
    Math.ceil(minimumExpansionMultiplier / structuralMultiplier)
  );
  const patternRepetitions =
    Math.ceil(minimumPatternRepetitions / analysis.cycleCount) *
    analysis.cycleCount;

  if (patternRepetitions > MAX_ORIENTATION_CYCLE_REPETITIONS) {
    throw new Error(
      `Orientation closure requires ${patternRepetitions} placement-pattern ` +
        `repetitions, above the supported maximum of ` +
        `${MAX_ORIENTATION_CYCLE_REPETITIONS}`
    );
  }

  const output = sequence.map(cloneStep);
  let nextStepNumber =
    pattern.reduce(
      (largest, step) => Math.max(largest, step.stepNumber),
      0
    ) + 1;
  for (let repetition = 1; repetition < patternRepetitions; repetition++) {
    for (const sourceStep of pattern) {
      const previousStep = output[output.length - 1]!;
      const copiedStep: SequenceStep = {
        ...sourceStep,
        id: `step-${nextStepNumber}`,
        stepNumber: nextStepNumber,
        startPlacement:
          previousStep.endPlacement as SequenceStep["startPlacement"],
        motions: {
          left: { ...sourceStep.motions.left },
          right: { ...sourceStep.motions.right },
        },
      };
      output.push(updateStepOrientations(copiedStep, previousStep));
      nextStepNumber++;
    }
  }

  assertOrientationsClose(output, options.startOrientations);

  return {
    steps: output,
    orientationCycleCount: analysis.cycleCount,
    patternRepetitions,
    expansionMultiplier: structuralMultiplier * patternRepetitions,
  };
}

function assertOrientationsClose(
  sequence: readonly SequenceStep[],
  explicitStart?: OrientationCycleOptions["startOrientations"]
): void {
  const pattern = getPatternSteps(sequence);
  const start =
    explicitStart ?? getStartingOrientations(sequence, pattern[0]);
  const end = sequence[sequence.length - 1];
  if (!end) return;

  if (
    start.left !== end.motions.left.endOrientation ||
    start.right !== end.motions.right.endOrientation
  ) {
    throw new Error(
      `Orientation closure emitted an open sequence ` +
        `(left ${start.left} -> ${end.motions.left.endOrientation}, ` +
        `right ${start.right} -> ${end.motions.right.endOrientation})`
    );
  }
}

function getPatternSteps(
  sequence: readonly SequenceStep[]
): readonly SequenceStep[] {
  return sequence.filter((step) => step.stepNumber > 0);
}

function getStartingOrientations(
  sequence: readonly SequenceStep[],
  firstStep: SequenceStep | undefined
): { left: Orientation; right: Orientation } {
  const startStep = sequence.find((step) => step.stepNumber === 0);
  const source = startStep ?? firstStep;
  return {
    left: (source?.motions.left.startOrientation ?? "in") as Orientation,
    right: (source?.motions.right.startOrientation ?? "in") as Orientation,
  };
}

function calculateMotionEndOrientation(
  step: SequenceStep,
  side: "left" | "right",
  startOrientation: Orientation
): Orientation {
  const motion = step.motions[side];
  return calculateEndOrientation({
    motionType: motion.motionType,
    turns: motion.turns,
    rotationDirection: motion.rotationDirection,
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    startOrientation,
  });
}

function isOrientationCycleCount(value: number): value is OrientationCycleCount {
  return value === 1 || value === 2 || value === 4 || value === 8;
}

function cloneStep(step: SequenceStep): SequenceStep {
  return {
    ...step,
    motions: {
      left: { ...step.motions.left },
      right: { ...step.motions.right },
    },
  };
}
