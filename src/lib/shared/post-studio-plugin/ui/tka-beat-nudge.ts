import {
  POST_TIME_EPSILON,
  itemEnd,
  keyframeTimeOf,
  type PostItem,
  type PostProject,
  type PostVideoItem,
} from "@austencloud/video-editor/core";
import type {
  TakeTiming,
  TimingSection,
} from "#lib/shared/media-composition/domain/take-timing.js";

/**
 * The camera clip whose beats an item plays to. A video is its own; a moves
 * strip or an animation follows a main-lane video under the playhead, held
 * inside the item. Where two clips cross there, the one the item spends
 * longest over wins: a letters strip laid over the breakdown keeps the
 * breakdown through the demonstration's fade out.
 */
export function beatsClipFor(
  project: PostProject,
  item: PostItem,
  playhead: number
): PostVideoItem | null {
  if (item.kind === "video") return item;
  if (item.kind !== "moves" && item.kind !== "animation") return null;
  const end = itemEnd(item);
  const at = Math.min(
    end - 2 * POST_TIME_EPSILON,
    Math.max(item.start, playhead)
  );
  let best: PostVideoItem | null = null;
  let bestShared = -Infinity;
  for (const clip of project.tracks[0]?.items ?? []) {
    if (clip.kind !== "video") continue;
    const clipEnd = itemEnd(clip);
    if (
      at < clip.start - POST_TIME_EPSILON ||
      at >= clipEnd - POST_TIME_EPSILON
    )
      continue;
    const shared = Math.min(end, clipEnd) - Math.max(item.start, clip.start);
    if (shared > bestShared) {
      best = clip;
      bestShared = shared;
    }
  }
  return best;
}

/** The part of the take's timing the clip shows at the playhead. */
export function timingSectionAt(
  timing: TakeTiming,
  clip: PostVideoItem,
  playhead: number
): TimingSection | null {
  const at = Math.min(itemEnd(clip), Math.max(clip.start, playhead));
  const source = keyframeTimeOf(clip, at);
  let found: TimingSection | null = timing.sections[0] ?? null;
  for (const section of timing.sections) {
    if (source >= section.startSeconds) found = section;
  }
  return found;
}
