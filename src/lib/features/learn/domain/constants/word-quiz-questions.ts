/**
 * Word Quiz Questions - Question data for word building quiz
 */

import { shuffleArray } from "./shared-types";

// Local on purpose: 8-point HandPosition and the prop-rotation MotionType
// (pro|anti|hybrid) diverge from the 4-point / hand-path variants in the motion
// files. Not consolidated — see shared-types.ts.
export type HandPosition = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";
export type MotionType = "pro" | "anti" | "hybrid";
export type QuestionType =
  | "identify-word"
  | "motion-pattern"
  | "placement-transition"
  | "letter-sequence"
  | "cap-concept";

export interface LetterDefinition {
  letter: string;
  startLeft: HandPosition;
  startRight: HandPosition;
  endLeft: HandPosition;
  endRight: HandPosition;
  leftMotion: MotionType;
  rightMotion: MotionType;
}

export interface WordQuizQuestion {
  type: QuestionType;
  question: string;
  letters?: LetterDefinition[];
  options: string[];
  correctAnswer: number;
  explanation: string;
}

/**
 * Sample letter definitions for visualizations
 */
export const SAMPLE_LETTERS = {
  A: {
    letter: "A",
    startLeft: "N",
    startRight: "S",
    endLeft: "E",
    endRight: "W",
    leftMotion: "pro",
    rightMotion: "pro",
  } as LetterDefinition,
  B: {
    letter: "B",
    startLeft: "N",
    startRight: "S",
    endLeft: "W",
    endRight: "E",
    leftMotion: "anti",
    rightMotion: "anti",
  } as LetterDefinition,
  C: {
    letter: "C",
    startLeft: "E",
    startRight: "W",
    endLeft: "S",
    endRight: "N",
    leftMotion: "pro",
    rightMotion: "pro",
  } as LetterDefinition,
  G: {
    letter: "G",
    startLeft: "N",
    startRight: "N",
    endLeft: "E",
    endRight: "E",
    leftMotion: "pro",
    rightMotion: "pro",
  } as LetterDefinition,
  H: {
    letter: "H",
    startLeft: "N",
    startRight: "N",
    endLeft: "W",
    endRight: "W",
    leftMotion: "anti",
    rightMotion: "anti",
  } as LetterDefinition,
};

/**
 * Question type icons
 */
export const TYPE_ICONS: Record<QuestionType, string> = {
  "identify-word": "fa-eye",
  "motion-pattern": "fa-rotate",
  "placement-transition": "fa-arrows-left-right",
  "letter-sequence": "fa-link",
  "cap-concept": "fa-circle-notch",
} as const;

/**
 * All possible quiz questions
 */
export const WORD_QUIZ_QUESTIONS: WordQuizQuestion[] = [
  {
    type: "motion-pattern",
    question: "What motion type repeats throughout the TKA alphabet?",
    options: [
      "Pro, Anti, Static",
      "Pro, Anti, Hybrid",
      "Pro, Pro, Anti",
      "Hybrid, Hybrid, Pro",
    ],
    correctAnswer: 1,
    explanation:
      "The Pro-Anti-Hybrid pattern repeats throughout the alphabet (A=Pro, B=Anti, C=Hybrid, D=Pro, E=Anti, F=Hybrid, etc.)",
  },
  {
    type: "identify-word",
    question: "Watch the animation. What word is being spelled?",
    letters: [SAMPLE_LETTERS.A, SAMPLE_LETTERS.A],
    options: ["AB", "AA", "BB", "CC"],
    correctAnswer: 1,
    explanation:
      "This shows the letter A performed twice in sequence, forming the word 'AA'.",
  },
  {
    type: "placement-transition",
    question:
      "In Alpha (α) placement, where are the hands relative to each other?",
    options: [
      "Same point (together)",
      "Opposite sides (180°)",
      "Right angle (90°)",
      "Adjacent points",
    ],
    correctAnswer: 1,
    explanation:
      "Alpha placement has hands on opposite sides of the grid (180° apart), like N-S or E-W.",
  },
  {
    type: "letter-sequence",
    question: "What makes letters connect in a TKA word?",
    options: [
      "Letters must be alphabetical",
      "End placement of one letter = Start of next",
      "All letters must be the same",
      "Letters must alternate motion types",
    ],
    correctAnswer: 1,
    explanation:
      "Letters connect when the end placement of one letter matches the start placement of the next letter.",
  },
  {
    type: "cap-concept",
    question: "What is a LOOP (Linked Orbital Offset Pattern)?",
    options: [
      "A letter that uses only one hand",
      "A word where end placement returns to start",
      "A transition between pro and anti",
      "A placement with both hands together",
    ],
    correctAnswer: 1,
    explanation:
      "A LOOP is a word where the final placement returns to the original starting placement, creating a loop.",
  },
  {
    type: "identify-word",
    question: "Watch this sequence. What letters are being performed?",
    letters: [SAMPLE_LETTERS.A, SAMPLE_LETTERS.B],
    options: ["AA", "AB", "BA", "BB"],
    correctAnswer: 1,
    explanation:
      "First a Pro motion (letter A), then an Anti motion (letter B), forming 'AB'.",
  },
  {
    type: "motion-pattern",
    question: "Letter A uses which motion type for both hands?",
    letters: [SAMPLE_LETTERS.A],
    options: ["Antispin", "Prospin", "Hybrid", "Static"],
    correctAnswer: 1,
    explanation:
      "Letter A uses Prospin motion for both hands - they rotate in the same direction as their travel.",
  },
  {
    type: "placement-transition",
    question: "In Beta (β) placement, where are the hands?",
    options: [
      "Opposite sides",
      "Right angle apart",
      "Same point (together)",
      "Diagonal corners",
    ],
    correctAnswer: 2,
    explanation:
      "Beta placement has both hands at the same point on the grid (0° apart).",
  },
  {
    type: "letter-sequence",
    question:
      "If a letter ends in Alpha placement (α), what must the next letter start in?",
    options: ["Beta (β)", "Gamma (γ)", "Alpha (α)", "Any placement"],
    correctAnswer: 2,
    explanation:
      "For letters to connect, the end placement type must match the next letter's start placement type.",
  },
  {
    type: "cap-concept",
    question: "Which word type creates a seamless loop?",
    options: [
      "Any word with 2+ letters",
      "Words starting with A",
      "LOOPs (returning to start)",
      "Words with all Pro motions",
    ],
    correctAnswer: 2,
    explanation:
      "LOOPs (Continuous Assembly Patterns) return to the starting placement, creating seamless loops.",
  },
  {
    type: "identify-word",
    question: "What word is shown? (Both hands move together)",
    letters: [SAMPLE_LETTERS.G, SAMPLE_LETTERS.G],
    options: ["AA", "BB", "GG", "HH"],
    correctAnswer: 2,
    explanation:
      "Letter G shows both hands starting at the same point (Beta) and moving together with Pro motion.",
  },
  {
    type: "motion-pattern",
    question: "What distinguishes Antispin from Prospin?",
    options: [
      "Antispin is faster",
      "Antispin rotates opposite to travel direction",
      "Antispin uses only one hand",
      "Antispin starts from Beta placement",
    ],
    correctAnswer: 1,
    explanation:
      "In Antispin, the props rotate opposite to their direction of travel. In Prospin, they rotate the same direction.",
  },
];

/**
 * Generate shuffled quiz questions (select 9)
 */
export function generateWordQuizQuestions(): WordQuizQuestion[] {
  return shuffleArray(WORD_QUIZ_QUESTIONS).slice(0, 9);
}
