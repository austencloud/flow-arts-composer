import type { PostProject } from "$lib/shared/media-composition/domain/post-project";

export interface TimelineSelection {
  ids: string[];
  anchorId: string | null;
  focusId: string | null;
}

/** Timeline order is chronological, with lower layers first at equal times. */
export function timelineItemOrder(project: PostProject): string[] {
  return project.tracks
    .flatMap((track, trackIndex) =>
      track.items.map((item, itemIndex) => ({ item, trackIndex, itemIndex }))
    )
    .sort(
      (a, b) =>
        a.item.start - b.item.start ||
        a.trackIndex - b.trackIndex ||
        a.itemIndex - b.itemIndex
    )
    .map(({ item }) => item.id);
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
