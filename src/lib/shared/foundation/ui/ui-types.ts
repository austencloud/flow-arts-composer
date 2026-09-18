/**
 * Application UI Types
 *
 * Core UI state and component types for the application.
 *
 * NOTE: Navigation types (ModuleId, TabId, LegacyTabId) live in:
 * $lib/shared/navigation/domain/types.ts
 */

/**
 * Available sections/tabs within the Create module
 * Note: Edit and Export are now slide-up panels, not tabs
 * Note: Animate is now a play button with inline animator
 * Note: Record and Share have been removed
 */
export type BuildModeId =
  | "assemble" // Click grid points to build sequences visually
  | "construct" // Manual builder (one pictograph at a time)
  | "generate" // Automatic sequence generation
  | "shape-engine" // Pick a shape pairing, get the sequence that draws it
  | "fuse" // Combine two sequences into one
  | "tunnel" // Compose complete sequences into a multi-performer tunnel
  | "one-handed"
  | "guided" // Guided mode
  | "spell"; // Word-to-sequence generator

/**
 * Legacy type alias for backwards compatibility
 * @deprecated Use BuildModeId instead
 */
export type ActiveCreateModule = BuildModeId;

/**
 * UI theme options for foundation components
 */
export type UITheme = "light" | "dark";

/**
 * Performance metrics for UI state tracking
 * Note: Different from ApplicationPerformanceMetrics which track app-level metrics
 */
export interface UIPerformanceMetrics {
  initializationTime: number;
  lastRenderTime: number;
  memoryUsage: number;
}

/**
 * Snapshot of application performance and state for debugging
 */
export interface PerformanceSnapshot {
  timestamp: number;
  metrics: UIPerformanceMetrics;
  appState: object;
  memoryUsage: number;
}

/**
 * Generic export result interface
 * Base interface for all export operations across the application
 */
export interface ExportResult {
  success: boolean;
  canvas?: HTMLCanvasElement;
  blob?: Blob;
  data?: Blob;
  filename?: string;
  error?: string;
  warnings?: string[];
  metadata?: {
    format: string;
    size: number;
    dimensions: { width: number; height: number };
    stepCount: number;
    processingTime: number;
    successCount?: number;
    failureCount?: number;
    totalErrors?: number;
  };
}
