/**
 * Legacy LOOPType tokens — relocated from loop-types.ts
 *
 * Flat string enum kept as a serialization/boundary artifact.
 * New code should use LOOPSpec from loop-spec.ts instead.
 */

export enum LOOPType {
  ROTATED = "rotated",
  MIRRORED = "mirrored",
  SWAPPED = "swapped",
  INVERTED = "inverted",
  SWAPPED_INVERTED = "swapped_inverted",
  ROTATED_INVERTED = "rotated_inverted",
  MIRRORED_SWAPPED = "mirrored_swapped",
  MIRRORED_INVERTED = "mirrored_inverted",
  ROTATED_SWAPPED = "rotated_swapped",
  MIRRORED_ROTATED = "mirrored_rotated",
  MIRRORED_INVERTED_ROTATED = "mirrored_inverted_rotated",
  MIRRORED_SWAPPED_INVERTED = "mirrored_swapped_inverted",
  ROTATED_SWAPPED_INVERTED = "rotated_swapped_inverted",
  MIRRORED_ROTATED_SWAPPED = "mirrored_rotated_swapped",
  MIRRORED_ROTATED_INVERTED_SWAPPED = "mirrored_rotated_inverted_swapped",
  FLIPPED = "flipped",
  REWOUND = "rewound",
}

export enum Period {
  HALVED = "halved",
  QUARTERED = "quartered",
}

export function periodToNumber(period: Period | undefined): number {
  if (period === Period.QUARTERED) return 4;
  return 2;
}

export function periodFromNumber(period: number): Period {
  return period === 4 ? Period.QUARTERED : Period.HALVED;
}

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

export interface LOOPOption {
  loopType: LOOPType;
  name: string;
  description: string;
}

export interface LOOPValidationResult {
  available: LOOPOption[];
  unavailable: Array<LOOPOption & { reason?: string }>;
}

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

export interface LOOPGenerationOptions {
  length: number;
  loopType: LOOPType;
  period: Period;
  turnIntensity: number;
  level: number;
  propContinuity: "continuous" | "non-continuous";
  gridMode: "box" | "diamond";
}
