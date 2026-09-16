
/**
 * Aspect Layout Planner Service Interface
 *
 * Determines the optimal row arrangement for grouped sections
 * based on container aspect ratio.
 *
 * Used by OptionViewer456Group to decide whether to display
 * Types 4, 5, 6 vertically, horizontally, or in a 2-row layout.
 */
export interface TypeCount {
  type: string;
  count: number;
}

export interface LayoutRow {
  /** Types included in this row */
  types: string[];
  /** Width allocated to this row */
  containerWidth: number;
  /** Layout mode for this row */
  layout: "vertical" | "horizontal" | "row-1" | "row-2" | "single";
}

/**
 * Device-specific configuration for sizing calculations
 */
export interface DeviceConfig {
  padding: { horizontal: number; vertical: number };
  gap: number;
  minItemSize: number;
  maxItemSize: number;
  scaleFactor: number;
}

/**
 * Parameters for device-aware sizing (desktop option picker)
 */
export interface DeviceAwareSizingParams {
  /** Number of items to display */
  count: number;
  /** Container width in pixels */
  containerWidth: number;
  /** Container height in pixels */
  containerHeight: number;
  /** Number of columns */
  columns: number;
  /** Whether this is a mobile device */
  isMobileDevice: boolean;
}

/**
 * Result from device-aware sizing calculation
 */
export interface DeviceAwareSizingResult {
  /** Final pictograph size in pixels */
  pictographSize: number;
  /** Size as CSS string */
  pictographSizeString: string;
  /** Grid gap as CSS string */
  gridGap: string;
  /** Device config used */
  deviceConfig: DeviceConfig;
}

export interface GridFitParams {
  /** Total number of items to display */
  itemCount: number;
  /** Maximum columns to use */
  columnCount: number;
  /** Available width in pixels */
  availableWidth: number;
  /** Available height in pixels */
  availableHeight: number;
  /** Gap between items in pixels */
  gridGap: number;
  /** Maximum allowed size (will not exceed this) */
  maxSize: number;
  /** Minimum allowed size (will not go below this) */
  minSize?: number;
}

export interface GridFitResult {
  /** Calculated pictograph size in pixels */
  pictographSize: number;
  /** Actual columns used (may be less than requested if fewer items) */
  columns: number;
  /** Rows needed at this column count */
  rows: number;
  /** CSS grid-template-columns value */
  gridColumns: string;
}

/**
 * Layout configuration object
 */
export type LayoutConfig = {
  containerWidth: number;
  optionsPerRow?: number;
  [key: string]: unknown;
};

/**
 * OptionTransitionCoordinator - Orchestrates option selection transitions
 *
 * Manages the complex setTimeout choreography for smooth fade-out/fade-in
 * transitions when options are selected or undone.
 *
 * EXTRACTED FROM: OptionViewer.svelte lines 278-327, 348-369
 */
export interface TransitionLifecycle {
  /** Current fade-out state */
  readonly isFadingOut: boolean;

  /** Current transitioning state (prevents navigation during transition) */
  readonly isTransitioning: boolean;

  /** Cancel any in-flight transitions */
  cancel(): void;
}

export interface TransitionCallbacks {
  /** Called halfway through fade-out (ideal time for data updates) */
  onMidFadeOut?: () => void;

  /** Called when fade-out completes and fade-in begins */
  onFadeInStart?: () => void;

  /** Called when entire transition completes */
  onComplete?: () => void;
}

/**
 * Describes the rotation relationship between two placements in the same group.
 * - 'exact': Same placement (0° rotation)
 * - 'quarter': 90° rotation (placements are 2 steps apart in alpha/beta, 4 in gamma)
 * - 'half': 180° rotation (placements are opposite, e.g., alpha1 ↔ alpha5)
 */
export type RotationRelation = "exact" | "quarter" | "half";
