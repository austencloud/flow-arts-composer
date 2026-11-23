import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { StartPlacementData } from "#lib/shared/foundation/domain/models/start-placement-data.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridLocation,
  GridMode,
  type GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

/**
 * Turns the sequence engine's plain step list (the `steps.json` the engine and
 * the Flow Arts MCP write: the start position first, then each step) into the
 * app's SequenceData, so a LOOP run can carry a sequence that was never saved
 * to a library. Pure and DOM-free: the post-project CLI and the dev server run
 * it the same way.
 */

interface EngineMotion {
  motionType?: string;
  rotationDirection?: string;
  startLocation?: string;
  endLocation?: string;
  startOrientation?: string;
  endOrientation?: string;
  turns?: number | "fl";
  prefloatMotionType?: string;
  prefloatRotationDirection?: string;
}

export interface EngineStep {
  letter?: string | null;
  startPlacement?: string | null;
  endPlacement?: string | null;
  leftMotion?: EngineMotion;
  rightMotion?: EngineMotion;
  motions?: { left?: EngineMotion; right?: EngineMotion };
}

const pick = <T extends string>(values: Record<string, T>, value: unknown, fallback: T): T => {
  if (typeof value !== "string") return fallback;
  return (Object.values(values) as string[]).includes(value) ? (value as T) : fallback;
};

function motionOf(step: EngineStep, hand: "left" | "right"): EngineMotion {
  const motion = hand === "left" ? (step.leftMotion ?? step.motions?.left) : (step.rightMotion ?? step.motions?.right);
  if (!motion) throw new Error(`A step has no ${hand} motion.`);
  return motion;
}

function appMotion(motion: EngineMotion, hand: HandSide, gridMode: GridMode): MotionData {
  const start = pick(GridLocation as Record<string, GridLocation>, motion.startLocation, GridLocation.NORTH);
  return createMotionData({
    motionType: pick(MotionType as Record<string, MotionType>, motion.motionType, MotionType.STATIC),
    rotationDirection: pick(
      RotationDirection as Record<string, RotationDirection>,
      motion.rotationDirection,
      RotationDirection.NO_ROTATION
    ),
    startLocation: start,
    endLocation: pick(GridLocation as Record<string, GridLocation>, motion.endLocation, start),
    startOrientation: pick(Orientation as Record<string, Orientation>, motion.startOrientation, Orientation.IN),
    endOrientation: pick(Orientation as Record<string, Orientation>, motion.endOrientation, Orientation.IN),
    turns: motion.turns ?? 0,
    hand,
    gridMode,
    ...(motion.prefloatMotionType && {
      prefloatMotionType: pick(MotionType as Record<string, MotionType>, motion.prefloatMotionType, MotionType.STATIC),
    }),
    ...(motion.prefloatRotationDirection && {
      prefloatRotationDirection: pick(
        RotationDirection as Record<string, RotationDirection>,
        motion.prefloatRotationDirection,
        RotationDirection.NO_ROTATION
      ),
    }),
  });
}

/** The app sequence for an engine step list whose first entry is the start position. */
export function sequenceFromEngineSteps(
  steps: readonly EngineStep[],
  options: { name: string; id?: string; gridMode?: GridMode }
): SequenceData {
  if (steps.length < 2) throw new Error("A sequence needs its start position and at least one step.");
  const gridMode = options.gridMode ?? GridMode.DIAMOND;
  const [first, ...rest] = steps as [EngineStep, ...EngineStep[]];
  const placement = (first.endPlacement || first.startPlacement || null) as GridPlacement | null;
  const startPlacement: StartPlacementData = {
    isStartPlacement: true as const,
    id: "start",
    gridPlacement: placement,
    letter: (first.letter || null) as Letter | null,
    startPlacement: placement,
    endPlacement: placement,
    motions: {
      [HandSide.LEFT]: appMotion(motionOf(first, "left"), HandSide.LEFT, gridMode),
      [HandSide.RIGHT]: appMotion(motionOf(first, "right"), HandSide.RIGHT, gridMode),
    },
  };
  const appSteps: StepData[] = rest.map((step, index) => ({
    id: `step-${index + 1}`,
    letter: (step.letter || null) as Letter | null,
    startPlacement: (step.startPlacement || null) as GridPlacement | null,
    endPlacement: (step.endPlacement || null) as GridPlacement | null,
    motions: {
      [HandSide.LEFT]: appMotion(motionOf(step, "left"), HandSide.LEFT, gridMode),
      [HandSide.RIGHT]: appMotion(motionOf(step, "right"), HandSide.RIGHT, gridMode),
    },
    gridMode,
    stepNumber: index + 1,
    duration: 1,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
  }));
  const word = appSteps.map((step) => step.letter ?? "").join("");
  return createSequenceData({
    ...(options.id ? { id: options.id } : {}),
    name: options.name,
    word,
    steps: appSteps,
    startingPlacement: startPlacement,
    startPlacement,
    gridMode,
    isCircular: true,
  });
}

/** The engine step list inside a `steps.json`: either the list itself or `{ steps }`. */
export function engineStepsOf(json: unknown): EngineStep[] {
  const list = Array.isArray(json) ? json : (json as { steps?: unknown })?.steps;
  if (!Array.isArray(list)) throw new Error("No steps found: expected a list, or an object with `steps`.");
  return list as EngineStep[];
}
