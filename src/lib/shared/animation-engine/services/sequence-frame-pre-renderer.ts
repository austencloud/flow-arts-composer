/**
 * Sequence Frame Pre-Renderer
 *
 * Pre-renders entire animation sequence to ImageBitmap frames for perfect smooth playback.
 *
 * Two-phase approach:
 * 1. Immediate preview with current rendering (may stutter)
 * 2. Background pre-render to ImageBitmap frames (perfect smoothness)
 *
 * Once pre-render completes, playback switches to frame-based rendering
 * which is immune to device stutters and provides perfect trail loops.
 */

import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SequenceAnimationOrchestrator } from "#lib/shared/animation-engine/services/sequence-animation-orchestrator.js";
import type { IAnimationRenderer as AnimationRenderer } from "#lib/shared/animation-engine/services/IAnimationRenderer.js";
import type { TrailSettings } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
import { getLetterImagePath } from "#lib/shared/pictograph/tka-glyph/utils/letter-image-getter.js";
/**
 * Pre-rendered frame data
 */
export interface PreRenderedFrame {
  /** Frame number (0-indexed) */
  frameNumber: number;
  /** Beat number this frame represents */
  beat: number;
  /** Timestamp in ms from animation start */
  timestamp: number;
  /** Rendered frame as ImageBitmap (GPU-ready) */
  bitmap: ImageBitmap;
}

/**
 * Complete pre-rendered sequence
 */
export interface PreRenderedSequence {
  /** Sequence ID for cache lookup */
  sequenceId: string;
  /** Array of all frames */
  frames: PreRenderedFrame[];
  /** Total duration in ms */
  totalDurationMs: number;
  /** Total steps */
  totalSteps: number;
  /** Frames per second */
  fps: number;
  /** Canvas size used for rendering */
  canvasSize: number;
  /** Whether this sequence is fully rendered and ready */
  isComplete: boolean;
}

/**
 * Progress callback for UI updates
 */
export interface PreRenderProgress {
  /** Current frame being rendered */
  currentFrame: number;
  /** Total frames to render */
  totalFrames: number;
  /** Progress percentage (0-100) */
  percent: number;
  /** Estimated time remaining in seconds */
  estimatedSecondsRemaining: number;
}

/**
 * Configuration for pre-rendering
 */
export interface PreRenderConfig {
  /** Frames per second (default: 60) */
  fps: number;
  /** Canvas size (default: 950) */
  canvasSize: number;
  /** Whether to use requestIdleCallback for non-blocking render (default: true) */
  nonBlocking: boolean;
  /** Max frames to render per chunk in non-blocking mode (default: 5) */
  framesPerChunk: number;
  /** Trail settings for rendering */
  trailSettings: TrailSettings;
}

const DEFAULT_CONFIG: PreRenderConfig = {
  fps: 60,
  canvasSize: 950,
  nonBlocking: true,
  framesPerChunk: 5,
  trailSettings: {} as TrailSettings, // Will be provided by caller
};

/**
 * Sequence Frame Pre-Renderer Service
 *
 * Pre-renders entire animation to ImageBitmap frames for stutter-free playback.
 */
export class SequenceFramePreRenderer {
  private currentRender: PreRenderedSequence | null = null;
  private isRendering = false;
  private shouldCancel = false;
  private offscreenRenderer: AnimationRenderer | null = null;
  private offscreenContainer: HTMLDivElement | null = null;
  private loadedGlyphs = new Set<Letter>(); // Track which glyphs have been loaded

  // Memory management: Track loops and auto-cleanup
  private loopCount = 0;
  private readonly MAX_LOOPS_BEFORE_CLEANUP = 5; // Clear frames after N loops to prevent memory accumulation
  private isDisposed = false;

  constructor(
    private readonly orchestrator: SequenceAnimationOrchestrator,
    private readonly renderer: AnimationRenderer
  ) {}

  /**
   * Create offscreen Canvas2DAnimationRenderer for pre-rendering
   * This is completely separate from the visible renderer and never touches the DOM
   */
  private async createOffscreenRenderer(
    size: number,
    _trailSettings: TrailSettings
  ): Promise<AnimationRenderer> {
    // Create offscreen container (not attached to DOM)
    this.offscreenContainer = document.createElement("div");
    this.offscreenContainer.style.position = "absolute";
    this.offscreenContainer.style.left = "-9999px"; // Off-screen
    this.offscreenContainer.style.top = "-9999px";
    this.offscreenContainer.style.width = `${size}px`;
    this.offscreenContainer.style.height = `${size}px`;
    this.offscreenContainer.style.pointerEvents = "none";

    // Add to document temporarily (Canvas needs it in DOM to initialize)
    document.body.appendChild(this.offscreenContainer);

    // Import Canvas2DAnimationRenderer class directly
    const { Canvas2DAnimationRenderer } =
      await import("#lib/shared/animation-engine/services/canvas-2d-animation-renderer.js");
    const offscreenRenderer = new Canvas2DAnimationRenderer();

    // Initialize with offscreen container
    await offscreenRenderer.initialize(this.offscreenContainer, size, 1.0);

    return offscreenRenderer;
  }

  /**
   * Load glyph texture for a specific letter into the offscreen renderer
   * Uses caching to avoid reloading the same letter multiple times
   */
  private async loadGlyphTextureForLetter(letter: Letter): Promise<void> {
    // Skip if already loaded
    if (this.loadedGlyphs.has(letter)) {
      return;
    }

    if (!this.offscreenRenderer) {
      console.warn(
        "[SequenceFramePreRenderer] Cannot load glyph - offscreen renderer not initialized"
      );
      return;
    }

    try {
      // Fetch the letter SVG file
      const imagePath = getLetterImagePath(letter);
      const response = await fetch(imagePath);

      if (!response.ok) {
        console.warn(
          `[SequenceFramePreRenderer] Failed to fetch letter ${letter} from ${imagePath}`
        );
        this.loadedGlyphs.add(letter); // Mark as attempted to avoid repeated failures
        return;
      }

      let svgText = await response.text();

      // Parse original viewBox to get glyph dimensions
      const viewBoxMatch = svgText.match(
        /viewBox\s*=\s*"([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)"/i
      );
      const viewBoxWidth = viewBoxMatch?.[3]
        ? parseFloat(viewBoxMatch[3])
        : 100;
      const viewBoxHeight = viewBoxMatch?.[4]
        ? parseFloat(viewBoxMatch[4])
        : 100;

      // CRITICAL: Modify SVG to have full 950x950 viewBox (matching GlyphRenderer.svelte logic)
      // This ensures the glyph appears at the correct position when rendered
      svgText = svgText.replace(
        /viewBox\s*=\s*"[\d.-]+\s+[\d.-]+\s+[\d.-]+\s+[\d.-]+"/i,
        'viewBox="0 0 950 950"'
      );
      svgText = svgText.replace(/width\s*=\s*"[\d.-]+"/i, 'width="950"');
      svgText = svgText.replace(/height\s*=\s*"[\d.-]+"/i, 'height="950"');

      // Load texture into offscreen renderer
      await this.offscreenRenderer.loadGlyphTexture(
        svgText,
        viewBoxWidth,
        viewBoxHeight
      );

      // Mark as loaded
      this.loadedGlyphs.add(letter);
    } catch (error) {
      console.error(
        `[SequenceFramePreRenderer] Error loading glyph for letter ${letter}:`,
        error
      );
      this.loadedGlyphs.add(letter); // Mark as attempted to avoid repeated failures
    }
  }

  /**
   * Pre-render entire sequence to frames
   *
   * @param sequenceData - Sequence to render
   * @param config - Rendering configuration
   * @param onProgress - Progress callback for UI updates
   * @returns Promise resolving to pre-rendered sequence
   */
  async preRenderSequence(
    sequenceData: SequenceData,
    config: Partial<PreRenderConfig> = {},
    onProgress?: (progress: PreRenderProgress) => void
  ): Promise<PreRenderedSequence> {
    const fullConfig = { ...DEFAULT_CONFIG, ...config };

    // Prevent multiple simultaneous renders
    if (this.isRendering) {
      throw new Error("Pre-render already in progress. Cancel first.");
    }

    this.isRendering = true;
    this.shouldCancel = false;

    try {
      // Initialize orchestrator with sequence data
      const initSuccess =
        this.orchestrator.initializeWithDomainData(sequenceData);
      if (!initSuccess) {
        throw new Error("Failed to initialize orchestrator with sequence data");
      }

      const metadata = this.orchestrator.getMetadata();
      const totalSteps = metadata.totalSteps;
      const stepDurationMs = 1000; // Assuming 1 second per beat (adjust as needed)
      const totalDurationMs = totalSteps * stepDurationMs;
      const frameTimeMs = 1000 / fullConfig.fps;
      const totalFrames = Math.ceil(totalDurationMs / frameTimeMs);

      const frames: PreRenderedFrame[] = [];
      const startTime = performance.now();

      // Create offscreen canvas for rendering
      const offscreenCanvas = new OffscreenCanvas(
        fullConfig.canvasSize,
        fullConfig.canvasSize
      );
      const ctx = offscreenCanvas.getContext("2d");
      if (!ctx) {
        throw new Error("Failed to get 2D context from offscreen canvas");
      }

      // Render frames
      if (fullConfig.nonBlocking) {
        // Non-blocking: Render in chunks using requestIdleCallback
        await this.renderFramesNonBlocking(
          frames,
          totalFrames,
          totalSteps,
          stepDurationMs,
          frameTimeMs,
          offscreenCanvas,
          ctx,
          fullConfig,
          startTime,
          onProgress
        );
      } else {
        // Blocking: Render all frames immediately (for fast devices)
        await this.renderFramesBlocking(
          frames,
          totalFrames,
          totalSteps,
          stepDurationMs,
          frameTimeMs,
          offscreenCanvas,
          ctx,
          fullConfig,
          startTime,
          onProgress
        );
      }

      this.currentRender = {
        sequenceId: sequenceData.id,
        frames,
        totalDurationMs,
        totalSteps,
        fps: fullConfig.fps,
        canvasSize: fullConfig.canvasSize,
        isComplete: true,
      };

      return this.currentRender;
    } finally {
      this.isRendering = false;
    }
  }

  /**
   * Render frames in non-blocking chunks
   */
  private async renderFramesNonBlocking(
    frames: PreRenderedFrame[],
    totalFrames: number,
    totalSteps: number,
    stepDurationMs: number,
    frameTimeMs: number,
    offscreenCanvas: OffscreenCanvas,
    ctx: OffscreenCanvasRenderingContext2D,
    config: PreRenderConfig,
    startTime: number,
    onProgress?: (progress: PreRenderProgress) => void
  ): Promise<void> {
    let currentFrame = 0;

    while (currentFrame < totalFrames && !this.shouldCancel) {
      // Render chunk of frames
      const chunkEnd = Math.min(
        currentFrame + config.framesPerChunk,
        totalFrames
      );

      for (let frame = currentFrame; frame < chunkEnd; frame++) {
        await this.renderSingleFrame(
          frame,
          frames,
          totalSteps,
          stepDurationMs,
          frameTimeMs,
          offscreenCanvas,
          ctx,
          config
        );
      }

      currentFrame = chunkEnd;

      // Update progress
      if (onProgress) {
        const elapsed = performance.now() - startTime;
        const avgTimePerFrame = elapsed / currentFrame;
        const remainingFrames = totalFrames - currentFrame;
        const estimatedRemaining = (avgTimePerFrame * remainingFrames) / 1000;

        onProgress({
          currentFrame,
          totalFrames,
          percent: (currentFrame / totalFrames) * 100,
          estimatedSecondsRemaining: estimatedRemaining,
        });
      }

      // Yield to browser (non-blocking)
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    if (this.shouldCancel) {
      throw new Error("Pre-render cancelled");
    }
  }

  /**
   * Render all frames immediately (blocking)
   */
  private async renderFramesBlocking(
    frames: PreRenderedFrame[],
    totalFrames: number,
    totalSteps: number,
    stepDurationMs: number,
    frameTimeMs: number,
    offscreenCanvas: OffscreenCanvas,
    ctx: OffscreenCanvasRenderingContext2D,
    config: PreRenderConfig,
    startTime: number,
    onProgress?: (progress: PreRenderProgress) => void
  ): Promise<void> {
    for (let frame = 0; frame < totalFrames; frame++) {
      if (this.shouldCancel) {
        throw new Error("Pre-render cancelled");
      }

      await this.renderSingleFrame(
        frame,
        frames,
        totalSteps,
        stepDurationMs,
        frameTimeMs,
        offscreenCanvas,
        ctx,
        config
      );

      // Update progress every 10 frames
      if (onProgress && frame % 10 === 0) {
        const elapsed = performance.now() - startTime;
        const avgTimePerFrame = elapsed / (frame + 1);
        const remainingFrames = totalFrames - frame - 1;
        const estimatedRemaining = (avgTimePerFrame * remainingFrames) / 1000;

        onProgress({
          currentFrame: frame + 1,
          totalFrames,
          percent: ((frame + 1) / totalFrames) * 100,
          estimatedSecondsRemaining: estimatedRemaining,
        });
      }
    }
  }

  /**
   * Render a single frame using offscreen renderer
   */
  private async renderSingleFrame(
    frameNumber: number,
    frames: PreRenderedFrame[],
    totalSteps: number,
    stepDurationMs: number,
    frameTimeMs: number,
    offscreenCanvas: OffscreenCanvas,
    ctx: OffscreenCanvasRenderingContext2D,
    config: PreRenderConfig
  ): Promise<void> {
    const timestamp = frameNumber * frameTimeMs;
    const playbackPosition = (timestamp / stepDurationMs) % totalSteps;

    // Create offscreen renderer on first frame
    if (!this.offscreenRenderer) {
      this.offscreenRenderer = await this.createOffscreenRenderer(
        config.canvasSize,
        config.trailSettings
      );

      // Load textures to offscreen renderer
      const metadata = this.orchestrator.getMetadata();

      // Use per-color prop types - propType removed from sequences (viewer preference)
      if (metadata.leftPropType && metadata.rightPropType) {
        await this.offscreenRenderer.loadPerColorPropTextures(
          metadata.leftPropType,
          metadata.rightPropType
        );
      }

      if (metadata.gridMode) {
        await this.offscreenRenderer.loadGridTexture(metadata.gridMode);
      }
    }

    // Calculate animation state for this playback position
    this.orchestrator.calculateState(playbackPosition);
    const leftProp = this.orchestrator.getLeftPropState();
    const rightProp = this.orchestrator.getRightPropState();
    const currentLetter = this.orchestrator.getCurrentLetter();

    // CRITICAL FIX: Load glyph texture for current letter if present
    // Without this, pre-rendered frames don't have glyphs
    if (currentLetter) {
      await this.loadGlyphTextureForLetter(currentLetter);
    }

    // Get prop dimensions from metadata
    const metadata = this.orchestrator.getMetadata();
    const leftPropDimensions = metadata.leftPropDimensions || {
      width: 50,
      height: 150,
    };
    const rightPropDimensions = metadata.rightPropDimensions || {
      width: 50,
      height: 150,
    };

    // Render the frame to offscreen renderer
    // Note: For pre-rendering, we don't need trails (they'd just be static snapshots)
    // We're capturing the full frame which includes everything

    // Check if props should be flipped (Buugeng family only) and get prop types
    let leftPropFlipped = false;
    let rightPropFlipped = false;
    let leftPropType = "staff";
    let rightPropType = "staff";
    try {
      const settingsState = settingsService;
      const settings = settingsState.currentSettings;
      const buugengFamily = ["buugeng", "bigbuugeng"];
      leftPropType = (
        settings?.leftPropType ||
        settings?.propType ||
        "staff"
      ).toLowerCase();
      rightPropType = (
        settings?.rightPropType ||
        settings?.propType ||
        "staff"
      ).toLowerCase();
      leftPropFlipped = buugengFamily.includes(leftPropType)
        ? (settings?.leftBuugengFlipped ?? false)
        : false;
      rightPropFlipped = buugengFamily.includes(rightPropType)
        ? (settings?.rightBuugengFlipped ?? false)
        : false;
    } catch {
      // Settings not available, use defaults
    }

    this.offscreenRenderer.renderScene({
      leftProp,
      rightProp,
      gridVisible: true,
      gridMode: (metadata.gridMode ?? null) as string | null, // renderScene expects string|null
      letter: currentLetter,
      turnsTuple: null,
      leftPropDimensions,
      rightPropDimensions,
      leftTrailPoints: [], // No trails in pre-render frames
      rightTrailPoints: [],
      trailSettings: config.trailSettings,
      currentTime: timestamp,
      visibility: {
        gridVisible: true,
        propsVisible: true,
        trailsVisible: false, // No trails in pre-render
        leftMotionVisible: true,
        rightMotionVisible: true,
      },
      leftPropFlipped,
      rightPropFlipped,
      leftPropType,
      rightPropType,
    });

    // Capture the rendered frame as ImageBitmap
    const bitmap = await this.offscreenRenderer.captureFrame();

    frames.push({
      frameNumber,
      beat: playbackPosition,
      timestamp,
      bitmap,
    });
  }

  /**
   * Get frame for specific timestamp
   *
   * @param timestamp - Time in ms from animation start
   * @returns Frame bitmap or null if not available
   */
  getFrameAtTimestamp(timestamp: number): ImageBitmap | null {
    if (!this.currentRender?.isComplete) {
      return null;
    }

    const frameIndex = Math.floor((timestamp / 1000) * this.currentRender.fps);
    const frame = this.currentRender.frames[frameIndex];

    return frame?.bitmap || null;
  }

  /**
   * Get frame for specific beat number
   *
   * @param beat - Beat number (fractional)
   * @returns Frame bitmap or null if not available
   */
  getFrameAtBeat(beat: number): ImageBitmap | null {
    if (!this.currentRender?.isComplete) {
      return null;
    }

    const stepDurationMs =
      this.currentRender.totalDurationMs / this.currentRender.totalSteps;
    const timestamp = beat * stepDurationMs;

    return this.getFrameAtTimestamp(timestamp);
  }

  /**
   * Cancel current pre-render operation
   */
  cancel(): void {
    this.shouldCancel = true;
    // Immediately clean up offscreen resources on cancel to prevent memory leaks
    this.cleanupOffscreenResources();
  }

  /**
   * Notify that the animation has looped.
   * Call this from the playback controller when a loop is detected.
   * After MAX_LOOPS_BEFORE_CLEANUP loops, automatically clears frames to free memory.
   * Returns true if cleanup was performed.
   */
  notifyLoop(): boolean {
    this.loopCount++;

    if (this.loopCount >= this.MAX_LOOPS_BEFORE_CLEANUP) {
      this.clear();
      this.loopCount = 0;
      return true;
    }

    return false;
  }

  /**
   * Reset loop counter (call when sequence changes)
   */
  resetLoopCount(): void {
    this.loopCount = 0;
  }

  /**
   * Clean up offscreen rendering resources without clearing cached frames
   */
  private cleanupOffscreenResources(): void {
    if (this.offscreenRenderer) {
      try {
        this.offscreenRenderer.destroy();
      } catch (e) {
        console.warn(
          "[SequenceFramePreRenderer] Error destroying offscreen renderer:",
          e
        );
      }
      this.offscreenRenderer = null;
    }

    if (this.offscreenContainer?.parentElement) {
      try {
        this.offscreenContainer.parentElement.removeChild(
          this.offscreenContainer
        );
      } catch (e) {
        console.warn(
          "[SequenceFramePreRenderer] Error removing offscreen container:",
          e
        );
      }
      this.offscreenContainer = null;
    }
  }

  /**
   * Check if pre-render is in progress
   */
  isPreRendering(): boolean {
    return this.isRendering;
  }

  /**
   * Check if sequence is ready for playback
   */
  isReady(): boolean {
    return this.currentRender?.isComplete || false;
  }

  /**
   * Get current pre-rendered sequence
   */
  getCurrentSequence(): PreRenderedSequence | null {
    return this.currentRender;
  }

  /**
   * Clear pre-rendered frames (free memory)
   */
  clear(): void {
    if (this.currentRender) {
      // Close all ImageBitmaps to free GPU memory
      for (const frame of this.currentRender.frames) {
        try {
          frame.bitmap.close();
        } catch {
          // ImageBitmap may already be closed
        }
      }
      this.currentRender = null;
    }

    // Clean up offscreen resources
    this.cleanupOffscreenResources();

    // Clear loaded glyphs cache
    this.loadedGlyphs.clear();

    // Reset loop counter
    this.loopCount = 0;
  }

  /**
   * Full disposal - call when the component using this service is destroyed
   */
  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;

    // Cancel any in-progress render
    this.shouldCancel = true;

    // Clear all resources
    this.clear();
  }
}
