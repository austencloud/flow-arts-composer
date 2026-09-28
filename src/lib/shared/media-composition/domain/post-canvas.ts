import {
  POST_DEFAULT_CANVAS,
  POST_SHAPE_RATIO_MAX,
  POST_SHAPE_RATIO_MIN,
  type PostBox,
  type PostCanvasRatio,
  type PostClipShape,
  type PostClipShapeKind,
  type PostProject,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";

/**
 * The post's shape and each clip's shape inside it. A project's canvas sets
 * the export's size; a clip with a shape shows as the largest rectangle of
 * that shape centred in its box, so the box stays the spot it was given and
 * the shape can change without moving it.
 */

export interface PostOutputSize {
  width: number;
  height: number;
}

/** Each canvas at 1080 pixels on its short side, as Instagram takes them. */
const OUTPUT_SIZES: Record<PostCanvasRatio, PostOutputSize> = {
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
  "3:4": { width: 1080, height: 1440 },
  "4:3": { width: 1440, height: 1080 },
};

export function postCanvasOf(project: Pick<PostProject, "canvas">): PostCanvasRatio {
  return project.canvas ?? POST_DEFAULT_CANVAS;
}

export function postOutputSize(canvas: PostCanvasRatio | undefined): PostOutputSize {
  return OUTPUT_SIZES[canvas ?? POST_DEFAULT_CANVAS];
}

/** Width over height for a named ratio such as "4:5". */
export function ratioValue(name: PostCanvasRatio): number {
  const [width, height] = name.split(":").map(Number) as [number, number];
  return width / height;
}

export function clampShapeRatio(ratio: number): number {
  return Math.min(POST_SHAPE_RATIO_MAX, Math.max(POST_SHAPE_RATIO_MIN, ratio));
}

/**
 * The shape a pick gives a clip. A fixed name brings its own ratio;
 * `original` and `free` take the one passed in, the footage's or the
 * dragged frame's.
 */
export function clipShapeFor(kind: PostClipShapeKind, ratio?: number): PostClipShape | null {
  if (kind === "original" || kind === "free") {
    return typeof ratio === "number" && Number.isFinite(ratio) && ratio > 0
      ? { kind, ratio: clampShapeRatio(ratio) }
      : null;
  }
  return { kind, ratio: ratioValue(kind) };
}

/**
 * The largest rectangle `ratio` wide per unit high, centred in `box`, as
 * shares of the frame. Pixels decide which side is short, so `output` is the
 * canvas's size.
 */
export function shapedBox(box: PostBox, ratio: number, output: PostOutputSize): PostBox {
  if (!(ratio > 0) || !Number.isFinite(ratio)) return box;
  const width = box.width * output.width;
  const height = box.height * output.height;
  if (!(width > 0) || !(height > 0)) return box;
  if (Math.abs(width / height - ratio) < 1e-9) return box;
  const fitWidth = width / height > ratio ? height * ratio : width;
  const fitHeight = fitWidth / ratio;
  const shareWidth = fitWidth / output.width;
  const shareHeight = fitHeight / output.height;
  return {
    x: box.x + (box.width - shareWidth) / 2,
    y: box.y + (box.height - shareHeight) / 2,
    width: shareWidth,
    height: shareHeight,
  };
}

/** Where a clip shows in its box: the box, or its shape inside it. */
export function clipBox(
  item: Pick<PostVideoItem, "shape">,
  box: PostBox,
  output: PostOutputSize
): PostBox {
  return item.shape ? shapedBox(box, item.shape.ratio, output) : box;
}
