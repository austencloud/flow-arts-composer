/**
 * Shared Sequence Parameter Types
 *
 * These types represent the core parameters that define a sequence,
 * used by both:
 * - Generate module (to create new sequences)
 * - Browse module (to filter existing sequences)
 *
 * Keeping these unified ensures consistency across the app.
 */


export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export interface DifficultyLevelConfig {
  level: DifficultyLevel;
  name: string;
  description: string;
  gradient: string;
  shadowColor: string;
  textColor: "white" | "black";
}

export const DIFFICULTY_LEVELS: Record<DifficultyLevel, DifficultyLevelConfig> =
  {
    1: {
      level: 1,
      name: "Base Motions",
      description: "Sky blue",
      gradient: `radial-gradient(ellipse at top left,
      rgb(186, 230, 253) 0%,
      rgb(125, 211, 252) 30%,
      rgb(56, 189, 248) 70%,
      rgb(14, 165, 233) 100%)`,
      shadowColor: "200deg 80% 50%",
      textColor: "black",
    },
    2: {
      level: 2,
      name: "Whole Turns",
      description: "Metallic silver",
      gradient: `linear-gradient(135deg,
      rgb(170, 170, 170) 0%,
      rgb(210, 210, 210) 15%,
      rgb(120, 120, 120) 30%,
      rgb(180, 180, 180) 40%,
      rgb(190, 190, 190) 55%,
      rgb(130, 130, 130) 75%,
      rgb(110, 110, 110) 100%)`,
      shadowColor: "0deg 0% 45%",
      textColor: "black",
    },
    3: {
      level: 3,
      name: "Half Turns, Floats",
      description: "Warm gold",
      gradient: `radial-gradient(ellipse at top left,
      rgb(254, 240, 138) 0%,
      rgb(253, 224, 71) 20%,
      rgb(250, 204, 21) 40%,
      rgb(234, 179, 8) 60%,
      rgb(202, 138, 4) 80%,
      rgb(161, 98, 7) 100%)`,
      shadowColor: "45deg 93% 47%",
      textColor: "black",
    },
    // Levels 4 and 6 traded places in Aug 2026 (see the `level-system` domain
    // topic). This table stops at 5 because `DifficultyLevel` does, and the
    // centric grid that now holds L6 is not implemented yet. Gradients are
    // unchanged - the shipping calculator never returns above 3, so no card has
    // ever rendered one of these badges.
    4: {
      level: 4,
      name: "Interradials",
      description: "Deep purple",
      gradient: `linear-gradient(135deg,
      rgb(200, 162, 200) 0%,
      rgb(170, 132, 170) 30%,
      rgb(148, 0, 211) 60%,
      rgb(100, 0, 150) 100%)`,
      shadowColor: "280deg 80% 40%",
      textColor: "black",
    },
    5: {
      level: 5,
      name: "Skews",
      description: "Hot red",
      gradient: `linear-gradient(135deg,
      rgb(255, 90, 40) 0%,
      rgb(255, 50, 30) 30%,
      rgb(230, 25, 15) 60%,
      rgb(180, 10, 5) 100%)`,
      shadowColor: "5deg 90% 50%",
      textColor: "black",
    },
  };


export type StartingPlacement = "alpha" | "beta" | "gamma";

export interface StartingPlacementConfig {
  id: StartingPlacement;
  symbol: string;
  fullName: string;
  color: string;
}

export const STARTING_PLACEMENTS: Record<
  StartingPlacement,
  StartingPlacementConfig
> = {
  alpha: {
    id: "alpha",
    symbol: "α",
    fullName: "Alpha",
    color: "#8b5cf6", // Purple
  },
  beta: {
    id: "beta",
    symbol: "β",
    fullName: "Beta",
    color: "#8b5cf6",
  },
  gamma: {
    id: "gamma",
    symbol: "γ",
    fullName: "Gamma",
    color: "#8b5cf6",
  },
};

export const STARTING_PLACEMENTS_LIST: StartingPlacementConfig[] = [
  STARTING_PLACEMENTS.alpha,
  STARTING_PLACEMENTS.beta,
  STARTING_PLACEMENTS.gamma,
];


export interface SequenceLengthConfig {
  min: number;
  max: number;
  step: number;
  default: number;
}

// Generate uses wider range with larger steps
export const GENERATE_LENGTH_CONFIG: SequenceLengthConfig = {
  min: 4,
  max: 64,
  step: 4,
  default: 16,
};

// Filter uses smaller range (based on what exists in library)
export const FILTER_LENGTH_CONFIG: SequenceLengthConfig = {
  min: 2,
  max: 16,
  step: 1,
  default: 8,
};


export const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export interface LetterConfig {
  letter: string;
  color: string;
}

// Default color for letter cards
export const LETTER_CARD_COLOR = "#10b981"; // Emerald green


/**
 * Core sequence parameters shared between Generate and Filter.
 * All fields are optional because:
 * - Generate: User builds up configuration
 * - Filter: User selects which criteria to filter by
 */
export interface SequenceParameters {
  level?: DifficultyLevel | null;
  startingPlacement?: StartingPlacement | null;
  length?: number | null;
  startingLetter?: string | null;
}

/**
 * Extended parameters for Generate (includes generation-specific options)
 */
export interface GenerateParameters extends SequenceParameters {
  endPlacement?: StartingPlacement | null;
  mustContainLetters?: string[];
  mustNotContainLetters?: string[];
}

/**
 * Extended parameters for Filter (includes filter-specific options)
 */
export interface FilterParameters extends SequenceParameters {
  favorites?: boolean;
  containsLetters?: string[];
}
