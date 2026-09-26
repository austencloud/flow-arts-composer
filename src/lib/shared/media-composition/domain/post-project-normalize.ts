import {
  MAIN_TRACK_ID,
  MAIN_TRACK_INDEX,
  MAIN_TRACK_KINDS,
  POST_MIN_ITEM_SECONDS,
  POST_TIME_EPSILON,
  createIdAllocator,
  itemEnd,
  trackHasRoom,
  type PostItem,
  type PostProject,
  type PostTrack,
} from "$lib/shared/media-composition/domain/post-project";
import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";

/**
 * The timeline's rules, applied after every edit so the stored project is
 * always the one on screen:
 *
 * 1. Main clips sit end to end from zero in their order. A clip lasts its
 *    source span at its speed, cut to its take's length.
 * 2. An anchored overlay starts at its main clip's start plus its offset;
 *    one that fills spans the clip exactly. An overlay whose clip is gone
 *    stays where it stands and follows the clip now under it.
 * 3. Items on one overlay track never overlap: the later one moves up to the
 *    next track with room, or a new one. Empty overlay tracks go.
 * 4. Anything on the main track that is not a clip or a card moves to an
 *    overlay track.
 *
 * Unchanged items and tracks keep their identity, so a drag that moves one
 * item re-renders only that item.
 */
export function normalizeProject(project: PostProject): PostProject {
  const takes = new Map(project.takes.map((take) => [take.id, take]));
  const main: PostTrack = project.tracks[MAIN_TRACK_INDEX] ?? {
    id: MAIN_TRACK_ID,
    hidden: false,
    locked: false,
    items: [],
  };

  const displaced: PostItem[] = [];
  const laidMain: PostItem[] = [];
  let cursor = 0;
  for (const item of main.items) {
    if (!MAIN_TRACK_KINDS.includes(item.kind)) {
      displaced.push(item);
      continue;
    }
    const sized = sizeItem(item, takes);
    const laid = withChanges(sized, { start: cursor, anchor: null, fill: false });
    laidMain.push(laid);
    cursor += laid.duration;
  }

  const mainById = new Map(laidMain.map((item) => [item.id, item]));
  const mainAt = (seconds: number): PostItem | null =>
    laidMain.find(
      (item) =>
        seconds >= item.start - POST_TIME_EPSILON &&
        seconds < itemEnd(item) - POST_TIME_EPSILON
    ) ?? null;

  const place = (item: PostItem): PostItem => {
    const sized = sizeItem(item, takes);
    const anchored = sized.anchor ? mainById.get(sized.anchor.itemId) : null;

    if (sized.fill && sized.kind !== "video") {
      const target = anchored ?? mainAt(sized.start);
      if (!target) return withChanges(sized, { fill: false, anchor: null });
      return withChanges(sized, {
        start: target.start,
        duration: target.duration,
        anchor: { itemId: target.id, offset: 0 },
      });
    }

    // A clip's length is its own, so an overlay clip never fills.
    const unfilled = sized.fill ? withChanges(sized, { fill: false }) : sized;
    if (anchored) {
      return withChanges(unfilled, {
        start: Math.max(0, anchored.start + unfilled.anchor!.offset),
      });
    }
    if (unfilled.anchor) {
      const under = mainAt(unfilled.start);
      return withChanges(unfilled, {
        anchor: under
          ? { itemId: under.id, offset: unfilled.start - under.start }
          : null,
      });
    }
    return unfilled;
  };

  // Resolve overlaps bottom to top: an item keeps its track when it fits
  // among the earlier-starting items there, and otherwise waits to be
  // placed higher up.
  const overlays = project.tracks.slice(MAIN_TRACK_INDEX + 1);
  const kept: PostItem[][] = overlays.map(() => []);
  const bumped: { item: PostItem; fromIndex: number }[] = displaced.map(
    (item) => ({ item: place(item), fromIndex: MAIN_TRACK_INDEX })
  );
  overlays.forEach((track, overlayIndex) => {
    const placed = track.items
      .map(place)
      .map((item, order) => ({ item, order }))
      .sort(
        (left, right) =>
          left.item.start - right.item.start || left.order - right.order
      );
    // A hidden or locked track's own items stay on it no matter what: it
    // never sends its own items looking for room elsewhere.
    const frozen = track.hidden || track.locked;
    for (const { item } of placed) {
      const lane = kept[overlayIndex]!;
      if (frozen || fitsAmong(lane, item)) lane.push(item);
      else bumped.push({ item, fromIndex: overlayIndex + 1 });
    }
  });

  const newTrackId = createIdAllocator(project);
  const extraTracks: PostTrack[] = [];
  bumped
    .sort(
      (left, right) =>
        left.fromIndex - right.fromIndex || left.item.start - right.item.start
    )
    .forEach(({ item, fromIndex }) => {
      for (let index = fromIndex; index < kept.length; index++) {
        // A hidden or locked track never receives an item bumped from
        // elsewhere, even when it would otherwise have room for it.
        if (overlays[index]!.hidden || overlays[index]!.locked) continue;
        const lane = kept[index]!;
        if (fitsAmong(lane, item)) {
          lane.push(item);
          return;
        }
      }
      for (const track of extraTracks) {
        if (fitsAmong(track.items, item)) {
          track.items.push(item);
          return;
        }
      }
      extraTracks.push({
        id: newTrackId("track"),
        hidden: false,
        locked: false,
        items: [item],
      });
    });

  const nextOverlays: PostTrack[] = [
    ...overlays.map((track, index) =>
      withTrackItems(track, sortByStart(kept[index]!))
    ),
    ...extraTracks.map((track) => ({
      ...track,
      items: sortByStart(track.items),
    })),
  ].filter((track) => track.items.length > 0);

  const nextMain = withTrackItems(main, laidMain);
  const tracks = [nextMain, ...nextOverlays];
  const unchanged =
    tracks.length === project.tracks.length &&
    tracks.every((track, index) => track === project.tracks[index]);
  return unchanged ? project : { ...project, tracks };
}

/** Durations that follow from the item's own fields, and fades that fit. */
function sizeItem(
  item: PostItem,
  takes: ReadonlyMap<string, PostTake>
): PostItem {
  if (item.kind === "video") {
    const limit = takes.get(item.takeId)?.durationSeconds ?? Infinity;
    const minSpan = POST_MIN_ITEM_SECONDS * item.speed;
    const sourceOut = Math.min(item.sourceOut, limit);
    const sourceIn =
      sourceOut - item.sourceIn < minSpan
        ? Math.max(0, sourceOut - minSpan)
        : item.sourceIn;
    const duration = (sourceOut - sourceIn) / item.speed;
    const fades = fittedFades(item.fadeIn, item.fadeOut, duration);
    return withChanges(item, {
      sourceIn,
      sourceOut,
      duration,
      fadeIn: fades.fadeIn,
      fadeOut: fades.fadeOut,
    });
  }
  const duration = Math.max(POST_MIN_ITEM_SECONDS, item.duration);
  const fades = fittedFades(item.fadeIn, item.fadeOut, duration);
  return withChanges(item, {
    duration,
    fadeIn: fades.fadeIn,
    fadeOut: fades.fadeOut,
  });
}

/**
 * Each fade capped to the item's length, then both scaled down together when
 * they still ask for more than the whole item - a speed change or a trim can
 * shrink a clip out from under fades that used to fit it on their own.
 */
function fittedFades(
  fadeIn: number,
  fadeOut: number,
  duration: number
): { fadeIn: number; fadeOut: number } {
  const cappedIn = Math.min(fadeIn, duration);
  const cappedOut = Math.min(fadeOut, duration);
  const total = cappedIn + cappedOut;
  if (total <= duration) return { fadeIn: cappedIn, fadeOut: cappedOut };
  const scale = duration / total;
  return { fadeIn: cappedIn * scale, fadeOut: cappedOut * scale };
}

function fitsAmong(items: readonly PostItem[], item: PostItem): boolean {
  return trackHasRoom(
    { id: "", hidden: false, locked: false, items: [...items] },
    item.start,
    itemEnd(item),
    item.id
  );
}

function sortByStart(items: PostItem[]): PostItem[] {
  return items
    .map((item, order) => ({ item, order }))
    .sort(
      (left, right) =>
        left.item.start - right.item.start || left.order - right.order
    )
    .map(({ item }) => item);
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    "itemId" in left &&
    "itemId" in right
  ) {
    const a = left as { itemId: string; offset: number };
    const b = right as { itemId: string; offset: number };
    return a.itemId === b.itemId && a.offset === b.offset;
  }
  return false;
}

/** The item with these fields changed, or the same item when none differ. */
function withChanges<T extends PostItem>(item: T, changes: Partial<T>): T {
  for (const key of Object.keys(changes) as (keyof T)[]) {
    if (!sameValue(item[key], changes[key])) return { ...item, ...changes };
  }
  return item;
}

function withTrackItems(track: PostTrack, items: PostItem[]): PostTrack {
  const same =
    items.length === track.items.length &&
    items.every((item, index) => item === track.items[index]);
  return same ? track : { ...track, items };
}
