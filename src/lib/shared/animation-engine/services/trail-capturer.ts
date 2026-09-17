/**
 * Trail Capture Service Implementation
 *
 * Handles real-time trail point capture with distance-based adaptive sampling.
 *
 * Key Features:
 * - Distance-based sampling: Only captures points when prop moves >N pixels
 * - Adaptive density: Adjusts spacing based on device performance
 * - Cache backfill: Fills gaps during device stutters with pre-computed paths
 * - Loop detection: Automatically clears trails when animation loops (LOOP_CLEAR mode)
 * - Fade mode: Automatically prunes old points based on fade duration
 *
 * Architecture:
 * - Uses CircularBuffer for O(1) point insertion and memory efficiency
 * - Coordinates with PerformanceMonitor for adaptive spacing
 * - Coordinates with AnimationCacheService for backfill during stutters
 */

import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import type {
  TrailPoint,
  TrailSettings,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import {
  TrackingMode,
  TrailMode,
  TrailEffect,
} from "$lib/shared/animation-engine/domain/types/trail-types";
import type {
  TrailCapturePropStates,
  PropDimensions,
  TrailCaptureConfig,
  IAnimationCacheService,
  IPerformanceMonitorService,
} from "$lib/shared/animation-engine/domain/types/trail-capture-types";

export type {
  AdditionalLayerProps,
  TrailCapturePropStates,
  PropDimensions,
  TrailCaptureConfig,
  IAnimationCacheService,
  IPerformanceMonitorService,
} from "$lib/shared/animation-engine/domain/types/trail-capture-types";
import {
  calculateTrailSourceEndpoint,
  type PropEndpointConfig,
} from "$lib/shared/animation-engine/services/prop-position-calculator";
import {
  resolveTrailPointConfig,
  type TrailPointSource,
} from "$lib/shared/animation-engine/domain/types/trail-point-types";
import { propTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";

interface TrackedTrailSource {
  source: TrailPointSource;
  sourceKey: string;
  tipIndex: number;
}

// CIRCULAR BUFFER (inlined for O(1) trail point management)

/**
 * High-performance ring buffer for managing trail points.
 * Provides O(1) push and automatic old point removal.
 */
class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head: number = 0;
  private tail: number = 0;
  private size: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) {
      this.size++;
    } else {
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  get length(): number {
    return this.size;
  }

  get(index: number): T | undefined {
    if (index < 0 || index >= this.size) return undefined;
    return this.buffer[(this.tail + index) % this.capacity];
  }

  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.size = 0;
  }

  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.size; i++) {
      const item = this.buffer[(this.tail + i) % this.capacity];
      if (item !== undefined) yield item;
    }
  }

  filterInPlace(predicate: (item: T) => boolean): void {
    const kept: T[] = [];
    for (const item of this) {
      if (predicate(item)) kept.push(item);
    }
    this.clear();
    for (const item of kept) this.push(item);
  }

  toArray(): T[] {
    return Array.from(this);
  }

  last(): T | undefined {
    if (this.size === 0) return undefined;
    const lastIndex = (this.head - 1 + this.capacity) % this.capacity;
    return this.buffer[lastIndex];
  }

  getLast(n: number): T[] {
    const result: T[] = [];
    const count = Math.min(n, this.size);
    const startIndex = this.size - count;
    for (let i = startIndex; i < this.size; i++) {
      const item = this.buffer[(this.tail + i) % this.capacity];
      if (item !== undefined) result.push(item);
    }
    return result;
  }
}

/** Wait for panel open and textures before capturing first point */
const INITIALIZATION_DELAY_MS = 500;

/** Beat gap threshold for triggering cache backfill (>0.05 steps = use cache) */
const LARGE_BEAT_GAP_THRESHOLD = 0.05;

/** Skip trails for jumps larger than this (initial position jump detection) */
const INITIAL_JUMP_DISTANCE_THRESHOLD = 200;

/** Default minimum distance in pixels before adding a new trail point */
const DEFAULT_POINT_SPACING = 0.75;

/** Maximum accumulated points before forced pruning (safety limit for mobile memory) */
const MAX_TOTAL_POINTS_BEFORE_PRUNE = 8000;

/** Duration to keep when emergency pruning (5 seconds) */
const EMERGENCY_PRUNE_KEEP_DURATION_MS = 5000;

/** Default trail buffer capacity */
const DEFAULT_BUFFER_CAPACITY = 1000;

/** Default prop dimensions (staff dimensions in viewbox units) */
const DEFAULT_PROP_WIDTH = 252.8;
const DEFAULT_PROP_HEIGHT = 77.8;

/**
 * Last captured point tracking for distance-based sampling
 */
interface LastCapturedPoint {
  x: number;
  y: number;
  beat: number;
  timestamp: number;
}

export class TrailCapturer {
  // Configuration
  private config: TrailCaptureConfig = {
    canvasSize: 500,
    leftPropDimensions: {
      width: DEFAULT_PROP_WIDTH,
      height: DEFAULT_PROP_HEIGHT,
    },
    rightPropDimensions: {
      width: DEFAULT_PROP_WIDTH,
      height: DEFAULT_PROP_HEIGHT,
    },
    trailSettings: {
      mode: TrailMode.OFF,
      effect: TrailEffect.NONE,
      trackingMode: TrackingMode.RIGHT_END,
      fadeDurationMs: 3000,
      maxPoints: 1000,
      lineWidth: 2,
      glowBlur: 0,
      leftColor: "#4A9EFF",
      rightColor: "#FF6B6B",
      additionalLayerColors: [],
      minOpacity: 0.2,
      maxOpacity: 0.8,
      hideProps: false,
      usePathCache: true,
      previewMode: false,
      tailLength: 20,
    },
  };

  // Trail buffers: primary layer
  private leftTrailBuffer = new CircularBuffer<TrailPoint>(
    DEFAULT_BUFFER_CAPACITY
  );
  private rightTrailBuffer = new CircularBuffer<TrailPoint>(
    DEFAULT_BUFFER_CAPACITY
  );

  // Trail buffers: additional tunnel layers (lazily created)
  private additionalLayerBuffers: Array<{
    left: CircularBuffer<TrailPoint>;
    right: CircularBuffer<TrailPoint>;
  }> = [];
  private additionalLayerTrailCaptureSuppressed: boolean[] = [];

  // Last captured points for distance-based sampling. Keys include the resolved
  // source identity so changing a tip/custom offset starts a new segment.
  private lastCapturedPoints = new Map<string, LastCapturedPoint>();

  // Chirality flip of the last captured frame per hand. A flip moves every
  // trail source to its mirror, so the trail restarts instead of drawing a
  // segment across the prop.
  private lastFlipped: [boolean, boolean] = [false, false];

  // Animation timing
  private animationStartTime: number | null = null;
  private previousBeatForLoopDetection = 0;

  // Optional dependencies for advanced features
  private animationCacheService: IAnimationCacheService | null = null;
  private performanceMonitor: IPerformanceMonitorService | null = null;

  // Memory leak prevention: Track total accumulated points
  private totalPointsCaptured = 0;

  initialize(config: TrailCaptureConfig): void {
    this.config = { ...config };
    this.clearTrails();
  }

  updateConfig(config: Partial<TrailCaptureConfig>): void {
    const oldCanvasSize = this.config.canvasSize;
    const oldLeftPropType = this.config.leftPropType;
    const oldRightPropType = this.config.rightPropType;
    this.config = { ...this.config, ...config };

    // If prop type changed, clear trails so old endpoint positions don't
    // jump to the new prop's differently-sized endpoints
    const leftPropChanged =
      config.leftPropType !== undefined &&
      config.leftPropType !== oldLeftPropType;
    const rightPropChanged =
      config.rightPropType !== undefined &&
      config.rightPropType !== oldRightPropType;
    if (leftPropChanged || rightPropChanged) {
      this.clearTrails();
      return;
    }

    // If canvas size changed, scale existing trail points to match new size
    if (
      config.canvasSize !== undefined &&
      config.canvasSize !== oldCanvasSize
    ) {
      this.scaleTrailPoints(oldCanvasSize, config.canvasSize);
    }

    // If settings changed, update trail settings
    if (config.trailSettings) {
      this.updateSettings(config.trailSettings);
    }
  }

  /**
   * Scale all existing trail points when canvas size changes.
   * This maintains visual continuity during resize.
   */
  private scaleTrailPoints(oldSize: number, newSize: number): void {
    if (oldSize === 0 || newSize === 0) return;

    const scaleFactor = newSize / oldSize;

    // Scale points in all buffers
    this.scaleBuffer(this.leftTrailBuffer, scaleFactor);
    this.scaleBuffer(this.rightTrailBuffer, scaleFactor);
    for (const layer of this.additionalLayerBuffers) {
      this.scaleBuffer(layer.left, scaleFactor);
      this.scaleBuffer(layer.right, scaleFactor);
    }

    // Also scale the last captured points tracking
    for (const [key, point] of this.lastCapturedPoints.entries()) {
      this.lastCapturedPoints.set(key, {
        ...point,
        x: point.x * scaleFactor,
        y: point.y * scaleFactor,
      });
    }
  }

  /**
   * Scale all points in a circular buffer by a factor
   */
  private scaleBuffer(
    buffer: CircularBuffer<TrailPoint>,
    scaleFactor: number
  ): void {
    const length = buffer.length;
    for (let i = 0; i < length; i++) {
      const point = buffer.get(i);
      if (point) {
        point.x *= scaleFactor;
        point.y *= scaleFactor;
      }
    }
  }

  updateSettings(settings: TrailSettings): void {
    this.config.trailSettings = settings;

    // Clear trails if mode is OFF
    if (settings.mode === TrailMode.OFF) {
      this.clearTrails();
    }
  }

  setAnimationCacheService(cacheService: IAnimationCacheService | null): void {
    this.animationCacheService = cacheService;
  }

  setPerformanceMonitor(monitor: IPerformanceMonitorService | null): void {
    this.performanceMonitor = monitor;
  }

  captureFrame(
    props: TrailCapturePropStates,
    currentStep: number | undefined,
    currentTime: number
  ): void {
    const { trailSettings } = this.config;

    // Skip if trails are off
    if (trailSettings.mode === TrailMode.OFF) {
      return;
    }

    // Initialize animation start time on first call
    if (this.animationStartTime === null) {
      this.animationStartTime = currentTime;
    }

    // Calculate animation-relative time (0ms to totalDurationMs)
    const animRelativeTime = currentTime - this.animationStartTime;

    // Use current step (fallback to 0 if undefined)
    const currentBeat = currentStep ?? 0;

    // Check for loop and clear trails if:
    // - Mode is LOOP_CLEAR (user explicitly wants clearing on every loop)
    // - OR sequence is not seamlessly loopable (props jump back, trails don't connect)
    // Note: undefined is treated as "not loopable" (clear on loop) for safety
    const shouldClearOnLoop =
      trailSettings.mode === TrailMode.LOOP_CLEAR ||
      this.config.isSeamlesslyLoopable !== true;

    const loopDetected = this.detectAnimationLoop(currentBeat);

    if (shouldClearOnLoop && loopDetected) {
      this.clearTrails();
      this.animationStartTime = currentTime;
    }

    const leftFlipped = props.leftPropFlipped ?? false;
    const rightFlipped = props.rightPropFlipped ?? false;
    if (
      leftFlipped !== this.lastFlipped[0] ||
      rightFlipped !== this.lastFlipped[1]
    ) {
      this.lastFlipped = [leftFlipped, rightFlipped];
      this.clearTrails();
    }

    // Capture trail points for primary layer
    if (props.leftProp) {
      this.captureTrailPoint(
        props.leftProp,
        this.config.leftPropDimensions,
        0,
        leftFlipped,
        animRelativeTime,
        currentBeat
      );
    }
    if (props.rightProp) {
      this.captureTrailPoint(
        props.rightProp,
        this.config.rightPropDimensions,
        1,
        rightFlipped,
        animRelativeTime,
        currentBeat
      );
    }

    // Capture trail points for additional tunnel layers
    if (props.additionalLayers) {
      this.ensureAdditionalLayerBuffers(props.additionalLayers.length);
      for (let i = 0; i < props.additionalLayers.length; i++) {
        const layer = props.additionalLayers[i]!;
        const captureSuppressed = layer.trailCaptureSuppressed === true;
        if (
          this.additionalLayerTrailCaptureSuppressed[i] !== captureSuppressed
        ) {
          this.resetAdditionalLayerContinuity(i);
        }
        this.additionalLayerTrailCaptureSuppressed[i] = captureSuppressed;
        if (captureSuppressed) continue;
        if (layer.leftProp) {
          this.captureTrailPointForLayer(
            layer.leftProp,
            this.config.leftPropDimensions,
            0,
            leftFlipped,
            animRelativeTime,
            currentBeat,
            i
          );
        }
        if (layer.rightProp) {
          this.captureTrailPointForLayer(
            layer.rightProp,
            this.config.rightPropDimensions,
            1,
            rightFlipped,
            animRelativeTime,
            currentBeat,
            i
          );
        }
      }
      this.additionalLayerTrailCaptureSuppressed.length =
        props.additionalLayers.length;
    } else {
      this.additionalLayerTrailCaptureSuppressed.length = 0;
    }

    // Prune old trail points (fade mode only)
    this.pruneOldTrailPoints(animRelativeTime);
  }

  getTrailPoints(
    propIndex: 0 | 1,
    tipIndex: number,
    layerIndex: number = 0
  ): TrailPoint[] {
    const buffer = this.getBufferForProp(propIndex, layerIndex);
    const allPoints = buffer.toArray();

    return allPoints.filter((p) => p.tipIndex === tipIndex);
  }

  getAllTrailPoints(): {
    left: TrailPoint[];
    right: TrailPoint[];
    additionalLayers: Array<{ left: TrailPoint[]; right: TrailPoint[] }>;
  } {
    return {
      left: this.leftTrailBuffer.toArray(),
      right: this.rightTrailBuffer.toArray(),
      additionalLayers: this.additionalLayerBuffers.map((layer) => ({
        left: layer.left.toArray(),
        right: layer.right.toArray(),
      })),
    };
  }

  /**
   * Fill provided arrays with trail points (avoids allocation)
   * CRITICAL: Use this in hot paths to prevent GC pressure on mobile
   */
  fillTrailPointArrays(
    left: TrailPoint[],
    right: TrailPoint[],
    additionalLayers: Array<{ left: TrailPoint[]; right: TrailPoint[] }>
  ): void {
    // Clear arrays without deallocating
    left.length = 0;
    right.length = 0;

    // Fill from primary buffers using iterator (no intermediate array)
    for (const p of this.leftTrailBuffer) left.push(p);
    for (const p of this.rightTrailBuffer) right.push(p);

    // Fill additional layer arrays
    for (let i = 0; i < this.additionalLayerBuffers.length; i++) {
      // Ensure the output array has an entry for this layer
      if (!additionalLayers[i]) {
        additionalLayers[i] = { left: [], right: [] };
      }
      const out = additionalLayers[i]!;
      out.left.length = 0;
      out.right.length = 0;
      for (const p of this.additionalLayerBuffers[i]!.left) out.left.push(p);
      for (const p of this.additionalLayerBuffers[i]!.right) out.right.push(p);
    }
    // Trim excess entries if fewer layers than before
    additionalLayers.length = this.additionalLayerBuffers.length;
  }

  /**
   * Fill ONLY the additional-layer trail arrays (allocation-free). The path
   * cache holds base prop paths (propIndex 0/1) only, so overlaid tunnel-layer
   * trails must always be sourced from the live capturer — including when the
   * trails overlay is active (which short-circuits the base real-time fill).
   */
  fillAdditionalLayerTrails(
    additionalLayers: Array<{ left: TrailPoint[]; right: TrailPoint[] }>
  ): void {
    for (let i = 0; i < this.additionalLayerBuffers.length; i++) {
      if (!additionalLayers[i]) {
        additionalLayers[i] = { left: [], right: [] };
      }
      const out = additionalLayers[i]!;
      out.left.length = 0;
      out.right.length = 0;
      for (const p of this.additionalLayerBuffers[i]!.left) out.left.push(p);
      for (const p of this.additionalLayerBuffers[i]!.right) out.right.push(p);
    }
    additionalLayers.length = this.additionalLayerBuffers.length;
  }

  clearTrails(): void {
    this.leftTrailBuffer.clear();
    this.rightTrailBuffer.clear();
    for (const layer of this.additionalLayerBuffers) {
      layer.left.clear();
      layer.right.clear();
    }
    this.lastCapturedPoints.clear();
    this.additionalLayerTrailCaptureSuppressed.length = 0;
    this.animationStartTime = null;
    this.totalPointsCaptured = 0;
  }

  /**
   * Get the appropriate buffer for a prop index and layer
   * @param propIndex - 0=blue, 1=red
   * @param layerIndex - 0=primary, 1+=additional layers
   */
  private getBufferForProp(
    propIndex: 0 | 1,
    layerIndex: number = 0
  ): CircularBuffer<TrailPoint> {
    if (layerIndex === 0) {
      return propIndex === 0 ? this.leftTrailBuffer : this.rightTrailBuffer;
    }
    const additionalIndex = layerIndex - 1;
    this.ensureAdditionalLayerBuffers(additionalIndex + 1);
    const layer = this.additionalLayerBuffers[additionalIndex]!;
    return propIndex === 0 ? layer.left : layer.right;
  }

  /**
   * Ensure additional layer buffers exist for the given count
   */
  private ensureAdditionalLayerBuffers(count: number): void {
    while (this.additionalLayerBuffers.length < count) {
      this.additionalLayerBuffers.push({
        left: new CircularBuffer<TrailPoint>(DEFAULT_BUFFER_CAPACITY),
        right: new CircularBuffer<TrailPoint>(DEFAULT_BUFFER_CAPACITY),
      });
    }
  }

  /**
   * A copy that resumes after formation travel starts a new path at the place
   * it landed. The legacy array renderer has no path-break marker, so its layer
   * buffer must be cleared here; the active overlay path keeps old painted
   * pixels in its accumulator and lets them retire normally.
   */
  private resetAdditionalLayerContinuity(additionalLayerIndex: number): void {
    const buffers = this.additionalLayerBuffers[additionalLayerIndex];
    buffers?.left.clear();
    buffers?.right.clear();
    const prefix = `L${additionalLayerIndex + 1}-`;
    for (const key of this.lastCapturedPoints.keys()) {
      if (key.startsWith(prefix)) this.lastCapturedPoints.delete(key);
    }
  }

  /**
   * Capture trail point for an additional tunnel layer.
   * Uses the canonical prop-aware endpoint assignment shared by both overlays.
   */
  private captureTrailPointForLayer(
    prop: PropState,
    propDimensions: PropDimensions,
    propIndex: 0 | 1,
    flipped: boolean,
    currentTime: number,
    currentStep: number,
    additionalLayerIndex: number
  ): void {
    const propType =
      propIndex === 0 ? this.config.leftPropType : this.config.rightPropType;
    const trailSources = this.resolveTrailSources(propType);

    this.ensureAdditionalLayerBuffers(additionalLayerIndex + 1);
    const layerBuffers = this.additionalLayerBuffers[additionalLayerIndex]!;
    const buffer = propIndex === 0 ? layerBuffers.left : layerBuffers.right;

    const endpointConfig: PropEndpointConfig = {
      canvasSize: this.config.canvasSize,
      propDimensions,
      flipped,
    };

    const minSpacing = this.getAdaptivePointSpacing();

    for (const tracked of trailSources) {
      const endpoint = calculateTrailSourceEndpoint(
        prop,
        endpointConfig,
        tracked.source,
        propType
      );
      if (!endpoint) continue;
      const worldX = endpoint.x;
      const worldY = endpoint.y;
      const tipIndex = endpoint.tipIndex ?? tracked.tipIndex;

      // Use layer-prefixed key to avoid collision with primary layer
      const key = `L${additionalLayerIndex + 1}-${propIndex}-${tracked.sourceKey}`;
      const lastPoint = this.lastCapturedPoints.get(key);

      if (lastPoint === undefined) {
        if (currentTime >= INITIALIZATION_DELAY_MS) {
          buffer.push({
            x: worldX,
            y: worldY,
            timestamp: currentTime,
            propIndex,
            tipIndex,
          });
          this.totalPointsCaptured++;
        }
        this.lastCapturedPoints.set(key, {
          x: worldX,
          y: worldY,
          beat: currentStep,
          timestamp: currentTime,
        });
      } else {
        const distance = Math.hypot(worldX - lastPoint.x, worldY - lastPoint.y);
        const timeSinceLastPoint = currentTime - lastPoint.timestamp; // eslint-disable-line @typescript-eslint/no-unused-vars
        const isInitialJump = distance > INITIAL_JUMP_DISTANCE_THRESHOLD;

        if (isInitialJump) {
          this.lastCapturedPoints.set(key, {
            x: worldX,
            y: worldY,
            beat: currentStep,
            timestamp: currentTime,
          });
        } else if (distance >= minSpacing) {
          buffer.push({
            x: worldX,
            y: worldY,
            timestamp: currentTime,
            propIndex,
            tipIndex,
          });
          this.totalPointsCaptured++;
          this.lastCapturedPoints.set(key, {
            x: worldX,
            y: worldY,
            beat: currentStep,
            timestamp: currentTime,
          });
        } else {
          // Stationary or small move - update the head point's timestamp to keep it fresh.
          // This allows the tail to continue fading/pruning while the head stays at the prop.
          const lastBufferPoint = buffer.last();
          if (lastBufferPoint) {
            lastBufferPoint.timestamp = currentTime;
          }
          this.lastCapturedPoints.set(key, {
            x: worldX,
            y: worldY,
            beat: currentStep,
            timestamp: currentTime,
          });
        }
      }
    }
  }

  /**
   * Detect if animation has looped (for LOOP_CLEAR mode)
   */
  private detectAnimationLoop(currentStep: number | undefined): boolean {
    if (currentStep === undefined) return false;
    const hasLooped =
      this.previousBeatForLoopDetection > 0.5 && currentStep < 0.5;
    this.previousBeatForLoopDetection = currentStep;
    return hasLooped;
  }

  /** Resolve the same canonical or user-assigned trail sources as the overlay
   * renderers. Source-specific keys keep changed custom offsets disconnected
   * from their previous path. */
  private resolveTrailSources(
    propType: string | null | undefined
  ): TrackedTrailSource[] {
    const { trailSettings } = this.config;
    const trailConfig = resolveTrailPointConfig(
      propType,
      trailSettings.trackingMode
    );
    const candidates: Array<{ source: TrailPointSource; logicalEnd: 0 | 1 }> =
      [];

    // HAND carries a single prop-center source on the right slot (left is
    // "none"), so it joins RIGHT_END/BOTH_ENDS on the right. Single-ended props
    // always emit their one right source regardless of mode.
    const tracksRight =
      trailSettings.trackingMode === TrackingMode.RIGHT_END ||
      trailSettings.trackingMode === TrackingMode.BOTH_ENDS ||
      trailSettings.trackingMode === TrackingMode.HAND;

    if (propTipEnds(propType ?? undefined) === 1) {
      candidates.push({ source: trailConfig.right, logicalEnd: 1 });
    } else {
      if (
        trailSettings.trackingMode === TrackingMode.LEFT_END ||
        trailSettings.trackingMode === TrackingMode.BOTH_ENDS
      ) {
        candidates.push({ source: trailConfig.left, logicalEnd: 0 });
      }
      if (tracksRight) {
        candidates.push({ source: trailConfig.right, logicalEnd: 1 });
      }
    }

    const uniqueSources = new Map<string, TrackedTrailSource>();
    for (const { source, logicalEnd } of candidates) {
      if (source.type === "none") continue;
      const sourceKey =
        source.type === "tip"
          ? `tip-${source.index}`
          : `custom-${source.dx}-${source.dy}`;
      if (!uniqueSources.has(sourceKey)) {
        uniqueSources.set(sourceKey, {
          source,
          sourceKey,
          tipIndex: source.type === "tip" ? source.index : logicalEnd,
        });
      }
    }

    return [...uniqueSources.values()];
  }

  /**
   * Capture trail points with distance-based sampling and intelligent cache backfill.
   * Resolves canonical or user-assigned points in prop-local coordinates, then
   * transforms them into canvas space through PropPositionCalculator.
   *
   * Strategy:
   * 1. Distance-based sampling: Only add points when prop moves >N pixels
   * 2. Intelligent backfill: Use cache to fill gaps during device stutters
   * 3. Adaptive density: Adjust spacing based on device performance
   */
  private captureTrailPoint(
    prop: PropState,
    propDimensions: PropDimensions,
    propIndex: 0 | 1,
    flipped: boolean,
    currentTime: number,
    currentStep: number
  ): void {
    const { trailSettings } = this.config;
    const propType =
      propIndex === 0 ? this.config.leftPropType : this.config.rightPropType;

    const trailSources = this.resolveTrailSources(propType);

    const endpointConfig: PropEndpointConfig = {
      canvasSize: this.config.canvasSize,
      propDimensions,
      flipped,
    };

    // Select buffer based on prop index (primary layer)
    const buffer = this.getBufferForProp(propIndex, 0);

    // Get adaptive point spacing
    const minSpacing = this.getAdaptivePointSpacing();

    for (const tracked of trailSources) {
      const endpoint = calculateTrailSourceEndpoint(
        prop,
        endpointConfig,
        tracked.source,
        propType
      );
      if (!endpoint) continue;
      const worldX = endpoint.x;
      const worldY = endpoint.y;
      const tipIndex = endpoint.tipIndex ?? tracked.tipIndex;

      const key = `${propIndex}-${tracked.sourceKey}`;
      const lastPoint = this.lastCapturedPoints.get(key);

      // FIRST POINT: Wait for animation initialization
      if (lastPoint === undefined) {
        // Only capture first point after initialization delay
        if (currentTime >= INITIALIZATION_DELAY_MS) {
          buffer.push({
            x: worldX,
            y: worldY,
            timestamp: currentTime,
            propIndex,
            tipIndex,
          });
          this.totalPointsCaptured++;
        }

        // Always update tracking position (even if we don't capture the point yet)
        this.lastCapturedPoints.set(key, {
          x: worldX,
          y: worldY,
          beat: currentStep,
          timestamp: currentTime,
        });
      } else {
        // SUBSEQUENT POINTS: Use distance-based sampling with optional cache backfill

        const beatDelta = Math.abs(currentStep - lastPoint.beat);

        // Check if we have a LARGE beat gap (seeking or major stutter)
        const hasLargeBeatGap = beatDelta > LARGE_BEAT_GAP_THRESHOLD;

        if (
          hasLargeBeatGap &&
          tracked.source.type === "tip" &&
          trailSettings.usePathCache &&
          this.animationCacheService?.isValid()
        ) {
          // CACHE BACKFILL: Device stuttered - fill gap with pre-computed points
          const cachedPoints = this.animationCacheService.getCachedPoints(
            propIndex,
            tipIndex,
            lastPoint.beat,
            currentStep,
            this.config.canvasSize
          );

          // Add cached points but apply distance filtering to maintain consistent spacing
          let lastAddedX = lastPoint.x;
          let lastAddedY = lastPoint.y;

          for (const cachedPoint of cachedPoints) {
            const dist = Math.hypot(
              cachedPoint.x - lastAddedX,
              cachedPoint.y - lastAddedY
            );

            if (dist >= minSpacing) {
              buffer.push(cachedPoint);
              this.totalPointsCaptured++;
              lastAddedX = cachedPoint.x;
              lastAddedY = cachedPoint.y;
            }
          }

          // Update last captured point
          this.lastCapturedPoints.set(key, {
            x: worldX,
            y: worldY,
            beat: currentStep,
            timestamp: currentTime,
          });
        } else {
          // REAL-TIME SAMPLING: Normal playback - use distance-based sampling
          const distance = Math.hypot(
            worldX - lastPoint.x,
            worldY - lastPoint.y
          );
          const timeSinceLastPoint = currentTime - lastPoint.timestamp; // eslint-disable-line @typescript-eslint/no-unused-vars

          // Detect initial jump (from default position to first beat position)
          const isInitialJump = distance > INITIAL_JUMP_DISTANCE_THRESHOLD;

          if (isInitialJump) {
            // Just update the tracking position without adding a trail point
            this.lastCapturedPoints.set(key, {
              x: worldX,
              y: worldY,
              beat: currentStep,
              timestamp: currentTime,
            });
          } else if (distance >= minSpacing) {
            // Normal trail capture - add point if prop moved far enough
            buffer.push({
              x: worldX,
              y: worldY,
              timestamp: currentTime,
              propIndex,
              tipIndex,
            });

            this.totalPointsCaptured++;
            this.lastCapturedPoints.set(key, {
              x: worldX,
              y: worldY,
              beat: currentStep,
              timestamp: currentTime,
            });
          } else {
            // Stationary or small move - update the head point's timestamp to keep it fresh.
            // This allows the tail to continue fading/pruning while the head stays at the prop.
            const lastBufferPoint = buffer.last();
            if (lastBufferPoint) {
              lastBufferPoint.timestamp = currentTime;
            }
            this.lastCapturedPoints.set(key, {
              x: worldX,
              y: worldY,
              beat: currentStep,
              timestamp: currentTime,
            });
          }
        }
      }
    }

    // CRITICAL: Prevent unbounded memory growth during long playback sessions
    // If we've accumulated too many points (e.g., playing for hours), prune aggressively
    if (this.totalPointsCaptured > MAX_TOTAL_POINTS_BEFORE_PRUNE) {
      this.pruneToReasonableSize(currentTime);
    }
  }

  /**
   * Emergency memory pruning - keeps only recent trail points
   * Called when total points exceed safety threshold
   */
  private pruneToReasonableSize(currentTime: number): void {
    const cutoffTime = currentTime - EMERGENCY_PRUNE_KEEP_DURATION_MS;

    this.leftTrailBuffer.filterInPlace((p) => p.timestamp > cutoffTime);
    this.rightTrailBuffer.filterInPlace((p) => p.timestamp > cutoffTime);
    for (const layer of this.additionalLayerBuffers) {
      layer.left.filterInPlace((p) => p.timestamp > cutoffTime);
      layer.right.filterInPlace((p) => p.timestamp > cutoffTime);
    }

    // Reset counter
    let total = this.leftTrailBuffer.length + this.rightTrailBuffer.length;
    for (const layer of this.additionalLayerBuffers) {
      total += layer.left.length + layer.right.length;
    }
    this.totalPointsCaptured = total;
  }

  /**
   * Get minimum point spacing based on device performance
   * Returns distance in pixels that prop must move before adding a new trail point
   */
  private getAdaptivePointSpacing(): number {
    if (this.performanceMonitor) {
      return this.performanceMonitor.getAdaptivePointSpacing();
    }
    return DEFAULT_POINT_SPACING;
  }

  /**
   * Remove old trail points based on fade duration
   * Uses animation-relative timestamps (0ms to totalDurationMs)
   */
  private pruneOldTrailPoints(currentTime: number): void {
    if (this.config.trailSettings.mode !== TrailMode.FADE) return;

    const cutoffTime = currentTime - this.config.trailSettings.fadeDurationMs;

    // O(n) but only when needed (fade mode)
    // CRITICAL FIX: Also remove points with timestamp > currentTime
    // These are leftover points from a previous loop iteration.
    // When the animation loops, animRelativeTime resets to near 0, but old points
    // from the previous loop have high timestamps (e.g., 8000ms). Without this check,
    // the cutoffTime becomes negative and those old points are incorrectly kept,
    // causing the renderer to draw lines connecting distant positions.
    const isValidPoint = (p: TrailPoint) =>
      p.timestamp > cutoffTime && p.timestamp <= currentTime;

    this.leftTrailBuffer.filterInPlace(isValidPoint);
    this.rightTrailBuffer.filterInPlace(isValidPoint);
    for (const layer of this.additionalLayerBuffers) {
      layer.left.filterInPlace(isValidPoint);
      layer.right.filterInPlace(isValidPoint);
    }
  }
}
