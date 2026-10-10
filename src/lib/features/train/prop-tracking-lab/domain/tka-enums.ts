/**
 * Re-export the canonical TKA enums the classifier emits, so notation-3d and the
 * services depend on one local module instead of deep pictograph paths.
 */
export type { GridLocation } from './models';
export {
  MotionType,
  RotationDirection,
  Orientation,
} from '#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js';
export type {
  MotionType as MotionTypeT,
  RotationDirection as RotationDirectionT,
  Orientation as OrientationT,
} from '#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js';
