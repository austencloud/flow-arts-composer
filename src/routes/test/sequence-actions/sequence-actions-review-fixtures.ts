import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";
import {
  HandSide,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { ExtensionAnalysis } from "$lib/features/create/shared/services/sequence-extender";
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

export const SEQUENCE_ACTIONS_REVIEW_SEQUENCE = createSequenceData({
  id: "sequence-actions-review",
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
