import type {
  PostBox,
  PostCallout,
  PostTextSize,
} from "#lib/shared/media-composition/domain/post-project.js";

/**
 * A callout is a text item drawn as a speech bubble: a dark rounded plate
 * with a small tail aimed at a point in the frame, the way the ghost
 * presenter shows its thoughts beside its pointer. The plate's look copies
 * `src/lib/shared/attract/components/ThoughtCaption.svelte`, which stays the
 * owner of the live ghost's DOM bubble. Lengths are pixels at a 1080-pixel
 * frame height and scale with the frame.
 */
export const CALLOUT_FILL = "rgba(16, 16, 24, 0.88)";
export const CALLOUT_BORDER = "rgba(255, 255, 255, 0.14)";
export const CALLOUT_TEXT = "#f4f4f8";
export const CALLOUT_SHADOW = "rgba(0, 0, 0, 0.45)";
export const CALLOUT_FONT_WEIGHT = 600;
export const CALLOUT_FONT_STACK =
  'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
export const CALLOUT_RADIUS = 20;
/** The tail is a rotated square this wide whose outer half shows. */
export const CALLOUT_TAIL = 16;
export const CALLOUT_PAD_X = 24;
export const CALLOUT_PAD_Y = 18;
export const CALLOUT_BORDER_WIDTH = 1;
export const CALLOUT_SHADOW_BLUR = 20;
export const CALLOUT_SHADOW_OFFSET_Y = 12;
/** Type size as a share of the frame's height: m is 34 px at 1080. */
export const CALLOUT_SIZE_FRACTION: Record<PostTextSize, number> = {
  s: 0.026,
  m: 0.0315,
  l: 0.04,
};
export const CALLOUT_LINE_HEIGHT = 1.3;
/** Words that do not fit shrink, but no further than this share of their size. */
export const CALLOUT_MIN_SCALE = 0.8;
const REFERENCE_HEIGHT = 1080;

export function calloutFont(fontPx: number): string {
  return `${CALLOUT_FONT_WEIGHT} ${fontPx}px ${CALLOUT_FONT_STACK}`;
}

interface Point {
  x: number;
  y: number;
}

export type CalloutSide = "top" | "right" | "bottom" | "left";

export interface CalloutTail {
  side: CalloutSide;
  /** In path order, clockwise around the plate: base, tip, base. */
  base1: Point;
  tip: Point;
  base2: Point;
}

export interface CalloutGeometry {
  /** Pixels per 1080p pixel. */
  unit: number;
  radius: number;
  padX: number;
  padY: number;
  fontPx: number;
  /** Null when the point is inside the plate. */
  tail: CalloutTail | null;
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The plate, tail and type for a callout drawn into `rect`, the item's box
 * in the painter's pixels. `box` is that box as shares of the frame, which
 * gives the frame's size and where the callout point lands in `rect`'s
 * pixels.
 */
export function calloutGeometry(
  rect: Rect,
  box: Pick<PostBox, "x" | "y" | "width" | "height">,
  callout: PostCallout,
  size: PostTextSize
): CalloutGeometry {
  const frameWidth = rect.width / box.width;
  const frameHeight = rect.height / box.height;
  const unit = frameHeight / REFERENCE_HEIGHT;
  const radius = Math.min(
    CALLOUT_RADIUS * unit,
    rect.width / 2,
    rect.height / 2
  );
  const point = {
    x: rect.x + (callout.x - box.x) * frameWidth,
    y: rect.y + (callout.y - box.y) * frameHeight,
  };
  return {
    unit,
    radius,
    padX: CALLOUT_PAD_X * unit,
    padY: CALLOUT_PAD_Y * unit,
    fontPx: CALLOUT_SIZE_FRACTION[size] * frameHeight,
    tail: calloutTail(rect, radius, point, (CALLOUT_TAIL * unit) / Math.SQRT2),
  };
}

function calloutTail(
  rect: Rect,
  radius: number,
  point: Point,
  half: number
): CalloutTail | null {
  const left = rect.x;
  const top = rect.y;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const side: CalloutSide | null =
    point.y < top
      ? "top"
      : point.y > bottom
        ? "bottom"
        : point.x < left
          ? "left"
          : point.x > right
            ? "right"
            : null;
  if (!side) return null;
  // Along the edge, the tail follows the point but stays off the corners.
  const along = (value: number, start: number, end: number) => {
    const low = start + radius + half;
    const high = end - radius - half;
    return low > high
      ? (start + end) / 2
      : Math.min(high, Math.max(low, value));
  };
  switch (side) {
    case "top": {
      const x = along(point.x, left, right);
      return {
        side,
        base1: { x: x - half, y: top },
        tip: { x, y: top - half },
        base2: { x: x + half, y: top },
      };
    }
    case "right": {
      const y = along(point.y, top, bottom);
      return {
        side,
        base1: { x: right, y: y - half },
        tip: { x: right + half, y },
        base2: { x: right, y: y + half },
      };
    }
    case "bottom": {
      const x = along(point.x, left, right);
      return {
        side,
        base1: { x: x + half, y: bottom },
        tip: { x, y: bottom + half },
        base2: { x: x - half, y: bottom },
      };
    }
    case "left": {
      const y = along(point.y, top, bottom);
      return {
        side,
        base1: { x: left, y: y + half },
        tip: { x: left - half, y },
        base2: { x: left, y: y - half },
      };
    }
  }
}

/** Room the tail and the shadow need outside the item's own box. */
export function calloutOverflow(
  target: { width: number; height: number },
  box: Pick<PostBox, "height">
): { top: number; right: number; bottom: number; left: number } {
  const unit = target.height / box.height / REFERENCE_HEIGHT;
  const side = 24 * unit;
  return { top: side, right: side, bottom: 36 * unit, left: side };
}

/** The subset of a 2D context a callout's outline needs. */
export interface CalloutPathTarget {
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arcTo(x1: number, y1: number, x2: number, y2: number, radius: number): void;
  closePath(): void;
}

/**
 * Traces the plate and its tail as one closed outline, clockwise from the
 * top-left corner, so one fill and one stroke draw both without the tail
 * doubling the plate's see-through fill where they meet.
 */
export function traceCalloutPath(
  context: CalloutPathTarget,
  rect: Rect,
  geometry: Pick<CalloutGeometry, "radius" | "tail">
): void {
  const { x, y, width, height } = rect;
  const r = geometry.radius;
  const tail = geometry.tail;
  const tailOn = (side: CalloutSide) => {
    if (tail?.side !== side) return;
    context.lineTo(tail.base1.x, tail.base1.y);
    context.lineTo(tail.tip.x, tail.tip.y);
    context.lineTo(tail.base2.x, tail.base2.y);
  };
  context.beginPath();
  context.moveTo(x + r, y);
  tailOn("top");
  context.lineTo(x + width - r, y);
  context.arcTo(x + width, y, x + width, y + r, r);
  tailOn("right");
  context.lineTo(x + width, y + height - r);
  context.arcTo(x + width, y + height, x + width - r, y + height, r);
  tailOn("bottom");
  context.lineTo(x + r, y + height);
  context.arcTo(x, y + height, x, y + height - r, r);
  tailOn("left");
  context.lineTo(x, y + r);
  context.arcTo(x, y, x + r, y, r);
  context.closePath();
}
