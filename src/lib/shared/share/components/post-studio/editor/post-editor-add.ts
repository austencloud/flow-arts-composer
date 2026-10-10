import {
  POST_DEFAULT_OVERLAY_SECONDS,
  POST_MIN_ITEM_SECONDS,
  mainItemAt,
  type PostProject,
} from "@austencloud/video-editor/core";
import type { NewOverlaySpec } from "@austencloud/video-editor/core";

/**
 * Where the Add tool puts a new item. Videos join the end of the main track;
 * the rest start at the playhead, and an item added to fill over the main
 * track (tka: the sequence views) fills the clip there so it follows the clip
 * when it moves.
 */

/** At the end of the post, a new item starts early enough to be seen. */
export function newItemStart(
  durationSeconds: number,
  playheadSeconds: number
): number {
  return durationSeconds > 0 &&
    playheadSeconds >= durationSeconds - POST_MIN_ITEM_SECONDS
    ? Math.max(0, durationSeconds - POST_DEFAULT_OVERLAY_SECONDS)
    : playheadSeconds;
}

/**
 * The whole spec for an item added at `at`. With `fillOverMain`, the item
 * fills the main clip under it, if there is one.
 */
export function overlayAt(
  project: PostProject,
  spec: Omit<NewOverlaySpec, "at" | "fill">,
  at: number,
  fillOverMain = false
): NewOverlaySpec {
  return {
    ...spec,
    at,
    fill: fillOverMain && mainItemAt(project, at) !== null,
  };
}
