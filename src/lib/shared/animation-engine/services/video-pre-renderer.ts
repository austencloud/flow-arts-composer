/**
 * VideoPreRenderer
 *
 * Generates videos from animation sequences using the Canvas2D renderer.
 * This ensures the video looks identical to the live preview.
 *
 * How it works:
 * 1. Create an offscreen Canvas2D renderer (same as the visible one)
 * 2. Load actual SVG images (grid, props) - NOT fake shapes
 * 3. For each video frame:
 *    a. Calculate prop states using the orchestrator
 *    b. Render the frame using Canvas2D (real SVGs, real trails)
 *    c. Capture the frame
 * 4. Encode to video using MediaRecorder
 * 5. Cache in IndexedDB for instant replay
 *
 * The result is a video that looks EXACTLY like the live preview.
 */

import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export interface VideoRenderProgress {
  /** Current frame being rendered */
  currentFrame: number;
  /** Total frames to render */
  totalFrames: number;
  /** Progress percentage (0-100) */
  percent: number;
  /** Estimated time remaining in ms */
  estimatedTimeRemaining: number;
  /** Current phase: 'rendering' | 'encoding' | 'complete' */
  phase: "rendering" | "encoding" | "complete";
}

export interface VideoRenderResult {
  /** Whether rendering succeeded */
  success: boolean;
  /** Video blob (if successful) */
  videoBlob?: Blob;
  /** Blob URL for playback (if successful) */
  blobUrl?: string;
  /** Video duration in seconds */
  duration?: number;
  /** Error message (if failed) */
  error?: string;
  /** Sequence ID this video was generated for */
  sequenceId: string;
}

export interface VideoRenderOptions {
  /** Target FPS for the video (default: 60) */
  fps?: number;
  /** Video width in pixels (default: canvas size) */
  width?: number;
  /** Video height in pixels (default: canvas size) */
  height?: number;
  /** Playback speed multiplier (default: 1) */
  speed?: number;
  /** Whether to include trails in the render */
  includeTrails?: boolean;
  /** Video format: 'webm' or 'mp4' (default: 'webm') */
  format?: "webm" | "mp4";
  /** Video quality (0-1, default: 0.9) */
  quality?: number;
}
import { Canvas2DAnimationRenderer } from "#lib/shared/animation-engine/services/canvas-2d-animation-renderer.js";
import { generateLeftPropSvg, generateRightPropSvg } from "#lib/shared/animation-engine/services/svg-generator.js";
import { getSequenceAnimationOrchestrator } from "#lib/shared/animation-engine/get-sequence-animation-orchestrator.js";

import {
  DEFAULT_TRAIL_SETTINGS,
  type TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";

// IndexedDB database name and store for video caching
const DB_NAME = "tka-video-cache";
const STORE_NAME = "videos";
const DB_VERSION = 1;

export class VideoPreRenderer {
  private db: IDBDatabase | null = null;
  private isCurrentlyRendering = false;
  private cancelRequested = false;
  private cachedBlobUrls = new Map<string, string>();

  /**
   * Initialize IndexedDB for video caching
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "sequenceId" });
        }
      };
    });
  }

  /**
   * Generate a unique sequence ID for caching
   */
  generateSequenceId(sequence: SequenceData): string {
    const word = sequence.word || sequence.name || "unknown";
    const stepCount = sequence.steps.length || 0;
    const hash = this.simpleHash(
      JSON.stringify(sequence.steps.slice(0, 3) || [])
    );
    return `${word}-${stepCount}-${hash}`;
  }

  /**
   * Simple hash function for sequence identification
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 6);
  }

  /**
   * Pre-render a sequence to video using the REAL PixiJS renderer
   *
   * This creates a video that looks identical to the live preview
   * because it uses the same rendering pipeline with real SVG assets.
   */
  async renderSequenceToVideo(
    sequence: SequenceData,
    _canvas: HTMLCanvasElement, // Ignored - we use our own offscreen renderer
    options: VideoRenderOptions = {},
    onProgress?: (progress: VideoRenderProgress) => void
  ): Promise<VideoRenderResult> {
    const sequenceId = this.generateSequenceId(sequence);

    // Check if already rendering
    if (this.isCurrentlyRendering) {
      return {
        success: false,
        error: "A render is already in progress",
        sequenceId,
      };
    }

    // Check for cached video first
    const cached = await this.getCachedVideo(sequenceId);
    if (cached?.success) {
      return cached;
    }

    this.isCurrentlyRendering = true;
    this.cancelRequested = false;

    const {
      fps = 60, // eslint-disable-line @typescript-eslint/no-unused-vars
      quality = 0.9,
      format = "webm",
      width = 500,
      height = 500,
    } = options;

    const totalSteps = sequence.steps.length || 0;
    if (totalSteps === 0) {
      this.isCurrentlyRendering = false;
      return {
        success: false,
        error: "Sequence has no steps",
        sequenceId,
      };
    }

    // Create offscreen container for PixiJS
    // IMPORTANT: Use opacity: 0 instead of visibility: hidden
    // visibility: hidden can prevent canvas rendering in some browsers
    const offscreenContainer = document.createElement("div");
    offscreenContainer.style.cssText = `
      position: fixed;
      left: 0;
      top: 0;
      width: ${width}px;
      height: ${height}px;
      opacity: 0;
      pointer-events: none;
      z-index: -9999;
    `;
    document.body.appendChild(offscreenContainer);

    // Create the Canvas2D renderer (same as live preview)
    const canvasRenderer = new Canvas2DAnimationRenderer();

    try {
      // Report preparation phase
      onProgress?.({
        currentFrame: 0,
        totalFrames: 0,
        percent: 0,
        estimatedTimeRemaining: 0,
        phase: "rendering",
      });

      // Initialize Canvas2D with offscreen container
      await canvasRenderer.initialize(offscreenContainer, width, 1);

      // Load REAL grid and prop images (the actual SVGs!)
      await Promise.all([
        canvasRenderer.loadGridTexture("diamond"),
        canvasRenderer.loadPropTextures("staff"),
      ]);

      // Get prop dimensions from SVG generator
      const [leftPropData, rightPropData] = await Promise.all([
        generateLeftPropSvg("staff"),
        generateRightPropSvg("staff"),
      ]);

      const leftPropDimensions = {
        width: leftPropData.width,
        height: leftPropData.height,
      };
      const rightPropDimensions = {
        width: rightPropData.width,
        height: rightPropData.height,
      };

      // Get orchestrator for calculating prop states
      const orchestrator = getSequenceAnimationOrchestrator();

      // Initialize orchestrator with sequence data
      const initSuccess = orchestrator.initializeWithDomainData(sequence);
      if (!initSuccess) {
        throw new Error("Failed to initialize orchestrator with sequence data");
      }

      // Get the canvas for MediaRecorder
      const canvas = canvasRenderer.getCanvas();
      if (!canvas) {
        throw new Error("Failed to get canvas from PixiJS renderer");
      }

      // Use on-demand frame capture for precise control
      // captureStream(0) = manual frame capture mode
      const stream = canvas.captureStream(0);
      const videoTrack = stream.getVideoTracks()[0];

      const preferredMimeType =
        format === "webm" ? "video/webm;codecs=vp9" : "video/mp4";

      const mimeType = MediaRecorder.isTypeSupported(preferredMimeType)
        ? preferredMimeType
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: quality * 8_000_000,
      });

      const recordedChunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      // Start recording - use smaller chunks for smoother capture
      mediaRecorder.start(50);

      // Use 30fps for smoother video (60fps causes timing issues)
      const videoFps = 30;
      const totalFrames = Math.ceil(totalSteps * videoFps);
      const frameDuration = 1000 / videoFps; // ~33.3ms per frame
      const startTime = performance.now();

      // Trail settings for rendering
      const trailSettings: TrailSettings = {
        ...DEFAULT_TRAIL_SETTINGS,
      };

      // Get settings for Buugeng flip and prop types
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

      // Helper function to capture a frame reliably
      const captureFrame = async (): Promise<void> => {
        // Wait for two animation frames to ensure the render is fully painted
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });

        // Request frame capture from the video track
        // @ts-expect-error - requestFrame is available when captureStream(0)
        if (videoTrack.requestFrame) {
          // @ts-expect-error - requestFrame is available when captureStream(0)
          videoTrack.requestFrame();
        }

        // Small delay to ensure MediaRecorder captures the frame
        await new Promise((resolve) => setTimeout(resolve, frameDuration));
      };

      // Render each frame using the REAL PixiJS renderer
      for (let frameIndex = 0; frameIndex <= totalFrames; frameIndex++) {
        if (this.cancelRequested) {
          mediaRecorder.stop();
          canvasRenderer.destroy();
          offscreenContainer.remove();
          this.isCurrentlyRendering = false;
          return {
            success: false,
            error: "Render cancelled",
            sequenceId,
          };
        }

        // Calculate playback position for this frame (at 60 BPM = 1 beat per second)
        const playbackPosition = frameIndex / videoFps;

        // Get prop states from orchestrator
        orchestrator.calculateState(playbackPosition);
        const leftProp = orchestrator.getLeftPropState();
        const rightProp = orchestrator.getRightPropState();

        // Render the scene using REAL PixiJS (with actual SVGs!)
        canvasRenderer.renderScene({
          leftProp,
          rightProp,
          gridVisible: true,
          gridMode: "diamond",
          letter: null,
          turnsTuple: null,
          leftPropDimensions,
          rightPropDimensions,
          leftTrailPoints: [], // TODO: Add trail points from TrailPathGenerator
          rightTrailPoints: [],
          trailSettings,
          currentTime: performance.now(),
          visibility: {
            gridVisible: true,
            propsVisible: true,
            trailsVisible: true,
            leftMotionVisible: true,
            rightMotionVisible: true,
          },
          leftPropFlipped,
          rightPropFlipped,
          leftPropType,
          rightPropType,
        });

        // Capture this frame
        await captureFrame();

        // Report progress
        if (frameIndex % 10 === 0) {
          const percent = (frameIndex / totalFrames) * 100;
          const elapsed = performance.now() - startTime;
          const estimatedTotal = (elapsed / (frameIndex + 1)) * totalFrames;
          const remaining = Math.max(0, estimatedTotal - elapsed);

          onProgress?.({
            currentFrame: frameIndex,
            totalFrames,
            percent,
            estimatedTimeRemaining: remaining,
            phase: "rendering",
          });
        }
      }

      // Stop recording
      mediaRecorder.stop();

      // Wait for encoding to complete
      onProgress?.({
        currentFrame: totalFrames,
        totalFrames,
        percent: 95,
        estimatedTimeRemaining: 500,
        phase: "encoding",
      });

      const videoBlob = await new Promise<Blob>((resolve) => {
        mediaRecorder.onstop = () => {
          const blob = new Blob(recordedChunks, { type: mimeType });
          resolve(blob);
        };
      });

      // Clean up
      canvasRenderer.destroy();
      offscreenContainer.remove();

      // Create blob URL
      const blobUrl = URL.createObjectURL(videoBlob);
      const duration = totalSteps;

      // Cache the video
      await this.cacheVideo(sequenceId, videoBlob, duration);

      // Report completion
      onProgress?.({
        currentFrame: totalFrames,
        totalFrames,
        percent: 100,
        estimatedTimeRemaining: 0,
        phase: "complete",
      });

      this.isCurrentlyRendering = false;

      return {
        success: true,
        videoBlob,
        blobUrl,
        duration,
        sequenceId,
      };
    } catch (error) {
      // Clean up on error
      try {
        canvasRenderer.destroy();
      } catch {
        // Ignore cleanup errors
      }
      offscreenContainer.remove();

      this.isCurrentlyRendering = false;
      console.error("Video generation failed:", error);
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error during rendering",
        sequenceId,
      };
    }
  }

  /**
   * Check if a video exists in cache for a sequence
   */
  async getCachedVideo(sequenceId: string): Promise<VideoRenderResult | null> {
    try {
      const db = await this.initDB();

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(sequenceId);

        request.onsuccess = () => {
          const result = request.result;
          if (result?.videoBlob) {
            const prev = this.cachedBlobUrls.get(sequenceId);
            if (prev) URL.revokeObjectURL(prev);
            const blobUrl = URL.createObjectURL(result.videoBlob);
            this.cachedBlobUrls.set(sequenceId, blobUrl);
            resolve({
              success: true,
              videoBlob: result.videoBlob,
              blobUrl,
              duration: result.duration,
              sequenceId,
            });
          } else {
            resolve(null);
          }
        };

        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /**
   * Store a rendered video in cache
   */
  async cacheVideo(
    sequenceId: string,
    videoBlob: Blob,
    duration?: number
  ): Promise<void> {
    try {
      const db = await this.initDB();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);

        const request = store.put({
          sequenceId,
          videoBlob,
          duration: duration || 0,
          createdAt: Date.now(),
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("Failed to cache video:", error);
    }
  }

  /**
   * Clear cached video for a sequence
   */
  async clearCachedVideo(sequenceId: string): Promise<void> {
    try {
      const db = await this.initDB();

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.delete(sequenceId);
        resolve();
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Clear all cached videos
   */
  async clearAllCachedVideos(): Promise<void> {
    try {
      const db = await this.initDB();

      return new Promise((resolve) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.clear();
        resolve();
      });
    } catch {
      // Ignore errors
    }
  }

  /**
   * Cancel ongoing render
   */
  cancelRender(): void {
    this.cancelRequested = true;
  }

  /**
   * Check if a render is in progress
   */
  isRendering(): boolean {
    return this.isCurrentlyRendering;
  }
}

// Singleton instance
let serviceInstance: VideoPreRenderer | null = null;

export function getVideoPreRenderer(): VideoPreRenderer {
  if (!serviceInstance) {
    serviceInstance = new VideoPreRenderer();
  }
  return serviceInstance;
}
