/**
 * Circular Placement Maps for LOOP (Linked Orbital Offset Pattern) Generation
 *
 * These maps define the valid end placements for circular sequences based on rotation angles.
 * - Halved LOOPs: 180 degree rotation (placement +4 or -4)
 * - Quartered LOOPs: 90 degree rotation (placement +2 or -2 for clockwise/counter-clockwise)
 *
 * All placement and location values are strings for engine compatibility.
 * The app uses GridPlacement/GridLocation enums but their runtime values are identical strings.
 */

/**
 * Placement Zone Types
 * Alpha and Beta have 8 placements each.
 * Gamma has 16 placements split into two structural halves.
 */
export type PlacementZone = "alpha" | "beta" | "gamma1-8" | "gamma9-16";

export function getPlacementZone(placement: string): PlacementZone {
  if (placement.startsWith("alpha")) return "alpha";
  if (placement.startsWith("beta")) return "beta";
  if (placement.startsWith("gamma")) {
    const num = parseInt(placement.replace("gamma", ""), 10);
    return num <= 8 ? "gamma1-8" : "gamma9-16";
  }
  throw new Error(`Unknown placement: ${placement}`);
}

export function getPlacementGroup(
  placement: string
): "alpha" | "beta" | "gamma" | "zeta" | "eta" | "tau" | "terra" {
  if (placement.startsWith("alpha")) return "alpha";
  if (placement.startsWith("beta")) return "beta";
  if (placement.startsWith("gamma")) return "gamma";
  if (placement.startsWith("zeta")) return "zeta";
  if (placement.startsWith("eta")) return "eta";
  if (placement.startsWith("tau")) return "tau";
  if (placement.startsWith("terra")) return "terra";
  throw new Error(`Unknown placement: ${placement}`);
}

/**
 * Zone coverage analysis result
 */
export interface ZoneCoverageAnalysis {
  alpha: string[];
  beta: string[];
  gamma1to8: string[];
  gamma9to16: string[];
  summary: {
    alphaCount: number;
    betaCount: number;
    gamma1to8Count: number;
    gamma9to16Count: number;
    totalZonesCovered: number;
    isComplete: boolean;
  };
}

export function analyzeZoneCoverage(
  placements: (string | null | undefined)[]
): ZoneCoverageAnalysis {
  const alpha: string[] = [];
  const beta: string[] = [];
  const gamma1to8: string[] = [];
  const gamma9to16: string[] = [];

  for (const pos of placements) {
    if (!pos) continue;
    const zone = getPlacementZone(pos);
    switch (zone) {
      case "alpha":
        alpha.push(pos);
        break;
      case "beta":
        beta.push(pos);
        break;
      case "gamma1-8":
        gamma1to8.push(pos);
        break;
      case "gamma9-16":
        gamma9to16.push(pos);
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
 * Maps each placement to its opposite placement (4 placements away within each 8-placement group).
 * For tau placements, 180 degree rotation switches which hand is at center.
 * Terra (both hands at center) stays the same.
 */
export const HALF_PLACEMENT_MAP: Record<string, string> = {
  // Alpha placements
  alpha1: "alpha5",
  alpha2: "alpha6",
  alpha3: "alpha7",
  alpha4: "alpha8",
  alpha5: "alpha1",
  alpha6: "alpha2",
  alpha7: "alpha3",
  alpha8: "alpha4",
  // Beta placements
  beta1: "beta5",
  beta2: "beta6",
  beta3: "beta7",
  beta4: "beta8",
  beta5: "beta1",
  beta6: "beta2",
  beta7: "beta3",
  beta8: "beta4",
  // Gamma 1-8
  gamma1: "gamma5",
  gamma2: "gamma6",
  gamma3: "gamma7",
  gamma4: "gamma8",
  gamma5: "gamma1",
  gamma6: "gamma2",
  gamma7: "gamma3",
  gamma8: "gamma4",
  // Gamma 9-16
  gamma9: "gamma13",
  gamma10: "gamma14",
  gamma11: "gamma15",
  gamma12: "gamma16",
  gamma13: "gamma9",
  gamma14: "gamma10",
  gamma15: "gamma11",
  gamma16: "gamma12",
  // Zeta 1-8
  zeta1: "zeta5",
  zeta2: "zeta6",
  zeta3: "zeta7",
  zeta4: "zeta8",
  zeta5: "zeta1",
  zeta6: "zeta2",
  zeta7: "zeta3",
  zeta8: "zeta4",
  // Zeta 9-16
  zeta9: "zeta13",
  zeta10: "zeta14",
  zeta11: "zeta15",
  zeta12: "zeta16",
  zeta13: "zeta9",
  zeta14: "zeta10",
  zeta15: "zeta11",
  zeta16: "zeta12",
  // Eta 1-8
  eta1: "eta5",
  eta2: "eta6",
  eta3: "eta7",
  eta4: "eta8",
  eta5: "eta1",
  eta6: "eta2",
  eta7: "eta3",
  eta8: "eta4",
  // Eta 9-16
  eta9: "eta13",
  eta10: "eta14",
  eta11: "eta15",
  eta12: "eta16",
  eta13: "eta9",
  eta14: "eta10",
  eta15: "eta11",
  eta16: "eta12",
  // Tau - 180 degree switches which hand is at center
  tau1: "tau9",
  tau2: "tau10",
  tau3: "tau11",
  tau4: "tau12",
  tau5: "tau13",
  tau6: "tau14",
  tau7: "tau15",
  tau8: "tau16",
  tau9: "tau1",
  tau10: "tau2",
  tau11: "tau3",
  tau12: "tau4",
  tau13: "tau5",
  tau14: "tau6",
  tau15: "tau7",
  tau16: "tau8",
  // Terra - both hands at center, stays the same
  terra1: "terra1",
};

/**
 * Clockwise 90 degree rotation.
 * Maps each placement to 2 placements clockwise within its group.
 */
export const QUARTER_PLACEMENT_MAP_CW: Record<string, string> = {
  // Alpha
  alpha1: "alpha3",
  alpha2: "alpha4",
  alpha3: "alpha5",
  alpha4: "alpha6",
  alpha5: "alpha7",
  alpha6: "alpha8",
  alpha7: "alpha1",
  alpha8: "alpha2",
  // Beta
  beta1: "beta3",
  beta2: "beta4",
  beta3: "beta5",
  beta4: "beta6",
  beta5: "beta7",
  beta6: "beta8",
  beta7: "beta1",
  beta8: "beta2",
  // Gamma 1-8
  gamma1: "gamma3",
  gamma2: "gamma4",
  gamma3: "gamma5",
  gamma4: "gamma6",
  gamma5: "gamma7",
  gamma6: "gamma8",
  gamma7: "gamma1",
  gamma8: "gamma2",
  // Gamma 9-16
  gamma9: "gamma11",
  gamma10: "gamma12",
  gamma11: "gamma13",
  gamma12: "gamma14",
  gamma13: "gamma15",
  gamma14: "gamma16",
  gamma15: "gamma9",
  gamma16: "gamma10",
  // Zeta 1-8
  zeta1: "zeta3",
  zeta2: "zeta4",
  zeta3: "zeta5",
  zeta4: "zeta6",
  zeta5: "zeta7",
  zeta6: "zeta8",
  zeta7: "zeta1",
  zeta8: "zeta2",
  // Zeta 9-16
  zeta9: "zeta11",
  zeta10: "zeta12",
  zeta11: "zeta13",
  zeta12: "zeta14",
  zeta13: "zeta15",
  zeta14: "zeta16",
  zeta15: "zeta9",
  zeta16: "zeta10",
  // Eta 1-8
  eta1: "eta3",
  eta2: "eta4",
  eta3: "eta5",
  eta4: "eta6",
  eta5: "eta7",
  eta6: "eta8",
  eta7: "eta1",
  eta8: "eta2",
  // Eta 9-16
  eta9: "eta11",
  eta10: "eta12",
  eta11: "eta13",
  eta12: "eta14",
  eta13: "eta15",
  eta14: "eta16",
  eta15: "eta9",
  eta16: "eta10",
  // Tau 1-8
  tau1: "tau3",
  tau2: "tau4",
  tau3: "tau5",
  tau4: "tau6",
  tau5: "tau7",
  tau6: "tau8",
  tau7: "tau1",
  tau8: "tau2",
  // Tau 9-16
  tau9: "tau11",
  tau10: "tau12",
  tau11: "tau13",
  tau12: "tau14",
  tau13: "tau15",
  tau14: "tau16",
  tau15: "tau9",
  tau16: "tau10",
  // Terra
  terra1: "terra1",
};

/**
 * Counter-clockwise 90 degree rotation.
 * Maps each placement to 2 placements counter-clockwise within its group.
 */
export const QUARTER_PLACEMENT_MAP_CCW: Record<string, string> = {
  // Alpha
  alpha1: "alpha7",
  alpha2: "alpha8",
  alpha3: "alpha1",
  alpha4: "alpha2",
  alpha5: "alpha3",
  alpha6: "alpha4",
  alpha7: "alpha5",
  alpha8: "alpha6",
  // Beta
  beta1: "beta7",
  beta2: "beta8",
  beta3: "beta1",
  beta4: "beta2",
  beta5: "beta3",
  beta6: "beta4",
  beta7: "beta5",
  beta8: "beta6",
  // Gamma 1-8
  gamma1: "gamma7",
  gamma2: "gamma8",
  gamma3: "gamma1",
  gamma4: "gamma2",
  gamma5: "gamma3",
  gamma6: "gamma4",
  gamma7: "gamma5",
  gamma8: "gamma6",
  // Gamma 9-16
  gamma9: "gamma15",
  gamma10: "gamma16",
  gamma11: "gamma9",
  gamma12: "gamma10",
  gamma13: "gamma11",
  gamma14: "gamma12",
  gamma15: "gamma13",
  gamma16: "gamma14",
  // Zeta 1-8
  zeta1: "zeta7",
  zeta2: "zeta8",
  zeta3: "zeta1",
  zeta4: "zeta2",
  zeta5: "zeta3",
  zeta6: "zeta4",
  zeta7: "zeta5",
  zeta8: "zeta6",
  // Zeta 9-16
  zeta9: "zeta15",
  zeta10: "zeta16",
  zeta11: "zeta9",
  zeta12: "zeta10",
  zeta13: "zeta11",
  zeta14: "zeta12",
  zeta15: "zeta13",
  zeta16: "zeta14",
  // Eta 1-8
  eta1: "eta7",
  eta2: "eta8",
  eta3: "eta1",
  eta4: "eta2",
  eta5: "eta3",
  eta6: "eta4",
  eta7: "eta5",
  eta8: "eta6",
  // Eta 9-16
  eta9: "eta15",
  eta10: "eta16",
  eta11: "eta9",
  eta12: "eta10",
  eta13: "eta11",
  eta14: "eta12",
  eta15: "eta13",
  eta16: "eta14",
  // Tau 1-8
  tau1: "tau7",
  tau2: "tau8",
  tau3: "tau1",
  tau4: "tau2",
  tau5: "tau3",
  tau6: "tau4",
  tau7: "tau5",
  tau8: "tau6",
  // Tau 9-16
  tau9: "tau15",
  tau10: "tau16",
  tau11: "tau9",
  tau12: "tau10",
  tau13: "tau11",
  tau14: "tau12",
  tau15: "tau13",
  tau16: "tau14",
  // Terra
  terra1: "terra1",
};

/**
 * Halved LOOP validation set.
 * Set of "start,end" tuples that are valid for halved (180 degree) LOOPs.
 */
export const HALVED_LOOPS = new Set<string>(
  Object.entries(HALF_PLACEMENT_MAP).map(([start, end]) => `${start},${end}`)
);

/**
 * Quartered LOOP validation set.
 * Set of "start,end" tuples that are valid for quartered (90 degree) LOOPs.
 * Includes both CW and CCW rotations.
 */
export const QUARTERED_LOOPS = new Set<string>([
  ...Object.entries(QUARTER_PLACEMENT_MAP_CW).map(
    ([start, end]) => `${start},${end}`
  ),
  ...Object.entries(QUARTER_PLACEMENT_MAP_CCW).map(
    ([start, end]) => `${start},${end}`
  ),
]);

/**
 * Eighth location rotation map - 45 degree clockwise rotation.
 * Rotates locations by one placement: N -> NE -> E -> SE -> S -> SW -> W -> NW -> N.
 * Toggles between DIAMOND and BOX grid modes.
 */
export const LOCATION_MAP_EIGHTH_CW: Record<string, string> = {
  n: "ne",
  ne: "e",
  e: "se",
  se: "s",
  s: "sw",
  sw: "w",
  w: "nw",
  nw: "n",
  c: "c",
};

/**
 * Clockwise 90 degree location rotation.
 * S -> W -> N -> E -> S
 */
export const LOCATION_MAP_CLOCKWISE: Record<string, string> = {
  s: "w",
  w: "n",
  n: "e",
  e: "s",
  ne: "se",
  se: "sw",
  sw: "nw",
  nw: "ne",
  c: "c",
};

/**
 * Counter-clockwise 90 degree location rotation.
 * S -> E -> N -> W -> S
 */
export const LOCATION_MAP_COUNTER_CLOCKWISE: Record<string, string> = {
  s: "e",
  e: "n",
  n: "w",
  w: "s",
  ne: "nw",
  nw: "sw",
  sw: "se",
  se: "ne",
  c: "c",
};

/**
 * Dash location map (180 degree flip).
 * Flips to opposite: S <-> N, E <-> W
 */
export const LOCATION_MAP_DASH: Record<string, string> = {
  s: "n",
  n: "s",
  w: "e",
  e: "w",
  ne: "sw",
  se: "nw",
  sw: "ne",
  nw: "se",
  c: "c",
};

/**
 * Static location map (identity, no rotation).
 */
export const LOCATION_MAP_STATIC: Record<string, string> = {
  s: "s",
  n: "n",
  w: "w",
  e: "e",
  ne: "ne",
  se: "se",
  sw: "sw",
  nw: "nw",
  c: "c",
};

const CLOCKWISE_LOCATIONS = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
] as const;

/**
 * Reapply a hand path from a new start while preserving its angular distance.
 * This covers the 45-degree transitions used by Skewed as well as the
 * 90/180-degree paths used by Diamond and Box.
 */
export function translateHandPath(
  sourceStart: string,
  sourceEnd: string,
  targetStart: string,
  reverseDirection = false
): string {
  if (sourceStart === "c" && sourceEnd === "c") return targetStart;

  const sourceStartIndex = CLOCKWISE_LOCATIONS.indexOf(
    sourceStart as (typeof CLOCKWISE_LOCATIONS)[number]
  );
  const sourceEndIndex = CLOCKWISE_LOCATIONS.indexOf(
    sourceEnd as (typeof CLOCKWISE_LOCATIONS)[number]
  );
  const targetStartIndex = CLOCKWISE_LOCATIONS.indexOf(
    targetStart as (typeof CLOCKWISE_LOCATIONS)[number]
  );
  if (sourceStartIndex < 0 || sourceEndIndex < 0 || targetStartIndex < 0) {
    throw new Error(
      `Cannot translate hand path ${sourceStart}→${sourceEnd} from ${targetStart}`
    );
  }

  let offset =
    (sourceEndIndex - sourceStartIndex + CLOCKWISE_LOCATIONS.length) %
    CLOCKWISE_LOCATIONS.length;
  if (reverseDirection) {
    offset = (CLOCKWISE_LOCATIONS.length - offset) % CLOCKWISE_LOCATIONS.length;
  }

  return CLOCKWISE_LOCATIONS[
    (targetStartIndex + offset) % CLOCKWISE_LOCATIONS.length
  ]!;
}

/**
 * Hand rotation direction map.
 * Maps "startLocation,endLocation" tuples to rotation direction.
 */
export const HAND_ROTATION_DIRECTION_MAP = new Map<
  string,
  "cw" | "ccw" | "dash" | "static"
>([
  // Clockwise cardinal
  ["s,w", "cw"],
  ["w,n", "cw"],
  ["n,e", "cw"],
  ["e,s", "cw"],
  // Counter-clockwise cardinal
  ["w,s", "ccw"],
  ["n,w", "ccw"],
  ["e,n", "ccw"],
  ["s,e", "ccw"],
  // Dash (opposite)
  ["s,n", "dash"],
  ["w,e", "dash"],
  ["n,s", "dash"],
  ["e,w", "dash"],
  // Static (no movement)
  ["n,n", "static"],
  ["e,e", "static"],
  ["s,s", "static"],
  ["w,w", "static"],
  // Clockwise diagonal
  ["ne,se", "cw"],
  ["se,sw", "cw"],
  ["sw,nw", "cw"],
  ["nw,ne", "cw"],
  // Counter-clockwise diagonal
  ["ne,nw", "ccw"],
  ["nw,sw", "ccw"],
  ["sw,se", "ccw"],
  ["se,ne", "ccw"],
  // Dash diagonal
  ["ne,sw", "dash"],
  ["se,nw", "dash"],
  ["sw,ne", "dash"],
  ["nw,se", "dash"],
  // Static diagonal
  ["ne,ne", "static"],
  ["se,se", "static"],
  ["sw,sw", "static"],
  ["nw,nw", "static"],
]);

export function getHandRotationDirection(
  startLocation: string,
  endLocation: string
): "cw" | "ccw" | "dash" | "static" {
  const key = `${startLocation},${endLocation}`;
  const direction = HAND_ROTATION_DIRECTION_MAP.get(key);

  if (!direction) {
    throw new Error(
      `No hand rotation direction found for movement from ${startLocation} to ${endLocation}`
    );
  }

  return direction;
}

export function getLocationMapForHandRotation(
  handRotationDir: "cw" | "ccw" | "dash" | "static"
): Record<string, string> {
  switch (handRotationDir) {
    case "cw":
      return LOCATION_MAP_CLOCKWISE;
    case "ccw":
      return LOCATION_MAP_COUNTER_CLOCKWISE;
    case "dash":
      return LOCATION_MAP_DASH;
    case "static":
      return LOCATION_MAP_STATIC;
    default:
      throw new Error(`Unknown hand rotation direction: ${handRotationDir}`);
  }
}

/**
 * CW becomes CCW and vice versa. Dash and static are unchanged.
 */
export function mirrorHandRotationDirection(
  dir: "cw" | "ccw" | "dash" | "static"
): "cw" | "ccw" | "dash" | "static" {
  if (dir === "cw") return "ccw";
  if (dir === "ccw") return "cw";
  return dir;
}
