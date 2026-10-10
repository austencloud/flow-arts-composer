/**
 * Type 1 Letter Questions - Motion pattern data for Type 1 (Dual-Shift) letters
 */
import { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { shuffleArray } from "./shared-types";

export type MotionPattern = "pro-pro" | "anti-anti" | "hybrid";

export interface Type1LetterQuestion {
  letter: Letter;
  pattern: MotionPattern;
  leftMotion: MotionType;
  rightMotion: MotionType;
}

export interface PatternInfo {
  icon: string;
  label: string;
  color: string;
  description: string;
}

/**
 * All Type 1 letters with their motion patterns
 */
export const TYPE1_LETTERS: Type1LetterQuestion[] = [
  // Pro-Pro (7 letters)
  {
    letter: Letter.A,
    pattern: "pro-pro",
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.D,
    pattern: "pro-pro",
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.G,
    pattern: "pro-pro",
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.J,
    pattern: "pro-pro",
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.M,
    pattern: "pro-pro",
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.P,
    pattern: "pro-pro",
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.S,
    pattern: "pro-pro",
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.PRO,
  },

  // Anti-Anti (7 letters)
  {
    letter: Letter.B,
    pattern: "anti-anti",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
  },
  {
    letter: Letter.E,
    pattern: "anti-anti",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
  },
  {
    letter: Letter.H,
    pattern: "anti-anti",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
  },
  {
    letter: Letter.K,
    pattern: "anti-anti",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
  },
  {
    letter: Letter.N,
    pattern: "anti-anti",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
  },
  {
    letter: Letter.Q,
    pattern: "anti-anti",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
  },
  {
    letter: Letter.T,
    pattern: "anti-anti",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.ANTI,
  },

  // Hybrid (8 letters)
  {
    letter: Letter.C,
    pattern: "hybrid",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.F,
    pattern: "hybrid",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.I,
    pattern: "hybrid",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.L,
    pattern: "hybrid",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.O,
    pattern: "hybrid",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.R,
    pattern: "hybrid",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.U,
    pattern: "hybrid",
    leftMotion: MotionType.ANTI,
    rightMotion: MotionType.PRO,
  },
  {
    letter: Letter.V,
    pattern: "hybrid",
    leftMotion: MotionType.PRO,
    rightMotion: MotionType.ANTI,
  },
] as const;

/**
 * Pattern display configuration
 */
export const PATTERN_INFO: Record<MotionPattern, PatternInfo> = {
  "pro-pro": {
    icon: "fa-rotate-right",
    label: "Pro-Pro",
    color: "#22D3EE",
    description: "Both hands prospin",
  },
  "anti-anti": {
    icon: "fa-rotate-left",
    label: "Anti-Anti",
    color: "#A855F7",
    description: "Both hands antispin",
  },
  hybrid: {
    icon: "fa-shuffle",
    label: "Hybrid",
    color: "#F59E0B",
    description: "Different motions",
  },
} as const;

/**
 * Generate quiz questions by selecting 4 from each pattern
 */
export function generateType1Questions(): Type1LetterQuestion[] {
  const proProLetters = TYPE1_LETTERS.filter((q) => q.pattern === "pro-pro");
  const antiAntiLetters = TYPE1_LETTERS.filter(
    (q) => q.pattern === "anti-anti"
  );
  const hybridLetters = TYPE1_LETTERS.filter((q) => q.pattern === "hybrid");

  const shuffledProPro = shuffleArray(proProLetters);
  const shuffledAntiAnti = shuffleArray(antiAntiLetters);
  const shuffledHybrid = shuffleArray(hybridLetters);

  const selected: Type1LetterQuestion[] = [];
  selected.push(...shuffledProPro.slice(0, 4));
  selected.push(...shuffledAntiAnti.slice(0, 4));
  selected.push(...shuffledHybrid.slice(0, 4));

  return shuffleArray(selected);
}
