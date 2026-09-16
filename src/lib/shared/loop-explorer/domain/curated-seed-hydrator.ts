import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { normalizeLetter } from "$lib/shared/foundation/domain/models/letter";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import {
  convertToGridPlacement,
  mapLocation,
  mapMotionType,
  mapOrientation,
  mapRotationDirection,
} from "$lib/shared/foundation/services/data/enum-mapper";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { startPlacementDeriver } from "$lib/shared/pictograph/shared/services/start-placement-deriver";
import type { LoopSlice } from "./legality";

export interface CuratedMotionWire {
  readonly motionType: string;
  readonly startLocation: string;
  readonly endLocation: string;
  readonly rotationDirection: string;
  readonly startOrientation: string;
  readonly endOrientation: string;
  readonly turns: number | "fl";
  readonly plane?: string;
  readonly prefloatMotionType?: string;
  readonly prefloatRotationDirection?: string;
}

export interface CuratedStepWire {
  readonly letter: string;
  readonly startPlacement: string;
  readonly endPlacement: string;
  readonly stepNumber: number;
  readonly leftMotion: CuratedMotionWire;
  readonly rightMotion: CuratedMotionWire;
  /** @deprecated Legacy checked-in and exported seed vocabulary. */
  readonly blueMotion?: CuratedMotionWire;
  /** @deprecated Legacy checked-in and exported seed vocabulary. */
  readonly redMotion?: CuratedMotionWire;
}

export interface CuratedSequenceWire {
  readonly word: string;
  readonly startPlacement: string;
  readonly steps: readonly CuratedStepWire[];
}

function hydrateMotion(wire: CuratedMotionWire, color: HandSide): MotionData {
  const startLocation = mapLocation(wire.startLocation);

  return createMotionData({
    motionType: mapMotionType(wire.motionType),
    startLocation,
    endLocation: mapLocation(wire.endLocation),
    rotationDirection: mapRotationDirection(wire.rotationDirection),
    startOrientation: mapOrientation(wire.startOrientation),
    endOrientation: mapOrientation(wire.endOrientation),
    turns: wire.turns === "fl" ? "fl" : wire.turns,
    ...(wire.plane === "wall" && { plane: "wall" }),
    ...(wire.prefloatMotionType && {
      prefloatMotionType: mapMotionType(wire.prefloatMotionType),
    }),
    ...(wire.prefloatRotationDirection && {
      prefloatRotationDirection: mapRotationDirection(
        wire.prefloatRotationDirection
      ),
    }),
    hand: color,
    isVisible: true,
    propType: PropType.STAFF,
    // The compact harness format does not persist placement data. This is the
    // same safe seed used by the existing raw-step converter; render pipelines
    // derive the final placement from the completed pictograph when needed.
    arrowLocation: startLocation,
    gridMode: GridMode.DIAMOND,
  });
}

function motionWireFor(
  step: CuratedStepWire,
  hand: HandSide
): CuratedMotionWire {
  const wire =
    hand === HandSide.LEFT
      ? (step.leftMotion ?? step.blueMotion)
      : (step.rightMotion ?? step.redMotion);
  if (!wire) {
    throw new Error(
      `seed step ${step.stepNumber} is missing its ${hand} motion`
    );
  }
  return wire;
}

/**
 * Converts the verification harness's compact wire format at a trusted data
 * boundary. Editorial pages and the fallback corpus share this one converter,
 * so string positions can never leak into the animation engine again.
 */
export function hydrateCuratedSequence(
  wire: CuratedSequenceWire,
  loopType: LOOPType,
  slice: LoopSlice,
  sequenceIndex: number
): SequenceData {
  if (!wire.steps.length) {
    throw new Error("seed has no steps");
  }

  const id = `curated-${loopType}-${slice}-${sequenceIndex}`;
  const steps = wire.steps.map((step, stepIndex) => {
    const letter = normalizeLetter(step.letter);
    const startPlacement = convertToGridPlacement(step.startPlacement);
    const endPlacement = convertToGridPlacement(step.endPlacement);

    if (!letter || !startPlacement || !endPlacement) {
      throw new Error(`seed step ${stepIndex + 1} has invalid notation data`);
    }

    return createStepData({
      id: `${id}-step-${stepIndex + 1}`,
      letter,
      startPlacement,
      endPlacement,
      stepNumber: step.stepNumber,
      duration: 1,
      motions: {
        [HandSide.LEFT]: hydrateMotion(
          motionWireFor(step, HandSide.LEFT),
          HandSide.LEFT
        ),
        [HandSide.RIGHT]: hydrateMotion(
          motionWireFor(step, HandSide.RIGHT),
          HandSide.RIGHT
        ),
      },
    });
  });

  const firstStep = steps[0];
  if (!firstStep) throw new Error("seed has no hydrated steps");

  const startPlacement = startPlacementDeriver.deriveFromFirstStep(firstStep);
  const declaredStartPlacement = convertToGridPlacement(wire.startPlacement);
  if (
    !declaredStartPlacement ||
    startPlacement.gridPlacement !== declaredStartPlacement
  ) {
    throw new Error(
      `declared start ${wire.startPlacement} disagrees with first-step motions`
    );
  }

  const period = slice === "quartered" ? 4 : 2;
  return createSequenceData({
    id,
    name: wire.word,
    word: wire.word,
    steps,
    startPlacement,
    thumbnails: [],
    isFavorite: false,
    isCircular: true,
    loopType,
    period,
    orientationCycleCount: period,
    sequenceLength: steps.length,
    gridMode: GridMode.DIAMOND,
    tags: ["curated-loop-seed"],
    metadata: { source: "loop-explorer-verification-harness" },
  });
}
