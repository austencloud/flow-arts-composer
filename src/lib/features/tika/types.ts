/**
 * TIKA Module Types
 *
 * Shared type definitions for the TIKA AI assistant components.
 */

/**
 * Available AI model option for the model switcher
 */
export interface ModelOption {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  color: string;
  description: string;
}

/**
 * Represents a tool call made by the LLM
 */
export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result: unknown;
}

/**
 * Motion details for a letter's left or right prop
 */
export interface MotionData {
  motionType: string;
  startLocation: string;
  endLocation: string;
  rotationDirection: string;
}

/**
 * Letter-specific context data
 */
export interface LetterContext {
  letter: string;
  type: number;
  typeName: string;
  startPlacement: string;
  endPlacement: string;
  leftMotion: MotionData;
  rightMotion: MotionData;
}

/**
 * Term definition context data
 */
export interface TermContext {
  term: string;
  definition: string;
  examples: string[];
  relatedTerms: string[];
}

/**
 * Letter comparison context data
 */
export interface ComparisonContext {
  letter1: string;
  letter2: string;
  letter1Data: {
    letter: string;
    type: number;
    typeName: string;
    leftMotion: string;
    rightMotion: string;
  };
  letter2Data: {
    letter: string;
    type: number;
    typeName: string;
    leftMotion: string;
    rightMotion: string;
  };
}

/**
 * Type list context data (for showing letter type galleries)
 */
export interface TypeListContext {
  typeNumber: number;
  typeName: string;
  description: string;
  exampleLetters: string[];
  allLetters: string[];
  motionPattern: {
    leftMotion: string;
    rightMotion: string;
  };
  rotationPattern?: {
    description: string;
    groups: Array<{
      letters: string;
      pattern: string;
    }>;
    note?: string;
    uvExplanation?: string;
  };
}

/**
 * Position examples context data (visual examples for a position)
 */
export interface PositionExamplesContext {
  position: string;
  definition: string;
  examples: Array<{
    letter: string;
    variation: number;
    startPlacement: string;
    endPlacement: string;
  }>;
}

/**
 * Motion examples context data (visual examples for a motion type)
 */
export interface MotionExamplesContext {
  motionType: string;
  definition: string;
  examples: Array<{
    letter: string;
    variation: number;
    leftMotion: string;
    rightMotion: string;
  }>;
}

/**
 * Term with visual examples context data
 */
export interface TermWithVisualsContext {
  term: string;
  definition: string;
  examples: Array<{
    letter: string;
    variation: number;
  }>;
}

/**
 * Context data returned by the TIKA API
 */
export interface ContextData {
  type:
    | "letter"
    | "term"
    | "comparison"
    | "list"
    | "typeList"
    | "positionExamples"
    | "motionExamples"
    | "termWithVisuals"
    | null;
  letter?: LetterContext;
  term?: TermContext;
  comparison?: ComparisonContext;
  typeList?: TypeListContext;
  positionExamples?: PositionExamplesContext;
  motionExamples?: MotionExamplesContext;
  termWithVisuals?: TermWithVisualsContext;
}

/**
 * A single conversation item (question + response)
 */
export interface ConversationItem {
  question: string;
  response: {
    explanation: string;
    showPictograph: boolean;
    pictographLetter?: string;
    pictographVariation?: number;
    latencyMs: number;
    toolsCalled: ToolCall[];
    contextData?: ContextData;
  };
  timestamp: Date;
}

/**
 * Inline pictograph reference (single letter)
 */
export interface InlinePictograph {
  type: "inline-pictograph";
  letter: string;
  variation?: number;
  label?: string;
  /**
   * Grid mode for looking up variations.
   * "diamond" uses cardinal directions (N/S/E/W), "box" uses diagonals (NE/SW/NW/SE).
   * Defaults to "diamond" if not specified.
   */
  gridMode?: "diamond" | "box";
  /** Override prop type (e.g., "hand" for position-first teaching) */
  propType?: string;
}

/**
 * Render context for position-first teaching.
 * Used to customize how pictographs are rendered for educational purposes.
 */
export interface GalleryRenderContext {
  /** Prop type to use (e.g., 'hand' for position teaching) */
  propType?: string;
  /** Hide motion arrows (for teaching positions without motion) */
  hideArrows?: boolean;
  /** Purpose of this rendering (for debugging/analytics) */
  purpose?: "position-teaching" | "motion-teaching" | "general";
}

/**
 * Inline gallery (multiple pictographs)
 */
export interface InlineGallery {
  type: "inline-gallery";
  items: Array<{ letter: string; variation?: number; label?: string }>;
  layout: "row" | "grid";
  caption?: string;
  /**
   * Grid mode for looking up variations.
   * "diamond" uses cardinal directions (N/S/E/W), "box" uses diagonals (NE/SW/NW/SE).
   * Defaults to "diamond" if not specified.
   */
  gridMode?: "diamond" | "box";
  /**
   * Render context for position-first teaching.
   * When present, overrides default rendering to show hands instead of staffs,
   * hide arrows, etc. - used to teach positions before introducing orientations.
   */
  renderContext?: GalleryRenderContext;
}

/**
 * Inline sequence player (animated sequence)
 * Only needs the word - full sequence data is generated client-side
 * using WordSequenceGenerator to get proper SequenceData
 */
export interface InlineSequencePlayer {
  type: "inline-sequence-player";
  word: string;
  showControls?: boolean;
}

/**
 * Step information for a sequence step grid
 */
export interface StepGridItem {
  stepNumber: number;
  letter: string;
  variation: number;
  label: string; // "Start" | "Step 1" | "Step 2"...
  startPlacement: string;
  endPlacement: string;
}

/**
 * Inline step grid (static breakdown of a sequence)
 * Shows each beat as an individual pictograph with step labels
 */
export interface InlineStepGrid {
  type: "inline-step-grid";
  word: string;
  steps: StepGridItem[];
  caption?: string;
  /**
   * Grid mode for looking up variations.
   * "diamond" uses cardinal directions (N/S/E/W), "box" uses diagonals (NE/SW/NW/SE).
   * Defaults to "diamond" if not specified.
   */
  gridMode?: "diamond" | "box";
}

/**
 * Text-based quiz option
 */
export interface TextQuizOption {
  id: string;
  type: "text";
  text: string;
  correct: boolean;
}

/**
 * Pictograph-based quiz option (clickable letter)
 */
export interface PictographQuizOption {
  id: string;
  type: "pictograph";
  letter: string;
  variation?: number;
  correct: boolean;
}

/**
 * Motion pattern quiz option (color-coded motion combo)
 */
export interface MotionPatternQuizOption {
  id: string;
  type: "motion-pattern";
  leftMotion: string;
  rightMotion: string;
  correct: boolean;
}

/**
 * Union of all quiz option types
 */
export type QuizOption =
  | TextQuizOption
  | PictographQuizOption
  | MotionPatternQuizOption;

/**
 * Quiz display modes
 * - text: Traditional text buttons
 * - pictograph-grid: Clickable pictograph gallery
 * - motion-chips: Color-coded motion pattern chips
 */
export type QuizDisplayMode = "text" | "pictograph-grid" | "motion-chips";

/**
 * Inline quiz for interactive knowledge testing
 * Supports visual quizzes with pictographs, motion patterns, and text
 */
export interface InlineQuiz {
  type: "inline-quiz";
  id: string;

  // Question configuration
  quizType:
    | "pick-letter"
    | "pick-type"
    | "odd-one-out"
    | "match-motion"
    | "true-false";
  displayMode: QuizDisplayMode;
  question: string;
  options: QuizOption[];

  // Optional visual context (shown above the question)
  pictograph?: { letter: string; variation?: number; propType?: string };

  // Feedback content
  correctFeedback: string;
  incorrectFeedback: string;
  explanation?: string;

  // Metadata for future adaptive learning
  difficulty: "easy" | "medium" | "hard";
  topic: string;

  // Multi-question session: additional quizzes to auto-advance through
  followUpQuizzes?: InlineQuiz[];
}
