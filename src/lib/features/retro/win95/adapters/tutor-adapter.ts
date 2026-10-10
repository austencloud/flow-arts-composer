/**
 * Tutor Adapter
 *
 * Bridges TUTOR.EXE's three tabs to real Learn module data:
 *   - Concepts tab: static educational content cards
 *   - Quiz tab: real motion-type questions from the Learn module's quiz data
 *   - Codex tab: live letter data from the Codex service via DI container
 *
 * Domain: Retro TUTOR App
 */

import {
  MOTION_QUIZ_QUESTIONS,
  type MotionQuizQuestion,
} from "#lib/features/learn/domain/constants/motion-quiz-data.js";
import { shuffleArray } from "#lib/features/learn/domain/constants/shared-types.js";
import { getCodex } from "#lib/features/learn/codex/get-codex.js";
import type { Codex } from "../../../learn/codex/services/codex";
import { getLetterType } from "#lib/shared/foundation/domain/models/letter.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import type { LetterType } from "#lib/shared/foundation/domain/models/letter-type.js";

// Concepts tab

export interface RetroConcept {
  id: string;
  title: string;
  icon: string;
  body: string;
}

/**
 * Static educational concept cards for the Concepts tab.
 *
 * The Learn module's concepts are interactive Svelte components, not data files,
 * so we provide equivalent text-only cards here for the retro HyperCard metaphor.
 */
export function loadConcepts(): RetroConcept[] {
  return [
    {
      id: "grid",
      title: "Grid Positions",
      icon: "mappin",
      body: "The TKA grid has 8 positions: 4 cardinal (N, E, S, W) and 4 intercardinal (NE, SE, SW, NW). Each hand occupies one position at a time. Diamond mode uses the cardinals as primary. Box mode rotates 45 degrees.",
    },
    {
      id: "motions",
      title: "Motion Types",
      icon: "rotate",
      body: "Hands move between grid positions via three motion families: Shift (hand travels to a new position), Dash (hand stays but the prop rotates in place), and Static (hand and prop both stay put). These combine into 6 letter types.",
    },
    {
      id: "types",
      title: "The 6 Letter Types",
      icon: "letters",
      body: "Type 1: both shift. Type 2: one shifts, one is static. Type 3: one shifts, one dashes. Type 4: one dashes, one is static. Type 5: both dash. Type 6: both static. Every letter in TKA belongs to exactly one type.",
    },
    {
      id: "turns",
      title: "Turns & Rotation",
      icon: "rotate",
      body: "Rotation is measured in turns. 1 turn = 180 degrees of additional rotation beyond the hand's travel. 0 turns means no extra rotation. Float is a special 0.5-turn state. Turns can be clockwise or counterclockwise.",
    },
    {
      id: "sequences",
      title: "Building Sequences",
      icon: "book",
      body: "A sequence is a series of letters read left to right. Each letter's end position becomes the next letter's start position. A word is the string of letters: BOOK, FLOW, SPIN. Sequences can be 2 to 16+ beats long.",
    },
    {
      id: "orientations",
      title: "Prop Orientations",
      icon: "rotate",
      body: "Each prop has an orientation: radial (pointing toward/away from center), nonradial (perpendicular to radial), or one of 6 interradial angles between them. Orientation tells you which way the prop is pointing, independent of where the hand is.",
    },
  ];
}

// Quiz tab

export interface RetroQuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

/**
 * Draw `count` random questions from the real motion-type quiz dataset.
 *
 * Each question asks the user to identify which type a left+right motion combo
 * belongs to. Options are always the 6 types in order so the answer stays stable
 * after shuffling the question pool.
 */
export function loadQuizQuestions(count: number): RetroQuizQuestion[] {
  const shuffled = shuffleArray(MOTION_QUIZ_QUESTIONS);
  const selected = shuffled.slice(0, Math.min(count, shuffled.length));
  return selected.map((q: MotionQuizQuestion) => ({
    question: `Left hand: ${q.leftStart}→${q.leftEnd} (${q.leftMotion})\nRight hand: ${q.rightStart}→${q.rightEnd} (${q.rightMotion})\n\nWhat letter type is this?`,
    options: ["Type 1", "Type 2", "Type 3", "Type 4", "Type 5", "Type 6"],
    correctIndex: q.correctAnswer - 1,
    explanation: `Type ${q.correctAnswer}: ${q.leftMotion} + ${q.rightMotion}`,
  }));
}

// ============================================================================
// Codex tab
// ============================================================================

export interface RetroCodexLetter {
  letter: string;
  type: LetterType;
  typeNumber: number;
  description: string;
}

/**
 * Load all known TKA letters from the Codex service and return them sorted
 * alphabetically with their type classification.
 *
 * Returns an empty array on failure so the UI can show a graceful fallback
 * rather than crashing during async init.
 */
export async function loadCodexLetters(): Promise<RetroCodexLetter[]> {
  try {
    const codex = getCodex() as Codex;
    const allData = await codex.getAllPictographData();
    return Object.entries(allData)
      .filter(([_, data]) => data?.letter != null)
      .map(([letterKey, data]) => {
        const letter = data!.letter as Letter;
        let letterType: LetterType;
        let typeNumber = 0;
        try {
          letterType = getLetterType(letter);
          typeNumber = parseInt(letterType.replace("Type", ""), 10);
        } catch {
          // Unknown letter - skip clean type derivation
          letterType = "Type?" as LetterType;
        }
        return {
          letter: letterKey,
          type: letterType,
          typeNumber,
          description: `Letter ${letterKey} - ${letterType}`,
        };
      })
      .sort((a, b) => a.letter.localeCompare(b.letter));
  } catch {
    return [];
  }
}
