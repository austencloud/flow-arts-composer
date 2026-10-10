import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";

export function locationToPropState(location: GridLocation): PropState {
  return {
    centerPathAngle: LOCATION_ANGLES[location],
    staffRotationAngle: 0,
  };
}
