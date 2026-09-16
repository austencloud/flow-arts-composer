export const GridLocation = {
  NORTH: "n",
  EAST: "e",
  SOUTH: "s",
  WEST: "w",
  NORTHEAST: "ne",
  SOUTHEAST: "se",
  SOUTHWEST: "sw",
  NORTHWEST: "nw",
  CENTER: "c",
} as const;

export type GridLocation = (typeof GridLocation)[keyof typeof GridLocation];

export const GridPlacementGroup = {
  ALPHA: "alpha",
  BETA: "beta",
  GAMMA: "gamma",
  ZETA: "zeta",
  ETA: "eta",
  TAU: "tau",
  TERRA: "terra",
} as const;

export type GridPlacementGroup =
  (typeof GridPlacementGroup)[keyof typeof GridPlacementGroup];

export const GridPlacement = {
  ALPHA1: "alpha1",
  ALPHA2: "alpha2",
  ALPHA3: "alpha3",
  ALPHA4: "alpha4",
  ALPHA5: "alpha5",
  ALPHA6: "alpha6",
  ALPHA7: "alpha7",
  ALPHA8: "alpha8",

  BETA1: "beta1",
  BETA2: "beta2",
  BETA3: "beta3",
  BETA4: "beta4",
  BETA5: "beta5",
  BETA6: "beta6",
  BETA7: "beta7",
  BETA8: "beta8",

  GAMMA1: "gamma1",
  GAMMA2: "gamma2",
  GAMMA3: "gamma3",
  GAMMA4: "gamma4",
  GAMMA5: "gamma5",
  GAMMA6: "gamma6",
  GAMMA7: "gamma7",
  GAMMA8: "gamma8",
  GAMMA9: "gamma9",
  GAMMA10: "gamma10",
  GAMMA11: "gamma11",
  GAMMA12: "gamma12",
  GAMMA13: "gamma13",
  GAMMA14: "gamma14",
  GAMMA15: "gamma15",
  GAMMA16: "gamma16",

  // Zeta positions - 135° obtuse angle between hands (skewed mode)
  ZETA1: "zeta1",
  ZETA2: "zeta2",
  ZETA3: "zeta3",
  ZETA4: "zeta4",
  ZETA5: "zeta5",
  ZETA6: "zeta6",
  ZETA7: "zeta7",
  ZETA8: "zeta8",
  ZETA9: "zeta9",
  ZETA10: "zeta10",
  ZETA11: "zeta11",
  ZETA12: "zeta12",
  ZETA13: "zeta13",
  ZETA14: "zeta14",
  ZETA15: "zeta15",
  ZETA16: "zeta16",

  // Eta positions - 45° acute angle between hands (skewed mode)
  ETA1: "eta1",
  ETA2: "eta2",
  ETA3: "eta3",
  ETA4: "eta4",
  ETA5: "eta5",
  ETA6: "eta6",
  ETA7: "eta7",
  ETA8: "eta8",
  ETA9: "eta9",
  ETA10: "eta10",
  ETA11: "eta11",
  ETA12: "eta12",
  ETA13: "eta13",
  ETA14: "eta14",
  ETA15: "eta15",
  ETA16: "eta16",

  // Tau positions - one hand at center, other at perimeter (centric mode)
  // TAU1-8: Blue at center, red at perimeter
  TAU1: "tau1",
  TAU2: "tau2",
  TAU3: "tau3",
  TAU4: "tau4",
  TAU5: "tau5",
  TAU6: "tau6",
  TAU7: "tau7",
  TAU8: "tau8",
  // TAU9-16: Red at center, blue at perimeter
  TAU9: "tau9",
  TAU10: "tau10",
  TAU11: "tau11",
  TAU12: "tau12",
  TAU13: "tau13",
  TAU14: "tau14",
  TAU15: "tau15",
  TAU16: "tau16",

  // Terra position - both hands at center (centric mode)
  TERRA1: "terra1",
} as const;

export type GridPlacement = (typeof GridPlacement)[keyof typeof GridPlacement];

export const GridMode = {
  DIAMOND: "diamond",
  BOX: "box",
  SKEWED: "skewed",
  CENTRIC: "centric",
  TRIGRID: "trigrid",
  EIGHT_POINT: "8point",
} as const;

export type GridMode = (typeof GridMode)[keyof typeof GridMode];
