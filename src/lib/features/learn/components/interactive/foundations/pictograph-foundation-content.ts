import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import {
  GridLocation,
  GridMode,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createMotionData,
  createPlaceholderMotion,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";

const { NORTH: N, EAST: E, WEST: W } = GridLocation;

function buildHandSequence(
  id: string,
  name: string,
  from: GridLocation,
  to: GridLocation,
  motionType: MotionType
): SequenceData {
  const leftStart = createMotionData({
    hand: HandSide.LEFT,
    motionType: MotionType.STATIC,
    startLocation: from,
    endLocation: from,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
  });
  const right = createPlaceholderMotion(HandSide.RIGHT, { location: E });
  const left = createMotionData({
    hand: HandSide.LEFT,
    motionType,
    startLocation: from,
    endLocation: to,
    propType: PropType.HAND,
    gridMode: GridMode.DIAMOND,
  });

  return createSequenceData({
    id,
    name,
    word: "",
    gridMode: GridMode.DIAMOND,
    startPlacement: createStartPlacementData({
      id: `${id}-start`,
      motions: { left: leftStart, right },
    }),
    steps: [
      createStepData({
        id: `${id}-1`,
        letter: null,
        gridMode: GridMode.DIAMOND,
        stepNumber: 1,
        motions: { left, right },
      }),
    ],
  });
}

export const HAND_PATH_STEPS = [
  {
    id: "shift",
    name: "Shift",
    guideCaption: "Move to an adjacent point",
    sequence: buildHandSequence(
      "learn-hand-shift",
      "Shift",
      W,
      N,
      MotionType.PRO
    ),
  },
  {
    id: "dash",
    name: "Dash",
    guideCaption: "Move to the opposite point",
    sequence: buildHandSequence(
      "learn-hand-dash",
      "Dash",
      W,
      E,
      MotionType.DASH
    ),
  },
  {
    id: "static",
    name: "Static",
    guideCaption: "Remain at the same point",
    sequence: buildHandSequence(
      "learn-hand-static",
      "Static",
      W,
      W,
      MotionType.STATIC
    ),
  },
] as const;

export {
  ALPHA_BETA_HAND_PATH_CARDS as ALPHA_BETA_MODES,
  GAMMA_HAND_PATH_CARDS as GAMMA_MODES,
  HAND_PATH_REFERENCE_CARDS as TIMING_DIRECTION_MODES,
  type HandPathReferenceCard as TimingDirectionMode,
  type HandPathReferenceCardId as TimingDirectionModeId,
} from "$lib/features/choreo-card/domain/hand-path-reference-cards";
