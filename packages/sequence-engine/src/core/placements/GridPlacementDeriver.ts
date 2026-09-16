/**
 * Grid Placement Deriver
 *
 * Maps between grid placement names (alpha1, beta5, gamma11) and hand location pairs.
 * A placement represents the combination of (left_hand_location, right_hand_location).
 *
 * Ported from the app's GridPlacementDeriver using string literals instead of enums.
 */

export class GridPlacementDeriver {
  private readonly placementsMap = new Map<string, string>([
    // Alpha placements - hands in opposite/inverted directions
    ["s,n", "alpha1"],
    ["sw,ne", "alpha2"],
    ["w,e", "alpha3"],
    ["nw,se", "alpha4"],
    ["n,s", "alpha5"],
    ["ne,sw", "alpha6"],
    ["e,w", "alpha7"],
    ["se,nw", "alpha8"],

    // Beta placements - both hands same direction
    ["n,n", "beta1"],
    ["ne,ne", "beta2"],
    ["e,e", "beta3"],
    ["se,se", "beta4"],
    ["s,s", "beta5"],
    ["sw,sw", "beta6"],
    ["w,w", "beta7"],
    ["nw,nw", "beta8"],

    // Gamma placements - mixed/varied combinations
    ["w,n", "gamma1"],
    ["nw,ne", "gamma2"],
    ["n,e", "gamma3"],
    ["ne,se", "gamma4"],
    ["e,s", "gamma5"],
    ["se,sw", "gamma6"],
    ["s,w", "gamma7"],
    ["sw,nw", "gamma8"],
    ["e,n", "gamma9"],
    ["se,ne", "gamma10"],
    ["s,e", "gamma11"],
    ["sw,se", "gamma12"],
    ["w,s", "gamma13"],
    ["nw,sw", "gamma14"],
    ["n,w", "gamma15"],
    ["ne,nw", "gamma16"],

    // Zeta placements - 135 degree obtuse angle (skewed mode)
    ["sw,n", "zeta1"],
    ["w,ne", "zeta2"],
    ["nw,e", "zeta3"],
    ["n,se", "zeta4"],
    ["ne,s", "zeta5"],
    ["e,sw", "zeta6"],
    ["se,w", "zeta7"],
    ["s,nw", "zeta8"],
    ["se,n", "zeta9"],
    ["s,ne", "zeta10"],
    ["sw,e", "zeta11"],
    ["w,se", "zeta12"],
    ["nw,s", "zeta13"],
    ["n,sw", "zeta14"],
    ["ne,w", "zeta15"],
    ["e,nw", "zeta16"],

    // Eta placements - 45 degree acute angle (skewed mode)
    ["nw,n", "eta1"],
    ["n,ne", "eta2"],
    ["ne,e", "eta3"],
    ["e,se", "eta4"],
    ["se,s", "eta5"],
    ["s,sw", "eta6"],
    ["sw,w", "eta7"],
    ["w,nw", "eta8"],
    ["ne,n", "eta9"],
    ["e,ne", "eta10"],
    ["se,e", "eta11"],
    ["s,se", "eta12"],
    ["sw,s", "eta13"],
    ["w,sw", "eta14"],
    ["nw,w", "eta15"],
    ["n,nw", "eta16"],
  ]);

  // Reverse mapping from placement to hand locations
  private readonly locationPairsMap: Map<string, [string, string]>;

  constructor() {
    this.locationPairsMap = new Map();
    this.placementsMap.forEach((placement, locationKey) => {
      const [leftLocation, rightLocation] = locationKey.split(",");
      this.locationPairsMap.set(placement, [leftLocation!, rightLocation!]);
    });
  }

  getGridPlacementFromLocations(
    leftLocation: string,
    rightLocation: string
  ): string {
    const key = `${leftLocation},${rightLocation}`;
    const placement = this.placementsMap.get(key);
    if (!placement) {
      throw new Error(
        `No placement found for locations: ${leftLocation}, ${rightLocation}`
      );
    }
    return placement;
  }

  /**
   * Get the hand location pair for a given placement
   */
  getGridLocationsFromPlacement(placement: string): [string, string] {
    const pair = this.locationPairsMap.get(placement);
    if (!pair) {
      throw new Error(`No location pair found for placement: ${placement}`);
    }
    return pair;
  }
}

export const gridPlacementDeriver = new GridPlacementDeriver();
