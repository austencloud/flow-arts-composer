import { createSoloProp } from "./solo-prop-factory";
import type { SequenceData } from "../domain/models/sequence-data";
import {
  HandSide,
  type HandSide as HandSideValue,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { SoloPropData } from "../domain/models/solo-prop-data";
import type { SoloPropStepData } from "../domain/models/solo-prop-step-data";
import type { StepPairingData } from "../domain/models/step-pairing-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  Orientation,
  MotionType,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

// Strips the rendering-only fields from a MotionData to produce a SoloPropStepData.
//
// Dropped fields (truly rendering state, re-derived downstream):
//   color, propType, isVisible, gridMode, arrowLocation,
//   arrowPlacementData, propPlacementData, prefloatRotationDirection
//
// Preserved fields (domain data - must survive the round-trip):
//   plane, prefloatMotionType. When motionType === "float", this records the pro/anti
//   type the motion collapsed from. Without it, letter classification and turn
//   color cannot distinguish which hand the float belongs to (the float's
//   own rotationDirection is "noRotation", which destroys the signal).
//
// prefloatRotationDirection is intentionally NOT stored - it is derivable
// from prefloatMotionType + start/end via HandpathDirectionCalculator at
// rehydrate time, so persisting it would be redundant.
//
// Duration is NOT on MotionData. The caller must inject it from StepData.
function motionToSoloPropStep(
  motion: MotionData,
  duration: number
): SoloPropStepData {
  return {
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    startOrientation: motion.startOrientation,
    endOrientation: motion.endOrientation,
    motionType: motion.motionType,
    rotationDirection: motion.rotationDirection,
    turns: motion.turns,
    handPath: motion.handPath ?? null,
    skewSteps: motion.skewSteps ?? null,
    skewDir: motion.skewDir ?? null,
    duration,
    ...(motion.plane && { plane: motion.plane }),
    ...(motion.prefloatMotionType && {
      prefloatMotionType: motion.prefloatMotionType,
    }),
  };
}

// Builds a static placeholder SoloPropStepData for a step whose motion is
// missing (incomplete/blank beats). The step will round-trip incorrectly but
// won't blow up the factory.
function makePlaceholderStep(
  location: GridLocation,
  orientation: Orientation,
  duration: number
): SoloPropStepData {
  return {
    startLocation: location,
    endLocation: location,
    startOrientation: orientation,
    endOrientation: orientation,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
    duration,
  };
}

export function extractLeftSoloProp(sequence: SequenceData): SoloPropData {
  return extractSoloProp(sequence, HandSide.LEFT);
}

export function extractRightSoloProp(sequence: SequenceData): SoloPropData {
  return extractSoloProp(sequence, HandSide.RIGHT);
}

export function extractStepPairings(
  sequence: SequenceData
): readonly StepPairingData[] {
  return sequence.steps.map((step) => ({
    letter: step.letter ?? null,
    leftReversal: step.leftReversal,
    rightReversal: step.rightReversal,
    startPlacement: step.startPlacement ?? null,
    endPlacement: step.endPlacement ?? null,
  }));
}

// Private helpers

function extractSoloProp(
  sequence: SequenceData,
  color: HandSideValue
): SoloPropData {
  // Resolve the authoritative start location and orientation.
  //
  // Priority order:
  // 1. startPlacement (the modern, canonical field)
  // 2. startingPlacement (legacy alias - same semantic, different field name)
  // 3. steps[0] motion (last-resort: read the initial state from the first beat)
  // 4. Hard default: NORTH / IN - only reached on empty or fully-corrupt data
  const startPlacementMotions =
    sequence.startPlacement?.motions ?? sequence.startingPlacement?.motions;

  const startLocationFromPos = startPlacementMotions?.[color]?.startLocation;
  const startOrientationFromPos =
    startPlacementMotions?.[color]?.startOrientation;

  const firstStepMotion = sequence.steps[0]?.motions?.[color];

  const startLocation: GridLocation =
    startLocationFromPos ??
    firstStepMotion?.startLocation ??
    GridLocation.NORTH;

  const startOrientation: Orientation =
    startOrientationFromPos ??
    firstStepMotion?.startOrientation ??
    Orientation.IN;

  // Convert each StepData motion into a SoloPropStepData. Duration lives on
  // StepData (not MotionData), so we inject it per-step here.
  const steps: SoloPropStepData[] = sequence.steps.map((step) => {
    const motion = step.motions?.[color];

    if (!isVisibleMotion(motion)) {
      // A hand that is "not really there" (blank beat / assembly gap) is an
      // invisible placeholder under the both-required Step shape. Decompose
      // it exactly like the old absent hand: a static placeholder step, so
      // soloProp content hashes stay byte-identical across the migration.
      return makePlaceholderStep(
        startLocation,
        startOrientation,
        step.duration
      );
    }

    return motionToSoloPropStep(motion, step.duration);
  });

  return createSoloProp(steps, startLocation, startOrientation);
}
