/**
 * Staff Quiz Questions - Question data for staff identification quiz
 */

import { shuffleArray } from "./shared-types";

export type HandPosition = "N" | "E" | "S" | "W";
export type ThumbOrientation = "in" | "out";
export { type PlacementType } from "./shared-types";
export type RotationType = "prospin" | "antispin" | "none";
export type QuestionType = "placement" | "thumb" | "rotation";

export interface StaffQuizQuestion {
  type: QuestionType;
  leftPos: HandPosition;
  rightPos: HandPosition;
  leftThumb: ThumbOrientation;
  rightThumb: ThumbOrientation;
  correctAnswer: string;
  options: string[];
  questionText: string;
  showRotationPath?: boolean;
  rotationType?: RotationType;
}

export interface AnswerInfo {
  icon: string;
  color: string;
}

/**
 * Answer button styling info
 */
export const ANSWER_INFO: Record<string, AnswerInfo> = {
  alpha: { icon: "fa-arrows-left-right", color: "#FF6B6B" },
  beta: { icon: "fa-circle-dot", color: "#4ECDC4" },
  gamma: { icon: "fa-rotate-right", color: "#FFE66D" },
  prospin: { icon: "fa-sync-alt", color: "#22D3EE" },
  antispin: { icon: "fa-retweet", color: "#F97316" },
  "Both thumbs in": { icon: "fa-compress-alt", color: "#3B82F6" },
  "Both thumbs out": { icon: "fa-expand-alt", color: "#A855F7" },
  "Left in, Right out": { icon: "fa-arrows-alt-h", color: "#10B981" },
  "Left out, Right in": { icon: "fa-arrows-alt-h", color: "#EC4899" },
} as const;

/**
 * Get answer info with fallback
 */
export function getAnswerInfo(answer: string): AnswerInfo {
  return ANSWER_INFO[answer] || { icon: "fa-question", color: "#888" };
}

/**
 * Generate quiz questions
 */
export function generateStaffQuizQuestions(): StaffQuizQuestion[] {
  const q: StaffQuizQuestion[] = [];

  // Placement identification questions (4 questions)
  q.push({
    type: "placement",
    leftPos: "N",
    rightPos: "S",
    leftThumb: "in",
    rightThumb: "in",
    correctAnswer: "alpha",
    options: ["alpha", "beta", "gamma"],
    questionText: "What placement type is shown?",
  });

  q.push({
    type: "placement",
    leftPos: "E",
    rightPos: "E",
    leftThumb: "in",
    rightThumb: "in",
    correctAnswer: "beta",
    options: ["alpha", "beta", "gamma"],
    questionText: "What placement type is shown?",
  });

  q.push({
    type: "placement",
    leftPos: "N",
    rightPos: "E",
    leftThumb: "in",
    rightThumb: "in",
    correctAnswer: "gamma",
    options: ["alpha", "beta", "gamma"],
    questionText: "What placement type is shown?",
  });

  q.push({
    type: "placement",
    leftPos: "W",
    rightPos: "S",
    leftThumb: "out",
    rightThumb: "out",
    correctAnswer: "gamma",
    options: ["alpha", "beta", "gamma"],
    questionText: "What placement type is shown?",
  });

  // Thumb orientation questions (2 questions)
  q.push({
    type: "thumb",
    leftPos: "N",
    rightPos: "S",
    leftThumb: "in",
    rightThumb: "in",
    correctAnswer: "Both thumbs in",
    options: ["Both thumbs in", "Both thumbs out", "Left in, Right out"],
    questionText: "What is the thumb orientation?",
  });

  q.push({
    type: "thumb",
    leftPos: "E",
    rightPos: "W",
    leftThumb: "out",
    rightThumb: "in",
    correctAnswer: "Left out, Right in",
    options: ["Both thumbs in", "Left out, Right in", "Both thumbs out"],
    questionText: "What is the thumb orientation?",
  });

  // Rotation type questions (4 questions)
  q.push({
    type: "rotation",
    leftPos: "N",
    rightPos: "S",
    leftThumb: "in",
    rightThumb: "in",
    correctAnswer: "prospin",
    options: ["prospin", "antispin"],
    questionText:
      "If the thumbs STAY IN during motion, what rotation type is this?",
    showRotationPath: true,
    rotationType: "prospin",
  });

  q.push({
    type: "rotation",
    leftPos: "E",
    rightPos: "W",
    leftThumb: "out",
    rightThumb: "out",
    correctAnswer: "antispin",
    options: ["prospin", "antispin"],
    questionText:
      "If thumbs started IN and now are OUT, what rotation occurred?",
    showRotationPath: true,
    rotationType: "antispin",
  });

  q.push({
    type: "rotation",
    leftPos: "N",
    rightPos: "E",
    leftThumb: "in",
    rightThumb: "in",
    correctAnswer: "prospin",
    options: ["prospin", "antispin"],
    questionText: "Thumb orientation unchanged = which rotation?",
    showRotationPath: true,
    rotationType: "prospin",
  });

  q.push({
    type: "rotation",
    leftPos: "S",
    rightPos: "W",
    leftThumb: "out",
    rightThumb: "out",
    correctAnswer: "antispin",
    options: ["prospin", "antispin"],
    questionText: "Thumb swapped from IN to OUT = which rotation?",
    showRotationPath: true,
    rotationType: "antispin",
  });

  // Shuffle questions (Fisher-Yates; unbiased)
  return shuffleArray(q);
}
