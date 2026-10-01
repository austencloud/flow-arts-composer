import type { PostSourceGeometry } from "$lib/shared/media-composition/domain/post-project";

export type SourceCropEdge = keyof PostSourceGeometry["crop"];
export type SourceCropHandle =
  | SourceCropEdge
  | "move"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

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
  edge: SourceCropHandle,
  dx: number,
  dy: number,
  keepRatio = false
): PostSourceGeometry {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return geometry;
  const crop = geometry.crop;
  if (edge !== "move") {
    const horizontal = edge.includes("left")
      ? "left"
      : edge.includes("right")
        ? "right"
        : null;
    const vertical = edge.includes("top")
      ? "top"
      : edge.includes("bottom")
        ? "bottom"
        : null;
    if (!keepRatio) {
      let changed = geometry;
      if (horizontal)
        changed = setSourceCropEdge(changed, horizontal, crop[horizontal] + dx);
      if (vertical)
        changed = setSourceCropEdge(changed, vertical, crop[vertical] + dy);
      return changed;
    }

    const width = crop.right - crop.left;
    const height = crop.bottom - crop.top;
    if (width <= 0 || height <= 0) return geometry;
    const horizontalChange = horizontal
      ? (horizontal === "right" ? dx : -dx) / width
      : 0;
    const verticalChange = vertical
      ? (vertical === "bottom" ? dy : -dy) / height
      : 0;
    // A corner follows whichever pointer axis changes its span more, proportionally.
    const change =
      Math.abs(horizontalChange) >= Math.abs(verticalChange)
        ? horizontalChange
        : verticalChange;
    const centerX = (crop.left + crop.right) / 2;
    const centerY = (crop.top + crop.bottom) / 2;
    const maxWidth =
      horizontal === "left"
        ? crop.right
        : horizontal === "right"
          ? 1 - crop.left
          : 2 * Math.min(centerX, 1 - centerX);
    const maxHeight =
      vertical === "top"
        ? crop.bottom
        : vertical === "bottom"
          ? 1 - crop.top
          : 2 * Math.min(centerY, 1 - centerY);
    const scale = Math.max(
      Math.max(MIN_SPAN / width, MIN_SPAN / height),
      Math.min(Math.min(maxWidth / width, maxHeight / height), 1 + change)
    );
    const nextWidth = width * scale;
    const nextHeight = height * scale;
    return {
      ...geometry,
      crop: {
        left:
          horizontal === "left"
            ? crop.right - nextWidth
            : horizontal === "right"
              ? crop.left
              : centerX - nextWidth / 2,
        right:
          horizontal === "right"
            ? crop.left + nextWidth
            : horizontal === "left"
              ? crop.right
              : centerX + nextWidth / 2,
        top:
          vertical === "top"
            ? crop.bottom - nextHeight
            : vertical === "bottom"
              ? crop.top
              : centerY - nextHeight / 2,
        bottom:
          vertical === "bottom"
            ? crop.top + nextHeight
            : vertical === "top"
              ? crop.bottom
              : centerY + nextHeight / 2,
      },
    };
  }
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
    !Number.isFinite(ratio) ||
    ratio <= 0 ||
    source.width <= 0 ||
    source.height <= 0 ||
    output.width <= 0 ||
    output.height <= 0
  )
    return geometry;
  const crop = original
    ? { left: 0, top: 0, right: 1, bottom: 1 }
    : geometry.crop;
  const centerX = (crop.left + crop.right) / 2;
  const centerY = (crop.top + crop.bottom) / 2;
  let width = crop.right - crop.left;
  let height = crop.bottom - crop.top;
  if ((width * source.width) / (height * source.height) > ratio)
    width = (height * source.height * ratio) / source.width;
  else height = (width * source.width) / (ratio * source.height);
  const boxCenterX = geometry.x + geometry.width / 2;
  const boxCenterY = geometry.y + geometry.height / 2;
  let boxWidth = geometry.width;
  let boxHeight = geometry.height;
  if ((boxWidth * output.width) / (boxHeight * output.height) > ratio)
    boxWidth = (boxHeight * output.height * ratio) / output.width;
  else boxHeight = (boxWidth * output.width) / (ratio * output.height);
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

/**
 * Fill: the footage covers the clip's box, as much of it as fits, centred
 * where the crop is now. The box is the clip's layout region (a half in a
 * dual view), so the footage fills that region rather than the canvas.
 */
export function sourceFillBox(
  geometry: PostSourceGeometry,
  source: { width: number; height: number },
  output: { width: number; height: number },
  box: { x: number; y: number; width: number; height: number }
): PostSourceGeometry {
  const ratio = (box.width * output.width) / (box.height * output.height);
  if (
    !Number.isFinite(ratio) ||
    ratio <= 0 ||
    source.width <= 0 ||
    source.height <= 0
  )
    return geometry;
  const sourceRatio = source.width / source.height;
  const width = Math.min(1, ratio / sourceRatio);
  const height = Math.min(1, sourceRatio / ratio);
  const centre = (low: number, high: number, span: number) =>
    Math.max(span / 2, Math.min(1 - span / 2, (low + high) / 2));
  const centerX = centre(geometry.crop.left, geometry.crop.right, width);
  const centerY = centre(geometry.crop.top, geometry.crop.bottom, height);
  return {
    ...geometry,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    crop: {
      left: centerX - width / 2,
      right: centerX + width / 2,
      top: centerY - height / 2,
      bottom: centerY + height / 2,
    },
  };
}
