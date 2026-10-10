import type { AuthoredHand } from "#lib/shared/foundation/domain/models/authored-hand.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SoloPropStepData } from "#lib/shared/foundation/domain/models/solo-prop-step-data.js";
import { createSoloProp } from "#lib/shared/foundation/services/solo-prop-factory.js";
import { soloPropToSequence } from "#lib/shared/foundation/services/solo-prop-sequence-adapter.js";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  MotionType,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const BOX_ORBIT = [
  GridLocation.NORTHWEST,
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
] as const;

const SMOOTH_BOX_STEPS: SoloPropStepData[] = BOX_ORBIT.slice(0, -1).map(
  (startLocation, index) => ({
    startLocation,
    endLocation: BOX_ORBIT[index + 1]!,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    duration: 1,
  })
);

const COUNTERPOINT_BOX_ORBIT = [
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
] as const;

const COUNTERPOINT_BOX_STEPS: SoloPropStepData[] = COUNTERPOINT_BOX_ORBIT.slice(
  0,
  -1
).map((startLocation, index) => ({
  startLocation,
  endLocation: COUNTERPOINT_BOX_ORBIT[index + 1]!,
  startOrientation: Orientation.IN,
  endOrientation: Orientation.IN,
  motionType: MotionType.PRO,
  rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
  turns: 0,
  duration: 1,
}));

function createReviewSequence(
  steps: SoloPropStepData[],
  startLocation: GridLocation,
  authoredHand: AuthoredHand,
  name: string
): SequenceData {
  const soloProp = createSoloProp(steps, startLocation, Orientation.IN, {
    name,
    notes: "Production-shaped solo fixture for the Construct handoff review.",
  });

  return soloPropToSequence(soloProp, authoredHand);
}

export function createConstructSoloReviewSequence(
  authoredHand: AuthoredHand
): SequenceData {
  return createReviewSequence(
    SMOOTH_BOX_STEPS,
    GridLocation.NORTHWEST,
    authoredHand,
    "Smooth box orbit"
  );
}

export function createConstructRedPartnerReviewSequence(): SequenceData {
  return createReviewSequence(
    COUNTERPOINT_BOX_STEPS,
    GridLocation.SOUTHEAST,
    "right",
    "Counterpoint box orbit"
  );
}
