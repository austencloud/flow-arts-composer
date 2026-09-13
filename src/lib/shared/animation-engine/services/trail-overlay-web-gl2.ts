/**
 * Trail Overlay - WebGL2 backend.
 *
 * Drop-in replacement for `TrailOverlayCanvas`. Preserves the entire
 * prop-tip capture pipeline (ring buffers, tracking modes, bilateral-prop
 * awareness, warmup) but drives the draw via the render-graph
 * `WebGL2Backend`. Each tracked endpoint becomes one tip in a single
 * `TrailPass`; the backend keeps per-tip ping-pong FBOs and decays them
 * on the GPU so the CPU cost per frame is O(current leading edge), not
 * O(all points ever).
 *
 * Runs at the same position + z-index as the Canvas2D overlay, so the
 * containing stack (fire, LEDs, props) composites unchanged.
 *
 * @deprecated Superseded by render-graph FrameGraph + RenderBackend.executeFrame().
 * Trail capture moves into the unified per-frame graph; no standalone overlay needed.
 * Gated behind window.__TKA_UNIFIED_VIEWER.
 */

import type {
  ITrailOverlayCanvas,
  TrailOverlayRenderParams,
} from "./ITrailOverlayCanvas";
import type { TrailPoint } from "../domain/types/trail-types";
import { TrackingMode } from "../domain/types/trail-types";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import { calculateTrailSourceEndpoint } from "$lib/shared/animation-engine/services/prop-position-calculator";
import {
  resolveTrailPointConfig,
  type TrailPointSource,
  type TrailPointConfig,
} from "../domain/types/trail-point-types";
import { propTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";
import { recordTunnelFormationTrailCaptures } from "./tunnel-formation-trail-telemetry";
import { Canvas2DVisibilityFadeManager } from "$lib/shared/animation-engine/services/canvas2d/canvas-2d-visibility-fade-manager";
import { resolveEffect } from "../domain/types/tip-effect-types";

import type { RenderBackend } from "$lib/shared/render-graph/domain/backend";
import type { FrameGraph } from "$lib/shared/render-graph/domain/frame-graph";
import type {
  TrailPassPayload,
  TrailTipState,
} from "$lib/shared/render-graph/domain/trail-pass";
import { Z_ORDER } from "$lib/shared/render-graph/domain/render-pass";
import { createBackend } from "$lib/shared/render-graph/services/backend-factory";
import {
  MIN_TAIL_WIDTH_RATIO,
  FADE_EXPONENT,
} from "$lib/shared/render-graph/math/trail-mesh";
import { computeEffectScale } from "$lib/shared/effects/renderers/scale";
import {
  advanceTail,
  computeVisiblePath,
  createTailState,
  type TailState,
} from "$lib/shared/animation-engine/domain/tail-recession";
import {
  spotlightFactor,
  tunnelPropColor,
  tunnelPerformerPair,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";

/**
 * Minimum ring capacity. Actual capacity is `max(RING_BUFFER_MIN, tailLength + RING_BUFFER_HEADROOM)`
 * so the ring always has room to capture fresh motion while the full visible
 * tail is still on screen.
 */
const RING_BUFFER_MIN = 120;
const RING_BUFFER_HEADROOM = 20;
const DEFAULT_LEADING_EDGE = 20;
const GLOW_RATIO = 2.5;
const TRAIL_ENDPOINT_DIMENSIONS = { width: 252.8, height: 77.8 };
// WebGL2Backend clamps one decay step to 100ms after a long frame. Retired
// accumulator lifetime advances by the same amount so a background-tab resume
// cannot expire a trail faster than the GPU actually faded it.
const MAX_RETIREMENT_DECAY_STEP_MS = 100;

type TrailHand = "left" | "right";

interface TrailAccumulatorIdentity {
  hand: TrailHand;
  /** Multiplier contributed by tunnel spotlighting, independent of the
   *  color's visibility envelope. */
  visibilityScale: number;
}

interface RetiredTrailAccumulator extends TrailAccumulatorIdentity {
  remainingMs: number;
}

function effectTipIndex(source: TrailPointSource, logicalEnd: 0 | 1): number {
  return source.type === "tip" ? source.index : logicalEnd;
}

/** Convert TrailSettings.fadeDurationMs to the backend's decayPerSecond. */
function decayRateFor(fadeDurationMs: number): number {
  const safeDuration = Math.max(fadeDurationMs, 16.67);
  const framesForFullFade = safeDuration / 16.67;
  const basePerFrame = 3.5 / framesForFullFade;
  if (basePerFrame <= 0 || basePerFrame >= 1) return 3.0;
  return -60 * Math.log(1 - basePerFrame);
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().replace(/^#/, "");
  if (normalized.length !== 6) return [1, 1, 1];
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [1, 1, 1];
  return [r / 255, g / 255, b / 255];
}

export class TrailOverlayWebGL2 implements ITrailOverlayCanvas {
  private canvas: HTMLCanvasElement | null = null;
  private backend: RenderBackend | null = null;
  private width = 0;
  private height = 0;

  private leftLeftRing: TrailPoint[] = [];
  private leftRightRing: TrailPoint[] = [];
  private rightLeftRing: TrailPoint[] = [];
  private rightRightRing: TrailPoint[] = [];

  // Overlaid tunnel-layer rings + tail states (one full set per layer per
  // color end). Each layer's blue end emits a blue-colored tip and red end a
  // red-colored tip, so every copy in the kaleidoscope trails in its own
  // prop color. Pools are grown/shrunk to the active layer count each frame
  // (ensureLayerState), so memory is bounded by fold count — not unbounded.
  private layerRings: Array<{
    leftLeft: TrailPoint[];
    leftRight: TrailPoint[];
    rightLeft: TrailPoint[];
    rightRight: TrailPoint[];
  }> = [];
  private layerTails: Array<{
    leftLeft: TailState;
    leftRight: TailState;
    rightLeft: TailState;
    rightRight: TailState;
  }> = [];
  private layerTrailCaptureSuppressed: boolean[] = [];

  // Per-ring tail recession state. `visibleCount` shrinks from the current
  // leading edge toward 2 while the prop is stationary, so the visible
  // window actually closes from the tail end instead of staying pinned at
  // "last N ring entries." `prog` interpolates the first visible point
  // between adjacent ring entries so recession is continuous, not step-wise.
  private leftLeftTail: TailState = createTailState(DEFAULT_LEADING_EDGE);
  private leftRightTail: TailState = createTailState(DEFAULT_LEADING_EDGE);
  private rightLeftTail: TailState = createTailState(DEFAULT_LEADING_EDGE);
  private rightRightTail: TailState = createTailState(DEFAULT_LEADING_EDGE);

  /** Current ring capacity - derived from `trailSettings.tailLength`. */
  private ringCapacity = RING_BUFFER_MIN;

  private lastTrackingMode: TrackingMode | null = null;
  private hasPrevCenter = false;

  // Track previous per-color visibility. When a color transitions from
  // hidden back to visible, its ring buffers still contain stale points
  // from before it was hidden, and the next capture would draw a straight
  // line between the stale tail and the fresh tip. Clear on false→true.
  private lastHasLeft = true;
  private lastHasRight = true;

  // Track previous per-color prop-swap suppression (see
  // leftPropSwapSuppressed on TrailOverlayRenderParams). This is separate from
  // lastHasLeft/Right because the prop stays visible throughout a crossfade, so
  // this cannot reuse that transition detection. The suppression-lift reset
  // below must NOT touch the accumulator (no epoch bump), letting the pre-swap trail
  // keep decaying on screen instead of being wiped.
  private lastLeftPropSwapSuppressed = false;
  private lastRightPropSwapSuppressed = false;

  // Per-color tipId epoch. Bumped once the fade-out envelope reaches
  // zero, so the next fade-in allocates a fresh accumulator FBO rather
  // than inheriting the previous cycle's residual pixels. The idle FBO
  // is reclaimed by the backend's per-tip GC after MAX_UNUSED_FRAMES_
  // BEFORE_GC idle frames.
  private leftTipEpoch = 0;
  private rightTipEpoch = 0;

  // Accumulator identities that have actually received a drawable path. A
  // prop swap moves the current color's identities into `retiredAccumulators`
  // and advances its epoch. The old FBOs then receive decay-only passes while
  // the replacement prop starts on fresh FBOs, so the outgoing choreography
  // fades instead of disappearing or connecting to new tip geometry.
  private activeAccumulators = new Map<string, TrailAccumulatorIdentity>();
  private retiredAccumulators = new Map<string, RetiredTrailAccumulator>();

  // Per-color alpha envelope. Matches prop fade timing (300 ms in /
  // 200 ms out with cubic ease-out) so the trail appears and disappears
  // alongside the prop instead of snapping in/out.
  private leftEnvelope = new Canvas2DVisibilityFadeManager(300, 200);
  private rightEnvelope = new Canvas2DVisibilityFadeManager(300, 200);
  // Remembers whether the envelope was fully faded out on the previous
  // frame, so we know to bump the epoch (for a clean accumulator FBO)
  // before the next fade-in begins.
  private leftEnvelopeWasZero = false;
  private rightEnvelopeWasZero = false;

  private warmupFramesRemaining = 0;
  private static readonly WARMUP_FRAMES = 3;

  // Monotonic VIRTUAL clock (ms) handed to the backend so the trail accumulator's
  // decay steps on the frame's virtual dt, NOT wall-clock. The backend derives its
  // decay dt from successive timestamps; feeding it performance.now() makes the
  // fade depend on real render cadence — fine for live (≈60fps rAF) but wrong for
  // a synchronous offscreen export, where it produced trails that started late and
  // never faded. Advancing this by params.deltaTime keeps live identical (its dt is
  // the rAF delta) and makes export deterministic (its dt is the fixed 1/60 step).
  private backendClockMs = 0;

  // Per-tip trail mask from previous frame (4 bits). Null until the first
  // drawable frame so an initial one-ended prop does not retire blank FBOs.
  private prevTipTrailMask: number | null = null;

  async initialize(
    container: HTMLElement,
    width: number,
    height: number
  ): Promise<void> {
    this.dispose();

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
    this.width = width;
    this.height = height;
    this.warmupFramesRemaining = TrailOverlayWebGL2.WARMUP_FRAMES;

    try {
      const backend = await createBackend(canvas, { preferred: "webgl2" });
      if (this.canvas === canvas) {
        this.backend = backend;
      } else {
        backend.dispose();
      }
    } catch (error) {
      // A failed context request leaves a transparent canvas in the effect
      // stack. Remove it before the adaptive owner installs Canvas2D, or every
      // affected animation carries a dead layer for the rest of its lifetime.
      if (this.canvas === canvas) this.dispose();
      throw error;
    }
  }

  resize(width: number, height: number): void {
    if (!this.canvas) return;
    const sizeChanged = width !== this.width || height !== this.height;
    this.canvas.width = width;
    this.canvas.height = height;
    this.backend?.resize(width, height);
    this.width = width;
    this.height = height;

    if (sizeChanged) {
      this.leftLeftRing = [];
      this.leftRightRing = [];
      this.rightLeftRing = [];
      this.rightRightRing = [];
      this.resetLayerState();
      this.warmupFramesRemaining = TrailOverlayWebGL2.WARMUP_FRAMES;
    }
  }

  renderFrame(params: TrailOverlayRenderParams): void {
    if (!this.canvas || !this.backend) return;

    if (this.warmupFramesRemaining > 0) {
      this.warmupFramesRemaining--;
      return;
    }

    // Advance the monotonic VIRTUAL clock by this frame's dt. Used for both the
    // visibility envelope and the backend's decay so the trail's timing is
    // frame-rate-independent: live advances it by the rAF delta (unchanged
    // behavior), the offscreen export by the fixed 1/60 step (deterministic).
    const frameDeltaMs = Math.max(0, params.deltaTime * 1000);
    const retirementDecayStepMs = Math.min(
      frameDeltaMs,
      MAX_RETIREMENT_DECAY_STEP_MS
    );
    this.backendClockMs += frameDeltaMs;

    const {
      trailSettings,
      canvasSize,
      hasLeft,
      hasRight,
      leftProp,
      rightProp,
      leftPropType,
      rightPropType,
      leftPropSwapSuppressed = false,
      rightPropSwapSuppressed = false,
    } = params;

    // Non-seamless loop wrap: the props teleport from the end position back to
    // the start. Drop the source rings + tails so the next captured point can't
    // connect to the stale end-of-sequence tail with a straight line. The
    // accumulator FBOs are left untouched, so the previous trail keeps fading
    // out on the GPU while the fresh trail builds from the start position.
    // Seamless loops (end == start) are skipped — their trail flows across the
    // boundary with no teleport.
    if (params.loopDetected && !params.isSeamlesslyLoopable) {
      this.resetRingsAndTails();
    }

    const leadingEdge = Math.max(
      2,
      Math.floor(trailSettings.tailLength ?? DEFAULT_LEADING_EDGE)
    );
    this.ringCapacity = Math.max(
      RING_BUFFER_MIN,
      leadingEdge + RING_BUFFER_HEADROOM
    );

    // A prop hot-swap is a visual source handoff, not a request to erase the
    // pixels already on stage. Rotate each affected color onto a fresh tip-id
    // epoch and keep submitting the old identities as decay-only passes for
    // one full trail lifetime. This also prevents either side of the swap from
    // sharing an accumulator with mismatched endpoint geometry.
    const leftPropSwapStarted =
      leftPropSwapSuppressed && !this.lastLeftPropSwapSuppressed;
    const rightPropSwapStarted =
      rightPropSwapSuppressed && !this.lastRightPropSwapSuppressed;
    if (leftPropSwapStarted) {
      this.retireHandAccumulators("left", trailSettings.fadeDurationMs);
    }
    if (rightPropSwapStarted) {
      this.retireHandAccumulators("right", trailSettings.fadeDurationMs);
    }

    if (
      this.lastTrackingMode !== null &&
      this.lastTrackingMode !== trailSettings.trackingMode
    ) {
      this.leftLeftRing = [];
      this.leftRightRing = [];
      this.rightLeftRing = [];
      this.rightRightRing = [];
      this.leftLeftTail = createTailState(leadingEdge);
      this.leftRightTail = createTailState(leadingEdge);
      this.rightLeftTail = createTailState(leadingEdge);
      this.rightRightTail = createTailState(leadingEdge);
      this.resetLayerState();
    }
    this.lastTrackingMode = trailSettings.trackingMode;

    // Advance per-color envelopes toward the current target visibility.
    this.leftEnvelope.setVisible(hasLeft);
    this.rightEnvelope.setVisible(hasRight);
    const nowMs = this.backendClockMs;
    const leftAlpha = this.leftEnvelope.updateProgress(nowMs).alpha;
    const rightAlpha = this.rightEnvelope.updateProgress(nowMs).alpha;

    // On hidden→visible transitions: reset the ring so the fresh trail
    // starts from the current prop position (not a straight line from
    // the stale tail to the new tip). If the envelope had already fully
    // faded out before the re-enable, bump the tipId epoch so the
    // backend hands us a pristine accumulator FBO for the fade-in.
    if (hasLeft && !this.lastHasLeft) {
      this.leftLeftRing = [];
      this.leftRightRing = [];
      this.leftLeftTail = createTailState(leadingEdge);
      this.leftRightTail = createTailState(leadingEdge);
      for (let i = 0; i < this.layerRings.length; i++) {
        this.layerRings[i]!.leftLeft = [];
        this.layerRings[i]!.leftRight = [];
        this.layerTails[i]!.leftLeft = createTailState(leadingEdge);
        this.layerTails[i]!.leftRight = createTailState(leadingEdge);
      }
      if (this.leftEnvelopeWasZero) {
        this.forgetHandAccumulators("left");
        this.leftTipEpoch++;
        this.leftEnvelopeWasZero = false;
      }
    }
    if (hasRight && !this.lastHasRight) {
      this.rightLeftRing = [];
      this.rightRightRing = [];
      this.rightLeftTail = createTailState(leadingEdge);
      this.rightRightTail = createTailState(leadingEdge);
      for (let i = 0; i < this.layerRings.length; i++) {
        this.layerRings[i]!.rightLeft = [];
        this.layerRings[i]!.rightRight = [];
        this.layerTails[i]!.rightLeft = createTailState(leadingEdge);
        this.layerTails[i]!.rightRight = createTailState(leadingEdge);
      }
      if (this.rightEnvelopeWasZero) {
        this.forgetHandAccumulators("right");
        this.rightTipEpoch++;
        this.rightEnvelopeWasZero = false;
      }
    }

    // Latch "fully faded out" the first time the envelope reaches 0
    // while the color is hidden. The next hidden→visible transition
    // consults this flag to decide whether to bump the epoch.
    if (!hasLeft && leftAlpha === 0) this.leftEnvelopeWasZero = true;
    if (!hasRight && rightAlpha === 0) this.rightEnvelopeWasZero = true;

    this.lastHasLeft = hasLeft;
    this.lastHasRight = hasRight;

    // Prop-swap suppression lift: reset that color's
    // ring/tail so the next capture starts a fresh, disconnected segment at
    // the new prop's tip geometry instead of connecting back to the frozen
    // pre-suppression point. Deliberately does NOT touch blueTipEpoch/
    // redTipEpoch or the backend. The accumulator keeps whatever it already
    // has and decays normally instead of being wiped on re-entry.
    if (!leftPropSwapSuppressed && this.lastLeftPropSwapSuppressed) {
      this.leftLeftRing = [];
      this.leftRightRing = [];
      this.leftLeftTail = createTailState(leadingEdge);
      this.leftRightTail = createTailState(leadingEdge);
    }
    if (!rightPropSwapSuppressed && this.lastRightPropSwapSuppressed) {
      this.rightLeftRing = [];
      this.rightRightRing = [];
      this.rightLeftTail = createTailState(leadingEdge);
      this.rightRightTail = createTailState(leadingEdge);
    }
    this.lastLeftPropSwapSuppressed = leftPropSwapSuppressed;
    this.lastRightPropSwapSuppressed = rightPropSwapSuppressed;

    const leftHasTwoEnds = propTipEnds(leftPropType ?? undefined) === 2;
    const rightHasTwoEnds = propTipEnds(rightPropType ?? undefined) === 2;
    const modeTracksLeft =
      trailSettings.trackingMode === TrackingMode.LEFT_END ||
      trailSettings.trackingMode === TrackingMode.BOTH_ENDS;
    // HAND tracks the single prop-center source, which lives on the right slot
    // of the resolved config. It routes through modeTracksRight so both single-
    // and two-ended props emit exactly one hand trail (left stays off).
    const modeTracksRight =
      trailSettings.trackingMode === TrackingMode.RIGHT_END ||
      trailSettings.trackingMode === TrackingMode.BOTH_ENDS ||
      trailSettings.trackingMode === TrackingMode.HAND;
    const leftTrackLeft = leftHasTwoEnds && modeTracksLeft;
    const leftTrackRight = !leftHasTwoEnds || modeTracksRight;
    const rightTrackLeft = rightHasTwoEnds && modeTracksLeft;
    const rightTrackRight = !rightHasTwoEnds || modeTracksRight;

    // Per-tip effect gating
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

    const tipMask =
      (leftLeftTrails ? 1 : 0) |
      (leftRightTrails ? 2 : 0) |
      (rightLeftTrails ? 4 : 0) |
      (rightRightTrails ? 8 : 0);
    if (this.prevTipTrailMask !== null && tipMask !== this.prevTipTrailMask) {
      const leftBitsChanged = (tipMask & 0x3) !== (this.prevTipTrailMask & 0x3);
      const rightBitsChanged =
        (tipMask & 0xc) !== (this.prevTipTrailMask & 0xc);
      if (leftBitsChanged) {
        if (!leftPropSwapSuppressed) {
          this.retireHandAccumulators("left", trailSettings.fadeDurationMs);
        }
        this.leftLeftRing = [];
        this.leftRightRing = [];
        this.leftLeftTail = createTailState(leadingEdge);
        this.leftRightTail = createTailState(leadingEdge);
      }
      if (rightBitsChanged) {
        if (!rightPropSwapSuppressed) {
          this.retireHandAccumulators("right", trailSettings.fadeDurationMs);
        }
        this.rightLeftRing = [];
        this.rightRightRing = [];
        this.rightLeftTail = createTailState(leadingEdge);
        this.rightRightTail = createTailState(leadingEdge);
      }
      if (leftBitsChanged || rightBitsChanged) this.resetLayerState();
    }
    this.prevTipTrailMask = tipMask;

    let leftLeftMoved = false;
    let leftRightMoved = false;
    let rightLeftMoved = false;
    let rightRightMoved = false;
    // Keep capturing while the envelope is still fading so the trail
    // tracks the prop through the fade-out instead of freezing in place.
    const leftCaptureLive = hasLeft || leftAlpha > 0;
    const rightCaptureLive = hasRight || rightAlpha > 0;
    // leftPropSwapSuppressed/rightPropSwapSuppressed: skip the capture (freeze the
    // tip in place) while that color's prop-type swap is in flight. See the
    // TrailOverlayRenderParams doc. leftLeftMoved/rightMoved staying false
    // feeds the normal "prop is stationary" path into advanceTail below, so
    // the tail recedes/shrinks toward the frozen point exactly like a real
    // stationary prop, instead of jumping to the new (mismatched) geometry.
    if (leftProp && leftCaptureLive && !leftPropSwapSuppressed) {
      const r = this.capturePropTips(
        leftProp,
        canvasSize,
        leftPropType,
        0,
        leftTrackLeft && leftLeftTrails,
        leftTrackRight && leftRightTrails,
        leftTrailConfig
      );
      leftLeftMoved = r.leftMoved;
      leftRightMoved = r.rightMoved;
    }
    if (rightProp && rightCaptureLive && !rightPropSwapSuppressed) {
      const r = this.capturePropTips(
        rightProp,
        canvasSize,
        rightPropType,
        1,
        rightTrackLeft && rightLeftTrails,
        rightTrackRight && rightRightTrails,
        rightTrailConfig
      );
      rightLeftMoved = r.leftMoved;
      rightRightMoved = r.rightMoved;
    }

    // Capture overlaid tunnel-layer tips into per-layer rings (same color/tip
    // gating as the base pair). Each layer's left prop feeds a left tip, right
    // prop a red tip — so every kaleidoscope copy trails in its own color.
    const additionalLayers = params.additionalLayers;
    const dtMsCapture = Math.max(0, params.deltaTime * 1000);
    let formationTrailCaptures = 0;
    if (additionalLayers && additionalLayers.length > 0) {
      this.ensureLayerState(additionalLayers.length, leadingEdge);
      for (let i = 0; i < additionalLayers.length; i++) {
        const layer = additionalLayers[i]!;
        const rings = this.layerRings[i]!;
        const tails = this.layerTails[i]!;
        const captureSuppressed = layer.trailCaptureSuppressed === true;
        if (this.layerTrailCaptureSuppressed[i] !== captureSuppressed) {
          rings.leftLeft.length = 0;
          rings.leftRight.length = 0;
          rings.rightLeft.length = 0;
          rings.rightRight.length = 0;
          tails.leftLeft = createTailState(leadingEdge);
          tails.leftRight = createTailState(leadingEdge);
          tails.rightLeft = createTailState(leadingEdge);
          tails.rightRight = createTailState(leadingEdge);
        }
        this.layerTrailCaptureSuppressed[i] = captureSuppressed;
        const pointsBefore =
          rings.leftLeft.length +
          rings.leftRight.length +
          rings.rightLeft.length +
          rings.rightRight.length;
        let bL = false,
          bR = false,
          rL = false,
          rR = false;
        if (
          layer.leftProp &&
          layer.hasLeft &&
          leftCaptureLive &&
          !leftPropSwapSuppressed &&
          !captureSuppressed
        ) {
          const m = this.capturePropTipsInto(
            layer.leftProp,
            canvasSize,
            leftPropType,
            0,
            rings.leftLeft,
            rings.leftRight,
            leftTrackLeft && leftLeftTrails,
            leftTrackRight && leftRightTrails,
            leftTrailConfig
          );
          bL = m.leftMoved;
          bR = m.rightMoved;
        }
        if (
          layer.rightProp &&
          layer.hasRight &&
          rightCaptureLive &&
          !rightPropSwapSuppressed &&
          !captureSuppressed
        ) {
          const m = this.capturePropTipsInto(
            layer.rightProp,
            canvasSize,
            rightPropType,
            1,
            rings.rightLeft,
            rings.rightRight,
            rightTrackLeft && rightLeftTrails,
            rightTrackRight && rightRightTrails,
            rightTrailConfig
          );
          rL = m.leftMoved;
          rR = m.rightMoved;
        }
        // Advance every tail each frame (moved=false freezes recession during a
        // fade-out the same way the base pair does), so layer trails recede
        // identically whether the prop is moving, stationary, or fading out.
        tails.leftLeft = advanceTail(
          tails.leftLeft,
          rings.leftLeft,
          bL,
          dtMsCapture,
          leadingEdge
        );
        tails.leftRight = advanceTail(
          tails.leftRight,
          rings.leftRight,
          bR,
          dtMsCapture,
          leadingEdge
        );
        tails.rightLeft = advanceTail(
          tails.rightLeft,
          rings.rightLeft,
          rL,
          dtMsCapture,
          leadingEdge
        );
        tails.rightRight = advanceTail(
          tails.rightRight,
          rings.rightRight,
          rR,
          dtMsCapture,
          leadingEdge
        );
        if (layer.formationTransitionActive) {
          const pointsAfter =
            rings.leftLeft.length +
            rings.leftRight.length +
            rings.rightLeft.length +
            rings.rightRight.length;
          formationTrailCaptures += Math.max(0, pointsAfter - pointsBefore);
        }
      }
      this.layerTrailCaptureSuppressed.length = additionalLayers.length;
    } else if (this.layerRings.length > 0) {
      this.resetLayerState();
    }
    recordTunnelFormationTrailCaptures(formationTrailCaptures);

    // Advance per-ring tail recession state. Moving frames update the
    // per-ring speed EMA and keep visibleCount at LEADING_EDGE. Stationary
    // frames walk the visible endpoint forward along the captured path at
    // the pre-stop speed - so stopping on a dime reads as "the trail
    // finishes the motion" instead of freezing at constant length.
    const dtMs = Math.max(0, params.deltaTime * 1000);

    this.leftLeftTail = advanceTail(
      this.leftLeftTail,
      this.leftLeftRing,
      leftLeftMoved,
      dtMs,
      leadingEdge
    );
    this.leftRightTail = advanceTail(
      this.leftRightTail,
      this.leftRightRing,
      leftRightMoved,
      dtMs,
      leadingEdge
    );
    this.rightLeftTail = advanceTail(
      this.rightLeftTail,
      this.rightLeftRing,
      rightLeftMoved,
      dtMs,
      leadingEdge
    );
    this.rightRightTail = advanceTail(
      this.rightRightTail,
      this.rightRightRing,
      rightRightMoved,
      dtMs,
      leadingEdge
    );

    // lineWidth is authored in reference-size (500px) pixels. On smaller
    // canvases, scale it down so the trail + glow halo stay the same
    // proportion of the frame - otherwise the fixed-pixel floor (3.5) and
    // the NDC division by canvas width make the halo a bigger share of a
    // small canvas, which reads as overblown glow on mobile.
    const effectScale = computeEffectScale(this.width, this.height);
    const scaledLineWidth =
      Math.max(3.5, trailSettings.lineWidth) * effectScale;
    const lineWidth = Math.max(1, scaledLineWidth);
    const thicknessNdc = (lineWidth * 2) / Math.max(1, this.width);
    const decayPerSecond = decayRateFor(trailSettings.fadeDurationMs);
    const glowNdc = thicknessNdc * GLOW_RATIO;
    const [bR, bG, bB] = hexToRgb(
      params.tunnelPropColors?.left ?? trailSettings.leftColor
    );
    const [rR, rG, rB] = hexToRgb(
      params.tunnelPropColors?.right ?? trailSettings.rightColor
    );
    const alpha = Math.max(0, Math.min(1, trailSettings.maxOpacity));

    const tips: TrailTipState[] = [];
    const submittedAccumulatorIds = new Set<string>();

    // Epoch-scoped tipIds let the backend spin up a fresh accumulator FBO
    // after a full fade-out without wiping the whole backend.
    const leftSuffix = this.leftTipEpoch > 0 ? `-e${this.leftTipEpoch}` : "";
    const rightSuffix = this.rightTipEpoch > 0 ? `-e${this.rightTipEpoch}` : "";

    // Emit tips whenever the envelope has any visibility. Stamps go into
    // the accumulator at full alpha so the trail's shape stays consistent
    // across the fade; the envelope shows up as `blitAlpha`, which the
    // backend multiplies into the composite when copying the accumulator
    // to screen. Result: the on-screen trail dims smoothly in step with
    // the envelope during fade-out and brightens during fade-in, instead
    // of staying bright until emission stops and then popping to zero.
    const pushTip = (
      tipId: string,
      ring: TrailPoint[],
      rgb: [number, number, number],
      tail: TailState,
      hand: TrailHand,
      colorAlpha: number,
      visibilityScale: number
    ) => {
      const blitAlpha = colorAlpha * visibilityScale;
      if (blitAlpha <= 0) return;
      const path = computeVisiblePath(ring, tail, this.width, this.height);
      if (path.length < 2) return;
      submittedAccumulatorIds.add(tipId);
      this.retiredAccumulators.delete(tipId);
      this.activeAccumulators.set(tipId, { hand, visibilityScale });
      tips.push({
        tipId,
        path,
        color: [rgb[0], rgb[1], rgb[2], alpha],
        thickness: thicknessNdc,
        taperTailRatio: MIN_TAIL_WIDTH_RATIO,
        glow: glowNdc,
        decayPerSecond,
        fadeExponent: FADE_EXPONENT,
        blendMode: "alpha",
        blitAlpha,
      });
    };

    // Performer spotlight: when a copy is selected, dim every other family's
    // trail (family 0 = base "you", family k = layer k-1). Scaling the tip's
    // envelope fades its whole trail toward the black stage.
    const selected = params.tunnelSelectedLayer ?? null;
    const baseF = spotlightFactor(selected, 0);
    if (!leftPropSwapSuppressed) {
      pushTip(
        `left-left${leftSuffix}`,
        this.leftLeftRing,
        [bR, bG, bB],
        this.leftLeftTail,
        "left",
        leftAlpha,
        baseF
      );
      pushTip(
        `left-right${leftSuffix}`,
        this.leftRightRing,
        [bR, bG, bB],
        this.leftRightTail,
        "left",
        leftAlpha,
        baseF
      );
    }
    if (!rightPropSwapSuppressed) {
      pushTip(
        `right-left${rightSuffix}`,
        this.rightLeftRing,
        [rR, rG, rB],
        this.rightLeftTail,
        "right",
        rightAlpha,
        baseF
      );
      pushTip(
        `right-right${rightSuffix}`,
        this.rightRightRing,
        [rR, rG, rB],
        this.rightRightTail,
        "right",
        rightAlpha,
        baseF
      );
    }

    // Overlaid tunnel-layer tips. Each layer's blue/red rings get a distinct
    // spectrum color (tunnelPropColor, parsed via the same hexToRgb) so every
    // kaleidoscope copy trails in its own color instead of repeating the base
    // blue/red. Each end is its own backend FBO via a layer-indexed tipId; the
    // per-color epoch suffix keeps FBO recycling consistent with the base pair.
    // Spectrum off: layers inherit the base blue/red trail color ([bR..]/[rR..],
    // which already carry the user's Choose-a-Look / custom colors) so the whole
    // kaleidoscope trails in one chosen pair instead of a rainbow.
    const spectrum =
      (params.tunnelSpectrum ?? true) && !params.tunnelPropColors;
    const layerCount = this.layerRings.length;
    for (let i = 0; i < layerCount; i++) {
      const rings = this.layerRings[i]!;
      const tails = this.layerTails[i]!;
      const exact = params.tunnelPropColors
        ? tunnelPerformerPair(params.tunnelPropColors, i + 1)
        : null;
      const leftLayerRgb = exact
        ? hexToRgb(exact.left)
        : spectrum
          ? hexToRgb(tunnelPropColor(2 + i * 2, layerCount).hex)
          : ([bR, bG, bB] as [number, number, number]);
      const rightLayerRgb = exact
        ? hexToRgb(exact.right)
        : spectrum
          ? hexToRgb(tunnelPropColor(3 + i * 2, layerCount).hex)
          : ([rR, rG, rB] as [number, number, number]);
      // Layer i is copy arm i+1 — dim it when another performer is spotlit.
      const f =
        (params.additionalLayers?.[i]?.opacity ?? 1) *
        spotlightFactor(selected, i + 1);
      const captureSuppressed =
        params.additionalLayers?.[i]?.trailCaptureSuppressed === true;
      if (!leftPropSwapSuppressed && !captureSuppressed) {
        pushTip(
          `L${i}-left-left${leftSuffix}`,
          rings.leftLeft,
          leftLayerRgb,
          tails.leftLeft,
          "left",
          leftAlpha,
          f
        );
        pushTip(
          `L${i}-left-right${leftSuffix}`,
          rings.leftRight,
          leftLayerRgb,
          tails.leftRight,
          "left",
          leftAlpha,
          f
        );
      }
      if (!rightPropSwapSuppressed && !captureSuppressed) {
        pushTip(
          `L${i}-right-left${rightSuffix}`,
          rings.rightLeft,
          rightLayerRgb,
          tails.rightLeft,
          "right",
          rightAlpha,
          f
        );
        pushTip(
          `L${i}-right-right${rightSuffix}`,
          rings.rightRight,
          rightLayerRgb,
          tails.rightRight,
          "right",
          rightAlpha,
          f
        );
      }
    }

    // A source can briefly stop producing a drawable path after any ring reset
    // (or permanently when a tunnel layer disappears). Keep its existing FBO
    // decaying instead of dropping it from the graph. If that exact identity
    // produces a path again, pushTip cancels this temporary retirement.
    for (const [tipId, identity] of this.activeAccumulators) {
      if (submittedAccumulatorIds.has(tipId)) continue;
      this.retiredAccumulators.set(tipId, {
        ...identity,
        remainingMs: Math.max(16.67, trailSettings.fadeDurationMs),
      });
      this.activeAccumulators.delete(tipId);
    }

    // Old prop accumulators remain in the graph with an empty path. The
    // backend's normal pass still decays and blits their existing FBO pixels,
    // but drawStamp has nothing to add. Once one configured trail lifetime has
    // elapsed, stop submitting the identity and let backend GC reclaim it.
    for (const [tipId, retired] of this.retiredAccumulators) {
      if (retired.remainingMs <= 0) {
        this.retiredAccumulators.delete(tipId);
        continue;
      }
      const retiredAlpha =
        (retired.hand === "left" ? leftAlpha : rightAlpha) *
        retired.visibilityScale;
      tips.push({
        tipId,
        path: [],
        color:
          retired.hand === "left" ? [bR, bG, bB, alpha] : [rR, rG, rB, alpha],
        thickness: thicknessNdc,
        taperTailRatio: MIN_TAIL_WIDTH_RATIO,
        glow: 0,
        decayPerSecond,
        fadeExponent: FADE_EXPONENT,
        blendMode: "alpha",
        blitAlpha: retiredAlpha,
      });
      retired.remainingMs -= retirementDecayStepMs;
    }

    const payload: TrailPassPayload = { tips };
    const graph: FrameGraph = {
      passes: [
        {
          kind: "trail",
          order: Z_ORDER.TRAIL,
          target: "scene",
          payload,
        },
      ],
      targets: {
        scene: { width: this.width, height: this.height, format: "rgba8" },
      },
    };

    // Backend decay steps on the virtual clock (accumulated at the top of render),
    // so the offscreen export fades exactly like 60fps live instead of decaying on
    // wall-clock cadence.
    this.backend.executeFrame(graph, this.backendClockMs);
  }

  clear(): void {
    this.resetRingsAndTails();
    this.leftEnvelope.reset();
    this.rightEnvelope.reset();
    this.leftEnvelopeWasZero = false;
    this.rightEnvelopeWasZero = false;
    this.warmupFramesRemaining = TrailOverlayWebGL2.WARMUP_FRAMES;
    this.prevTipTrailMask = null;
    this.freshAccumulators();
  }

  clearBuffers(): void {
    this.hasPrevCenter = false;
    this.resetRingsAndTails();
    this.warmupFramesRemaining = TrailOverlayWebGL2.WARMUP_FRAMES;
    this.freshAccumulators();
  }

  private resetRingsAndTails(): void {
    this.leftLeftRing = [];
    this.leftRightRing = [];
    this.rightLeftRing = [];
    this.rightRightRing = [];
    // Reset to DEFAULT_LEADING_EDGE - the next renderFrame will re-seed with
    // the current tailLength setting before the first advance call.
    this.leftLeftTail = createTailState(DEFAULT_LEADING_EDGE);
    this.leftRightTail = createTailState(DEFAULT_LEADING_EDGE);
    this.rightLeftTail = createTailState(DEFAULT_LEADING_EDGE);
    this.rightRightTail = createTailState(DEFAULT_LEADING_EDGE);
    this.resetLayerState();
  }

  setVisible(visible: boolean): void {
    if (!this.canvas) return;
    this.canvas.style.display = visible ? "" : "none";
  }

  setCanvasZIndex(z: number): void {
    if (this.canvas) this.canvas.style.zIndex = String(z);
  }

  dispose(): void {
    this.backend?.dispose();
    this.backend = null;
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.width = 0;
    this.height = 0;
    this.leftLeftRing = [];
    this.leftRightRing = [];
    this.rightLeftRing = [];
    this.rightRightRing = [];
    this.resetLayerState();
    this.activeAccumulators.clear();
    this.retiredAccumulators.clear();
  }

  // -------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------

  /** Move every FBO currently fed by one hand into a decay-only
   *  generation, then advance the live tip-id epoch for the replacement. */
  private retireHandAccumulators(
    hand: TrailHand,
    fadeDurationMs: number
  ): void {
    const remainingMs = Math.max(16.67, fadeDurationMs);
    for (const [tipId, identity] of this.activeAccumulators) {
      if (identity.hand !== hand) continue;
      this.retiredAccumulators.set(tipId, { ...identity, remainingMs });
      this.activeAccumulators.delete(tipId);
    }

    if (hand === "left") {
      this.leftTipEpoch++;
    } else {
      this.rightTipEpoch++;
    }
  }

  /** Forget orphaned identities after a completed visibility fade. Their FBOs
   *  remain unreachable and are reclaimed by the backend's idle-tip sweep. */
  private forgetHandAccumulators(hand: TrailHand): void {
    for (const [tipId, identity] of this.activeAccumulators) {
      if (identity.hand === hand) this.activeAccumulators.delete(tipId);
    }
    for (const [tipId, identity] of this.retiredAccumulators) {
      if (identity.hand === hand) this.retiredAccumulators.delete(tipId);
    }
  }

  /** Drop the per-tip accumulator FBOs for a blank-slate trail without touching
   *  the backend. Bumping the tip epochs re-keys every tipId, so the next render
   *  allocates fresh blank accumulators and the backend's idle-tip sweep
   *  (MAX_UNUSED_FRAMES_BEFORE_GC) frees the orphaned ones.
   *
   *  Replaces the old rebuildBackend(), which disposed + recreated the whole
   *  WebGL2Backend — synchronously recompiling all 27 shader programs on every
   *  trails-off transition (~240ms ANGLE LINK_STATUS stall on Windows). That was
   *  the freeze when switching away from trails. Keeping the backend warm also
   *  makes re-entering trails instant. The prop-swap retirement path uses the
   *  same epoch mechanism while continuing to submit the outgoing identities
   *  until their normal decay completes. */
  private freshAccumulators(): void {
    this.activeAccumulators.clear();
    this.retiredAccumulators.clear();
    if (!this.backend) return;
    this.leftTipEpoch++;
    this.rightTipEpoch++;
    // Blank the visible canvas too. The epoch bump gives fresh accumulator FBOs,
    // but the default framebuffer still holds the last composited trail; with the
    // canvas hidden then re-shown (effect toggled off→on) that stale frame flashes
    // for one frame before the new trail draws. The old rebuildBackend() blanked
    // it for free by destroying the context; clear it explicitly instead.
    this.backend.clearScreen();
  }

  /** Returns which rings received a new point this frame. Captures the base
   *  pair into its own per-color rings (selected by propIndex). */
  private capturePropTips(
    prop: PropState,
    canvasSize: number,
    propType: string | null | undefined,
    propIndex: 0 | 1,
    trackLeft: boolean,
    trackRight: boolean,
    trailConfig: TrailPointConfig
  ): { leftMoved: boolean; rightMoved: boolean } {
    const leftRing = propIndex === 0 ? this.leftLeftRing : this.rightLeftRing;
    const rightRing =
      propIndex === 0 ? this.leftRightRing : this.rightRightRing;
    return this.capturePropTipsInto(
      prop,
      canvasSize,
      propType,
      propIndex,
      leftRing,
      rightRing,
      trackLeft,
      trackRight,
      trailConfig
    );
  }

  /** Capture a prop's tip positions into the supplied left/right rings. Shared
   *  by the base pair (its own rings) and each overlaid tunnel layer. Returns
   *  which ends appended a fresh point this frame. The caller passes the already
   *  tracking-mode-resolved trailConfig so HAND mode (prop-center source) and the
   *  per-prop tip config resolve exactly once per frame in render(). */
  private capturePropTipsInto(
    prop: PropState,
    canvasSize: number,
    propType: string | null | undefined,
    propIndex: 0 | 1,
    leftRing: TrailPoint[],
    rightRing: TrailPoint[],
    trackLeft: boolean,
    trackRight: boolean,
    trailConfig: TrailPointConfig
  ): { leftMoved: boolean; rightMoved: boolean } {
    let leftMoved = false;
    let rightMoved = false;
    const endpointConfig = {
      canvasSize,
      propDimensions: TRAIL_ENDPOINT_DIMENSIONS,
    };

    if (trackLeft) {
      const endpoint = calculateTrailSourceEndpoint(
        prop,
        endpointConfig,
        trailConfig.left,
        propType
      );
      if (endpoint) {
        leftMoved = this.appendToRing(
          leftRing,
          endpoint.x,
          endpoint.y,
          canvasSize,
          propIndex,
          endpoint.tipIndex ?? 0
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
        rightMoved = this.appendToRing(
          rightRing,
          endpoint.x,
          endpoint.y,
          canvasSize,
          propIndex,
          endpoint.tipIndex ?? 1
        );
      }
    }
    return { leftMoved, rightMoved };
  }

  /** Grow/shrink the per-layer ring + tail pools to match the active layer
   *  count. New layers start empty; trimmed layers are dropped so memory is
   *  bounded by the current fold count, not the historical maximum. */
  private ensureLayerState(count: number, leadingEdge: number): void {
    while (this.layerRings.length < count) {
      this.layerRings.push({
        leftLeft: [],
        leftRight: [],
        rightLeft: [],
        rightRight: [],
      });
      this.layerTails.push({
        leftLeft: createTailState(leadingEdge),
        leftRight: createTailState(leadingEdge),
        rightLeft: createTailState(leadingEdge),
        rightRight: createTailState(leadingEdge),
      });
    }
    if (this.layerRings.length > count) {
      this.layerRings.length = count;
      this.layerTails.length = count;
    }
  }

  /** Drop all per-layer ring + tail state. Called whenever the base pair's
   *  rings are reset (tracking-mode change, tip-mask change, sequence clears)
   *  so stale overlaid-layer trails can't survive the invalidation. */
  private resetLayerState(): void {
    this.layerRings = [];
    this.layerTails = [];
    this.layerTrailCaptureSuppressed = [];
  }

  /** Returns true if a new point was appended (prop moved enough),
   *  false if the call was a stationary / jitter no-op. */
  private appendToRing(
    ring: TrailPoint[],
    worldX: number,
    worldY: number,
    canvasSize: number,
    propIndex: 0 | 1,
    tipIndex: number
  ): boolean {
    if (ring.length > 0) {
      const last = ring[ring.length - 1]!;
      const dx = worldX - last.x;
      const dy = worldY - last.y;
      const distSq = dx * dx + dy * dy;

      if (distSq > (canvasSize * 0.3) ** 2) {
        ring.length = 0;
      }

      if (ring.length > 0 && distSq < 0.25) {
        return false;
      }
    }

    ring.push({
      x: worldX,
      y: worldY,
      timestamp: performance.now(),
      propIndex,
      tipIndex,
    });

    if (ring.length > this.ringCapacity) {
      ring.splice(0, ring.length - this.ringCapacity);
    }
    return true;
  }
}

// ── EffectPlugin descriptor ──────────────────────────────────────────────────
// Trails is the kind:"trails" exception — ITrailOverlayCanvas.initialize returns
// void or a promise (not boolean) and has no isInitialized(). The descriptor
// casts to EffectRendererLike so the registry can hold it uniformly; consumers
// of the trails branch cast back via the kind:"trails" path.
import type { EffectPlugin } from "./effects/effect-plugin";
import type { EffectRendererLike } from "./effects/effect-renderer";
import type { TrailsIntent } from "$lib/shared/effects/domain/effects-config";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { TrailOverlayCanvas } from "./trail-overlay-canvas";
import { AdaptiveTrailOverlay } from "./adaptive-trail-overlay";

export const trailsEffectPlugin: EffectPlugin<TrailsIntent> = {
  id: "trails",
  kind: "trails",
  createRenderer: (): EffectRendererLike => {
    // Runtime A/B toggle: set window.__TKA_TRAIL_GPU = false before a sequence
    // starts to force Canvas2D. The default prefers WebGL2 and falls back to
    // Canvas2D automatically when the browser cannot allocate that context.
    // trails is the kind:"trails" exception — consumed via the trails branch as
    // ITrailOverlayCanvas, not the strict EffectRendererLike contract.
    const flag =
      typeof window !== "undefined"
        ? (window as { __TKA_TRAIL_GPU?: boolean }).__TKA_TRAIL_GPU
        : undefined;
    if (flag === false) {
      console.info(
        "[TrailOverlay] using legacy Canvas2D (window.__TKA_TRAIL_GPU = false)"
      );
      return new TrailOverlayCanvas() as unknown as EffectRendererLike;
    }
    return new AdaptiveTrailOverlay({
      createPrimary: () => new TrailOverlayWebGL2(),
      createFallback: () => new TrailOverlayCanvas(),
    }) as unknown as EffectRendererLike;
  },
  defaultConfig: DEFAULT_EFFECTS_CONFIG.trails,
  // RenderLoopConfig slot name for the trail overlay instance
  configKey: "trailOverlay",
};
