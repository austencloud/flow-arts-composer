/**
 * Animation Precomputer Interface
 *
 * Manages pre-computation of animation data for smooth playback:
 * - Path cache pre-computation for gap-free trail rendering
 * - Frame pre-rendering for perfect smooth playback
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { TrailSettings } from "../domain/types/trail-types";
import type { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
import type { ITrailCapturer } from "#lib/shared/animation-engine/services/ITrailCapturer.js";
import type { IAnimationRenderer } from "#lib/shared/animation-engine/services/IAnimationRenderer.js";
import type {
  AnimationPathCache,
  AnimationPathCacheData,
} from "#lib/shared/animation-engine/services/animation-path-cache.js";
import type {
  SequenceFramePreRenderer,
  PreRenderProgress,
} from "#lib/shared/animation-engine/services/sequence-frame-pre-renderer.js";

/**
 * Prop dimensions for cache configuration
 */
export interface PropDimensions {
  width: number;
  height: number;
}

/**
 * Configuration for precomputation service
 */
export interface PrecomputationServiceConfig {
  orchestrator: SequenceAnimationOrchestrator;
  TrailCapturer: ITrailCapturer | null;
  renderer: IAnimationRenderer | null;
  propDimensions: PropDimensions;
  canvasSize: number;
  instanceId?: string;
}

/**
 * Reactive state owned by the service
 */
export interface PrecomputationState {
  pathCacheData: AnimationPathCacheData | null;
  isCachePrecomputing: boolean;
  isPreRendering: boolean;
  preRenderProgress: PreRenderProgress | null;
  preRenderedFramesReady: boolean;
}

/**
 * Service for managing animation precomputation
 */
export interface IAnimationPrecomputer {
  /**
   * Reactive state - read from component via $derived/$effect
   */
  readonly state: PrecomputationState;

  /**
   * Initialize the service with required dependencies
   */
  initialize(config: PrecomputationServiceConfig): void;

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PrecomputationServiceConfig>): void;

  /**
   * Pre-compute animation paths for gap-free trail rendering
   * @param seqData - Sequence data to precompute
   * @param totalSteps - Total number of steps
   * @param stepDurationMs - Duration of each beat in milliseconds
   * @param trailSettings - Trail settings including usePathCache flag
   */
  precomputeAnimationPaths(
    seqData: SequenceData,
    totalSteps: number,
    stepDurationMs: number,
    trailSettings: TrailSettings
  ): Promise<void>;

  /**
   * Pre-render entire sequence to frames for perfect smooth playback
   * @param seqData - Sequence data to pre-render
   * @param trailSettings - Trail settings for rendering
   * @param isInitialized - Function to check if renderer is initialized
   */
  preRenderSequenceFrames(
    seqData: SequenceData,
    trailSettings: TrailSettings,
    isInitialized: () => boolean
  ): Promise<void>;

  /**
   * Initialize frame pre-renderer (call after pixi is ready)
   */
  initializeFramePreRenderer(): void;

  /**
   * Get the path cache instance (for trail point retrieval)
   */
  getPathCache(): AnimationPathCache | null;

  /**
   * Get the frame pre-renderer (for frame retrieval)
   */
  getFramePreRenderer(): SequenceFramePreRenderer | null;

  /**
   * Clear all caches (paths + frames)
   */
  clearCaches(): void;

  /**
   * Clear only pre-rendered frames (preserves path cache)
   */
  clearPreRenderedFrames(): void;

  /**
   * Clean up resources
   */
  dispose(): void;
}
