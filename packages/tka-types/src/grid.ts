/**
 * Grid-related enums: GridLocation, GridMode, GridPlacement.
 *
 * Values grounded in:
 *   - `packages/sequence-engine/src/core/placements/GridPlacementDeriver.ts` (GridPlacement list)
 *   - `packages/sequence-engine/src/core/types/sequence-engine-types.ts` (GridLocation list)
 *   - MCP `get_placement_info` / domain-topic references for Alpha/Beta/Gamma/Zeta/Eta semantics
 */

/**
 * Single-point hand location on the 8-point TKA grid, plus the center point `c`.
 * - Cardinal: n, e, s, w
 * - Intercardinal: ne, se, sw, nw
 * - Center: c
 */
export const GridLocation = {
  n: "n",
  e: "e",
  s: "s",
  w: "w",
  ne: "ne",
  se: "se",
  sw: "sw",
  nw: "nw",
  c: "c",
} as const;

export type GridLocation = (typeof GridLocation)[keyof typeof GridLocation];

export const GRID_LOCATIONS: readonly GridLocation[] = Object.freeze(
  Object.values(GridLocation)
);

/**
 * Grid mode: diamond mode uses cardinal points (N/E/S/W), box mode uses
 * intercardinal points (NE/SE/SW/NW). Skewed mode mixes one cardinal with
 * one intercardinal for Eta (45 degrees) and Zeta (135 degrees) placements.
 */
export const GridMode = {
  diamond: "diamond",
  box: "box",
  skewed: "skewed",
  centric: "centric",
  trigrid: "trigrid",
  "8point": "8point",
} as const;

export type GridMode = (typeof GridMode)[keyof typeof GridMode];

export const GRID_MODES: readonly GridMode[] = Object.freeze(
  Object.values(GridMode)
);

/**
 * Named two-hand grid placement. Identifies (left_hand_location, right_hand_location)
 * via the enumeration in `GridPlacementDeriver.ts`.
 *
 * Families:
 *   - Alpha 1–8: hands 180 degrees apart
 *   - Beta 1–8: both hands at the same point
 *   - Gamma 1–16: hands 90 degrees apart (two internal halves by leader/follower)
 *   - Zeta 1–16: hands 135 degrees apart (skewed mode)
 *   - Eta 1–16: hands 45 degrees apart (skewed mode)
 */
export const GridPlacement = {
  alpha1: "alpha1",
  alpha2: "alpha2",
  alpha3: "alpha3",
  alpha4: "alpha4",
  alpha5: "alpha5",
  alpha6: "alpha6",
  alpha7: "alpha7",
  alpha8: "alpha8",

  beta1: "beta1",
  beta2: "beta2",
  beta3: "beta3",
  beta4: "beta4",
  beta5: "beta5",
  beta6: "beta6",
  beta7: "beta7",
  beta8: "beta8",

  gamma1: "gamma1",
  gamma2: "gamma2",
  gamma3: "gamma3",
  gamma4: "gamma4",
  gamma5: "gamma5",
  gamma6: "gamma6",
  gamma7: "gamma7",
  gamma8: "gamma8",
  gamma9: "gamma9",
  gamma10: "gamma10",
  gamma11: "gamma11",
  gamma12: "gamma12",
  gamma13: "gamma13",
  gamma14: "gamma14",
  gamma15: "gamma15",
  gamma16: "gamma16",

  zeta1: "zeta1",
  zeta2: "zeta2",
  zeta3: "zeta3",
  zeta4: "zeta4",
  zeta5: "zeta5",
  zeta6: "zeta6",
  zeta7: "zeta7",
  zeta8: "zeta8",
  zeta9: "zeta9",
  zeta10: "zeta10",
  zeta11: "zeta11",
  zeta12: "zeta12",
  zeta13: "zeta13",
  zeta14: "zeta14",
  zeta15: "zeta15",
  zeta16: "zeta16",

  eta1: "eta1",
  eta2: "eta2",
  eta3: "eta3",
  eta4: "eta4",
  eta5: "eta5",
  eta6: "eta6",
  eta7: "eta7",
  eta8: "eta8",
  eta9: "eta9",
  eta10: "eta10",
  eta11: "eta11",
  eta12: "eta12",
  eta13: "eta13",
  eta14: "eta14",
  eta15: "eta15",
  eta16: "eta16",

  // Tau placements — one hand at center, other at perimeter (centric mode)
  tau1: "tau1",
  tau2: "tau2",
  tau3: "tau3",
  tau4: "tau4",
  tau5: "tau5",
  tau6: "tau6",
  tau7: "tau7",
  tau8: "tau8",
  tau9: "tau9",
  tau10: "tau10",
  tau11: "tau11",
  tau12: "tau12",
  tau13: "tau13",
  tau14: "tau14",
  tau15: "tau15",
  tau16: "tau16",

  // Terra placement — both hands at center (centric mode)
  terra1: "terra1",
} as const;

export type GridPlacement = (typeof GridPlacement)[keyof typeof GridPlacement];

export const GRID_PLACEMENTS: readonly GridPlacement[] = Object.freeze(
  Object.values(GridPlacement)
);

/**
 * Placement family — the Greek-letter prefix classifying a GridPlacement.
 */
export type PlacementFamily = "alpha" | "beta" | "gamma" | "zeta" | "eta" | "tau" | "terra";

export function getPlacementFamily(placement: GridPlacement): PlacementFamily {
  if (placement.startsWith("alpha")) return "alpha";
  if (placement.startsWith("beta")) return "beta";
  if (placement.startsWith("gamma")) return "gamma";
  if (placement.startsWith("zeta")) return "zeta";
  if (placement.startsWith("tau")) return "tau";
  if (placement.startsWith("terra")) return "terra";
  return "eta";
}
