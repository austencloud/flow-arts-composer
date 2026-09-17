/**
 * FireTipTracker
 *
 * Tracks prop fire-point positions across frames and computes velocity vectors
 * via finite differencing. Supports variable tip counts per prop type by
 * reading from PropTipPoints configuration.
 *
 * Zero-alloc hot path: reuses StoredTip and output arrays each frame.
 */

import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import type {
  PropTipData,
  RenderedPropTransform,
} from "../domain/types/fire-types";
import { getTipPoints, type TipPoint } from "../domain/types/prop-tip-points";
import {
  calculatePropCenter,
  type PropEndpointConfig,
} from "./prop-position-calculator";

export interface FireTipTrackerConfig {
  canvasSize: number;
  leftPropDimensions: { width: number; height: number };
  rightPropDimensions: { width: number; height: number };
  leftPropType?: string;
  rightPropType?: string;
  /**
   * Render keys of the sprites the canvas is painting (`fan__lotus`,
   * `club__model`). When present they resolve the tip table instead of the
   * notation type, so effects attach to the artwork on screen.
   */
  leftPropRenderKey?: string;
  rightPropRenderKey?: string;
  /**
   * Chirality flip, as drawn: the Canvas2D renderer mirrors a flipped sprite
   * with `scale(-1, 1)` after rotating it, so every painted point sits at
   * (-dx, dy) in prop-local space. A three-armed trigeng emitted from the
   * unmirrored table lands 60 degrees off, in the gap between two arms.
   */
  leftPropFlipped?: boolean;
  rightPropFlipped?: boolean;
  /** Transforms from the Canvas2D renderer. When provided, used instead of recomputing positions. */
  renderedTransforms?: {
    left: RenderedPropTransform | null;
    right: RenderedPropTransform | null;
  };
  /**
   * Overlaid tunnel layers (rotated/mirrored copies of the base sequence). When
   * present, the tracker also emits tips for each layer's left/right props at
   * propIndex >= 2, so per-tip effects (which filter by propIndex, with "*"
   * matching any) decorate the whole kaleidoscope instead of just the base
   * pair. Layers share the base blue/red dimensions + types and use the
   * fallback position path (no per-layer rendered transforms exist). Absent =
   * identical legacy behavior.
   */
  additionalLayers?: Array<{
    leftProp: PropState | null;
    rightProp: PropState | null;
    opacity?: number;
  }>;
}

export interface FireTipUpdateResult {
  tips: PropTipData[];
  /** True when a time gap was detected (HMR, tab switch, frame drop). Caller should clear the fire simulation. */
  gapDetected: boolean;
}

/** Minimum dt to avoid velocity spikes on first frame or pauses */
const MIN_DT_SECONDS = 1 / 120;

/** Maximum velocity magnitude to clamp physics outliers */
const MAX_SPEED = 5000;

/** Maximum fire points across the base blue/red pair (performance cap for the shader) */
const MAX_TOTAL_TIPS = 16;

/** Defensive upper bound for overlaid tunnel-layer tips (beyond the base 16).
 *  The real ceiling is the live layer count (cap scales per frame), so this only
 *  guards against a pathological layer count — set well above any legitimate
 *  8-fold + mirror stack so it never truncates a real kaleidoscope. The fire
 *  splat loop is uncapped, so every emitted tip renders. */
const MAX_LAYER_TIPS = 2048;

/**
 * If the time between consecutive update() calls exceeds this threshold,
 * we treat it as a disruption (HMR, tab switch, frame drop burst) and
 * invalidate all stored positions. This prevents velocity spikes that
 * push flames away from prop tips.
 */
const GAP_THRESHOLD_MS = 200;

interface StoredTip {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  time: number;
  valid: boolean;
}

function createStoredTip(): StoredTip {
  return { x: 0, y: 0, velocityX: 0, velocityY: 0, time: 0, valid: false };
}

/** Viewbox size for coordinate calculations (matches PropPositionCalculator) */
const VIEWBOX_SIZE = 950;

export class FireTipTracker {
  /**
   * Previous frame positions. Fixed-size pool, indexed by a stable key
   * derived from (propIndex, tipIndex). Max 16 tips total.
   */
  private prevTips: StoredTip[] = [];

  /** Output array reused each frame */
  private outputTips: PropTipData[] = [];

  /**
   * Previous-frame positions for overlaid tunnel-layer tips, keyed by
   * "<layerIndex>-<b|r>-<tipIndex>". Dynamic (grows to the max layer count
   * seen this session) so the fixed 16-slot base pool stays untouched.
   */
  private layerPrevTips = new Map<string, StoredTip>();

  /** Timestamp of the last update() call. Used for gap detection. */
  private lastUpdateTime = 0;

  /** Reusable result object to avoid allocation per frame */
  private result: FireTipUpdateResult = {
    tips: this.outputTips,
    gapDetected: false,
  };

  /** Skip the first few frames after reset to let canvas size and prop
   *  positions settle. Mirrors TrailOverlayCanvas warmup logic. */
  private warmupFramesRemaining = 3;
  private static readonly WARMUP_FRAMES = 3;

  constructor() {
    // Pre-allocate stored tips pool
    for (let i = 0; i < MAX_TOTAL_TIPS; i++) {
      this.prevTips.push(createStoredTip());
    }
  }

  update(
    leftProp: PropState | null,
    rightProp: PropState | null,
    config: FireTipTrackerConfig,
    currentTime: number
  ): FireTipUpdateResult {
    // Let canvas size and prop positions settle before tracking.
    // Without this, the first frame can compute tip positions at a
    // stale canvas size, producing a velocity spike to the correct
    // position that pushes flames/charcoal away from the prop.
    if (this.warmupFramesRemaining > 0) {
      this.warmupFramesRemaining--;
      this.lastUpdateTime = currentTime;
      this.result.tips = this.outputTips;
      this.result.gapDetected = false;
      return this.result;
    }

    // Detect time gaps (HMR, tab switch, long frame drops).
    // When a gap is detected, invalidate all stored tips so the first
    // post-gap frame starts with zero velocity instead of a spike.
    let gapDetected = false;
    if (this.lastUpdateTime > 0) {
      const elapsed = currentTime - this.lastUpdateTime;
      if (elapsed > GAP_THRESHOLD_MS) {
        gapDetected = true;
        this.reset();
      }
    }
    this.lastUpdateTime = currentTime;

    this.outputTips.length = 0;
    let totalTips = 0;

    if (leftProp) {
      totalTips = this.emitPropTips(
        leftProp,
        config.canvasSize,
        config.leftPropDimensions,
        config.leftPropRenderKey ?? config.leftPropType ?? null,
        config.leftPropFlipped ?? false,
        0, // propIndex
        0, // prevTipOffset
        currentTime,
        totalTips,
        config.renderedTransforms?.left
      );
    } else {
      // Invalidate blue prop stored tips
      this.invalidateRange(0, MAX_TOTAL_TIPS / 2);
    }

    if (rightProp) {
      totalTips = this.emitPropTips(
        rightProp,
        config.canvasSize,
        config.rightPropDimensions,
        config.rightPropRenderKey ?? config.rightPropType ?? null,
        config.rightPropFlipped ?? false,
        1, // propIndex
        MAX_TOTAL_TIPS / 2, // prevTipOffset (red starts at slot 8)
        currentTime,
        totalTips,
        config.renderedTransforms?.right
      );
    } else {
      // Invalidate red prop stored tips
      this.invalidateRange(MAX_TOTAL_TIPS / 2, MAX_TOTAL_TIPS);
    }

    // Overlaid tunnel layers: emit tips at propIndex >= 2 so every effect
    // (which filters by propIndex, "*" matching all) covers the kaleidoscope.
    if (config.additionalLayers && config.additionalLayers.length > 0) {
      // Fully render every layer: the cap scales with the live layer count so
      // no tunnel copy is ever dropped. Each layer emits at most MAX_TOTAL_TIPS
      // (8 blue + 8 red); the fire splat loop is uncapped and the output array
      // is dynamic, so the only ceiling is real geometry. The fixed
      // MAX_LAYER_TIPS is kept only as a defensive upper bound against a
      // pathological layer count.
      const cap = Math.min(
        MAX_TOTAL_TIPS + config.additionalLayers.length * MAX_TOTAL_TIPS,
        MAX_TOTAL_TIPS + MAX_LAYER_TIPS
      );
      let layerOutputIndex = totalTips;
      for (let li = 0; li < config.additionalLayers.length; li++) {
        const layer = config.additionalLayers[li]!;
        // Distinct propIndex per layer/hand: base blue=0, red=1; layer li
        // blue=2+2*li, red=3+2*li. Only the "*"-vs-specific distinction
        // matters downstream, so exact values are irrelevant past uniqueness.
        if (layer.leftProp) {
          layerOutputIndex = this.emitLayerPropTips(
            layer.leftProp,
            config.canvasSize,
            config.leftPropDimensions,
            config.leftPropType ?? null,
            config.leftPropFlipped ?? false,
            2 + li * 2,
            `${li}-b`,
            currentTime,
            layerOutputIndex,
            cap,
            layer.opacity ?? 1
          );
        }
        if (layer.rightProp) {
          layerOutputIndex = this.emitLayerPropTips(
            layer.rightProp,
            config.canvasSize,
            config.rightPropDimensions,
            config.rightPropType ?? null,
            config.rightPropFlipped ?? false,
            3 + li * 2,
            `${li}-r`,
            currentTime,
            layerOutputIndex,
            cap,
            layer.opacity ?? 1
          );
        }
      }
    }

    this.result.tips = this.outputTips;
    this.result.gapDetected = gapDetected;
    return this.result;
  }

  reset(): void {
    for (let i = 0; i < this.prevTips.length; i++) {
      this.prevTips[i]!.valid = false;
    }
    this.layerPrevTips.forEach((t) => (t.valid = false));
    this.outputTips.length = 0;
    this.lastUpdateTime = 0;
    this.warmupFramesRemaining = FireTipTracker.WARMUP_FRAMES;
  }

  /**
   * Emit fire tips for a single prop based on its fire point configuration.
   */
  private emitPropTips(
    prop: PropState,
    canvasSize: number,
    propDimensions: { width: number; height: number },
    propType: string | null,
    flipped: boolean,
    propIndex: 0 | 1,
    prevTipOffset: number,
    currentTime: number,
    outputStartIndex: number,
    renderedTransform?: RenderedPropTransform | null
  ): number {
    const tipConfig = getTipPoints(propType);
    const tipPoints = tipConfig.points;

    if (tipPoints.length === 0) return outputStartIndex;

    let centerX: number;
    let centerY: number;
    let angle: number;
    let gridScaleFactor: number;

    if (renderedTransform) {
      // Use the exact position the Canvas2D renderer drew the prop at
      centerX = renderedTransform.centerX;
      centerY = renderedTransform.centerY;
      angle = renderedTransform.angle;
      gridScaleFactor = renderedTransform.scaleFactor;
    } else {
      // Fallback: compute independently (legacy path)
      const endpointConfig: PropEndpointConfig = {
        canvasSize,
        propDimensions,
      };
      const center = calculatePropCenter(prop, endpointConfig);
      centerX = center.x;
      centerY = center.y;
      gridScaleFactor = canvasSize / VIEWBOX_SIZE;
      angle = prop.staffRotationAngle;
    }

    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const mirror = flipped ? -1 : 1;

    let outputIndex = outputStartIndex;

    for (let i = 0; i < tipPoints.length && outputIndex < MAX_TOTAL_TIPS; i++) {
      const tp: TipPoint = tipPoints[i]!;
      const prevSlot = prevTipOffset + i;

      // Transform tip point from prop-local to canvas space, mirrored the
      // same way the renderer mirrors a chirality-B sprite.
      const dx = tp.dx * mirror;
      const worldX = centerX + (dx * cosA - tp.dy * sinA) * gridScaleFactor;
      const worldY = centerY + (dx * sinA + tp.dy * cosA) * gridScaleFactor;

      this.emitTip(
        this.prevTips[prevSlot]!,
        worldX,
        worldY,
        propIndex,
        i,
        1.0,
        currentTime,
        outputIndex
      );
      outputIndex++;
    }

    // Invalidate any remaining prev slots for this prop (if prop type changed to fewer tips)
    for (let i = tipPoints.length; i < MAX_TOTAL_TIPS / 2; i++) {
      const prevSlot = prevTipOffset + i;
      if (prevSlot < this.prevTips.length) {
        this.prevTips[prevSlot]!.valid = false;
      }
    }

    return outputIndex;
  }

  /**
   * Emit fire tips for one overlaid tunnel-layer prop. Mirrors emitPropTips but
   * always uses the fallback position path (layers have no rendered transform)
   * and pulls previous-frame state from the dynamic layerPrevTips map, leaving
   * the fixed 16-slot base pool untouched.
   */
  private emitLayerPropTips(
    prop: PropState,
    canvasSize: number,
    propDimensions: { width: number; height: number },
    propType: string | null,
    flipped: boolean,
    propIndex: number,
    keyPrefix: string,
    currentTime: number,
    outputStartIndex: number,
    cap: number,
    opacity: number
  ): number {
    const tipConfig = getTipPoints(propType);
    const tipPoints = tipConfig.points;
    if (tipPoints.length === 0) return outputStartIndex;

    const endpointConfig: PropEndpointConfig = { canvasSize, propDimensions };
    const center = calculatePropCenter(prop, endpointConfig);
    const gridScaleFactor = canvasSize / VIEWBOX_SIZE;
    const angle = prop.staffRotationAngle;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const mirror = flipped ? -1 : 1;

    let outputIndex = outputStartIndex;
    for (let i = 0; i < tipPoints.length && outputIndex < cap; i++) {
      const tp: TipPoint = tipPoints[i]!;
      const dx = tp.dx * mirror;
      const worldX = center.x + (dx * cosA - tp.dy * sinA) * gridScaleFactor;
      const worldY = center.y + (dx * sinA + tp.dy * cosA) * gridScaleFactor;

      const key = `${keyPrefix}-${i}`;
      let prev = this.layerPrevTips.get(key);
      if (!prev) {
        prev = createStoredTip();
        this.layerPrevTips.set(key, prev);
      }

      this.emitTip(
        prev,
        worldX,
        worldY,
        propIndex,
        i,
        Math.max(0, Math.min(1, opacity)),
        currentTime,
        outputIndex
      );
      outputIndex++;
    }

    return outputIndex;
  }

  private emitTip(
    prev: StoredTip,
    x: number,
    y: number,
    propIndex: number,
    tipIndex: number,
    flameScale: number,
    currentTime: number,
    outputIndex: number
  ): void {
    let velocityX = 0;
    let velocityY = 0;
    let speed = 0;
    let accelerationX = 0;
    let accelerationY = 0;
    let jerk = 0;

    // Capture previous position before overwriting (for sub-frame interpolation)
    const prevX = prev.valid ? prev.x : x;
    const prevY = prev.valid ? prev.y : y;

    if (prev.valid) {
      const dt = Math.max((currentTime - prev.time) / 1000, MIN_DT_SECONDS);
      velocityX = (x - prev.x) / dt;
      velocityY = (y - prev.y) / dt;
      speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY);

      // Clamp to prevent physics outliers
      if (speed > MAX_SPEED) {
        const scale = MAX_SPEED / speed;
        velocityX *= scale;
        velocityY *= scale;
        speed = MAX_SPEED;
      }

      // Compute jerk (acceleration magnitude) from velocity delta
      const dvx = velocityX - prev.velocityX;
      const dvy = velocityY - prev.velocityY;
      accelerationX = dvx / dt;
      accelerationY = dvy / dt;
      jerk = Math.sqrt(dvx * dvx + dvy * dvy) / dt;
    }

    // Update stored position and velocity
    prev.x = x;
    prev.y = y;
    prev.velocityX = velocityX;
    prev.velocityY = velocityY;
    prev.time = currentTime;
    prev.valid = true;

    // Reuse or create output tip
    const existing = this.outputTips[outputIndex];
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.prevX = prevX;
      existing.prevY = prevY;
      existing.velocityX = velocityX;
      existing.velocityY = velocityY;
      existing.speed = speed;
      existing.accelerationX = accelerationX;
      existing.accelerationY = accelerationY;
      existing.propIndex = propIndex;
      existing.tipIndex = tipIndex;
      existing.flameScale = flameScale;
      existing.jerk = jerk;
    } else {
      this.outputTips.push({
        x,
        y,
        prevX,
        prevY,
        velocityX,
        velocityY,
        speed,
        accelerationX,
        accelerationY,
        propIndex,
        tipIndex,
        flameScale,
        jerk,
      });
    }
  }

  private invalidateRange(start: number, end: number): void {
    for (let i = start; i < end && i < this.prevTips.length; i++) {
      this.prevTips[i]!.valid = false;
    }
  }

  /** Snapshot of internal state for diagnostic reports. */
  getDiagnostics(): Record<string, unknown> {
    const validTips = this.prevTips.filter((t) => t.valid);
    return {
      lastUpdateTime: this.lastUpdateTime,
      validTipCount: validTips.length,
      tipPositions: validTips.map((t) => ({
        x: Math.round(t.x),
        y: Math.round(t.y),
        vx: Math.round(t.velocityX),
        vy: Math.round(t.velocityY),
      })),
      currentOutputCount: this.outputTips.length,
    };
  }
}
