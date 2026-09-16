/**
 * Start Placement Presets
 *
 * Defines preset configurations for allowed/blocked starting placements.
 * Uses a blocklist approach: placements NOT in the blocked list are allowed.
 */

import { GridMode, GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

/**
 * Available preset options for start placement selection
 */
export enum StartPlacementPreset {
  /** All placements allowed - no restrictions */
  ANY = "any",
  /**
   * Classic Three - the original representative placements:
   * - ALPHA1/ALPHA2: Hands opposite (180°)
   * - BETA5/BETA4: Hands parallel (0°)
   * - GAMMA11/GAMMA12: Hands perpendicular (90°)
   *
   * Named "Classic" because these are the foundational placements
   * representing each placement type (alpha, beta, gamma).
   */
  CLASSIC = "classic",
  /** User's custom selection - persisted between sessions */
  CUSTOM = "custom",
}

/**
 * Human-readable labels for presets
 */
export const PRESET_LABELS: Record<StartPlacementPreset, string> = {
  [StartPlacementPreset.ANY]: "All",
  [StartPlacementPreset.CLASSIC]: "Classic 3",
  [StartPlacementPreset.CUSTOM]: "Custom",
};

/**
 * Descriptions for each preset
 */
export const PRESET_DESCRIPTIONS: Record<StartPlacementPreset, string> = {
  [StartPlacementPreset.ANY]: "All 16 placements",
  [StartPlacementPreset.CLASSIC]: "α1, β5, γ11",
  [StartPlacementPreset.CUSTOM]: "Your selection",
};

// DIAMOND MODE PLACEMENTS (odd numbers)

/** All diamond mode placements */
export const ALL_DIAMOND_PLACEMENTS: GridPlacement[] = [
  GridPlacement.ALPHA1,
  GridPlacement.ALPHA3,
  GridPlacement.ALPHA5,
  GridPlacement.ALPHA7,
  GridPlacement.BETA1,
  GridPlacement.BETA3,
  GridPlacement.BETA5,
  GridPlacement.BETA7,
  GridPlacement.GAMMA1,
  GridPlacement.GAMMA3,
  GridPlacement.GAMMA5,
  GridPlacement.GAMMA7,
  GridPlacement.GAMMA9,
  GridPlacement.GAMMA11,
  GridPlacement.GAMMA13,
  GridPlacement.GAMMA15,
];

/** Classic Three placements for diamond mode */
export const CLASSIC_DIAMOND_PLACEMENTS: GridPlacement[] = [
  GridPlacement.ALPHA1,
  GridPlacement.BETA5,
  GridPlacement.GAMMA11,
];

// BOX MODE PLACEMENTS (even numbers)

/** All box mode placements */
export const ALL_BOX_PLACEMENTS: GridPlacement[] = [
  GridPlacement.ALPHA2,
  GridPlacement.ALPHA4,
  GridPlacement.ALPHA6,
  GridPlacement.ALPHA8,
  GridPlacement.BETA2,
  GridPlacement.BETA4,
  GridPlacement.BETA6,
  GridPlacement.BETA8,
  GridPlacement.GAMMA2,
  GridPlacement.GAMMA4,
  GridPlacement.GAMMA6,
  GridPlacement.GAMMA8,
  GridPlacement.GAMMA10,
  GridPlacement.GAMMA12,
  GridPlacement.GAMMA14,
  GridPlacement.GAMMA16,
];

/** Classic Three placements for box mode */
export const CLASSIC_BOX_PLACEMENTS: GridPlacement[] = [
  GridPlacement.ALPHA2,
  GridPlacement.BETA4,
  GridPlacement.GAMMA12,
];


/**
 * Get all placements for a grid mode
 */
export function getAllPlacements(gridMode: GridMode): GridPlacement[] {
  return gridMode === GridMode.DIAMOND
    ? ALL_DIAMOND_PLACEMENTS
    : ALL_BOX_PLACEMENTS;
}

/**
 * Read the persisted blocked-placement slice that belongs to one grid mode.
 * The full array may hold preferences for both grids so switching modes does
 * not discard the selection the user made in the other grid.
 */
export function getBlockedPlacementsForGrid(
  blockedPlacements: readonly GridPlacement[],
  gridMode: GridMode
): GridPlacement[] {
  const gridPlacements = new Set(getAllPlacements(gridMode));
  return blockedPlacements.filter((placement) => gridPlacements.has(placement));
}

/**
 * Get the blocked placements for a preset
 * Returns placements that should be EXCLUDED (blocklist approach)
 *
 * Note: CUSTOM preset returns empty array - the caller should use
 * the stored custom blocked placements instead.
 */
export function getBlockedPlacementsForPreset(
  preset: StartPlacementPreset,
  gridMode: GridMode
): GridPlacement[] {
  const allPlacements = getAllPlacements(gridMode);

  switch (preset) {
    case StartPlacementPreset.ANY:
      // Nothing blocked - all placements allowed
      return [];

    case StartPlacementPreset.CLASSIC: {
      // Block everything EXCEPT the classic three
      const classicPlacements =
        gridMode === GridMode.DIAMOND
          ? CLASSIC_DIAMOND_PLACEMENTS
          : CLASSIC_BOX_PLACEMENTS;

      return allPlacements.filter((pos) => !classicPlacements.includes(pos));
    }

    case StartPlacementPreset.CUSTOM:
      // Custom - caller manages their own blocked list
      // Return empty array as a signal to use stored custom selection
      return [];

    default:
      return [];
  }
}

/**
 * Get allowed placements (inverse of blocked)
 */
export function getAllowedPlacements(
  blockedPlacements: GridPlacement[],
  gridMode: GridMode
): GridPlacement[] {
  const allPlacements = getAllPlacements(gridMode);
  const blockedSet = new Set(blockedPlacements);
  return allPlacements.filter((pos) => !blockedSet.has(pos));
}

/**
 * Determine which preset matches a given blocked list
 * Returns CUSTOM if no preset matches exactly
 */
export function detectPresetFromBlocked(
  blockedPlacements: GridPlacement[],
  gridMode: GridMode
): StartPlacementPreset {
  const blocked = new Set(
    getBlockedPlacementsForGrid(blockedPlacements, gridMode)
  );

  // Check ANY (nothing blocked)
  if (blocked.size === 0) {
    return StartPlacementPreset.ANY;
  }

  // Check CLASSIC (all but 3 blocked)
  const classicBlocked = getBlockedPlacementsForPreset(
    StartPlacementPreset.CLASSIC,
    gridMode
  );
  if (
    classicBlocked.length === blocked.size &&
    classicBlocked.every((pos) => blocked.has(pos))
  ) {
    return StartPlacementPreset.CLASSIC;
  }

  // Any other configuration is CUSTOM
  return StartPlacementPreset.CUSTOM;
}

/**
 * Get a random allowed placement
 */
export function getRandomAllowedPlacement(
  blockedPlacements: GridPlacement[],
  gridMode: GridMode
): GridPlacement {
  const allowed = getAllowedPlacements(blockedPlacements, gridMode);

  if (allowed.length === 0) {
    // Fallback to first placement if somehow all are blocked
    console.warn("All placements blocked, falling back to first placement");
    return getAllPlacements(gridMode)[0]!;
  }

  return allowed[Math.floor(Math.random() * allowed.length)]!;
}
