/**
 * The 2D animation canvas's own drawing of its grid and its props, as pure
 * functions. The animation renderer draws every frame with these, and so does
 * any other picture that must look exactly like the animation canvas (the
 * LOOP run clip's canvas stage), so the two can never drift apart.
 */

import type { RenderedPropTransform } from "#lib/shared/animation-engine/domain/types/fire-types.js";

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Drawable = CanvasImageSource;

/** The grid's ink: black on a light canvas, off-white on a dark one. */
export const GRID_INK = { light: "#000000", dark: "#d9d9d9" } as const;

/**
 * Paint `gridImage` into `target` at `canvasSize`, recoloured to `ink`.
 *
 * Uses "source-in" compositing rather than ctx.filter: iOS Safari silently
 * ignores CanvasRenderingContext2D.filter, which left the grid pure black
 * (invisible) on the dark animation canvas. False when `target` has no 2D context.
 */
export function tintGridInk(
  target: HTMLCanvasElement | OffscreenCanvas,
  gridImage: Drawable,
  canvasSize: number,
  ink: string
): boolean {
  target.width = canvasSize;
  target.height = canvasSize;
  const offCtx = target.getContext("2d") as Context | null;
  if (!offCtx) return false;
  offCtx.clearRect(0, 0, canvasSize, canvasSize);
  // 1. Draw the grid (black ink) as an alpha mask.
  offCtx.drawImage(gridImage, 0, 0, canvasSize, canvasSize);
  // 2. Recolor only the drawn pixels.
  offCtx.globalCompositeOperation = "source-in";
  offCtx.fillStyle = ink;
  offCtx.fillRect(0, 0, canvasSize, canvasSize);
  offCtx.globalCompositeOperation = "source-over";
  return true;
}

/** The grid's view box, and the radius of its hand points in it. */
const VIEWBOX_SIZE = 950;
const GRID_HALFWAY_POINT_OFFSET = 150;

/** A prop's place on the canvas, as the animation interpolator leaves it. */
export interface CanvasPropState {
  centerPathAngle: number;
  staffRotationAngle: number;
  /** Cartesian place, in hand-point radii, for a dash through the centre. */
  x?: number;
  y?: number;
}

/**
 * Where the animation canvas puts a prop: its centre on the hand-point circle
 * (or its dash place), its sprite's size at this canvas size, and its angle.
 */
export function propPlacement(
  propState: CanvasPropState,
  propDimensions: { width: number; height: number },
  canvasSize: number
): { x: number; y: number; width: number; height: number; rotation: number } {
  const centre = canvasSize / 2;
  const scale = canvasSize / VIEWBOX_SIZE;
  const radius = GRID_HALFWAY_POINT_OFFSET * scale;
  const dash = propState.x !== undefined && propState.y !== undefined;
  return {
    x: centre + (dash ? propState.x! : Math.cos(propState.centerPathAngle)) * radius,
    y: centre + (dash ? propState.y! : Math.sin(propState.centerPathAngle)) * radius,
    width: propDimensions.width * scale,
    height: propDimensions.height * scale,
    rotation: propState.staffRotationAngle,
  };
}

/** The transform the animation canvas draws a prop at: a hand is never turned. */
export function propTransformOf(
  propState: CanvasPropState,
  propDimensions: { width: number; height: number },
  canvasSize: number,
  propType?: string | null
): RenderedPropTransform {
  const place = propPlacement(propState, propDimensions, canvasSize);
  return {
    centerX: place.x,
    centerY: place.y,
    angle: propType?.toLowerCase() === "hand" ? 0 : place.rotation,
    scaleFactor: canvasSize / VIEWBOX_SIZE,
  };
}

/** Where a prop sprite was drawn: its size on the canvas and the angle it was turned to. */
export interface DrawnPropSprite {
  width: number;
  height: number;
  rotation: number;
}

/**
 * Draw a prop sprite at an already-resolved canvas transform. Every prop
 * sprite is already coloured by the SVG pipeline, so it draws at its own
 * intrinsic bounds; a hand is never turned, and a flipped sprite (the
 * Buugeng family) is mirrored after it is turned.
 */
export function drawPropSprite(
  ctx: Context,
  image: Drawable,
  dimensions: { width: number; height: number },
  transform: RenderedPropTransform,
  flipped: boolean = false,
  propType?: string
): DrawnPropSprite {
  const width = dimensions.width * transform.scaleFactor;
  const height = dimensions.height * transform.scaleFactor;
  const rotation = propType?.toLowerCase() === "hand" ? 0 : transform.angle;
  ctx.save();
  ctx.translate(transform.centerX, transform.centerY);
  ctx.rotate(rotation);
  if (flipped) ctx.scale(-1, 1);
  ctx.drawImage(image, -width / 2, -height / 2, width, height);
  ctx.restore();
  return { width, height, rotation };
}
