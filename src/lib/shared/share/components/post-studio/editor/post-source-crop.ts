import type { PostSourceGeometry } from "$lib/shared/media-composition/domain/post-project";

export type SourceCropEdge = keyof PostSourceGeometry["crop"];

const MIN_SPAN = 0.0001;

export function setSourceCropEdge(
  geometry: PostSourceGeometry,
  edge: SourceCropEdge,
  value: number
): PostSourceGeometry {
  if (!Number.isFinite(value)) return geometry;
  const crop = geometry.crop;
  const lower =
    edge === "right"
      ? crop.left + MIN_SPAN
      : edge === "bottom"
        ? crop.top + MIN_SPAN
        : 0;
  const upper =
    edge === "left"
      ? crop.right - MIN_SPAN
      : edge === "top"
        ? crop.bottom - MIN_SPAN
        : 1;
  return {
    ...geometry,
    crop: { ...crop, [edge]: Math.max(lower, Math.min(upper, value)) },
  };
}

export function dragSourceCrop(
  geometry: PostSourceGeometry,
  edge: SourceCropEdge | "move",
  dx: number,
  dy: number
): PostSourceGeometry {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return geometry;
  if (edge !== "move")
    return setSourceCropEdge(
      geometry,
      edge,
      geometry.crop[edge] + (edge === "left" || edge === "right" ? dx : dy)
    );
  const crop = geometry.crop;
  const x = Math.max(-crop.left, Math.min(1 - crop.right, dx));
  const y = Math.max(-crop.top, Math.min(1 - crop.bottom, dy));
  return {
    ...geometry,
    crop: {
      left: crop.left + x,
      right: crop.right + x,
      top: crop.top + y,
      bottom: crop.bottom + y,
    },
  };
}

/** Fit a ratio inside the current source selection and its output rectangle. */
export function sourceCropAtRatio(
  geometry: PostSourceGeometry,
  source: { width: number; height: number },
  output: { width: number; height: number },
  ratio: number,
  original = false
): PostSourceGeometry {
  if (
    !Number.isFinite(ratio) || ratio <= 0 ||
    source.width <= 0 || source.height <= 0 ||
    output.width <= 0 || output.height <= 0
  ) return geometry;
  const crop = original
    ? { left: 0, top: 0, right: 1, bottom: 1 }
    : geometry.crop;
  const centerX = (crop.left + crop.right) / 2;
  const centerY = (crop.top + crop.bottom) / 2;
  let width = crop.right - crop.left;
  let height = crop.bottom - crop.top;
  if (width * source.width / (height * source.height) > ratio)
    width = height * source.height * ratio / source.width;
  else height = width * source.width / (ratio * source.height);
  const boxCenterX = geometry.x + geometry.width / 2;
  const boxCenterY = geometry.y + geometry.height / 2;
  let boxWidth = geometry.width;
  let boxHeight = geometry.height;
  if (boxWidth * output.width / (boxHeight * output.height) > ratio)
    boxWidth = boxHeight * output.height * ratio / output.width;
  else boxHeight = boxWidth * output.width / (ratio * output.height);
  return {
    ...geometry,
    x: boxCenterX - boxWidth / 2,
    y: boxCenterY - boxHeight / 2,
    width: boxWidth,
    height: boxHeight,
    crop: {
      left: centerX - width / 2,
      right: centerX + width / 2,
      top: centerY - height / 2,
      bottom: centerY + height / 2,
    },
  };
}
