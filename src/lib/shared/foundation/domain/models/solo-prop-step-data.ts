import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import type {
  MotionType,
  RotationDirection,
  Orientation,
  HandPath,
  SkewDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { Plane } from "@tka/tka-types";

export interface SoloPropStepData {
  readonly startLocation: GridLocation;
  readonly endLocation: GridLocation;
  readonly startOrientation: Orientation;
  readonly endOrientation: Orientation;
  readonly motionType: MotionType;
  readonly rotationDirection: RotationDirection;
  readonly turns: number | "fl";
  readonly handPath?: HandPath | null;
  readonly skewSteps?: number | null;
  readonly skewDir?: SkewDirection | null;
  readonly duration: number;
  /** Authored 3D plane for this step. Absent keeps the legacy Wall fallback. */
  readonly plane?: Plane;
  // When motionType === "float", this holds the original pro/anti type the
  // float collapsed from. Required for letter/turn-color resolution because
  // float motions have noRotation, which destroys the pro-vs-anti signal.
  // prefloatRotationDirection is NOT stored - it is derivable from
  // prefloatMotionType + start/end via HandpathDirectionCalculator.
  readonly prefloatMotionType?: MotionType;
}
