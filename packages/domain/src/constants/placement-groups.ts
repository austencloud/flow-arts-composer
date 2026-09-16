import type { PlacementName, PlacementDefinition } from "../types/placement.js";

/** All 7 TKA placements with their definitions */
export const PLACEMENT_DEFINITIONS: Record<PlacementName, PlacementDefinition> = {
  alpha: {
    name: "Alpha (α)",
    symbol: "α",
    angle: "180°",
    description: "Hands are at opposite grid points, forming a straight line through the center.",
    gridDescription: "Examples: N/S, E/W, NE/SW, NW/SE. The hands are as far apart as possible.",
    examples: [
      "alpha1: Hands at N and S (diamond mode, vertical axis)",
      "alpha3: Hands at E and W (diamond mode, horizontal axis)",
      "alpha5: Hands at NE and SW (box mode, diagonal)",
    ],
    level: 1,
    keyFact: "The most 'open' placement. Hands are diametrically opposite.",
  },
  beta: {
    name: "Beta (β)",
    symbol: "β",
    angle: "0°",
    description: "Both hands are at the same grid point, stacked on top of each other.",
    gridDescription: "Both props share a single location.",
    examples: [
      "beta1: Both hands at N (diamond mode)",
      "beta5: Both hands at NE (box mode)",
      "beta3: Both hands at E (diamond mode)",
    ],
    level: 1,
    keyFact: "VTG calls this 'together' phase.",
  },
  gamma: {
    name: "Gamma (γ)",
    symbol: "γ",
    angle: "90°",
    description: "Hands form a right angle, positioned on adjacent grid points. Asymmetric placement: one hand is directionally ahead of the other, so swapping hands produces a distinct configuration. This creates a leader/follower distinction in same-direction shifts, which is why gamma has 10 letters (M-V) instead of 3.",
    gridDescription: "One hand is 90° away from the other, creating an 'L' shape. Gamma has two internal halves (gamma1-8 vs gamma9-16) determined by which hand is CW of the other. Same-direction shifts stay within a half. Opposite-direction shifts cross between halves. Gamma cannot exist in skewed mode (90° requires both hands on the same grid).",
    examples: [
      "gamma1: Hands at N and E (diamond mode)",
      "gamma5: Hands at NE and NW (box mode, 90° apart)",
      "gamma9: Hands at NE and SE (box mode)",
    ],
    level: 1,
    keyFact: "The first asymmetric placement. The leader/follower distinction in gamma is what creates letters S, T, U, V as distinct from M, N, O, P, Q, R.",
  },
  zeta: {
    name: "Zeta (ζ)",
    symbol: "ζ",
    angle: "135°",
    description: "Hands form an obtuse angle. Asymmetric like gamma: one hand is directionally ahead of the other, creating a leader/follower distinction. Zeta and Eta form a transition pair (like alpha/beta): opposite-direction shifts convert Zeta to Eta and vice versa. Same-direction shifts stay in Zeta. Type 4 (dash+static) in Zeta→Eta uses Psi (converging). (Type 1 letter assignment for Zeta transitions is not claimed here — see the Skewed pictograph dataframe for ground truth.)",
    gridDescription: "One hand on a cardinal point, one on an intercardinal point, 135° apart. Has two internal halves (like gamma) based on which hand is CW of the other. These halves are more isolated than gamma's: no single-step shift can swap halves while staying in Zeta (opposite-direction shifts leave Zeta entirely, going to Eta).",
    examples: [
      "Hands at N and SE (skewed mode, 135°)",
      "Hands at E and NW (skewed mode)",
    ],
    level: 5,
    keyFact: "Asymmetric like gamma but interconverts with Eta like alpha/beta. A genuinely third kind of placement.",
  },
  eta: {
    name: "Eta (η)",
    symbol: "η",
    angle: "45°",
    description: "Hands form an acute angle. Asymmetric like gamma: one hand is directionally ahead of the other, creating a leader/follower distinction. Eta and Zeta form a transition pair (like beta/alpha): opposite-direction shifts convert Eta to Zeta and vice versa. Same-direction shifts stay in Eta. Type 4 (dash+static) in Eta→Zeta uses Phi (diverging). (Type 1 letter assignment for Eta transitions is not claimed here — see the Skewed pictograph dataframe for ground truth.)",
    gridDescription: "One hand on a cardinal point, one on an intercardinal point, 45° apart. Has two internal halves (like gamma) based on which hand is CW of the other. These halves are more isolated than gamma's: no single-step shift can swap halves while staying in Eta (opposite-direction shifts leave Eta entirely, going to Zeta).",
    examples: [
      "Hands at N and NE (skewed mode, 45°)",
      "Hands at E and SE (skewed mode)",
    ],
    level: 5,
    keyFact: "Asymmetric like gamma but interconverts with Zeta like beta/alpha. A genuinely third kind of placement.",
  },
  tau: {
    name: "Tau (τ)",
    symbol: "τ",
    angle: "variable",
    description: "One hand is at the center grid point, the other at a non-center point. Introduced in Level 6 with centric grid mode. Not yet implemented in Flow Arts Composer.",
    gridDescription: "The center point is the 9th grid location. Tau placements have one hand there and one at any of the 8 outer points.",
    examples: [
      "One hand at center, one at N",
      "One hand at center, one at NE",
    ],
    level: 6,
    keyFact: "Introduces the center grid point. One hand anchored at center.",
  },
  terra: {
    name: "Terra",
    symbol: "⊕",
    angle: "0° (both at center)",
    description: "Both hands are at the center grid point. Introduced in Level 6 with centric grid mode. Not yet implemented in Flow Arts Composer.",
    gridDescription: "Both props stacked at the center of the grid. Similar to beta (both at same point) but at the unique center location.",
    examples: [
      "Both hands at center",
    ],
    level: 6,
    keyFact: "Like beta, but at center. Both hands at the unique center point.",
  },
} as const;

/** Placements available at Level 1-3 (diamond/box grid) */
export const FOUNDATION_PLACEMENTS: PlacementName[] = ["alpha", "beta", "gamma"];

/** Placements introduced at Level 5 (skewed grid) */
export const SKEWED_PLACEMENTS: PlacementName[] = ["zeta", "eta"];

/** Placements introduced at Level 6 (centric grid) */
export const CENTRIC_PLACEMENTS: PlacementName[] = ["tau", "terra"];

/** All placement names */
export const ALL_PLACEMENTS: PlacementName[] = [
  ...FOUNDATION_PLACEMENTS,
  ...SKEWED_PLACEMENTS,
  ...CENTRIC_PLACEMENTS,
];

export function getPlacementsAtLevel(level: number): PlacementName[] {
  const placements: PlacementName[] = [...FOUNDATION_PLACEMENTS];
  if (level >= 4) placements.push(...CENTRIC_PLACEMENTS);
  if (level >= 5) placements.push(...SKEWED_PLACEMENTS);
  return placements;
}
