import type {
  LoopBaseComponent,
  LoopComponent,
  CompoundLoopType,
  LoopFixedPointEntry,
  LoopComposabilityEntry,
} from "../types/loop.js";

export const LOOP_DEFINITION = "Sequences where words repeat to trace complementary patterns. The word must end on a variation of its start placement, eventually returning to the exact starting placement (home)." as const;

export const LOOP_BASE_COMPONENTS: Record<LoopComponent, LoopBaseComponent> = {
  rotated: {
    description: "Placements rotate around the grid to return home",
    keyInsight: "Rotated means COMPLETING the full rotation, not just reaching a rotated midpoint. The second half must CONTINUE rotating in the same direction to return home.",
    variants: {
      halved: {
        period: "180 degrees",
        pattern: "Two halves, each rotates 180 degrees, completing 360 degrees total",
        mentalModel: "Like a clock hand moving continuously: starts at 12 o'clock, first half reaches 6 o'clock (180 degrees), second half CONTINUES to 12 o'clock (360 degrees). NOT going 0 to 180 then reversing back (that's Rewound).",
      },
      quartered: {
        period: "90 degrees",
        pattern: "Four quarters, each rotates 90 degrees, completing 360 degrees total",
        mentalModel: "Clock hand: 12 to 3 to 6 to 9 to 12 (continuing same direction)",
      },
    },
  },
  mirrored: {
    description: "Placements mirror vertically to return home",
    axis: "Vertical axis through center",
    effect: "Left-right placements swap across the vertical midline",
  },
  flipped: {
    description: "Placements mirror horizontally to return home",
    axis: "Horizontal axis through center",
    effect: "Top-bottom placements swap across the horizontal midline",
    note: "Same concept as mirrored but along perpendicular axis",
  },
  swapped: {
    description: "Left and right hands swap roles",
    effect: "What the left hand did, the right hand now does (and vice versa)",
    note: "Changes body motion significantly",
  },
  inverted: {
    description: "Motion types flip between PRO and ANTI",
    effect: "Prospin becomes antispin, antispin becomes prospin",
  },
  rewound: {
    description: "Second half plays in reverse - hands trace back",
    keyInsight: "The hands retrace their path backwards to return home. Like pressing rewind on a video.",
    distinctionFromRotated: "Rewound: Hands reverse direction to go back. Rotated: Hands continue same rotational direction forward.",
  },
} as const satisfies Record<LoopComponent, LoopBaseComponent>;

export const COMPOUND_LOOP_TYPES: Record<string, CompoundLoopType> = {
  strictRotated: { components: ["rotated"] },
  strictMirrored: { components: ["mirrored"] },
  strictSwapped: { components: ["swapped"] },
  mirroredSwapped: { components: ["mirrored", "swapped"] },
  rotatedSwapped: { components: ["rotated", "swapped"] },
  mirroredRotated: { components: ["mirrored", "rotated"] },
  invertedRotated: { components: ["inverted", "rotated"] },
  invertedMirrored: { components: ["inverted", "mirrored"] },
  invertedSwapped: { components: ["inverted", "swapped"] },
  invertedMirroredSwapped: { components: ["inverted", "mirrored", "swapped"] },
  rewoundInverted: { components: ["rewound", "inverted"] },
} as const satisfies Record<string, CompoundLoopType>;

export const LOOP_CONSTRUCTION_PRINCIPLES = {
  wordEndingRequirement: "Word must end on variation of start placement to enable seamless repetition",
  homeReturn: "Return to exact starting placement and orientation through calculated repetitions with transformations",
  patternCompletion: "Trace geometric or symmetric patterns in space for visual and kinesthetic satisfaction",
} as const;


/**
 * LOOP classification operates on a reduced parameter space.
 * Turn values and orientations are irrelevant to LOOP type.
 */
export const LOOP_TURN_INDEPENDENCE = {
  reducedSpace: ["grid placements", "motion types (pro/anti/static/dash/float)", "hand identity (blue/red)"],
  excludedFromClassification: ["turn values", "orientations"],
  principle: "Every LOOP type has a canonical zero-turn form representing its pure algebraic skeleton. The performed sequence is that skeleton dressed with turn values.",
  formula: "Performed Sequence = LOOP Skeleton + Turn Assignment",
} as const;

/**
 * Compositional notation replaces flat component bags.
 *
 * `/` = applied simultaneously as one compound operation
 * `+` = applied sequentially (inner pattern, then outer transformation)
 *
 * Example: `SWAPPED + MIRRORED/INVERTED`
 *   1. Take a SWAPPED inner pattern (seed doubled via hand-role swap)
 *   2. Apply MIRRORED and INVERTED simultaneously (mirror placements + flip pro/anti)
 */
export const LOOP_COMPOSITIONAL_NOTATION = {
  simultaneousOperator: "/",
  sequentialOperator: "+",
  example: {
    notation: "SWAPPED + MIRRORED/INVERTED",
    step1: "Take a SWAPPED inner pattern (seed doubled via hand-role swap)",
    step2: "Apply MIRRORED and INVERTED simultaneously to that block (mirror placements to opposite side + flip pro/anti)",
  },
  whyItMatters: "The flat label {MIRRORED, SWAPPED, INVERTED} does not tell you which transformation came first or how the sequence was built. Compositional notation preserves the construction order.",
} as const;

/**
 * Fixed-Point Theorem: For the composition INNER + OUTER, the starting
 * placement S must satisfy T(S) = S for any outer transform T.
 *
 * INNER produces a circular sub-pattern: starts at S, ends at S.
 * OUTER takes that sub-pattern and doubles it. The outer half must start
 * at S (continuity) and end at S (circularity). Therefore T(S) = S.
 */
export const LOOP_FIXED_POINT_THEOREM = {
  statement: "For the composition INNER + OUTER: T(S) = S for any outer transform T. The starting placement must be a fixed point of the outer transformation.",
  proof: "INNER produces a circular sub-pattern (S -> S). OUTER doubles it: the outer half must start at S (continuity) and end at S (circularity). Therefore T(S) = S.",
} as const;

/**
 * Computed fixed points for each primitive transform, derived from
 * the actual placement maps in the codebase.
 */
export const LOOP_FIXED_POINTS: LoopFixedPointEntry[] = [
  {
    transform: "MIRROR (vertical)",
    fixedPlacements: ["alpha1", "alpha5", "beta1", "beta5"],
  },
  {
    transform: "FLIP (horizontal)",
    fixedPlacements: ["alpha3", "alpha7", "beta3", "beta7"],
  },
  {
    transform: "SWAP",
    fixedPlacements: ["beta1", "beta2", "beta3", "beta4", "beta5", "beta6", "beta7", "beta8"],
    note: "Swap is identity on beta because swapping two hands at the same grid location changes nothing positionally. This is why beta enables the most compositions.",
  },
  {
    transform: "ROTATE 180deg",
    fixedPlacements: ["terra1"],
    note: "No standard L1-L5 placement is a fixed point under 180deg rotation. Only terra1 (both hands at center, L6) maps to itself.",
  },
  {
    transform: "INVERTED",
    fixedPlacements: ["ALL"],
    note: "INVERTED does not change placements. All placements are fixed points.",
  },
];

/**
 * Fixed points for compound outer transforms.
 * Computed by intersecting individual fixed-point sets.
 */
export const LOOP_COMPOUND_FIXED_POINTS: LoopFixedPointEntry[] = [
  { transform: "MIRROR/INVERTED", fixedPlacements: ["alpha1", "alpha5", "beta1", "beta5"] },
  { transform: "FLIP/INVERTED", fixedPlacements: ["alpha3", "alpha7", "beta3", "beta7"] },
  { transform: "SWAP/INVERTED", fixedPlacements: ["beta1", "beta2", "beta3", "beta4", "beta5", "beta6", "beta7", "beta8"] },
  { transform: "MIRROR/SWAP", fixedPlacements: ["beta1", "beta5"] },
  { transform: "FLIP/SWAP", fixedPlacements: ["beta3", "beta7"] },
  { transform: "MIRROR/FLIP", fixedPlacements: [], note: "No L1-L5 fixed points. terra1 only at L6." },
  { transform: "MIRROR/SWAP/INVERTED", fixedPlacements: ["beta1", "beta5"] },
  { transform: "FLIP/SWAP/INVERTED", fixedPlacements: ["beta3", "beta7"] },
];

/**
 * Proof that ROTATE is always the innermost layer.
 * No standard L1-L5 grid placement is a fixed point under 180deg rotation.
 */
export const LOOP_ROTATE_ALWAYS_INNER = {
  statement: "ROTATE cannot be an outer transform from any standard L1-L5 placement. It must be the innermost structural layer or standalone.",
  proof: "alpha1 -> alpha5 (moves), beta3 -> beta7 (moves), gamma1 -> gamma5 (moves). Only terra1 (L6 center) maps to itself.",
  implication: "For ROTATE as INNER, the seed goes S -> ROTATE(S), which is always a different placement, producing non-degenerate structure from any starting point. Geometric transforms (MIRROR, FLIP, SWAP) can layer on top as outer.",
} as const;

/**
 * Composability matrices checked against actual placement maps.
 * "degenerate" means the inner transform does not change placements (T(S) = S).
 */
export const LOOP_COMPOSABILITY_MATRICES: Record<string, LoopComposabilityEntry[]> = {
  alpha1: [
    { composition: "SWAP + MIRROR/INV", innerValid: "alpha1->alpha5 yes", outerValid: "MIRROR(alpha1)=alpha1 yes", overall: "valid" },
    { composition: "SWAP + FLIP/INV", innerValid: "alpha1->alpha5 yes", outerValid: "FLIP(alpha1)=alpha5 no", overall: "blocked" },
    { composition: "SWAP + INVERTED", innerValid: "alpha1->alpha5 yes", outerValid: "always yes", overall: "valid" },
    { composition: "ROTATE + SWAP", innerValid: "alpha1->alpha5 yes", outerValid: "SWAP(alpha1)=alpha5 no", overall: "blocked" },
    { composition: "ROTATE + MIRROR/INV", innerValid: "alpha1->alpha5 yes", outerValid: "MIRROR(alpha1)=alpha1 yes", overall: "valid" },
    { composition: "MIRROR/INV + SWAP", innerValid: "alpha1->alpha1 degenerate", outerValid: "SWAP(alpha1)=alpha5 no", overall: "blocked" },
  ],
  beta3: [
    { composition: "SWAP + MIRROR/INV", innerValid: "beta3->beta3 degenerate", outerValid: "MIRROR(beta3)=beta7 no", overall: "blocked" },
    { composition: "SWAP + FLIP/INV", innerValid: "beta3->beta3 degenerate", outerValid: "FLIP(beta3)=beta3 yes", overall: "degenerate" },
    { composition: "ROTATE + SWAP", innerValid: "beta3->beta7 yes", outerValid: "SWAP(beta3)=beta3 yes", overall: "valid" },
    { composition: "ROTATE + FLIP/INV", innerValid: "beta3->beta7 yes", outerValid: "FLIP(beta3)=beta3 yes", overall: "valid" },
    { composition: "MIRROR/INV + SWAP", innerValid: "beta3->beta7 yes", outerValid: "SWAP(beta3)=beta3 yes", overall: "valid" },
  ],
  beta1: [
    { composition: "SWAP + MIRROR/INV", innerValid: "degenerate", outerValid: "MIRROR(beta1)=beta1 yes", overall: "degenerate" },
    { composition: "ROTATE + SWAP", innerValid: "beta1->beta5 yes", outerValid: "SWAP(beta1)=beta1 yes", overall: "valid" },
    { composition: "ROTATE + MIRROR/INV", innerValid: "beta1->beta5 yes", outerValid: "MIRROR(beta1)=beta1 yes", overall: "valid" },
    { composition: "MIRROR/INV + SWAP", innerValid: "beta1->beta1 degenerate", outerValid: "SWAP(beta1)=beta1 yes", overall: "degenerate" },
  ],
};

/**
 * Key results from the compositional analysis.
 */
export const LOOP_COMPOSITIONAL_KEY_RESULTS = [
  "Order matters. SWAP + MIRROR/INV (valid from alpha1) and MIRROR/INV + SWAP (valid from beta3, not alpha1) are different compositions. They are NOT interchangeable.",
  "Beta is the universal connector. All beta placements are SWAP fixed points. beta1/beta5 additionally support MIRROR as outer. beta3/beta7 support FLIP as outer.",
  "ROTATE is always the innermost layer. No L1-L5 placement is a 180deg rotation fixed point. Rotation produces non-degenerate structure from any placement.",
  "INVERTED is always free. It has no positional constraint (all placements are fixed points). It can be added to any outer transform via / without restricting valid starting placements.",
  "The current flat detection ({MIRRORED, SWAPPED, INVERTED}) loses information. The same component set can correspond to different compositional structures depending on starting placement and construction order.",
] as const;
