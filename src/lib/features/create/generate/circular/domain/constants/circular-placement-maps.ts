/**
 * Circular Placement Maps for LOOP (Linked Orbital Offset Pattern) Generation
 *
 * These maps define the valid end placements for circular sequences based on rotation angles.
 * - Halved LOOPs: 180° rotation (placement +4 or -4)
 * - Quartered LOOPs: 90° rotation (placement +2 or -2 for clockwise/counter-clockwise)
 */

import {
  GridPlacement,
  GridPlacementGroup,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

/**
 * Placement Zone Types
 * Alpha and Beta have 8 placements each.
 * Gamma has 16 placements split into two structural halves.
 */
export type PlacementZone = "alpha" | "beta" | "gamma1-8" | "gamma9-16";

/**
 * Extract the zone from a GridPlacement
 */
export function getPlacementZone(placement: GridPlacement): PlacementZone {
  if (placement.startsWith("alpha")) return "alpha";
  if (placement.startsWith("beta")) return "beta";
  if (placement.startsWith("gamma")) {
    const num = parseInt(placement.replace("gamma", ""), 10);
    return num <= 8 ? "gamma1-8" : "gamma9-16";
  }
  throw new Error(`Unknown placement: ${placement}`);
}

/**
 * Get the placement group (ALPHA, BETA, GAMMA) from a GridPlacement
 */
export function getPlacementGroup(placement: GridPlacement): GridPlacementGroup {
  if (placement.startsWith("alpha")) return GridPlacementGroup.ALPHA;
  if (placement.startsWith("beta")) return GridPlacementGroup.BETA;
  if (placement.startsWith("gamma")) return GridPlacementGroup.GAMMA;
  throw new Error(`Unknown placement: ${placement}`);
}

/**
 * Zone coverage analysis result
 */
export interface ZoneCoverageAnalysis {
  alpha: GridPlacement[];
  beta: GridPlacement[];
  gamma1to8: GridPlacement[];
  gamma9to16: GridPlacement[];
  summary: {
    alphaCount: number;
    betaCount: number;
    gamma1to8Count: number;
    gamma9to16Count: number;
    totalZonesCovered: number; // 0-4
    isComplete: boolean; // All 4 zones represented
  };
}

/**
 * Analyze zone coverage for a list of end placements
 */
export function analyzeZoneCoverage(
  placements: (GridPlacement | null | undefined)[]
): ZoneCoverageAnalysis {
  const alpha: GridPlacement[] = [];
  const beta: GridPlacement[] = [];
  const gamma1to8: GridPlacement[] = [];
  const gamma9to16: GridPlacement[] = [];

  for (const placement of placements) {
    if (!placement) continue;
    const zone = getPlacementZone(placement);
    switch (zone) {
      case "alpha":
        alpha.push(placement);
        break;
      case "beta":
        beta.push(placement);
        break;
      case "gamma1-8":
        gamma1to8.push(placement);
        break;
      case "gamma9-16":
        gamma9to16.push(placement);
        break;
    }
  }

  const zonesCovered = [alpha, beta, gamma1to8, gamma9to16].filter(
    (arr) => arr.length > 0
  ).length;

  return {
    alpha,
    beta,
    gamma1to8,
    gamma9to16,
    summary: {
      alphaCount: alpha.length,
      betaCount: beta.length,
      gamma1to8Count: gamma1to8.length,
      gamma9to16Count: gamma9to16.length,
      totalZonesCovered: zonesCovered,
      isComplete: zonesCovered === 4,
    },
  };
}

/**
 * Half position map - 180° rotation
 * Maps each position to its opposite position (4 positions away within each 8-position group)
 */
export const HALF_PLACEMENT_MAP: Record<GridPlacement, GridPlacement> = {
  // Alpha positions
  [GridPlacement.ALPHA1]: GridPlacement.ALPHA5,
  [GridPlacement.ALPHA2]: GridPlacement.ALPHA6,
  [GridPlacement.ALPHA3]: GridPlacement.ALPHA7,
  [GridPlacement.ALPHA4]: GridPlacement.ALPHA8,
  [GridPlacement.ALPHA5]: GridPlacement.ALPHA1,
  [GridPlacement.ALPHA6]: GridPlacement.ALPHA2,
  [GridPlacement.ALPHA7]: GridPlacement.ALPHA3,
  [GridPlacement.ALPHA8]: GridPlacement.ALPHA4,

  // Beta positions
  [GridPlacement.BETA1]: GridPlacement.BETA5,
  [GridPlacement.BETA2]: GridPlacement.BETA6,
  [GridPlacement.BETA3]: GridPlacement.BETA7,
  [GridPlacement.BETA4]: GridPlacement.BETA8,
  [GridPlacement.BETA5]: GridPlacement.BETA1,
  [GridPlacement.BETA6]: GridPlacement.BETA2,
  [GridPlacement.BETA7]: GridPlacement.BETA3,
  [GridPlacement.BETA8]: GridPlacement.BETA4,

  // Gamma 1-8 positions
  [GridPlacement.GAMMA1]: GridPlacement.GAMMA5,
  [GridPlacement.GAMMA2]: GridPlacement.GAMMA6,
  [GridPlacement.GAMMA3]: GridPlacement.GAMMA7,
  [GridPlacement.GAMMA4]: GridPlacement.GAMMA8,
  [GridPlacement.GAMMA5]: GridPlacement.GAMMA1,
  [GridPlacement.GAMMA6]: GridPlacement.GAMMA2,
  [GridPlacement.GAMMA7]: GridPlacement.GAMMA3,
  [GridPlacement.GAMMA8]: GridPlacement.GAMMA4,

  // Gamma 9-16 positions
  [GridPlacement.GAMMA9]: GridPlacement.GAMMA13,
  [GridPlacement.GAMMA10]: GridPlacement.GAMMA14,
  [GridPlacement.GAMMA11]: GridPlacement.GAMMA15,
  [GridPlacement.GAMMA12]: GridPlacement.GAMMA16,
  [GridPlacement.GAMMA13]: GridPlacement.GAMMA9,
  [GridPlacement.GAMMA14]: GridPlacement.GAMMA10,
  [GridPlacement.GAMMA15]: GridPlacement.GAMMA11,
  [GridPlacement.GAMMA16]: GridPlacement.GAMMA12,

  // Zeta 1-8 positions (135° obtuse angle)
  [GridPlacement.ZETA1]: GridPlacement.ZETA5,
  [GridPlacement.ZETA2]: GridPlacement.ZETA6,
  [GridPlacement.ZETA3]: GridPlacement.ZETA7,
  [GridPlacement.ZETA4]: GridPlacement.ZETA8,
  [GridPlacement.ZETA5]: GridPlacement.ZETA1,
  [GridPlacement.ZETA6]: GridPlacement.ZETA2,
  [GridPlacement.ZETA7]: GridPlacement.ZETA3,
  [GridPlacement.ZETA8]: GridPlacement.ZETA4,

  // Zeta 9-16 positions
  [GridPlacement.ZETA9]: GridPlacement.ZETA13,
  [GridPlacement.ZETA10]: GridPlacement.ZETA14,
  [GridPlacement.ZETA11]: GridPlacement.ZETA15,
  [GridPlacement.ZETA12]: GridPlacement.ZETA16,
  [GridPlacement.ZETA13]: GridPlacement.ZETA9,
  [GridPlacement.ZETA14]: GridPlacement.ZETA10,
  [GridPlacement.ZETA15]: GridPlacement.ZETA11,
  [GridPlacement.ZETA16]: GridPlacement.ZETA12,

  // Eta 1-8 positions (45° acute angle)
  [GridPlacement.ETA1]: GridPlacement.ETA5,
  [GridPlacement.ETA2]: GridPlacement.ETA6,
  [GridPlacement.ETA3]: GridPlacement.ETA7,
  [GridPlacement.ETA4]: GridPlacement.ETA8,
  [GridPlacement.ETA5]: GridPlacement.ETA1,
  [GridPlacement.ETA6]: GridPlacement.ETA2,
  [GridPlacement.ETA7]: GridPlacement.ETA3,
  [GridPlacement.ETA8]: GridPlacement.ETA4,

  // Eta 9-16 positions
  [GridPlacement.ETA9]: GridPlacement.ETA13,
  [GridPlacement.ETA10]: GridPlacement.ETA14,
  [GridPlacement.ETA11]: GridPlacement.ETA15,
  [GridPlacement.ETA12]: GridPlacement.ETA16,
  [GridPlacement.ETA13]: GridPlacement.ETA9,
  [GridPlacement.ETA14]: GridPlacement.ETA10,
  [GridPlacement.ETA15]: GridPlacement.ETA11,
  [GridPlacement.ETA16]: GridPlacement.ETA12,

  // Tau positions - 180° rotation switches which hand is at center
  [GridPlacement.TAU1]: GridPlacement.TAU9,
  [GridPlacement.TAU2]: GridPlacement.TAU10,
  [GridPlacement.TAU3]: GridPlacement.TAU11,
  [GridPlacement.TAU4]: GridPlacement.TAU12,
  [GridPlacement.TAU5]: GridPlacement.TAU13,
  [GridPlacement.TAU6]: GridPlacement.TAU14,
  [GridPlacement.TAU7]: GridPlacement.TAU15,
  [GridPlacement.TAU8]: GridPlacement.TAU16,
  [GridPlacement.TAU9]: GridPlacement.TAU1,
  [GridPlacement.TAU10]: GridPlacement.TAU2,
  [GridPlacement.TAU11]: GridPlacement.TAU3,
  [GridPlacement.TAU12]: GridPlacement.TAU4,
  [GridPlacement.TAU13]: GridPlacement.TAU5,
  [GridPlacement.TAU14]: GridPlacement.TAU6,
  [GridPlacement.TAU15]: GridPlacement.TAU7,
  [GridPlacement.TAU16]: GridPlacement.TAU8,

  // Terra - both hands at center, stays the same
  [GridPlacement.TERRA1]: GridPlacement.TERRA1,
};

/**
 * Quarter position map - Clockwise 90° rotation
 * Maps each position to 2 positions clockwise (for box grid)
 */
export const QUARTER_PLACEMENT_MAP_CW: Record<GridPlacement, GridPlacement> = {
  // Alpha positions
  [GridPlacement.ALPHA1]: GridPlacement.ALPHA3,
  [GridPlacement.ALPHA2]: GridPlacement.ALPHA4,
  [GridPlacement.ALPHA3]: GridPlacement.ALPHA5,
  [GridPlacement.ALPHA4]: GridPlacement.ALPHA6,
  [GridPlacement.ALPHA5]: GridPlacement.ALPHA7,
  [GridPlacement.ALPHA6]: GridPlacement.ALPHA8,
  [GridPlacement.ALPHA7]: GridPlacement.ALPHA1,
  [GridPlacement.ALPHA8]: GridPlacement.ALPHA2,

  // Beta positions
  [GridPlacement.BETA1]: GridPlacement.BETA3,
  [GridPlacement.BETA2]: GridPlacement.BETA4,
  [GridPlacement.BETA3]: GridPlacement.BETA5,
  [GridPlacement.BETA4]: GridPlacement.BETA6,
  [GridPlacement.BETA5]: GridPlacement.BETA7,
  [GridPlacement.BETA6]: GridPlacement.BETA8,
  [GridPlacement.BETA7]: GridPlacement.BETA1,
  [GridPlacement.BETA8]: GridPlacement.BETA2,

  // Gamma 1-8 positions
  [GridPlacement.GAMMA1]: GridPlacement.GAMMA3,
  [GridPlacement.GAMMA2]: GridPlacement.GAMMA4,
  [GridPlacement.GAMMA3]: GridPlacement.GAMMA5,
  [GridPlacement.GAMMA4]: GridPlacement.GAMMA6,
  [GridPlacement.GAMMA5]: GridPlacement.GAMMA7,
  [GridPlacement.GAMMA6]: GridPlacement.GAMMA8,
  [GridPlacement.GAMMA7]: GridPlacement.GAMMA1,
  [GridPlacement.GAMMA8]: GridPlacement.GAMMA2,

  // Gamma 9-16 positions
  [GridPlacement.GAMMA9]: GridPlacement.GAMMA11,
  [GridPlacement.GAMMA10]: GridPlacement.GAMMA12,
  [GridPlacement.GAMMA11]: GridPlacement.GAMMA13,
  [GridPlacement.GAMMA12]: GridPlacement.GAMMA14,
  [GridPlacement.GAMMA13]: GridPlacement.GAMMA15,
  [GridPlacement.GAMMA14]: GridPlacement.GAMMA16,
  [GridPlacement.GAMMA15]: GridPlacement.GAMMA9,
  [GridPlacement.GAMMA16]: GridPlacement.GAMMA10,

  // Zeta 1-8 positions (90° CW = +2 positions)
  [GridPlacement.ZETA1]: GridPlacement.ZETA3,
  [GridPlacement.ZETA2]: GridPlacement.ZETA4,
  [GridPlacement.ZETA3]: GridPlacement.ZETA5,
  [GridPlacement.ZETA4]: GridPlacement.ZETA6,
  [GridPlacement.ZETA5]: GridPlacement.ZETA7,
  [GridPlacement.ZETA6]: GridPlacement.ZETA8,
  [GridPlacement.ZETA7]: GridPlacement.ZETA1,
  [GridPlacement.ZETA8]: GridPlacement.ZETA2,

  // Zeta 9-16 positions
  [GridPlacement.ZETA9]: GridPlacement.ZETA11,
  [GridPlacement.ZETA10]: GridPlacement.ZETA12,
  [GridPlacement.ZETA11]: GridPlacement.ZETA13,
  [GridPlacement.ZETA12]: GridPlacement.ZETA14,
  [GridPlacement.ZETA13]: GridPlacement.ZETA15,
  [GridPlacement.ZETA14]: GridPlacement.ZETA16,
  [GridPlacement.ZETA15]: GridPlacement.ZETA9,
  [GridPlacement.ZETA16]: GridPlacement.ZETA10,

  // Eta 1-8 positions (90° CW = +2 positions)
  [GridPlacement.ETA1]: GridPlacement.ETA3,
  [GridPlacement.ETA2]: GridPlacement.ETA4,
  [GridPlacement.ETA3]: GridPlacement.ETA5,
  [GridPlacement.ETA4]: GridPlacement.ETA6,
  [GridPlacement.ETA5]: GridPlacement.ETA7,
  [GridPlacement.ETA6]: GridPlacement.ETA8,
  [GridPlacement.ETA7]: GridPlacement.ETA1,
  [GridPlacement.ETA8]: GridPlacement.ETA2,

  // Eta 9-16 positions
  [GridPlacement.ETA9]: GridPlacement.ETA11,
  [GridPlacement.ETA10]: GridPlacement.ETA12,
  [GridPlacement.ETA11]: GridPlacement.ETA13,
  [GridPlacement.ETA12]: GridPlacement.ETA14,
  [GridPlacement.ETA13]: GridPlacement.ETA15,
  [GridPlacement.ETA14]: GridPlacement.ETA16,
  [GridPlacement.ETA15]: GridPlacement.ETA9,
  [GridPlacement.ETA16]: GridPlacement.ETA10,

  // Tau 1-8 positions (90° CW = +2 positions within group)
  [GridPlacement.TAU1]: GridPlacement.TAU3,
  [GridPlacement.TAU2]: GridPlacement.TAU4,
  [GridPlacement.TAU3]: GridPlacement.TAU5,
  [GridPlacement.TAU4]: GridPlacement.TAU6,
  [GridPlacement.TAU5]: GridPlacement.TAU7,
  [GridPlacement.TAU6]: GridPlacement.TAU8,
  [GridPlacement.TAU7]: GridPlacement.TAU1,
  [GridPlacement.TAU8]: GridPlacement.TAU2,

  // Tau 9-16 positions
  [GridPlacement.TAU9]: GridPlacement.TAU11,
  [GridPlacement.TAU10]: GridPlacement.TAU12,
  [GridPlacement.TAU11]: GridPlacement.TAU13,
  [GridPlacement.TAU12]: GridPlacement.TAU14,
  [GridPlacement.TAU13]: GridPlacement.TAU15,
  [GridPlacement.TAU14]: GridPlacement.TAU16,
  [GridPlacement.TAU15]: GridPlacement.TAU9,
  [GridPlacement.TAU16]: GridPlacement.TAU10,

  // Terra - both hands at center, stays the same
  [GridPlacement.TERRA1]: GridPlacement.TERRA1,
};

/**
 * Quarter position map - Counter-clockwise 90° rotation
 * Maps each position to 2 positions counter-clockwise (for box grid)
 */
export const QUARTER_PLACEMENT_MAP_CCW: Record<GridPlacement, GridPlacement> = {
  // Alpha positions
  [GridPlacement.ALPHA1]: GridPlacement.ALPHA7,
  [GridPlacement.ALPHA2]: GridPlacement.ALPHA8,
  [GridPlacement.ALPHA3]: GridPlacement.ALPHA1,
  [GridPlacement.ALPHA4]: GridPlacement.ALPHA2,
  [GridPlacement.ALPHA5]: GridPlacement.ALPHA3,
  [GridPlacement.ALPHA6]: GridPlacement.ALPHA4,
  [GridPlacement.ALPHA7]: GridPlacement.ALPHA5,
  [GridPlacement.ALPHA8]: GridPlacement.ALPHA6,

  // Beta positions
  [GridPlacement.BETA1]: GridPlacement.BETA7,
  [GridPlacement.BETA2]: GridPlacement.BETA8,
  [GridPlacement.BETA3]: GridPlacement.BETA1,
  [GridPlacement.BETA4]: GridPlacement.BETA2,
  [GridPlacement.BETA5]: GridPlacement.BETA3,
  [GridPlacement.BETA6]: GridPlacement.BETA4,
  [GridPlacement.BETA7]: GridPlacement.BETA5,
  [GridPlacement.BETA8]: GridPlacement.BETA6,

  // Gamma 1-8 positions
  [GridPlacement.GAMMA1]: GridPlacement.GAMMA7,
  [GridPlacement.GAMMA2]: GridPlacement.GAMMA8,
  [GridPlacement.GAMMA3]: GridPlacement.GAMMA1,
  [GridPlacement.GAMMA4]: GridPlacement.GAMMA2,
  [GridPlacement.GAMMA5]: GridPlacement.GAMMA3,
  [GridPlacement.GAMMA6]: GridPlacement.GAMMA4,
  [GridPlacement.GAMMA7]: GridPlacement.GAMMA5,
  [GridPlacement.GAMMA8]: GridPlacement.GAMMA6,

  // Gamma 9-16 positions
  [GridPlacement.GAMMA9]: GridPlacement.GAMMA15,
  [GridPlacement.GAMMA10]: GridPlacement.GAMMA16,
  [GridPlacement.GAMMA11]: GridPlacement.GAMMA9,
  [GridPlacement.GAMMA12]: GridPlacement.GAMMA10,
  [GridPlacement.GAMMA13]: GridPlacement.GAMMA11,
  [GridPlacement.GAMMA14]: GridPlacement.GAMMA12,
  [GridPlacement.GAMMA15]: GridPlacement.GAMMA13,
  [GridPlacement.GAMMA16]: GridPlacement.GAMMA14,

  // Zeta 1-8 positions (90° CCW = -2 positions = +6 mod 8)
  [GridPlacement.ZETA1]: GridPlacement.ZETA7,
  [GridPlacement.ZETA2]: GridPlacement.ZETA8,
  [GridPlacement.ZETA3]: GridPlacement.ZETA1,
  [GridPlacement.ZETA4]: GridPlacement.ZETA2,
  [GridPlacement.ZETA5]: GridPlacement.ZETA3,
  [GridPlacement.ZETA6]: GridPlacement.ZETA4,
  [GridPlacement.ZETA7]: GridPlacement.ZETA5,
  [GridPlacement.ZETA8]: GridPlacement.ZETA6,

  // Zeta 9-16 positions
  [GridPlacement.ZETA9]: GridPlacement.ZETA15,
  [GridPlacement.ZETA10]: GridPlacement.ZETA16,
  [GridPlacement.ZETA11]: GridPlacement.ZETA9,
  [GridPlacement.ZETA12]: GridPlacement.ZETA10,
  [GridPlacement.ZETA13]: GridPlacement.ZETA11,
  [GridPlacement.ZETA14]: GridPlacement.ZETA12,
  [GridPlacement.ZETA15]: GridPlacement.ZETA13,
  [GridPlacement.ZETA16]: GridPlacement.ZETA14,

  // Eta 1-8 positions (90° CCW = -2 positions = +6 mod 8)
  [GridPlacement.ETA1]: GridPlacement.ETA7,
  [GridPlacement.ETA2]: GridPlacement.ETA8,
  [GridPlacement.ETA3]: GridPlacement.ETA1,
  [GridPlacement.ETA4]: GridPlacement.ETA2,
  [GridPlacement.ETA5]: GridPlacement.ETA3,
  [GridPlacement.ETA6]: GridPlacement.ETA4,
  [GridPlacement.ETA7]: GridPlacement.ETA5,
  [GridPlacement.ETA8]: GridPlacement.ETA6,

  // Eta 9-16 positions
  [GridPlacement.ETA9]: GridPlacement.ETA15,
  [GridPlacement.ETA10]: GridPlacement.ETA16,
  [GridPlacement.ETA11]: GridPlacement.ETA9,
  [GridPlacement.ETA12]: GridPlacement.ETA10,
  [GridPlacement.ETA13]: GridPlacement.ETA11,
  [GridPlacement.ETA14]: GridPlacement.ETA12,
  [GridPlacement.ETA15]: GridPlacement.ETA13,
  [GridPlacement.ETA16]: GridPlacement.ETA14,

  // Tau 1-8 positions (90° CCW = -2 positions = +6 mod 8)
  [GridPlacement.TAU1]: GridPlacement.TAU7,
  [GridPlacement.TAU2]: GridPlacement.TAU8,
  [GridPlacement.TAU3]: GridPlacement.TAU1,
  [GridPlacement.TAU4]: GridPlacement.TAU2,
  [GridPlacement.TAU5]: GridPlacement.TAU3,
  [GridPlacement.TAU6]: GridPlacement.TAU4,
  [GridPlacement.TAU7]: GridPlacement.TAU5,
  [GridPlacement.TAU8]: GridPlacement.TAU6,

  // Tau 9-16 positions
  [GridPlacement.TAU9]: GridPlacement.TAU15,
  [GridPlacement.TAU10]: GridPlacement.TAU16,
  [GridPlacement.TAU11]: GridPlacement.TAU9,
  [GridPlacement.TAU12]: GridPlacement.TAU10,
  [GridPlacement.TAU13]: GridPlacement.TAU11,
  [GridPlacement.TAU14]: GridPlacement.TAU12,
  [GridPlacement.TAU15]: GridPlacement.TAU13,
  [GridPlacement.TAU16]: GridPlacement.TAU14,

  // Terra - both hands at center, stays the same
  [GridPlacement.TERRA1]: GridPlacement.TERRA1,
};

/**
 * Halved LOOP validation set
 * Set of (start_placement, end_placement) tuples that are valid for halved LOOPs
 */
export const HALVED_LOOPS = new Set<string>([
  `${GridPlacement.ALPHA1},${GridPlacement.ALPHA5}`,
  `${GridPlacement.ALPHA2},${GridPlacement.ALPHA6}`,
  `${GridPlacement.ALPHA3},${GridPlacement.ALPHA7}`,
  `${GridPlacement.ALPHA4},${GridPlacement.ALPHA8}`,
  `${GridPlacement.ALPHA5},${GridPlacement.ALPHA1}`,
  `${GridPlacement.ALPHA6},${GridPlacement.ALPHA2}`,
  `${GridPlacement.ALPHA7},${GridPlacement.ALPHA3}`,
  `${GridPlacement.ALPHA8},${GridPlacement.ALPHA4}`,

  `${GridPlacement.BETA1},${GridPlacement.BETA5}`,
  `${GridPlacement.BETA2},${GridPlacement.BETA6}`,
  `${GridPlacement.BETA3},${GridPlacement.BETA7}`,
  `${GridPlacement.BETA4},${GridPlacement.BETA8}`,
  `${GridPlacement.BETA5},${GridPlacement.BETA1}`,
  `${GridPlacement.BETA6},${GridPlacement.BETA2}`,
  `${GridPlacement.BETA7},${GridPlacement.BETA3}`,
  `${GridPlacement.BETA8},${GridPlacement.BETA4}`,

  `${GridPlacement.GAMMA1},${GridPlacement.GAMMA5}`,
  `${GridPlacement.GAMMA2},${GridPlacement.GAMMA6}`,
  `${GridPlacement.GAMMA3},${GridPlacement.GAMMA7}`,
  `${GridPlacement.GAMMA4},${GridPlacement.GAMMA8}`,
  `${GridPlacement.GAMMA5},${GridPlacement.GAMMA1}`,
  `${GridPlacement.GAMMA6},${GridPlacement.GAMMA2}`,
  `${GridPlacement.GAMMA7},${GridPlacement.GAMMA3}`,
  `${GridPlacement.GAMMA8},${GridPlacement.GAMMA4}`,

  `${GridPlacement.GAMMA9},${GridPlacement.GAMMA13}`,
  `${GridPlacement.GAMMA10},${GridPlacement.GAMMA14}`,
  `${GridPlacement.GAMMA11},${GridPlacement.GAMMA15}`,
  `${GridPlacement.GAMMA12},${GridPlacement.GAMMA16}`,
  `${GridPlacement.GAMMA13},${GridPlacement.GAMMA9}`,
  `${GridPlacement.GAMMA14},${GridPlacement.GAMMA10}`,
  `${GridPlacement.GAMMA15},${GridPlacement.GAMMA11}`,
  `${GridPlacement.GAMMA16},${GridPlacement.GAMMA12}`,
]);

/**
 * Quartered LOOP validation set
 * Set of (start_placement, end_placement) tuples that are valid for quartered LOOPs
 */
export const QUARTERED_LOOPS = new Set<string>([
  // Clockwise quarter rotations
  `${GridPlacement.ALPHA1},${GridPlacement.ALPHA3}`,
  `${GridPlacement.ALPHA2},${GridPlacement.ALPHA4}`,
  `${GridPlacement.ALPHA3},${GridPlacement.ALPHA5}`,
  `${GridPlacement.ALPHA4},${GridPlacement.ALPHA6}`,
  `${GridPlacement.ALPHA5},${GridPlacement.ALPHA7}`,
  `${GridPlacement.ALPHA6},${GridPlacement.ALPHA8}`,
  `${GridPlacement.ALPHA7},${GridPlacement.ALPHA1}`,
  `${GridPlacement.ALPHA8},${GridPlacement.ALPHA2}`,

  // Counter-clockwise quarter rotations
  `${GridPlacement.ALPHA1},${GridPlacement.ALPHA7}`,
  `${GridPlacement.ALPHA2},${GridPlacement.ALPHA8}`,
  `${GridPlacement.ALPHA3},${GridPlacement.ALPHA1}`,
  `${GridPlacement.ALPHA4},${GridPlacement.ALPHA2}`,
  `${GridPlacement.ALPHA5},${GridPlacement.ALPHA3}`,
  `${GridPlacement.ALPHA6},${GridPlacement.ALPHA4}`,
  `${GridPlacement.ALPHA7},${GridPlacement.ALPHA5}`,
  `${GridPlacement.ALPHA8},${GridPlacement.ALPHA6}`,

  // Beta clockwise
  `${GridPlacement.BETA1},${GridPlacement.BETA3}`,
  `${GridPlacement.BETA2},${GridPlacement.BETA4}`,
  `${GridPlacement.BETA3},${GridPlacement.BETA5}`,
  `${GridPlacement.BETA4},${GridPlacement.BETA6}`,
  `${GridPlacement.BETA5},${GridPlacement.BETA7}`,
  `${GridPlacement.BETA6},${GridPlacement.BETA8}`,
  `${GridPlacement.BETA7},${GridPlacement.BETA1}`,
  `${GridPlacement.BETA8},${GridPlacement.BETA2}`,

  // Beta counter-clockwise
  `${GridPlacement.BETA1},${GridPlacement.BETA7}`,
  `${GridPlacement.BETA2},${GridPlacement.BETA8}`,
  `${GridPlacement.BETA3},${GridPlacement.BETA1}`,
  `${GridPlacement.BETA4},${GridPlacement.BETA2}`,
  `${GridPlacement.BETA5},${GridPlacement.BETA3}`,
  `${GridPlacement.BETA6},${GridPlacement.BETA4}`,
  `${GridPlacement.BETA7},${GridPlacement.BETA5}`,
  `${GridPlacement.BETA8},${GridPlacement.BETA6}`,

  // Gamma 1-8 clockwise
  `${GridPlacement.GAMMA1},${GridPlacement.GAMMA3}`,
  `${GridPlacement.GAMMA2},${GridPlacement.GAMMA4}`,
  `${GridPlacement.GAMMA3},${GridPlacement.GAMMA5}`,
  `${GridPlacement.GAMMA4},${GridPlacement.GAMMA6}`,
  `${GridPlacement.GAMMA5},${GridPlacement.GAMMA7}`,
  `${GridPlacement.GAMMA6},${GridPlacement.GAMMA8}`,
  `${GridPlacement.GAMMA7},${GridPlacement.GAMMA1}`,
  `${GridPlacement.GAMMA8},${GridPlacement.GAMMA2}`,

  // Gamma 1-8 counter-clockwise
  `${GridPlacement.GAMMA1},${GridPlacement.GAMMA7}`,
  `${GridPlacement.GAMMA2},${GridPlacement.GAMMA8}`,
  `${GridPlacement.GAMMA3},${GridPlacement.GAMMA1}`,
  `${GridPlacement.GAMMA4},${GridPlacement.GAMMA2}`,
  `${GridPlacement.GAMMA5},${GridPlacement.GAMMA3}`,
  `${GridPlacement.GAMMA6},${GridPlacement.GAMMA4}`,
  `${GridPlacement.GAMMA7},${GridPlacement.GAMMA5}`,
  `${GridPlacement.GAMMA8},${GridPlacement.GAMMA6}`,

  // Gamma 9-16 clockwise
  `${GridPlacement.GAMMA9},${GridPlacement.GAMMA11}`,
  `${GridPlacement.GAMMA10},${GridPlacement.GAMMA12}`,
  `${GridPlacement.GAMMA11},${GridPlacement.GAMMA13}`,
  `${GridPlacement.GAMMA12},${GridPlacement.GAMMA14}`,
  `${GridPlacement.GAMMA13},${GridPlacement.GAMMA15}`,
  `${GridPlacement.GAMMA14},${GridPlacement.GAMMA16}`,
  `${GridPlacement.GAMMA15},${GridPlacement.GAMMA9}`,
  `${GridPlacement.GAMMA16},${GridPlacement.GAMMA10}`,

  // Gamma 9-16 counter-clockwise
  `${GridPlacement.GAMMA9},${GridPlacement.GAMMA15}`,
  `${GridPlacement.GAMMA10},${GridPlacement.GAMMA16}`,
  `${GridPlacement.GAMMA11},${GridPlacement.GAMMA9}`,
  `${GridPlacement.GAMMA12},${GridPlacement.GAMMA10}`,
  `${GridPlacement.GAMMA13},${GridPlacement.GAMMA11}`,
  `${GridPlacement.GAMMA14},${GridPlacement.GAMMA12}`,
  `${GridPlacement.GAMMA15},${GridPlacement.GAMMA13}`,
  `${GridPlacement.GAMMA16},${GridPlacement.GAMMA14}`,
]);

/**
 * Location Rotation Maps
 */

import { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

/**
 * Eighth location rotation map - 45° clockwise rotation
 * Rotates locations by one position: N → NE → E → SE → S → SW → W → NW → N
 * This is the correct rotation for sequence transformation (toggles DIAMOND ↔ BOX)
 */
export const LOCATION_MAP_EIGHTH_CW: Record<GridLocation, GridLocation> = {
  [GridLocation.NORTH]: GridLocation.NORTHEAST,
  [GridLocation.NORTHEAST]: GridLocation.EAST,
  [GridLocation.EAST]: GridLocation.SOUTHEAST,
  [GridLocation.SOUTHEAST]: GridLocation.SOUTH,
  [GridLocation.SOUTH]: GridLocation.SOUTHWEST,
  [GridLocation.SOUTHWEST]: GridLocation.WEST,
  [GridLocation.WEST]: GridLocation.NORTHWEST,
  [GridLocation.NORTHWEST]: GridLocation.NORTH,
  [GridLocation.CENTER]: GridLocation.CENTER,
};

/**
 * Clockwise location rotation map
 * Rotates locations 90° clockwise: S → W → N → E → S
 */
export const LOCATION_MAP_CLOCKWISE: Record<GridLocation, GridLocation> = {
  [GridLocation.SOUTH]: GridLocation.WEST,
  [GridLocation.WEST]: GridLocation.NORTH,
  [GridLocation.NORTH]: GridLocation.EAST,
  [GridLocation.EAST]: GridLocation.SOUTH,

  [GridLocation.NORTHEAST]: GridLocation.SOUTHEAST,
  [GridLocation.SOUTHEAST]: GridLocation.SOUTHWEST,
  [GridLocation.SOUTHWEST]: GridLocation.NORTHWEST,
  [GridLocation.NORTHWEST]: GridLocation.NORTHEAST,
  [GridLocation.CENTER]: GridLocation.CENTER,
};

/**
 * Counter-clockwise location rotation map
 * Rotates locations 90° counter-clockwise: S → E → N → W → S
 */
export const LOCATION_MAP_COUNTER_CLOCKWISE: Record<
  GridLocation,
  GridLocation
> = {
  [GridLocation.SOUTH]: GridLocation.EAST,
  [GridLocation.EAST]: GridLocation.NORTH,
  [GridLocation.NORTH]: GridLocation.WEST,
  [GridLocation.WEST]: GridLocation.SOUTH,

  [GridLocation.NORTHEAST]: GridLocation.NORTHWEST,
  [GridLocation.NORTHWEST]: GridLocation.SOUTHWEST,
  [GridLocation.SOUTHWEST]: GridLocation.SOUTHEAST,
  [GridLocation.SOUTHEAST]: GridLocation.NORTHEAST,
  [GridLocation.CENTER]: GridLocation.CENTER,
};

/**
 * Dash location rotation map
 * Flips locations to opposite: S ↔ N, E ↔ W
 */
export const LOCATION_MAP_DASH: Record<GridLocation, GridLocation> = {
  [GridLocation.SOUTH]: GridLocation.NORTH,
  [GridLocation.NORTH]: GridLocation.SOUTH,
  [GridLocation.WEST]: GridLocation.EAST,
  [GridLocation.EAST]: GridLocation.WEST,

  [GridLocation.NORTHEAST]: GridLocation.SOUTHWEST,
  [GridLocation.SOUTHEAST]: GridLocation.NORTHWEST,
  [GridLocation.SOUTHWEST]: GridLocation.NORTHEAST,
  [GridLocation.NORTHWEST]: GridLocation.SOUTHEAST,
  [GridLocation.CENTER]: GridLocation.CENTER,
};

/**
 * Static location rotation map
 * Locations stay in place (no rotation)
 */
export const LOCATION_MAP_STATIC: Record<GridLocation, GridLocation> = {
  [GridLocation.SOUTH]: GridLocation.SOUTH,
  [GridLocation.NORTH]: GridLocation.NORTH,
  [GridLocation.WEST]: GridLocation.WEST,
  [GridLocation.EAST]: GridLocation.EAST,

  [GridLocation.NORTHEAST]: GridLocation.NORTHEAST,
  [GridLocation.SOUTHEAST]: GridLocation.SOUTHEAST,
  [GridLocation.SOUTHWEST]: GridLocation.SOUTHWEST,
  [GridLocation.NORTHWEST]: GridLocation.NORTHWEST,
  [GridLocation.CENTER]: GridLocation.CENTER,
};

/**
 * Hand rotation direction map
 * Maps (startLocation, endLocation) tuples to rotation direction
 */
export const HAND_ROTATION_DIRECTION_MAP = new Map<
  string,
  RotationDirection | "dash" | "static"
>([
  // Clockwise cardinal rotations
  [`${GridLocation.SOUTH},${GridLocation.WEST}`, RotationDirection.CLOCKWISE],
  [`${GridLocation.WEST},${GridLocation.NORTH}`, RotationDirection.CLOCKWISE],
  [`${GridLocation.NORTH},${GridLocation.EAST}`, RotationDirection.CLOCKWISE],
  [`${GridLocation.EAST},${GridLocation.SOUTH}`, RotationDirection.CLOCKWISE],

  // Counter-clockwise cardinal rotations
  [
    `${GridLocation.WEST},${GridLocation.SOUTH}`,
    RotationDirection.COUNTER_CLOCKWISE,
  ],
  [
    `${GridLocation.NORTH},${GridLocation.WEST}`,
    RotationDirection.COUNTER_CLOCKWISE,
  ],
  [
    `${GridLocation.EAST},${GridLocation.NORTH}`,
    RotationDirection.COUNTER_CLOCKWISE,
  ],
  [
    `${GridLocation.SOUTH},${GridLocation.EAST}`,
    RotationDirection.COUNTER_CLOCKWISE,
  ],

  // Dash (opposite) movements
  [`${GridLocation.SOUTH},${GridLocation.NORTH}`, "dash"],
  [`${GridLocation.WEST},${GridLocation.EAST}`, "dash"],
  [`${GridLocation.NORTH},${GridLocation.SOUTH}`, "dash"],
  [`${GridLocation.EAST},${GridLocation.WEST}`, "dash"],

  // Static (no movement)
  [`${GridLocation.NORTH},${GridLocation.NORTH}`, "static"],
  [`${GridLocation.EAST},${GridLocation.EAST}`, "static"],
  [`${GridLocation.SOUTH},${GridLocation.SOUTH}`, "static"],
  [`${GridLocation.WEST},${GridLocation.WEST}`, "static"],

  // Clockwise diagonal rotations
  [
    `${GridLocation.NORTHEAST},${GridLocation.SOUTHEAST}`,
    RotationDirection.CLOCKWISE,
  ],
  [
    `${GridLocation.SOUTHEAST},${GridLocation.SOUTHWEST}`,
    RotationDirection.CLOCKWISE,
  ],
  [
    `${GridLocation.SOUTHWEST},${GridLocation.NORTHWEST}`,
    RotationDirection.CLOCKWISE,
  ],
  [
    `${GridLocation.NORTHWEST},${GridLocation.NORTHEAST}`,
    RotationDirection.CLOCKWISE,
  ],

  // Counter-clockwise diagonal rotations
  [
    `${GridLocation.NORTHEAST},${GridLocation.NORTHWEST}`,
    RotationDirection.COUNTER_CLOCKWISE,
  ],
  [
    `${GridLocation.NORTHWEST},${GridLocation.SOUTHWEST}`,
    RotationDirection.COUNTER_CLOCKWISE,
  ],
  [
    `${GridLocation.SOUTHWEST},${GridLocation.SOUTHEAST}`,
    RotationDirection.COUNTER_CLOCKWISE,
  ],
  [
    `${GridLocation.SOUTHEAST},${GridLocation.NORTHEAST}`,
    RotationDirection.COUNTER_CLOCKWISE,
  ],

  // Dash diagonal movements
  [`${GridLocation.NORTHEAST},${GridLocation.SOUTHWEST}`, "dash"],
  [`${GridLocation.SOUTHEAST},${GridLocation.NORTHWEST}`, "dash"],
  [`${GridLocation.SOUTHWEST},${GridLocation.NORTHEAST}`, "dash"],
  [`${GridLocation.NORTHWEST},${GridLocation.SOUTHEAST}`, "dash"],

  // Static diagonal (no movement)
  [`${GridLocation.NORTHEAST},${GridLocation.NORTHEAST}`, "static"],
  [`${GridLocation.SOUTHEAST},${GridLocation.SOUTHEAST}`, "static"],
  [`${GridLocation.SOUTHWEST},${GridLocation.SOUTHWEST}`, "static"],
  [`${GridLocation.NORTHWEST},${GridLocation.NORTHWEST}`, "static"],
]);

/**
 * Determine hand rotation direction based on start and end locations
 */
export function getHandRotationDirection(
  startLocation: GridLocation,
  endLocation: GridLocation
): RotationDirection | "dash" | "static" {
  const key = `${startLocation},${endLocation}`;
  const direction = HAND_ROTATION_DIRECTION_MAP.get(key);

  if (!direction) {
    throw new Error(
      `No hand rotation direction found for movement from ${startLocation} to ${endLocation}`
    );
  }

  return direction;
}

/**
 * Get location map for hand rotation
 */
export function getLocationMapForHandRotation(
  handRotationDir: RotationDirection | "dash" | "static"
): Record<GridLocation, GridLocation> {
  switch (handRotationDir) {
    case RotationDirection.CLOCKWISE:
      return LOCATION_MAP_CLOCKWISE;
    case RotationDirection.COUNTER_CLOCKWISE:
      return LOCATION_MAP_COUNTER_CLOCKWISE;
    case "dash":
      return LOCATION_MAP_DASH;
    case "static":
      return LOCATION_MAP_STATIC;
    default:
      throw new Error(`Unknown hand rotation direction: ${handRotationDir}`);
  }
}
