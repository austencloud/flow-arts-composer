import {
  POST_MAX_ZOOM,
  POST_MIN_ZOOM,
  POST_SHAPE_RATIO_MAX,
  POST_SHAPE_RATIO_MIN,
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
 * The crop screen's geometry: where the stage shows the whole picture and the
 * window over it, how far the picture may move before the window shows a
 * gap, and what dragging, pinching, turning and cropping from a corner or a
 * side do to a clip's framing. The picture holds still under a gesture and
 * the frame moves over it.
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

// ---- The camera on the stage ------------------------------------------------

export const CROP_STAGE_MARGIN_PX = 24;

/**
 * Screen pixels per output pixel for the largest window the stage holds,
 * for the moment before the footage's size is known.
 */
export function cropWindowScale(input: {
  stage: CropSize;
  window: CropSize;
  margin?: number;
}): number {
  const margin = input.margin ?? CROP_STAGE_MARGIN_PX;
  return Math.min(
    Math.max(1, input.stage.width - 2 * margin) / input.window.width,
    Math.max(1, input.stage.height - 2 * margin) / input.window.height
  );
}

/**
 * How the crop stage shows the footage: the whole picture, held still, with
 * the window moving over it. `scale` is screen pixels per footage pixel and
 * `center` is the picture's centre on the stage.
 */
export interface CropCamera {
  scale: number;
  center: CropPoint;
}

/** Output pixels per footage pixel, as the pose draws the picture. */
function pictureScale(pose: CropPose): number {
  return (pose.draw.width * pose.zoom) / pose.source.width;
}

/** The turned picture and the window together, in footage pixels from the picture's centre. */
function shownBounds(pose: CropPose) {
  const perSource = pictureScale(pose);
  const extent = turnedExtent(pose.source.width, pose.source.height, pose.rotation);
  const windowX = -pose.offset.x / perSource;
  const windowY = -pose.offset.y / perSource;
  const halfWidth = pose.window.width / (2 * perSource);
  const halfHeight = pose.window.height / (2 * perSource);
  return {
    left: Math.min(-extent.width / 2, windowX - halfWidth),
    right: Math.max(extent.width / 2, windowX + halfWidth),
    top: Math.min(-extent.height / 2, windowY - halfHeight),
    bottom: Math.max(extent.height / 2, windowY + halfHeight),
  };
}

/** Width over height of what the crop stage shows: the picture and the window. */
function shownRatio(pose: CropPose): number {
  const { left, right, top, bottom } = shownBounds(pose);
  return (right - left) / (bottom - top);
}

/**
 * Width over height of a crop stage with room for the pose straightened any
 * amount, so the crop screen can keep one stage while it is open and nothing
 * beside it moves. A turned picture is widest for its height either upright
 * or at the straighten limit. Another quarter turn is left out: the camera
 * fits it inside the stage.
 */
export function cropStageRatio(pose: CropPose, quarter: number): number {
  return Math.max(
    shownRatio(pose),
    shownRatio({ ...pose, rotation: joinRotation(quarter, 0) }),
    shownRatio({ ...pose, rotation: joinRotation(quarter, STRAIGHTEN_LIMIT) })
  );
}

/**
 * The camera that shows the whole turned picture and the window together,
 * as large as the stage allows, centred on the stage.
 */
export function cropCamera(input: {
  stage: CropSize;
  pose: CropPose;
  margin?: number;
}): CropCamera {
  const { stage, pose } = input;
  const margin = input.margin ?? CROP_STAGE_MARGIN_PX;
  const { left, right, top, bottom } = shownBounds(pose);
  const scale = Math.min(
    Math.max(1, stage.width - 2 * margin) / (right - left),
    Math.max(1, stage.height - 2 * margin) / (bottom - top)
  );
  return {
    scale,
    center: {
      x: stage.width / 2 - (scale * (left + right)) / 2,
      y: stage.height / 2 - (scale * (top + bottom)) / 2,
    },
  };
}

/** Screen pixels per output pixel for the pose under the camera. */
export function cameraDisplayScale(pose: CropPose, camera: CropCamera): number {
  return camera.scale / pictureScale(pose);
}

/** The window's centre on the stage, in screen pixels. */
export function cameraWindowCenter(pose: CropPose, camera: CropCamera): CropPoint {
  const scale = cameraDisplayScale(pose, camera);
  return {
    x: camera.center.x - pose.offset.x * scale,
    y: camera.center.y - pose.offset.y * scale,
  };
}

// ---- Moving and sizing the frame --------------------------------------------

/**
 * The pose once the window becomes a frame centred at `center` and `scale`
 * times its size (in output pixels from the window's centre): what the frame
 * holds then fills the window. A drag, a pinch and a corner all come to this.
 */
export function framePose(pose: CropPose, center: CropPoint, scale: number): CropPose {
  return {
    ...pose,
    zoom: clampZoom(pose.zoom / scale),
    offset: {
      x: (pose.offset.x - center.x) / scale,
      y: (pose.offset.y - center.y) / scale,
    },
  };
}

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

export function isCropSide(handle: CropHandle): handle is CropSide {
  const sign = HANDLE_SIGNS[handle];
  return sign.x === 0 || sign.y === 0;
}

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

/**
 * The frame a handle drag has made: its centre and size, in output pixels.
 * A `free` side moves only its own edge, so the frame changes shape.
 */
export function handleFrame(
  window: CropSize,
  handle: CropHandle,
  scale: number,
  free = false
): { center: CropPoint; width: number; height: number } {
  const { sign, anchor, span } = handleAxes(window, handle);
  if (free && isCropSide(handle)) {
    return sign.x !== 0
      ? {
          center: { x: anchor.x + (scale * span.x) / 2, y: 0 },
          width: window.width * scale,
          height: window.height,
        }
      : {
          center: { x: 0, y: anchor.y + (scale * span.y) / 2 },
          width: window.width,
          height: window.height * scale,
        };
  }
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

/** The frame's corners as `from + scale * by`, from the window's centre. */
function frameCorners(
  window: CropSize,
  handle: CropHandle,
  free: boolean
): { from: CropPoint; by: CropPoint }[] {
  const { sign, anchor, span } = handleAxes(window, handle);
  const corners: { from: CropPoint; by: CropPoint }[] = [];
  for (const across of [-1, 1]) {
    for (const down of [-1, 1]) {
      const halfX = (across * window.width) / 2;
      const halfY = (down * window.height) / 2;
      if (free && isCropSide(handle)) {
        // The pulled edge moves; the frame keeps its other side.
        corners.push(
          sign.x !== 0
            ? { from: { x: anchor.x, y: halfY }, by: { x: span.x / 2 + halfX, y: 0 } }
            : { from: { x: halfX, y: anchor.y }, by: { x: 0, y: span.y / 2 + halfY } }
        );
      } else {
        corners.push({
          from: anchor,
          by: { x: span.x / 2 + halfX, y: span.y / 2 + halfY },
        });
      }
    }
  }
  return corners;
}

/** The largest frame whose corners all stay on the picture. */
function coverScaleLimit(pose: CropPose, handle: CropHandle, free: boolean): number {
  const halfWidth = (pose.draw.width * pose.zoom) / 2;
  const halfHeight = (pose.draw.height * pose.zoom) / 2;
  let limit = Number.POSITIVE_INFINITY;
  for (const { from, by } of frameCorners(pose.window, handle, free)) {
    const start = turn(
      { x: from.x - pose.offset.x, y: from.y - pose.offset.y },
      -pose.rotation
    );
    const step = turn(by, -pose.rotation);
    for (const [at, move, half] of [
      [start.x, step.x, halfWidth],
      [start.y, step.y, halfHeight],
    ] as const) {
      if (move > 1e-12) limit = Math.min(limit, (half - at) / move);
      else if (move < -1e-12) limit = Math.min(limit, (half + at) / -move);
    }
  }
  return Math.max(1, limit);
}

/**
 * How far the frame may grow along one axis before an edge leaves the stage:
 * from its fixed edge when that axis is pulled, from its middle both ways
 * when it is not. `middle` and `half` are the window's, in screen pixels.
 */
function stageRoom(size: number, middle: number, half: number, pulled: number): number {
  if (pulled > 0) return (size - middle + half) / (2 * half);
  if (pulled < 0) return (middle + half) / (2 * half);
  return Math.min(middle, size - middle) / half;
}

/**
 * How small and large a handle drag may make the frame, as a share of the
 * window. Smaller crops closer and ends in more zoom, so the zoom limits
 * bound both ends; the frame stays on the stage and, under `cover`, on the
 * picture. A free side also keeps the frame within the shapes a clip takes.
 */
export function handleScaleRange(input: {
  pose: CropPose;
  handle: CropHandle;
  limit: CropLimit;
  /** Screen pixels per output pixel. */
  displayScale: number;
  /** The stage, in screen pixels. */
  stage: CropSize;
  /** The window's centre on the stage; the stage's centre when absent. */
  center?: CropPoint;
  /** A side moves only its own edge, changing the frame's shape. */
  free?: boolean;
}): { min: number; max: number } {
  const { pose, handle, displayScale, stage } = input;
  const { sign } = handleAxes(pose.window, handle);
  const free = input.free === true && isCropSide(handle);
  const center = input.center ?? { x: stage.width / 2, y: stage.height / 2 };
  const halfWidth = (pose.window.width * displayScale) / 2;
  const halfHeight = (pose.window.height * displayScale) / 2;
  const roomX = stageRoom(stage.width, center.x, halfWidth, sign.x);
  const roomY = stageRoom(stage.height, center.y, halfHeight, sign.y);
  let smallest: number;
  let largest: number;
  if (free) {
    const alongX = sign.x !== 0;
    const length = alongX ? pose.window.width : pose.window.height;
    const other = alongX ? pose.window.height : pose.window.width;
    // A frame's zoom is the picture over the frame on the axis the fit
    // matches: the smaller share for Fill, the larger for Show all.
    const pulledShare = ((alongX ? pose.draw.width : pose.draw.height) * pose.zoom) / length;
    const otherShare = ((alongX ? pose.draw.height : pose.draw.width) * pose.zoom) / other;
    const cover = pose.fit === "cover";
    const zoomLow = cover && otherShare <= POST_MAX_ZOOM ? 0 : pulledShare / POST_MAX_ZOOM;
    const zoomHigh =
      !cover && otherShare >= POST_MIN_ZOOM
        ? Number.POSITIVE_INFINITY
        : pulledShare / POST_MIN_ZOOM;
    // Width over height stays within the shapes a clip takes.
    const shapeLow = alongX
      ? (POST_SHAPE_RATIO_MIN * other) / length
      : length / (POST_SHAPE_RATIO_MAX * other);
    const shapeHigh = alongX
      ? (POST_SHAPE_RATIO_MAX * other) / length
      : length / (POST_SHAPE_RATIO_MIN * other);
    smallest = Math.max(zoomLow, shapeLow, CROP_MIN_WINDOW_PX / (length * displayScale));
    largest = Math.min(zoomHigh, shapeHigh, alongX ? roomX : roomY);
  } else {
    const shortSide = Math.min(pose.window.width, pose.window.height) * displayScale;
    smallest = Math.max(pose.zoom / POST_MAX_ZOOM, CROP_MIN_WINDOW_PX / shortSide);
    largest = Math.min(pose.zoom / POST_MIN_ZOOM, roomX, roomY);
  }
  if (input.limit === "cover") largest = Math.min(largest, coverScaleLimit(pose, handle, free));
  return { min: Math.min(1, smallest), max: Math.max(1, largest) };
}

/** A corner or side held at `scale`: the frame it has made becomes the window. */
export function handlePose(pose: CropPose, handle: CropHandle, scale: number): CropPose {
  return framePose(pose, handleFrame(pose.window, handle, scale).center, scale);
}

/**
 * A free side held at `scale`: the window takes the frame's new shape at
 * `window`'s size (the largest of that shape the clip's box holds), and what
 * the frame holds fills it.
 */
export function reshapePose(
  pose: CropPose,
  handle: CropHandle,
  scale: number,
  window: CropSize
): CropPose {
  const frame = handleFrame(pose.window, handle, scale, true);
  const grow = window.width / frame.width;
  const draw = fittedDraw(pose.source, window, pose.fit);
  return {
    ...pose,
    window,
    draw,
    zoom: clampZoom((pose.draw.width * pose.zoom * grow) / draw.width),
    offset: {
      x: (pose.offset.x - frame.center.x) * grow,
      y: (pose.offset.y - frame.center.y) * grow,
    },
  };
}
