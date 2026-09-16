/**
 * Utility functions for creating start placement variations
 * Used as a fallback when StartPlacementManager is not available
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import {
  GridMode,
  GridLocation,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  MotionType,
  HandSide,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { createPictographData } from "$lib/shared/pictograph/shared/domain/factories/create-pictograph-data";

// Placement to hand location mapping
// Format: [leftLocation, rightLocation]
const PLACEMENT_LOCATIONS: Record<GridPlacement, [GridLocation, GridLocation]> = {
  // Alpha placements - hands in opposite/inverted directions (180° apart)
  [GridPlacement.ALPHA1]: [GridLocation.SOUTH, GridLocation.NORTH],
  [GridPlacement.ALPHA2]: [GridLocation.SOUTHWEST, GridLocation.NORTHEAST],
  [GridPlacement.ALPHA3]: [GridLocation.WEST, GridLocation.EAST],
  [GridPlacement.ALPHA4]: [GridLocation.NORTHWEST, GridLocation.SOUTHEAST],
  [GridPlacement.ALPHA5]: [GridLocation.NORTH, GridLocation.SOUTH],
  [GridPlacement.ALPHA6]: [GridLocation.NORTHEAST, GridLocation.SOUTHWEST],
  [GridPlacement.ALPHA7]: [GridLocation.EAST, GridLocation.WEST],
  [GridPlacement.ALPHA8]: [GridLocation.SOUTHEAST, GridLocation.NORTHWEST],

  // Beta placements - both hands same direction (0° apart)
  [GridPlacement.BETA1]: [GridLocation.NORTH, GridLocation.NORTH],
  [GridPlacement.BETA2]: [GridLocation.NORTHEAST, GridLocation.NORTHEAST],
  [GridPlacement.BETA3]: [GridLocation.EAST, GridLocation.EAST],
  [GridPlacement.BETA4]: [GridLocation.SOUTHEAST, GridLocation.SOUTHEAST],
  [GridPlacement.BETA5]: [GridLocation.SOUTH, GridLocation.SOUTH],
  [GridPlacement.BETA6]: [GridLocation.SOUTHWEST, GridLocation.SOUTHWEST],
  [GridPlacement.BETA7]: [GridLocation.WEST, GridLocation.WEST],
  [GridPlacement.BETA8]: [GridLocation.NORTHWEST, GridLocation.NORTHWEST],

  // Gamma placements - 90° apart
  [GridPlacement.GAMMA1]: [GridLocation.WEST, GridLocation.NORTH],
  [GridPlacement.GAMMA2]: [GridLocation.NORTHWEST, GridLocation.NORTHEAST],
  [GridPlacement.GAMMA3]: [GridLocation.NORTH, GridLocation.EAST],
  [GridPlacement.GAMMA4]: [GridLocation.NORTHEAST, GridLocation.SOUTHEAST],
  [GridPlacement.GAMMA5]: [GridLocation.EAST, GridLocation.SOUTH],
  [GridPlacement.GAMMA6]: [GridLocation.SOUTHEAST, GridLocation.SOUTHWEST],
  [GridPlacement.GAMMA7]: [GridLocation.SOUTH, GridLocation.WEST],
  [GridPlacement.GAMMA8]: [GridLocation.SOUTHWEST, GridLocation.NORTHWEST],
  [GridPlacement.GAMMA9]: [GridLocation.EAST, GridLocation.NORTH],
  [GridPlacement.GAMMA10]: [GridLocation.SOUTHEAST, GridLocation.NORTHEAST],
  [GridPlacement.GAMMA11]: [GridLocation.SOUTH, GridLocation.EAST],
  [GridPlacement.GAMMA12]: [GridLocation.SOUTHWEST, GridLocation.SOUTHEAST],
  [GridPlacement.GAMMA13]: [GridLocation.WEST, GridLocation.SOUTH],
  [GridPlacement.GAMMA14]: [GridLocation.NORTHWEST, GridLocation.SOUTHWEST],
  [GridPlacement.GAMMA15]: [GridLocation.NORTH, GridLocation.WEST],
  [GridPlacement.GAMMA16]: [GridLocation.NORTHEAST, GridLocation.NORTHWEST],

  // Zeta placements - 135° apart (obtuse angle)
  // Zeta 1-8: Blue is 135° CCW from Red
  [GridPlacement.ZETA1]: [GridLocation.SOUTHWEST, GridLocation.NORTH],
  [GridPlacement.ZETA2]: [GridLocation.WEST, GridLocation.NORTHEAST],
  [GridPlacement.ZETA3]: [GridLocation.NORTHWEST, GridLocation.EAST],
  [GridPlacement.ZETA4]: [GridLocation.NORTH, GridLocation.SOUTHEAST],
  [GridPlacement.ZETA5]: [GridLocation.NORTHEAST, GridLocation.SOUTH],
  [GridPlacement.ZETA6]: [GridLocation.EAST, GridLocation.SOUTHWEST],
  [GridPlacement.ZETA7]: [GridLocation.SOUTHEAST, GridLocation.WEST],
  [GridPlacement.ZETA8]: [GridLocation.SOUTH, GridLocation.NORTHWEST],
  // Zeta 9-16: Blue is 135° CW from Red
  [GridPlacement.ZETA9]: [GridLocation.SOUTHEAST, GridLocation.NORTH],
  [GridPlacement.ZETA10]: [GridLocation.SOUTH, GridLocation.NORTHEAST],
  [GridPlacement.ZETA11]: [GridLocation.SOUTHWEST, GridLocation.EAST],
  [GridPlacement.ZETA12]: [GridLocation.WEST, GridLocation.SOUTHEAST],
  [GridPlacement.ZETA13]: [GridLocation.NORTHWEST, GridLocation.SOUTH],
  [GridPlacement.ZETA14]: [GridLocation.NORTH, GridLocation.SOUTHWEST],
  [GridPlacement.ZETA15]: [GridLocation.NORTHEAST, GridLocation.WEST],
  [GridPlacement.ZETA16]: [GridLocation.EAST, GridLocation.NORTHWEST],

  // Eta placements - 45° apart (acute angle)
  // Eta 1-8: Blue is 45° CCW from Red
  [GridPlacement.ETA1]: [GridLocation.NORTHWEST, GridLocation.NORTH],
  [GridPlacement.ETA2]: [GridLocation.NORTH, GridLocation.NORTHEAST],
  [GridPlacement.ETA3]: [GridLocation.NORTHEAST, GridLocation.EAST],
  [GridPlacement.ETA4]: [GridLocation.EAST, GridLocation.SOUTHEAST],
  [GridPlacement.ETA5]: [GridLocation.SOUTHEAST, GridLocation.SOUTH],
  [GridPlacement.ETA6]: [GridLocation.SOUTH, GridLocation.SOUTHWEST],
  [GridPlacement.ETA7]: [GridLocation.SOUTHWEST, GridLocation.WEST],
  [GridPlacement.ETA8]: [GridLocation.WEST, GridLocation.NORTHWEST],
  // Eta 9-16: Blue is 45° CW from Red
  [GridPlacement.ETA9]: [GridLocation.NORTHEAST, GridLocation.NORTH],
  [GridPlacement.ETA10]: [GridLocation.EAST, GridLocation.NORTHEAST],
  [GridPlacement.ETA11]: [GridLocation.SOUTHEAST, GridLocation.EAST],
  [GridPlacement.ETA12]: [GridLocation.SOUTH, GridLocation.SOUTHEAST],
  [GridPlacement.ETA13]: [GridLocation.SOUTHWEST, GridLocation.SOUTH],
  [GridPlacement.ETA14]: [GridLocation.WEST, GridLocation.SOUTHWEST],
  [GridPlacement.ETA15]: [GridLocation.NORTHWEST, GridLocation.WEST],
  [GridPlacement.ETA16]: [GridLocation.NORTH, GridLocation.NORTHWEST],

  // Tau placements - one hand at center, one at perimeter (Level 6)
  // TAU1-8: Blue at center, red at perimeter
  [GridPlacement.TAU1]: [GridLocation.CENTER, GridLocation.NORTH],
  [GridPlacement.TAU2]: [GridLocation.CENTER, GridLocation.NORTHEAST],
  [GridPlacement.TAU3]: [GridLocation.CENTER, GridLocation.EAST],
  [GridPlacement.TAU4]: [GridLocation.CENTER, GridLocation.SOUTHEAST],
  [GridPlacement.TAU5]: [GridLocation.CENTER, GridLocation.SOUTH],
  [GridPlacement.TAU6]: [GridLocation.CENTER, GridLocation.SOUTHWEST],
  [GridPlacement.TAU7]: [GridLocation.CENTER, GridLocation.WEST],
  [GridPlacement.TAU8]: [GridLocation.CENTER, GridLocation.NORTHWEST],
  // TAU9-16: Red at center, blue at perimeter
  [GridPlacement.TAU9]: [GridLocation.NORTH, GridLocation.CENTER],
  [GridPlacement.TAU10]: [GridLocation.NORTHEAST, GridLocation.CENTER],
  [GridPlacement.TAU11]: [GridLocation.EAST, GridLocation.CENTER],
  [GridPlacement.TAU12]: [GridLocation.SOUTHEAST, GridLocation.CENTER],
  [GridPlacement.TAU13]: [GridLocation.SOUTH, GridLocation.CENTER],
  [GridPlacement.TAU14]: [GridLocation.SOUTHWEST, GridLocation.CENTER],
  [GridPlacement.TAU15]: [GridLocation.WEST, GridLocation.CENTER],
  [GridPlacement.TAU16]: [GridLocation.NORTHWEST, GridLocation.CENTER],

  // Terra - both hands at center
  [GridPlacement.TERRA1]: [GridLocation.CENTER, GridLocation.CENTER],
};

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
    const locations = PLACEMENT_LOCATIONS[entry.placement];
    if (!locations) {
      throw new Error(
        `No location mapping found for placement: ${entry.placement}`
      );
    }
    const [leftLocation, rightLocation] = locations;

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
