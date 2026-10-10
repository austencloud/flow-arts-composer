import type { TimelineJoin } from "@austencloud/video-editor";
import {
  POST_TIME_EPSILON,
  itemEnd,
  type PostProject,
} from "@austencloud/video-editor/core";
import { pipHandoffOf } from "$lib/shared/media-composition/domain/pip-handoff";

/**
 * An animation and the picture-in-picture square it turns into. The timeline
 * draws them as one block on the animation's row, joined across the stretch
 * where one becomes the other. Each half selects on its own; they move together.
 */
export interface TimelineHandoffPair {
  animationId: string;
  movesId: string;
  animationTrackIndex: number;
  movesTrackIndex: number;
  /** Where the animation turns into the square, in post seconds. */
  start: number;
  end: number;
}

/**
 * The pair the timeline joins, or null when there is none or another clip on
 * the animation's row sits where the square would be drawn.
 */
export function timelineHandoffPair(
  project: PostProject
): TimelineHandoffPair | null {
  const handoff = pipHandoffOf(project);
  if (!handoff) return null;
  const { animation, moves } = handoff;
  const animationTrackIndex = project.tracks.findIndex((track) =>
    track.items.includes(animation)
  );
  const movesTrackIndex = project.tracks.findIndex((track) =>
    track.items.includes(moves)
  );
  const movesEnd = itemEnd(moves);
  const blocked = project.tracks[animationTrackIndex]!.items.some(
    (item) =>
      item !== animation &&
      item !== moves &&
      item.start < movesEnd - POST_TIME_EPSILON &&
      itemEnd(item) > moves.start + POST_TIME_EPSILON
  );
  if (blocked) return null;
  return {
    animationId: animation.id,
    movesId: moves.id,
    animationTrackIndex,
    movesTrackIndex,
    start: handoff.start,
    end: handoff.end,
  };
}

/** The handoff pair as the generic join the timeline draws: the animation first, the square second. */
export function tkaTimelineJoin(project: PostProject): TimelineJoin | null {
  const pair = timelineHandoffPair(project);
  if (!pair) return null;
  return {
    fromId: pair.animationId,
    toId: pair.movesId,
    fromTrackIndex: pair.animationTrackIndex,
    toTrackIndex: pair.movesTrackIndex,
    start: pair.start,
    end: pair.end,
  };
}
