/**
 * LOOP Validator Implementation
 *
 * Validates which LOOP (Linked Orbital Offset Pattern) types are available
 * for a given placement pair based on placement symmetry rules.
 */

import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  LOOPType,
  LOOP_TYPE_LABELS,
  Period,
} from "$lib/shared/foundation/domain/models/generation/circular-models";

/**
 * Describes a single LOOP option available for extension
 */
export interface LOOPOption {
  /** The LOOP type */
  loopType: LOOPType;
  /** Human-readable name */
  name: string;
  /** Short description of what this LOOP does */
  description: string;
  /** Icon class (FontAwesome) */
  icon: string;
}

/**
 * Result of validating LOOP options for a placement pair
 */
export interface LOOPValidationResult {
  /** LOOP options that are valid for this placement pair */
  available: LOOPOption[];
  /** LOOP options that exist but aren't valid for this placement pair */
  unavailable: LOOPOption[];
}
import {
  isLegacyLOOPSeedValid,
  LOOPType as EngineLOOPType,
  Period as EnginePeriod,
} from "@tka/sequence-engine/loop";

/**
 * LOOP options with icons and descriptions for UI display.
 * LOOP = Linked Orbital Offset Pattern (TKA's algorithmic extension patterns)
 */
const LOOP_OPTION_CONFIG: Record<
  LOOPType,
  { icon: string; description: string }
> = {
  [LOOPType.ROTATED]: {
    icon: "fa-rotate",
    description: "Rotates placements around the grid",
  },
  [LOOPType.MIRRORED]: {
    icon: "fa-reflect-horizontal",
    description: "Mirrors placements vertically",
  },
  [LOOPType.FLIPPED]: {
    icon: "fa-arrows-up-down",
    description: "Mirrors placements horizontally",
  },
  [LOOPType.SWAPPED]: {
    icon: "fa-shuffle",
    description: "Swaps left and right props",
  },
  [LOOPType.INVERTED]: {
    icon: "fa-arrows-up-down",
    description: "Inverts motion directions",
  },
  [LOOPType.SWAPPED_INVERTED]: {
    icon: "fa-arrows-rotate",
    description: "Swaps colors with inverted motion",
  },
  [LOOPType.ROTATED_INVERTED]: {
    icon: "fa-rotate-left",
    description: "Rotates with inverted motion",
  },
  [LOOPType.MIRRORED_SWAPPED]: {
    icon: "fa-clone",
    description: "Mirrors with color swap",
  },
  [LOOPType.MIRRORED_INVERTED]: {
    icon: "fa-arrows-to-line",
    description: "Mirrors with inverted motion",
  },
  [LOOPType.ROTATED_SWAPPED]: {
    icon: "fa-recycle",
    description: "Rotates with color swap",
  },
  [LOOPType.MIRRORED_ROTATED]: {
    icon: "fa-repeat",
    description: "Combines mirroring and rotation",
  },
  [LOOPType.MIRRORED_INVERTED_ROTATED]: {
    icon: "fa-diagram-project",
    description: "Mirror, invert, and rotate",
  },
  [LOOPType.MIRRORED_SWAPPED_INVERTED]: {
    icon: "fa-arrows-spin",
    description: "Mirror, swap hands, and invert motion",
  },
  [LOOPType.ROTATED_SWAPPED_INVERTED]: {
    icon: "fa-arrows-spin",
    description: "Rotate, swap hands, and invert motion",
  },
  [LOOPType.MIRRORED_ROTATED_SWAPPED]: {
    icon: "fa-object-group",
    description: "Mirror, rotate, and swap hands",
  },
  [LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED]: {
    icon: "fa-circle-nodes",
    description: "All four transformations combined",
  },
  [LOOPType.STRICT_REWOUND]: {
    icon: "fa-backward",
    description: "Appends reversed sequence to double length",
  },
};

/** All supported LOOP types in display order */
const ALL_LOOP_TYPES = [
  LOOPType.ROTATED,
  LOOPType.MIRRORED,
  LOOPType.FLIPPED,
  LOOPType.SWAPPED,
  LOOPType.INVERTED,
  LOOPType.SWAPPED_INVERTED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.MIRRORED_SWAPPED,
  LOOPType.MIRRORED_INVERTED,
  LOOPType.ROTATED_SWAPPED,
  LOOPType.MIRRORED_ROTATED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
  LOOPType.MIRRORED_SWAPPED_INVERTED,
  LOOPType.ROTATED_SWAPPED_INVERTED,
  LOOPType.MIRRORED_ROTATED_SWAPPED,
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
  LOOPType.STRICT_REWOUND,
];

export class LOOPValidator {
  /**
   * Get LOOP options filtered by validity for a placement pair
   */
  getLOOPOptionsForPlacementPair(
    startPlacement: GridPlacement,
    endPlacement: GridPlacement,
    period: Period
  ): LOOPValidationResult {
    const available: LOOPOption[] = [];
    const unavailable: LOOPOption[] = [];
    const placementPair = `${startPlacement},${endPlacement}`;

    for (const loopType of ALL_LOOP_TYPES) {
      const config = LOOP_OPTION_CONFIG[loopType];
      const option: LOOPOption = {
        loopType,
        name: LOOP_TYPE_LABELS[loopType],
        description: config.description,
        icon: config.icon,
      };

      if (this.isLOOPValidForPlacementPair(loopType, placementPair, period)) {
        available.push(option);
      } else {
        unavailable.push(option);
      }
    }

    return { available, unavailable };
  }

  /**
   * Check if a LOOP type is valid for a given placement pair
   */
  isLOOPValidForPlacementPair(
    loopType: LOOPType,
    placementPair: string,
    period: Period
  ): boolean {
    const [startPlacement, endPlacement] = placementPair.split(",");
    if (!startPlacement || !endPlacement) return false;
    return isLegacyLOOPSeedValid(
      startPlacement,
      endPlacement,
      toEngineLOOPType(loopType),
      period === Period.QUARTERED ? EnginePeriod.QUARTERED : EnginePeriod.HALVED
    );
  }

  /**
   * Get all supported LOOP options (regardless of placement validity)
   */
  getAllSupportedLOOPOptions(): LOOPOption[] {
    const options: LOOPOption[] = [];

    for (const loopType of ALL_LOOP_TYPES) {
      const config = LOOP_OPTION_CONFIG[loopType];
      options.push({
        loopType,
        name: LOOP_TYPE_LABELS[loopType],
        description: config.description,
        icon: config.icon,
      });
    }

    return options;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
export const loopValidator = new LOOPValidator();

function toEngineLOOPType(loopType: LOOPType): EngineLOOPType {
  return loopType === LOOPType.STRICT_REWOUND
    ? EngineLOOPType.REWOUND
    : (loopType as EngineLOOPType);
}
