/**
 * bake-motion.ts
 *
 * Browser-only bake helper. Drives Canvas2DAnimationRenderer (the live
 * AnimatorCanvas renderer) frame by frame and feeds each frame to
 * VideoExporter (WebCodecs H.264). Output is pixel-identical to the
 * live demo. Dev-bake use only — NOT unit-testable in jsdom.
 */

import { Canvas2DAnimationRenderer } from "$lib/shared/animation-engine/services/canvas-2d-animation-renderer";
import { getSequenceAnimationOrchestrator } from "$lib/shared/animation-engine/get-sequence-animation-orchestrator";
import { getVideoExporter } from "$lib/shared/animation-engine/get-video-exporter";
import {
  generateLeftPropSvg,
  generateRightPropSvg,
} from "$lib/shared/animation-engine/services/svg-generator";
import { DEFAULT_TRAIL_SETTINGS } from "$lib/shared/animation-engine/domain/types/trail-types";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import {
  buildGuideMotionSequence,
  type GuideMotionConfig,
} from "../../(public)/guide/level-1/_components/guide-motion-configs";

export interface BakeMotionOptions {
  /** Canvas size in pixels (square). Default: 512 */
  size?: number;
  /** Frames per second. Default: 30 */
  fps?: number;
}

/** Wait for two paint cycles so the canvas is fully painted before capture. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

/**
 * Bake a single GuideMotionConfig to an H.264 mp4 Blob.
 *
 * The returned Blob is pixel-identical to the live animated demo because it
 * uses the same Canvas2DAnimationRenderer → VideoExporter pipeline.
 */
export async function bakeGuideMotion(
  config: GuideMotionConfig,
  options: BakeMotionOptions = {}
): Promise<Blob> {
  const size = options.size ?? 512;
  const fps = options.fps ?? 30;
  const sequence = buildGuideMotionSequence(config);

  // Off-screen container: in the DOM (required for canvas rendering) but
  // invisible and non-interactive.
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:0;top:0;width:${size}px;height:${size}px;opacity:0;pointer-events:none;z-index:-9999;`;
  document.body.appendChild(container);

  const renderer = new Canvas2DAnimationRenderer();
  const exporter = getVideoExporter();
  let manual: Awaited<ReturnType<typeof exporter.createManualExporter>> | null =
    null;
  // Restores the orchestrator's real visibility manager after the bake so the
  // forced-glide override never leaks into the shared singleton (set below).
  let restoreVisibilityManager: (() => void) | null = null;

  try {
    // ── Renderer setup ────────────────────────────────────────────────────
    await renderer.initialize(container, size, 1, true);
    renderer.setDarkMode(true, false);

    await Promise.all([
      renderer.loadGridTexture("diamond", false),
      renderer.loadPerColorPropTextures("hand", "hand", true),
    ]);

    // Prop dimensions come from the same SVG generator used by the live renderer.
    const [leftPropData, rightPropData] = await Promise.all([
      generateLeftPropSvg("hand", true),
      generateRightPropSvg("hand", true),
    ]);
    const leftPropDimensions = {
      width: leftPropData.width,
      height: leftPropData.height,
    };
    const rightPropDimensions = {
      width: rightPropData.width,
      height: rightPropData.height,
    };

    // ── Orchestrator ──────────────────────────────────────────────────────
    const orchestrator = getSequenceAnimationOrchestrator();

    // Force the "glide" effort easing for every baked demo, regardless of the
    // user's selected effort preset. The orchestrator reads its effort preset
    // from (visibilityManagerOverride ?? global manager).getEffortPreset(), so a
    // delegating Proxy that only overrides getEffortPreset gives deterministic
    // output without mutating (and persisting) the user's real setting. Restored
    // in the finally block so the override can't leak into live playback.
    const realVm = getAnimationVisibilityManager();
    const glideVm = new Proxy(realVm, {
      get(target, prop, receiver) {
        if (prop === "getEffortPreset") return () => "glide";
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    orchestrator.setVisibilityManager(glideVm);
    restoreVisibilityManager = () => orchestrator.setVisibilityManager(realVm);

    if (!orchestrator.initializeWithDomainData(sequence)) {
      throw new Error(`Orchestrator init failed for config "${config.id}"`);
    }

    const canvas = renderer.getCanvas();
    if (!canvas)
      throw new Error(`No canvas available for config "${config.id}"`);

    // ── Manual video exporter (WebCodecs H.264 / WASM fallback) ──────────
    manual = await exporter.createManualExporter(size, size, {
      format: "mp4",
      fps,
      autoDownload: false,
    });

    // ── Frame loop ────────────────────────────────────────────────────────
    // Trails are disabled; hoist the settings clone so we don't allocate per frame.
    const trailSettings = { ...DEFAULT_TRAIL_SETTINGS };

    // Drive the bake exactly like the live demo's AnimationPlaybackController:
    // advance a wall-clock-equivalent timePosition in "duration units" (1 unit =
    // 1 second at speed 1.0) and map it through calculateStateDurationAware. The
    // engine's calculateState() takes a *beat* number, not a time — feeding it
    // seconds froze every frame at the start position (currentStep < 1). The
    // duration-aware path is what actually animates the props.
    //
    // The captured cycle matches one full live loop:
    //   start-placement hold (1 unit) + motion (totalDuration) + end hold
    // For non-loopable sequences the live controller adds a 1-unit end-placement
    // hold; seamlessly loopable sequences skip it. A single guide hand-motion does
    // not return to its start, so it is non-loopable and gets the end hold.
    const endPlacementHold = isSeamlesslyLoopable(sequence) ? 0 : 1;
    const totalDuration =
      orchestrator.getTotalDurationWithStartPlacement() + endPlacementHold;
    const totalFrames = Math.max(1, Math.round(totalDuration * fps));

    // Half-open bound: frameIndex runs 0..totalFrames-1 so the cycle's final frame
    // sits just before timePosition === totalDuration. <video loop> wraps that frame
    // straight back to frame 0 (the start pose) for a jitter-free seam with no
    // duplicate frame.
    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
      const timePosition = frameIndex / fps;

      orchestrator.calculateStateDurationAware(timePosition);

      renderer.renderScene({
        leftProp: orchestrator.getLeftPropState(),
        rightProp: orchestrator.getRightPropState(),
        gridVisible: true,
        gridMode: "diamond",
        letter: null,
        turnsTuple: null,
        leftPropDimensions,
        rightPropDimensions,
        leftTrailPoints: [],
        rightTrailPoints: [],
        trailSettings,
        // Baked frames must show fully-settled visibility, never a transitional
        // fade. The renderer's Canvas2DVisibilityFadeManager initializes visible
        // and fades OUT when leftMotionVisible flips false on frame 0 — at ~0ms
        // elapsed that fade hasn't settled, so the left hand flashes for the
        // opening frames (visible on hm-shift-wn). Pushing currentTime far past
        // the max fade duration forces elapsed ≥ duration every frame, so all
        // fades read as complete and no transitional alpha is ever drawn.
        currentTime: performance.now() + 10_000,
        visibility: {
          gridVisible: true,
          propsVisible: true,
          trailsVisible: false,
          leftMotionVisible: config.showLeft,
          rightMotionVisible: true,
        },
        // Mirror the canonical FrameParameterBuilder: the red hand is the right
        // hand and is always anatomically mirrored; the blue (left) hand never is.
        // The live demo delegates this to the engine; the bake drives the renderer
        // directly, so it must replicate the flip here or the red hand renders unmirrored.
        leftPropFlipped: false,
        rightPropFlipped: true,
        leftPropType: "hand",
        rightPropType: "hand",
      });

      // Double rAF: let the canvas paint before the frame is captured.
      await nextPaint();
      await manual.addFrame(canvas);
    }

    return await manual.finish();
  } catch (error) {
    // cancel() is idempotent — safe even if addFrame/finish already cancelled internally.
    manual?.cancel();
    throw error;
  } finally {
    restoreVisibilityManager?.();
    renderer.destroy();
    container.remove();
  }
}
