/**
 * LOOP (Linked Orbital Offset Pattern) Type Definitions for MCP Server
 *
 * Ported from the main app's circular-models.ts.
 * LOOPs are TKA's algorithmic extension patterns that transform sequences.
 */

/**
 * @deprecated Use LOOPSpec from loop-spec.ts with loopSpecFromLegacy for migration.
 */
export enum LOOPType {
  /** Rotated - rotates locations around the grid */
  ROTATED = "rotated",

  /** Mirrored - mirrors locations vertically */
  MIRRORED = "mirrored",

  /** Swapped - swaps left and right attributes */
  SWAPPED = "swapped",

  /** Inverted - uses inverted letters (opposite motion types) */
  INVERTED = "inverted",

  /** Swapped inverted - combines swapping with inverted motion */
  SWAPPED_INVERTED = "swapped_inverted",

  /** Rotated inverted - combines rotation with inverted motion */
  ROTATED_INVERTED = "rotated_inverted",

  /** Mirrored swapped - combines mirroring with hand swapping */
  MIRRORED_SWAPPED = "mirrored_swapped",

  /** Mirrored inverted - combines mirroring with inverted motion */
  MIRRORED_INVERTED = "mirrored_inverted",

  /** Rotated swapped - combines rotation with hand swapping */
  ROTATED_SWAPPED = "rotated_swapped",

  /** Mirrored rotated - combines mirroring with rotation */
  MIRRORED_ROTATED = "mirrored_rotated",

  /** Mirrored inverted rotated - combines all three transformations */
  MIRRORED_INVERTED_ROTATED = "mirrored_inverted_rotated",

  /** Mirrored swapped inverted - combines mirroring, swapping, and inversion */
  MIRRORED_SWAPPED_INVERTED = "mirrored_swapped_inverted",

  /** Rotated swapped inverted - combines rotation, hand swapping, and inversion */
  ROTATED_SWAPPED_INVERTED = "rotated_swapped_inverted",

  /** Mirrored rotated swapped - inner halved rotation + outer mirrored + swapped */
  MIRRORED_ROTATED_SWAPPED = "mirrored_rotated_swapped",

  /** Mirrored rotated inverted swapped - combines all four transformations */
  MIRRORED_ROTATED_INVERTED_SWAPPED = "mirrored_rotated_inverted_swapped",

  /** Flipped - mirrors locations horizontally (north/south) */
  FLIPPED = "flipped",

  /** Rewound - appends reversed sequence to double length */
  REWOUND = "rewound",
}

/**
 * @deprecated Use integer period in LOOPSpec ComponentSpec.period instead.
 */
export enum Period {
  /** Half rotation - 180° */
  HALVED = "halved",

  /** Quarter rotation - 90° */
  QUARTERED = "quartered",
}

/**
 *
 * HALVED → 2, QUARTERED → 4. The integer is the count of passes required for a
 * LOOP to return to identity in both location and orientation.
 */
export function periodToNumber(period: Period | undefined): number {
  if (period === Period.QUARTERED) return 4;
  return 2;
}

/**
 *
 * 2 → HALVED, 4 → QUARTERED. Period 8 is not yet representable in the enum;
 * callers targeting period 8 must use the integer period API surface.
 */
export function periodFromNumber(period: number): Period {
  return period === 4 ? Period.QUARTERED : Period.HALVED;
}

/**
 * LOOP User-friendly labels
 * Maps LOOP types to display names for UI
 */
export const LOOP_TYPE_LABELS: Record<LOOPType, string> = {
  [LOOPType.ROTATED]: "Rotated",
  [LOOPType.MIRRORED]: "Mirrored",
  [LOOPType.FLIPPED]: "Flipped",
  [LOOPType.SWAPPED]: "Swapped",
  [LOOPType.INVERTED]: "Inverted",
  [LOOPType.SWAPPED_INVERTED]: "Swapped / Inverted",
  [LOOPType.MIRRORED_SWAPPED]: "Mirrored / Swapped",
  [LOOPType.ROTATED_INVERTED]: "Rotated / Inverted",
  [LOOPType.MIRRORED_INVERTED]: "Mirrored / Inverted",
  [LOOPType.ROTATED_SWAPPED]: "Rotated / Swapped",
  [LOOPType.MIRRORED_ROTATED]: "Mirrored / Rotated",
  [LOOPType.MIRRORED_INVERTED_ROTATED]: "Mir / Inv / Rot",
  [LOOPType.MIRRORED_SWAPPED_INVERTED]: "Mir / Swap / Inv",
  [LOOPType.ROTATED_SWAPPED_INVERTED]: "Rot / Swap / Inv",
  [LOOPType.MIRRORED_ROTATED_SWAPPED]: "Mir / Rot / Swap",
  [LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED]: "All Four",
  [LOOPType.REWOUND]: "Rewound",
};

/**
 * LOOP descriptions for each type
 */
export const LOOP_TYPE_DESCRIPTIONS: Record<LOOPType, string> = {
  [LOOPType.ROTATED]: "Rotates locations around the grid",
  [LOOPType.MIRRORED]: "Mirrors locations vertically",
  [LOOPType.FLIPPED]: "Mirrors locations horizontally (north/south)",
  [LOOPType.SWAPPED]: "Swaps left and right props",
  [LOOPType.INVERTED]: "Inverts motion directions",
  [LOOPType.SWAPPED_INVERTED]: "Swaps colors with inverted motion",
  [LOOPType.ROTATED_INVERTED]: "Rotates with inverted motion",
  [LOOPType.MIRRORED_SWAPPED]: "Mirrors with hand swap",
  [LOOPType.MIRRORED_INVERTED]: "Mirrors with inverted motion",
  [LOOPType.ROTATED_SWAPPED]: "Rotates with hand swap",
  [LOOPType.MIRRORED_ROTATED]: "Combines mirroring and rotation",
  [LOOPType.MIRRORED_INVERTED_ROTATED]: "Mirror, invert, and rotate",
  [LOOPType.MIRRORED_SWAPPED_INVERTED]: "Mirror, swap, and invert motion",
  [LOOPType.ROTATED_SWAPPED_INVERTED]: "Rotate, swap, and invert motion",
  [LOOPType.MIRRORED_ROTATED_SWAPPED]: "Inner 180° rotation with outer mirroring and hand swap",
  [LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED]: "All four transformations combined",
  [LOOPType.REWOUND]: "Appends reversed sequence to double length",
};

/**
 * LOOP option structure for validation results
 */
export interface LOOPOption {
  loopType: LOOPType;
  name: string;
  description: string;
}

/**
 * LOOP validation result
 */
export interface LOOPValidationResult {
  available: LOOPOption[];
  unavailable: Array<LOOPOption & { reason?: string }>;
}

/**
 * All supported LOOP types in display order
 */
export const ALL_LOOP_TYPES: LOOPType[] = [
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
  LOOPType.REWOUND,
];


/**
 * LOOP types that involve rotation as part of the transformation
 */
export const ROTATED_LOOP_TYPES = new Set<LOOPType>([
  LOOPType.ROTATED,
  LOOPType.ROTATED_INVERTED,
  LOOPType.ROTATED_SWAPPED,
  LOOPType.ROTATED_SWAPPED_INVERTED,
  LOOPType.MIRRORED_ROTATED,
  LOOPType.MIRRORED_INVERTED_ROTATED,
  LOOPType.MIRRORED_ROTATED_SWAPPED,
  LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED,
]);


/**
 * LOOP Generation Options
 * Configuration for generating circular words
 */
export interface LOOPGenerationOptions {
  /** Total sequence length (will be multiplied based on period) */
  length: number;
  /** LOOP type to apply */
  loopType: LOOPType;
  /** Period for rotational LOOPs */
  period: Period;
  /** Turn intensity (1-3) */
  turnIntensity: number;
  /** Difficulty level (1-3) */
  level: number;
  /** Prop continuity setting */
  propContinuity: "continuous" | "non-continuous";
  /** Grid mode */
  gridMode: "box" | "diamond";
}
