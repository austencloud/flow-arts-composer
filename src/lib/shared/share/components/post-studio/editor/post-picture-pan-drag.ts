import { calculateMediaFit } from "$lib/shared/media-composition/services/media-fit";

/**
 * The picture-pan math for dragging, wheel-zooming and pinching a video's
 * framing in the preview (Picture mode, as opposed to dragging its box).
 *
 * Pan is stored as a -0.5..0.5 share of however far the picture overflows its
 * box - see `resolvePanOffset` in media-fit.ts, which resolves a stored pan
 * into pixels the same way this resolves a pixel drag back into pan. Dragging
 * by `deltaPx` moves the pan by `deltaPx / overscanPx` on that axis, and an
 * axis with no overscan (the picture doesn't overflow there, as with a
 * `contain` fit) does not move at all.
 */

const PAN_LIMIT = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampPan(value: number): number {
  return clamp(value, -PAN_LIMIT, PAN_LIMIT);
}

export interface OverscanInput {
  /** The mounted video's (or image's) natural size, in pixels. */
  sourceWidth: number;
  sourceHeight: number;
  /** The region's rendered size on screen, in pixels. */
  regionWidthPx: number;
  regionHeightPx: number;
  fit: "cover" | "contain";
  zoom: number;
}

/**
 * Less overflow than this is float noise, not room to pan. A take whose shape
 * matches its box fits it exactly, yet the fit's arithmetic can still leave a
 * remainder like 3e-14px, and dividing a drag by that sent the stored pan
 * straight to its limit while the picture visibly stayed put - until a later
 * zoom made the stored pan real and the picture jumped. Under half a pixel
 * nothing on screen can move, so it counts as no overflow at all.
 */
const MIN_OVERSCAN_PX = 0.5;

function overflowBeyond(drawnPx: number, regionPx: number): number {
  const overflow = drawnPx - regionPx;
  return overflow >= MIN_OVERSCAN_PX ? overflow : 0;
}

/**
 * How far the picture overflows its box on each axis, at this zoom. Zero on
 * an axis the picture never overflows (a `contain` fit, most of the time),
 * zero on an axis it overflows by less than half a pixel, and zero on both
 * when a size is missing (the video's metadata hasn't loaded).
 */
export function overscanPixels(input: OverscanInput): { x: number; y: number } {
  if (
    !(input.sourceWidth > 0) ||
    !(input.sourceHeight > 0) ||
    !(input.regionWidthPx > 0) ||
    !(input.regionHeightPx > 0)
  ) {
    return { x: 0, y: 0 };
  }
  const { drawRect } = calculateMediaFit({
    sourceWidth: input.sourceWidth,
    sourceHeight: input.sourceHeight,
    regionWidth: input.regionWidthPx,
    regionHeight: input.regionHeightPx,
    fit: input.fit,
  });
  return {
    x: overflowBeyond(drawRect.width * input.zoom, input.regionWidthPx),
    y: overflowBeyond(drawRect.height * input.zoom, input.regionHeightPx),
  };
}

export interface PicturePanDragInput extends OverscanInput {
  startPanX: number;
  startPanY: number;
  deltaXPx: number;
  deltaYPx: number;
}

export interface PicturePanDragResult {
  panX: number;
  panY: number;
}

/** The new pan after dragging the picture by (deltaXPx, deltaYPx) from
 *  (startPanX, startPanY). */
export function dragPicturePan(input: PicturePanDragInput): PicturePanDragResult {
  const overscan = overscanPixels(input);
  return {
    panX:
      overscan.x > 0
        ? clampPan(input.startPanX + input.deltaXPx / overscan.x)
        : input.startPanX,
    panY:
      overscan.y > 0
        ? clampPan(input.startPanY + input.deltaYPx / overscan.y)
        : input.startPanY,
  };
}

/** How far one arrow-key press pans the picture, as a share of its pan range. */
export const PICTURE_NUDGE = { step: 0.01, large: 0.1 } as const;

export interface PicturePanNudgeInput extends OverscanInput {
  panX: number;
  panY: number;
  /** -1, 0 or 1 on each axis: the way the arrow key points. */
  directionX: number;
  directionY: number;
  step: number;
}

/**
 * An arrow-key pan: the picture moves `step` of its pan range the way the
 * key points, as a drag that way would move it. An axis the picture does not
 * overflow stays put, as it does for a drag.
 */
export function nudgePicturePan(input: PicturePanNudgeInput): PicturePanDragResult {
  const overscan = overscanPixels(input);
  return {
    panX:
      overscan.x > 0 && input.directionX !== 0
        ? clampPan(input.panX + input.directionX * input.step)
        : input.panX,
    panY:
      overscan.y > 0 && input.directionY !== 0
        ? clampPan(input.panY + input.directionY * input.step)
        : input.panY,
  };
}

/**
 * A step of Ctrl/Cmd + wheel - which a trackpad pinch is reported as too - a
 * smooth, deltaY-proportional zoom with no pan change of its own. The
 * exponential keeps each wheel tick roughly the same relative change however
 * far in the zoom already is.
 */
const WHEEL_ZOOM_SENSITIVITY = 0.001;

export function zoomFromWheelDelta(
  currentZoom: number,
  deltaY: number,
  minZoom: number,
  maxZoom: number
): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return currentZoom;
  return clamp(
    currentZoom * Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY),
    minZoom,
    maxZoom
  );
}

export interface PinchStepInput extends OverscanInput {
  panX: number;
  panY: number;
  /** This step's finger-distance change: the new distance over the old. */
  distanceRatio: number;
  /** How far the midpoint between the two fingers moved this step. */
  midpointDeltaXPx: number;
  midpointDeltaYPx: number;
  minZoom: number;
  maxZoom: number;
}

export interface PinchStepResult {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * One step of a two-finger touch pinch: the fingers spreading or closing
 * zooms, and their midpoint moving pans, resolved at the resulting zoom's
 * overscan so the pan and the zoom feel like one continuous gesture.
 */
export function stepPicturePinch(input: PinchStepInput): PinchStepResult {
  const zoom =
    Number.isFinite(input.distanceRatio) && input.distanceRatio > 0
      ? clamp(input.zoom * input.distanceRatio, input.minZoom, input.maxZoom)
      : input.zoom;
  const panned = dragPicturePan({
    ...input,
    zoom,
    startPanX: input.panX,
    startPanY: input.panY,
    deltaXPx: input.midpointDeltaXPx,
    deltaYPx: input.midpointDeltaYPx,
  });
  return { zoom, panX: panned.panX, panY: panned.panY };
}
