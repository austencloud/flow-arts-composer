import type { PostSourceGeometry } from "$lib/shared/media-composition/domain/post-project";
import type { BoxHandle } from "./post-box-drag";

/** Move or resize the visible source rectangle in frame coordinates. It may extend past the frame. */
export function dragSourceGeometry(
  start: PostSourceGeometry,
  handle: BoxHandle,
  deltaX: number,
  deltaY: number,
  frameWidth: number,
  frameHeight: number
): PostSourceGeometry {
  if (handle === "move") {
    return {
      ...start,
      x: start.x + deltaX / frameWidth,
      y: start.y + deltaY / frameHeight,
    };
  }

  const radians = (start.rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const localX = deltaX * cos + deltaY * sin;
  const localY = -deltaX * sin + deltaY * cos;
  const width = start.width * frameWidth;
  const height = start.height * frameHeight;
  const west = handle.includes("w");
  const east = handle.includes("e");
  const north = handle.includes("n");
  const south = handle.includes("s");
  const widthDelta = west ? -localX : east ? localX : 0;
  const heightDelta = north ? -localY : south ? localY : 0;
  const nextWidth = Math.max(1, width + widthDelta);
  const nextHeight = Math.max(1, height + heightDelta);
  const localCentreX = west
    ? (width - nextWidth) / 2
    : east
      ? (nextWidth - width) / 2
      : 0;
  const localCentreY = north
    ? (height - nextHeight) / 2
    : south
      ? (nextHeight - height) / 2
      : 0;
  const centreX =
    (start.x + start.width / 2) * frameWidth +
    localCentreX * cos -
    localCentreY * sin;
  const centreY =
    (start.y + start.height / 2) * frameHeight +
    localCentreX * sin +
    localCentreY * cos;
  return {
    ...start,
    x: (centreX - nextWidth / 2) / frameWidth,
    y: (centreY - nextHeight / 2) / frameHeight,
    width: nextWidth / frameWidth,
    height: nextHeight / frameHeight,
  };
}

/** Scale about the media centre, then move it by a gesture's screen delta. */
export function scaleSourceGeometry(
  start: PostSourceGeometry,
  factor: number,
  deltaX: number,
  deltaY: number,
  frameWidth: number,
  frameHeight: number
): PostSourceGeometry {
  const width = Math.max(1 / frameWidth, start.width * factor);
  const height = Math.max(1 / frameHeight, start.height * factor);
  return {
    ...start,
    x: start.x + (start.width - width) / 2 + deltaX / frameWidth,
    y: start.y + (start.height - height) / 2 + deltaY / frameHeight,
    width,
    height,
  };
}
