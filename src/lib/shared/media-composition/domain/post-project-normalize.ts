import {
  MAIN_TRACK_ID,
  MAIN_TRACK_INDEX,
  MAIN_TRACK_KINDS,
  POST_KEYFRAME_MERGE_SECONDS,
  POST_MIN_ITEM_SECONDS,
  POST_TIME_EPSILON,
  createIdAllocator,
  itemEnd,
  type PostItem,
  type PostItemKeyframes,
  type PostKeyframe,
  type PostKeyframeChannel,
  type PostProject,
  type PostTrack,
} from "$lib/shared/media-composition/domain/post-project";
import {
  channelsOf,
  clampChannelValue,
  postSecondsOfKeyframe,
  sameChannelValue,
} from "$lib/shared/media-composition/domain/post-project-keyframes";
import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";
import { arrangementDurationSeconds } from "$lib/shared/media-composition/domain/post-arrangement-item";
import { withMotionKeys } from "$lib/shared/media-composition/domain/post-project-motion-keys";
import {
  mergeSeparateTunnelHook,
  splitTunnelHookTitles,
} from "$lib/shared/media-composition/domain/post-project-hook-migration";

/**
 * The timeline's rules, applied after every edit so the stored project is
 * always the one on screen:
 *
 * 1. Main clips follow one another unless placed by hand. A placed clip
 *    keeps its chosen start, or moves right to limit overlap to its transition.
 *    A clip lasts its source span at its speed, cut to its take's length.
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
export function normalizeProject(stored: PostProject): PostProject {
  return withMotionKeys(normalizeLayout(stored));
}

function normalizeLayout(stored: PostProject): PostProject {
  const project = splitTunnelHookTitles(mergeSeparateTunnelHook(stored));
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
  let outgoingOverlap = 0;
  for (const [index, item] of main.items.entries()) {
    if (!MAIN_TRACK_KINDS.includes(item.kind)) {
      displaced.push(item);
      continue;
    }
    const sized = sizeItem(item, takes);
    const earliest =
      cursor - Math.min(outgoingOverlap, sized.duration - POST_TIME_EPSILON);
    const start = sized.pinnedStart
      ? Math.max(earliest, sized.start)
      : earliest;
    const laid = withChanges(sized, { start, anchor: null, fill: false });
    laidMain.push(laid);
    cursor = start + laid.duration;
    const boundToNext =
      !item.transitionOut?.incomingId ||
      item.transitionOut.incomingId === main.items[index + 1]?.id;
    outgoingOverlap = Math.min(
      boundToNext ? (item.transitionOut?.duration ?? 0) : 0,
      laid.duration - POST_TIME_EPSILON
    );
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

    // An animation with a tunnel intro opens that long before its footage, so
    // the intro and the animation are one item on one canvas. When the
    // footage plays behind the intro, it opens with the footage instead.
    const intro =
      sized.kind === "animation" ? (sized.tunnelHook?.seconds ?? 0) : 0;
    const lead =
      sized.kind === "animation" && sized.tunnelHook?.backdrop ? 0 : intro;

    if (sized.fill && sized.kind !== "video" && sized.kind !== "arrangement") {
      const target = anchored ?? mainAt(sized.start + intro);
      if (!target) return withChanges(sized, { fill: false, anchor: null });
      const start = Math.max(0, target.start - lead);
      return withChanges(sized, {
        start,
        duration: target.duration + (target.start - start),
        anchor: { itemId: target.id, offset: start - target.start },
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
  const tracks = [nextMain, ...nextOverlays].map((track) => {
    let changed = false;
    const items = track.items.map((item, index) => {
      const incoming = track.items[index + 1];
      if (item.transitionOut && !item.transitionOut.incomingId && incoming) {
        changed = true;
        return {
          ...item,
          transitionOut: { ...item.transitionOut, incomingId: incoming.id },
        };
      }
      return item;
    });
    return changed ? { ...track, items } : track;
  });
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
  const canonical = canonicalizeItemKeyframes(item);
  if (canonical.kind === "video") {
    const limit = takes.get(canonical.takeId)?.durationSeconds ?? Infinity;
    const minSpan = POST_MIN_ITEM_SECONDS * canonical.speed;
    const sourceOut = Math.min(canonical.sourceOut, limit);
    const sourceIn =
      sourceOut - canonical.sourceIn < minSpan
        ? Math.max(0, sourceOut - minSpan)
        : canonical.sourceIn;
    const duration = (sourceOut - sourceIn) / canonical.speed;
    const fades = fittedFades(canonical.fadeIn, canonical.fadeOut, duration);
    return withChanges(canonical, {
      sourceIn,
      sourceOut,
      duration,
      fadeIn: fades.fadeIn,
      fadeOut: fades.fadeOut,
    });
  }
  if (canonical.kind === "arrangement") {
    const limit = arrangementDurationSeconds(canonical.snapshot);
    const minSpan = Math.min(limit, POST_MIN_ITEM_SECONDS * canonical.speed);
    const sourceOut = Math.min(limit, Math.max(minSpan, canonical.sourceOut));
    const sourceIn = Math.min(canonical.sourceIn, sourceOut - minSpan);
    const duration = (sourceOut - sourceIn) / canonical.speed;
    const fades = fittedFades(canonical.fadeIn, canonical.fadeOut, duration);
    return withChanges(canonical, {
      sourceIn,
      sourceOut,
      duration,
      fadeIn: fades.fadeIn,
      fadeOut: fades.fadeOut,
    });
  }
  const duration = Math.max(POST_MIN_ITEM_SECONDS, canonical.duration);
  const fades = fittedFades(canonical.fadeIn, canonical.fadeOut, duration);
  return withChanges(canonical, {
    duration,
    fadeIn: fades.fadeIn,
    fadeOut: fades.fadeOut,
  });
}

/**
 * Canonical keyframes (see `2026-09-26-post-studio-keyframes-design.md`):
 * each channel sorted by `t`, keyframes within half a frame of post time
 * merged (the later one winning), values clamped, and an empty channel or an
 * empty `keyframes` object removed. Keeps the item's reference when it is
 * already canonical.
 */
function canonicalizeItemKeyframes(item: PostItem): PostItem {
  const existing = (item as { keyframes?: PostItemKeyframes }).keyframes;
  if (!existing) return item;
  const next: Record<string, PostKeyframe<unknown>[]> = {};
  for (const channel of channelsOf(item)) {
    const raw = existing[channel] as PostKeyframe<unknown>[] | undefined;
    const canon = canonicalChannel(item, channel, raw);
    if (canon) next[channel] = canon;
  }
  const existingKeys = Object.keys(existing) as PostKeyframeChannel[];
  const nextKeys = Object.keys(next) as PostKeyframeChannel[];
  const same =
    existingKeys.length === nextKeys.length &&
    nextKeys.every((channel) => next[channel] === existing[channel]);
  if (same) return item;
  const { keyframes: _drop, ...rest } = item as PostItem & {
    keyframes?: unknown;
  };
  return nextKeys.length === 0
    ? (rest as PostItem)
    : ({ ...item, keyframes: next } as unknown as PostItem);
}

/** One channel's keyframes, sorted, merged within half a frame, and clamped. */
function canonicalChannel(
  item: PostItem,
  channel: PostKeyframeChannel,
  raw: readonly PostKeyframe<unknown>[] | undefined
): PostKeyframe<unknown>[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const sorted = [...raw].sort((a, b) => a.t - b.t);
  const merged: PostKeyframe<unknown>[] = [];
  for (const kf of sorted) {
    const clamped = clampChannelValue(channel, kf.value as never);
    const candidate: PostKeyframe<unknown> = sameChannelValue(
      channel,
      clamped,
      kf.value
    )
      ? kf
      : { ...kf, value: clamped };
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(
        postSecondsOfKeyframe(item, candidate.t) -
          postSecondsOfKeyframe(item, last.t)
      ) <= POST_KEYFRAME_MERGE_SECONDS
    ) {
      merged[merged.length - 1] = candidate;
    } else {
      merged.push(candidate);
    }
  }
  if (
    merged.length === raw.length &&
    merged.every((kf, index) => kf === raw[index])
  ) {
    return raw as PostKeyframe<unknown>[];
  }
  return merged;
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
  return items.every((previous, index) => {
    if (
      previous.id === item.id ||
      itemEnd(item) <= previous.start + POST_TIME_EPSILON ||
      item.start >= itemEnd(previous) - POST_TIME_EPSILON
    )
      return true;
    // An intentional transition is the sole overlap allowed on one overlay
    // lane. Only the immediately preceding visual item can own that overlap.
    return (
      index === items.length - 1 &&
      isTransitionVisual(previous) &&
      isTransitionVisual(item) &&
      !!previous.transitionOut &&
      (!previous.transitionOut.incomingId ||
        previous.transitionOut.incomingId === item.id) &&
      previous.start <= item.start &&
      item.start >=
        itemEnd(previous) - previous.transitionOut.duration - POST_TIME_EPSILON
    );
  });
}

function isTransitionVisual(item: PostItem): boolean {
  return (
    item.kind === "video" ||
    item.kind === "image" ||
    item.kind === "animation" ||
    item.kind === "moves" ||
    item.kind === "carousel" ||
    item.kind === "card"
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
