import type { KnowledgeConcept, MajorLevel } from "../types/curriculum.js";

/**
 * TKA Knowledge Graph
 *
 * Defines the granular learning concepts for the TKA curriculum.
 * Each concept has prerequisites and unlocks specific domain terms.
 *
 * Expanded from the original 16 concepts (L1-4) to ~35 concepts (L1-9)
 * based on the locked-in level system (Feb 2026).
 */
export const KNOWLEDGE_GRAPH: KnowledgeConcept[] = [
  // ═══════════════════════════════════════════════════════════════════
  // LEVEL 1: Foundation
  // All 47 letters at turn-zero. Placements, motions, orientations, props.
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "1.1",
    level: 1,
    subLevel: 1,
    name: "The Grid",
    prerequisites: [],
    terms: ["grid", "diamond", "box", "cardinal", "intercardinal", "north", "south", "east", "west", "n", "s", "e", "w", "ne", "se", "sw", "nw"],
    description: "The 8-point grid where hands can be placed",
  },
  {
    id: "1.2",
    level: 1,
    subLevel: 2,
    name: "Placements",
    prerequisites: ["1.1"],
    terms: ["alpha", "beta", "gamma", "placement", "opposite", "same point", "right angle", "α", "β", "γ"],
    description: "How the two hands relate to each other on the grid",
  },
  {
    id: "1.3",
    level: 1,
    subLevel: 3,
    name: "Motion Types",
    prerequisites: ["1.2"],
    terms: ["static", "shift", "dash", "motion", "adjacent", "opposite", "movement"],
    description: "The three ways a hand can move (or not move)",
  },
  {
    id: "1.4",
    level: 1,
    subLevel: 4,
    name: "Rotation Direction",
    prerequisites: ["1.3"],
    terms: ["pro", "anti", "prospin", "antispin", "with", "against", "rotation"],
    description: "How the prop spins relative to hand movement",
  },
  {
    id: "1.5",
    level: 1,
    subLevel: 5,
    name: "Letter Types",
    prerequisites: ["1.4"],
    terms: ["Type 1", "Type 2", "Type 3", "Type 4", "Type 5", "Type 6", "dual-shift", "shift", "cross-shift", "dash", "dual-dash", "static", "letter type"],
    description: "The 6 categories that organize the 47 Level 1 dataframe letters",
  },
  {
    id: "1.6",
    level: 1,
    subLevel: 6,
    name: "Orientations",
    prerequisites: ["1.4"],
    terms: ["in", "out", "orientation", "radial", "facing"],
    description: "The starting and ending orientation of each prop",
  },
  {
    id: "1.7",
    level: 1,
    subLevel: 7,
    name: "Reading Pictographs",
    prerequisites: ["1.5", "1.6"],
    terms: ["pictograph", "arrow", "prop", "glyph", "beat", "blue", "red", "hand"],
    description: "How to read the visual notation",
  },
  {
    id: "1.8",
    level: 1,
    subLevel: 8,
    name: "Sequences & Reversals",
    prerequisites: ["1.7"],
    terms: ["sequence", "word", "reversal", "LOOP", "combination", "string"],
    description: "Combining letters into sequences",
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL 2: Whole Turns
  // 180° whole-number turns on any motion. Swaps orientations.
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "2.1",
    level: 2,
    subLevel: 1,
    name: "Introducing Turns",
    prerequisites: ["1.8"],
    terms: ["turn", "turn number", "180°", "half turn", "rotation count"],
    description: "Adding whole-number turns to any motion",
  },
  {
    id: "2.2",
    level: 2,
    subLevel: 2,
    name: "Orientation Swapping",
    prerequisites: ["2.1"],
    terms: ["swap", "orientation change", "in→out", "out→in", "flip"],
    description: "How turns change prop orientations",
  },
  {
    id: "2.3",
    level: 2,
    subLevel: 3,
    name: "Turn Variations",
    prerequisites: ["2.2"],
    terms: ["variation", "turn count", "turn variation"],
    description: "The exponential variety turns create",
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL 3: Half Turns + Float
  // 90° rotation units. Clock/counter orientations. Float motion type.
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "3.1",
    level: 3,
    subLevel: 1,
    name: "Half Turn Units",
    prerequisites: ["2.3"],
    terms: ["half turn", "90°", "non-radial", "half rotation"],
    description: "Breaking rotations into 90° units",
  },
  {
    id: "3.2",
    level: 3,
    subLevel: 2,
    name: "Clock/Counter Orientations",
    prerequisites: ["3.1"],
    terms: ["clock", "counter", "cw", "ccw", "clockwise", "counter-clockwise", "counterclockwise"],
    description: "New orientation states beyond in/out",
  },
  {
    id: "3.3",
    level: 3,
    subLevel: 3,
    name: "Float",
    prerequisites: ["3.2"],
    terms: ["float", "absolute spatial angle", "no rotation"],
    description: "Prop holds absolute spatial angle while hand arcs. No turn count.",
  },
  {
    id: "3.4",
    level: 3,
    subLevel: 4,
    name: "Expanded Placement Variations",
    prerequisites: ["3.3"],
    terms: ["placement variation", "non-radial placement", "expanded variation"],
    description: "How half turns and float expand placement possibilities",
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL 4: Interradial Orientations (completes orientation freedom)
  // 8 orientations. Quarter turns. Full 8-point radial cycle.
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "4.1",
    level: 4,
    subLevel: 1,
    name: "Interradial Orientations",
    prerequisites: ["3.4"],
    terms: ["interradial", "clockIn", "clockOut", "counterIn", "counterOut"],
    description: "4 orientations at 45° between the cardinal orientations",
  },
  {
    id: "4.2",
    level: 4,
    subLevel: 2,
    name: "Quarter Turns",
    prerequisites: ["4.1"],
    terms: ["quarter turn", "45°", "0.25 turn", "0.75 turn"],
    description: "Turn values that produce interradial orientations",
  },
  {
    id: "4.3",
    level: 4,
    subLevel: 3,
    name: "8-Point Radial Cycle",
    prerequisites: ["4.2"],
    terms: ["radial cycle", "8-step cycle", "RADIAL_CW_CYCLE"],
    description: "The complete cycle: in → clockIn → clock → clockOut → out → counterOut → counter → counterIn",
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL 5: Skewed Grid
  // Mixing grid modes (diamond ↔ box). 8-point grid. Skew categories.
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "5.1",
    level: 5,
    subLevel: 1,
    name: "Grid Mode Mixing",
    prerequisites: ["4.3"],
    terms: ["skew", "skewed", "mixed grid", "diamond-box", "grid mode", "8-point grid"],
    description: "Combining diamond and box grid modes into the full 8-point grid",
  },
  {
    id: "5.2",
    level: 5,
    subLevel: 2,
    name: "Zeta and Eta Placements",
    prerequisites: ["5.1"],
    terms: ["zeta", "eta", "ζ", "η", "obtuse", "acute"],
    description: "New placements from mixing grid systems: obtuse (zeta) and acute (eta)",
  },
  {
    id: "5.3",
    level: 5,
    subLevel: 3,
    name: "Skew Modifiers",
    prerequisites: ["5.2"],
    terms: ["+", "-", "skew+", "skew-", "skew modifier", "extended arc", "shortened arc"],
    description: "Extended and shortened shift arcs on the 8-point grid",
  },
  {
    id: "5.4",
    level: 5,
    subLevel: 4,
    name: "Skew Transitions",
    prerequisites: ["5.3"],
    terms: ["maintain skew", "resolve skew", "double skew", "dual skew"],
    description: "Entering, maintaining, and exiting skewed placements",
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL 6: Centric Grid (completes the single grid)
  // Center grid point. Hash motion. Tau/terra placements.
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "6.1",
    level: 6,
    subLevel: 1,
    name: "Center Point",
    prerequisites: ["5.4"],
    terms: ["center", "center point", "5-point grid", "centric"],
    description: "The 5th grid location at the center of the grid",
  },
  {
    id: "6.2",
    level: 6,
    subLevel: 2,
    name: "Hash Motion",
    prerequisites: ["6.1"],
    terms: ["hash", "half-dash", "center motion"],
    description: "Straight-line path to/from the center point",
  },
  {
    id: "6.3",
    level: 6,
    subLevel: 3,
    name: "Tau and Terra Placements",
    prerequisites: ["6.2"],
    terms: ["tau", "terra", "τ", "center placement"],
    description: "New placements involving the center point",
  },
  {
    id: "6.4",
    level: 6,
    subLevel: 4,
    name: "Center Orientations",
    prerequisites: ["6.3"],
    terms: ["centerN", "centerNE", "centerE", "centerSE", "centerS", "centerSW", "centerW", "centerNW"],
    description: "8 compass-based orientations for the center grid point",
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL 7: Conjoined Grids
  // Dual grids sharing a junction point. Extended dashes. Bridges to 3D.
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "7.1",
    level: 7,
    subLevel: 1,
    name: "Conjoined Grids",
    prerequisites: ["6.4"],
    terms: ["conjoined", "conjoined grid", "dual grid", "junction point"],
    description: "Two grids sharing a common junction point",
  },
  {
    id: "7.2",
    level: 7,
    subLevel: 2,
    name: "Extended Dashes",
    prerequisites: ["7.1"],
    terms: ["dash+", "dash++", "extended dash", "cross-grid"],
    description: "Straight-line paths that cross the grid boundary via the junction",
  },
  {
    id: "7.3",
    level: 7,
    subLevel: 3,
    name: "Inter-Grid Placements",
    prerequisites: ["7.2"],
    terms: ["inter-grid placement", "cross-grid placement"],
    description: "New placement combinations from having two grids",
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL 8: Atomics (3D begins)
  // Multi-plane: wall, wheel, overhead. 3D prop manipulation.
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "8.1",
    level: 8,
    subLevel: 1,
    name: "Spinning Planes",
    prerequisites: ["7.3"],
    terms: ["plane", "wall plane", "wheel plane", "overhead plane"],
    description: "The three planes of 3D prop manipulation",
  },
  {
    id: "8.2",
    level: 8,
    subLevel: 2,
    name: "Multi-Plane Patterns",
    prerequisites: ["8.1"],
    terms: ["multi-plane", "plane transition", "atomic"],
    description: "Patterns that move between or combine multiple planes",
  },

  // ═══════════════════════════════════════════════════════════════════
  // LEVEL 9: Rubik's Cube (completes 3D)
  // Skewed across intersecting planes. 3D complete.
  // ═══════════════════════════════════════════════════════════════════

  {
    id: "9.1",
    level: 9,
    subLevel: 1,
    name: "Inter-Plane Grid Points",
    prerequisites: ["8.2"],
    terms: ["inter-plane", "3D grid point", "plane intersection"],
    description: "Grid points at the intersection of spinning planes",
  },
  {
    id: "9.2",
    level: 9,
    subLevel: 2,
    name: "3D Skewed Placements",
    prerequisites: ["9.1"],
    terms: ["3D skew", "rubiks cube", "cross-plane skew"],
    description: "Skewed placements across intersecting planes, completing 3D mastery",
  },
];
