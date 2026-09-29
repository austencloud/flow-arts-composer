import { turnOf } from "$lib/shared/media-composition/services/media-fit";
import {
  pictureScale,
  type CropCamera,
  type CropPoint,
  type CropPose,
  type CropSize,
} from "./post-crop-geometry";

/**
 * How the crop stage glides from one framing to the next. A press of Rotate,
 * a shape or Reset draws its framing at once; the picture then starts where
 * it was, by a translate, turn and scale about the window's centre that eases
 * away, and the frame starts where it was, so both travel to their places.
 *
 * Stage pixels, with y pointing down, so a positive turn is clockwise as CSS
 * draws it.
 */

/**
 * The picture on the stage: a footage point p, measured from the picture's
 * centre and mirrored first when `mirror`, lands at
 * `center + scale * R(rotation)(p)`.
 */
export interface StagePicture {
  center: CropPoint;
  /** Screen pixels per footage pixel. */
  scale: number;
  /** Degrees, positive clockwise. */
  rotation: number;
  mirror: boolean;
}

/**
 * A translate, turn and scale about a point, applied as CSS applies its
 * `translate`, `rotate` and `scale`; `mirror` flips across first.
 */
export interface StageTransform {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  mirror: boolean;
}

/** The frame on the stage: a box centred at `center`, turned by `rotation` degrees. */
export interface StageFrame {
  center: CropPoint;
  width: number;
  height: number;
  rotation: number;
}

/** A point turned by `degrees` about the origin, mirrored first when `mirror`. */
function turn(point: CropPoint, degrees: number, mirror = false): CropPoint {
  const { cos, sin } = turnOf(degrees);
  const x = mirror ? -point.x : point.x;
  return { x: cos * x - sin * point.y, y: sin * x + cos * point.y };
}

/** Where the pose draws the picture under the camera. */
export function stagePicture(
  pose: CropPose,
  camera: CropCamera,
  mirror: boolean
): StagePicture {
  return {
    center: camera.center,
    scale: camera.scale,
    rotation: pose.rotation,
    mirror,
  };
}

/** Where the pose draws the picture in a window box `width` pixels wide. */
export function boxPicture(
  pose: CropPose,
  box: { center: CropPoint; width: number },
  mirror: boolean
): StagePicture {
  const perOutput = box.width / pose.window.width;
  return {
    center: {
      x: box.center.x + perOutput * pose.offset.x,
      y: box.center.y + perOutput * pose.offset.y,
    },
    scale: perOutput * pictureScale(pose),
    rotation: pose.rotation,
    mirror,
  };
}

/** The picture as `transform`, applied about `origin`, shows it. */
export function transformPicture(
  picture: StagePicture,
  transform: StageTransform,
  origin: CropPoint
): StagePicture {
  const moved = turn(
    { x: picture.center.x - origin.x, y: picture.center.y - origin.y },
    transform.rotation,
    transform.mirror
  );
  return {
    center: {
      x: origin.x + transform.x + transform.scale * moved.x,
      y: origin.y + transform.y + transform.scale * moved.y,
    },
    scale: transform.scale * picture.scale,
    rotation:
      transform.rotation +
      (transform.mirror ? -picture.rotation : picture.rotation),
    mirror: transform.mirror !== picture.mirror,
  };
}

/** `degrees` give or take whole turns, as near `near` as it comes. */
function nearestTurn(degrees: number, near: number): number {
  return degrees + 360 * Math.round((near - degrees) / 360);
}

/**
 * The transform about `origin` that shows the picture drawn at `to` where
 * it was at `from`: a glide starts from it and eases to none. It turns the
 * short way, or on the way a glide in flight, `turning` degrees from its
 * end, already turns.
 */
export function glideStart(
  from: StagePicture,
  to: StagePicture,
  origin: CropPoint,
  turning = 0
): StageTransform {
  const mirror = from.mirror !== to.mirror;
  const rotation = nearestTurn(
    mirror ? from.rotation + to.rotation : from.rotation - to.rotation,
    turning
  );
  const scale = from.scale / to.scale;
  const moved = turn(
    { x: origin.x - to.center.x, y: origin.y - to.center.y },
    rotation,
    mirror
  );
  return {
    x: from.center.x + scale * moved.x - origin.x,
    y: from.center.y + scale * moved.y - origin.y,
    rotation,
    scale,
    mirror,
  };
}

/** Whether the frame is nearer the shape it glides to on its side than upright. */
function turnsInto(from: StageFrame, to: CropSize): boolean {
  const target = Math.log(to.width / to.height);
  const upright = Math.abs(Math.log(from.width / from.height) - target);
  const onSide = Math.abs(Math.log(from.height / from.width) - target);
  return onSide <= upright;
}

/**
 * Where a frame's glide starts: where the frame is now, in the shape of the
 * frame it glides to. A window that turned with the picture, its sides
 * swapped as the picture turned a quarter, turns with it; any other frame
 * only moves and resizes, whatever the picture does inside it.
 */
export function frameGlideStart(
  from: StageFrame,
  to: CropSize,
  turning: number
): StageFrame {
  const quarters = Math.round((turning - from.rotation) / 90);
  if (quarters % 2 === 0 || !turnsInto(from, to)) return from;
  return {
    center: from.center,
    width: from.height,
    height: from.width,
    rotation: from.rotation + 90 * quarters,
  };
}

function numbersOf(value: string): number[] {
  if (!value || value === "none") return [];
  return value
    .trim()
    .split(/\s+/)
    .map((part) => Number.parseFloat(part))
    .filter(Number.isFinite);
}

/**
 * The `translate`, `rotate` and `scale` a computed style holds. A scale
 * squeezed across mid-flip reads as the nearer mirror at its height's size.
 */
export function transformOfStyle(
  style: Pick<CSSStyleDeclaration, "translate" | "rotate" | "scale">
): StageTransform {
  const [x = 0, y = 0] = numbersOf(style.translate);
  const [scaleX = 1, scaleY = scaleX] = numbersOf(style.scale);
  return {
    x,
    y,
    rotation: numbersOf(style.rotate).at(-1) ?? 0,
    scale: Math.abs(scaleY),
    mirror: scaleX < 0,
  };
}
