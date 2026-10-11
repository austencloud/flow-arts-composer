/**
 * Animation Path Cache Service
 *
 * Pre-computes entire animation sequence at high frame rate to provide
 * smooth, gap-free trail rendering regardless of actual playback performance.
 *
 * Benefits:
 * - Frame-independent: No gaps when device stutters
 * - Smooth interpolation: Can look up positions between frames
 * - Performance: One-time computation, reused for entire playback
 */

import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
import type { TrailPoint } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import {
  calculatePropEndpoints,
  type PropEndpointConfig,
} from "#lib/shared/animation-engine/services/prop-position-calculator.js";


/** Default cache FPS - high for ultra-smooth trails */
const DEFAULT_CACHE_FPS = 120;

/** Default canvas size for endpoint calculations */
const DEFAULT_CACHE_CANVAS_SIZE = 950;

/** Default prop width for endpoint calculations */
const DEFAULT_PROP_WIDTH = 120;

/** Default prop height for endpoint calculations */
const DEFAULT_PROP_HEIGHT = 15;

/**
 * Pre-computed position data for a single prop at a specific time
 */
export interface PrecomputedPropPosition {
  /** Beat number (fractional, e.g., 2.5) */
  beat: number;
  /** Timestamp in milliseconds from animation start */
  timestamp: number;
  /** Prop state (angles, positions) */
  propState: PropState;
  /** Calculated endpoint positions for both ends */
  endpoints: {
    left: { x: number; y: number }; // tipIndex 0 (left end)
    right: { x: number; y: number }; // tipIndex 1+ (right end / tip)
  };
}

/**
 * Pre-computed path data for a single prop (blue or red)
 */
export interface PrecomputedPropPath {
  /** Array of positions ordered by time */
  positions: PrecomputedPropPosition[];
  /** Quick lookup by beat number (rounded to nearest cache frame) */
  stepLookup: Map<number, number>; // beat -> index in positions array
}

/**
 * Complete pre-computed animation cache
 */
export interface AnimationPathCacheData {
  /** Pre-computed path for blue prop */
  leftPropPath: PrecomputedPropPath;
  /** Pre-computed path for red prop */
  rightPropPath: PrecomputedPropPath;
  /** Total duration in milliseconds */
  totalDurationMs: number;
  /** Total number of steps in sequence */
  totalSteps: number;
  /** Cache frame rate (FPS) */
  cacheFps: number;
  /** Whether cache is valid and ready to use */
  isValid: boolean;
}

/**
 * Configuration for animation path caching
 */
export interface PathCacheConfig {
  /**
   * Frame rate for cache generation
   * Higher = smoother but more memory
   * Recommended: 60-120 FPS
   */
  cacheFps: number;

  /**
   * Canvas size for endpoint calculations
   * Should match actual canvas size
   */
  canvasSize: number;

  /**
   * Prop dimensions for endpoint calculations
   */
  propDimensions: {
    width: number;
    height: number;
  };
}

export const DEFAULT_PATH_CACHE_CONFIG: PathCacheConfig = {
  cacheFps: DEFAULT_CACHE_FPS,
  canvasSize: DEFAULT_CACHE_CANVAS_SIZE,
  propDimensions: { width: DEFAULT_PROP_WIDTH, height: DEFAULT_PROP_HEIGHT },
};

/**
 * Animation Path Cache Service
 *
 * Pre-computes animation paths to enable smooth, gap-free trail rendering.
 */
export class AnimationPathCache {
  private cacheData: AnimationPathCacheData | null = null;
  private config: PathCacheConfig;

  constructor(config: Partial<PathCacheConfig> = {}) {
    this.config = { ...DEFAULT_PATH_CACHE_CONFIG, ...config };
  }

  /**
   * Pre-compute animation paths for entire sequence (non-blocking)
   *
   * Processes frames in chunks of FRAMES_PER_CHUNK, yielding to the browser
   * between chunks via setTimeout(0) to prevent main-thread jank.
   *
   * @param calculateStateFunc - Function to calculate prop states at any beat
   * @param totalSteps - Total number of steps in sequence
   * @param stepDurationMs - Duration of each beat in milliseconds
   * @param options - Optional abort signal and progress callback
   */
  async precomputePaths(
    calculateStateFunc: (beat: number) => {
      leftProp: PropState;
      rightProp: PropState;
    },
    totalSteps: number,
    stepDurationMs: number,
    options?: { signal?: AbortSignal; onProgress?: (percent: number) => void }
  ): Promise<AnimationPathCacheData> {
    const totalDurationMs = totalSteps * stepDurationMs;
    const frameTimeMs = 1000 / this.config.cacheFps;
    // Cache covers totalSteps + 1 beats so the last beat's full motion is included.
    // During playback, beat N animates from currentStep N to N+1, so we need
    // cached positions up to beat totalSteps + 1 (not just totalSteps).
    const cacheDurationMs = (totalSteps + 1) * stepDurationMs;
    const totalFrames = Math.ceil(cacheDurationMs / frameTimeMs);

    // Pre-allocate arrays at known size to avoid push overhead
    const leftPositions = new Array<PrecomputedPropPosition>(totalFrames + 1);
    const rightPositions = new Array<PrecomputedPropPosition>(totalFrames + 1);

    // Reusable endpoint config (avoid per-frame allocation)
    const endpointConfig: PropEndpointConfig = {
      canvasSize: this.config.canvasSize,
      propDimensions: this.config.propDimensions,
    };

    // Process in chunks to yield to browser (~6ms per chunk at 120fps)
    const FRAMES_PER_CHUNK = 120;
    let frame = 0;

    while (frame <= totalFrames) {
      // Check for cancellation between chunks
      if (options?.signal?.aborted) {
        throw new DOMException("Precomputation aborted", "AbortError");
      }

      const chunkEnd = Math.min(frame + FRAMES_PER_CHUNK, totalFrames + 1);

      for (; frame < chunkEnd; frame++) {
        const timestamp = frame * frameTimeMs;
        const playbackPosition = timestamp / stepDurationMs;

        const { leftProp, rightProp } = calculateStateFunc(playbackPosition);

        const leftEndpoints = calculatePropEndpoints(leftProp, endpointConfig);
        const rightEndpoints = calculatePropEndpoints(rightProp, endpointConfig);

        leftPositions[frame] = {
          beat: playbackPosition,
          timestamp,
          propState: { ...leftProp },
          endpoints: leftEndpoints,
        };

        rightPositions[frame] = {
          beat: playbackPosition,
          timestamp,
          propState: { ...rightProp },
          endpoints: rightEndpoints,
        };
      }

      // Report progress and yield to browser between chunks
      if (frame <= totalFrames) {
        options?.onProgress?.(Math.round((frame / (totalFrames + 1)) * 100));
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      }
    }

    options?.onProgress?.(100);

    // Build beat lookup tables
    const leftBeatLookup = this.buildBeatLookup(leftPositions);
    const rightBeatLookup = this.buildBeatLookup(rightPositions);

    this.cacheData = {
      leftPropPath: {
        positions: leftPositions,
        stepLookup: leftBeatLookup,
      },
      rightPropPath: {
        positions: rightPositions,
        stepLookup: rightBeatLookup,
      },
      totalDurationMs,
      totalSteps,
      cacheFps: this.config.cacheFps,
      isValid: true,
    };

    return this.cacheData;
  }

  /**
   * Get pre-computed trail points for a beat range
   *
   * @param propIndex - 0 for blue, 1 for red
   * @param tipIndex - Tip index (0 = left endpoint, 1 = right endpoint for cache)
   * @param startStep - Start beat number (fractional, e.g., 2.5)
   * @param endStep - End beat number (fractional, e.g., 4.2)
   * @returns Array of trail points with beat-relative timestamps
   */
  getTrailPoints(
    propIndex: 0 | 1,
    tipIndex: number,
    startStep: number,
    endStep: number
  ): TrailPoint[] {
    if (!this.cacheData?.isValid) {
      return [];
    }

    const propPath =
      propIndex === 0
        ? this.cacheData.leftPropPath
        : this.cacheData.rightPropPath;

    // Convert beat range to frame indices
    const stepDurationMs =
      this.cacheData.totalDurationMs / this.cacheData.totalSteps;
    const frameTimeMs = 1000 / this.config.cacheFps;

    const startTime = startStep * stepDurationMs;
    const endTime = endStep * stepDurationMs;

    const startFrame = Math.floor(startTime / frameTimeMs);
    const endFrame = Math.ceil(endTime / frameTimeMs);

    // Cache stores two endpoints (left=0, right=1). Map tipIndex to the
    // closest cached endpoint: 0 → left, anything else → right.
    const useLeft = tipIndex === 0;

    const trailPoints: TrailPoint[] = [];

    for (let frame = startFrame; frame <= endFrame; frame++) {
      if (frame >= 0 && frame < propPath.positions.length) {
        const position = propPath.positions[frame]!;
        const endpoint = useLeft
          ? position.endpoints.left
          : position.endpoints.right;

        trailPoints.push({
          x: endpoint.x,
          y: endpoint.y,
          timestamp: position.timestamp, // Beat-relative timestamp (0ms to totalDurationMs)
          propIndex,
          tipIndex,
        });
      }
    }

    // Debug logging disabled - too noisy for every frame
    // if (trailPoints.length > 0 && trailPoints.length < 10) {
    //   console.log(`📦 CACHE RETRIEVAL (prop=${propIndex}, tip=${tipIndex}, steps ${startStep.toFixed(2)}-${endStep.toFixed(2)}):`);
    //   console.log(`   Frames ${startFrame}-${endFrame}, returned ${trailPoints.length} points`);
    // }

    return trailPoints;
  }

  /**
   * Fill caller-owned array with pre-computed trail points (zero-allocation hot path)
   *
   * Writes directly into the target array, reusing existing objects at each index.
   * Only allocates when the array needs to grow (first few frames, then steady state = zero allocations).
   *
   * @param propIndex - 0 for blue, 1 for red
   * @param tipIndex - Tip index (0 = left endpoint, 1+ = right endpoint for cache)
   * @param startStep - Start beat number (fractional)
   * @param endStep - End beat number (fractional)
   * @param scaleFactor - Coordinate scale factor (canvasSize / 950)
   * @param targetArray - Caller-owned array to write into
   * @param targetOffset - Starting index in targetArray
   * @returns Number of points written
   */
  fillTrailPoints(
    propIndex: 0 | 1,
    tipIndex: number,
    startStep: number,
    endStep: number,
    scaleFactor: number,
    targetArray: TrailPoint[],
    targetOffset: number
  ): number {
    if (!this.cacheData?.isValid) {
      return 0;
    }

    const propPath =
      propIndex === 0
        ? this.cacheData.leftPropPath
        : this.cacheData.rightPropPath;

    const stepDurationMs =
      this.cacheData.totalDurationMs / this.cacheData.totalSteps;
    const frameTimeMs = 1000 / this.config.cacheFps;

    const startTime = startStep * stepDurationMs;
    const endTime = endStep * stepDurationMs;

    const startFrame = Math.floor(startTime / frameTimeMs);
    const endFrame = Math.ceil(endTime / frameTimeMs);

    // Cache stores two endpoints (left=0, right=1). Map tipIndex to the
    // closest cached endpoint: 0 → left, anything else → right.
    const useLeft = tipIndex === 0;

    let writeIndex = targetOffset;

    for (let frame = startFrame; frame <= endFrame; frame++) {
      if (frame >= 0 && frame < propPath.positions.length) {
        const position = propPath.positions[frame]!;
        const endpoint = useLeft
          ? position.endpoints.left
          : position.endpoints.right;

        // Reuse existing object if available, otherwise push a new one
        if (writeIndex < targetArray.length) {
          const existing = targetArray[writeIndex]!;
          existing.x = endpoint.x * scaleFactor;
          existing.y = endpoint.y * scaleFactor;
          existing.timestamp = position.timestamp;
          existing.propIndex = propIndex;
          existing.tipIndex = tipIndex;
        } else {
          targetArray.push({
            x: endpoint.x * scaleFactor,
            y: endpoint.y * scaleFactor,
            timestamp: position.timestamp,
            propIndex,
            tipIndex,
          });
        }
        writeIndex++;
      }
    }

    return writeIndex - targetOffset;
  }

  /**
   * Get pre-computed trail points for a time range (animation-relative)
   *
   * @param propIndex - 0 for blue, 1 for red
   * @param tipIndex - Tip index (0 = left endpoint, 1+ = right endpoint for cache)
   * @param startTimeMs - Start time in ms from animation start (0-based)
   * @param endTimeMs - End time in ms from animation start (0-based)
   * @returns Array of trail points
   */
  getTrailPointsByTime(
    propIndex: 0 | 1,
    tipIndex: number,
    startTimeMs: number,
    endTimeMs: number
  ): TrailPoint[] {
    if (!this.cacheData?.isValid) {
      return [];
    }

    const stepDurationMs =
      this.cacheData.totalDurationMs / this.cacheData.totalSteps;
    const startStep = startTimeMs / stepDurationMs;
    const endStep = endTimeMs / stepDurationMs;

    return this.getTrailPoints(propIndex, tipIndex, startStep, endStep);
  }

  /**
   * Get cached points for IAnimationCacheService interface compatibility
   * This is a wrapper around getTrailPoints to match the expected interface signature
   *
   * @param propIndex - 0 for blue, 1 for red
   * @param tipIndex - Tip index (0 = left endpoint, 1+ = right endpoint for cache)
   * @param startStep - Start beat number (fractional, e.g., 2.5)
   * @param endStep - End beat number (fractional, e.g., 4.2)
   * @param canvasSize - Canvas size (unused, kept for interface compatibility)
   * @returns Array of trail points with beat-relative timestamps
   */
  getCachedPoints(
    propIndex: 0 | 1,
    tipIndex: number,
    startStep: number,
    endStep: number,
    _canvasSize: number
  ): TrailPoint[] {
    // canvasSize is ignored - cache uses standard coordinate system (950x950)
    // and points are transformed by AnimatorCanvas as needed
    return this.getTrailPoints(propIndex, tipIndex, startStep, endStep);
  }

  /**
   * Get position at specific beat number
   *
   * @param propIndex - 0 for blue, 1 for red
   * @param beat - Beat number (can be fractional)
   * @returns Position data or null if not found
   */
  getPositionAtBeat(
    propIndex: 0 | 1,
    beat: number
  ): PrecomputedPropPosition | null {
    if (!this.cacheData?.isValid) {
      return null;
    }

    const propPath =
      propIndex === 0
        ? this.cacheData.leftPropPath
        : this.cacheData.rightPropPath;

    const roundedBeat =
      Math.round(beat * this.config.cacheFps) / this.config.cacheFps;
    const index = propPath.stepLookup.get(roundedBeat);

    if (
      index !== undefined &&
      index >= 0 &&
      index < propPath.positions.length
    ) {
      return propPath.positions[index]!;
    }

    return null;
  }

  /**
   * Get all cached positions for a prop
   *
   * @param propIndex - 0 for blue, 1 for red
   * @returns Array of all pre-computed positions
   */
  getAllPositions(propIndex: 0 | 1): readonly PrecomputedPropPosition[] {
    if (!this.cacheData?.isValid) {
      return [];
    }

    const propPath =
      propIndex === 0
        ? this.cacheData.leftPropPath
        : this.cacheData.rightPropPath;

    return propPath.positions;
  }

  /**
   * Get the raw pre-computed cache data (for sharing between engine instances)
   */
  getCacheData(): AnimationPathCacheData | null {
    return this.cacheData;
  }

  /**
   * Check if cache is valid and ready
   */
  isValid(): boolean {
    return this.cacheData?.isValid ?? false;
  }

  getCacheInfo() {
    if (!this.cacheData) {
      return null;
    }

    return {
      totalSteps: this.cacheData.totalSteps,
      totalDurationMs: this.cacheData.totalDurationMs,
      cacheFps: this.cacheData.cacheFps,
      leftPointCount: this.cacheData.leftPropPath.positions.length,
      rightPointCount: this.cacheData.rightPropPath.positions.length,
    };
  }

  /**
   * Clear cache and free memory
   */
  clear(): void {
    this.cacheData = null;
  }

  /**
   * Update cache configuration
   */
  setConfig(config: Partial<PathCacheConfig>): void {
    this.config = { ...this.config, ...config };
    // Invalidate cache if config changes
    if (this.cacheData) {
      this.cacheData.isValid = false;
    }
  }

  /**
   * Build beat lookup table for fast position retrieval
   */
  private buildBeatLookup(
    positions: PrecomputedPropPosition[]
  ): Map<number, number> {
    const lookup = new Map<number, number>();

    for (let i = 0; i < positions.length; i++) {
      const position = positions[i]!;
      const roundedBeat =
        Math.round(position.beat * this.config.cacheFps) / this.config.cacheFps;
      lookup.set(roundedBeat, i);
    }

    return lookup;
  }
}

