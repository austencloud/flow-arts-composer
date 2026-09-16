/**
 * Type 1 Letter Data - Domain constants for Type 1 (Dual-Shift) letters
 * Based on letter-mappings.json and Level 1 PDF
 *
 * Type 1 letters are characterized by BOTH hands moving from one position to another.
 * Organized by motion pattern: Pro-Pro, Anti-Anti, and Hybrid
 */

import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { GridPlacementGroup } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { MotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { Type1LetterData } from "../type1-letter-data";

/**
 * Prospin (Pro-Pro) Letters: A, D, G, J, M, P, S
 * Both hands spin in the same direction as their motion path
 */
export const PROSPIN_LETTERS: Type1LetterData[] = [
  {
    letter: Letter.A,
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.ALPHA,
    endPlacementGroup: GridPlacementGroup.ALPHA,
    description: "Alpha to Alpha, both hands prospin",
  },
  {
    letter: Letter.D,
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.BETA,
    endPlacementGroup: GridPlacementGroup.ALPHA,
    description: "Beta to Alpha, both hands prospin",
  },
  {
    letter: Letter.G,
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.BETA,
    endPlacementGroup: GridPlacementGroup.BETA,
    description: "Beta to Beta, both hands prospin",
  },
  {
    letter: Letter.J,
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.ALPHA,
    endPlacementGroup: GridPlacementGroup.BETA,
    description: "Alpha to Beta, both hands prospin",
  },
  {
    letter: Letter.M,
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.GAMMA,
    endPlacementGroup: GridPlacementGroup.GAMMA,
    description: "Gamma to Gamma, both hands prospin",
  },
  {
    letter: Letter.P,
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.GAMMA,
    endPlacementGroup: GridPlacementGroup.GAMMA,
    description: "Gamma to Gamma, both hands prospin",
  },
  {
    letter: Letter.S,
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.GAMMA,
    endPlacementGroup: GridPlacementGroup.GAMMA,
    description: "Gamma to Gamma, both hands prospin",
    leaderRotation: "pro",
  },
];

/**
 * Antispin (Anti-Anti) Letters: B, E, H, K, N, Q, T
 * Both hands spin opposite to their motion path
 */
export const ANTISPIN_LETTERS: Type1LetterData[] = [
  {
    letter: Letter.B,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
    startPlacementGroup: GridPlacementGroup.ALPHA,
    endPlacementGroup: GridPlacementGroup.ALPHA,
    description: "Alpha to Alpha, both hands antispin",
  },
  {
    letter: Letter.E,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
    startPlacementGroup: GridPlacementGroup.BETA,
    endPlacementGroup: GridPlacementGroup.ALPHA,
    description: "Beta to Alpha, both hands antispin",
  },
  {
    letter: Letter.H,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
    startPlacementGroup: GridPlacementGroup.BETA,
    endPlacementGroup: GridPlacementGroup.BETA,
    description: "Beta to Beta, both hands antispin",
  },
  {
    letter: Letter.K,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
    startPlacementGroup: GridPlacementGroup.ALPHA,
    endPlacementGroup: GridPlacementGroup.BETA,
    description: "Alpha to Beta, both hands antispin",
  },
  {
    letter: Letter.N,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
    startPlacementGroup: GridPlacementGroup.GAMMA,
    endPlacementGroup: GridPlacementGroup.GAMMA,
    description: "Gamma to Gamma, both hands antispin",
  },
  {
    letter: Letter.Q,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
    startPlacementGroup: GridPlacementGroup.GAMMA,
    endPlacementGroup: GridPlacementGroup.GAMMA,
    description: "Gamma to Gamma, both hands antispin",
  },
  {
    letter: Letter.T,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
    startPlacementGroup: GridPlacementGroup.GAMMA,
    endPlacementGroup: GridPlacementGroup.GAMMA,
    description: "Gamma to Gamma, both hands antispin",
    leaderRotation: "anti",
  },
];

/**
 * Hybrid Letters: C, F, I, L, O, R, U, V
 * Hands spin in different directions (one prospin, one antispin)
 * Most hybrids: left antispin + right prospin
 * V is the exception: left prospin + right antispin (reverse hybrid)
 */
export const HYBRID_LETTERS: Type1LetterData[] = [
  {
    letter: Letter.C,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.ALPHA,
    endPlacementGroup: GridPlacementGroup.ALPHA,
    description: "Alpha to Alpha, left antispin, right prospin",
  },
  {
    letter: Letter.F,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.BETA,
    endPlacementGroup: GridPlacementGroup.ALPHA,
    description: "Beta to Alpha, left antispin, right prospin",
  },
  {
    letter: Letter.I,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.BETA,
    endPlacementGroup: GridPlacementGroup.BETA,
    description: "Beta to Beta, left antispin, right prospin",
  },
  {
    letter: Letter.L,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.ALPHA,
    endPlacementGroup: GridPlacementGroup.BETA,
    description: "Alpha to Beta, left antispin, right prospin",
  },
  {
    letter: Letter.O,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.GAMMA,
    endPlacementGroup: GridPlacementGroup.GAMMA,
    description: "Gamma to Gamma, left antispin, right prospin",
  },
  {
    letter: Letter.R,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.GAMMA,
    endPlacementGroup: GridPlacementGroup.GAMMA,
    description: "Gamma to Gamma, left antispin, right prospin",
  },
  {
    letter: Letter.U,
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
    startPlacementGroup: GridPlacementGroup.GAMMA,
    endPlacementGroup: GridPlacementGroup.GAMMA,
    description: "Gamma to Gamma, left antispin, right prospin",
    leaderRotation: "pro",
  },
  {
    letter: Letter.V,
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.ANTI,
    startPlacementGroup: GridPlacementGroup.GAMMA,
    endPlacementGroup: GridPlacementGroup.GAMMA,
    description:
      "Gamma to Gamma, left prospin, right antispin (reverse hybrid)",
    leaderRotation: "anti",
  },
];

/**
 * All Type 1 letters combined (A-V)
 * Total: 22 letters
 */
export const ALL_TYPE1_LETTERS: Type1LetterData[] = [
  ...PROSPIN_LETTERS,
  ...ANTISPIN_LETTERS,
  ...HYBRID_LETTERS,
];

/**
 * Type 1 alphabet string for display purposes
 */
export const TYPE1_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUV";

/**
 * Motion pattern categories for Type 1 letters
 */
export type MotionPattern = "pro-pro" | "anti-anti" | "hybrid";

/**
 * Get letters by their motion pattern category
 */
export function getLettersByMotionPattern(
  pattern: MotionPattern
): Type1LetterData[] {
  switch (pattern) {
    case "pro-pro":
      return PROSPIN_LETTERS;
    case "anti-anti":
      return ANTISPIN_LETTERS;
    case "hybrid":
      return HYBRID_LETTERS;
  }
}

/**
 * Get the motion pattern for a given letter
 */
export function getMotionPatternForLetter(
  letter: Letter
): MotionPattern | null {
  if (PROSPIN_LETTERS.some((l) => l.letter === letter)) return "pro-pro";
  if (ANTISPIN_LETTERS.some((l) => l.letter === letter)) return "anti-anti";
  if (HYBRID_LETTERS.some((l) => l.letter === letter)) return "hybrid";
  return null;
}
