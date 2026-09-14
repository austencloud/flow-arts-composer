/**
 * Animation Precomputer Implementation
 *
 * Manages pre-computation of animation data for smooth playback:
 * - Path cache pre-computation for gap-free trail rendering
 * - Frame pre-rendering for perfect smooth playback
 *
 * Uses reactive state ownership - service owns $state, component derives from it.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { TrailSettings } from "../domain/types/trail-types";
import type { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
import type { ITrailCapturer as TrailCapturer } from "$lib/shared/animation-engine/services/ITrailCapturer";
import type { IAnimationRenderer as AnimationRenderer } from "$lib/shared/animation-engine/services/IAnimationRenderer";
import { AnimationPathCache } from "$lib/shared/animation-engine/services/animation-path-cache";
import type { AnimationVisibilityStateManager } from "../state/animation-visibility-state.svelte";
import {
  SequenceFramePreRenderer,
  type PreRenderProgress,
} from "$lib/shared/animation-engine/services/sequence-frame-pre-renderer";
import type {
  PrecomputationServiceConfig,
  PrecomputationState,
  PropDimensions,
} from "./IAnimationPrecomputer";

// GLOBAL PATH CACHE
// Survives component remounts so drag-to-move doesn't re-precompute.
// Keyed by sequence content hash. Capped at 20 entries (LRU eviction).
const MAX_GLOBAL_CACHE_SIZE = 20;
const globalPathCacheMap = new Map<string, AnimationPathCache>();

function getSequencePathHash(
  seq: SequenceData,
  totalSteps: number,
  stepDurationMs: number,
  vm: AnimationVisibilityStateManager
): string {
  // Include motion data fingerprint so transforms (rotate, mirror, etc.) produce distinct hashes.
  // Without this, transformed sequences return stale untransformed cached paths.
  const motionFingerprint =
    seq.steps
      ?.map((s) => {
        const b = s.motions?.left;
        const r = s.motions?.right;
        const bPart = b
          ? `${b.startLocation}${b.endLocation}${b.motionType}${b.rotationDirection}${b.turns}:${b.pathShape ?? ""}`
          : "_";
        const rPart = r
          ? `${r.startLocation}${r.endLocation}${r.motionType}${r.rotationDirection}${r.turns}:${r.pathShape ?? ""}`
          : "_";
        return `${bPart}|${rPart}`;
      })
      .join(";") || "";
  const pathShape = vm.getPathShape();
  const motionAware = vm.getMotionAwarePaths();
  return `${seq.id || seq.word || "?"}-${totalSteps}-${stepDurationMs}-${pathShape}-${motionAware}-${motionFingerprint}`;
}

function storeInGlobalCache(hash: string, cache: AnimationPathCache): void {
  // Evict oldest entry if at capacity
  if (
    globalPathCacheMap.size >= MAX_GLOBAL_CACHE_SIZE &&
    !globalPathCacheMap.has(hash)
  ) {
    const oldest = globalPathCacheMap.keys().next().value;
    if (oldest !== undefined) globalPathCacheMap.delete(oldest);
  }
  globalPathCacheMap.set(hash, cache);
}

export class AnimationPrecomputer {
  // Reactive state - owned by service
  state = $state<PrecomputationState>({
    pathCacheData: null,
    isCachePrecomputing: false,
    isPreRendering: false,
    preRenderProgress: null,
    preRenderedFramesReady: false,
  });

  private orchestrator: SequenceAnimationOrchestrator | null = null;
  private TrailCapturer: TrailCapturer | null = null;
  private renderer: AnimationRenderer | null = null;
  private propDimensions: PropDimensions = { width: 100, height: 100 };
  private canvasSize: number = 950;
  private instanceId: string = "unknown";

  private pathCache: AnimationPathCache | null = null;
  private framePreRenderer: SequenceFramePreRenderer | null = null;
  private precomputeAbortController: AbortController | null = null;

  initialize(config: PrecomputationServiceConfig): void {
    this.orchestrator = config.orchestrator;
    this.TrailCapturer = config.TrailCapturer;
    this.renderer = config.renderer;
    this.propDimensions = config.propDimensions;
    this.canvasSize = config.canvasSize;
    this.instanceId = config.instanceId ?? "unknown";
  }

  updateConfig(config: Partial<PrecomputationServiceConfig>): void {
    if (config.orchestrator !== undefined)
      this.orchestrator = config.orchestrator;
    if (config.TrailCapturer !== undefined)
      this.TrailCapturer = config.TrailCapturer;
    if (config.renderer !== undefined) this.renderer = config.renderer;
    if (config.propDimensions !== undefined)
      this.propDimensions = config.propDimensions;
    if (config.canvasSize !== undefined) this.canvasSize = config.canvasSize;
  }

  initializeFramePreRenderer(): void {
    if (this.orchestrator && this.renderer && !this.framePreRenderer) {
      this.framePreRenderer = new SequenceFramePreRenderer(
        this.orchestrator,
        this.renderer
      );
    }
  }

  async precomputeAnimationPaths(
    seqData: SequenceData,
    totalSteps: number,
    stepDurationMs: number,
    trailSettings: TrailSettings
  ): Promise<void> {
    if (
      !trailSettings.usePathCache ||
      !this.orchestrator ||
      !this.TrailCapturer
    ) {
      this.state.pathCacheData = null;
      return;
    }

    try {
      const hash = getSequencePathHash(
        seqData,
        totalSteps,
        stepDurationMs,
        this.orchestrator.getActiveVisibilityManager()
      );
      // Check global cache first - avoids re-precomputing after drag-to-move
      const cached = globalPathCacheMap.get(hash);
      if (cached?.isValid()) {
        this.pathCache = cached;
        this.TrailCapturer.setAnimationCacheService(cached);
        this.state.pathCacheData = cached.getCacheData();
        return;
      }
      this.state.isCachePrecomputing = true;

      // Abort any in-flight precomputation before starting a new one
      this.precomputeAbortController?.abort();
      this.precomputeAbortController = new AbortController();
      const signal = this.precomputeAbortController.signal;

      // Create path cache instance if needed
      // IMPORTANT: Always use standard 950x950 coordinate system for cache (matches viewBox)
      if (!this.pathCache) {
        this.pathCache = new AnimationPathCache({
          cacheFps: 120, // High FPS for ultra-smooth trails
          canvasSize: 950, // Always use standard viewBox size for resolution-independent caching
          propDimensions: this.propDimensions,
        });

        // Wire cache to trail capture service for backfill support
        this.TrailCapturer.setAnimationCacheService(
          this.pathCache as AnimationPathCache
        );
      }

      // CRITICAL: Initialize orchestrator with sequence data BEFORE pre-computation!
      const initSuccess = this.orchestrator.initializeWithDomainData(seqData);
      if (!initSuccess) {
        throw new Error("Failed to initialize orchestrator with sequence data");
      }

      // Create function to calculate prop states at any beat
      const orchestrator = this.orchestrator;
      const calculateStateFunc = (beat: number) => {
        orchestrator.calculateState(beat);
        return {
          leftProp: orchestrator.getLeftPropState(),
          rightProp: orchestrator.getRightPropState(),
        };
      };

      // Pre-compute paths (non-blocking, chunked)
      const cacheData = await this.pathCache.precomputePaths(
        calculateStateFunc,
        totalSteps,
        stepDurationMs,
        { signal }
      );

      // Store in global cache for reuse across component remounts
      storeInGlobalCache(hash, this.pathCache);

      this.state.pathCacheData = cacheData;
    } catch (error) {
      // Silently ignore aborted precomputations (expected when sequence changes mid-compute)
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error(
        `❌ [${this.instanceId}] Failed to pre-compute animation paths:`,
        error
      );
      this.state.pathCacheData = null;
    } finally {
      this.state.isCachePrecomputing = false;
    }
  }

  async preRenderSequenceFrames(
    seqData: SequenceData,
    trailSettings: TrailSettings,
    isInitialized: () => boolean
  ): Promise<void> {
    try {
      this.state.isPreRendering = true;
      this.state.preRenderedFramesReady = false;
      this.state.preRenderProgress = null;

      // CRITICAL: Wait for renderer to be initialized before pre-rendering
      const maxWaitTime = 5000; // 5 seconds max
      const startWait = performance.now();
      while (!isInitialized() && performance.now() - startWait < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (!isInitialized()) {
        console.error(
          "⚠️ Renderer not initialized after 5s, skipping pre-render"
        );
        return;
      }

      if (!this.framePreRenderer) {
        console.error("⚠️ Frame pre-renderer not available");
        return;
      }

      // Pre-render with progress updates
      await this.framePreRenderer.preRenderSequence(
        seqData,
        {
          fps: 60,
          canvasSize: this.canvasSize,
          nonBlocking: true,
          framesPerChunk: 3,
          trailSettings,
        },
        (progress: PreRenderProgress) => {
          this.state.preRenderProgress = progress;
        }
      );

      this.state.preRenderedFramesReady = true;
    } catch (error) {
      console.error("❌ Failed to pre-render frames:", error);
      this.state.preRenderedFramesReady = false;
    } finally {
      this.state.isPreRendering = false;
      this.state.preRenderProgress = null;
    }
  }

  getPathCache(): AnimationPathCache | null {
    return this.pathCache;
  }

  getFramePreRenderer(): SequenceFramePreRenderer | null {
    return this.framePreRenderer;
  }

  clearCaches(): void {
    this.pathCache?.clear();
    this.framePreRenderer?.clear();
    this.state.pathCacheData = null;
    this.state.preRenderedFramesReady = false;
  }

  clearPreRenderedFrames(): void {
    this.framePreRenderer?.clear();
    this.state.preRenderedFramesReady = false;
  }

  dispose(): void {
    this.precomputeAbortController?.abort();
    this.precomputeAbortController = null;
    this.clearCaches();
    this.orchestrator = null;
    this.TrailCapturer = null;
    this.renderer = null;
    this.pathCache = null;
    this.framePreRenderer = null;
    // Reset reactive state
    this.state.pathCacheData = null;
    this.state.isCachePrecomputing = false;
    this.state.isPreRendering = false;
    this.state.preRenderProgress = null;
    this.state.preRenderedFramesReady = false;
  }
}
