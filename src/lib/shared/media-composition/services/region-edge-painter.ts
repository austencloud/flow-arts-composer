import type { RegionEdge } from "$lib/shared/media-composition/domain/media-layout-schema";
import type { PixelRect } from "$lib/shared/media-composition/services/media-fit";
import { traceRoundedRect } from "$lib/shared/render/utils/trace-rounded-rect";

/**
 * A region's rounded corners, border and drop shadow, measured once for the
 * export's canvas and the preview's CSS alike, so the two draw the same edge.
 */

interface Size {
  width: number;
  height: number;
}

/** The shadow at full strength, as shares of the frame's shorter side. */
const SHADOW_BLUR = { least: 0.015, most: 0.05 } as const;
const SHADOW_DROP = { least: 0.004, most: 0.016 } as const;
const SHADOW_ALPHA = 0.7;

export interface RegionEdgePixels {
  /** Corner radius, never more than half the shorter side. */
  radius: number;
  /** Border width inside the edge; zero draws none. */
  border: number;
  color: string;
  /** A CSS or canvas blur radius, its drop straight down, and its darkness. */
  shadow: { blur: number; drop: number; alpha: number } | null;
}

/** The edge in pixels for a region `rect` pixels in a `frame`-sized output. */
export function regionEdgePixels(
  edge: RegionEdge,
  rect: Size,
  frame: Size
): RegionEdgePixels {
  const short = Math.max(0, Math.min(rect.width, rect.height));
  const frameShort = Math.max(0, Math.min(frame.width, frame.height));
  const strength = edge.shadow;
  const between = (range: { least: number; most: number }) =>
    frameShort * (range.least + (range.most - range.least) * strength);
  return {
    radius: Math.min(edge.cornerRadius, 0.5) * short,
    border: Math.min(edge.borderWidth * frameShort, short / 2),
    color: edge.borderColor,
    shadow:
      strength > 0
        ? {
            blur: between(SHADOW_BLUR),
            drop: between(SHADOW_DROP),
            alpha: SHADOW_ALPHA * strength,
          }
        : null,
  };
}

/**
 * The drop shadow alone. The shape is filled a frame's width off to the
 * left and its shadow cast back into place, so nothing but the shadow lands:
 * a fading clip over a filled shape would darken as it faded.
 */
export function paintEdgeShadow(
  context: CanvasRenderingContext2D,
  rect: PixelRect,
  pixels: RegionEdgePixels,
  opacity: number
): void {
  const shadow = pixels.shadow;
  if (!shadow || opacity <= 0) return;
  const away = context.canvas.width + rect.width + shadow.blur * 4;
  context.save();
  context.translate(-away, 0);
  traceRoundedRect(context, rect, pixels.radius);
  context.shadowColor = `rgba(0, 0, 0, ${shadow.alpha * opacity})`;
  context.shadowBlur = shadow.blur;
  context.shadowOffsetX = away;
  context.shadowOffsetY = shadow.drop;
  context.fillStyle = "#000";
  context.fill();
  context.restore();
}

/** The border, inside the edge and following its corners. */
export function paintEdgeBorder(
  context: CanvasRenderingContext2D,
  rect: PixelRect,
  pixels: RegionEdgePixels,
  opacity: number
): void {
  if (pixels.border <= 0 || opacity <= 0) return;
  const half = pixels.border / 2;
  const inner: PixelRect = {
    x: rect.x + half,
    y: rect.y + half,
    width: rect.width - pixels.border,
    height: rect.height - pixels.border,
  };
  if (inner.width <= 0 || inner.height <= 0) return;
  context.save();
  context.globalAlpha = opacity;
  traceRoundedRect(context, inner, Math.max(0, pixels.radius - half));
  context.lineWidth = pixels.border;
  context.strokeStyle = pixels.color;
  context.stroke();
  context.restore();
}
