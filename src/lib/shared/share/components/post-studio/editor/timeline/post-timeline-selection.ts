import {
  POST_TIME_EPSILON,
  itemEnd,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";
import { pipHandoffOf } from "$lib/shared/media-composition/domain/pip-handoff";

export interface TimelineSelection {
  ids: string[];
  anchorId: string | null;
  focusId: string | null;
}

/** Shift-click ranges stay on the clicked clip's track, in time order. */
export function timelineItemOrder(
  project: PostProject,
  itemId: string
): string[] {
  const track = project.tracks.find((track) =>
    track.items.some((item) => item.id === itemId)
  );
  return [...(track?.items ?? [])]
    .sort((a, b) => a.start - b.start)
    .map((item) => item.id);
}

export function selectTimelineItem(
  current: TimelineSelection,
  itemId: string,
  order: readonly string[],
  modifier: "plain" | "range" | "toggle"
): TimelineSelection {
  if (modifier === "plain")
    return { ids: [itemId], anchorId: itemId, focusId: itemId };
  if (modifier === "toggle") {
    const ids = current.ids.includes(itemId)
      ? current.ids.filter((id) => id !== itemId)
      : [...current.ids, itemId];
    return {
      ids,
      anchorId: ids.includes(itemId)
        ? itemId
        : current.anchorId && ids.includes(current.anchorId)
          ? current.anchorId
          : (ids.at(-1) ?? null),
      focusId: ids.includes(itemId) ? itemId : (ids.at(-1) ?? null),
    };
  }
  const anchorId =
    current.anchorId && order.includes(current.anchorId)
      ? current.anchorId
      : current.focusId && order.includes(current.focusId)
        ? current.focusId
        : itemId;
  const from = order.indexOf(anchorId);
  const to = order.indexOf(itemId);
  if (from < 0 || to < 0)
    return { ids: [itemId], anchorId: itemId, focusId: itemId };
  return {
    ids: order.slice(Math.min(from, to), Math.max(from, to) + 1),
    anchorId,
    focusId: itemId,
  };
}

/**
 * An animation and the picture-in-picture square it turns into. The timeline
 * draws them as one block on the animation's row, joined across the stretch
 * where one becomes the other, and selects and moves them together.
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

/** The clips a press on this one acts on: both halves of a joined pair. */
export function timelineGroupOf(
  pair: TimelineHandoffPair | null,
  itemId: string
): string[] {
  return pair && (itemId === pair.animationId || itemId === pair.movesId)
    ? [pair.animationId, pair.movesId]
    : [itemId];
}

/**
 * Keeps a joined pair whole in a selection: when the pressed clip ended up
 * selected, or any half did, both are; a toggle that dropped one drops both.
 */
export function joinTimelineGroup(
  selection: TimelineSelection,
  pair: TimelineHandoffPair | null,
  pressedId: string
): TimelineSelection {
  if (!pair) return selection;
  const group = [pair.animationId, pair.movesId];
  const without = selection.ids.filter((id) => !group.includes(id));
  const keep = group.includes(pressedId)
    ? selection.ids.includes(pressedId)
    : group.some((id) => selection.ids.includes(id));
  if (keep) return { ...selection, ids: [...without, ...group] };
  const outside = (id: string | null) =>
    id !== null && !group.includes(id) ? id : (without.at(-1) ?? null);
  return {
    ids: without,
    anchorId: outside(selection.anchorId),
    focusId: outside(selection.focusId),
  };
}
