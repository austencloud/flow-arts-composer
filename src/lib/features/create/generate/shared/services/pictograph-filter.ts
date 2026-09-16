/**
 * Pictograph Filter — all filtering logic for pictograph selection during
 * sequence generation.
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { FilteringError } from "../domain/errors/generation-errors";
import { getLetterType } from "$lib/shared/foundation/domain/models/letter";
import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";

// Legacy constants for rotation directions
const ROTATION_DIRS = {
  CLOCKWISE: RotationDirection.CLOCKWISE,
  COUNTER_CLOCKWISE: RotationDirection.COUNTER_CLOCKWISE,
  noRotation: RotationDirection.NO_ROTATION,
} as const;

/**
 * Filter by continuity — next step's start placement must match last step's end placement.
 */
export function filterByContinuity(
  options: PictographData[],
  lastStep: StepData | StartPlacementData | null
): PictographData[] {
  if (!lastStep?.endPlacement) {
    return options;
  }

  const lastEndPlacement = lastStep.endPlacement.toLowerCase();

  const filtered = options.filter((option: PictographData) => {
    if (!option.startPlacement) return false;
    const optionStartPlacement = option.startPlacement.toLowerCase();
    return optionStartPlacement === lastEndPlacement;
  });

  if (filtered.length === 0) {
    console.warn(
      `⚠️ No options match end placement "${lastEndPlacement}", using all options`
    );
    return options;
  }

  return filtered;
}

/**
 * Filter options by rotation direction — exact port from legacy filter_options_by_rotation().
 */
export function filterByRotation(
  options: PictographData[],
  leftRotDir: string,
  rightRotDir: string
): PictographData[] {
  const filtered = options.filter((option: PictographData) => {
    const leftMotion = option.motions.left;
    const rightMotion = option.motions.right;

    // Invisible placeholder = hand not really there (both-required Step shape).
    if (!isVisibleMotion(leftMotion) || !isVisibleMotion(rightMotion)) return false;

    const leftMotionRotDir = leftMotion.rotationDirection;
    const rightMotionRotDir = rightMotion.rotationDirection;

    const leftMatches =
      leftMotionRotDir === leftRotDir ||
      leftMotionRotDir === ROTATION_DIRS.noRotation;

    const rightMatches =
      rightMotionRotDir === rightRotDir ||
      rightMotionRotDir === ROTATION_DIRS.noRotation;

    return leftMatches && rightMatches;
  });

  return filtered.length > 0 ? filtered : options;
}

/**
 * Filter for start placements — static pictographs where startPlacement === endPlacement.
 */
export function filterStartPlacements(options: PictographData[]): PictographData[] {
  const filtered = options.filter((option: PictographData) => {
    if (!option.startPlacement || !option.endPlacement) return false;
    const startPos = option.startPlacement.toLowerCase();
    const endPos = option.endPlacement.toLowerCase();
    return startPos === endPos;
  });

  if (filtered.length === 0) {
    throw new FilteringError(
      "No valid start placements found in options",
      "start_placements",
      { totalOptions: options.length }
    );
  }

  return filtered;
}

/**
 * Filter Type 6 (static) pictographs based on difficulty level.
 */
export function filterStaticType6(
  options: PictographData[],
  level: number
): PictographData[] {
  return options.filter((option: PictographData) => {
    if (!option.letter) return true;

    const letterType = getLetterType(option.letter);
    if (letterType !== LetterType.TYPE6) return true;
    if (level === 1) return false;

    const leftMotion = option.motions.left;
    const rightMotion = option.motions.right;
    const leftTurns = leftMotion?.turns ?? 0;
    const rightTurns = rightMotion?.turns ?? 0;
    const leftHasTurns = leftTurns === "fl" || leftTurns > 0;
    const rightHasTurns = rightTurns === "fl" || rightTurns > 0;

    return leftHasTurns || rightHasTurns;
  });
}

/**
 * Filter pictographs by required end placement.
 */
export function filterByEndPlacement(
  options: PictographData[],
  requiredEndPlacement: string
): PictographData[] {
  const targetEndPos = requiredEndPlacement.toLowerCase();

  const filtered = options.filter((option: PictographData) => {
    if (!option.endPlacement) return false;
    return option.endPlacement.toLowerCase() === targetEndPos;
  });

  if (filtered.length === 0) {
    console.warn(
      `⚠️ No pictographs end at placement "${requiredEndPlacement}". Cannot satisfy end placement constraint.`
    );
  }

  return filtered;
}

/**
 * Filter pictographs by prop type.
 */
export function filterByPropType(
  options: PictographData[],
  propType: string
): PictographData[] {
  const filtered = options.filter((option: PictographData) => {
    const leftMotion = option.motions.left;
    const rightMotion = option.motions.right;

    if (!isVisibleMotion(leftMotion) || !isVisibleMotion(rightMotion)) return false;

    return (
      leftMotion.propType === propType && rightMotion.propType === propType
    );
  });

  if (filtered.length === 0) {
    console.warn(
      `⚠️ No options match prop type "${propType}", using all options`
    );
    return options;
  }

  return filtered;
}

/**
 * Select a random item from an array.
 */
export function selectRandom<T>(array: T[]): T {
  if (array.length === 0) {
    throw new FilteringError(
      "Cannot choose from empty array",
      "random_selection"
    );
  }
  const index = Math.floor(Math.random() * array.length);
  const selected = array[index];
  if (selected === undefined) {
    throw new FilteringError(
      "Selected item is undefined",
      "random_selection",
      { index, arrayLength: array.length }
    );
  }
  return selected;
}

/**
 * Drop-in replacement for the old singleton — keeps all constructor-injected
 * call-sites working without changes.
 */
export const pictographFilter = {
  filterByContinuity,
  filterByRotation,
  filterStartPlacements,
  filterStaticType6,
  filterByEndPlacement,
  filterByPropType,
  selectRandom,
};
