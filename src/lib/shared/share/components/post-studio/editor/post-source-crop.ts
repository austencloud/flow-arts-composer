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
