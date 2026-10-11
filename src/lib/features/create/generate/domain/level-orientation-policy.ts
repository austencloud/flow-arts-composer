import {
  Orientation,
  type Orientation as OrientationValue,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const RADIAL_START_ORIENTATIONS = [
  Orientation.IN,
  Orientation.OUT,
] as const satisfies readonly OrientationValue[];

const LEVEL_THREE_START_ORIENTATIONS = [
  ...RADIAL_START_ORIENTATIONS,
  Orientation.CLOCK,
  Orientation.COUNTER,
] as const satisfies readonly OrientationValue[];

/**
 * Generate treats the selected level as a vocabulary boundary.
 * Non-radial start orientations enter that vocabulary at Level 3.
 */
export function startOrientationsForLevel(
  level: number
): readonly OrientationValue[] {
  return level >= 3
    ? LEVEL_THREE_START_ORIENTATIONS
    : RADIAL_START_ORIENTATIONS;
}

export function clampStartOrientationToLevel(
  orientation: OrientationValue | undefined,
  level: number
): OrientationValue {
  const resolved = orientation ?? Orientation.IN;
  return startOrientationsForLevel(level).includes(resolved)
    ? resolved
    : Orientation.IN;
}
