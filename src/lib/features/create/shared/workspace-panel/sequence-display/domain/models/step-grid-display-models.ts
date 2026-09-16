/**
 * Step Grid Display Models
 *
 * Domain models for step grid display animations and transitions.
 * These handle how steps appear/disappear in the Create module grid,
 * NOT playback animations in the Animator tab.
 */

/**
 * Responsive grid layout configuration
 */
export interface GridLayout {
  /** Number of rows in the grid */
  rows: number;
  /** Number of columns for steps (excludes start placement column) */
  columns: number;
  /** Total columns including start placement */
  totalColumns: number;
  /** Size of each grid cell in pixels */
  cellSize: number;
  /** Maximum columns allowed for current viewport */
  maxColumns: number;
}

/**
 * Animation mode for sequence display
 */
export type AnimationMode = "sequential" | "all-at-once";

/**
 * State of display animations
 */
export interface DisplayAnimationState {
  /** Index of newly added beat (for single beat animation) */
  newlyAddedStepIndex: number | null;
  /** Whether all steps should animate simultaneously */
  shouldAnimateAllSteps: boolean;
  /** Whether start placement should animate */
  shouldAnimateStartPlacement: boolean;
  /** Current animation mode */
  isSequentialMode: boolean;
  /** Set of beat indices that should currently animate */
  stepsToAnimate: Set<number>;
  /** Flag indicating animation preparation (steps rendered invisible) */
  isPreparingFullAnimation: boolean;
  /** Flag for sequential mode waiting state (steps hidden until their turn) */
  isWaitingForSequentialAnimation: boolean;
  /** Flag for fade-out animation before sequence generation */
  isClearingForGeneration: boolean;
}

/**
 * Event detail for sequence animation preparation
 */
export interface PrepareSequenceAnimationEvent {
  isSequential: boolean;
  stepCount: number;
}

/**
 * Scroll behavior configuration
 */
export interface ScrollConfig {
  /** Whether vertical scrollbar is present */
  hasVerticalScrollbar: boolean;
  /** Whether to auto-scroll on beat addition */
  autoScrollEnabled: boolean;
}

/**
 * Grid sizing constraints
 */
export interface GridSizingConstraints {
  /** Minimum cell size in pixels */
  minCellSize: number;
  /** Maximum cell size in pixels */
  maxCellSize: number;
  /** Container width padding percentage (0-1) */
  widthPaddingRatio: number;
  /** Container height padding percentage (0-1) */
  heightPaddingRatio: number;
  /** Row count threshold for height-based sizing */
  heightSizingRowThreshold: number;
}

/**
 * Default grid sizing constraints
 */
export const DEFAULT_GRID_SIZING: GridSizingConstraints = {
  minCellSize: 50,
  maxCellSize: 200,
  widthPaddingRatio: 0.9,
  heightPaddingRatio: 0.9,
  heightSizingRowThreshold: 4,
};

/**
 * Animation timing configuration
 */
export interface AnimationTiming {
  /**
   * Gap between consecutive diagonal bands of the generation reveal (ms).
   *
   * The wave crosses the grid one band at a time, so the reveal's total length
   * is this times the number of bands — which grows with the grid's diagonal,
   * not with the step count. Sixteen steps take one band longer than eight.
   */
  waveBandDelay: number;
  /** Duration of beat entrance animation (ms) */
  entranceDuration: number;
  /** Duration of beat exit animation (ms) */
  exitDuration: number;
  /** Duration of clear sequence fade-out (ms) */
  clearDuration: number;
  /** Cleanup delay after animation completes (ms) */
  cleanupDelay: number;
}

/**
 * Default animation timing values
 */
export const DEFAULT_ANIMATION_TIMING: AnimationTiming = {
  waveBandDelay: 55,
  entranceDuration: 380,
  exitDuration: 500,
  clearDuration: 300,
  cleanupDelay: 600,
};
