/**
 * Flow Arts Composer - Complete Learning Path for The Kinetic Alphabet
 *
 * This file defines the complete progression of concepts from the TKA Level 1 curriculum.
 * Concepts are organized into categories and unlock sequentially to guide learners
 * through a logical progression from foundation to advanced techniques.
 */

import type { ConceptCategory, LearnConcept } from "./types";

/**
 * Complete TKA Learning Path
 * Based on "The Kinetic Alphabet Level 1" curriculum
 */
export const TKA_CONCEPTS: LearnConcept[] = [
  // FOUNDATION CATEGORY
  // Core building blocks - understanding the grid and basic positions/motions
  {
    id: "grid",
    order: 1,
    category: "foundation",
    name: "The Grid",
    shortName: "Grid",
    description: "Find your way around the diamond and box grids.",
    icon: "fa-border-all",
    pdfPages: [7],
    prerequisites: [],
    estimatedMinutes: 5,
    concepts: [
      "Diamond vs Box mode",
      "4-point grid structure",
      "8-point combined grid",
      "Center, hand, and outer points",
    ],
  },
  {
    id: "hand-positions",
    order: 2,
    category: "foundation",
    name: "Hand Positions",
    shortName: "Positions",
    description: "Learn Alpha, Beta, and Gamma hand positions",
    icon: "fa-hand",
    pdfPages: [8],
    prerequisites: ["grid"],
    estimatedMinutes: 8,
    concepts: [
      "Alpha - hands across from each other",
      "Beta - hands at same point",
      "Gamma - hands form right angle",
    ],
  },
  {
    id: "hand-motions-intro",
    order: 3,
    category: "foundation",
    name: "Hand Motions",
    shortName: "Hand Motions",
    description: "Shift, dash, and static: three ways a hand can move.",
    icon: "fa-arrow-right",
    pdfPages: [9],
    prerequisites: ["hand-positions"],
    estimatedMinutes: 10,
    concepts: [
      "Shift - move to adjacent point",
      "Dash - move to opposite point",
      "Static - remain at current point",
    ],
  },
  {
    id: "timing-and-direction",
    order: 3.5,
    category: "foundation",
    name: "Timing and Direction",
    shortName: "Timing & Direction",
    description: "Explore timing and direction, then combine them in six ways.",
    icon: "fa-arrows-left-right",
    pdfPages: [9, 10, 11],
    prerequisites: ["hand-motions-intro"],
    estimatedMinutes: 6,
    concepts: [
      "Together, split, and quarter timing",
      "Same and opposite direction",
      "The six timing and direction relationships",
    ],
  },
  {
    id: "reading-choreo-cards",
    order: 3.6,
    category: "foundation",
    name: "Reading a Choreo Card",
    shortName: "Choreo Cards",
    description: "Find the start, steps, and scan code on a hand-path card.",
    icon: "fa-id-card",
    pdfPages: [],
    prerequisites: ["timing-and-direction"],
    estimatedMinutes: 4,
    concepts: [
      "Start position",
      "Numbered hand-path steps",
      "Scan to watch the sequence",
    ],
  },
  {
    id: "rotation-direction",
    order: 4,
    category: "foundation",
    name: "Rotation Direction",
    shortName: "Pro / Anti",
    description: "See whether each prop rotates with or against its hand arc",
    icon: "fa-arrows-rotate",
    pdfPages: [16],
    prerequisites: ["hand-motions-intro"],
    estimatedMinutes: 6,
    concepts: [
      "Pro - prop rotates with the hand arc",
      "Anti - prop rotates against the hand arc",
      "Base rotation at zero additional turns",
      "Rotation relationship is not a fixed clock direction",
    ],
  },
  {
    id: "dual-shifts-alpha-beta",
    order: 5,
    category: "foundation",
    name: "Dual-Shifts: Alpha & Beta",
    shortName: "Dual-Shifts",
    description: "Practice split-same and tog-same dual-shift patterns",
    icon: "fa-arrows-left-right",
    pdfPages: [10],
    prerequisites: ["rotation-direction"],
    estimatedMinutes: 12,
    concepts: [
      "Split-Same (SS)",
      "Tog-Same (TS)",
      "Split-Opp (SO)",
      "Tog-Opp (TO)",
    ],
  },
  {
    id: "gamma-motion",
    order: 6,
    category: "foundation",
    name: "Gamma Motions",
    shortName: "Gamma",
    description: "Master quarter-time movements in gamma position",
    icon: "fa-angle-right",
    pdfPages: [11],
    prerequisites: ["dual-shifts-alpha-beta"],
    estimatedMinutes: 15,
    concepts: [
      "Quarter-Opp (parallel & antiparallel)",
      "Quarter-Same patterns",
      "Continuous vs non-continuous",
    ],
  },
  {
    id: "shifts-type2",
    order: 7,
    category: "foundation",
    name: "Type 2: Shifts",
    shortName: "Shifts",
    description: "Move between Gamma and Alpha/Beta positions",
    icon: "fa-arrow-up-right",
    pdfPages: [12],
    prerequisites: ["gamma-motion"],
    estimatedMinutes: 10,
    concepts: [
      "One hand shifts, one static",
      "Opening vs closing shifts",
      "γ ↔ α/β transitions",
    ],
  },
  {
    id: "cross-shifts-type3",
    order: 8,
    category: "foundation",
    name: "Type 3: Cross-Shifts",
    shortName: "Cross-Shifts",
    description: "Combine shifts with dashes for dynamic motion",
    icon: "fa-shuffle",
    pdfPages: [13],
    prerequisites: ["shifts-type2"],
    estimatedMinutes: 12,
    concepts: [
      "Shift + Dash combination",
      "Halfway point technique",
      "Zan's Diamond variations",
    ],
  },
  {
    id: "dash-type4",
    order: 9,
    category: "foundation",
    name: "Type 4: Dash",
    shortName: "Dash",
    description: "One hand dashes while the other remains static",
    icon: "fa-arrow-right-long",
    pdfPages: [14],
    prerequisites: ["cross-shifts-type3"],
    estimatedMinutes: 8,
    concepts: [
      "Single dash motion",
      "Creating multi-step sequences",
      "β→α and γ→γ dashes",
    ],
  },
  {
    id: "dual-dash-type5",
    order: 10,
    category: "foundation",
    name: "Type 5: Dual-Dash",
    shortName: "Dual-Dash",
    description: "Both hands dash simultaneously",
    icon: "fa-angles-right",
    pdfPages: [14],
    prerequisites: ["dash-type4"],
    estimatedMinutes: 8,
    concepts: [
      "Simultaneous dashing",
      "Position maintenance",
      "α→α, β→β, γ→γ patterns",
    ],
  },
  {
    id: "static-type6",
    order: 11,
    category: "foundation",
    name: "Type 6: Static",
    shortName: "Static",
    description: "Hold positions for steps with no motion",
    icon: "fa-circle",
    pdfPages: [14],
    prerequisites: ["dual-dash-type5"],
    estimatedMinutes: 5,
    concepts: [
      "Static holds in sequences",
      "Adding prop rotations to statics",
      "Body turns during static steps",
    ],
  },
  {
    id: "staff-positions",
    order: 12,
    category: "foundation",
    name: "Staff Positions",
    shortName: "Staff Pos.",
    description: "Track thumb orientations for staff work",
    icon: "fa-grip-lines-vertical",
    pdfPages: [15],
    prerequisites: ["static-type6"],
    estimatedMinutes: 10,
    concepts: [
      "Thumbs in/out orientations",
      "Marking the thumb end",
      "Position checking on steps",
    ],
  },
  {
    id: "staff-motions",
    order: 13,
    category: "foundation",
    name: "Staff Motions",
    shortName: "Staff Motion",
    description: "Learn prospin and antispin rotations",
    icon: "fa-rotate",
    pdfPages: [16],
    prerequisites: ["staff-positions"],
    estimatedMinutes: 15,
    concepts: [
      "Prospin - rotate with handpath",
      "Antispin - rotate opposite handpath",
      "90° isolation as base unit",
      "Thumb orientation changes",
    ],
  },
  {
    id: "negative-space",
    order: 14,
    category: "foundation",
    name: "Negative Space & Body Turns",
    shortName: "Negative Space",
    description: "Essential techniques for advanced sequences",
    icon: "fa-circle-half-stroke",
    pdfPages: [17],
    prerequisites: ["staff-motions"],
    estimatedMinutes: 20,
    concepts: [
      "360° Isolation",
      "4-Petal Antispin",
      "Shoulder/elbow negative space",
      "Body turn timing",
    ],
  },

  // LETTERS CATEGORY
  // Learning the alphabet - categorizing motions into letters
  {
    id: "letter-codex-intro",
    order: 15,
    category: "letters",
    name: "Pictograph Anatomy",
    shortName: "Pictographs",
    description: "A pictograph shows one step of motion.",
    icon: "fa-book",
    pdfPages: [18, 19, 20],
    prerequisites: ["negative-space"],
    estimatedMinutes: 10,
    concepts: [
      "Top left: the step number.",
      "Top center: where the hands start and end.",
      "Bottom left: the TKA letter and its turns.",
      "Bottom right: the hands’ time and direction.",
      "Top right: the props’ time and direction.",
      "In the middle: the props and the paths your hands follow.",
    ],
  },
  {
    id: "type1-abc-ghi",
    order: 16,
    category: "letters",
    name: "Type 1: ABC & GHI",
    shortName: "ABC/GHI",
    description: "Split-Same and Tog-Same dual-shift letters",
    icon: "fa-a",
    pdfPages: [21],
    prerequisites: ["letter-codex-intro"],
    estimatedMinutes: 15,
    concepts: [
      "A - Pro split-same (α→α)",
      "B - Anti split-same",
      "C - Hybrid split-same",
      "G - Pro tog-same (β→β)",
      "H - Anti tog-same",
      "I - Hybrid tog-same",
    ],
  },
  {
    id: "type1-compound",
    order: 17,
    category: "letters",
    name: "Type 1: DJ, EK, FL",
    shortName: "Compound",
    description: "Compound letters moving between α and β",
    icon: "fa-d",
    pdfPages: [22, 23],
    prerequisites: ["type1-abc-ghi"],
    estimatedMinutes: 12,
    concepts: [
      "D, E, F (β→α)",
      "J, K, L (α→β)",
      "Iso, Anti, Hybrid variations",
      "Memory phrases (Disco Jam, etc.)",
    ],
  },
  {
    id: "type1-gamma-compound",
    order: 18,
    category: "letters",
    name: "Type 1: MP, NQ, OR",
    shortName: "γ Compound",
    description: "Quarter-Opp gamma compound letters",
    icon: "fa-m",
    pdfPages: [24],
    prerequisites: ["type1-compound"],
    estimatedMinutes: 12,
    concepts: [
      "M, N, O (γ→γ opp)",
      "P, Q, R (γ→γ opp mirror)",
      "Magic Potion, Never Quit, Open Road",
    ],
  },
  {
    id: "type1-stuv",
    order: 19,
    category: "letters",
    name: "Type 1: STUV",
    shortName: "STUV",
    description: "Quarter-Same gamma letters with leading hand",
    icon: "fa-s",
    pdfPages: [24, 25],
    prerequisites: ["type1-gamma-compound"],
    estimatedMinutes: 10,
    concepts: [
      "S, T (γ→γ same)",
      "U - leads with isolation (round)",
      "V - leads with antispin (spiky)",
      "Leading vs following hand",
    ],
  },
  {
    id: "type2-wxyz",
    order: 20,
    category: "letters",
    name: "Type 2: WXYZ, ΣΔΘΩ",
    shortName: "Type 2",
    description: "Shift letters - one shifts, one static",
    icon: "fa-w",
    pdfPages: [26],
    prerequisites: ["type1-stuv"],
    estimatedMinutes: 10,
    concepts: [
      "W, X (γ→α open)",
      "Y, Z (γ→β close)",
      "Σ, Δ (α→γ close)",
      "Θ, Ω (β→γ open)",
    ],
  },
  {
    id: "type3-cross-shift-letters",
    order: 21,
    category: "letters",
    name: "Type 3: Cross-Shift Letters",
    shortName: "Type 3",
    description: "Letters with dash notation (W-, Σ-, etc.)",
    icon: "fa-minus",
    pdfPages: [27],
    prerequisites: ["type2-wxyz"],
    estimatedMinutes: 12,
    concepts: [
      "Dash notation explained",
      "W-, X-, Y-, Z- variations",
      "Σ-, Δ-, Θ-, Ω- variations",
      "Halfway point timing",
    ],
  },
  {
    id: "type456-dash-static",
    order: 22,
    category: "letters",
    name: "Type 4/5/6: Φ Ψ Λ",
    shortName: "Dash/Static",
    description: "Dash, Dual-Dash, and Static letter types",
    icon: "fa-circle-dot",
    pdfPages: [28],
    prerequisites: ["type3-cross-shift-letters"],
    estimatedMinutes: 10,
    concepts: [
      "Φ - Dash (β→α)",
      "Ψ - Dash (α→β)",
      "Λ - Dash (γ→γ)",
      "Dual-dash (-) variants",
      "α, β, γ static positions",
    ],
  },

  // COMBINATIONS CATEGORY
  // Putting letters together into words, sequences, and patterns
  {
    id: "words-alpha-beta",
    order: 23,
    category: "combinations",
    name: "TKA 1: Learning Letters",
    shortName: "Learning Letters",
    description: "Learn the six Alpha and Beta words one at a time",
    icon: "fa-spell-check",
    pdfPages: [29, 30],
    prerequisites: ["type456-dash-static"],
    estimatedMinutes: 20,
    concepts: [
      "AAAA, BBBB, and CCCC",
      "GGGG, HHHH, and IIII",
      "Performance, animation, and Choreo Card review",
    ],
  },
  {
    id: "compound-words",
    order: 24,
    category: "combinations",
    name: "Compound Words",
    shortName: "Compound",
    description: "DJ, EK, FL two-letter sequences",
    icon: "fa-layer-group",
    pdfPages: [22, 23],
    prerequisites: ["words-alpha-beta"],
    estimatedMinutes: 15,
    concepts: [
      "DJ sequences",
      "EK sequences",
      "FL sequences",
      "Tog-Opp vs Split-Opp execution",
    ],
  },
  {
    id: "gamma-words",
    order: 25,
    category: "combinations",
    name: "Gamma Words",
    shortName: "γ Words",
    description: "Four-letter gamma sequences",
    icon: "fa-diagram-project",
    pdfPages: [25],
    prerequisites: ["compound-words"],
    estimatedMinutes: 18,
    concepts: [
      "MPMP, NQNQ, OROR patterns",
      "SSSS, TTTT sequences",
      "UUUU, VVVV sequences",
      "γ→γ continuous motion",
    ],
  },
  {
    id: "caps-intro",
    order: 26,
    category: "combinations",
    name: "LOOPs - Continuous Assembly Patterns",
    shortName: "LOOPs",
    description: "Repeating patterns that return to start position",
    icon: "fa-arrows-rotate",
    pdfPages: [31, 32, 33],
    prerequisites: ["gamma-words"],
    estimatedMinutes: 20,
    concepts: [
      "Reflection across N-S, E-W, NE-SW, and NW-SE",
      "Mirrored and Flipped as familiar axis names",
      "Reflection axis is independent of grid mode",
      "Direct reflection returns home without an axis fixed point",
      "Rotated LOOPs",
      "Swapped LOOPs",
      "Returning to home position",
    ],
  },
  {
    id: "reversals",
    order: 27,
    category: "combinations",
    name: "Reversals",
    shortName: "Reversals",
    description: "Hand, prop, and full reversal techniques",
    icon: "fa-rotate-left",
    pdfPages: [32, 33, 34, 35],
    prerequisites: ["caps-intro"],
    estimatedMinutes: 25,
    concepts: [
      "Handpath reversals (simplest)",
      "Prop reversals (R/R notation)",
      "Full reversals (backwards in time)",
      "Reversal placement in LOOPs",
    ],
  },
  {
    id: "advanced-caps",
    order: 28,
    category: "combinations",
    name: "Advanced LOOP Examples",
    shortName: "Adv. LOOPs",
    description: "16-count sequences and 8-letter words",
    icon: "fa-bullseye",
    pdfPages: [36, 37, 38, 39, 40, 41],
    prerequisites: ["reversals"],
    estimatedMinutes: 30,
    concepts: [
      "Type 1 LOOPs (DJII, BBLF, KIEC)",
      "Gamma rotated LOOPs",
      "Type 2 LOOPs",
      "16-count sequences",
      "8-letter word construction",
      "Prop-reversal LOOPs",
      "Full-reversal LOOPs",
    ],
  },

  // ADVANCED CATEGORY
  // Optional mastery concepts for dedicated learners
  {
    id: "motion-type-mastery",
    order: 29,
    category: "advanced",
    name: "Motion Type Mastery",
    shortName: "Motion Types",
    description: "Master all 6 motion type combinations",
    icon: "fa-bolt",
    pdfPages: [5, 6, 7, 8, 9],
    prerequisites: ["advanced-caps"],
    estimatedMinutes: 40,
    concepts: [
      "Type 1: Dual-Shift mastery",
      "Type 2: Shift mastery",
      "Type 3: Cross-Shift mastery",
      "Type 4: Dash mastery",
      "Type 5: Dual-Dash mastery",
      "Type 6: Static mastery",
      "Combining all types fluidly",
    ],
  },
];

/**
 * Concept categories for organization
 */
export const CONCEPT_CATEGORIES: Record<
  ConceptCategory,
  {
    name: string;
    description: string;
    icon: string;
    color: string;
  }
> = {
  foundation: {
    name: "Foundation",
    description: "Core building blocks of The Kinetic Alphabet",
    icon: "fa-building-columns",
    color: "#4A90E2", // Blue
  },
  letters: {
    name: "Letters",
    description: "Learn the TKA letter system and notation",
    icon: "fa-font",
    color: "#7B68EE", // Purple
  },
  combinations: {
    name: "Combinations",
    description: "Words, LOOPs, and advanced sequences",
    icon: "fa-link",
    color: "#50C878", // Green
  },
  advanced: {
    name: "Advanced",
    description: "Mastery-level concepts and techniques",
    icon: "fa-rocket",
    color: "#FF6B6B", // Red
  },
};

export function getConceptsByCategory(
  category: ConceptCategory
): LearnConcept[] {
  return TKA_CONCEPTS.filter((concept) => concept.category === category);
}

export function getConceptById(id: string): LearnConcept | undefined {
  return TKA_CONCEPTS.find((concept) => concept.id === id);
}

/**
 * Get next concept in progression
 */
export function getNextConcept(currentId: string): LearnConcept | undefined {
  const currentIndex = TKA_CONCEPTS.findIndex((c) => c.id === currentId);
  return TKA_CONCEPTS[currentIndex + 1];
}

export function getPreviousConcept(
  currentId: string
): LearnConcept | undefined {
  const currentIndex = TKA_CONCEPTS.findIndex((c) => c.id === currentId);
  return currentIndex > 0 ? TKA_CONCEPTS[currentIndex - 1] : undefined;
}

/**
 * Check if concept is unlocked based on completed prerequisites.
 * Currently all concepts are unlocked for admin review and content iteration.
 * Prerequisites are preserved in concept definitions for future re-enablement.
 *
 * TODO(learn-unlock): This is a deliberate stub — it ignores both arguments and
 * always returns true. When the prerequisite-gating feature is (re-)enabled,
 * implement the real check here: a concept is unlocked iff every id in its
 * `prerequisites` array is present in `completedConcepts`. The params are named
 * `_conceptId` / `_completedConcepts` only because they're currently unused;
 * drop the underscores when wiring up the real logic.
 */
export function isConceptUnlocked(
  _conceptId: string,
  _completedConcepts: Set<string>
): boolean {
  return true;
}
