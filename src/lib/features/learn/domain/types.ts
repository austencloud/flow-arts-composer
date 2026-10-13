/**
 * Type definitions for the Learn module's progressive concept system
 */

/**
 * Category groupings for concepts
 */
export type ConceptCategory =
  | "foundation"
  | "letters"
  | "combinations"
  | "advanced";

/**
 * Status of a concept in the user's learning journey
 */
export type ConceptStatus =
  | "locked" // Prerequisites not met
  | "available" // Unlocked and ready to learn
  | "in-progress" // User has started but not completed
  | "completed"; // User has mastered this concept

/**
 * A learnable concept in the TKA curriculum
 */
export interface LearnConcept {
  /** Unique identifier */
  id: string;

  /** Order in the overall curriculum (1-28) */
  order: number;

  /** Category this concept belongs to */
  category: ConceptCategory;

  /** Full display name */
  name: string;

  /** Short name for compact displays */
  shortName: string;

  /** Brief description of what you'll learn */
  description: string;

  /** Icon/emoji to represent this concept */
  icon: string;

  /** PDF page numbers for this concept (from Level 1.pdf) */
  pdfPages: number[];

  /** Concept IDs that must be completed before this one unlocks */
  prerequisites: string[];

  /** Estimated time to complete in minutes */
  estimatedMinutes: number;

  /** Key learning points */
  concepts: string[];
}

/**
 * User's progress on a specific concept
 */
export interface ConceptProgress {
  /** Concept ID */
  conceptId: string;

  /** Current status */
  status: ConceptStatus;

  /** Percentage complete (0-100) */
  percentComplete: number;

  /** Number of practice questions answered correctly */
  correctAnswers: number;

  /** Number of practice questions answered incorrectly */
  incorrectAnswers: number;

  /** Total practice attempts */
  totalAttempts: number;

  /** Accuracy percentage */
  accuracy: number;

  /** Current streak of correct answers */
  currentStreak: number;

  /** Best streak achieved */
  bestStreak: number;

  /** When the concept was started */
  startedAt?: Date;

  /** When the concept was completed */
  completedAt?: Date;

  /** Last practice date for spaced repetition */
  lastPracticedAt?: Date;

  /** Next recommended practice date */
  nextPracticeAt?: Date;

  /** Time spent on this concept in seconds */
  timeSpentSeconds: number;

  /** Last change to this lesson's progress, used for cross-device merging. */
  updatedAt?: Date;
}

/**
 * Overall user progress across all concepts
 */
export interface LearningProgress {
  /** User ID */
  userId?: string;

  /** Progress by concept ID */
  concepts: Map<string, ConceptProgress>;

  /** IDs of completed concepts */
  completedConcepts: Set<string>;

  /** Currently active concept */
  currentConceptId?: string;

  /** When the current lesson was last opened. */
  currentConceptVisitedAt?: Date;

  /** Progress before this reset belongs to a previous learning history. */
  resetAt?: Date;

  /** Overall completion percentage */
  overallProgress: number;

  /** Total correct answers across all concepts */
  totalCorrect: number;

  /** Total time spent learning in seconds */
  totalTimeSpent: number;

  /** Achievements/badges earned */
  badges: string[];

  /** Last updated timestamp */
  lastUpdated: Date;
}

/**
 * View mode within a concept detail screen
 */
export type ConceptDetailView = "learn" | "practice" | "stats";

/**
 * Navigation mode for concept experiences
 * - "step": Traditional step-by-step navigation (one page at a time)
 * - "scroll": All pages displayed vertically for scrolling (review mode)
 */
export type ExperienceViewMode = "step" | "scroll";

/**
 * Statistics for displaying user achievements
 */
export interface ConceptStats {
  /** Total concepts completed */
  conceptsCompleted: number;

  /** Total concepts available */
  totalConcepts: number;

  /** Current learning streak in days */
  learningStreak: number;

  /** Total practice questions answered */
  totalQuestions: number;

  /** Overall accuracy percentage */
  overallAccuracy: number;

  /** Total time spent learning (formatted string) */
  totalTime: string;

  /** Recently completed concepts */
  recentCompletions: string[];
}

/**
 * Practice question for a specific concept
 */
export interface ConceptPracticeQuestion {
  /** Question ID */
  id: string;

  /** Associated concept */
  conceptId: string;

  /** Question type */
  type:
    | "pictograph-to-letter"
    | "letter-to-pictograph"
    | "identification"
    | "sequencing";

  /** Question prompt */
  prompt: string;

  /** Correct answer */
  correctAnswer: string;

  /** Incorrect options */
  incorrectOptions: string[];

  /** Explanation shown after answering */
  explanation?: string;

  /** Difficulty level (1-3) */
  difficulty: number;
}

/**
 * Configuration for the Learn module
 */
export interface LearnModuleConfig {
  /** Enable spaced repetition */
  spacedRepetitionEnabled: boolean;

  /** Days between spaced repetition reviews */
  reviewIntervalDays: number[];

  /** Minimum accuracy to consider concept "mastered" */
  masteryThreshold: number;

  /** Number of correct answers needed to complete a concept */
  completionRequirement: number;

  /** Enable achievements/badges */
  achievementsEnabled: boolean;

  /** Enable progress animations */
  animationsEnabled: boolean;
}
