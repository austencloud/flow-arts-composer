import { createStepData } from "#lib/shared/foundation/domain/factories/create-step-data.js";
import { createSequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createStartPlacementData } from "#lib/shared/foundation/domain/factories/create-start-placement-data.js";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  createMotionData,
  type MotionData,
} from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { ExtensionAnalysis } from "#lib/features/create/shared/services/sequence-extender.js";
import { COMPACT_LOOP_REVIEW_OPTIONS } from "../loop-picker/loop-picker-review-fixtures";

function motion(
  color: HandSide,
  rotationDirection: RotationDirection,
  visible = true
): MotionData {
  return createMotionData({
    hand: color,
    motionType: visible ? MotionType.PRO : MotionType.STATIC,
    rotationDirection: visible
      ? rotationDirection
      : RotationDirection.NO_ROTATION,
    isVisible: visible,
  });
}

/** Alpha 1: both props at rest, blue south and red north, so the Grid join
    previews draw a real start position. */
function staticAt(hand: HandSide, location: GridLocation): MotionData {
  return createMotionData({
    hand,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: location,
    endLocation: location,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    gridMode: GridMode.DIAMOND,
  });
}

export const SEQUENCE_ACTIONS_REVIEW_SEQUENCE = createSequenceData({
  id: "sequence-actions-review",
  gridMode: GridMode.DIAMOND,
  startPlacement: createStartPlacementData({
    id: "review-start",
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.ALPHA1,
    gridPlacement: GridPlacement.ALPHA1,
    motions: {
      left: staticAt(HandSide.LEFT, GridLocation.SOUTH),
      right: staticAt(HandSide.RIGHT, GridLocation.NORTH),
    },
  }),
  name: "Sequence Actions review",
  word: "REVIEW",
  steps: Array.from({ length: 40 }, (_, index) => {
    const stepNumber = index + 1;
    const leftVisible = stepNumber % 7 !== 0;
    const rightVisible = stepNumber % 9 !== 0;
    return createStepData({
      id: `review-step-${stepNumber}`,
      stepNumber,
      startPlacement: GridPlacement.GAMMA1,
      endPlacement: GridPlacement.GAMMA1,
      duration: stepNumber % 5 === 0 ? 2 : 1,
      motions: {
        left: motion(
          HandSide.LEFT,
          stepNumber % 2 === 0
            ? RotationDirection.CLOCKWISE
            : RotationDirection.COUNTER_CLOCKWISE,
          leftVisible
        ),
        right: motion(
          HandSide.RIGHT,
          stepNumber % 3 === 0
            ? RotationDirection.COUNTER_CLOCKWISE
            : RotationDirection.CLOCKWISE,
          rightVisible
        ),
      },
    });
  }),
});

export const SEQUENCE_ACTIONS_EXTENSION_ANALYSIS: ExtensionAnalysis = {
  canExtend: true,
  extensionType: "already_complete",
  startPlacement: GridPlacement.GAMMA1,
  currentEndPlacement: GridPlacement.GAMMA1,
  availableLOOPOptions: COMPACT_LOOP_REVIEW_OPTIONS,
  unavailableLOOPOptions: [],
  orientationRepeat: null,
  description: "Position and orientation both close.",
};
