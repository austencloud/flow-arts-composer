/**
 * Direct Renderer Interface
 *
 * Contract for renderers that draw pictographs directly to canvas
 * without going through SVG intermediary. This enables:
 * - Canvas 2D direct drawing (skip SVG parsing)
 * - WebGL GPU-accelerated rendering
 *
 * Both implementations must produce visually identical output to the
 * current SVG-based renderer for A/B comparison.
 */

import type { PictographData } from "../../pictograph/shared/domain/models/pictograph-data";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PictographVisibilityOptions } from "../utils/pictograph-to-svg";
import type { RenderCanvas } from "./types";

export interface DirectRenderOptions {
  /** Size of the pictograph in pixels */
  size: number;
  /** Visibility settings for glyphs, indicators, etc. */
  visibility: PictographVisibilityOptions;
  /** Optional left-hand prop type override */
  leftPropType?: string;
  /** Optional right-hand prop type override */
  rightPropType?: string;
}

/**
 * Benchmark result for a single render
 */
export interface RenderTiming {
  /** Total time in milliseconds */
  totalMs: number;
  /** Time spent on setup/initialization */
  setupMs: number;
  /** Time spent on actual drawing */
  drawMs: number;
  /** Time spent on finalization (if any) */
  finalizeMs: number;
}

/**
 * Direct renderer interface
 *
 * Implementations:
 * - Canvas2DDirectRenderer: Uses CanvasRenderingContext2D
 *
 * A WebGLDirectRenderer was removed on 2026-08-16: it had no consumers, and
 * both of the URLs it fetched its arrow atlas from resolved to 404, so it
 * could never have built a texture atlas even if something had called it.
 */
export interface IDirectRenderer {
  /**
   * Get the renderer name for identification
   */
  getName(): string;

  /**
   * Check if this renderer is supported in the current environment
   */
  isSupported(): boolean;

  /**
   * Initialize the renderer (load assets, compile shaders, etc.)
   * Must be called before renderPictograph()
   */
  initialize(): Promise<void>;

  /**
   * Render a single pictograph to a new canvas
   *
   * @param pictograph - The pictograph data to render
   * @param options - Render options (size, visibility, etc.)
   * @returns Canvas containing the rendered pictograph
   */
  renderPictograph(
    pictograph: PictographData | StepData,
    options: DirectRenderOptions
  ): Promise<RenderCanvas>;

  /**
   * Render a single pictograph with timing information
   * Used for benchmarking
   *
   * @param pictograph - The pictograph data to render
   * @param options - Render options
   * @returns Canvas and timing breakdown
   */
  renderPictographWithTiming(
    pictograph: PictographData | StepData,
    options: DirectRenderOptions
  ): Promise<{ canvas: RenderCanvas; timing: RenderTiming }>;

  /**
   * Get current memory usage estimate in bytes
   * Used to compare memory footprint between renderers
   */
  getMemoryUsage(): number;

  /**
   * Clean up resources (WebGL textures, cached images, etc.)
   */
  dispose(): void;
}

/**
 * Arrow path data extracted from SVG sprites
 */
export interface ArrowPathData {
  id: string;
  transform: { x: number; y: number };
  viewBox: { x: number; y: number; width: number; height: number } | null;
  paths: Array<{
    d: string;
    commands: Array<{ cmd: string; args: number[] }>;
    class: string | null;
    fill: string | null;
  }>;
}

/**
 * Full arrow paths data structure (loaded from JSON)
 */
export interface ArrowPathsData {
  version: string;
  generated: string;
  sourceFile: string;
  styles: Record<string, { fill?: string }>;
  arrows: Record<string, ArrowPathData>;
}
