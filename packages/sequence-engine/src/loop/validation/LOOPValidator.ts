/**
 * LOOP Validator for MCP Server
 *
 * Validates which LOOP (Linked Orbital Offset Pattern) types are available
 * for a given placement pair based on placement symmetry rules.
 *
 * Ported from the main app's circular-placement-maps.ts and LOOPValidator.ts
 */

import {
  LOOPType,
  Period,
  LOOP_TYPE_LABELS,
  LOOP_TYPE_DESCRIPTIONS,
  ALL_LOOP_TYPES,
  type LOOPOption,
  type LOOPValidationResult,
} from "../loop-types.js";

import {
  FLIPPED_LOOP_VALIDATION_SET,
  HORIZONTAL_MIRROR_PLACEMENT_MAP,
} from "../placement-maps/strict-loop-placement-maps.js";

import {
  LOOPComponent as CanonicalLOOPComponent,
  type LOOPSpec,
  allActiveComponents,
} from "../loop-spec.js";


/**
 * All valid grid placements (alpha, beta, gamma with variants)
 * These are the string placement identifiers used in the dataframe
 */
const PLACEMENT_GROUPS = ["alpha", "beta", "gamma", "zeta", "eta"] as const;

function generatePlacements(group: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${group}${i + 1}`);
}

// Standard placement sets (8 placements each, plus gamma has 16)
const ALPHA_PLACEMENTS = generatePlacements("alpha", 8);
const BETA_PLACEMENTS = generatePlacements("beta", 8);
const GAMMA_PLACEMENTS = generatePlacements("gamma", 16);
const ZETA_PLACEMENTS = generatePlacements("zeta", 16);
const ETA_PLACEMENTS = generatePlacements("eta", 16);

/**
 * Half placement mappings - 180° rotation
 * Maps each placement to its opposite placement (+4 within 8-placement groups)
 */
const HALF_PLACEMENT_MAP: Record<string, string> = {};

// Alpha placements (1↔5, 2↔6, 3↔7, 4↔8)
for (let i = 1; i <= 8; i++) {
  const opposite = ((i - 1 + 4) % 8) + 1;
  HALF_PLACEMENT_MAP[`alpha${i}`] = `alpha${opposite}`;
}

// Beta placements (same pattern)
for (let i = 1; i <= 8; i++) {
  const opposite = ((i - 1 + 4) % 8) + 1;
  HALF_PLACEMENT_MAP[`beta${i}`] = `beta${opposite}`;
}

// Gamma 1-8 placements (within first half)
for (let i = 1; i <= 8; i++) {
  const opposite = ((i - 1 + 4) % 8) + 1;
  HALF_PLACEMENT_MAP[`gamma${i}`] = `gamma${opposite}`;
}

// Gamma 9-16 placements (within second half)
for (let i = 9; i <= 16; i++) {
  const opposite = ((i - 9 + 4) % 8) + 9;
  HALF_PLACEMENT_MAP[`gamma${i}`] = `gamma${opposite}`;
}

// Zeta 1-8 placements
for (let i = 1; i <= 8; i++) {
  const opposite = ((i - 1 + 4) % 8) + 1;
  HALF_PLACEMENT_MAP[`zeta${i}`] = `zeta${opposite}`;
}

// Zeta 9-16 placements
for (let i = 9; i <= 16; i++) {
  const opposite = ((i - 9 + 4) % 8) + 9;
  HALF_PLACEMENT_MAP[`zeta${i}`] = `zeta${opposite}`;
}

// Eta 1-8 placements
for (let i = 1; i <= 8; i++) {
  const opposite = ((i - 1 + 4) % 8) + 1;
  HALF_PLACEMENT_MAP[`eta${i}`] = `eta${opposite}`;
}

// Eta 9-16 placements
for (let i = 9; i <= 16; i++) {
  const opposite = ((i - 9 + 4) % 8) + 9;
  HALF_PLACEMENT_MAP[`eta${i}`] = `eta${opposite}`;
}

/**
 * Quarter placement mappings - 90° clockwise rotation
 * Maps each placement to +2 placements within group
 */
const QUARTER_PLACEMENT_MAP_CW: Record<string, string> = {};

// Alpha placements (90° CW = +2)
for (let i = 1; i <= 8; i++) {
  const next = ((i - 1 + 2) % 8) + 1;
  QUARTER_PLACEMENT_MAP_CW[`alpha${i}`] = `alpha${next}`;
}

// Beta placements
for (let i = 1; i <= 8; i++) {
  const next = ((i - 1 + 2) % 8) + 1;
  QUARTER_PLACEMENT_MAP_CW[`beta${i}`] = `beta${next}`;
}

// Gamma 1-8
for (let i = 1; i <= 8; i++) {
  const next = ((i - 1 + 2) % 8) + 1;
  QUARTER_PLACEMENT_MAP_CW[`gamma${i}`] = `gamma${next}`;
}

// Gamma 9-16
for (let i = 9; i <= 16; i++) {
  const next = ((i - 9 + 2) % 8) + 9;
  QUARTER_PLACEMENT_MAP_CW[`gamma${i}`] = `gamma${next}`;
}

/**
 * Quarter placement mappings - 90° counter-clockwise rotation
 * Maps each placement to -2 placements within group
 */
const QUARTER_PLACEMENT_MAP_CCW: Record<string, string> = {};

// Alpha placements (90° CCW = -2 = +6 mod 8)
for (let i = 1; i <= 8; i++) {
  const next = ((i - 1 + 6) % 8) + 1;
  QUARTER_PLACEMENT_MAP_CCW[`alpha${i}`] = `alpha${next}`;
}

// Beta placements
for (let i = 1; i <= 8; i++) {
  const next = ((i - 1 + 6) % 8) + 1;
  QUARTER_PLACEMENT_MAP_CCW[`beta${i}`] = `beta${next}`;
}

// Gamma 1-8
for (let i = 1; i <= 8; i++) {
  const next = ((i - 1 + 6) % 8) + 1;
  QUARTER_PLACEMENT_MAP_CCW[`gamma${i}`] = `gamma${next}`;
}

// Gamma 9-16
for (let i = 9; i <= 16; i++) {
  const next = ((i - 9 + 6) % 8) + 9;
  QUARTER_PLACEMENT_MAP_CCW[`gamma${i}`] = `gamma${next}`;
}


/**
 * Halved LOOP validation set
 * Set of (start_placement, end_placement) tuples that are valid for halved LOOPs (180°)
 */
export const HALVED_LOOPS = new Set<string>(
  Object.entries(HALF_PLACEMENT_MAP).map(([start, end]) => `${start},${end}`)
);

/**
 * Quartered LOOP validation set
 * Set of (start_placement, end_placement) tuples that are valid for quartered LOOPs (90°)
 * Includes both CW and CCW rotations
 */
export const QUARTERED_LOOPS = new Set<string>([
  ...Object.entries(QUARTER_PLACEMENT_MAP_CW).map(([start, end]) => `${start},${end}`),
  ...Object.entries(QUARTER_PLACEMENT_MAP_CCW).map(([start, end]) => `${start},${end}`),
]);

/**
 * Vertical Mirror Placement Map
 * Mirrors placements vertically (flips east/west)
 */
const VERTICAL_MIRROR_PLACEMENT_MAP: Record<string, string> = {
  // Alpha group - vertical axis symmetry (1,5 stay same; 2↔8, 3↔7, 4↔6)
  alpha1: "alpha1",
  alpha2: "alpha8",
  alpha3: "alpha7",
  alpha4: "alpha6",
  alpha5: "alpha5",
  alpha6: "alpha4",
  alpha7: "alpha3",
  alpha8: "alpha2",

  // Beta group
  beta1: "beta1",
  beta2: "beta8",
  beta3: "beta7",
  beta4: "beta6",
  beta5: "beta5",
  beta6: "beta4",
  beta7: "beta3",
  beta8: "beta2",

  // Gamma group - cross-mirror pattern (gamma 1-8 ↔ gamma 9-16)
  gamma1: "gamma9",
  gamma2: "gamma16",
  gamma3: "gamma15",
  gamma4: "gamma14",
  gamma5: "gamma13",
  gamma6: "gamma12",
  gamma7: "gamma11",
  gamma8: "gamma10",
  gamma9: "gamma1",
  gamma10: "gamma8",
  gamma11: "gamma7",
  gamma12: "gamma6",
  gamma13: "gamma5",
  gamma14: "gamma4",
  gamma15: "gamma3",
  gamma16: "gamma2",
};

/**
 * Swapped Placement Map
 * Maps placements to their hand-swapped equivalents
 */
const SWAPPED_PLACEMENT_MAP: Record<string, string> = {
  // Alpha group - 180° swap pattern
  alpha1: "alpha5",
  alpha2: "alpha6",
  alpha3: "alpha7",
  alpha4: "alpha8",
  alpha5: "alpha1",
  alpha6: "alpha2",
  alpha7: "alpha3",
  alpha8: "alpha4",

  // Beta group - no change (both hands same location)
  beta1: "beta1",
  beta2: "beta2",
  beta3: "beta3",
  beta4: "beta4",
  beta5: "beta5",
  beta6: "beta6",
  beta7: "beta7",
  beta8: "beta8",

  // Gamma group - cross-swap pattern
  gamma1: "gamma15",
  gamma2: "gamma16",
  gamma3: "gamma9",
  gamma4: "gamma10",
  gamma5: "gamma11",
  gamma6: "gamma12",
  gamma7: "gamma13",
  gamma8: "gamma14",
  gamma9: "gamma3",
  gamma10: "gamma4",
  gamma11: "gamma5",
  gamma12: "gamma6",
  gamma13: "gamma7",
  gamma14: "gamma8",
  gamma15: "gamma1",
  gamma16: "gamma2",
};

/**
 * Mirrored LOOP validation set
 * Valid when: vertical_mirror(start_pos) === end_pos
 */
export const MIRRORED_LOOP_VALIDATION_SET = new Set<string>(
  Object.entries(VERTICAL_MIRROR_PLACEMENT_MAP).map(([start, end]) => `${start},${end}`)
);

/**
 * Swapped LOOP validation set
 * Valid when: swapped(start_pos) === end_pos
 */
export const SWAPPED_LOOP_VALIDATION_SET = new Set<string>(
  Object.entries(SWAPPED_PLACEMENT_MAP).map(([start, end]) => `${start},${end}`)
);

/**
 * Mirrored-Swapped LOOP validation set
 * Valid when: swapped(vertical_mirror(start_pos)) === end_pos
 */
export const MIRRORED_SWAPPED_VALIDATION_SET = new Set<string>(
  Object.entries(VERTICAL_MIRROR_PLACEMENT_MAP).map(([start, mirroredEnd]) => {
    const swappedMirroredEnd = SWAPPED_PLACEMENT_MAP[mirroredEnd] || mirroredEnd;
    return `${start},${swappedMirroredEnd}`;
  })
);

/**
 * Inverted LOOP validation set
 * Valid when: start_pos === end_pos (returns to starting placement)
 */
export const INVERTED_LOOP_VALIDATION_SET = new Set<string>([
  ...ALPHA_PLACEMENTS.map((pos) => `${pos},${pos}`),
  ...BETA_PLACEMENTS.map((pos) => `${pos},${pos}`),
  ...GAMMA_PLACEMENTS.map((pos) => `${pos},${pos}`),
]);

/**
 * Rotated-Swapped LOOP validation set (Halved - 180°)
 * Valid when: end_pos === SWAPPED(ROTATED_180(start_pos))
 */
export const ROTATED_SWAPPED_HALVED_VALIDATION_SET = new Set<string>(
  Object.entries(HALF_PLACEMENT_MAP).map(([start, rotatedEnd]) => {
    const swappedRotatedEnd = SWAPPED_PLACEMENT_MAP[rotatedEnd] || rotatedEnd;
    return `${start},${swappedRotatedEnd}`;
  })
);

/**
 * Rotated-Swapped LOOP validation set (Quartered - 90°)
 * Valid when: end_pos === SWAPPED(ROTATED_90(start_pos))
 */
export const ROTATED_SWAPPED_QUARTERED_VALIDATION_SET = new Set<string>([
  // Clockwise rotation then swap
  ...Object.entries(QUARTER_PLACEMENT_MAP_CW).map(([start, rotatedEnd]) => {
    const swappedRotatedEnd = SWAPPED_PLACEMENT_MAP[rotatedEnd] || rotatedEnd;
    return `${start},${swappedRotatedEnd}`;
  }),
  // Counter-clockwise rotation then swap
  ...Object.entries(QUARTER_PLACEMENT_MAP_CCW).map(([start, rotatedEnd]) => {
    const swappedRotatedEnd = SWAPPED_PLACEMENT_MAP[rotatedEnd] || rotatedEnd;
    return `${start},${swappedRotatedEnd}`;
  }),
]);


/** @deprecated Use isLOOPValidForSpec instead. */
export function isLOOPValidForPlacementPair(
  loopType: LOOPType,
  placementPair: string,
  period: Period
): boolean {
  // Rotated LOOPs use rotation-based validation
  const rotationSet = period === Period.QUARTERED ? QUARTERED_LOOPS : HALVED_LOOPS;

  // Rotated+Swapped LOOPs need composed validation
  const rotatedSwappedSet =
    period === Period.QUARTERED
      ? ROTATED_SWAPPED_QUARTERED_VALIDATION_SET
      : ROTATED_SWAPPED_HALVED_VALIDATION_SET;

  switch (loopType) {
    // Pure rotation-based LOOPs
    case LOOPType.ROTATED:
    case LOOPType.ROTATED_INVERTED:
      return rotationSet.has(placementPair);

    // Rotated + Swapped
    case LOOPType.ROTATED_SWAPPED:
      return rotatedSwappedSet.has(placementPair);

    // Pure mirror-based LOOPs
    case LOOPType.MIRRORED:
    case LOOPType.MIRRORED_INVERTED:
      return MIRRORED_LOOP_VALIDATION_SET.has(placementPair);

    // Flipped (horizontal mirror)
    case LOOPType.FLIPPED:
      return FLIPPED_LOOP_VALIDATION_SET.has(placementPair);

    // Mirrored + Swapped
    case LOOPType.MIRRORED_SWAPPED:
      return MIRRORED_SWAPPED_VALIDATION_SET.has(placementPair);

    // Compound LOOPs containing ROTATED
    case LOOPType.MIRRORED_ROTATED:
    case LOOPType.MIRRORED_INVERTED_ROTATED:
    case LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED:
      return MIRRORED_LOOP_VALIDATION_SET.has(placementPair) && rotationSet.has(placementPair);

    // Swap-based LOOPs
    case LOOPType.SWAPPED:
    case LOOPType.SWAPPED_INVERTED:
      return SWAPPED_LOOP_VALIDATION_SET.has(placementPair);

    // Invert-only LOOP
    case LOOPType.INVERTED:
      return INVERTED_LOOP_VALIDATION_SET.has(placementPair);

    // Rewound LOOP - always valid (works on any sequence)
    case LOOPType.REWOUND:
      return true;

    default:
      return false;
  }
}

export function isLOOPValidForSpec(
  spec: LOOPSpec,
  placementPair: string,
): boolean {
  const active = allActiveComponents(spec);

  for (const [comp, { period }] of active) {
    switch (comp) {
      case CanonicalLOOPComponent.ROTATED: {
        const set = period === 4 ? QUARTERED_LOOPS : HALVED_LOOPS;
        if (!set.has(placementPair)) return false;
        break;
      }
      case CanonicalLOOPComponent.MIRRORED:
        if (!MIRRORED_LOOP_VALIDATION_SET.has(placementPair)) return false;
        break;
      case CanonicalLOOPComponent.FLIPPED:
        if (!FLIPPED_LOOP_VALIDATION_SET.has(placementPair)) return false;
        break;
      case CanonicalLOOPComponent.SWAPPED:
        if (!SWAPPED_LOOP_VALIDATION_SET.has(placementPair)) return false;
        break;
      case CanonicalLOOPComponent.INVERTED:
        if (!INVERTED_LOOP_VALIDATION_SET.has(placementPair)) return false;
        break;
      case CanonicalLOOPComponent.REWOUND:
        break;
    }
  }

  return true;
}

export function getLOOPOptionsForPlacementPair(
  startPlacement: string,
  endPlacement: string,
  period: Period
): LOOPValidationResult {
  const available: LOOPOption[] = [];
  const unavailable: Array<LOOPOption & { reason?: string }> = [];
  const placementPair = `${startPlacement},${endPlacement}`;

  for (const loopType of ALL_LOOP_TYPES) {
    const option: LOOPOption = {
      loopType,
      name: LOOP_TYPE_LABELS[loopType],
      description: LOOP_TYPE_DESCRIPTIONS[loopType],
    };

    if (isLOOPValidForPlacementPair(loopType, placementPair, period)) {
      available.push(option);
    } else {
      unavailable.push({
        ...option,
        reason: "Placement pair not valid for this LOOP type",
      });
    }
  }

  return { available, unavailable };
}

export function getExpectedEndPlacement(
  startPlacement: string,
  loopType: LOOPType,
  period: Period
): string | null {
  switch (loopType) {
    case LOOPType.ROTATED:
    case LOOPType.ROTATED_INVERTED:
      if (period === Period.HALVED) {
        return HALF_PLACEMENT_MAP[startPlacement] || null;
      } else {
        // For quartered, could be either CW or CCW
        return QUARTER_PLACEMENT_MAP_CW[startPlacement] || null;
      }

    case LOOPType.MIRRORED:
    case LOOPType.MIRRORED_INVERTED:
      return VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement] || null;

    case LOOPType.FLIPPED:
      return HORIZONTAL_MIRROR_PLACEMENT_MAP[startPlacement] || null;

    case LOOPType.SWAPPED:
    case LOOPType.SWAPPED_INVERTED:
      return SWAPPED_PLACEMENT_MAP[startPlacement] || null;

    case LOOPType.INVERTED:
      return startPlacement; // Returns to same placement

    case LOOPType.REWOUND:
      return startPlacement; // Rewound always returns to start

    default:
      return null;
  }
}

/**
 * Find bridge letters that could transition from currentEndPlacement to a
 * valid end placement for the given LOOP type.
 * @param startPlacement - The sequence's start placement (used to determine valid LOOP end placements)
 * @param currentEndPlacement - Where the sequence currently ends
 * @param loopType - The LOOP type we want to achieve
 * @param period - Halved or quartered
 * @param allPictographs - Pictograph data to find bridge letters from
 * @returns Array of bridge letter options that would make the LOOP valid, or empty if no bridge needed/possible
 */
export function findBridgeLettersForLoop(
  startPlacement: string,
  currentEndPlacement: string,
  loopType: LOOPType,
  period: Period,
  allPictographs: Array<{ letter: string; startPlacement: string; endPlacement: string }>
): string[] {
  // Get what end placements would be valid for this LOOP
  const validEndPlacements = getValidEndPlacementsForLoop(startPlacement, loopType, period);

  // If current placement is already valid, no bridge needed
  if (validEndPlacements.includes(currentEndPlacement)) {
    return [];
  }

  // Find letters that start at currentEndPlacement and end at a valid placement
  const bridgeOptions: string[] = [];
  const seenLetters = new Set<string>();

  for (const picto of allPictographs) {
    // Must start at our current end placement
    if (picto.startPlacement !== currentEndPlacement) continue;

    // Must end at a valid LOOP placement
    if (!validEndPlacements.includes(picto.endPlacement)) continue;

    // Avoid duplicates (same letter, different variations)
    if (seenLetters.has(picto.letter)) continue;
    seenLetters.add(picto.letter);

    bridgeOptions.push(picto.letter);
  }

  return bridgeOptions;
}

/**
 * Unlike getExpectedEndPlacement which returns a single placement, this returns
 * all placements that would make the LOOP valid (e.g., both CW and CCW for quartered).
 */
export function getValidEndPlacementsForLoop(
  startPlacement: string,
  loopType: LOOPType,
  period: Period
): string[] {
  const validPlacements: string[] = [];

  switch (loopType) {
    case LOOPType.ROTATED:
    case LOOPType.ROTATED_INVERTED:
      if (period === Period.HALVED) {
        const halved = HALF_PLACEMENT_MAP[startPlacement];
        if (halved) validPlacements.push(halved);
      } else {
        // Quartered: both CW and CCW are valid
        const cw = QUARTER_PLACEMENT_MAP_CW[startPlacement];
        const ccw = QUARTER_PLACEMENT_MAP_CCW[startPlacement];
        if (cw) validPlacements.push(cw);
        if (ccw && ccw !== cw) validPlacements.push(ccw);
      }
      break;

    case LOOPType.MIRRORED:
    case LOOPType.MIRRORED_INVERTED: {
      const mirrored = VERTICAL_MIRROR_PLACEMENT_MAP[startPlacement];
      if (mirrored) validPlacements.push(mirrored);
      break;
    }

    case LOOPType.FLIPPED: {
      const flipped = HORIZONTAL_MIRROR_PLACEMENT_MAP[startPlacement];
      if (flipped) validPlacements.push(flipped);
      break;
    }

    case LOOPType.SWAPPED:
    case LOOPType.SWAPPED_INVERTED: {
      const swapped = SWAPPED_PLACEMENT_MAP[startPlacement];
      if (swapped) validPlacements.push(swapped);
      break;
    }

    case LOOPType.INVERTED:
      validPlacements.push(startPlacement); // Returns to same placement
      break;

    case LOOPType.REWOUND:
      // Rewound works with any end placement - return null to indicate "no constraint"
      // But for API consistency, we return the start (since it will end there after rewound)
      validPlacements.push(startPlacement);
      break;
  }

  return validPlacements;
}
