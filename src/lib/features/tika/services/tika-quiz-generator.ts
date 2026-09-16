/**
 * TikaQuizGenerator - Generates interactive TKA quizzes
 *
 * Creates visual-first quizzes using pictograph grids,
 * motion pattern chips, and text-based options.
 */

import {
  TYPE_DEFINITIONS,
  PLACEMENT_DEFINITIONS,
  MOTION_TYPE_DEFINITIONS,
  LETTER_TYPES,
  LETTER_TO_TYPE,
} from "@tka/domain";
import type { InlineQuiz } from "../types";

export type QuizDifficulty = "easy" | "medium" | "hard";
export interface TextOption {
  id: string;
  type: "text";
  text: string;
  correct: boolean;
}
export interface PictographOption {
  id: string;
  type: "pictograph";
  letter: string;
  variation?: number;
  correct: boolean;
}
export interface MotionPatternOption {
  id: string;
  type: "motion-pattern";
  leftMotion: string;
  rightMotion: string;
  correct: boolean;
}
export interface QuizResult {
  explanation: string;
  inlineQuiz: InlineQuiz;
}

interface PlacementQuestion {
  question: string;
  correctPlacement: "alpha" | "beta" | "gamma";
  correctFeedback: string;
  incorrectFeedback: string;
  difficulty: QuizDifficulty;
  /** If true, show the Type 6 letter for this placement as a pictograph stimulus */
  showPictograph?: boolean;
}

// Type 6 (Static) letters - pure placement, no motion arrows.
// Each has multiple variations at different grid locations.
const ALPHA_STIMULUS = "α"; // static at alpha placements (4 variations)
const BETA_STIMULUS = "β"; // static at beta placements (4 variations)
const GAMMA_STIMULUS = "γ"; // static at gamma placements (8 variations)

/** Map placement → Type 6 letter + variation count for stimulus rendering */
const PLACEMENT_STIMULUS: Record<
  string,
  { letter: string; variationCount: number }
> = {
  alpha: { letter: ALPHA_STIMULUS, variationCount: 4 },
  beta: { letter: BETA_STIMULUS, variationCount: 4 },
  gamma: { letter: GAMMA_STIMULUS, variationCount: 8 },
};

const PLACEMENT_QUESTION_POOL: PlacementQuestion[] = [
  {
    question: "What placement is this?",
    correctPlacement: "alpha",
    correctFeedback: "Alpha (α) - hands at opposite grid points.",
    incorrectFeedback:
      "The hands are at opposite points on the grid. That's alpha (α).",
    difficulty: "easy",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "beta",
    correctFeedback: "Beta (β) - both hands at the same grid point.",
    incorrectFeedback:
      "Both hands are at the same grid point. That's beta (β).",
    difficulty: "easy",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "gamma",
    correctFeedback:
      "Gamma (γ) - hands at adjacent points, forming a right angle.",
    incorrectFeedback:
      "The hands form a right angle on the grid. That's gamma (γ).",
    difficulty: "easy",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "alpha",
    correctFeedback: "Alpha - opposite points.",
    incorrectFeedback: "Hands at opposite grid points = alpha.",
    difficulty: "medium",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "beta",
    correctFeedback: "Beta - same point.",
    incorrectFeedback: "Hands at the same grid point = beta.",
    difficulty: "medium",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "gamma",
    correctFeedback: "Gamma - right angle.",
    incorrectFeedback: "Hands at a right angle = gamma.",
    difficulty: "medium",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "alpha",
    correctFeedback: "Alpha - opposite points.",
    incorrectFeedback: "Hands at opposite points = alpha.",
    difficulty: "medium",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "beta",
    correctFeedback: "Beta - same point.",
    incorrectFeedback: "Hands at the same point = beta.",
    difficulty: "medium",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "gamma",
    correctFeedback: "Gamma - right angle.",
    incorrectFeedback: "Hands at a right angle = gamma.",
    difficulty: "medium",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "alpha",
    correctFeedback: "Alpha. VTG calls this 'split'.",
    incorrectFeedback: "Hands at opposite points = alpha (VTG 'split').",
    difficulty: "hard",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "beta",
    correctFeedback: "Beta. VTG calls this 'together'.",
    incorrectFeedback: "Hands at the same point = beta (VTG 'together').",
    difficulty: "hard",
    showPictograph: true,
  },
  {
    question: "What placement is this?",
    correctPlacement: "gamma",
    correctFeedback:
      "Gamma. The asymmetric placement - leader/follower matters here.",
    incorrectFeedback:
      "Hands at a right angle = gamma. It's the only asymmetric placement.",
    difficulty: "hard",
    showPictograph: true,
  },
  {
    question: "VTG calls this 'together' or 'tog'. What TKA placement is it?",
    correctPlacement: "beta",
    correctFeedback: "VTG 'together' = TKA beta. Hands at the same point.",
    incorrectFeedback:
      "VTG 'together' maps to beta - both hands at the same grid point.",
    difficulty: "hard",
  },
  {
    question: "VTG calls this 'split'. What TKA placement is it?",
    correctPlacement: "alpha",
    correctFeedback: "VTG 'split' = TKA alpha. Hands at opposite points.",
    incorrectFeedback:
      "VTG 'split' maps to alpha - hands at opposite grid points.",
    difficulty: "hard",
  },
  {
    question:
      "Which placement is asymmetric - swapping hands produces a different configuration?",
    correctPlacement: "gamma",
    correctFeedback: "Gamma is asymmetric. One hand leads, the other follows.",
    incorrectFeedback:
      "Gamma is the asymmetric placement - the leader/follower distinction matters.",
    difficulty: "hard",
  },
];

interface MotionQuestion {
  question: string;
  correctMotion: "shift" | "dash" | "static";
  correctFeedback: string;
  incorrectFeedback: string;
  difficulty: QuizDifficulty;
}

const MOTION_QUESTION_POOL: MotionQuestion[] = [
  {
    question: "Which motion keeps the hand at its current grid point?",
    correctMotion: "static",
    correctFeedback: "Static - the hand stays in place.",
    incorrectFeedback: "No hand movement = static.",
    difficulty: "easy",
  },
  {
    question: "Which motion moves the hand to an adjacent grid point?",
    correctMotion: "shift",
    correctFeedback: "Shift - hand moves to a neighboring point.",
    incorrectFeedback: "Moving to an adjacent point is a shift.",
    difficulty: "easy",
  },
  {
    question: "Which motion moves the hand to the opposite grid point?",
    correctMotion: "dash",
    correctFeedback: "Dash - hand crosses straight to the opposite point.",
    incorrectFeedback: "Moving to the opposite point is a dash.",
    difficulty: "easy",
  },
  {
    question: "A hand at North moves to East. What motion is this?",
    correctMotion: "shift",
    correctFeedback: "North to East is an adjacent point - shift.",
    incorrectFeedback:
      "North to East is one step around the grid - that's a shift.",
    difficulty: "medium",
  },
  {
    question: "A hand at North moves to South. What motion is this?",
    correctMotion: "dash",
    correctFeedback: "North to South is the opposite point - dash.",
    incorrectFeedback: "North to South crosses the grid - that's a dash.",
    difficulty: "medium",
  },
  {
    question: "A hand stays at East while the prop rotates. What motion is this?",
    correctMotion: "static",
    correctFeedback: "Hand stays put - static. The prop can still rotate.",
    incorrectFeedback:
      "If the hand doesn't move, that's static (the prop can still rotate).",
    difficulty: "medium",
  },
  {
    question: "A hand at West moves to North. What motion is this?",
    correctMotion: "shift",
    correctFeedback: "West to North is adjacent - shift.",
    incorrectFeedback: "West to North is one step - that's a shift.",
    difficulty: "medium",
  },
  {
    question: "A hand at East moves to West. What motion is this?",
    correctMotion: "dash",
    correctFeedback: "East to West is the opposite point - dash.",
    incorrectFeedback: "East to West crosses the grid - that's a dash.",
    difficulty: "medium",
  },
  {
    question: "A hand at South moves to North. What motion is this?",
    correctMotion: "dash",
    correctFeedback: "South to North is the opposite point - dash.",
    incorrectFeedback: "South to North crosses the grid - that's a dash.",
    difficulty: "medium",
  },
  {
    question: "A hand at NE moves to SE. What motion is this?",
    correctMotion: "shift",
    correctFeedback: "NE to SE is adjacent - shift.",
    incorrectFeedback: "NE to SE is one step - that's a shift.",
    difficulty: "medium",
  },
  {
    question: "Which is the only motion where pro/anti rotation applies?",
    correctMotion: "shift",
    correctFeedback:
      "Only shift has a curved path, enabling pro/anti/float distinctions.",
    incorrectFeedback:
      "Pro and anti only apply to shift - it's the only curved-path motion.",
    difficulty: "hard",
  },
  {
    question:
      "Which motion follows a straight line through the center of the grid?",
    correctMotion: "dash",
    correctFeedback: "Dash goes straight to the opposite point, through center.",
    incorrectFeedback: "Dash moves in a straight line to the opposite point.",
    difficulty: "hard",
  },
  {
    question: "Which motion has exactly one state at 0 turns (no direction)?",
    correctMotion: "dash",
    correctFeedback:
      "At 0 turns, dash has no direction distinction - just 1 state.",
    incorrectFeedback: "Dash at 0 turns is directionless - only 1 state, not 2.",
    difficulty: "hard",
  },
];

export class TikaQuizGenerator {
  private quizCounter = 0;

  generateQuiz(
    topic: string,
    quizType: string = "multiple-choice",
    difficulty: QuizDifficulty = "medium"
  ): QuizResult {
    const normalizedTopic = topic.toLowerCase().trim();

    // Category: "placements" / "placement" (or the older "positions") → quiz on a random foundation placement
    if (/^(positions?|placements?)$/.test(normalizedTopic)) {
      const positions = ["alpha", "beta", "gamma"] as const;
      const position = positions[Math.floor(Math.random() * positions.length)]!;
      return this.generatePlacementQuiz(position, quizType, difficulty);
    }

    // Category: "motions" / "motion" / "motion types" → quiz on a random motion
    if (/^(?:motions?|motion\s*types?)$/.test(normalizedTopic)) {
      const motions = ["shift", "dash", "static"] as const;
      const motion = motions[Math.floor(Math.random() * motions.length)]!;
      return this.generateMotionQuiz(motion, quizType, difficulty);
    }

    // Determine quiz type based on topic
    if (normalizedTopic.startsWith("type") || /^[1-6]$/.test(normalizedTopic)) {
      const typeNum =
        parseInt(normalizedTopic.replace("type", "")) ||
        parseInt(normalizedTopic);
      return this.generateTypeQuiz(typeNum, quizType, difficulty);
    }

    if (LETTER_TO_TYPE[topic.toUpperCase()]) {
      return this.generateLetterQuiz(topic.toUpperCase(), quizType, difficulty);
    }

    if (
      PLACEMENT_DEFINITIONS[
        normalizedTopic as keyof typeof PLACEMENT_DEFINITIONS
      ]
    ) {
      return this.generatePlacementQuiz(normalizedTopic, quizType, difficulty);
    }

    if (MOTION_TYPE_DEFINITIONS[normalizedTopic]) {
      return this.generateMotionQuiz(normalizedTopic, quizType, difficulty);
    }

    return this.generateGeneralQuiz(quizType, difficulty);
  }

  generateTypeQuiz(
    typeNum: number,
    _quizType: string,
    difficulty: QuizDifficulty
  ): QuizResult {
    const quizId = this.generateQuizId();
    const typeDef = TYPE_DEFINITIONS[typeNum];

    if (!typeDef) {
      return this.generateGeneralQuiz("pick-letter", difficulty);
    }

    const correctLetters = this.getLettersFromType(typeNum, 1);
    const correctLetter = correctLetters[0];
    if (!correctLetter) {
      return this.generateGeneralQuiz("pick-letter", difficulty);
    }

    const distractorLetters = this.getLettersNotFromType(typeNum, 3);

    const options: PictographOption[] = this.shuffleArray([
      {
        id: "opt-correct",
        type: "pictograph",
        letter: correctLetter,
        correct: true,
      },
      {
        id: "opt-1",
        type: "pictograph",
        letter: distractorLetters[0] || "W",
        correct: false,
      },
      {
        id: "opt-2",
        type: "pictograph",
        letter: distractorLetters[1] || "Φ",
        correct: false,
      },
      {
        id: "opt-3",
        type: "pictograph",
        letter: distractorLetters[2] || "α",
        correct: false,
      },
    ]);

    return {
      explanation: `Tap the Type ${typeNum} (${typeDef.name}) letter:`,
      inlineQuiz: {
        type: "inline-quiz",
        id: quizId,
        quizType: "pick-letter",
        displayMode: "pictograph-grid",
        question: `Which letter is Type ${typeNum} (${typeDef.name})?`,
        options,
        correctFeedback: `Yes! ${correctLetter} is a Type ${typeNum} letter. ${typeDef.description}.`,
        incorrectFeedback: `Not quite. The correct answer was ${correctLetter}.`,
        explanation: typeDef.description,
        difficulty,
        topic: `type${typeNum}`,
      },
    };
  }

  generateLetterQuiz(
    letter: string,
    _quizType: string,
    difficulty: QuizDifficulty
  ): QuizResult {
    const quizId = this.generateQuizId();
    const typeInfo = LETTER_TO_TYPE[letter];
    const typeNum = parseInt(typeInfo?.type || "1");

    const sameTypeDistractors = this.getLettersFromType(typeNum, 2).filter(
      (l) => l !== letter
    );
    const otherTypeDistractors = this.getLettersNotFromType(typeNum, 2);
    const distractors = this.shuffleArray([
      ...sameTypeDistractors,
      ...otherTypeDistractors,
    ]).slice(0, 3);

    const options: PictographOption[] = this.shuffleArray([
      { id: "opt-correct", type: "pictograph", letter: letter, correct: true },
      {
        id: "opt-1",
        type: "pictograph",
        letter: distractors[0] || "B",
        correct: false,
      },
      {
        id: "opt-2",
        type: "pictograph",
        letter: distractors[1] || "C",
        correct: false,
      },
      {
        id: "opt-3",
        type: "pictograph",
        letter: distractors[2] || "W",
        correct: false,
      },
    ]);

    return {
      explanation: `Can you find letter ${letter}?`,
      inlineQuiz: {
        type: "inline-quiz",
        id: quizId,
        quizType: "pick-letter",
        displayMode: "pictograph-grid",
        question: `Tap the letter ${letter}:`,
        options,
        correctFeedback: `Correct! That's the letter ${letter}.`,
        incorrectFeedback: `Not quite. The correct answer was ${letter}.`,
        explanation: `${letter} is a Type ${typeNum} letter.`,
        difficulty,
        topic: letter,
      },
    };
  }

  generateGeneralQuiz(
    _quizType: string,
    difficulty: QuizDifficulty
  ): QuizResult {
    const quizTypes = ["pick-letter", "odd-one-out", "match-motion"];
    const selectedType =
      quizTypes[Math.floor(Math.random() * quizTypes.length)];
    const randomType = Math.floor(Math.random() * 6) + 1;

    if (selectedType === "odd-one-out") {
      return this.generateOddOneOutQuiz(randomType, difficulty);
    }

    if (selectedType === "match-motion") {
      return this.generateMotionMatchQuiz(randomType, difficulty);
    }

    return this.generateTypeQuiz(randomType, "pick-letter", difficulty);
  }

  private generateOddOneOutQuiz(
    typeNum: number,
    difficulty: QuizDifficulty
  ): QuizResult {
    const quizId = this.generateQuizId();
    const typeDef = TYPE_DEFINITIONS[typeNum];

    if (!typeDef) {
      return this.generateTypeQuiz(1, "pick-letter", difficulty);
    }

    const sameTypeLetters = this.getLettersFromType(typeNum, 3);
    if (sameTypeLetters.length < 3) {
      return this.generateTypeQuiz(typeNum, "pick-letter", difficulty);
    }

    const oddLetters = this.getLettersNotFromType(typeNum, 1);
    const oddLetter = oddLetters[0];
    if (!oddLetter) {
      return this.generateTypeQuiz(typeNum, "pick-letter", difficulty);
    }

    const oddTypeInfo = LETTER_TO_TYPE[oddLetter];
    const oddTypeName =
      TYPE_DEFINITIONS[parseInt(oddTypeInfo?.type || "1")]?.name || "unknown";

    const options: PictographOption[] = this.shuffleArray([
      { id: "opt-odd", type: "pictograph", letter: oddLetter, correct: true },
      {
        id: "opt-1",
        type: "pictograph",
        letter: sameTypeLetters[0] || "A",
        correct: false,
      },
      {
        id: "opt-2",
        type: "pictograph",
        letter: sameTypeLetters[1] || "B",
        correct: false,
      },
      {
        id: "opt-3",
        type: "pictograph",
        letter: sameTypeLetters[2] || "C",
        correct: false,
      },
    ]);

    return {
      explanation: `Three of these are Type ${typeNum}. Find the odd one out:`,
      inlineQuiz: {
        type: "inline-quiz",
        id: quizId,
        quizType: "odd-one-out",
        displayMode: "pictograph-grid",
        question: `Which letter is NOT Type ${typeNum} (${typeDef.name})?`,
        options,
        correctFeedback: `Correct! ${oddLetter} is Type ${oddTypeInfo?.type} (${oddTypeName}), not Type ${typeNum}.`,
        incorrectFeedback: `Not quite. ${oddLetter} was the odd one out - it's Type ${oddTypeInfo?.type} (${oddTypeName}).`,
        explanation: `The other three letters are all Type ${typeNum} (${typeDef.name}).`,
        difficulty,
        topic: `type${typeNum}`,
      },
    };
  }

  private generateMotionMatchQuiz(
    typeNum: number,
    difficulty: QuizDifficulty
  ): QuizResult {
    const quizId = this.generateQuizId();
    const typeDef = TYPE_DEFINITIONS[typeNum];

    if (!typeDef) {
      return this.generateTypeQuiz(1, "pick-letter", difficulty);
    }

    const allPatterns: MotionPatternOption[] = [];

    allPatterns.push({
      id: "opt-correct",
      type: "motion-pattern",
      leftMotion: typeDef.motionPattern.left,
      rightMotion: typeDef.motionPattern.right,
      correct: true,
    });

    for (let t = 1; t <= 6; t++) {
      if (t === typeNum) continue;
      const otherDef = TYPE_DEFINITIONS[t];
      if (!otherDef) continue;

      if (
        otherDef.motionPattern.left === typeDef.motionPattern.left &&
        otherDef.motionPattern.right === typeDef.motionPattern.right
      )
        continue;

      allPatterns.push({
        id: `opt-${t}`,
        type: "motion-pattern",
        leftMotion: otherDef.motionPattern.left,
        rightMotion: otherDef.motionPattern.right,
        correct: false,
      });

      if (allPatterns.length >= 4) break;
    }

    while (allPatterns.length < 4) {
      allPatterns.push({
        id: `opt-extra-${allPatterns.length}`,
        type: "motion-pattern",
        leftMotion: "static",
        rightMotion: "dash",
        correct: false,
      });
    }

    const options = this.shuffleArray(allPatterns.slice(0, 4));

    return {
      explanation: `Which motion combination defines Type ${typeNum}?`,
      inlineQuiz: {
        type: "inline-quiz",
        id: quizId,
        quizType: "match-motion",
        displayMode: "motion-chips",
        question: `What motion pattern do Type ${typeNum} (${typeDef.name}) letters have?`,
        options,
        correctFeedback: `Correct! Type ${typeNum} has ${typeDef.motionPattern.left} in the left hand + ${typeDef.motionPattern.right} in the right hand.`,
        incorrectFeedback: `Not quite. Type ${typeNum} has ${typeDef.motionPattern.left} in the left hand + ${typeDef.motionPattern.right} in the right hand.`,
        explanation: typeDef.description,
        difficulty,
        topic: `type${typeNum}`,
      },
    };
  }

  private generatePlacementQuiz(
    position: string,
    _quizType: string,
    difficulty: QuizDifficulty
  ): QuizResult {
    const primary = this.generateSinglePlacementQuiz(position, difficulty);
    const followUps = this.generatePlacementQuizBatch(difficulty, 4, position);
    primary.inlineQuiz.followUpQuizzes = followUps;

    return primary;
  }

  private generatePlacementQuizBatch(
    difficulty: QuizDifficulty,
    count: number,
    excludeFirstPlacement?: string
  ): InlineQuiz[] {
    const positions = ["alpha", "beta", "gamma"] as const;
    const quizzes: InlineQuiz[] = [];
    let lastPosition = excludeFirstPlacement;

    for (let i = 0; i < count; i++) {
      const available = positions.filter((p) => p !== lastPosition);
      const picked = available[Math.floor(Math.random() * available.length)]!;
      lastPosition = picked;

      const result = this.generateSinglePlacementQuiz(picked, difficulty);
      quizzes.push(result.inlineQuiz);
    }

    return quizzes;
  }

  private generateSinglePlacementQuiz(
    position: string,
    difficulty: QuizDifficulty
  ): QuizResult {
    const quizId = this.generateQuizId();

    let pool = PLACEMENT_QUESTION_POOL.filter(
      (q) => q.correctPlacement === position && q.difficulty === difficulty
    );
    if (pool.length === 0) {
      pool = PLACEMENT_QUESTION_POOL.filter(
        (q) => q.correctPlacement === position
      );
    }
    if (pool.length === 0) {
      pool = PLACEMENT_QUESTION_POOL.filter((q) => q.difficulty === difficulty);
    }
    if (pool.length === 0) {
      pool = PLACEMENT_QUESTION_POOL;
    }

    const selected = pool[Math.floor(Math.random() * pool.length)]!;

    let stimulusPictograph:
      | { letter: string; variation?: number; propType?: string }
      | undefined;
    if (selected.showPictograph) {
      const stimulus = PLACEMENT_STIMULUS[selected.correctPlacement];
      if (stimulus) {
        stimulusPictograph = {
          letter: stimulus.letter,
          variation: Math.floor(Math.random() * stimulus.variationCount),
          ...(difficulty !== "hard" && { propType: "hand" }),
        };
      }
    }

    const labels = {
      alpha: "Alpha (α)",
      beta: "Beta (β)",
      gamma: "Gamma (γ)",
    };

    const options: TextOption[] = this.shuffleArray([
      {
        id: "opt-alpha",
        type: "text" as const,
        text: labels.alpha,
        correct: selected.correctPlacement === "alpha",
      },
      {
        id: "opt-beta",
        type: "text" as const,
        text: labels.beta,
        correct: selected.correctPlacement === "beta",
      },
      {
        id: "opt-gamma",
        type: "text" as const,
        text: labels.gamma,
        correct: selected.correctPlacement === "gamma",
      },
    ]);

    const positionDef =
      PLACEMENT_DEFINITIONS[
        selected.correctPlacement as keyof typeof PLACEMENT_DEFINITIONS
      ];

    return {
      explanation: selected.question,
      inlineQuiz: {
        type: "inline-quiz",
        id: quizId,
        quizType: "pick-type",
        displayMode: "text",
        question: selected.question,
        options,
        pictograph: stimulusPictograph,
        correctFeedback: selected.correctFeedback,
        incorrectFeedback: selected.incorrectFeedback,
        explanation: positionDef?.description || "",
        difficulty,
        topic: `position-${selected.correctPlacement}`,
      },
    };
  }

  private generateMotionQuiz(
    motionType: string,
    _quizType: string,
    difficulty: QuizDifficulty
  ): QuizResult {
    const primary = this.generateSingleMotionQuiz(motionType, difficulty);
    const followUps = this.generateMotionQuizBatch(difficulty, 4, motionType);
    primary.inlineQuiz.followUpQuizzes = followUps;

    return primary;
  }

  private generateMotionQuizBatch(
    difficulty: QuizDifficulty,
    count: number,
    excludeFirstMotion?: string
  ): InlineQuiz[] {
    const motions = ["shift", "dash", "static"] as const;
    const quizzes: InlineQuiz[] = [];
    let lastMotion = excludeFirstMotion;

    for (let i = 0; i < count; i++) {
      const available = motions.filter((m) => m !== lastMotion);
      const picked = available[Math.floor(Math.random() * available.length)]!;
      lastMotion = picked;

      const result = this.generateSingleMotionQuiz(picked, difficulty);
      quizzes.push(result.inlineQuiz);
    }

    return quizzes;
  }

  private generateSingleMotionQuiz(
    motionType: string,
    difficulty: QuizDifficulty
  ): QuizResult {
    const quizId = this.generateQuizId();

    let pool = MOTION_QUESTION_POOL.filter(
      (q) => q.correctMotion === motionType && q.difficulty === difficulty
    );
    if (pool.length === 0) {
      pool = MOTION_QUESTION_POOL.filter((q) => q.correctMotion === motionType);
    }
    if (pool.length === 0) {
      pool = MOTION_QUESTION_POOL.filter((q) => q.difficulty === difficulty);
    }
    if (pool.length === 0) {
      pool = MOTION_QUESTION_POOL;
    }

    const selected = pool[Math.floor(Math.random() * pool.length)]!;

    const labels = {
      shift: "Shift",
      dash: "Dash",
      static: "Static",
    };

    const options: TextOption[] = this.shuffleArray([
      {
        id: "opt-shift",
        type: "text" as const,
        text: labels.shift,
        correct: selected.correctMotion === "shift",
      },
      {
        id: "opt-dash",
        type: "text" as const,
        text: labels.dash,
        correct: selected.correctMotion === "dash",
      },
      {
        id: "opt-static",
        type: "text" as const,
        text: labels.static,
        correct: selected.correctMotion === "static",
      },
    ]);

    return {
      explanation: selected.question,
      inlineQuiz: {
        type: "inline-quiz",
        id: quizId,
        quizType: "pick-type",
        displayMode: "text",
        question: selected.question,
        options,
        correctFeedback: selected.correctFeedback,
        incorrectFeedback: selected.incorrectFeedback,
        explanation:
          MOTION_TYPE_DEFINITIONS[selected.correctMotion]?.description || "",
        difficulty,
        topic: `motion-${selected.correctMotion}`,
      },
    };
  }

  private generateTrueFalseQuiz(
    typeNum: number,
    difficulty: QuizDifficulty
  ): QuizResult {
    const quizId = this.generateQuizId();
    const typeDef = TYPE_DEFINITIONS[typeNum];

    if (!typeDef) {
      const isTrue = Math.random() > 0.5;
      return {
        explanation: `True or false?`,
        inlineQuiz: {
          type: "inline-quiz",
          id: quizId,
          quizType: "true-false",
          displayMode: "text",
          question: isTrue
            ? `Type 1 letters have both hands shifting.`
            : `Type 1 letters have both hands stationary.`,
          options: [
            { id: "opt-true", type: "text", text: "True", correct: isTrue },
            { id: "opt-false", type: "text", text: "False", correct: !isTrue },
          ],
          correctFeedback: `Correct!`,
          incorrectFeedback: `Not quite.`,
          explanation: `Type 1 (Dual-Shift) letters have both hands shifting.`,
          difficulty,
          topic: "general",
        },
      };
    }

    const isTrue = Math.random() > 0.5;
    let statement: string;
    let explanation: string;

    if (isTrue) {
      statement = `Type ${typeNum} (${typeDef.name}) letters have ${typeDef.motionPattern.left} left-hand motion and ${typeDef.motionPattern.right} right-hand motion.`;
      explanation = `This is correct. ${typeDef.description}.`;
    } else {
      const wrongLeft =
        typeDef.motionPattern.left === "shift" ? "dash" : "shift";
      statement = `Type ${typeNum} (${typeDef.name}) letters have ${wrongLeft} left-hand motion and ${typeDef.motionPattern.right} right-hand motion.`;
      explanation = `Type ${typeNum} actually has ${typeDef.motionPattern.left} left-hand motion and ${typeDef.motionPattern.right} right-hand motion.`;
    }

    return {
      explanation: `True or false?`,
      inlineQuiz: {
        type: "inline-quiz",
        id: quizId,
        quizType: "true-false",
        displayMode: "text",
        question: statement,
        options: [
          { id: "opt-true", type: "text", text: "True", correct: isTrue },
          { id: "opt-false", type: "text", text: "False", correct: !isTrue },
        ],
        correctFeedback: isTrue
          ? `Correct!`
          : `Right! That statement was false.`,
        incorrectFeedback: isTrue
          ? `Actually, that statement is true.`
          : `Actually, that statement is false.`,
        explanation,
        difficulty,
        topic: `type${typeNum}`,
      },
    };
  }

  private generateQuizId(): string {
    this.quizCounter++;
    return `quiz-${Date.now()}-${this.quizCounter}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j] as T;
      shuffled[j] = temp as T;
    }
    return shuffled;
  }

  private getLettersFromType(typeNum: number, count: number): string[] {
    const typeInfo = LETTER_TYPES[typeNum.toString()];
    if (!typeInfo) return [];
    return this.shuffleArray(typeInfo.letters as string[]).slice(0, count);
  }

  private getLettersNotFromType(excludeType: number, count: number): string[] {
    const otherTypes = Object.keys(LETTER_TYPES)
      .filter((t) => t !== excludeType.toString())
      .map((t) => parseInt(t));

    const letters: string[] = [];
    for (const typeNum of this.shuffleArray(otherTypes)) {
      const typeLetters = this.getLettersFromType(typeNum, 2);
      letters.push(...typeLetters);
      if (letters.length >= count) break;
    }
    return this.shuffleArray(letters).slice(0, count);
  }
}
