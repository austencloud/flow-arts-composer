import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import { Letter as TkaLetter } from "$lib/shared/foundation/domain/models/letter";
import { LetterType } from "$lib/shared/foundation/domain/models/letter-type";
import { LETTER_TYPE_COLORS } from "$lib/shared/pictograph/shared/domain/constants/pictograph-constants";
import type { HandMotionType } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import { HandMotionType as HandPath } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

export interface HandMotionLessonItem {
  id: Extract<HandMotionType, "shift" | "dash" | "static">;
  name: string;
  letter: Letter;
  letterType: LetterType;
  cue: string;
  meaning: string;
  accent: string;
}

export const HAND_MOTION_LESSON = [
  {
    id: HandPath.SHIFT,
    name: "Shift",
    letter: TkaLetter.W,
    letterType: LetterType.TYPE2,
    cue: "Follow the curve",
    meaning: "A hand travels around the grid to the next point.",
    accent: LETTER_TYPE_COLORS[LetterType.TYPE2][0],
  },
  {
    id: HandPath.DASH,
    name: "Dash",
    letter: TkaLetter.PHI,
    letterType: LetterType.TYPE4,
    cue: "Cut across the center",
    meaning: "A hand travels straight across the grid to the opposite point.",
    accent: LETTER_TYPE_COLORS[LetterType.TYPE4][0],
  },
  {
    id: HandPath.STATIC,
    name: "Static",
    letter: TkaLetter.ALPHA,
    letterType: LetterType.TYPE6,
    cue: "Hold the point",
    meaning: "The hand stays put. The prop can still rotate in place.",
    accent: LETTER_TYPE_COLORS[LetterType.TYPE6][0],
  },
] as const satisfies readonly HandMotionLessonItem[];

export const HAND_MOTION_QUESTIONS = [
  {
    letter: TkaLetter.W,
    prompt:
      "The right hand follows a curve to the next point. What path is that?",
    answer: HandPath.SHIFT,
  },
  {
    letter: TkaLetter.PHI,
    prompt: "The right hand cuts straight across the grid. What path is that?",
    answer: HandPath.DASH,
  },
  {
    letter: TkaLetter.ALPHA,
    prompt: "Both hands keep their grid points. What path is that?",
    answer: HandPath.STATIC,
  },
] as const;

export type RotationRelationship = "pro" | "anti";

export interface RotationDirectionLessonItem {
  id: RotationRelationship;
  name: string;
  letter: Letter;
  cue: string;
  meaning: string;
  orientationCue: string;
  accent: string;
}

/**
 * A and B share the same alpha-to-alpha hand paths. Their prop relationship is
 * the controlled variable: A is pro + pro, while B is anti + anti.
 */
export const ROTATION_DIRECTION_LESSON = [
  {
    id: "pro",
    name: "Pro",
    letter: TkaLetter.A,
    cue: "With the hand arc",
    meaning:
      "The prop rotates in the same direction as the hand's curved path.",
    orientationCue: "At the Level 1 base rate, in stays in.",
    accent: "#22d3ee",
  },
  {
    id: "anti",
    name: "Anti",
    letter: TkaLetter.B,
    cue: "Against the hand arc",
    meaning:
      "The prop rotates opposite the direction of the hand's curved path.",
    orientationCue: "At the Level 1 base rate, in changes to out.",
    accent: "#f97316",
  },
] as const satisfies readonly RotationDirectionLessonItem[];

export const ROTATION_DIRECTION_QUESTIONS = [
  {
    letter: TkaLetter.A,
    prompt:
      "Replay letter A. How do its props rotate relative to the hand arcs?",
    answer: "pro",
  },
  {
    letter: TkaLetter.B,
    prompt:
      "Replay letter B. How do its props rotate relative to the hand arcs?",
    answer: "anti",
  },
] as const satisfies readonly {
  letter: Letter;
  prompt: string;
  answer: RotationRelationship;
}[];

export type Type1Pattern = "pro-pro" | "anti-anti" | "hybrid";

export interface Type1LessonLetter {
  letter: Letter;
  placementFamily: "alpha" | "beta";
  pattern: Type1Pattern;
}

export const TYPE1_LESSON_LETTERS = [
  { letter: TkaLetter.A, placementFamily: "alpha", pattern: "pro-pro" },
  { letter: TkaLetter.B, placementFamily: "alpha", pattern: "anti-anti" },
  { letter: TkaLetter.C, placementFamily: "alpha", pattern: "hybrid" },
  { letter: TkaLetter.G, placementFamily: "beta", pattern: "pro-pro" },
  { letter: TkaLetter.H, placementFamily: "beta", pattern: "anti-anti" },
  { letter: TkaLetter.I, placementFamily: "beta", pattern: "hybrid" },
] as const satisfies readonly Type1LessonLetter[];

export const TYPE1_PATTERN_LABELS: Record<Type1Pattern, string> = {
  "pro-pro": "Pro + pro",
  "anti-anti": "Anti + anti",
  hybrid: "Pro + anti",
};

export const TYPE1_QUESTIONS = [
  {
    prompt: "Find the hybrid letter that stays in alpha.",
    choices: [TkaLetter.A, TkaLetter.B, TkaLetter.C],
    answer: TkaLetter.C,
  },
  {
    prompt: "Find the anti + anti letter that stays in beta.",
    choices: [TkaLetter.G, TkaLetter.H, TkaLetter.I],
    answer: TkaLetter.H,
  },
  {
    prompt: "Find the pro + pro letter that stays in alpha.",
    choices: [TkaLetter.A, TkaLetter.B, TkaLetter.C],
    answer: TkaLetter.A,
  },
] as const;

export const TYPE1_ACCENTS = LETTER_TYPE_COLORS[LetterType.TYPE1];
