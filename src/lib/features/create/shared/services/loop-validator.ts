/**
 * LOOP Validator Implementation
 *
 * Validates which LOOP (Linked Orbital Offset Pattern) types are available
 * for a given placement pair based on placement symmetry rules.
 */

import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { LOOPExecutorSelector } from "$lib/features/create/generate/circular/services/loop-executor-selector";
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
  HALVED_LOOPS,
  QUARTERED_LOOPS,
} from "$lib/shared/foundation/domain/models/generation/circular-placement-maps";
import {
  MIRRORED_LOOP_VALIDATION_SET,
  FLIPPED_LOOP_VALIDATION_SET,
  SWAPPED_LOOP_VALIDATION_SET,
  INVERTED_LOOP_VALIDATION_SET,
  MIRRORED_SWAPPED_VALIDATION_SET,
  ROTATED_SWAPPED_NONDEGENERATE_QUARTERED_VALIDATION_SET,
  ROTATED_SWAPPED_NONDEGENERATE_HALVED_VALIDATION_SET,
} from "$lib/features/create/generate/circular/domain/constants/strict-loop-placement-maps";

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
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
  LOOPType.STRICT_REWOUND,
];

export class LOOPValidator {
  constructor(private loopExecutorSelector: LOOPExecutorSelector) {}

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
      if (!this.loopExecutorSelector.isSupported(loopType)) {
        continue;
      }

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
    // Rotated LOOPs use rotation-based validation
    const rotationSet =
      period === Period.QUARTERED ? QUARTERED_LOOPS : HALVED_LOOPS;

    // Rotated+Swapped LOOPs need composed validation (rotation THEN swap),
    // excluding alpha starts, where rotate+swap cancel per-hand and the
    // combo degenerates. Beta and gamma are genuine. Matches the engine-side
    // composed swap(rotate(start)) seam gate.
    const rotatedSwappedSet =
      period === Period.QUARTERED
        ? ROTATED_SWAPPED_NONDEGENERATE_QUARTERED_VALIDATION_SET
        : ROTATED_SWAPPED_NONDEGENERATE_HALVED_VALIDATION_SET;

    switch (loopType) {
      // Pure rotation-based LOOPs (no swap component)
      case LOOPType.ROTATED:
      case LOOPType.ROTATED_INVERTED:
        return rotationSet.has(placementPair);

      // Rotated + Swapped: end must be SWAPPED(ROTATED(start))
      case LOOPType.ROTATED_SWAPPED:
        return rotatedSwappedSet.has(placementPair);

      // Pure mirror-based LOOPs (no rotation component)
      case LOOPType.MIRRORED:
      case LOOPType.MIRRORED_INVERTED:
        return MIRRORED_LOOP_VALIDATION_SET.has(placementPair);

      // Flipped LOOP (N ↔ S)
      case LOOPType.FLIPPED:
        return FLIPPED_LOOP_VALIDATION_SET.has(placementPair);

      // Mirrored + Swapped (uses composed validation set)
      case LOOPType.MIRRORED_SWAPPED:
        return MIRRORED_SWAPPED_VALIDATION_SET.has(placementPair);

      // Compound LOOPs containing ROTATED - need BOTH mirror AND rotation validation
      case LOOPType.MIRRORED_ROTATED:
      case LOOPType.MIRRORED_INVERTED_ROTATED:
        return (
          MIRRORED_LOOP_VALIDATION_SET.has(placementPair) &&
          rotationSet.has(placementPair)
        );

      // All Four: additionally restricted to starts fixed under both mirror
      // and swap (beta1/beta5) — elsewhere the mirror degrades to a flip
      case LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED:
        return (
          (placementPair.startsWith("beta1,") ||
            placementPair.startsWith("beta5,")) &&
          MIRRORED_LOOP_VALIDATION_SET.has(placementPair) &&
          rotationSet.has(placementPair)
        );

      // Swap-based LOOPs
      case LOOPType.SWAPPED:
      case LOOPType.SWAPPED_INVERTED:
        return SWAPPED_LOOP_VALIDATION_SET.has(placementPair);

      // Invert-only LOOP (needs same start/end placement)
      case LOOPType.INVERTED:
        return INVERTED_LOOP_VALIDATION_SET.has(placementPair);

      // Mirrored + Swapped + Inverted: inverted dominates placement-wise —
      // return to start — but the start must be fixed under both mirror and
      // swap (beta1/beta5); elsewhere the mirror degrades to a flip
      case LOOPType.MIRRORED_SWAPPED_INVERTED:
        return (
          (placementPair.startsWith("beta1,") ||
            placementPair.startsWith("beta5,")) &&
          INVERTED_LOOP_VALIDATION_SET.has(placementPair)
        );

      // Rotated + Swapped + Inverted: placement-wise identical to
      // Rotated + Swapped (inversion is placement-free) — beta starts only
      case LOOPType.ROTATED_SWAPPED_INVERTED:
        return rotatedSwappedSet.has(placementPair);

      // Rewound LOOP - always valid (works on any sequence regardless of placements)
      case LOOPType.STRICT_REWOUND:
        return true;

      default:
        // Unknown LOOP type - assume not valid
        return false;
    }
  }

  /**
   * Get all supported LOOP options (regardless of placement validity)
   */
  getAllSupportedLOOPOptions(): LOOPOption[] {
    const options: LOOPOption[] = [];

    for (const loopType of ALL_LOOP_TYPES) {
      if (this.loopExecutorSelector.isSupported(loopType)) {
        const config = LOOP_OPTION_CONFIG[loopType];
        options.push({
          loopType,
          name: LOOP_TYPE_LABELS[loopType],
          description: config.description,
          icon: config.icon,
        });
      }
    }

    return options;
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================
import { loopExecutorSelector } from "$lib/features/create/generate/circular/services/loop-executor-selector";

export const loopValidator = new LOOPValidator(loopExecutorSelector);
