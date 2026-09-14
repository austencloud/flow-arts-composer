import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { SequenceData } from "../../foundation/domain/models/sequence-data";
import type { PropType } from "../../pictograph/prop/domain/enums/prop-type";

export interface ReversalDetector {
  /**
   * Process reversals for sequence
   */
  processReversals(sequence: SequenceData, steps: StepData[]): StepData[];

  /**
   * Detect reversal for single beat
   */
  detectReversal(
    previousSteps: StepData[],
    currentStep: StepData
  ): { leftReversal: boolean; rightReversal: boolean };

  /**
   * Apply reversal symbols to beat
   */
  applyReversalSymbols(
    stepData: StepData,
    reversalInfo: { leftReversal: boolean; rightReversal: boolean }
  ): StepData;
}

// Simple type for image render options
export interface ImageRenderOptions {
  width?: number;
  height?: number;
  quality?: number;
}

/**
 * Progress callback for tracking image composition
 */
export type CompositionProgressCallback = (progress: {
  current: number;
  total: number;
  stage: "preparing" | "rendering" | "finalizing";
}) => void;

/**
 * Canvas type that works in both main thread and Web Workers.
 * OffscreenCanvas is used when available (workers + modern browsers).
 * Falls back to HTMLCanvasElement on main thread when OffscreenCanvas unavailable.
 */
export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

/**
 * 2D rendering context type that works with both HTMLCanvasElement and OffscreenCanvas.
 * The intersection type captures the common API surface used for drawing.
 */
export type RenderContext2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

/**
 * Layer types for compositional caching
 *
 * - base: Props + Arrows (no grid dots)
 * - gridPoints: Grid dots only (toggleable via handPointVisibility)
 * - tka: Letter + Turns + DirectionDot
 * - reversal: Blue/red reversal indicators
 * - beat: Beat number text
 */
export type LayerType = "base" | "gridPoints" | "tka" | "reversal" | "beat";

/**
 * Options for layer rendering
 */
export interface LayerRenderOptions {
  fanAppearance?: FanAppearance;
  primaryPropColors?: { left: string; right: string } | null;
  size: number;
  /** Width multiplier for duration-expanded cells (1 = square, 2 = double-wide). Default: 1 */
  widthMultiplier?: number;
  darkMode: boolean;

  // Grid options (affect base layer only)
  showNonRadialPoints: boolean;
  handPointVisibility: "all" | "active" | "none";
  /** Master grid visibility. When false, the base grid, hand points, and
   *  non-radial points are all hidden (props/glyphs still render). Default: true. */
  showGrid?: boolean;

  // Prop type overrides
  leftPropType?: PropType;
  rightPropType?: PropType;

  // Buugeng chirality. Mirrors the prop when set (buugeng-family props only),
  // matching PropSvg in the live DOM and the 2D animation canvas.
  leftBuugengFlipped?: boolean;
  rightBuugengFlipped?: boolean;

  // Per-color motion visibility. When false, renderer skips that color's props+arrows.
  // Default: true (both visible). Affects base layer cache key.
  showLeftMotion?: boolean;
  showRightMotion?: boolean;

  // Glyphs baked into the base layer (toggle invalidates base cache, which
  // is acceptable given the rarity of toggles and low cost of a fresh render).
  /** TnD glyph (bottom-right category badge). */
  showTnD?: boolean;
  /** Elemental glyph (paired with TnD, same corner). */
  showElemental?: boolean;
  /** Start/end position letters (alpha/beta/gamma). */
  showPositions?: boolean;
  /** Hand path mode — affects solo motion glyph display. */
  handPathMode?: boolean;
}

/**
 * Visibility settings for layer composition
 */
export interface LayerVisibility {
  showTKA: boolean;
  showReversals: boolean;
}

/**
 * Result from a layer render operation
 */
export interface LayerRenderResult {
  canvas: RenderCanvas;
  cacheKey: string;
  fromCache: boolean;
  renderTimeMs: number;
}

/**
 * Result from a full composition
 */
export interface CompositionResult {
  canvas: RenderCanvas;
  timing: {
    totalMs: number;
    baseLayerMs: number;
    gridPointsLayerMs: number;
    tkaLayerMs: number;
    reversalLayerMs: number;
    beatLayerMs: number;
    compositeMs: number;
  };
  cacheStats: {
    baseFromCache: boolean;
    gridPointsFromCache: boolean;
    tkaFromCache: boolean;
    reversalFromCache: boolean;
  };
}

/**
 * Cache statistics for monitoring
 */
export interface LayerCacheStats {
  baseCacheSize: number;
  gridPointsCacheSize: number;
  tkaCacheSize: number;
  reversalCacheSize: number;
  baseCacheHits: number;
  baseCacheMisses: number;
  gridPointsCacheHits: number;
  gridPointsCacheMisses: number;
  tkaCacheHits: number;
  tkaCacheMisses: number;
  totalCompositions: number;
}

/**
 * PictographBlobCache
 *
 * Layer 1 of the two-layer pictograph caching system.
 * Persists rasterized pictograph images (as Blobs) to IndexedDB.
 *
 * Why Blobs instead of SVG strings?
 * - SVG strings must be re-parsed and rasterized by the browser
 * - Blobs are already rasterized, so creating images is instant
 * - Benchmark showed L1 SVG cache had 0.1% speedup vs 91.9% for L2 memory cache
 *
 * Cache keys include size (unlike original SVG cache) since Blobs are size-specific.
 * Format: `${baseHash}:${size}`
 */
export interface PictographBlobCacheStats {
  /** Number of cached entries */
  count: number;
  /** Total size in bytes */
  sizeBytes: number;
}

/**
 * PictographSVGCache
 *
 * Layer 1 of the two-layer pictograph caching system.
 * Persists base pictograph SVGs (without beat numbers) to IndexedDB.
 *
 * Cache keys are derived from pictograph properties (letter, motions, visibility)
 * but explicitly EXCLUDE beat number and size, allowing identical pictographs
 * across different sequences to share cached SVGs.
 */
export interface PictographCacheStats {
  /** Number of cached entries */
  count: number;
  /** Total size in bytes (approximate, based on SVG string length) */
  sizeBytes: number;
}
