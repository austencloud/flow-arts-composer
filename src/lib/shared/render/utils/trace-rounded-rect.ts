/**
 * The one rounded-rectangle path for 2D canvases. The radius is kept within
 * half of each side, so a large radius makes a pill or a circle instead of the
 * crossed arcs an unclamped radius draws. Browsers without `roundRect` get the
 * same path from four arcs.
 */

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Starts a path around `rect` with its corners rounded by `radius`. */
export function traceRoundedRect(
  context: Context2D,
  rect: Rect,
  radius: number
): void {
  const r = Math.max(0, Math.min(radius, rect.width / 2, rect.height / 2));
  context.beginPath();
  if (r <= 0) {
    context.rect(rect.x, rect.y, rect.width, rect.height);
    return;
  }
  if (typeof context.roundRect === "function") {
    context.roundRect(rect.x, rect.y, rect.width, rect.height, r);
    return;
  }
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  context.moveTo(rect.x + r, rect.y);
  context.arcTo(right, rect.y, right, bottom, r);
  context.arcTo(right, bottom, rect.x, bottom, r);
  context.arcTo(rect.x, bottom, rect.x, rect.y, r);
  context.arcTo(rect.x, rect.y, right, rect.y, r);
  context.closePath();
}
