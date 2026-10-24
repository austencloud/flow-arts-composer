/**
 * Utility functions for creating start placement variations
 * Used as a fallback when StartPlacementManager is not available
 */

import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import {
  GridMode,
  GridPlacement,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { getGridLocationsFromPlacement } from "#lib/shared/pictograph/grid/services/grid-placement-deriver.js";
import { createPictographData } from "#lib/shared/pictograph/shared/domain/factories/create-pictograph-data.js";


// Diamond mode placements (odd numbers for alpha/beta, odd for gamma)
const DIAMOND_PLACEMENTS: Array<{ placement: GridPlacement; letter: Letter }> = [
  { placement: GridPlacement.ALPHA1, letter: Letter.ALPHA },
  { placement: GridPlacement.ALPHA3, letter: Letter.ALPHA },
  { placement: GridPlacement.ALPHA5, letter: Letter.ALPHA },
  { placement: GridPlacement.ALPHA7, letter: Letter.ALPHA },
  { placement: GridPlacement.BETA1, letter: Letter.BETA },
  { placement: GridPlacement.BETA3, letter: Letter.BETA },
  { placement: GridPlacement.BETA5, letter: Letter.BETA },
  { placement: GridPlacement.BETA7, letter: Letter.BETA },
  { placement: GridPlacement.GAMMA1, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA3, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA5, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA7, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA9, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA11, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA13, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA15, letter: Letter.GAMMA },
];

// Box mode placements (even numbers)
const BOX_PLACEMENTS: Array<{ placement: GridPlacement; letter: Letter }> = [
  { placement: GridPlacement.ALPHA2, letter: Letter.ALPHA },
  { placement: GridPlacement.ALPHA4, letter: Letter.ALPHA },
  { placement: GridPlacement.ALPHA6, letter: Letter.ALPHA },
  { placement: GridPlacement.ALPHA8, letter: Letter.ALPHA },
  { placement: GridPlacement.BETA2, letter: Letter.BETA },
  { placement: GridPlacement.BETA4, letter: Letter.BETA },
  { placement: GridPlacement.BETA6, letter: Letter.BETA },
  { placement: GridPlacement.BETA8, letter: Letter.BETA },
  { placement: GridPlacement.GAMMA2, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA4, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA6, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA8, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA10, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA12, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA14, letter: Letter.GAMMA },
  { placement: GridPlacement.GAMMA16, letter: Letter.GAMMA },
];

/**
 * Create all 16 start placement variations for the given grid mode
 * Returns full PictographData objects with proper motion data
 */
export function createStartPlacementVariations(
  gridMode: GridMode
): PictographData[] {
  const placements =
    gridMode === GridMode.DIAMOND ? DIAMOND_PLACEMENTS : BOX_PLACEMENTS;

  return placements.map((entry) => {
    const [leftLocation, rightLocation] = getGridLocationsFromPlacement(
      entry.placement
    );

    // Create proper motion data for both hands
    const leftMotion = createMotionData({
      motionType: MotionType.STATIC,
      startLocation: leftLocation,
      endLocation: leftLocation,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: 0,
      hand: HandSide.LEFT,
      isVisible: true,
      propType: PropType.STAFF,
      arrowLocation: leftLocation,
      gridMode: gridMode,
    });

    const rightMotion = createMotionData({
      motionType: MotionType.STATIC,
      startLocation: rightLocation,
      endLocation: rightLocation,
      startOrientation: Orientation.IN,
      endOrientation: Orientation.IN,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: 0,
      hand: HandSide.RIGHT,
      isVisible: true,
      propType: PropType.STAFF,
      arrowLocation: rightLocation,
      gridMode: gridMode,
    });

    return createPictographData({
      id: `start-${entry.placement}`,
      letter: entry.letter,
      startPlacement: entry.placement,
      endPlacement: entry.placement,
      motions: {
        [HandSide.LEFT]: leftMotion,
        [HandSide.RIGHT]: rightMotion,
      },
    });
  });
}
