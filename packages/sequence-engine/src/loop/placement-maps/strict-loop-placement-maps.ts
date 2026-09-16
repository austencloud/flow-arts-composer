/**
 * Placement and Location Maps for Strict LOOP Variations
 *
 * These maps define transformations for:
 * - MIRRORED: Vertical mirroring of placements and locations
 * - FLIPPED: Horizontal mirroring of placements and locations
 * - SWAPPED: Hand swapping placement transformations
 * - INVERTED: Letter inversion mappings
 * - Compound/counterpart letter relationships
 *
 * Note: ROTATED uses the rotation maps in circular-placement-maps.ts
 *
 * All placement and location values are strings for engine compatibility.
 */

import {
  HALF_PLACEMENT_MAP,
  QUARTER_PLACEMENT_MAP_CW,
  QUARTER_PLACEMENT_MAP_CCW,
} from "./circular-placement-maps.js";

/**
 * The four reflection axes of the eight-point grid.
 *
 * Grid mode decides which locations a sequence uses. It does not limit which
 * reflection axes are available.
 */
export const REFLECTION_AXES = [
  "north-south",
  "east-west",
  "northeast-southwest",
  "northwest-southeast",
] as const;

export type ReflectionAxis = (typeof REFLECTION_AXES)[number];

export const DEFAULT_MIRRORED_AXIS: ReflectionAxis = "north-south";
export const DEFAULT_FLIPPED_AXIS: ReflectionAxis = "east-west";

export function isReflectionAxis(value: unknown): value is ReflectionAxis {
  return (
    typeof value === "string" &&
    (REFLECTION_AXES as readonly string[]).includes(value)
  );
}

/**
 * Mirrors placements vertically across the center horizontal axis (flips east/west).
 * Used by MIRRORED LOOP type.
 *
 * Examples:
 * - alpha2 (SW-NE) <-> alpha8 (SE-NW) - diagonals flip
 * - alpha3 (W-E) <-> alpha7 (E-W) - horizontals swap
 * - alpha1 (S-N) stays - on vertical axis
 */
export const VERTICAL_MIRROR_PLACEMENT_MAP: Record<string, string> = {
  // Alpha group
  alpha1: "alpha1", alpha2: "alpha8", alpha3: "alpha7", alpha4: "alpha6",
  alpha5: "alpha5", alpha6: "alpha4", alpha7: "alpha3", alpha8: "alpha2",
  // Beta group
  beta1: "beta1", beta2: "beta8", beta3: "beta7", beta4: "beta6",
  beta5: "beta5", beta6: "beta4", beta7: "beta3", beta8: "beta2",
  // Gamma group - cross-mirror
  gamma1: "gamma9", gamma2: "gamma16", gamma3: "gamma15", gamma4: "gamma14",
  gamma5: "gamma13", gamma6: "gamma12", gamma7: "gamma11", gamma8: "gamma10",
  gamma9: "gamma1", gamma10: "gamma8", gamma11: "gamma7", gamma12: "gamma6",
  gamma13: "gamma5", gamma14: "gamma4", gamma15: "gamma3", gamma16: "gamma2",
  // Zeta 1-8 <-> Zeta 9-16 swap
  zeta1: "zeta9", zeta2: "zeta16", zeta3: "zeta15", zeta4: "zeta14",
  zeta5: "zeta13", zeta6: "zeta12", zeta7: "zeta11", zeta8: "zeta10",
  zeta9: "zeta1", zeta10: "zeta8", zeta11: "zeta7", zeta12: "zeta6",
  zeta13: "zeta5", zeta14: "zeta4", zeta15: "zeta3", zeta16: "zeta2",
  // Eta 1-8 <-> Eta 9-16 swap
  eta1: "eta9", eta2: "eta16", eta3: "eta15", eta4: "eta14",
  eta5: "eta13", eta6: "eta12", eta7: "eta11", eta8: "eta10",
  eta9: "eta1", eta10: "eta8", eta11: "eta7", eta12: "eta6",
  eta13: "eta5", eta14: "eta4", eta15: "eta3", eta16: "eta2",
  // Tau and Terra - TODO: proper mirror logic when Level 6 is fully specified
  tau1: "tau1", tau2: "tau2", tau3: "tau3", tau4: "tau4",
  tau5: "tau5", tau6: "tau6", tau7: "tau7", tau8: "tau8",
  tau9: "tau9", tau10: "tau10", tau11: "tau11", tau12: "tau12",
  tau13: "tau13", tau14: "tau14", tau15: "tau15", tau16: "tau16",
  terra1: "terra1",
};

/**
 * Mirrors hand locations vertically (flips east/west).
 * Used by MIRRORED for transforming motion end locations.
 */
export const VERTICAL_MIRROR_LOCATION_MAP: Record<string, string> = {
  n: "n", s: "s", e: "w", w: "e",
  ne: "nw", nw: "ne", se: "sw", sw: "se",
  c: "c",
};


/**
 * Mirrors placements horizontally (flips north/south).
 * Used for the Flip transform.
 */
export const HORIZONTAL_MIRROR_PLACEMENT_MAP: Record<string, string> = {
  // Alpha group
  alpha1: "alpha5", alpha2: "alpha4", alpha3: "alpha3", alpha4: "alpha2",
  alpha5: "alpha1", alpha6: "alpha8", alpha7: "alpha7", alpha8: "alpha6",
  // Beta group
  beta1: "beta5", beta2: "beta4", beta3: "beta3", beta4: "beta2",
  beta5: "beta1", beta6: "beta8", beta7: "beta7", beta8: "beta6",
  // Gamma group - north/south flip
  gamma1: "gamma13", gamma2: "gamma12", gamma3: "gamma11", gamma4: "gamma10",
  gamma5: "gamma9", gamma6: "gamma16", gamma7: "gamma15", gamma8: "gamma14",
  gamma9: "gamma5", gamma10: "gamma4", gamma11: "gamma3", gamma12: "gamma2",
  gamma13: "gamma1", gamma14: "gamma8", gamma15: "gamma7", gamma16: "gamma6",
  // Zeta group
  zeta1: "zeta13", zeta2: "zeta12", zeta3: "zeta11", zeta4: "zeta10",
  zeta5: "zeta9", zeta6: "zeta16", zeta7: "zeta15", zeta8: "zeta14",
  zeta9: "zeta5", zeta10: "zeta4", zeta11: "zeta3", zeta12: "zeta2",
  zeta13: "zeta1", zeta14: "zeta8", zeta15: "zeta7", zeta16: "zeta6",
  // Eta group
  eta1: "eta13", eta2: "eta12", eta3: "eta11", eta4: "eta10",
  eta5: "eta9", eta6: "eta16", eta7: "eta15", eta8: "eta14",
  eta9: "eta5", eta10: "eta4", eta11: "eta3", eta12: "eta2",
  eta13: "eta1", eta14: "eta8", eta15: "eta7", eta16: "eta6",
  // Tau and Terra - TODO: proper horizontal mirror logic when Level 6 is fully specified
  tau1: "tau1", tau2: "tau2", tau3: "tau3", tau4: "tau4",
  tau5: "tau5", tau6: "tau6", tau7: "tau7", tau8: "tau8",
  tau9: "tau9", tau10: "tau10", tau11: "tau11", tau12: "tau12",
  tau13: "tau13", tau14: "tau14", tau15: "tau15", tau16: "tau16",
  terra1: "terra1",
};

/**
 * Mirrors hand locations horizontally (flips north/south).
 * Used for the Flip transform.
 */
export const HORIZONTAL_MIRROR_LOCATION_MAP: Record<string, string> = {
  n: "s", s: "n", e: "e", w: "w",
  ne: "se", se: "ne", nw: "sw", sw: "nw",
  c: "c",
};

/**
 * Reflects locations across the NE-SW diagonal.
 */
export const NORTHEAST_SOUTHWEST_REFLECTION_LOCATION_MAP: Record<
  string,
  string
> = {
  n: "e", e: "n", s: "w", w: "s",
  ne: "ne", sw: "sw", nw: "se", se: "nw",
  c: "c",
};

/**
 * Reflects locations across the NW-SE diagonal.
 */
export const NORTHWEST_SOUTHEAST_REFLECTION_LOCATION_MAP: Record<
  string,
  string
> = {
  n: "w", w: "n", s: "e", e: "s",
  nw: "nw", se: "se", ne: "sw", sw: "ne",
  c: "c",
};

/**
 * Canonical location maps for every reflection axis.
 */
export const REFLECTION_LOCATION_MAPS: Readonly<
  Record<ReflectionAxis, Readonly<Record<string, string>>>
> = {
  "north-south": VERTICAL_MIRROR_LOCATION_MAP,
  "east-west": HORIZONTAL_MIRROR_LOCATION_MAP,
  "northeast-southwest": NORTHEAST_SOUTHWEST_REFLECTION_LOCATION_MAP,
  "northwest-southeast": NORTHWEST_SOUTHEAST_REFLECTION_LOCATION_MAP,
};

export function reflectLocation(
  location: string,
  axis: ReflectionAxis
): string | null {
  return REFLECTION_LOCATION_MAPS[axis][location] ?? null;
}

/**
 * Maps placements to their hand-swapped equivalents.
 * Used by SWAPPED LOOP type.
 *
 * Pattern:
 * - Alpha: 180 degree rotation (cross-pattern)
 * - Beta: No change (same placements stay same)
 * - Gamma: Complex cross-swap pattern
 */
export const SWAPPED_PLACEMENT_MAP: Record<string, string> = {
  // Alpha group - 180 degree swap pattern
  alpha1: "alpha5", alpha2: "alpha6", alpha3: "alpha7", alpha4: "alpha8",
  alpha5: "alpha1", alpha6: "alpha2", alpha7: "alpha3", alpha8: "alpha4",
  // Beta group - no change (both hands same location)
  beta1: "beta1", beta2: "beta2", beta3: "beta3", beta4: "beta4",
  beta5: "beta5", beta6: "beta6", beta7: "beta7", beta8: "beta8",
  // Gamma group - cross-swap pattern
  gamma1: "gamma15", gamma2: "gamma16", gamma3: "gamma9", gamma4: "gamma10",
  gamma5: "gamma11", gamma6: "gamma12", gamma7: "gamma13", gamma8: "gamma14",
  gamma9: "gamma3", gamma10: "gamma4", gamma11: "gamma5", gamma12: "gamma6",
  gamma13: "gamma7", gamma14: "gamma8", gamma15: "gamma1", gamma16: "gamma2",
  // Zeta group - swap Left<->Right locations
  zeta1: "zeta14", zeta2: "zeta15", zeta3: "zeta16", zeta4: "zeta9",
  zeta5: "zeta10", zeta6: "zeta11", zeta7: "zeta12", zeta8: "zeta13",
  zeta9: "zeta4", zeta10: "zeta5", zeta11: "zeta6", zeta12: "zeta7",
  zeta13: "zeta8", zeta14: "zeta1", zeta15: "zeta2", zeta16: "zeta3",
  // Eta group - swap Left<->Right locations
  eta1: "eta16", eta2: "eta9", eta3: "eta10", eta4: "eta11",
  eta5: "eta12", eta6: "eta13", eta7: "eta14", eta8: "eta15",
  eta9: "eta2", eta10: "eta3", eta11: "eta4", eta12: "eta5",
  eta13: "eta6", eta14: "eta7", eta15: "eta8", eta16: "eta1",
  // Tau - swap center and perimeter hands
  tau1: "tau9", tau2: "tau10", tau3: "tau11", tau4: "tau12",
  tau5: "tau13", tau6: "tau14", tau7: "tau15", tau8: "tau16",
  tau9: "tau1", tau10: "tau2", tau11: "tau3", tau12: "tau4",
  tau13: "tau5", tau14: "tau6", tau15: "tau7", tau16: "tau8",
  // Terra
  terra1: "terra1",
};


/**
 * Maps letters to their inverted pairs (opposite motion types).
 * Used by INVERTED LOOP type.
 */
export const INVERTED_LETTER_MAP: Record<string, string> = {
  // Basic alphabet pairs
  A: "B", B: "A", C: "C", D: "E", E: "D", F: "F",
  G: "H", H: "G", I: "I", J: "K", K: "J", L: "L",
  M: "N", N: "M", O: "O", P: "Q", Q: "P", R: "R",
  S: "T", T: "S", U: "V", V: "U", W: "X", X: "W",
  Y: "Z", Z: "Y",
  // Greek letters
  "\u03A3": "\u0394", "\u0394": "\u03A3", // Sigma <-> Delta
  "\u0398": "\u03A9", "\u03A9": "\u0398", // Theta <-> Omega
  "\u03A6": "\u03A6", "\u03A8": "\u03A8", "\u039B": "\u039B", // Self-inverted: Phi, Psi, Lambda
  "\u03B1": "\u03B1", "\u03B2": "\u03B2", "\u03B3": "\u03B3", // Self-inverted: alpha, beta, gamma
  // Type 2: Centric shifts
  "\u03BC": "\u03BD", "\u03BD": "\u03BC", // mu <-> nu
  // Type 4: Tau-dash (self-inverted)
  "\u03C4-": "\u03C4-",
  // Type 6: Additional static letters (all self-inverted)
  "\u03B6": "\u03B6", "\u03B7": "\u03B7", "\u03C4": "\u03C4", "\u2295": "\u2295",
  // Dash variations
  "W-": "X-", "X-": "W-", "Y-": "Z-", "Z-": "Y-",
  "\u03A3-": "\u0394-", "\u0394-": "\u03A3-",
  "\u0398-": "\u03A9-", "\u03A9-": "\u0398-",
  "\u03A6-": "\u03A6-", "\u03A8-": "\u03A8-", "\u039B-": "\u039B-",
};

/**
 * Get inverted letter for a given letter.
 * @throws Error if letter not found in map
 */
export function getInvertedLetter(letter: string): string {
  const inverted = INVERTED_LETTER_MAP[letter];
  if (!inverted) {
    throw new Error(`No inverted letter mapping found for letter: ${letter}`);
  }
  return inverted;
}


/**
 * Maps letters that share a common gamma endpoint but differ in their alpha/beta section.
 * Also called "Cross-Section Complementary" relationships.
 */
export const ALPHA_BETA_COUNTERPART_LETTER_MAP: Record<string, string> = {
  // Type 2 Shift letters sharing gamma endpoint
  "\u03A3": "\u0398", "\u0398": "\u03A3", // Sigma <-> Theta
  "\u0394": "\u03A9", "\u03A9": "\u0394", // Delta <-> Omega
  // Destination swap (both start at gamma)
  W: "Y", Y: "W", X: "Z", Z: "X",
  // Type 3 Cross-Shift dash variants
  "\u03A3-": "\u0398-", "\u0398-": "\u03A3-",
  "\u0394-": "\u03A9-", "\u03A9-": "\u0394-",
  "W-": "Y-", "Y-": "W-", "X-": "Z-", "Z-": "X-",
};

/**
 * Returns the letter that shares the same gamma endpoint but swaps alpha<->beta.
 */
export function getAlphaBetaCounterpart(letter: string): string | null {
  return ALPHA_BETA_COUNTERPART_LETTER_MAP[letter] ?? null;
}


/**
 * Maps letters that form compound pairs - letters that combine to create circular motion.
 * These pairs complete each other to return to starting placement.
 */
export const COMPOUND_LETTER_MAP: Record<string, string> = {
  // Type 1 Dual-Shift compound pairs
  D: "J", J: "D", E: "K", K: "E", F: "L", L: "F",
  // Gamma internal compound pairs
  M: "P", P: "M", N: "Q", Q: "N", O: "R", R: "O",
  // Type 4 Dash compound pairs
  "\u03A6": "\u03A8", "\u03A8": "\u03A6", // Phi <-> Psi
};

export function getCompoundLetter(letter: string): string | null {
  return COMPOUND_LETTER_MAP[letter] ?? null;
}


/**
 * Letter Transformation Types for algorithmic detection and generation.
 */
export enum LetterTransformationType {
  INVERSION = "inversion",
  COMPOUND = "compound",
  ALPHA_BETA_COUNTERPART = "alpha_beta_counterpart",
}

export function hasTransformationRelationship(
  letter1: string,
  letter2: string,
  type: LetterTransformationType
): boolean {
  switch (type) {
    case LetterTransformationType.INVERSION:
      return INVERTED_LETTER_MAP[letter1] === letter2;
    case LetterTransformationType.COMPOUND:
      return COMPOUND_LETTER_MAP[letter1] === letter2;
    case LetterTransformationType.ALPHA_BETA_COUNTERPART:
      return ALPHA_BETA_COUNTERPART_LETTER_MAP[letter1] === letter2;
    default:
      return false;
  }
}

export function getLetterRelationships(
  letter1: string,
  letter2: string
): LetterTransformationType[] {
  const relationships: LetterTransformationType[] = [];
  if (INVERTED_LETTER_MAP[letter1] === letter2) {
    relationships.push(LetterTransformationType.INVERSION);
  }
  if (COMPOUND_LETTER_MAP[letter1] === letter2) {
    relationships.push(LetterTransformationType.COMPOUND);
  }
  if (ALPHA_BETA_COUNTERPART_LETTER_MAP[letter1] === letter2) {
    relationships.push(LetterTransformationType.ALPHA_BETA_COUNTERPART);
  }
  return relationships;
}

export function getRelatedLetters(
  letter: string,
  type: LetterTransformationType
): string | null {
  switch (type) {
    case LetterTransformationType.INVERSION:
      return INVERTED_LETTER_MAP[letter] ?? null;
    case LetterTransformationType.COMPOUND:
      return COMPOUND_LETTER_MAP[letter] ?? null;
    case LetterTransformationType.ALPHA_BETA_COUNTERPART:
      return ALPHA_BETA_COUNTERPART_LETTER_MAP[letter] ?? null;
    default:
      return null;
  }
}

export function analyzeStepPairTransformation(
  letter1: string,
  letter2: string
): {
  relationships: LetterTransformationType[];
  isInverted: boolean;
  isCompound: boolean;
  isAlphaBetaCounterpart: boolean;
} {
  const relationships = getLetterRelationships(letter1, letter2);
  return {
    relationships,
    isInverted: relationships.includes(LetterTransformationType.INVERSION),
    isCompound: relationships.includes(LetterTransformationType.COMPOUND),
    isAlphaBetaCounterpart: relationships.includes(
      LetterTransformationType.ALPHA_BETA_COUNTERPART
    ),
  };
}


/**
 * Mirrored LOOP validation set.
 * Valid when: vertical_mirror(start_pos) === end_pos
 */
export const MIRRORED_LOOP_VALIDATION_SET = new Set<string>(
  Object.entries(VERTICAL_MIRROR_PLACEMENT_MAP).map(
    ([start, end]) => `${start},${end}`
  )
);

/**
 * Flipped LOOP validation set.
 * Valid when: horizontal_mirror(start_pos) === end_pos
 */
export const FLIPPED_LOOP_VALIDATION_SET = new Set<string>(
  Object.entries(HORIZONTAL_MIRROR_PLACEMENT_MAP).map(
    ([start, end]) => `${start},${end}`
  )
);

/**
 * Swapped LOOP validation set.
 * Valid when: swapped(start_pos) === end_pos
 */
export const SWAPPED_LOOP_VALIDATION_SET = new Set<string>(
  Object.entries(SWAPPED_PLACEMENT_MAP).map(([start, end]) => `${start},${end}`)
);

/**
 * Mirrored-Swapped LOOP validation set.
 * Valid when: swapped(vertical_mirror(start_pos)) === end_pos
 */
export const MIRRORED_SWAPPED_VALIDATION_SET = new Set<string>(
  Object.entries(VERTICAL_MIRROR_PLACEMENT_MAP).map(([start, mirroredEnd]) => {
    const swappedMirroredEnd = SWAPPED_PLACEMENT_MAP[mirroredEnd] || mirroredEnd;
    return `${start},${swappedMirroredEnd}`;
  })
);

/**
 * Inverted LOOP validation set.
 * Valid when: start_pos === end_pos (returns to starting placement).
 * Generates identity pairs for all known placement groups.
 */
export const INVERTED_LOOP_VALIDATION_SET = new Set<string>(
  Object.keys(VERTICAL_MIRROR_PLACEMENT_MAP).map((pos) => `${pos},${pos}`)
);

/**
 * Mirrored-Inverted LOOP validation set.
 * Placement requirement is same as mirrored (inversion only affects motion types and letters).
 */
export const MIRRORED_INVERTED_VALIDATION_SET = new Set<string>(
  Object.entries(VERTICAL_MIRROR_PLACEMENT_MAP).map(
    ([start, end]) => `${start},${end}`
  )
);

/**
 * Rotated-Swapped LOOP validation set (Quartered - 90 degree rotations).
 * Valid when: end_pos === SWAPPED(ROTATED(start_pos))
 */
export const ROTATED_SWAPPED_QUARTERED_VALIDATION_SET = new Set<string>([
  ...Object.entries(QUARTER_PLACEMENT_MAP_CW).map(([start, rotatedEnd]) => {
    const swappedRotatedEnd = SWAPPED_PLACEMENT_MAP[rotatedEnd] || rotatedEnd;
    return `${start},${swappedRotatedEnd}`;
  }),
  ...Object.entries(QUARTER_PLACEMENT_MAP_CCW).map(([start, rotatedEnd]) => {
    const swappedRotatedEnd = SWAPPED_PLACEMENT_MAP[rotatedEnd] || rotatedEnd;
    return `${start},${swappedRotatedEnd}`;
  }),
]);

/**
 * Rotated-Swapped LOOP validation set (Halved - 180 degree rotations).
 * Valid when: end_pos === SWAPPED(ROTATED_180(start_pos))
 */
export const ROTATED_SWAPPED_HALVED_VALIDATION_SET = new Set<string>(
  Object.entries(HALF_PLACEMENT_MAP).map(([start, rotatedEnd]) => {
    const swappedRotatedEnd = SWAPPED_PLACEMENT_MAP[rotatedEnd] || rotatedEnd;
    return `${start},${swappedRotatedEnd}`;
  })
);
