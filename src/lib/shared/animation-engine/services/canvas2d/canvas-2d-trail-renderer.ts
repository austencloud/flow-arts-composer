/**
 * Canvas2D Trail Renderer
 *
 * Handles trail rendering using pure Canvas2D:
 * - Smooth trail rendering (Catmull-Rom splines)
 * - Segmented trail rendering
 * - Trail opacity calculations (fade/gradient)
 * - Multi-end trail support (both ends tracking)
 *
 * Single Responsibility: Trail rendering logic
 */

import type {
  TrailPoint,
  TrailSettings,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import {
  TrailMode,
  TrailEffect,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { QualityHints } from "#lib/shared/animation-engine/domain/types/quality-types.js";
import type { AdditionalLayerRenderData } from "#lib/shared/animation-engine/services/canvas-2d-animation-renderer.js";
import { DEFAULT_CANVAS_SIZE } from "#lib/shared/animation-engine/services/canvas-resizer.svelte.js";

// CATMULL-ROM SPLINE (pure math, no framework dependencies)

interface Point2D {
  x: number;
  y: number;
}

interface SplineConfig {
  alpha: number;
  subdivisionsPerSegment: number;
}

/**
 * Create smooth curve through control points using centripetal Catmull-Rom splines
 */
function createSmoothCurve(
  controlPoints: readonly Point2D[],
  config: Partial<SplineConfig> = {}
): Point2D[] {
  const alpha = config.alpha ?? 0.5;
  const subdivisions = config.subdivisionsPerSegment ?? 10;

  if (controlPoints.length < 2) return [...controlPoints];

  if (controlPoints.length === 2) {
    // Linear interpolation for 2 points
    const points: Point2D[] = [];
    const [p0, p1] = controlPoints;
    for (let i = 0; i <= subdivisions; i++) {
      const t = i / subdivisions;
      points.push({
        x: p0!.x + (p1!.x - p0!.x) * t,
        y: p0!.y + (p1!.y - p0!.y) * t,
      });
    }
    return points;
  }

  const result: Point2D[] = [{ ...controlPoints[0]! }];

  for (let i = 0; i < controlPoints.length - 1; i++) {
    const p0 = i > 0 ? controlPoints[i - 1]! : controlPoints[i]!;
    const p1 = controlPoints[i]!;
    const p2 = controlPoints[i + 1]!;
    const p3 =
      i < controlPoints.length - 2
        ? controlPoints[i + 2]!
        : controlPoints[i + 1]!;

    // Calculate t values for centripetal parameterization
    // Add small epsilon to prevent division by zero when points are identical
    const EPSILON = 1e-6;
    const getT = (t: number, pa: Point2D, pb: Point2D) => {
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return t + Math.max(EPSILON, Math.pow(dist, alpha));
    };

    const t0 = 0;
    const t1 = getT(t0, p0, p1);
    const t2 = getT(t1, p1, p2);
    const t3 = getT(t2, p2, p3);

    // Linear interpolation helper with safe division
    const safeDivide = (num: number, den: number) =>
      den === 0 ? 0 : num / den;
    const lerp = (pa: Point2D, pb: Point2D, t: number): Point2D => {
      const ct = Math.max(0, Math.min(1, t));
      return { x: pa.x + (pb.x - pa.x) * ct, y: pa.y + (pb.y - pa.y) * ct };
    };

    // Generate segment points
    for (let j = 1; j <= subdivisions; j++) {
      const t = t1 + (j / subdivisions) * (t2 - t1);

      const a1 = lerp(p0, p1, safeDivide(t - t0, t1 - t0));
      const a2 = lerp(p1, p2, safeDivide(t - t1, t2 - t1));
      const a3 = lerp(p2, p3, safeDivide(t - t2, t3 - t2));

      const b1 = lerp(a1, a2, safeDivide(t - t0, t2 - t0));
      const b2 = lerp(a2, a3, safeDivide(t - t1, t3 - t1));

      result.push(lerp(b1, b2, safeDivide(t - t1, t2 - t1)));
    }
  }

  return result;
}

/** Exponent for fade curve - holds brightness longer, then drops sharply */
const FADE_EXPONENT = 2.5;

/** Minimum width ratio at trail tail (30% of base width) */
const MIN_TAIL_WIDTH_RATIO = 0.3;

/** Default glow blur multiplier */
const DEFAULT_GLOW_BLUR_MULTIPLIER = 4;

/** Fallback glow blur when settings.glowBlur is 0 */
const FALLBACK_GLOW_BLUR = 8;

/** Minimum subdivisions per spline segment */
const MIN_SPLINE_SUBDIVISIONS = 2;

/** Maximum subdivisions per spline segment */
const MAX_SPLINE_SUBDIVISIONS = 10;

/** Target total subdivisions for adaptive calculation */
const TARGET_TOTAL_SUBDIVISIONS = 150;

/** Catmull-Rom alpha for centripetal parameterization */
const CATMULL_ROM_ALPHA = 0.5;

/** Minimum scaled line width in px - prevents trails from vanishing on tiny canvases */
const MIN_SCALED_LINE_WIDTH = 0.75;

/** Minimum scaled glow blur in px */
const MIN_SCALED_GLOW_BLUR = 1;

export class Canvas2DTrailRenderer {
  // Reusable buffers to avoid hot path allocations
  private controlPointsBuffer: Point2D[] = [];
  private leftEdgeBuffer: Point2D[] = [];
  private rightEdgeBuffer: Point2D[] = [];

  renderTrails(
    ctx: CanvasRenderingContext2D,
    leftTrailPoints: TrailPoint[],
    rightTrailPoints: TrailPoint[],
    trailSettings: TrailSettings,
    currentTime: number,
    hasLeft: boolean,
    hasRight: boolean,
    canvasSize: number,
    qualityHints?: QualityHints,
    additionalLayers?: AdditionalLayerRenderData[]
  ): void {
    const sizeScale = canvasSize / DEFAULT_CANVAS_SIZE;

    if (trailSettings.mode === TrailMode.OFF) {
      return;
    }

    // Render primary blue trail
    if (hasLeft && leftTrailPoints.length >= 2) {
      this.renderTrailSegments(
        ctx,
        leftTrailPoints,
        trailSettings.leftColor,
        trailSettings,
        currentTime,
        sizeScale,
        qualityHints
      );
    }

    // Render primary red trail
    if (hasRight && rightTrailPoints.length >= 2) {
      this.renderTrailSegments(
        ctx,
        rightTrailPoints,
        trailSettings.rightColor,
        trailSettings,
        currentTime,
        sizeScale,
        qualityHints
      );
    }

    // Render additional tunnel layer trails
    if (additionalLayers) {
      for (const layer of additionalLayers) {
        ctx.save();
        ctx.globalAlpha *= layer.opacity;
        if (layer.hasLeft && layer.leftTrailPoints.length >= 2) {
          this.renderTrailSegments(
            ctx,
            layer.leftTrailPoints,
            layer.leftColor,
            trailSettings,
            currentTime,
            sizeScale,
            qualityHints
          );
        }
        if (layer.hasRight && layer.rightTrailPoints.length >= 2) {
          this.renderTrailSegments(
            ctx,
            layer.rightTrailPoints,
            layer.rightColor,
            trailSettings,
            currentTime,
            sizeScale,
            qualityHints
          );
        }
        ctx.restore();
      }
    }
  }

  private renderTrailSegments(
    ctx: CanvasRenderingContext2D,
    points: TrailPoint[],
    colorString: string,
    settings: TrailSettings,
    currentTime: number,
    sizeScale: number,
    qualityHints?: QualityHints
  ): void {
    if (points.length < 2) return;

    // Group points by tipIndex so each tip's trail is rendered as a
    // separate continuous curve (prevents zigzagging between tips)
    const tipGroups = new Map<number, TrailPoint[]>();
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      let group = tipGroups.get(p.tipIndex);
      if (!group) {
        group = [];
        tipGroups.set(p.tipIndex, group);
      }
      group.push(p);
    }
    const pointSets = Array.from(tipGroups.values());

    for (const pointSet of pointSets) {
      if (pointSet.length < 2) continue;

      // Always use smooth curve rendering (Catmull-Rom splines)
      this.renderSmoothTrail(
        ctx,
        pointSet,
        colorString,
        settings,
        currentTime,
        sizeScale,
        qualityHints
      );
    }
  }

  private renderSmoothTrail(
    ctx: CanvasRenderingContext2D,
    points: TrailPoint[],
    color: string,
    settings: TrailSettings,
    currentTime: number,
    sizeScale: number,
    qualityHints?: QualityHints
  ): void {
    if (points.length < 2) return;

    // Reuse control points buffer (avoid creating 500+ objects per frame)
    const controlPoints = this.controlPointsBuffer;
    controlPoints.length = points.length; // Resize if needed
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (controlPoints[i]) {
        controlPoints[i]!.x = p.x;
        controlPoints[i]!.y = p.y;
      } else {
        controlPoints[i] = { x: p.x, y: p.y };
      }
    }

    // Adaptive subdivision based on point count AND quality tier
    const targetTotal =
      qualityHints?.targetSubdivisions ?? TARGET_TOTAL_SUBDIVISIONS;
    const maxPerSegment =
      qualityHints?.maxSubdivisionsPerSegment ?? MAX_SPLINE_SUBDIVISIONS;
    const subdivisionsPerSegment = Math.max(
      MIN_SPLINE_SUBDIVISIONS,
      Math.min(maxPerSegment, Math.floor(targetTotal / points.length))
    );

    const smoothPoints = createSmoothCurve(controlPoints, {
      alpha: CATMULL_ROM_ALPHA,
      subdivisionsPerSegment,
    });

    if (smoothPoints.length < 2) return;

    // Respect quality hints for glow: if hints say no glow, force NONE
    const glowEnabled = qualityHints?.glowEnabled ?? true;
    const effect = !glowEnabled
      ? TrailEffect.NONE
      : (settings.effect ?? TrailEffect.GLOW);

    // Always use tapered rendering (thick at head, thin at tail)
    const needsSegmentedRendering = true;

    if (needsSegmentedRendering) {
      // Segmented rendering for tapered trails
      this.renderTaperedSmoothTrail(
        ctx,
        smoothPoints,
        points,
        color,
        settings,
        currentTime,
        effect,
        sizeScale
      );
    } else {
      // Single path rendering (faster, no tapering)
      this.renderUniformSmoothTrail(
        ctx,
        smoothPoints,
        points,
        color,
        settings,
        currentTime,
        effect,
        sizeScale
      );
    }
  }

  /**
   * Render smooth trail with uniform width (single path, faster)
   * Uses quadraticCurveTo with midpoint technique for truly smooth curves
   */
  private renderUniformSmoothTrail(
    ctx: CanvasRenderingContext2D,
    smoothPoints: Point2D[],
    originalPoints: TrailPoint[],
    color: string,
    settings: TrailSettings,
    currentTime: number,
    effect: TrailEffect,
    sizeScale: number
  ): void {
    if (smoothPoints.length < 2) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Apply glow effect once
    const isGlow = effect === TrailEffect.GLOW;
    if (isGlow) {
      const rawBlur =
        settings.glowBlur > 0
          ? settings.glowBlur * DEFAULT_GLOW_BLUR_MULTIPLIER
          : FALLBACK_GLOW_BLUR;
      ctx.shadowBlur = Math.max(MIN_SCALED_GLOW_BLUR, rawBlur * sizeScale);
      ctx.shadowColor = color;
    }
    ctx.strokeStyle = color;
    const scaledWidth = Math.max(
      MIN_SCALED_LINE_WIDTH,
      settings.lineWidth * sizeScale
    );
    ctx.lineWidth = scaledWidth;

    // Draw trail in segments to allow per-segment opacity
    for (let i = 0; i < smoothPoints.length - 1; i++) {
      const p1 = smoothPoints[i]!;
      const p2 = smoothPoints[i + 1]!;

      if (isNaN(p1.x) || isNaN(p1.y) || isNaN(p2.x) || isNaN(p2.y)) continue;

      const opacity = this.calculateOpacity(
        i,
        smoothPoints.length,
        originalPoints,
        settings,
        currentTime
      );

      if (opacity <= 0) continue;

      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Render smooth trail with tapered width.
   * Uses filled polygon approach for smooth width variation without visible segments.
   */
  private renderTaperedSmoothTrail(
    ctx: CanvasRenderingContext2D,
    smoothPoints: Point2D[],
    originalPoints: TrailPoint[],
    color: string,
    settings: TrailSettings,
    currentTime: number,
    effect: TrailEffect,
    sizeScale: number
  ): void {
    if (smoothPoints.length < 3) return;

    ctx.save();

    // Build two edge curves - one on each side of the trail path
    // Offset perpendicular to the path direction by half the line width
    // Reuse buffers to avoid allocations in hot path
    const leftEdge = this.leftEdgeBuffer;
    const rightEdge = this.rightEdgeBuffer;
    leftEdge.length = smoothPoints.length;
    rightEdge.length = smoothPoints.length;

    for (let i = 0; i < smoothPoints.length; i++) {
      const curr = smoothPoints[i]!;
      const progress = i / (smoothPoints.length - 1);
      const halfWidth =
        this.calculateLineWidth(progress, settings, sizeScale) / 2;

      // Calculate perpendicular direction from path tangent
      let dx: number, dy: number;
      if (i === 0) {
        // First point: use forward direction
        const next = smoothPoints[1]!;
        dx = next.x - curr.x;
        dy = next.y - curr.y;
      } else if (i === smoothPoints.length - 1) {
        // Last point: use backward direction
        const prev = smoothPoints[i - 1]!;
        dx = curr.x - prev.x;
        dy = curr.y - prev.y;
      } else {
        // Middle points: average of forward and backward
        const prev = smoothPoints[i - 1]!;
        const next = smoothPoints[i + 1]!;
        dx = next.x - prev.x;
        dy = next.y - prev.y;
      }

      // Normalize and rotate 90 degrees for perpendicular
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / len;
      const perpY = dx / len;

      // Reuse or create point objects in buffers
      if (leftEdge[i]) {
        leftEdge[i]!.x = curr.x + perpX * halfWidth;
        leftEdge[i]!.y = curr.y + perpY * halfWidth;
      } else {
        leftEdge[i] = {
          x: curr.x + perpX * halfWidth,
          y: curr.y + perpY * halfWidth,
        };
      }
      if (rightEdge[i]) {
        rightEdge[i]!.x = curr.x - perpX * halfWidth;
        rightEdge[i]!.y = curr.y - perpY * halfWidth;
      } else {
        rightEdge[i] = {
          x: curr.x - perpX * halfWidth,
          y: curr.y - perpY * halfWidth,
        };
      }
    }

    // Apply glow effect once for all segments
    const isGlow = effect === TrailEffect.GLOW;
    if (isGlow) {
      const rawBlur =
        settings.glowBlur > 0
          ? settings.glowBlur * DEFAULT_GLOW_BLUR_MULTIPLIER
          : FALLBACK_GLOW_BLUR;
      ctx.shadowBlur = Math.max(MIN_SCALED_GLOW_BLUR, rawBlur * sizeScale);
      ctx.shadowColor = color;
    }
    ctx.fillStyle = color;

    // Draw trail in segments to allow per-segment opacity (fading along length).
    // Using many small filled polygons ensures smooth width and opacity variation.
    // Overlap segments slightly to prevent antialiasing gaps.
    for (let i = 0; i < smoothPoints.length - 1; i++) {
      const opacity = this.calculateOpacity(
        i,
        smoothPoints.length,
        originalPoints,
        settings,
        currentTime
      );

      if (opacity <= 0) continue;

      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.moveTo(leftEdge[i]!.x, leftEdge[i]!.y);
      ctx.lineTo(leftEdge[i + 1]!.x, leftEdge[i + 1]!.y);
      ctx.lineTo(rightEdge[i + 1]!.x, rightEdge[i + 1]!.y);
      ctx.lineTo(rightEdge[i]!.x, rightEdge[i]!.y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private renderSegmentedTrail(
    ctx: CanvasRenderingContext2D,
    points: TrailPoint[],
    color: string,
    settings: TrailSettings,
    currentTime: number,
    sizeScale: number
  ): void {
    if (points.length < 2) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Determine effect (default to GLOW)
    const effect = settings.effect ?? TrailEffect.GLOW;

    // Apply glow/shadow if using glow effect
    if (effect === TrailEffect.GLOW) {
      const rawBlur =
        settings.glowBlur > 0
          ? settings.glowBlur * DEFAULT_GLOW_BLUR_MULTIPLIER
          : FALLBACK_GLOW_BLUR;
      ctx.shadowBlur = Math.max(MIN_SCALED_GLOW_BLUR, rawBlur * sizeScale);
      ctx.shadowColor = color;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    }

    // Draw trail segments with varying opacity and width
    for (let i = 0; i < points.length - 1; i++) {
      const point = points[i]!;
      const nextPoint = points[i + 1]!;

      // Skip invalid points
      if (
        isNaN(point.x) ||
        isNaN(point.y) ||
        isNaN(nextPoint.x) ||
        isNaN(nextPoint.y)
      ) {
        continue;
      }

      // Progress: 0 = oldest (tail), 1 = newest (head)
      const progress = i / (points.length - 1);

      let opacity: number;

      if (settings.mode === TrailMode.FADE) {
        const age = currentTime - point.timestamp;
        const rawProgress = Math.min(
          1,
          Math.max(0, age / settings.fadeDurationMs)
        );

        // Exponential fade to zero - holds brightness longer, then drops sharply.
        // Fades all the way to 0 so stationary trails disappear completely.
        const fadeProgress = Math.pow(rawProgress, FADE_EXPONENT);

        opacity = settings.maxOpacity * (1 - fadeProgress);
        opacity = Math.max(0, Math.min(settings.maxOpacity, opacity));
      } else {
        // LOOP_CLEAR and PERSISTENT - gradient from old to new
        opacity =
          settings.minOpacity +
          progress * (settings.maxOpacity - settings.minOpacity);
      }

      // Calculate line width based on taper style
      const lineWidth = this.calculateLineWidth(progress, settings, sizeScale);

      ctx.beginPath();
      ctx.moveTo(point.x, point.y);
      ctx.lineTo(nextPoint.x, nextPoint.y);

      // GLOW or NONE: Single stroke (NEON removed - never used)
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = opacity;
      ctx.stroke();
    }

    ctx.restore();
  }

  private calculateOpacity(
    smoothPointIndex: number,
    totalSmoothPoints: number,
    originalPoints: TrailPoint[],
    settings: TrailSettings,
    currentTime: number
  ): number {
    if (settings.mode === TrailMode.FADE) {
      // Map smooth point index back to original trail point for timestamp
      const originalPointIndex = Math.floor(
        (smoothPointIndex / totalSmoothPoints) * originalPoints.length
      );
      const originalPoint = originalPoints[originalPointIndex];

      if (originalPoint) {
        const age = currentTime - originalPoint.timestamp;
        const progress = Math.min(
          1,
          Math.max(0, age / settings.fadeDurationMs)
        );

        // Exponential fade to zero - holds brightness longer, then drops sharply.
        // Fades all the way to 0 so stationary trails disappear completely.
        const fadeProgress = Math.pow(progress, FADE_EXPONENT);

        const opacity = settings.maxOpacity * (1 - fadeProgress);
        return Math.max(0, Math.min(settings.maxOpacity, opacity));
      } else {
        return settings.maxOpacity;
      }
    } else {
      // LOOP_CLEAR and PERSISTENT - gradient from old to new
      const progress = smoothPointIndex / (totalSmoothPoints - 1);
      return (
        settings.minOpacity +
        progress * (settings.maxOpacity - settings.minOpacity)
      );
    }
  }

  /**
   * Calculate line width based on position (always tapered).
   * Scales proportionally with canvas size so trails look consistent at any resolution.
   * Enforces a minimum floor so trails remain visible on very small canvases.
   * @param progress - 0 = oldest (tail), 1 = newest (head/prop)
   * @param sizeScale - canvasSize / DEFAULT_CANVAS_SIZE
   */
  private calculateLineWidth(
    progress: number,
    settings: TrailSettings,
    sizeScale: number
  ): number {
    // Always tapered: thick at head (progress=1), thin at tail (progress=0)
    const widthRatio =
      MIN_TAIL_WIDTH_RATIO + (1 - MIN_TAIL_WIDTH_RATIO) * progress;
    return Math.max(
      MIN_SCALED_LINE_WIDTH,
      settings.lineWidth * widthRatio * sizeScale
    );
  }
}
