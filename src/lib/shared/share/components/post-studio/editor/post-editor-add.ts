import {
  POST_DEFAULT_OVERLAY_SECONDS,
  POST_MIN_ITEM_SECONDS,
  mainItemAt,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import type { NewOverlaySpec } from "$lib/shared/media-composition/domain/post-project-edits";

/**
 * Where the Add tool puts a new item. Videos join the end of the main track;
 * the rest start at the playhead, and the sequence views fill the clip there
 * so they follow it when it moves.
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

/** The whole spec for an item added at `at`. */
export function overlayAt(
  project: PostProject,
  spec: Omit<NewOverlaySpec, "at" | "fill">,
  at: number
): NewOverlaySpec {
  const sequenceView =
    spec.kind === "animation" ||
    spec.kind === "moves" ||
    spec.kind === "carousel";
  return {
    ...spec,
    at,
    fill: sequenceView && mainItemAt(project, at) !== null,
  };
}
