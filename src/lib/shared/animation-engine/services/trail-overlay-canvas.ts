/**
 * Trail Overlay Canvas
 *
 * Dedicated Canvas2D overlay for trail rendering. Accumulates trail pixels
 * and fades them with the `destination-out` composite operation, producing
 * smooth trail decay that persists across sequence boundaries.
 *
 * Architecture follows the fire renderer pattern: reads prop tip positions
 * directly from PropState each frame (via PropPositionCalculator), maintaining
 * its own internal ring buffer. This makes it completely independent of the
 * SequenceCache/TrailCapturer pipeline, so sequence transitions are seamless.
 *
 * Follows the same overlay pattern as WebGLFireRenderer and LedOverlayRenderer:
 * position: absolute, pointer-events: none, z-index: 1.
 *
 * @deprecated Superseded by render-graph TrailPassExecutor + WebGL2Backend/WebGPUBackend.
 * Trail capture → TrailTranslator → TrailPass → GPU ping-pong decay.
 * Gated behind window.__TKA_UNIFIED_VIEWER.
 */

import type {
  ITrailOverlayCanvas,
  TrailOverlayRenderParams,
} from "./ITrailOverlayCanvas";
import type { TrailPoint, TrailSettings } from "../domain/types/trail-types";
import { TrackingMode } from "../domain/types/trail-types";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import { Canvas2DTrailRenderer } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-trail-renderer";
import { Canvas2DVisibilityFadeManager } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-visibility-fade-manager";
import { calculateTrailSourceEndpoint } from "$lib/shared/animation-engine/services/prop-position-calculator";
import {
  resolveTrailPointConfig,
  type TrailPointSource,
  type TrailPointConfig,
} from "../domain/types/trail-point-types";
import { propTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";
import { resolveEffect } from "../domain/types/tip-effect-types";
import { recordTunnelFormationTrailCaptures } from "./tunnel-formation-trail-telemetry";

/** Minimum ring capacity; actual capacity grows with `trailSettings.tailLength`. */
const RING_BUFFER_MIN = 120;
const RING_BUFFER_HEADROOM = 20;

/** Default visible leading edge when no settings have been applied yet. */
const DEFAULT_LEADING_EDGE = 20;
const TRAIL_ENDPOINT_DIMENSIONS = { width: 252.8, height: 77.8 };

function effectTipIndex(source: TrailPointSource, logicalEnd: 0 | 1): number {
  return source.type === "tip" ? source.index : logicalEnd;
}

/**
 * Export-fidelity diagnostic. Counts how many times the trail accumulator is
 * actually stamped (one stamp per active color per time-advanced frame) and
 * records the last fade input (deltaTime) / output (fadeAmount). Enable from
 * the console before exporting:
 *   window.__tka_trail_diag.enable()
 * The video exporter reads this per captured frame and logs the stamp count,
 * so any value above the active-color count (1 or 2) proves duplicate stamping
 * — the cause of the "doubly opaque" export trail.
 */
const trailDiag = {
  enabled: false,
  stamps: 0,
  lastDt: 0,
  lastFade: 0,
};

function ensureTrailDiagHook(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w.__tka_trail_diag) return;
  w.__tka_trail_diag = {
    enable() {
      trailDiag.enabled = true;
      trailDiag.stamps = 0;
    },
    disable() {
      trailDiag.enabled = false;
    },
    reset() {
      trailDiag.stamps = 0;
    },
    /** Read the accumulated stamp count + last fade values, then reset the count. */
    read() {
      const snapshot = {
        stamps: trailDiag.stamps,
        lastDt: trailDiag.lastDt,
        lastFade: trailDiag.lastFade,
      };
      trailDiag.stamps = 0;
      return snapshot;
    },
  };
}

export class TrailOverlayCanvas implements ITrailOverlayCanvas {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  // Per-color offscreen accumulator canvases. Each color owns its own
  // trail pixels so they can be composited with an independent alpha
  // envelope, giving smooth per-color fade-in / fade-out without the
  // two colors affecting each other.
  private leftAccumCanvas: OffscreenCanvas | null = null;
  private leftAccumCtx: OffscreenCanvasRenderingContext2D | null = null;
  private rightAccumCanvas: OffscreenCanvas | null = null;
  private rightAccumCtx: OffscreenCanvasRenderingContext2D | null = null;
  // Scratch buffer used by the tapered renderer on each accumulator to
  // prevent polygon-edge seams on the stamp pass.
  private bufferCanvas: OffscreenCanvas | null = null;
  private bufferCtx:
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null = null;
  private trailRenderer = new Canvas2DTrailRenderer();
  private width = 0;
  private height = 0;

  // Per-color alpha envelope. Matches prop fade timing (300 ms in / 200 ms
  // out with cubic ease-out) so the trail's appearance/disappearance
  // tracks the prop's motion-visibility transition.
  private leftEnvelope = new Canvas2DVisibilityFadeManager(300, 200);
  private rightEnvelope = new Canvas2DVisibilityFadeManager(300, 200);
  // Tracks whether the previous frame's composite alpha was fully faded
  // out, so we can do a one-shot accumulator clear exactly when the
  // envelope reaches zero (guards against residual pixels bleeding into
  // the next fade-in cycle).
  private leftAccumClearedWhileHidden = true;
  private rightAccumClearedWhileHidden = true;

  // Per-end ring buffers - separate buffers for left/right ends to prevent
  // the renderer from zigzagging between endpoints. Filled from PropState
  // each frame (fire-renderer pattern), independent of the SequenceCache.
  private leftLeftRing: TrailPoint[] = [];
  private leftRightRing: TrailPoint[] = [];
  private rightLeftRing: TrailPoint[] = [];
  private rightRightRing: TrailPoint[] = [];

  // Overlaid tunnel-layer rings (one left/right pair per layer per color). These
  // composite into the SAME blue/red accumulators as the base pair — so the
  // memory cost stays at two accumulator canvases regardless of fold count.
  private leftLayerRings: Array<{ left: TrailPoint[]; right: TrailPoint[] }> =
    [];
  private rightLayerRings: Array<{ left: TrailPoint[]; right: TrailPoint[] }> =
    [];
  private layerTrailCaptureSuppressed: boolean[] = [];

  // Track previous tracking mode to detect changes
  private lastTrackingMode: TrackingMode | null = null;

  // Track previous per-color visibility. When a color transitions from
  // hidden back to visible, its ring buffers still contain stale points
  // from before it was hidden, and the next capture would draw a straight
  // line between the stale tail and the fresh tip. Clear on false→true.
  private lastHasLeft = true;
  private lastHasRight = true;

  // Track previous per-color prop-swap suppression. Separate from
  // lastHasBlue/Red because the prop stays visible throughout a crossfade.
  // Lifting suppression must not clear the accumulator, so the old trail
  // keeps fading naturally while the new source starts a disconnected path.
  private lastLeftPropSwapSuppressed = false;
  private lastRightPropSwapSuppressed = false;

  // Tracks whether a previous center position exists for the center-point
  // smoothing path (used by clearBuffers to reset inter-sequence state).
  private hasPrevCenter = false;

  // smoothAlphaDecay does a full-canvas getImageData/putImageData roundtrip
  // - a GPU↔CPU sync of ~3.6MB at 950². Running it every frame dominated
  // render time (40-60ms). Amortize over N frames with a proportionally
  // larger DECAY step so observable fade rate is unchanged.
  private leftAlphaDecayFrameCounter = 0;
  private rightAlphaDecayFrameCounter = 0;
  private static readonly SMOOTH_ALPHA_DECAY_INTERVAL = 10;
  private static readonly SMOOTH_ALPHA_DECAY_STEP = 20;

  // Skip trail capture for the first few frames after initialization so
  // props can settle into their correct starting positions. Without this,
  // the very first frame captures props at an intermediate location (e.g.
  // origin or default coords) and the jump to the real position draws a
  // brief straight-line artifact that fades out.
  private warmupFramesRemaining = 0;
  private static readonly WARMUP_FRAMES = 3;

  // Current per-settings leading edge and ring capacity; refreshed from
  // trailSettings.tailLength each renderFrame.
  private leadingEdge = DEFAULT_LEADING_EDGE;
  private ringCapacity = RING_BUFFER_MIN;

  // Per-tip trail flags from previous frame, encoded as a 4-bit mask
  // (bit0=blue-left, bit1=blue-right, bit2=red-left, bit3=red-right).
  // A mask change resets source rings but deliberately leaves painted pixels
  // in the per-color accumulator, where normal destination-out decay retires
  // them without an abrupt visual cut.
  private prevTipTrailMask = 0xf;

  initialize(container: HTMLElement, width: number, height: number): void {
    this.dispose();
    ensureTrailDiagHook();

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.setAttribute("aria-hidden", "true");

    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "1";
    canvas.style.background = "transparent";

    container.appendChild(canvas);

    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { willReadFrequently: true });
    this.bufferCanvas = new OffscreenCanvas(width, height);
    this.bufferCtx = this.bufferCanvas.getContext("2d");
    this.leftAccumCanvas = new OffscreenCanvas(width, height);
    this.leftAccumCtx = this.leftAccumCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    this.rightAccumCanvas = new OffscreenCanvas(width, height);
    this.rightAccumCtx = this.rightAccumCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    this.width = width;
    this.height = height;
    this.warmupFramesRemaining = TrailOverlayCanvas.WARMUP_FRAMES;
    // Envelopes start at fully visible; the first renderFrame will
    // immediately animate them toward the actual hasBlue/hasRed state.
    this.leftEnvelope.reset();
    this.rightEnvelope.reset();
    this.leftAccumClearedWhileHidden = true;
    this.rightAccumClearedWhileHidden = true;
  }

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    const sizeChanged = width !== this.width || height !== this.height;
    this.canvas.width = width;
    this.canvas.height = height;
    if (this.bufferCanvas) {
      this.bufferCanvas.width = width;
      this.bufferCanvas.height = height;
    }
    if (this.leftAccumCanvas) {
      this.leftAccumCanvas.width = width;
      this.leftAccumCanvas.height = height;
    }
    if (this.rightAccumCanvas) {
      this.rightAccumCanvas.width = width;
      this.rightAccumCanvas.height = height;
    }
    this.width = width;
    this.height = height;

    // Canvas resize invalidates all ring buffer positions - they were
    // computed at the old canvas size and would cause artifact lines
    // when the next point is captured at the new size.
    if (sizeChanged) {
      this.leftLeftRing = [];
      this.leftRightRing = [];
      this.rightLeftRing = [];
      this.rightRightRing = [];
      this.warmupFramesRemaining = TrailOverlayCanvas.WARMUP_FRAMES;
    }
  }

  renderFrame(params: TrailOverlayRenderParams): void {
    const ctx = this.ctx;
    if (!ctx) return;

    // Let props settle before capturing trail data. The first few frames
    // often have props at intermediate positions (default coords before the
    // animation engine places them), which produces a straight-line artifact.
    if (this.warmupFramesRemaining > 0) {
      this.warmupFramesRemaining--;
      return;
    }

    const {
      trailSettings,
      deltaTime,
      canvasSize,
      hasLeft,
      hasRight,
      leftProp,
      rightProp,
      leftPropType,
      rightPropType,
      currentTime,
      additionalLayers,
      leftPropSwapSuppressed = false,
      rightPropSwapSuppressed = false,
    } = params;

    // Non-seamless loop wrap: the props teleport from the end position back to
    // the start. Drop the source rings so the next captured point can't connect
    // to the stale end-of-sequence tail with a straight line. The accumulator
    // canvases are left untouched, so the previous trail keeps fading via
    // destination-out while the fresh trail builds from the start position.
    // Seamless loops (end == start) flow across the boundary with no teleport.
    if (params.loopDetected && !params.isSeamlesslyLoopable) {
      this.leftLeftRing = [];
      this.leftRightRing = [];
      this.rightLeftRing = [];
      this.rightRightRing = [];
      this.leftLayerRings = [];
      this.rightLayerRings = [];
    }

    this.leadingEdge = Math.max(
      2,
      Math.floor(trailSettings.tailLength ?? DEFAULT_LEADING_EDGE)
    );
    this.ringCapacity = Math.max(
      RING_BUFFER_MIN,
      this.leadingEdge + RING_BUFFER_HEADROOM
    );

    // 1. Capture current prop tip positions into ring buffers
    //    (fire-renderer pattern: always read from PropState directly)
    // Clear ring buffers when tracking mode changes so stale points
    // don't create artifact lines. The overlay's painted pixels fade
    // naturally via destination-out.
    if (
      this.lastTrackingMode !== null &&
      this.lastTrackingMode !== trailSettings.trackingMode
    ) {
      this.leftLeftRing = [];
      this.leftRightRing = [];
      this.rightLeftRing = [];
      this.rightRightRing = [];
      this.leftLayerRings = [];
      this.rightLayerRings = [];
    }
    this.lastTrackingMode = trailSettings.trackingMode;

    // Advance per-color alpha envelopes toward their target visibility.
    // The envelope drives the final composite alpha, so toggling a color
    // off animates the trail's opacity down over 200 ms and toggling it
    // back on animates it up over 300 ms (matching prop fade timing).
    // The envelope manager records setVisible() with performance.now()
    // internally, so updateProgress() must also read wall-clock time -
    // params.currentTime can be virtual/animation time and would make
    // the transition complete in a single frame if used here.
    const envelopeNow = performance.now();
    this.leftEnvelope.setVisible(hasLeft);
    this.rightEnvelope.setVisible(hasRight);
    const leftFade = this.leftEnvelope.updateProgress(envelopeNow);
    const rightFade = this.rightEnvelope.updateProgress(envelopeNow);

    // When a color transitions false→true and its accumulator still
    // holds residual pixels from before the fade-out completed, clear
    // the accumulator so the fade-in doesn't reveal a ghost of the old
    // trail. We only guarantee a clear after the envelope reaches 0,
    // so a rapid toggle-off/on mid-fade keeps the old trail in place
    // and lets the envelope animate it back up seamlessly.
    const leftBecameVisible = hasLeft && !this.lastHasLeft;
    const rightBecameVisible = hasRight && !this.lastHasRight;
    if (leftBecameVisible) {
      this.leftLeftRing = [];
      this.leftRightRing = [];
      this.leftLayerRings = [];
      if (this.leftAccumClearedWhileHidden && this.leftAccumCtx) {
        this.leftAccumCtx.clearRect(0, 0, this.width, this.height);
      }
      this.leftAccumClearedWhileHidden = false;
    }
    if (rightBecameVisible) {
      this.rightLeftRing = [];
      this.rightRightRing = [];
      this.rightLayerRings = [];
      if (this.rightAccumClearedWhileHidden && this.rightAccumCtx) {
        this.rightAccumCtx.clearRect(0, 0, this.width, this.height);
      }
      this.rightAccumClearedWhileHidden = false;
    }
    this.lastHasLeft = hasLeft;
    this.lastHasRight = hasRight;

    // Prop-swap suppression lift: reset that color's ring so the next capture
    // starts a fresh, disconnected segment at the new prop's tip geometry.
    // Deliberately does NOT clear the accumulator (unlike blueBecameVisible
    // above) — the point is letting the pre-swap trail keep fading via its
    // normal destination-out decay, not wiping it.
    if (!leftPropSwapSuppressed && this.lastLeftPropSwapSuppressed) {
      this.leftLeftRing = [];
      this.leftRightRing = [];
    }
    if (!rightPropSwapSuppressed && this.lastRightPropSwapSuppressed) {
      this.rightLeftRing = [];
      this.rightRightRing = [];
    }
    this.lastLeftPropSwapSuppressed = leftPropSwapSuppressed;
    this.lastRightPropSwapSuppressed = rightPropSwapSuppressed;

    const leftHasTwoEnds = propTipEnds(leftPropType ?? undefined) === 2;
    const rightHasTwoEnds = propTipEnds(rightPropType ?? undefined) === 2;
    const modeTracksLeft =
      trailSettings.trackingMode === TrackingMode.LEFT_END ||
      trailSettings.trackingMode === TrackingMode.BOTH_ENDS;
    // HAND tracks the single prop-center source, carried on the right slot of
    // the resolved config. Routing it through modeTracksRight makes both single-
    // and two-ended props emit exactly one hand trail (left stays off).
    const modeTracksRight =
      trailSettings.trackingMode === TrackingMode.RIGHT_END ||
      trailSettings.trackingMode === TrackingMode.BOTH_ENDS ||
      trailSettings.trackingMode === TrackingMode.HAND;
    const leftTrackLeft = leftHasTwoEnds && modeTracksLeft;
    const leftTrackRight = !leftHasTwoEnds || modeTracksRight;
    const rightTrackLeft = rightHasTwoEnds && modeTracksLeft;
    const rightTrackRight = !rightHasTwoEnds || modeTracksRight;

    // Per-tip effect gating: only capture tips assigned to "trails" in
    // the tip effect map. When no map is provided, all tips are eligible.
    const tipMap = params.tipEffectMap;
    const hasMap = tipMap && Object.keys(tipMap).length > 0;
    const leftTrailConfig = resolveTrailPointConfig(
      leftPropType,
      trailSettings.trackingMode
    );
    const rightTrailConfig = resolveTrailPointConfig(
      rightPropType,
      trailSettings.trackingMode
    );
    const leftLeftTrails =
      leftTrailConfig.left.type !== "none" &&
      (!hasMap ||
        resolveEffect(
          0,
          effectTipIndex(leftTrailConfig.left, 0),
          tipMap!,
          {}
        ) === "trails");
    const leftRightTrails =
      leftTrailConfig.right.type !== "none" &&
      (!hasMap ||
        resolveEffect(
          0,
          effectTipIndex(leftTrailConfig.right, 1),
          tipMap!,
          {}
        ) === "trails");
    const rightLeftTrails =
      rightTrailConfig.left.type !== "none" &&
      (!hasMap ||
        resolveEffect(
          1,
          effectTipIndex(rightTrailConfig.left, 0),
          tipMap!,
          {}
        ) === "trails");
    const rightRightTrails =
      rightTrailConfig.right.type !== "none" &&
      (!hasMap ||
        resolveEffect(
          1,
          effectTipIndex(rightTrailConfig.right, 1),
          tipMap!,
          {}
        ) === "trails");

    // Detect tip-set changes. Reset source rings so a newly enabled tip cannot
    // connect to an old endpoint, but preserve each affected accumulator. Its
    // already-painted pixels are exactly the outgoing trail and should fade
    // through the regular destination-out pass instead of vanishing here.
    const tipMask =
      (leftLeftTrails ? 1 : 0) |
      (leftRightTrails ? 2 : 0) |
      (rightLeftTrails ? 4 : 0) |
      (rightRightTrails ? 8 : 0);
    if (tipMask !== this.prevTipTrailMask) {
      const leftBitsChanged = (tipMask & 0x3) !== (this.prevTipTrailMask & 0x3);
      const rightBitsChanged =
        (tipMask & 0xc) !== (this.prevTipTrailMask & 0xc);
      if (leftBitsChanged) {
        this.leftLeftRing = [];
        this.leftRightRing = [];
        this.leftLayerRings = [];
      }
      if (rightBitsChanged) {
        this.rightLeftRing = [];
        this.rightRightRing = [];
        this.rightLayerRings = [];
      }
      this.prevTipTrailMask = tipMask;
    }

    // Capture while the color is visible OR while its fade-out envelope
    // is still transitioning - this keeps the trail tracking the prop's
    // actual motion during the fade rather than freezing the last tail.
    // Capture stops once the envelope reaches zero (prop fully hidden),
    // so the ring doesn't keep growing invisibly in the background.
    const leftCaptureLive = hasLeft || leftFade.alpha > 0;
    const rightCaptureLive = hasRight || rightFade.alpha > 0;
    if (leftProp && leftCaptureLive && !leftPropSwapSuppressed) {
      this.capturePropTips(
        leftProp,
        canvasSize,
        leftPropType,
        0,
        leftTrackLeft && leftLeftTrails,
        leftTrackRight && leftRightTrails,
        leftTrailConfig,
        currentTime
      );
    }
    if (rightProp && rightCaptureLive && !rightPropSwapSuppressed) {
      this.capturePropTips(
        rightProp,
        canvasSize,
        rightPropType,
        1,
        rightTrackLeft && rightLeftTrails,
        rightTrackRight && rightRightTrails,
        rightTrailConfig,
        currentTime
      );
    }

    // Capture overlaid tunnel-layer tips into per-layer rings (same color/tip
    // gating as the base pair). These draw into the shared blue/red accumulators.
    let formationTrailCaptures = 0;
    if (additionalLayers && additionalLayers.length > 0) {
      this.ensureLayerRings(additionalLayers.length);
      for (let i = 0; i < additionalLayers.length; i++) {
        const layer = additionalLayers[i]!;
        const leftRings = this.leftLayerRings[i]!;
        const rightRings = this.rightLayerRings[i]!;
        const captureSuppressed = layer.trailCaptureSuppressed === true;
        if (this.layerTrailCaptureSuppressed[i] !== captureSuppressed) {
          leftRings.left.length = 0;
          leftRings.right.length = 0;
          rightRings.left.length = 0;
          rightRings.right.length = 0;
        }
        this.layerTrailCaptureSuppressed[i] = captureSuppressed;
        const pointsBefore =
          leftRings.left.length +
          leftRings.right.length +
          rightRings.left.length +
          rightRings.right.length;
        if (
          layer.leftProp &&
          layer.hasLeft &&
          leftCaptureLive &&
          !leftPropSwapSuppressed &&
          !captureSuppressed
        ) {
          this.capturePropTipsInto(
            layer.leftProp,
            canvasSize,
            leftPropType,
            0,
            leftRings.left,
            leftRings.right,
            leftTrackLeft && leftLeftTrails,
            leftTrackRight && leftRightTrails,
            leftTrailConfig,
            currentTime
          );
        }
        if (
          layer.rightProp &&
          layer.hasRight &&
          rightCaptureLive &&
          !rightPropSwapSuppressed &&
          !captureSuppressed
        ) {
          this.capturePropTipsInto(
            layer.rightProp,
            canvasSize,
            rightPropType,
            1,
            rightRings.left,
            rightRings.right,
            rightTrackLeft && rightLeftTrails,
            rightTrackRight && rightRightTrails,
            rightTrailConfig,
            currentTime
          );
        }
        if (layer.formationTransitionActive) {
          const pointsAfter =
            leftRings.left.length +
            leftRings.right.length +
            rightRings.left.length +
            rightRings.right.length;
          formationTrailCaptures += Math.max(0, pointsAfter - pointsBefore);
        }
      }
      this.layerTrailCaptureSuppressed.length = additionalLayers.length;
    } else if (
      this.leftLayerRings.length > 0 ||
      this.rightLayerRings.length > 0
    ) {
      this.leftLayerRings = [];
      this.rightLayerRings = [];
      this.layerTrailCaptureSuppressed = [];
    }
    recordTunnelFormationTrailCaptures(formationTrailCaptures);

    const fadeAmount = this.computeFadeAmount(
      trailSettings.fadeDurationMs,
      deltaTime
    );
    if (trailDiag.enabled) {
      trailDiag.lastDt = deltaTime;
      trailDiag.lastFade = fadeAmount;
    }
    const overlaySettings = {
      ...trailSettings,
      glowBlur: 0,
      lineWidth: Math.max(3.5, trailSettings.lineWidth),
    };

    // Advance each per-color accumulator: fade existing pixels, stamp
    // the current leading edge. Envelope doesn't touch the accumulator
    // contents - it only modulates the final composite alpha below.
    // hasColor=false during prop-swap suppression (not just blueCaptureLive) —
    // this is the SAME "frozen trail fades out via the steps above" path
    // advanceAccumulator already uses for a toggled-off prop, which is
    // exactly what a suppressed swap needs: no new stamp, existing pixels
    // keep decaying via the fade pass above it.
    this.advanceAccumulator(
      this.leftAccumCtx,
      leftCaptureLive && !leftPropSwapSuppressed,
      leftFade.alpha > 0,
      this.leftLeftRing,
      this.leftRightRing,
      overlaySettings,
      currentTime,
      canvasSize,
      fadeAmount,
      /* isLeft */ true,
      this.leftLayerRings,
      additionalLayers?.map((layer) =>
        layer.trailCaptureSuppressed ? 0 : layer.opacity
      ) ?? []
    );
    this.advanceAccumulator(
      this.rightAccumCtx,
      rightCaptureLive && !rightPropSwapSuppressed,
      rightFade.alpha > 0,
      this.rightLeftRing,
      this.rightRightRing,
      overlaySettings,
      currentTime,
      canvasSize,
      fadeAmount,
      /* isLeft */ false,
      this.rightLayerRings,
      additionalLayers?.map((layer) =>
        layer.trailCaptureSuppressed ? 0 : layer.opacity
      ) ?? []
    );

    // Mark each accumulator as "fully cleared while hidden" once its
    // envelope has finished animating out. Next hidden→visible transition
    // will do the safety clear so the fade-in starts from a blank canvas.
    if (!hasLeft && leftFade.alpha === 0 && !leftFade.isTransitioning) {
      if (!this.leftAccumClearedWhileHidden && this.leftAccumCtx) {
        this.leftAccumCtx.clearRect(0, 0, this.width, this.height);
        this.leftAccumClearedWhileHidden = true;
      }
    }
    if (!hasRight && rightFade.alpha === 0 && !rightFade.isTransitioning) {
      if (!this.rightAccumClearedWhileHidden && this.rightAccumCtx) {
        this.rightAccumCtx.clearRect(0, 0, this.width, this.height);
        this.rightAccumClearedWhileHidden = true;
      }
    }

    // Composite the two per-color accumulators onto the visible canvas
    // with their independent envelope alphas. This is where the fade
    // in/out animation actually shows up on screen.
    ctx.clearRect(0, 0, this.width, this.height);
    if (leftFade.alpha > 0 && this.leftAccumCanvas) {
      ctx.save();
      ctx.globalAlpha = leftFade.alpha;
      ctx.drawImage(this.leftAccumCanvas, 0, 0);
      ctx.restore();
    }
    if (rightFade.alpha > 0 && this.rightAccumCanvas) {
      ctx.save();
      ctx.globalAlpha = rightFade.alpha;
      ctx.drawImage(this.rightAccumCanvas, 0, 0);
      ctx.restore();
    }
  }

  /**
   * Fade + stamp one color's accumulator. `hasColor` gates whether a
   * new stamp is drawn this frame (false means the prop is toggled off
   * and the trail should freeze in place while the envelope fades out).
   * `envelopeLive` gates the fade pass - once the envelope is at zero
   * and the accumulator has been cleared, there is no point continuing
   * to run the costly smoothAlphaDecay read/write every frame.
   */
  private advanceAccumulator(
    accumCtx: OffscreenCanvasRenderingContext2D | null,
    hasColor: boolean,
    envelopeLive: boolean,
    leftRing: TrailPoint[],
    rightRing: TrailPoint[],
    overlaySettings: TrailSettings,
    currentTime: number,
    canvasSize: number,
    fadeAmount: number,
    isLeft: boolean,
    extraRings: Array<{ left: TrailPoint[]; right: TrailPoint[] }> = [],
    extraRingOpacities: number[] = []
  ): void {
    if (!accumCtx) return;
    if (!hasColor && !envelopeLive) {
      // Nothing on screen, nothing to draw - skip the whole pass.
      return;
    }

    accumCtx.save();
    accumCtx.globalCompositeOperation = "destination-out";
    accumCtx.globalAlpha = fadeAmount;
    accumCtx.fillStyle = "black";
    accumCtx.fillRect(0, 0, this.width, this.height);
    accumCtx.restore();

    this.smoothAlphaDecay(accumCtx, isLeft);

    if (!hasColor) return; // frozen trail fades out via the steps above

    const bCtx = this.bufferCtx;
    if (!bCtx) return;

    bCtx.clearRect(0, 0, this.width, this.height);
    let drew = false;

    const leftLeading = this.getLeadingEdge(leftRing, canvasSize);
    const rightLeading = this.getLeadingEdge(rightRing, canvasSize);
    const passes: Array<{ points: TrailPoint[]; opacity: number }> = [];
    if (leftLeading.length >= 2)
      passes.push({ points: leftLeading, opacity: 1 });
    if (rightLeading.length >= 2)
      passes.push({ points: rightLeading, opacity: 1 });

    // Overlaid tunnel-layer leading edges — drawn into the same accumulator.
    for (let index = 0; index < extraRings.length; index++) {
      const lr = extraRings[index]!;
      const opacity = Math.max(0, Math.min(1, extraRingOpacities[index] ?? 1));
      const l = this.getLeadingEdge(lr.left, canvasSize);
      if (l.length >= 2) passes.push({ points: l, opacity });
      const r = this.getLeadingEdge(lr.right, canvasSize);
      if (r.length >= 2) passes.push({ points: r, opacity });
    }

    for (const pass of passes) {
      // renderTrails takes a blue ring and a red ring separately - pass
      // the leading edge in only the active color's slot and an empty
      // array (with its `has*` flag set false) in the other.
      bCtx.save();
      bCtx.globalAlpha = pass.opacity;
      this.trailRenderer.renderTrails(
        bCtx as CanvasRenderingContext2D,
        isLeft ? pass.points : [],
        isLeft ? [] : pass.points,
        overlaySettings,
        currentTime,
        isLeft,
        !isLeft,
        canvasSize
      );
      bCtx.restore();
      drew = true;
    }

    if (drew) {
      accumCtx.save();
      accumCtx.globalCompositeOperation = "source-over";
      accumCtx.globalAlpha = 1.0;
      accumCtx.drawImage(this.bufferCanvas!, 0, 0);
      accumCtx.restore();
      if (trailDiag.enabled) trailDiag.stamps++;
    }
  }

  clear(): void {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.leftAccumCtx?.clearRect(0, 0, this.width, this.height);
    this.rightAccumCtx?.clearRect(0, 0, this.width, this.height);
    this.leftLeftRing = [];
    this.leftRightRing = [];
    this.rightLeftRing = [];
    this.rightRightRing = [];
    this.leftLayerRings = [];
    this.rightLayerRings = [];
    this.layerTrailCaptureSuppressed = [];
    this.leftEnvelope.reset();
    this.rightEnvelope.reset();
    this.leftAccumClearedWhileHidden = true;
    this.rightAccumClearedWhileHidden = true;
    this.warmupFramesRemaining = TrailOverlayCanvas.WARMUP_FRAMES;
    this.prevTipTrailMask = 0xf;
  }

  /** Flush stale trail data on sequence change. Applies a short warmup
   *  to let canvas sizing and prop state propagate before capturing. */
  clearBuffers(): void {
    if (!this.ctx) return;
    this.hasPrevCenter = false;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.leftAccumCtx?.clearRect(0, 0, this.width, this.height);
    this.rightAccumCtx?.clearRect(0, 0, this.width, this.height);
    this.leftLeftRing = [];
    this.leftRightRing = [];
    this.rightLeftRing = [];
    this.rightRightRing = [];
    this.leftLayerRings = [];
    this.rightLayerRings = [];
    this.layerTrailCaptureSuppressed = [];
    this.leftAccumClearedWhileHidden = true;
    this.rightAccumClearedWhileHidden = true;
    // Always apply warmup - the orchestrator sets angles synchronously but
    // the canvas size may still be settling (resize events arrive async)
    // and Svelte reactive props may not have propagated yet.
    this.warmupFramesRemaining = TrailOverlayCanvas.WARMUP_FRAMES;
  }

  setVisible(visible: boolean): void {
    if (!this.canvas) return;
    this.canvas.style.display = visible ? "" : "none";
  }

  setCanvasZIndex(z: number): void {
    if (this.canvas) this.canvas.style.zIndex = String(z);
  }

  dispose(): void {
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.bufferCanvas = null;
    this.bufferCtx = null;
    this.leftAccumCanvas = null;
    this.leftAccumCtx = null;
    this.rightAccumCanvas = null;
    this.rightAccumCtx = null;
    this.width = 0;
    this.height = 0;
    this.leftLeftRing = [];
    this.leftRightRing = [];
    this.rightLeftRing = [];
    this.rightRightRing = [];
    this.leftLayerRings = [];
    this.rightLayerRings = [];
    this.layerTrailCaptureSuppressed = [];
  }

  // Internal helpers

  /**
   * Capture tip positions for a single prop into the appropriate ring
   * buffers. The shared resolver supplies the same canonical endpoint used by
   * the WebGL overlay and honors any explicit Effects Lab assignment.
   */
  private capturePropTips(
    prop: PropState,
    canvasSize: number,
    propType: string | null | undefined,
    propIndex: 0 | 1,
    trackLeft: boolean,
    trackRight: boolean,
    trailConfig: TrailPointConfig,
    currentTime: number
  ): void {
    const leftRing = propIndex === 0 ? this.leftLeftRing : this.rightLeftRing;
    const rightRing =
      propIndex === 0 ? this.leftRightRing : this.rightRightRing;
    this.capturePropTipsInto(
      prop,
      canvasSize,
      propType,
      propIndex,
      leftRing,
      rightRing,
      trackLeft,
      trackRight,
      trailConfig,
      currentTime
    );
  }

  /** Capture a prop's tip positions into the supplied left/right rings. Shared
   *  by the base pair (its own rings) and each overlaid tunnel layer. The caller
   *  passes the already tracking-mode-resolved trailConfig so HAND mode (prop-
   *  center source) and the per-prop tip config resolve exactly once per frame. */
  private capturePropTipsInto(
    prop: PropState,
    canvasSize: number,
    propType: string | null | undefined,
    propIndex: 0 | 1,
    leftRing: TrailPoint[],
    rightRing: TrailPoint[],
    trackLeft: boolean,
    trackRight: boolean,
    trailConfig: TrailPointConfig,
    currentTime: number
  ): void {
    const endpointConfig = {
      canvasSize,
      propDimensions: TRAIL_ENDPOINT_DIMENSIONS,
    };
    // Tips are computed in the engine's square; this canvas covers the whole
    // frame with that square centred in it.
    const offsetX = (this.width - canvasSize) / 2;
    const offsetY = (this.height - canvasSize) / 2;

    if (trackLeft) {
      const endpoint = calculateTrailSourceEndpoint(
        prop,
        endpointConfig,
        trailConfig.left,
        propType
      );
      if (endpoint) {
        this.appendToRing(
          leftRing,
          endpoint.x + offsetX,
          endpoint.y + offsetY,
          canvasSize,
          propIndex,
          endpoint.tipIndex ?? 0,
          currentTime
        );
      }
    }
    if (trackRight) {
      const endpoint = calculateTrailSourceEndpoint(
        prop,
        endpointConfig,
        trailConfig.right,
        propType
      );
      if (endpoint) {
        this.appendToRing(
          rightRing,
          endpoint.x + offsetX,
          endpoint.y + offsetY,
          canvasSize,
          propIndex,
          endpoint.tipIndex ?? 1,
          currentTime
        );
      }
    }
  }

  /** Grow/shrink the per-layer ring pools to match the active layer count. */
  private ensureLayerRings(count: number): void {
    while (this.leftLayerRings.length < count) {
      this.leftLayerRings.push({ left: [], right: [] });
      this.rightLayerRings.push({ left: [], right: [] });
    }
    if (this.leftLayerRings.length > count) {
      this.leftLayerRings.length = count;
      this.rightLayerRings.length = count;
    }
  }

  private appendToRing(
    ring: TrailPoint[],
    worldX: number,
    worldY: number,
    canvasSize: number,
    propIndex: 0 | 1,
    tipIndex: number,
    currentTime: number
  ): void {
    if (ring.length > 0) {
      const last = ring[ring.length - 1]!;
      const dx = worldX - last.x;
      const dy = worldY - last.y;
      const distSq = dx * dx + dy * dy;

      // Skip discontinuities (teleports)
      if (distSq > (canvasSize * 0.3) ** 2) {
        ring.length = 0;
      }

      // Skip near-duplicate points. When props are stationary, floating
      // point jitter produces near-identical positions each frame.
      // Update the timestamp of the last point instead of adding a new one
      // to allow the trail to fade into the prop when stationary.
      if (ring.length > 0 && distSq < 0.25) {
        last.timestamp = currentTime;
        return;
      }
    }

    ring.push({
      x: worldX,
      y: worldY,
      timestamp: currentTime,
      propIndex,
      tipIndex,
    });

    if (ring.length > this.ringCapacity) {
      ring.splice(0, ring.length - this.ringCapacity);
    }
  }

  /**
   * Extract the leading edge from a ring buffer, sanitized for
   * discontinuities. Returns at most `this.leadingEdge` points.
   */
  private getLeadingEdge(ring: TrailPoint[], canvasSize: number): TrailPoint[] {
    if (ring.length < 2) return ring;

    const start = Math.max(0, ring.length - this.leadingEdge);
    const slice = ring.slice(start);

    // Walk backward from the newest point, trimming at any large gap
    const maxGapSq = (canvasSize * 0.3) ** 2;
    for (let i = slice.length - 1; i > 0; i--) {
      const curr = slice[i]!;
      const prev = slice[i - 1]!;
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      if (dx * dx + dy * dy > maxGapSq) {
        return slice.slice(i);
      }
    }

    return slice;
  }

  private computeFadeAmount(fadeDurationMs: number, deltaTime: number): number {
    const safeDuration = Math.max(fadeDurationMs, 16.67);
    const framesForFullFade = safeDuration / 16.67;
    const baseFade = 3.5 / framesForFullFade;
    return 1 - Math.pow(1 - baseFade, deltaTime * 60);
  }

  /**
   * Subtract a constant from every non-zero alpha pixel in the stuck zone.
   * Destination-out's multiplicative fade can never reach 0 due to 8-bit
   * integer rounding. Constant subtraction guarantees every pixel reaches 0.
   *
   * Throttled to every SMOOTH_ALPHA_DECAY_INTERVAL frames - the full-canvas
   * getImageData/putImageData is a GPU↔CPU roundtrip (~3.6MB at 950²) that
   * dominated render time at 60fps. Killswitch: window.__TKA_DISABLE_SMOOTH_DECAY = true
   */
  private smoothAlphaDecay(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    isLeft: boolean
  ): void {
    if (
      typeof window !== "undefined" &&
      (window as { __TKA_DISABLE_SMOOTH_DECAY?: boolean })
        .__TKA_DISABLE_SMOOTH_DECAY === true
    ) {
      return;
    }

    if (isLeft) {
      this.leftAlphaDecayFrameCounter++;
      if (
        this.leftAlphaDecayFrameCounter <
        TrailOverlayCanvas.SMOOTH_ALPHA_DECAY_INTERVAL
      )
        return;
      this.leftAlphaDecayFrameCounter = 0;
    } else {
      this.rightAlphaDecayFrameCounter++;
      if (
        this.rightAlphaDecayFrameCounter <
        TrailOverlayCanvas.SMOOTH_ALPHA_DECAY_INTERVAL
      )
        return;
      this.rightAlphaDecayFrameCounter = 0;
    }

    const w = this.width;
    const h = this.height;
    if (w === 0 || h === 0) return;

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const DECAY = TrailOverlayCanvas.SMOOTH_ALPHA_DECAY_STEP;
    const THRESHOLD = DECAY + 10;
    let dirty = false;

    for (let i = 3; i < data.length; i += 4) {
      const a = data[i]!;
      if (a > 0 && a <= THRESHOLD) {
        data[i] = Math.max(0, a - DECAY);
        dirty = true;
      }
    }

    if (dirty) {
      ctx.putImageData(imageData, 0, 0);
    }
  }
}
