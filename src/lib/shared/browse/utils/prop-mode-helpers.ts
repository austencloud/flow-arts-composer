/**
 * Prop Mode Helpers
 *
 * Utility functions for determining prop configuration display modes.
 * Used throughout the thumbnail rendering pipeline.
 */

import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

/**
 * Check if user is in cat-dog mode (different props for each hand)
 */
export function isCatDogMode(
  leftPropType: PropType | undefined,
  rightPropType: PropType | undefined,
  catDogModeEnabled: boolean | undefined
): boolean {
  if (!catDogModeEnabled) return false;
  if (!leftPropType || !rightPropType) return false;
  return leftPropType !== rightPropType;
}

/**
 * Get thumbnail path for user's prop configuration.
 * Returns static path for single-prop, null for cat-dog (needs dynamic render).
 */
export function getThumbnailPathForPropConfig(
  sequenceName: string,
  leftPropType: PropType | undefined,
  rightPropType: PropType | undefined,
  catDogModeEnabled: boolean | undefined,
  lightMode: boolean = false
): string | null {
  // Cat-dog mode requires dynamic rendering
  if (isCatDogMode(leftPropType, rightPropType, catDogModeEnabled)) {
    return null;
  }

  // Single-prop mode: use pre-rendered static image
  const propType = leftPropType ?? rightPropType ?? "staff";
  const modeSuffix = lightMode ? "_light" : "_dark";
  return `/gallery/${propType}/${sequenceName}${modeSuffix}.webp`;
}
