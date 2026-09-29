import type {
  PostBox,
  PostItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  boxAt,
  isAnimated,
} from "$lib/shared/media-composition/domain/post-project-keyframes";
import {
  clipBox,
  postOutputSize,
  spotAround,
} from "$lib/shared/media-composition/domain/post-canvas";
import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";

/**
 * Where an item shows on the frame, and the box it keeps when that moves:
 * one answer for the preview's handles and the Position tool's typed values.
 */
type Framed = Pick<
  PostEditorState,
  "project" | "previewSeconds" | "regionRects"
>;

/** Where an item shows at `seconds`: a video in its shape inside its box. */
export function shownBox(
  editor: Framed,
  item: PostItem,
  seconds: number
): PostBox {
  // Between two keyed boxes the picture blends each key's shape, which is
  // not always the shape of the blended box, so the outline takes the rect
  // the picture is drawn in.
  if (
    item.kind === "video" &&
    item.shape &&
    isAnimated(item, "box") &&
    seconds === editor.previewSeconds
  ) {
    const drawn = editor.regionRects.get(item.id);
    if (drawn) return drawn;
  }
  const box = boxAt(item, seconds);
  return item.kind === "video"
    ? clipBox(item, box, postOutputSize(editor.project.canvas))
    : box;
}

/**
 * The box to keep for an item now shown at `shown`: a shaped clip keeps
 * the room its box had around its shape, anything else takes `shown`.
 */
export function keptBox(
  editor: Framed,
  item: PostItem,
  shown: PostBox,
  before: PostBox
): PostBox {
  return item.kind === "video"
    ? spotAround(item, shown, before, postOutputSize(editor.project.canvas))
    : shown;
}

/** A clip shaped to a set ratio keeps it, so only its corners resize it. */
export function keepsShape(item: PostItem): boolean {
  return item.kind === "video" && item.shape !== undefined;
}
