import {
  POST_MAX_ZOOM,
  POST_MIN_ZOOM,
  wrapDegrees,
  type PostFraming,
} from "$lib/shared/media-composition/domain/post-project";
import {
  calculateMediaFit,
  resolvePanOffset,
  turnOf,
  turnedExtent,
} from "$lib/shared/media-composition/services/media-fit";

/**
 * The crop screen's geometry: how large the slot's window shows on the stage,
 * how far the picture may move before the window shows a gap, and what
 * dragging, pinching, turning and cropping from a corner or a side do to a
 * clip's framing.
 *
 * Everything is in output pixels, with the origin at the window's centre and
 * y pointing down, so a positive turn is clockwise as CSS draws it. A picture
 * point p, measured from the picture's centre at zoom 1, lands at
 * `offset + R(rotation)(zoom * p)`: the translate, rotate and scale that the
 * preview and the export both apply.
 */

export type CropFit = "cover" | "contain";

export interface CropSize {
  width: number;
  height: number;
}

export interface CropPoint {
  x: number;
  y: number;
}

export interface CropPose {
  /** The slot, in output pixels. */
  window: CropSize;
  /** The footage's natural size. */
  source: CropSize;
  fit: CropFit;
  /** The picture's fitted size at zoom 1, in output pixels. */
  draw: CropSize;
  zoom: number;
  /** Degrees, positive clockwise. */
  rotation: number;
  /** The picture centre's offset from the window centre, in output pixels. */
  offset: CropPoint;
}

/**
 * What stops a move. `cover` keeps the window filled, and applies in Fill once
 * the window is filled. `range` is the stored pan's own reach: a share of how
 * far the turned picture overflows the window.
 */
export type CropLimit = "cover" | "range";

const ORIGIN: CropPoint = { x: 0, y: 0 };

/** Coverage checks allow this much float noise, in output pixels. */
export const COVER_TOLERANCE_PX = 1e-3;

/** Less overflow than this cannot move anything on screen (see post-picture-pan-drag). */
const MIN_OVERFLOW_PX = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampZoom(zoom: number, floor = POST_MIN_ZOOM): number {
  return clamp(zoom, Math.max(POST_MIN_ZOOM, floor), POST_MAX_ZOOM);
}

function isSize(size: CropSize | null | undefined): size is CropSize {
  return (
    !!size &&
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0
  );
}

/** A point turned by `degrees` about the origin, clockwise with y down. */
function turn(point: CropPoint, degrees: number): CropPoint {
  const { cos, sin } = turnOf(degrees);
  return {
    x: cos * point.x - sin * point.y,
    y: sin * point.x + cos * point.y,
  };
}

function fittedDraw(source: CropSize, window: CropSize, fit: CropFit): CropSize {
  const { drawRect } = calculateMediaFit({
    sourceWidth: source.width,
    sourceHeight: source.height,
    regionWidth: window.width,
    regionHeight: window.height,
    fit,
  });
  return { width: drawRect.width, height: drawRect.height };
}

/** A clip's framing as a pose, or null while a size is still unknown. */
export function cropPoseOf(input: {
  framing: PostFraming;
  fit: CropFit;
  window: CropSize;
  source: CropSize | null | undefined;
}): CropPose | null {
  const { framing, fit, window, source } = input;
  if (!isSize(window) || !isSize(source)) return null;
  const draw = fittedDraw(source, window, fit);
  const offset = resolvePanOffset({
    drawWidth: draw.width,
    drawHeight: draw.height,
    regionWidth: window.width,
    regionHeight: window.height,
    scale: framing.zoom,
    translateX: framing.panX,
    translateY: framing.panY,
    rotationDegrees: framing.rotation,
  });
  return {
    window,
    source,
    fit,
    draw,
    zoom: framing.zoom,
    rotation: framing.rotation,
    offset,
  };
}

/** How far the turned picture reaches past the window on each axis. */
export function overflowOf(pose: CropPose): CropSize {
  const extent = turnedExtent(
    pose.draw.width * pose.zoom,
    pose.draw.height * pose.zoom,
    pose.rotation
  );
  return {
    width: Math.max(0, extent.width - pose.window.width),
    height: Math.max(0, extent.height - pose.window.height),
  };
}

function panShare(offset: number, overflow: number): number {
  return overflow >= MIN_OVERFLOW_PX ? clamp(offset / overflow, -0.5, 0.5) : 0;
}

/** The framing a pose stores: the offset as a share of the overflow. */
export function framingOfPose(pose: CropPose): PostFraming {
  const overflow = overflowOf(pose);
  return {
    zoom: clampZoom(pose.zoom),
    panX: panShare(pose.offset.x, overflow.width),
    panY: panShare(pose.offset.y, overflow.height),
    rotation: wrapDegrees(pose.rotation),
  };
}

/** True when two framings would draw the same picture. */
export function sameFraming(a: PostFraming, b: PostFraming, tolerance = 1e-9): boolean {
  return (
    Math.abs(a.zoom - b.zoom) <= tolerance &&
    Math.abs(a.panX - b.panX) <= tolerance &&
    Math.abs(a.panY - b.panY) <= tolerance &&
    Math.abs(wrapDegrees(a.rotation - b.rotation)) <= tolerance
  );
}

/**
 * The zoom at which the picture, centred and turned by `rotation`, just
 * covers the window. A Fill picture at 0 degrees needs exactly 1.
 */
export function coverZoom(
  pose: Pick<CropPose, "window" | "draw" | "rotation">,
  rotation = pose.rotation
): number {
  const { cos, sin } = turnOf(rotation);
  const c = Math.abs(cos);
  const s = Math.abs(sin);
  const { width, height } = pose.window;
  return Math.max(
    (width * c + height * s) / pose.draw.width,
    (width * s + height * c) / pose.draw.height
  );
}

/**
 * How far the picture's centre may sit from the window's, along the
 * picture's own axes, with every window corner still on the picture.
 * Negative on an axis where no position covers the window.
 */
function coverageSlack(pose: CropPose): CropPoint {
  const { cos, sin } = turnOf(pose.rotation);
  const c = Math.abs(cos);
  const s = Math.abs(sin);
  const halfWidth = pose.window.width / 2;
  const halfHeight = pose.window.height / 2;
  return {
    x: (pose.draw.width * pose.zoom) / 2 - (halfWidth * c + halfHeight * s),
    y: (pose.draw.height * pose.zoom) / 2 - (halfWidth * s + halfHeight * c),
  };
}

/** True when the picture covers the whole window. */
export function isCovered(pose: CropPose, tolerance = COVER_TOLERANCE_PX): boolean {
  const slack = coverageSlack(pose);
  const inPicture = turn(pose.offset, -pose.rotation);
  return (
    Math.abs(inPicture.x) <= slack.x + tolerance &&
    Math.abs(inPicture.y) <= slack.y + tolerance
  );
}

/**
 * The nearest position that covers the window. Where no position can (the
 * zoom is below `coverZoom`), that axis is centred.
 */
export function clampToCoverage(pose: CropPose): CropPose {
  const slack = coverageSlack(pose);
  const inPicture = turn(pose.offset, -pose.rotation);
  const limitX = Math.max(0, slack.x);
  const limitY = Math.max(0, slack.y);
  const clamped = {
    x: clamp(inPicture.x, -limitX, limitX),
    y: clamp(inPicture.y, -limitY, limitY),
  };
  return { ...pose, offset: turn(clamped, pose.rotation) };
}

/** The nearest position the stored pan can reach. */
export function clampToPanRange(pose: CropPose): CropPose {
  const overflow = overflowOf(pose);
  const reachX = overflow.width >= MIN_OVERFLOW_PX ? overflow.width / 2 : 0;
  const reachY = overflow.height >= MIN_OVERFLOW_PX ? overflow.height / 2 : 0;
  return {
    ...pose,
    offset: {
      x: clamp(pose.offset.x, -reachX, reachX),
      y: clamp(pose.offset.y, -reachY, reachY),
    },
  };
}

export function limitPose(pose: CropPose, limit: CropLimit): CropPose {
  return limit === "cover" ? clampToCoverage(pose) : clampToPanRange(pose);
}

/**
 * The limit for a change from `before` to `after`. Fill keeps the window
 * filled once it is filled; a window that already shows a gap (an older
 * framing, or Show all) keeps the pan's own reach, so a drag never jumps.
 */
export function cropLimitFor(before: CropPose, after: CropPose = before): CropLimit {
  return before.fit === "cover" &&
    isCovered(before) &&
    after.zoom * (1 + 1e-9) >= coverZoom(after)
    ? "cover"
    : "range";
}

/** The lowest zoom a gesture may reach under this limit. */
export function zoomFloor(pose: CropPose, limit: CropLimit): number {
  return limit === "cover" ? clampZoom(coverZoom(pose)) : POST_MIN_ZOOM;
}

/**
 * How much of a pull past a limit still shows: less and less the further
 * it goes, and never more than `range`.
 */
export function rubberBand(distance: number, range: number): number {
  if (!(range > 0) || !Number.isFinite(distance) || distance === 0) return 0;
  const magnitude = (1 - 1 / ((Math.abs(distance) * 0.55) / range + 1)) * range;
  return Math.sign(distance) * magnitude;
}

/**
 * The part of a move past its limit that still shows, rubber-banded along
 * the limit's own axes: the picture's for `cover`, the window's for `range`.
 */
export function overshootOf(
  raw: CropPose,
  limited: CropPose,
  limit: CropLimit,
  range: number
): CropPoint {
  const past = {
    x: raw.offset.x - limited.offset.x,
    y: raw.offset.y - limited.offset.y,
  };
  if (limit === "range") {
    return { x: rubberBand(past.x, range), y: rubberBand(past.y, range) };
  }
  const inPicture = turn(past, -limited.rotation);
  return turn(
    { x: rubberBand(inPicture.x, range), y: rubberBand(inPicture.y, range) },
    limited.rotation
  );
}

export function movePose(pose: CropPose, delta: CropPoint): CropPose {
  return {
    ...pose,
    offset: { x: pose.offset.x + delta.x, y: pose.offset.y + delta.y },
  };
}

/** Zoomed so the picture point under `anchor` stays under it. */
export function zoomPoseAbout(
  pose: CropPose,
  zoom: number,
  anchor: CropPoint = ORIGIN,
  floor = POST_MIN_ZOOM
): CropPose {
  const next = clampZoom(zoom, floor);
  const ratio = next / pose.zoom;
  return {
    ...pose,
    zoom: next,
    offset: {
      x: anchor.x - ratio * (anchor.x - pose.offset.x),
      y: anchor.y - ratio * (anchor.y - pose.offset.y),
    },
  };
}

/**
 * A two-finger pinch, from where it started: the fingers' spread scales the
 * picture about their first midpoint, and the midpoint's travel moves it.
 */
export function pinchPose(
  start: CropPose,
  input: { startMidpoint: CropPoint; midpoint: CropPoint; spread: number; floor?: number }
): CropPose {
  const spread = Number.isFinite(input.spread) && input.spread > 0 ? input.spread : 1;
  const zoom = clampZoom(start.zoom * spread, input.floor);
  const ratio = zoom / start.zoom;
  return {
    ...start,
    zoom,
    offset: {
      x: input.midpoint.x - ratio * (input.startMidpoint.x - start.offset.x),
      y: input.midpoint.y - ratio * (input.startMidpoint.y - start.offset.y),
    },
  };
}

/**
 * Turned about the window's centre, which keeps what is there. In Fill the
 * zoom follows the turn by `coverZoom`, so a covered window stays covered and
 * turning back restores the zoom; Show all keeps its zoom.
 */
export function turnPose(pose: CropPose, rotation: number): CropPose {
  const zoom =
    pose.fit === "cover"
      ? clampZoom((pose.zoom * coverZoom(pose, rotation)) / coverZoom(pose))
      : pose.zoom;
  const ratio = zoom / pose.zoom;
  const turned = turn(pose.offset, rotation - pose.rotation);
  return {
    ...pose,
    zoom,
    rotation: wrapDegrees(rotation),
    offset: { x: ratio * turned.x, y: ratio * turned.y },
  };
}

/** The same framing drawn with another fit; the stored pan share is kept. */
export function withFit(pose: CropPose, fit: CropFit): CropPose {
  if (fit === pose.fit) return pose;
  return cropPoseOf({
    framing: framingOfPose(pose),
    fit,
    window: pose.window,
    source: pose.source,
  })!;
}

/** Fill: zoomed up to cover the window if it has to be, then moved to cover it. */
export function fillPose(pose: CropPose): CropPose {
  const filled = withFit(pose, "cover");
  const cover = coverZoom(filled);
  const zoomed = filled.zoom < cover ? zoomPoseAbout(filled, cover) : filled;
  return clampToCoverage(zoomed);
}

// ---- Turning in two parts: quarter turns and straighten --------------------

export const STRAIGHTEN_LIMIT = 45;
const SPLIT_EPSILON = 1e-9;

export interface RotationParts {
  /** Quarter turns, -2..2 (90 degrees each, positive clockwise). */
  quarter: number;
  /** The rest, -45..45 degrees. */
  straighten: number;
}

/**
 * A stored turn as quarter turns plus a straighten. At exactly 45 degrees
 * past a quarter either reading is true; `hint` (the quarter the controls are
 * showing) keeps the straighten from jumping to the other end of its range.
 */
export function splitRotation(rotation: number, hint?: number | null): RotationParts {
  const turned = wrapDegrees(rotation);
  if (typeof hint === "number" && Number.isInteger(hint)) {
    const straighten = wrapDegrees(turned - 90 * hint);
    if (Math.abs(straighten) <= STRAIGHTEN_LIMIT + SPLIT_EPSILON) {
      return {
        quarter: hint,
        straighten: clamp(straighten, -STRAIGHTEN_LIMIT, STRAIGHTEN_LIMIT),
      };
    }
  }
  const quarter =
    Math.sign(turned) *
    Math.floor((Math.abs(turned) + STRAIGHTEN_LIMIT - SPLIT_EPSILON) / 90);
  // `+ 0` turns a -0 from Math.sign into 0.
  return { quarter: quarter + 0, straighten: turned - 90 * quarter };
}

export function joinRotation(quarter: number, straighten: number): number {
  return wrapDegrees(90 * quarter + straighten);
}

/** One quarter turn anticlockwise, kept within -2..2. */
export function quarterLeft(quarter: number): number {
  const next = quarter - 1;
  return next < -2 ? next + 4 : next;
}

// ---- The window on the stage ------------------------------------------------

export const CROP_STAGE_MARGIN_PX = 24;
/** The window never shows smaller than this share of the largest it could be. */
export const CROP_WINDOW_FLOOR = 0.6;

/**
 * Screen pixels per output pixel for the crop window: as large as the stage
 * allows while the whole picture around the window still fits, but never
 * below `CROP_WINDOW_FLOOR` of the largest window the stage could hold.
 */
export function cropWindowScale(input: {
  stage: CropSize;
  window: CropSize;
  pose?: CropPose | null;
  margin?: number;
  floor?: number;
}): number {
  const margin = input.margin ?? CROP_STAGE_MARGIN_PX;
  const roomWidth = Math.max(1, input.stage.width - 2 * margin);
  const roomHeight = Math.max(1, input.stage.height - 2 * margin);
  const largest = Math.min(
    roomWidth / input.window.width,
    roomHeight / input.window.height
  );
  const pose = input.pose;
  if (!pose) return largest;
  const extent = turnedExtent(
    pose.draw.width * pose.zoom,
    pose.draw.height * pose.zoom,
    pose.rotation
  );
  const halfWidth = Math.max(
    pose.window.width / 2,
    Math.abs(pose.offset.x) + extent.width / 2
  );
  const halfHeight = Math.max(
    pose.window.height / 2,
    Math.abs(pose.offset.y) + extent.height / 2
  );
  const whole = Math.min(roomWidth / (2 * halfWidth), roomHeight / (2 * halfHeight));
  return Math.min(largest, Math.max(whole, (input.floor ?? CROP_WINDOW_FLOOR) * largest));
}

// ---- Frame handles -------------------------------------------------------------

export type CropCorner = "nw" | "ne" | "sw" | "se";
export type CropSide = "n" | "e" | "s" | "w";
/** A corner or a side of the frame, dragged to crop closer or wider. */
export type CropHandle = CropCorner | CropSide;

export const CROP_CORNERS: readonly CropCorner[] = ["nw", "ne", "sw", "se"];
export const CROP_SIDES: readonly CropSide[] = ["n", "e", "s", "w"];

/** Which way each handle points from the frame's centre. */
const HANDLE_SIGNS: Record<CropHandle, CropPoint> = {
  nw: { x: -1, y: -1 },
  ne: { x: 1, y: -1 },
  sw: { x: -1, y: 1 },
  se: { x: 1, y: 1 },
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
};

/** A frame smaller than this on screen is too small to judge a crop by. */
export const CROP_MIN_WINDOW_PX = 48;

/**
 * The point that stays put, and the line from it to the dragged handle. A
 * corner drags along the diagonal from the opposite corner; a side drags
 * straight out from the middle of the opposite side, and the frame keeps
 * its shape by growing or shrinking evenly along that side.
 */
function handleAxes(window: CropSize, handle: CropHandle) {
  const sign = HANDLE_SIGNS[handle];
  return {
    sign,
    anchor: { x: (-sign.x * window.width) / 2, y: (-sign.y * window.height) / 2 },
    span: { x: sign.x * window.width, y: sign.y * window.height },
  };
}

/** Where the dragged handle sits when the frame is `scale` times the window. */
export function handlePoint(window: CropSize, handle: CropHandle, scale: number): CropPoint {
  const { anchor, span } = handleAxes(window, handle);
  return { x: anchor.x + scale * span.x, y: anchor.y + scale * span.y };
}

/** The frame a handle drag has made: its centre and size, in output pixels. */
export function handleFrame(
  window: CropSize,
  handle: CropHandle,
  scale: number
): { center: CropPoint; width: number; height: number } {
  const { anchor, span } = handleAxes(window, handle);
  return {
    center: { x: anchor.x + (scale * span.x) / 2, y: anchor.y + (scale * span.y) / 2 },
    width: window.width * scale,
    height: window.height * scale,
  };
}

/** The scale a handle at `point` asks for: `point` projected onto its line. */
export function handleScaleAt(window: CropSize, handle: CropHandle, point: CropPoint): number {
  const { anchor, span } = handleAxes(window, handle);
  return (
    ((point.x - anchor.x) * span.x + (point.y - anchor.y) * span.y) /
    (span.x * span.x + span.y * span.y)
  );
}

/** The largest frame whose corners all stay on the picture. */
function coverScaleLimit(pose: CropPose, handle: CropHandle): number {
  const { anchor, span } = handleAxes(pose.window, handle);
  const halfWidth = (pose.draw.width * pose.zoom) / 2;
  const halfHeight = (pose.draw.height * pose.zoom) / 2;
  const start = turn(
    { x: anchor.x - pose.offset.x, y: anchor.y - pose.offset.y },
    -pose.rotation
  );
  let limit = Number.POSITIVE_INFINITY;
  // The frame's corners sit at anchor + scale * (span / 2 +- half the window).
  for (const across of [-1, 1]) {
    for (const down of [-1, 1]) {
      const corner = {
        x: span.x / 2 + (across * pose.window.width) / 2,
        y: span.y / 2 + (down * pose.window.height) / 2,
      };
      const step = turn(corner, -pose.rotation);
      for (const [from, by, half] of [
        [start.x, step.x, halfWidth],
        [start.y, step.y, halfHeight],
      ] as const) {
        if (by > 1e-12) limit = Math.min(limit, (half - from) / by);
        else if (by < -1e-12) limit = Math.min(limit, (half + from) / -by);
      }
    }
  }
  return Math.max(1, limit);
}

/**
 * How small and large a handle drag may make the frame, as a share of the
 * window. Smaller crops closer and ends in more zoom, so the zoom limits
 * bound both ends; the frame stays on the stage and, under `cover`, on the
 * picture.
 */
export function handleScaleRange(input: {
  pose: CropPose;
  handle: CropHandle;
  limit: CropLimit;
  /** Screen pixels per output pixel. */
  displayScale: number;
  /** The stage, in screen pixels, centred on the window. */
  stage: CropSize;
}): { min: number; max: number } {
  const { pose, handle, displayScale } = input;
  const { sign } = handleAxes(pose.window, handle);
  const shortSide = Math.min(pose.window.width, pose.window.height) * displayScale;
  const smallest = Math.max(pose.zoom / POST_MAX_ZOOM, CROP_MIN_WINDOW_PX / shortSide);
  // Along a dragged axis the frame grows from one edge; along a side's
  // other axis it grows from the middle, both ways.
  const room = (stage: number, half: number, pulled: number) => {
    const ratio = stage / (2 * displayScale) / half;
    return pulled === 0 ? ratio : (ratio + 1) / 2;
  };
  let largest = Math.min(
    pose.zoom / POST_MIN_ZOOM,
    room(input.stage.width, pose.window.width / 2, sign.x),
    room(input.stage.height, pose.window.height / 2, sign.y)
  );
  if (input.limit === "cover") largest = Math.min(largest, coverScaleLimit(pose, handle));
  return { min: Math.min(1, smallest), max: Math.max(1, largest) };
}

/**
 * What a handle drag leaves when released: the frame becomes the window, and
 * the picture scales and moves so that what the frame held fills it.
 */
export function releaseHandle(pose: CropPose, handle: CropHandle, scale: number): CropPose {
  const { center } = handleFrame(pose.window, handle, scale);
  return {
    ...pose,
    zoom: clampZoom(pose.zoom / scale),
    offset: {
      x: (pose.offset.x - center.x) / scale,
      y: (pose.offset.y - center.y) / scale,
    },
  };
}

/**
 * The move and scale, about the window's centre, that draw `after` where
 * `before` was. Easing it to nothing animates one into the other.
 */
export function settleTransform(
  before: CropPose,
  after: CropPose
): { scale: number; x: number; y: number } {
  const scale = before.zoom / after.zoom;
  return {
    scale,
    x: before.offset.x - scale * after.offset.x,
    y: before.offset.y - scale * after.offset.y,
  };
}
