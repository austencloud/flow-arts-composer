/**
 * Video Export Orchestrator
 *
 * Coordinates frame capture, encoding, and final delivery for MP4/WebM exports.
 *
 * Supports two encoding paths:
 *   1. Background encoder (preferred) - uses a Web Worker with WebCodecs + mediabunny
 *      for off-main-thread encoding. Captures ImageData per frame, transfers zero-copy
 *      to the worker, and receives the finished MP4 blob.
 *   2. Inline encoder (fallback) - uses the legacy VideoExporter on the main thread.
 *      Retained for browsers without WebCodecs or when the background encoder is
 *      unavailable.
 */

import {
  VIDEO_EXPORT_FPS,
  VIDEO_INITIAL_CAPTURE_DELAY_MS,
} from "$lib/shared/animation-engine/domain/constants/timing";
import type { AnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import {
  downloadBlob,
  generateTimestampedFilename,
} from "$lib/shared/foundation/services/file-downloader";
import type { AnimationPlaybackController } from "$lib/shared/animation-engine/services/animation-playback-controller";
import {
  getHeaderHeight,
  getProgressBarHeight,
} from "./canvas-renderer";
import type { VideoExporter } from "$lib/shared/animation-engine/services/video-exporter";
import type { CompositeVideoRenderer } from "$lib/shared/animation-engine/services/composite-video-renderer";
import type { ExportGlyphPrerenderer } from "$lib/shared/animation-engine/services/export-glyph-prerenderer";
import { ExportFrameCompositor, type FrameCompositorConfig } from "./export-frame-compositor";
import { OffscreenExportRenderer } from "$lib/shared/video-export/services/offscreen-export-renderer";
import { drawOpenerFrame } from "$lib/shared/compose/domain/video-opener-frame";
import { holdFrameCount } from "$lib/shared/share/domain/video-opener";

import type { VideoExportFormat, VideoExportProgress, VideoEffectOverrides, IVideoExportOrchestrator, VideoExportOrchestratorOptions } from "$lib/shared/compose/domain/video-export-types";
export type { VideoExportFormat, VideoExportProgress, VideoResolution, VideoEffectOverrides, VideoExportOrchestratorOptions } from "$lib/shared/compose/domain/video-export-types";
import type { BackgroundVideoEncoder } from "$lib/shared/animation-engine/services/background-video-encoder";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
import { fireCacheInvalidation } from "$lib/shared/animation-engine/state/fire-invalidation-signal.svelte";
import { getExportDimensions, calculateBitrate } from "$lib/shared/animation-engine/domain/video-export-calculations";
import { calculateDifficultyLevel as calculateSequenceDifficultyLevel } from "$lib/shared/browse/services/sequence-difficulty-calculator";
import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
import type { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import type { TipEffectMap } from '$lib/shared/animation-engine/domain/types/tip-effect-types';

export class VideoExportOrchestrator implements IVideoExportOrchestrator {
  private _isExporting = false;
  private shouldCancel = false;

  constructor(
    private readonly VideoExporter: VideoExporter,
    private readonly compositeRenderer: CompositeVideoRenderer,
    private readonly glyphPrerenderer: ExportGlyphPrerenderer,
    private readonly backgroundEncoder: BackgroundVideoEncoder
  ) {}

  async executeExport(
    canvas: HTMLCanvasElement,
    playbackController: AnimationPlaybackController,
    panelState: AnimationPanelState,
    onProgress: (progress: VideoExportProgress) => void,
    options: VideoExportOrchestratorOptions = {}
  ): Promise<Blob> {
    if (this._isExporting) {
      throw new Error("Export already in progress");
    }

    this._isExporting = true;
    this.shouldCancel = false;

    // MP4 is the default format
    const exportFormat: VideoExportFormat = options.format ?? "mp4";
    const useBackgroundEncoder = exportFormat === "mp4";
    const filename = this.resolveFilename(
      options.filename,
      panelState,
      exportFormat
    );

    // Check visibility settings early to calculate output dimensions. Per-export
    // overlayOverrides merge OVER the global visibility manager so the exported
    // aspect ratio matches when tunnel export suppresses the header/progress bar.
    const visibilityManager = getAnimationVisibilityManager();
    // sourceSizeOverride decouples the source dimensions from the (possibly
    // unmounted) live canvas — tunnel/art export drives its OWN offscreen
    // engine, so `canvas` is only a sizing placeholder. A square source with no
    // header/progress chrome; the zero-dimension guard below is skipped.
    const sourceSizeOverride = options.sourceSizeOverride;
    const hasSourceOverride =
      typeof sourceSizeOverride === "number" && sourceSizeOverride > 0;
    // Width used for header/progress sizing math. With an override the chrome is
    // forced off, so this only feeds the (zeroed) height calls.
    const sourceSizingWidth = hasSourceOverride ? sourceSizeOverride : canvas.width;
    const showWordHeader = hasSourceOverride
      ? false
      : (options.overlayOverrides?.wordHeader ?? visibilityManager.getVisibility("wordHeader"));
    const showProgressBar = hasSourceOverride
      ? false
      : (options.overlayOverrides?.progressBar ?? visibilityManager.getVisibility("progressBar"));
    // Header/progress bar heights at SOURCE resolution - used only for
    // aspect ratio calculation so the output dimensions stay correct.
    const srcHeaderHeight = showWordHeader
      ? getHeaderHeight(sourceSizingWidth)
      : 0;
    const srcProgressBarHeight = showProgressBar
      ? getProgressBarHeight(sourceSizingWidth)
      : 0;

    // Compute header overlays (difficulty badge + LOOP icon strip) once per export.
    // Matches AnimatorCanvas.svelte:330-358 derivation so the exported video's
    // word header mirrors the live canvas.
    const difficultyLevel = panelState.sequenceData
      ? calculateSequenceDifficultyLevel([
          ...(panelState.sequenceData.steps ?? []),
        ])
      : null;

    // Resolve once per export: both the component set (for the icon strip)
    // and the rotation slice size (so quartered LOOPs render with fa-arrows-spin
    // in the exported video header, matching the live preview).
    const loopDisplayForExport = (() => {
      const seq = panelState.sequenceData;
      if (!seq) return null;
      try {
        return resolveLoopDisplay(seq);
      } catch {
        return null;
      }
    })();

    const loopComponents: Set<string> | null =
      loopDisplayForExport && loopDisplayForExport.components.size > 0
        ? (loopDisplayForExport.components as unknown as Set<string>)
        : null;

    const rotationPeriod: Period | undefined =
      loopDisplayForExport?.rotationPeriod;
    const inversionPeriod: Period | undefined =
      loopDisplayForExport?.inversionPeriod;
    const reflectionAxis = loopDisplayForExport?.reflectionAxis;
    const overlayComponents: Set<string> | null =
      loopDisplayForExport?.overlayComponents &&
      loopDisplayForExport.overlayComponents.size > 0
        ? (loopDisplayForExport.overlayComponents as unknown as Set<string>)
        : null;

    // Resolve FPS early - used by both encoder paths and frame calculations
    const fps = options.fps ?? VIDEO_EXPORT_FPS;

    // Calculate source dimensions. Normally from the live canvas (square anim
    // area + header + progress bar). With sourceSizeOverride the source is a
    // bare square of that size — the live canvas may be unmounted (tunnel/art).
    const sourceWidth = hasSourceOverride
      ? Math.round(sourceSizeOverride!)
      : Math.round(canvas.width);
    const sourceHeight = hasSourceOverride
      ? Math.round(sourceSizeOverride!)
      : Math.round(canvas.width + srcHeaderHeight + srcProgressBarHeight);

    // Zero-dimension guard only applies to the live-canvas path — an override
    // supplies its own valid square size, so skip the throw.
    if (!hasSourceOverride && (sourceWidth === 0 || sourceHeight === 0)) {
      throw new Error(
        `Cannot export: canvas has zero dimensions (${canvas.width}x${canvas.height}). ` +
        "Wait for the animation to load before exporting."
      );
    }

    // Determine final encode dimensions. When a resolution is specified,
    // scale to the target height while preserving the aspect ratio of the
    // source canvas. Otherwise, encode at source size.
    let outputWidth: number;
    let outputHeight: number;

    if (options.resolution) {
      const aspectRatio = sourceWidth / sourceHeight;
      const dims = getExportDimensions(options.resolution, aspectRatio);
      outputWidth = dims.width;
      outputHeight = dims.height;
    } else {
      outputWidth = sourceWidth;
      outputHeight = sourceHeight;
    }

    // ---------------------------------------------------------------------------
    // Encoder setup - background (MP4) vs inline (WebM fallback)
    // ---------------------------------------------------------------------------
    let inlineExporter: {
      addFrame: (c: HTMLCanvasElement) => Promise<void>;
      finish: () => Promise<Blob>;
      cancel: () => void;
    } | null = null;

    // Opener hold: the chosen image sits at time zero for one beat (default)
    // before the animation, so it is the frame players and thumbnails show.
    // Sequence export only; the composite grid draws its own header frame.
    const openerImage =
      options.compositeMode && options.compositeMode !== "none"
        ? undefined
        : options.openerImage;
    const openerFrames = openerImage
      ? holdFrameCount({
          fps,
          secondsPerBeat: 1.0 / panelState.speed,
          holdBeats: options.openerHoldBeats,
        })
      : 0;

    /** Which side of the export owns the progress readout — see onProgress below. */
    let captureComplete = false;
    let encodedSoFar = 0;
    let encodedTotal = 0;

    if (useBackgroundEncoder) {
      const bitrate = calculateBitrate(outputWidth, outputHeight, fps);

      // Calculate total frames early so the worker can allocate its muxer.
      // Must match the capture loop: one start position + (motion × loopCount) + one end hold.
      // The start position plays once at the very beginning and the end hold plays once
      // at the very end; only the motion steps repeat for each additional loop.
      const earlySteps = panelState.sequenceData?.steps ?? [];
      const earlyStepDuration = earlySteps.length > 0
        ? earlySteps.reduce((sum, s) => sum + (s.duration ?? 1), 0)
        : panelState.totalSteps;
      const earlyStartDur = (options.includeAnimationStartPlacement ?? true) ? 1 : 0;
      const earlyIsLoopable = playbackController.isSeamlesslyLoopable;
      const earlyEndDur = (options.includeEndHold ?? !earlyIsLoopable) ? 1 : 0;
      const earlyLoopCount = options.loopCount ?? panelState.exportLoopCount ?? 1;
      const earlyTotalDuration =
        earlyStartDur + earlyStepDuration * earlyLoopCount + earlyEndDur;
      const secondsPerBeat = 1.0 / panelState.speed;
      const totalTimelineSeconds = earlyTotalDuration * secondsPerBeat;
      const totalFramesEstimate =
        Math.ceil(totalTimelineSeconds * fps) + openerFrames;

      // Wire progress from worker - only used during the finalize phase.
      // During capture, the main loop reports its own progress; the worker
      // encodes frames concurrently but we don't surface that to the UI
      // to avoid rapid "capturing"/"encoding" flicker. Once capture is done the
      // encoder still holds a deep queue, so its count becomes the only real
      // signal — surfacing it is what keeps the finalize phase from reading as
      // a freeze.
      this.backgroundEncoder.onProgress = (frameIndex, total) => {
        encodedSoFar = frameIndex;
        encodedTotal = total;
        if (!captureComplete) return;
        onProgress({
          progress: total > 0 ? frameIndex / total : 0,
          stage: "encoding",
          currentFrame: frameIndex,
          totalFrames: total,
        });
      };

      await this.backgroundEncoder.initialize({
        width: outputWidth,
        height: outputHeight,
        fps,
        bitrate,
        totalFrames: totalFramesEstimate,
        // Default to platform-aware H.264 (the codec hardware-encoders
        // accelerate on essentially every device of the last decade). AV1
        // remains available via an explicit codec:"av1" option but is no
        // longer the default — 10-bit AV1 encode is unsupported on most
        // mobile/Safari, where configure() could stall and hang the export.
        codec: options.codec ?? "h264",
        fragmented: options.fragmented,
      });
    } else {
      // Legacy inline exporter for WebM
      inlineExporter = await this.VideoExporter.createManualExporter(
        outputWidth,
        outputHeight,
        {
          format: exportFormat as "webm" | "mp4",
          fps,
          filename,
          autoDownload: false,
        }
      );
    }

    const captureState = {
      wasPlaying: panelState.isPlaying,
      step: panelState.currentStep,
    };

    // Save and apply effect overrides for export
    const savedEffectState = this.applyEffectOverrides(
      visibilityManager,
      options.effectOverrides
    );

    // Non-composite export drives a fresh offscreen engine. Declared at method
    // scope so the finally block can dispose it.
    let offscreen: OffscreenExportRenderer | null = null;

    try {
      onProgress({ progress: 0, stage: "capturing" });

      if (captureState.wasPlaying) {
        playbackController.togglePlayback();
      }
      playbackController.jumpToStep(0);

      // Enable fire renderer diagnostics
      const fireDiag = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>).__tka_fire_diag as { enable(): void; reset(): void; disable(): void } | undefined : undefined;
      if (fireDiag) {
        fireDiag.enable();
      }

      // Clear fire/charcoal simulation FBOs, display canvas, and frame cache.
      fireCacheInvalidation.trigger();
      await this.waitForAnimationFrame();
      await this.waitForAnimationFrame();

      // The Navier-Stokes fluid simulation (fire/charcoal) needs ~60 frames to
      // converge from a zeroed state. That warmup now runs INSIDE the offscreen
      // renderer's initialize() against its own fresh engine, so the orchestrator
      // no longer warms the live engine here. needsFluidWarmup is still computed
      // and threaded into offscreen.initialize() below.
      const ecs = visibilityManager.effectsConfigState;
      const tipMap = ecs?.tipEffectMap ?? {};
      const hasEffectInMap = (effect: string) => Object.values(tipMap).some(a => a.effect === effect);
      const needsFluidWarmup =
        hasEffectInMap("fire") ||
        hasEffectInMap("charcoal");
      if (needsFluidWarmup && fireDiag) {
        // Reset fire diagnostic counter so export frames get logged.
        fireDiag.reset();
      }

      // Clear all overlay canvases: 2D (trails, LED) and WebGL display
      // surfaces (fire, charcoal). Simulation FBOs stay warm — only the
      // visible display canvas pixels are cleared so warmup frames don't
      // bleed into the first captured frame.
      const container = canvas.parentElement;
      if (container) {
        for (const overlay of container.querySelectorAll("canvas")) {
          if (overlay === canvas) continue;
          const ctx2d = overlay.getContext("2d");
          if (ctx2d) {
            ctx2d.clearRect(0, 0, overlay.width, overlay.height);
          } else {
            const glCtx = overlay.getContext("webgl2") as WebGL2RenderingContext | null;
            if (glCtx) {
              glCtx.bindFramebuffer(glCtx.FRAMEBUFFER, null);
              glCtx.clearColor(0, 0, 0, 0);
              glCtx.clear(glCtx.COLOR_BUFFER_BIT);
            }
          }
        }
      }

      await this.delay(VIDEO_INITIAL_CAPTURE_DELAY_MS);

      if (savedEffectState) {
        await this.waitForAnimationFrame();
        await this.waitForAnimationFrame();
        await this.waitForAnimationFrame();
      }

      // Build step durations array - each step's relative duration (default 1)
      const steps = panelState.sequenceData?.steps ?? [];
      const stepDurations = steps.map((s) => s.duration ?? 1);
      const totalDurationUnits = stepDurations.reduce((sum, d) => sum + d, 0) || panelState.totalSteps;

      // Include optional start position (1 beat) and end hold for non-looping sequences.
      // The animation engine uses beat 0 = start position, beat 1+ = motion steps.
      // Without accounting for this, the exported glyph overlay is one beat ahead
      // of the animation, and the end position is cut off abruptly.
      const startPlacementDuration = (options.includeAnimationStartPlacement ?? true) ? 1 : 0;
      const isLoopable = playbackController.isSeamlesslyLoopable;
      const endPlacementHoldDuration = (options.includeEndHold ?? !isLoopable) ? 1 : 0;

      // Apply loop count for repeating the motion portion back-to-back.
      // Prefer options.loopCount if provided, otherwise use panelState.exportLoopCount.
      // The timeline is: one start position → motion × loopCount → one end hold.
      // The start position and end hold each play exactly once, regardless of loopCount.
      const loopCount = options.loopCount ?? panelState.exportLoopCount ?? 1;
      const motionLoopUnits = totalDurationUnits * loopCount;
      const totalDurationWithHolds =
        startPlacementDuration + motionLoopUnits + endPlacementHoldDuration;

      // Calculate effective duration at user's BPM/speed
      // At speed=1.0 (60 BPM): 1 second per beat unit
      // At speed=2.0 (120 BPM): 0.5 seconds per beat unit
      const secondsPerBeatUnit = 1.0 / panelState.speed;
      const totalTimelineSeconds = totalDurationWithHolds * secondsPerBeatUnit;

      const totalFrames = Math.ceil(totalTimelineSeconds * fps);

      // Build cumulative duration breakpoints for time-to-beat mapping
      // This allows steps with different durations to occupy proportional time
      const cumulativeDurations: number[] = [];
      let cumulative = 0;
      for (const d of stepDurations) {
        cumulativeDurations.push(cumulative);
        cumulative += d;
      }

      // Keyframe interval - emit a keyframe every 2 seconds for seekability
      const keyframeInterval = fps * 2;

      // Check if composite mode is enabled
      const isCompositeMode =
        options.compositeMode && options.compositeMode !== "none";

      // Initialize composite renderer if in composite mode
      if (isCompositeMode) {
        if (!panelState.sequenceData) {
          throw new Error("Sequence data is required for composite mode");
        }
        await this.compositeRenderer.initialize(panelState.sequenceData, {
          orientation: options.compositeMode as "horizontal" | "vertical",
          gridStepSize: options.gridStepSize ?? 120,
          includeStartPlacement: options.includeStartPlacement ?? false,
          showStepNumbers: options.showStepNumbers ?? true,
        });
        await this.compositeRenderer.cacheStaticGrid();
      }

      // Get additional visibility settings (showWordHeader already checked above).
      // Merge any per-export overlayOverrides OVER the global visibility manager
      // (does NOT mutate global state) so tunnel export can suppress chrome.
      const ov = options.overlayOverrides;
      const showTkaGlyph = ov?.tkaGlyph ?? visibilityManager.getVisibility("tkaGlyph");
      const showElementalGlyph =
        ov?.elementalGlyph ?? visibilityManager.getVisibility("elementalGlyph");
      const showStepNumbers = ov?.stepNumbers ?? visibilityManager.getVisibility("stepNumbers");
      const showLeftPathLines = ov?.leftPathLines ?? visibilityManager.getVisibility("leftPathLines");
      const showRightPathLines = ov?.rightPathLines ?? visibilityManager.getVisibility("rightPathLines");
      const isDarkMode = visibilityManager.isDarkMode();
      // Grid is read from the global animation visibility/settings inside the
      // offscreen engine — there is no per-export grid flag on the offscreen init
      // or compositor to override here, so overlayOverrides.grid is a no-op at this
      // seam (the tunnel turns grid off globally via the Art panel). Left explicit
      // so a future grid-flag path has an obvious home.

      // Pre-render complete glyphs (letter + dash + turns column) before the frame loop
      if (showTkaGlyph && steps.length > 0) {
        await this.glyphPrerenderer.prerenderGlyphs(steps, isDarkMode);
      }
      if (showElementalGlyph && steps.length > 0) {
        await this.glyphPrerenderer.prerenderElementalGlyphs(steps);
      }

      // Create offscreen canvas for compositing at OUTPUT resolution directly.
      // Each source layer (main canvas, overlays) is scaled up individually
      // with high-quality interpolation, producing sharper trails and effects
      // than the previous approach of compositing at source size then resizing.
      const offscreenCanvas = document.createElement("canvas");

      // Scale factor from source canvas to output resolution.
      const scaleFactor = isCompositeMode ? 1 : outputWidth / sourceWidth;

      // Header/progress bar heights at OUTPUT resolution
      const headerHeight = Math.round(srcHeaderHeight * scaleFactor);
      const progressBarHeight = Math.round(srcProgressBarHeight * scaleFactor);
      // The square animation area in the output
      const outputCanvasSize = isCompositeMode ? sourceWidth : outputWidth;

      // Construct + warm a fresh offscreen export engine for the non-composite
      // path. It renders each frame deterministically at output resolution with
      // sub-stepped trail capture (matching live density without live's rAF
      // jitter) and runs the fluid (fire/charcoal) warmup internally during
      // initialize(). The compositor then reads its canvas + sibling overlays
      // instead of the on-screen live canvas.
      if (!isCompositeMode) {
        // Tunnel export: the per-beat layer set is fixed-size (fold-derived), so
        // sample it once to tell the offscreen engine how many per-layer prop
        // textures to pre-load before the frame loop. 0 for normal sequence export.
        const additionalLayerCount = options.additionalLayersForBeat
          ? options.additionalLayersForBeat(1).length
          : 0;
        offscreen = new OffscreenExportRenderer(playbackController, panelState);
        await offscreen.initialize({
          outputCanvasSize,
          fps,
          needsFluidWarmup,
          // Forward the caller's resolved prop types so the offscreen engine loads
          // the right prop BODY textures in initialize() (without them the renderer
          // boot-loads global settings → wrong/blank prop on the QR landing page,
          // which has no DI/settings bootstrap). null falls back to "staff".
          leftPropType: options.leftPropType ?? null,
          rightPropType: options.rightPropType ?? null,
          // Match the live theme + grid. previewDarkMode falls back to the export's
          // resolved isDarkMode; the visibility manager exposes no non-radial-points
          // key, so default to true (the prior hardcoded value) for unchanged behavior.
          previewDarkMode: options.previewDarkMode ?? isDarkMode,
          showNonRadialPoints: options.showNonRadialPoints ?? true,
          leftMotionVisible: options.leftMotionVisible,
          rightMotionVisible: options.rightMotionVisible,
          additionalLayerCount,
          tunnelSpectrum: options.tunnelSpectrum,
          tunnelPropColors: options.tunnelPropColors,
        });
      }

      // Set canvas dimensions based on mode
      if (isCompositeMode) {
        const compositeDims = this.compositeRenderer.getCompositeDimensions();
        offscreenCanvas.width = compositeDims.width;
        offscreenCanvas.height = compositeDims.height;
      } else {
        offscreenCanvas.width = outputWidth;
        offscreenCanvas.height = outputHeight;
      }
      const offscreenCtx = offscreenCanvas.getContext("2d", {
        willReadFrequently: useBackgroundEncoder,
      });

      if (!offscreenCtx) {
        throw new Error("Failed to create offscreen canvas context");
      }

      // Use Lanczos (high) interpolation when scaling source layers up
      offscreenCtx.imageSmoothingEnabled = true;
      offscreenCtx.imageSmoothingQuality = "high";

      // Build frame compositor for overlay rendering
      const compositorConfig: FrameCompositorConfig = {
        outputWidth,
        outputHeight,
        sourceWidth,
        headerHeight,
        progressBarHeight,
        outputCanvasSize,
        scaleFactor,
        fps,
        showTkaGlyph,
        showElementalGlyph,
        showStepNumbers,
        showWordHeader,
        showProgressBar,
        isDarkMode,
        isCompositeMode: !!isCompositeMode,
        sequenceWord: panelState.sequenceWord,
        difficultyLevel,
        loopComponents,
        rotationPeriod,
        inversionPeriod,
        reflectionAxis,
        overlayComponents,
        showLeftPathLines,
        showRightPathLines,
        sequenceSteps: steps,
        frameOverlayDraw: options.frameOverlayDraw,
      };
      const frameCompositor = new ExportFrameCompositor(
        compositorConfig,
        this.glyphPrerenderer,
        this.compositeRenderer
      );

      // Frame duration in microseconds for WebCodecs timestamps
      const frameDurationMicros = Math.round(1_000_000 / fps);

      // Trail-fidelity diagnostic. When enabled via window.__tka_trail_diag.enable(),
      // log the actual accumulator stamp count per captured frame. Expected: 1 per
      // active color (1 or 2). A higher value proves the leading edge is being
      // re-stamped multiple times at the same virtualTime — the "doubly opaque" bug.
      const trailDiag = typeof window !== "undefined"
        ? ((window as unknown as Record<string, unknown>).__tka_trail_diag as
            | { read(): { stamps: number; lastDt: number; lastFade: number }; enable(): void }
            | undefined)
        : undefined;
      // Auto-enable in DEV so the per-frame stamp/dt/fade log prints without a
      // manual console step. The hook exists once the offscreen engine's trail
      // overlay has initialized (above).
      if (import.meta.env.DEV) trailDiag?.enable();

      // Seamless-loop trail warm-up. A FADE trail baked from a cold start ramps
      // up over its fade window, so frame 0 carries less trail than the last
      // frame and the looped MP4 pops at the seam. Pre-roll whole loop periods
      // (rendered into the offscreen engine, NOT encoded) so the captured period
      // begins in trail steady-state; for a seamlessly-loopable closed path the
      // first and last captured frames then match → seamless loop. The engine's
      // virtual clock is continuous across warm-up + capture (below), so the
      // trail fade timing carries over; the encoder timestamps still start at 0.
      // Seamless-loop captures sample motion phases at frame MIDPOINTS (+0.5)
      // so neither endpoint snapshot is hit: phase 0 renders playbackPosition
      // exactly 1.0 (the static start-placement pose, OFF the continuous motion
      // curve → a one-frame flash at every loop seam) and phase == period would
      // duplicate it at the tail. Midpoint sampling keeps captures strictly
      // inside (0, period), so the start snapshot is never captured AND the wrap
      // (last → first) is exactly one frame-step. The warm-up below uses the SAME
      // offset so the primed trail history aligns with the captured phases (no
      // half-step trail discontinuity at frame 0).
      const phaseOffset = options.seamlessTrailLoop ? totalFrames / 2 + 0.5 : 0;

      let warmupFrames = 0;
      if (
        options.seamlessTrailLoop &&
        !isCompositeMode &&
        isLoopable &&
        offscreen &&
        totalFrames > 0
      ) {
        const fadeMs = animationSettings.trail.fadeDurationMs ?? 2000;
        const periodMs = (totalFrames / fps) * 1000;
        const warmupLoops = Math.ceil(fadeMs / Math.max(1, periodMs)) + 1;
        warmupFrames = warmupLoops * totalFrames;
        for (let w = 0; w < warmupFrames; w++) {
          if (this.shouldCancel) {
            throw new Error("Export cancelled");
          }
          const timeProgress = ((w + phaseOffset) / totalFrames) * totalDurationWithHolds;
          const virtualTimeMs = (w / fps) * 1000;
          panelState.setVirtualTime(virtualTimeMs);

          const motionStart = startPlacementDuration;
          const motionEnd = motionStart + motionLoopUnits;
          let warmBeat: number;
          if (startPlacementDuration > 0 && timeProgress < motionStart) {
            warmBeat = timeProgress / startPlacementDuration;
          } else if (endPlacementHoldDuration > 0 && timeProgress >= motionEnd) {
            warmBeat = steps.length + 1;
          } else {
            const motionTime = timeProgress - motionStart;
            const wrapped = totalDurationUnits > 0 ? motionTime % totalDurationUnits : 0;
            warmBeat = this.timeToBeat(wrapped, cumulativeDurations, stepDurations) + 1;
          }
          offscreen.renderFrame(warmBeat, virtualTimeMs, options.additionalLayersForBeat);
          // Yield occasionally so a long warm-up doesn't jank the main thread.
          if (w % 30 === 29) await this.waitForAnimationFrame();
        }
      }

      const encodedFrameTotal = openerFrames + totalFrames;

      if (openerImage && openerFrames > 0) {
        drawOpenerFrame(
          offscreenCtx,
          openerImage,
          offscreenCanvas.width,
          offscreenCanvas.height
        );
        for (let o = 0; o < openerFrames; o++) {
          if (this.shouldCancel) {
            throw new Error("Export cancelled");
          }
          if (useBackgroundEncoder) {
            const openerData = offscreenCtx.getImageData(
              0,
              0,
              offscreenCanvas.width,
              offscreenCanvas.height
            );
            this.backgroundEncoder.addFrame(
              openerData,
              o,
              o * frameDurationMicros,
              o % keyframeInterval === 0
            );
          } else if (inlineExporter) {
            await inlineExporter.addFrame(offscreenCanvas);
          }
          if (o % 30 === 29) await this.waitForAnimationFrame();
        }
        onProgress({
          progress: openerFrames / encodedFrameTotal,
          stage: "capturing",
          currentFrame: openerFrames,
          totalFrames: encodedFrameTotal,
        });
      }

      for (let i = 0; i < totalFrames; i++) {
        if (this.shouldCancel) {
          throw new Error("Export cancelled");
        }

        // Calculate beat position for this frame using duration-weighted mapping.
        // Timeline: one start position → motion × loopCount → one end hold.
        // Start and end hold each appear exactly once; motion wraps per loop iteration.
        // The animation engine uses beat 0 = start position, beat 1+ = motion steps.
        // Using calculateStateForStep instead of jumpToStep because jumpToStep
        // clamps at totalSteps, which truncates the last step's fractional progress.
        // Frame-midpoint phase (see phaseOffset above): keeps seamless-loop
        // captures strictly inside (0, period) so the start snapshot is never
        // hit and the wrap is exactly one frame-step.
        const timeProgress = ((i + phaseOffset) / totalFrames) * totalDurationWithHolds;

        // Calculate deterministic virtual time for this frame (in ms). Continue
        // past any seamless-loop warm-up so the offscreen engine's trail fade
        // clock stays continuous; the encoder timestamp (below) still starts at 0.
        const virtualTimeMs = ((warmupFrames + i) / fps) * 1000;
        panelState.setVirtualTime(virtualTimeMs);

        let playbackPosition: number;
        let stepIndex: number;
        let isInStartPlacement = false;
        let isInEndHold = false;

        const motionStart = startPlacementDuration;
        const motionEnd = motionStart + motionLoopUnits;

        if (startPlacementDuration > 0 && timeProgress < motionStart) {
          // Start position phase - show initial pose, no glyph (once, at the beginning)
          playbackPosition = timeProgress / startPlacementDuration;
          stepIndex = -1;
          isInStartPlacement = true;
        } else if (endPlacementHoldDuration > 0 && timeProgress >= motionEnd) {
          // End position hold - freeze on the completed last motion step (once, at the end)
          playbackPosition = steps.length + 1;
          stepIndex = steps.length - 1;
          isInEndHold = true;
        } else {
          // Motion steps phase - wrap time modulo one loop so N iterations play
          // back-to-back with no inter-iteration hold. Offset by +1 for the
          // animation engine's step convention (step 0 = start, 1+ = motion).
          const motionTime = timeProgress - motionStart;
          const wrappedMotionTime =
            totalDurationUnits > 0 ? motionTime % totalDurationUnits : 0;
          const rawStep = this.timeToBeat(wrappedMotionTime, cumulativeDurations, stepDurations);
          stepIndex = Math.floor(rawStep);
          playbackPosition = rawStep + 1;
        }

        // Render this frame.
        //  - Non-composite: drive the offscreen engine deterministically. Its
        //    renderFrame() calls calculateStateForStep internally and paints
        //    synchronously, so no rAF wait is needed.
        //  - Composite: the grid renderer consumes the live canvas; update
        //    panel state and let the live render loop paint the new beat.
        if (!isCompositeMode) {
          offscreen!.renderFrame(playbackPosition, virtualTimeMs, options.additionalLayersForBeat);
          // Yield to the event loop so the browser repaints (the live canvas keeps
          // animating under the takeover) and the Svelte progress update flushes.
          // The offscreen engine is deterministic and unaffected by the yield.
          await this.waitForAnimationFrame();
        } else {
          playbackController.calculateStateForStep(playbackPosition);
          // Wait for the live render loop to paint the new beat. Single rAF:
          // calculateStateForStep is synchronous, so the render loop picks up
          // the new prop state on the very next frame.
          await this.waitForAnimationFrame();
        }

        // Source canvas for the compositor: the offscreen engine canvas for the
        // non-composite path (its overlays are siblings in its hidden container),
        // or the live canvas for composite mode.
        const sourceCanvas = isCompositeMode ? canvas : offscreen!.canvas;

        // Guard: if the source canvas temporarily lost dimensions (Svelte re-render
        // or PixiJS resize), wait for recovery. If it doesn't recover, skip
        // rendering this frame - the offscreen canvas still holds the previous
        // frame's content, so the encoder will duplicate it (brief freeze in
        // the video, much better than aborting the entire export).
        let canvasAvailable = sourceCanvas.width > 0 && sourceCanvas.height > 0;
        if (!canvasAvailable) {
          for (let retry = 0; retry < 30; retry++) {
            await this.waitForAnimationFrame();
            if (sourceCanvas.width > 0 && sourceCanvas.height > 0) {
              canvasAvailable = true;
              break;
            }
          }
        }

        // Render frame to offscreen canvas (only if live canvas is available).
        // When the canvas is temporarily unavailable, the offscreen canvas keeps
        // its previous content, producing a duplicated frame in the video.
        if (canvasAvailable) {
          const compositeStepIndex = isInStartPlacement ? 0 : Math.max(0, stepIndex);
          frameCompositor.renderCanvasLayers(
            offscreenCtx,
            sourceCanvas,
            !!isCompositeMode,
            compositeStepIndex,
            offscreenCanvas,
            i
          );

          frameCompositor.renderOverlays(
            offscreenCtx,
            sourceCanvas,
            stepIndex,
            isInStartPlacement,
            isInEndHold,
            playbackPosition,
            steps,
            stepDurations,
            i
          );
        }

        // -----------------------------------------------------------------------
        // Capture frame - offscreen canvas is already at output resolution
        // -----------------------------------------------------------------------
        if (useBackgroundEncoder) {
          const frameData = offscreenCtx.getImageData(
            0,
            0,
            offscreenCanvas.width,
            offscreenCanvas.height
          );

          // Encoder indices and timestamps continue after the opener hold.
          const encodedIndex = openerFrames + i;
          const timestampMicros = encodedIndex * frameDurationMicros;
          const isKeyframe = encodedIndex % keyframeInterval === 0;

          // Parity capture (automated test harness). When
          // window.__tka_parity_capture lists frame indices, stash a COPY of
          // the pre-encode RGBA for those frames — cloned now, before addFrame
          // transfers (neuters) the buffer. The trail-export-parity page then
          // decodes the finished MP4 and diffs decoded-vs-preencode, isolating
          // pure encoder fidelity from any compositor difference.
          const parity = (window as unknown as Record<string, unknown>)
            .__tka_parity_capture as
            | {
                stride: number;
                max: number;
                captured: Record<
                  number,
                  { w: number; h: number; data: Uint8ClampedArray }
                >;
              }
            | undefined;
          if (
            parity &&
            i % parity.stride === 0 &&
            Object.keys(parity.captured).length < parity.max
          ) {
            parity.captured[i] = {
              w: offscreenCanvas.width,
              h: offscreenCanvas.height,
              data: new Uint8ClampedArray(frameData.data),
            };
          }

          // Pre-encode frame dump (DEV). This PNG is the EXACT pixels handed to
          // the encoder — captured from the offscreen composite before any H.264
          // quantization. Compare it against (a) a live-canvas screenshot at the
          // same beat and (b) the encoded video frame at the same timestamp:
          //   - PNG already grainy  → compositor upscale is the culprit
          //   - PNG crisp, video grainy → encoder (bitrate / 4:2:0) is the culprit
          // Frame index overridable via window.__tka_export_frame_dump; defaults
          // to the timeline midpoint.
          // Opt-IN only: this used to dump the midpoint frame on EVERY dev
          // export, which surprised users with a stray PNG (and tripped the
          // browser's "download multiple files" prompt). Now it fires only when
          // window.__tka_export_frame_dump is explicitly set to a frame index.
          if (import.meta.env.DEV) {
            const dumpTarget =
              (window as unknown as Record<string, unknown>)
                .__tka_export_frame_dump as number | undefined;
            if (typeof dumpTarget === "number" && i === dumpTarget) {
              // Flatten over opaque black to mirror exactly what the H.264
              // encoder receives: VideoFrame RGBA → encoder drops alpha, so any
              // semi-transparent glow pixel is shown over black. An alpha-
              // preserved PNG would hide that, so we composite over black here.
              const flat = document.createElement("canvas");
              flat.width = offscreenCanvas.width;
              flat.height = offscreenCanvas.height;
              const flatCtx = flat.getContext("2d");
              if (flatCtx) {
                flatCtx.fillStyle = "#000";
                flatCtx.fillRect(0, 0, flat.width, flat.height);
                flatCtx.drawImage(offscreenCanvas, 0, 0);
                flat.toBlob((b) => {
                  if (!b) return;
                  const url = URL.createObjectURL(b);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `preencode-frame-${i}.png`;
                  a.click();
                  URL.revokeObjectURL(url);
                }, "image/png");
              }
            }
          }

          // Transfer the buffer zero-copy to the worker
          this.backgroundEncoder.addFrame(
            frameData,
            encodedIndex,
            timestampMicros,
            isKeyframe
          );
        } else if (inlineExporter) {
          await inlineExporter.addFrame(offscreenCanvas);
        }

        if (trailDiag) {
          const d = trailDiag.read();
          console.log(
            `[trail-diag] frame=${i} stamps=${d.stamps} dt=${d.lastDt.toFixed(5)}s fade=${d.lastFade.toFixed(5)} (expected stamps: 1 per active color)`
          );
        }

        onProgress({
          progress: (openerFrames + i + 1) / encodedFrameTotal,
          stage: "capturing",
          currentFrame: openerFrames + i + 1,
          totalFrames: encodedFrameTotal,
        });
      }

      if (this.shouldCancel) {
        throw new Error("Export cancelled");
      }

      // -----------------------------------------------------------------------
      // Finalize - flush encoder and download
      // -----------------------------------------------------------------------
      captureComplete = true;
      onProgress({
        progress: encodedTotal > 0 ? encodedSoFar / encodedTotal : 0,
        stage: "encoding",
        currentFrame: encodedTotal > 0 ? encodedSoFar : undefined,
        totalFrames: encodedTotal > 0 ? encodedTotal : undefined,
      });

      let outputBlob: Blob;

      if (useBackgroundEncoder) {
        outputBlob = await this.backgroundEncoder.finish();
      } else if (inlineExporter) {
        outputBlob = await inlineExporter.finish();
      } else {
        throw new Error("No encoder was initialized");
      }

      // Side-effect download is opt-out: callers that capture the returned blob
      // and run their own download/share pass autoDownload:false to avoid a
      // second file landing on disk.
      if (options.autoDownload !== false) {
        await downloadBlob(outputBlob, filename);
      }

      onProgress({ progress: 1, stage: "complete" });

      return outputBlob;
    } catch (error) {
      // Don't log cancellation as an error - it's intentional user action
      if (!this.shouldCancel) {
        console.error("Export failed:", error);
        onProgress({
          progress: 0,
          stage: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
      throw error;
    } finally {
      // --- EXPORT DIAGNOSTIC cleanup ---
      const fireDiagCleanup = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>).__tka_fire_diag as { disable(): void } | undefined : undefined;
      if (fireDiagCleanup) {
        fireDiagCleanup.disable();
      }

      // Dispose the offscreen export engine (releases its WebGL context + canvas).
      offscreen?.dispose();

      this.restoreEffectState(visibilityManager, savedEffectState);
      this.restorePlaybackState(playbackController, captureState);
      this._isExporting = false;
      this.shouldCancel = false;
      this.glyphPrerenderer.clear();
      this.backgroundEncoder.onProgress = null;
      panelState.setVirtualTime(undefined);

      // Clean up composite renderer if it was used
      if (options.compositeMode && options.compositeMode !== "none") {
        this.compositeRenderer.dispose();
      }

      // Invalidate fire frame cache - the frame-by-frame jumpToStep capture
      // desyncs the cached fire simulation from the actual animation position.
      fireCacheInvalidation.trigger();

      // Let callers reset additional transient state if needed.
      options.onCleanup?.();
    }
  }

  cancelExport(): void {
    this.shouldCancel = true;
    this.backgroundEncoder.cancel();
    this.VideoExporter.cancelExport();
    this._isExporting = false;
  }

  isExporting(): boolean {
    return this._isExporting;
  }

  private restorePlaybackState(
    playbackController: AnimationPlaybackController,
    snapshot: { wasPlaying: boolean; step: number }
  ): void {
    playbackController.jumpToStep(snapshot.step);
    if (snapshot.wasPlaying) {
      playbackController.togglePlayback();
    }
  }

  private resolveFilename(
    explicitFilename: string | undefined,
    panelState: AnimationPanelState,
    format: VideoExportFormat
  ): string {
    if (explicitFilename) {
      return explicitFilename;
    }

    const seq = panelState.sequenceData;
    const rawName =
      seq?.displayName ||
      seq?.intendedWord ||
      seq?.word ||
      panelState.sequenceWord ||
      "animation";
    // Collapse repeated kernels ("VΛ-VΛ-VΛ-VΛ-" → "VΛ-") so the filename matches
    // what WordHeader/WordLabel show on screen. Greek glyphs are kept as-is —
    // generateTimestampedFilename sanitizes while preserving Unicode.
    const baseName = simplifyRepeatedWord(rawName);
    const extensionMap: Record<VideoExportFormat, string> = {
      webm: "webm",
      mp4: "mp4",
    };
    const extension = extensionMap[format] || "mp4";
    return generateTimestampedFilename(
      baseName,
      extension
    );
  }


  /**
   * Convert a time position (in duration units) to a beat position (float).
   * Accounts for variable step durations so that longer steps occupy
   * proportionally more frames in the exported video.
   */
  private timeToBeat(
    timeProgress: number,
    cumulativeDurations: number[],
    stepDurations: number[]
  ): number {
    const stepCount = stepDurations.length;
    if (stepCount === 0) return 0;

    // Find which step the time position falls within
    for (let i = stepCount - 1; i >= 0; i--) {
      if (timeProgress >= cumulativeDurations[i]!) {
        const elapsed = timeProgress - cumulativeDurations[i]!;
        const stepDur = stepDurations[i]!;
        const fraction = stepDur > 0 ? Math.min(1, elapsed / stepDur) : 0;
        return i + fraction;
      }
    }

    return 0;
  }

  /**
   * Save current effect state and apply overrides for export.
   * Returns the saved tipEffectMap for restoration after export.
   */
  private applyEffectOverrides(
    visibilityManager: ReturnType<typeof getAnimationVisibilityManager>,
    overrides?: VideoEffectOverrides
  ): TipEffectMap | null {
    if (!overrides) return null;

    const ecs = visibilityManager.effectsConfigState;
    const saved = { ...(ecs?.tipEffectMap ?? {}) };

    // Determine which single effect (if any) should be active for the export.
    // Priority: fire > charcoal > led > trails > none.
    const effect = overrides.fire ? "fire"
      : overrides.charcoal ? "charcoal"
      : overrides.led ? "led"
      : overrides.trails ? "trails"
      : "none";

    ecs?.setActiveEffect(effect);

    return saved;
  }

  /**
   * Restore effect state after export completes.
   */
  private restoreEffectState(
    visibilityManager: ReturnType<typeof getAnimationVisibilityManager>,
    saved: TipEffectMap | null
  ): void {
    if (!saved) return;
    const ecs = visibilityManager.effectsConfigState;
    if (ecs) {
      ecs.setTipEffectMap(saved);
    }
  }

  private waitForAnimationFrame(): Promise<void> {
    if (typeof window === "undefined") {
      return Promise.resolve();
    }

    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
