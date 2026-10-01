import {
  MAIN_TRACK_INDEX,
  POST_BOX,
  POST_DEFAULT_BACKGROUND,
  POST_DEFAULT_CANVAS,
  POST_DEFAULT_CARD_SECONDS,
  POST_DEFAULT_OVERLAY_SECONDS,
  POST_MAX_LABEL_LENGTH,
  POST_MIN_BOX_SIZE,
  POST_MAX_SPEED,
  POST_MAX_TEXT_LENGTH,
  POST_MAX_VOLUME,
  POST_MAX_ZOOM,
  POST_MIN_ITEM_SECONDS,
  POST_MIN_SPEED,
  POST_MIN_ZOOM,
  POST_TIME_EPSILON,
  clampBox,
  createIdAllocator,
  defaultBoxFor,
  findItem,
  itemEnd,
  mainItemAt,
  overlaysAnchoredTo,
  trackHasRoom,
  wrapDegrees,
  type PostAnchor,
  type PostAnimationItem,
  type PostBackground,
  type PostBox,
  type PostCanvasRatio,
  type PostCardItem,
  type PostClipEdge,
  type PostClipShape,
  type PostFraming,
  type PostSourceGeometry,
  type PostAutoAdjust,
  type PostTransitionOut,
  type PostTextStyle,
  type PostTextAnimation,
  type PostItem,
  type PostKeyframe,
  type PostMovesMode,
  type PostProject,
  type PostStaffEffectId,
  type PostTextSize,
  type PostTrack,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import {
  clampShapeRatio,
  postCanvasOf,
} from "$lib/shared/media-composition/domain/post-canvas";
import {
  edgeOf,
  mergeEdge,
} from "$lib/shared/media-composition/domain/post-clip-edge";
import {
  framingAt,
  channelValueAt,
  clearItemKeyframes,
  keyframeCount,
  isAnimated,
  shiftKeyframes,
  writeChannelValue,
} from "$lib/shared/media-composition/domain/post-project-keyframes";
import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";
import { shiftTakeTiming } from "$lib/shared/media-composition/domain/take-timing";

/**
 * The timeline's edits. Each one is pure: it takes the project and returns
 * the next one, laid out by `normalizeProject`. An edit that changes nothing
 * returns the project it was given, so the caller can skip the undo step.
 */

export interface EditContext {
  now: number;
}

// ---------------------------------------------------------------------------
// Takes
// ---------------------------------------------------------------------------

/**
 * Adds a raw video to the project, once per file: the same file added again
 * refreshes the stored take and keeps its id. Adds no clips.
 */
export function addTake(
  project: PostProject,
  take: PostTake,
  ctx: EditContext
): PostProject {
  const existing = project.takes.find(
    (entry) => entry.takeKey === take.takeKey
  );
  if (existing) {
    const refreshed: PostTake = {
      ...existing,
      label: take.label,
      ref: take.ref,
      durationSeconds: take.durationSeconds,
    };
    if (
      refreshed.label === existing.label &&
      refreshed.durationSeconds === existing.durationSeconds &&
      JSON.stringify(refreshed.ref) === JSON.stringify(existing.ref)
    ) {
      return project;
    }
    return finish(
      {
        ...project,
        takes: project.takes.map((entry) =>
          entry === existing ? refreshed : entry
        ),
      },
      ctx
    );
  }
  const taken = new Set(project.takes.map((entry) => entry.id));
  let id = take.id;
  for (let n = project.takes.length + 1; taken.has(id); n++) id = `take-${n}`;
  return finish(
    { ...project, takes: [...project.takes, { ...take, id }] },
    ctx
  );
}

/** Removes a take and every clip cut from it; the main track closes up. */
export function removeTake(
  project: PostProject,
  takeId: string,
  ctx: EditContext
): PostProject {
  if (!project.takes.some((take) => take.id === takeId)) return project;
  const gone = new Set<string>();
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (item.kind === "video" && item.takeId === takeId) gone.add(item.id);
    }
  }
  for (const id of [...gone]) addFillOverlays(project, id, gone);
  return finish(
    {
      ...withoutItems(project, gone),
      takes: project.takes.filter((take) => take.id !== takeId),
    },
    ctx
  );
}

/** A longer copy of a take's video, holding the old one `offsetSeconds` in. */
export interface TakeReplacement {
  ref: PostTake["ref"];
  takeKey: string;
  durationSeconds: number;
  offsetSeconds: number;
}

/**
 * Points a take at a longer copy of its video, such as the whole recording a
 * clip was cut from. Every clip, key and landing timed against the take moves
 * with the footage, so the post plays exactly as before and each clip's edges
 * can then open out into the footage around it. A copy that doesn't hold
 * every clip changes nothing.
 */
export function replaceTakeMedia(
  project: PostProject,
  takeId: string,
  replacement: TakeReplacement,
  ctx: EditContext
): PostProject {
  const take = project.takes.find((entry) => entry.id === takeId);
  const { offsetSeconds: offset, durationSeconds } = replacement;
  if (
    !take ||
    !Number.isFinite(offset) ||
    offset < 0 ||
    !Number.isFinite(durationSeconds) ||
    offset + take.durationSeconds > durationSeconds + POST_TIME_EPSILON
  )
    return project;
  const shiftKeys = <T>(keys: PostKeyframe<T>[] | undefined) =>
    keys?.map((key) => ({ ...key, t: key.t + offset }));
  const move = (item: PostVideoItem): PostVideoItem => {
    const keyframes = item.keyframes && {
      ...item.keyframes,
      ...(item.keyframes.framing
        ? { framing: shiftKeys(item.keyframes.framing) }
        : {}),
      ...(item.keyframes.sourceGeometry
        ? { sourceGeometry: shiftKeys(item.keyframes.sourceGeometry) }
        : {}),
      ...(item.keyframes.box ? { box: shiftKeys(item.keyframes.box) } : {}),
      ...(item.keyframes.opacity
        ? { opacity: shiftKeys(item.keyframes.opacity) }
        : {}),
    };
    return {
      ...item,
      sourceIn: item.sourceIn + offset,
      sourceOut: item.sourceOut + offset,
      ...(keyframes ? { keyframes } : {}),
    };
  };
  const timing = project.timings?.[takeId];
  return finish(
    {
      ...project,
      takes: project.takes.map((entry) =>
        entry === take
          ? {
              ...take,
              ref: replacement.ref,
              takeKey: replacement.takeKey,
              durationSeconds,
            }
          : entry
      ),
      tracks: project.tracks.map((track) => ({
        ...track,
        items: track.items.map((item) =>
          item.kind === "video" && item.takeId === takeId ? move(item) : item
        ),
      })),
      ...(timing
        ? {
            timings: {
              ...project.timings,
              [takeId]: shiftTakeTiming(
                timing,
                offset,
                { takeKey: replacement.takeKey, durationSeconds },
                ctx.now
              ),
            },
          }
        : {}),
    },
    ctx
  );
}

// ---------------------------------------------------------------------------
// Adding
// ---------------------------------------------------------------------------

/** Puts a clip of a take, all of it by default, on the end of the main track. */
export function appendVideoClip(
  project: PostProject,
  takeId: string,
  ctx: EditContext,
  span?: { sourceIn: number; sourceOut: number }
): { project: PostProject; itemId: string } | null {
  const take = project.takes.find((entry) => entry.id === takeId);
  if (!take) return null;
  const itemId = createIdAllocator(project)("video");
  const clip: PostVideoItem = {
    ...newVideoFields(take, span?.sourceIn ?? 0, span?.sourceOut ?? Infinity),
    id: itemId,
    start: 0,
    box: { ...POST_BOX.full },
    anchor: null,
    fill: false,
  };
  return { project: finish(appendToMain(project, clip), ctx), itemId };
}

/** Puts the choreo card on the end of the main track. */
export function appendCardClip(
  project: PostProject,
  ctx: EditContext,
  init: { label?: string; fadeIn?: number } = {}
): { project: PostProject; itemId: string } {
  const itemId = createIdAllocator(project)("card");
  const label = cleanLabel(init.label);
  const clip: PostCardItem = {
    id: itemId,
    kind: "card",
    ...(label ? { label } : {}),
    start: 0,
    duration: POST_DEFAULT_CARD_SECONDS,
    box: { ...POST_BOX.full },
    opacity: 1,
    fadeIn: clamp(init.fadeIn ?? 0, 0, POST_DEFAULT_CARD_SECONDS),
    fadeOut: 0,
    anchor: null,
    fill: false,
  };
  return { project: finish(appendToMain(project, clip), ctx), itemId };
}

export type NewOverlayKind =
  | "animation"
  | "moves"
  | "carousel"
  | "card"
  | "text"
  | "video";

export interface NewOverlaySpec {
  kind: NewOverlayKind;
  /** Post seconds. */
  at: number;
  /** Defaults to POST_DEFAULT_OVERLAY_SECONDS; a clip's comes from its span. */
  duration?: number;
  box?: PostBox;
  mode?: PostMovesMode;
  text?: string;
  size?: PostTextSize;
  overlay?: boolean;
  animationAppearance?: PostAnimationItem["animationAppearance"] | null;
  cardAppearance?: PostCardItem["cardAppearance"] | null;
  takeId?: string;
  sourceIn?: number;
  sourceOut?: number;
  /** Follow the main clip under `at` and span it (not for a clip). */
  fill?: boolean;
  label?: string;
}

/**
 * Adds an item above the footage at a post time. It follows the main clip
 * under it and goes on the top overlay track, or a new one when that track
 * is busy there.
 */
export function addOverlayItem(
  project: PostProject,
  spec: NewOverlaySpec,
  ctx: EditContext
): { project: PostProject; itemId: string } | null {
  const nextId = createIdAllocator(project);
  const at = Math.max(0, finiteOr(spec.at, 0));
  const under = mainItemAt(project, at);
  const label = cleanLabel(spec.label);
  const box = clampBox(spec.box ?? defaultBoxFor(spec.kind));
  const common = {
    ...(label ? { label } : {}),
    box,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
  };

  let item: PostItem;
  if (spec.kind === "video") {
    const take = project.takes.find((entry) => entry.id === spec.takeId);
    if (!take) return null;
    item = {
      ...newVideoFields(take, spec.sourceIn ?? 0, spec.sourceOut ?? Infinity),
      ...common,
      id: nextId("video"),
      start: at,
      anchor: under ? { itemId: under.id, offset: at - under.start } : null,
      fill: false,
    };
  } else {
    const fill = Boolean(spec.fill && under);
    const start = fill && under ? under.start : at;
    const duration =
      fill && under
        ? under.duration
        : Math.max(
            POST_MIN_ITEM_SECONDS,
            finiteOr(spec.duration, POST_DEFAULT_OVERLAY_SECONDS)
          );
    item = withKind(spec.kind, spec, {
      ...common,
      id: nextId(spec.kind),
      start,
      duration,
      anchor: under ? { itemId: under.id, offset: start - under.start } : null,
      fill,
    });
  }

  const top = project.tracks.length - 1;
  const topTrack = project.tracks[top]!;
  const next =
    top > MAIN_TRACK_INDEX &&
    !topTrack.hidden &&
    !topTrack.locked &&
    trackHasRoom(topTrack, item.start, itemEnd(item))
      ? withTrackItems(project, top, [...topTrack.items, item])
      : withNewTrackOnTop(project, item, nextId);
  return { project: finish(next, ctx), itemId: item.id };
}

/** The live view can take a video's place when its visible area fits the editable canvas. */
export function canReplaceOverlayVideoWithAnimation(
  project: PostProject,
  itemId: string
): boolean {
  const located = findItem(project, itemId);
  if (
    !located ||
    located.trackIndex === MAIN_TRACK_INDEX ||
    project.tracks[located.trackIndex]?.locked ||
    located.item.kind !== "video"
  )
    return false;
  const video = located.item;
  // This operation is for the one recovered, video-only PIP, whose source is
  // retained as a take for undo. Other video overlays may carry sound.
  if (
    project.importSource?.format !== "inshot-recovery" ||
    !video.id.endsWith("-pip-1") ||
    video.takeId !== video.id
  )
    return false;
  if (video.keyframes?.sourceGeometry?.length) return false;
  const under = mainItemAt(project, video.start);
  if (
    under?.kind !== "video" ||
    itemEnd(video) > itemEnd(under) + POST_TIME_EPSILON
  )
    return false;
  const geometry = video.sourceGeometry;
  if (!geometry) return true;
  // The recovered PIP can exceed the canvas by a few native float units.
  // Larger overflow or a second, rotated box cannot be preserved by PostBox.
  const box = video.box;
  if (
    box.x !== 0 ||
    box.y !== 0 ||
    box.width !== 1 ||
    box.height !== 1 ||
    box.turn ||
    video.keyframes?.box?.length
  )
    return false;
  const tolerance = 0.001;
  return (
    geometry.width >= POST_MIN_BOX_SIZE &&
    geometry.height >= POST_MIN_BOX_SIZE &&
    geometry.x >= -tolerance &&
    geometry.y >= -tolerance &&
    geometry.x + geometry.width <= 1 + tolerance &&
    geometry.y + geometry.height <= 1 + tolerance
  );
}

/** Swaps one PIP source for the sequence rendered from the camera take beneath it. */
export function replaceOverlayVideoWithAnimation(
  project: PostProject,
  itemId: string,
  ctx: EditContext
): PostProject {
  if (!canReplaceOverlayVideoWithAnimation(project, itemId)) return project;
  const video = findItem(project, itemId)!.item as PostVideoItem;
  const geometry = video.sourceGeometry;
  const box = geometry
    ? clampBox({
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        turn: geometry.rotation,
      })
    : video.box;
  const animation: PostAnimationItem = {
    id: video.id,
    kind: "animation",
    start: video.start,
    duration: video.duration,
    box,
    opacity: video.opacity,
    fadeIn: video.fadeIn,
    fadeOut: video.fadeOut,
    anchor: video.anchor,
    fill: false,
    overlay: false,
    ...(video.keyframes?.box || video.keyframes?.opacity
      ? {
          keyframes: {
            ...(video.keyframes.box
              ? {
                  box: video.keyframes.box.map((key) => ({
                    ...key,
                    t: (key.t - video.sourceIn) / video.speed,
                  })),
                }
              : {}),
            ...(video.keyframes.opacity
              ? {
                  opacity: video.keyframes.opacity.map((key) => ({
                    ...key,
                    t: (key.t - video.sourceIn) / video.speed,
                  })),
                }
              : {}),
          },
        }
      : {}),
  };
  return finish(replaceItem(project, itemId, animation), ctx);
}

// ---------------------------------------------------------------------------
// Split, delete, duplicate
// ---------------------------------------------------------------------------

/**
 * Cuts an item in two at a post time; the second piece is new. Splitting a
 * main clip splits its look with it, and overlays after the cut follow the
 * second piece. Returns null unless the cut leaves both pieces grabbable.
 */
export function splitItemAt(
  project: PostProject,
  itemId: string,
  seconds: number,
  ctx: EditContext
): { project: PostProject; newItemId: string } | null {
  const located = findItem(project, itemId);
  if (!located || !Number.isFinite(seconds)) return null;
  const { item, trackIndex, itemIndex } = located;
  const cut = seconds - item.start;
  if (
    !(cut > POST_MIN_ITEM_SECONDS) ||
    !(item.duration - cut > POST_MIN_ITEM_SECONDS)
  ) {
    return null;
  }

  const nextId = createIdAllocator(project);
  const [first, second] = splitPieces(item, cut, nextId(item.kind));
  const isMain = trackIndex === MAIN_TRACK_INDEX;
  const firstPiece = isMain ? first : withOverlaySplitAnchor(first, item, 0);
  const secondPiece = isMain
    ? second
    : withOverlaySplitAnchor(second, item, cut);

  const trackItems = [...project.tracks[trackIndex]!.items];
  trackItems.splice(itemIndex, 1, firstPiece, secondPiece);
  let next = withTrackItems(project, trackIndex, trackItems);

  if (isMain) {
    // The look goes on across the cut; overlays after it stay put in time.
    for (const {
      item: follower,
      trackIndex: followerTrack,
    } of overlaysAnchoredTo(project, item.id)) {
      if (follower.fill) {
        const tail: PostItem = {
          ...follower,
          id: nextId(follower.kind),
          fadeIn: 0,
          anchor: { itemId: secondPiece.id, offset: 0 },
        };
        next = replaceItem(next, follower.id, { ...follower, fadeOut: 0 });
        next = withTrackItems(next, followerTrack, [
          ...next.tracks[followerTrack]!.items,
          tail,
        ]);
      } else if (follower.start >= seconds - POST_TIME_EPSILON) {
        next = replaceItem(next, follower.id, {
          ...follower,
          anchor: { itemId: secondPiece.id, offset: follower.start - seconds },
        });
      }
    }
  }
  return { project: finish(next, ctx), newItemId: secondPiece.id };
}

/**
 * Removes an item. A main clip takes its look with it; its other overlays
 * stay where they stand and follow the clip now under them.
 */
export function deleteItem(
  project: PostProject,
  itemId: string,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (!located) return project;
  const gone = new Set([itemId]);
  if (located.trackIndex === MAIN_TRACK_INDEX) {
    addFillOverlays(project, itemId, gone);
  }
  return finish(withoutItems(project, gone), ctx);
}

/**
 * Copies an item. A main clip's copy follows it with its look; an overlay's
 * copy starts where the original ends, on the same track when there is room.
 */
export function duplicateItem(
  project: PostProject,
  itemId: string,
  ctx: EditContext
): { project: PostProject; newItemId: string } | null {
  const located = findItem(project, itemId);
  if (!located) return null;
  const { item, trackIndex, itemIndex } = located;
  const nextId = createIdAllocator(project);
  const newItemId = nextId(item.kind);

  if (trackIndex === MAIN_TRACK_INDEX) {
    const mainTrack = [...project.tracks[MAIN_TRACK_INDEX]!.items];
    if (
      (item.kind === "video" || item.kind === "image") &&
      item.transitionOut
    ) {
      const { transitionOut: _moved, ...withoutTransition } = item;
      mainTrack[itemIndex] = withoutTransition as PostItem;
    }
    mainTrack.splice(itemIndex + 1, 0, { ...item, id: newItemId });
    let next = withTrackItems(project, MAIN_TRACK_INDEX, mainTrack);
    for (const {
      item: follower,
      trackIndex: followerTrack,
    } of overlaysAnchoredTo(project, item.id)) {
      if (!follower.fill) continue;
      next = withTrackItems(next, followerTrack, [
        ...next.tracks[followerTrack]!.items,
        {
          ...follower,
          id: nextId(follower.kind),
          anchor: { itemId: newItemId, offset: 0 },
        },
      ]);
    }
    return { project: finish(next, ctx), newItemId };
  }

  const start = itemEnd(item);
  const copy = {
    ...item,
    id: newItemId,
    start,
    fill: false,
    anchor: anchorAt(project, start),
  } as PostItem;
  return {
    project: finish(placeOnOrAbove(project, copy, trackIndex, nextId), ctx),
    newItemId,
  };
}

// ---------------------------------------------------------------------------
// Moving and trimming
// ---------------------------------------------------------------------------

/** Reorders the main track; `toIndex` is the clip's place in the result. */
export function moveMainItem(
  project: PostProject,
  itemId: string,
  toIndex: number,
  ctx: EditContext
): PostProject {
  const items = project.tracks[MAIN_TRACK_INDEX]!.items;
  const from = items.findIndex((item) => item.id === itemId);
  if (from < 0 || !Number.isFinite(toIndex)) return project;
  const to = clamp(Math.round(toIndex), 0, items.length - 1);
  if (to === from) return project;
  const reordered = [...items];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved!);
  return finish(withTrackItems(project, MAIN_TRACK_INDEX, reordered), ctx);
}

/** Places a main clip at a chosen time, pushing clips it meets to the right. */
export function placeMainItem(
  project: PostProject,
  itemId: string,
  seconds: number,
  ctx: EditContext
): PostProject {
  const items = project.tracks[MAIN_TRACK_INDEX]!.items;
  const item = items.find((candidate) => candidate.id === itemId);
  if (!item || !Number.isFinite(seconds)) return project;
  const start = Math.max(0, seconds);
  if (Math.abs(start - item.start) < POST_TIME_EPSILON) return project;

  const before: PostItem[] = [];
  const after: PostItem[] = [];
  for (const candidate of items) {
    if (candidate.id === itemId) continue;
    (itemEnd(candidate) <= start + POST_TIME_EPSILON ? before : after).push({
      ...candidate,
      pinnedStart: true,
    });
  }
  const moved = { ...item, start, pinnedStart: true };
  let cursor = itemEnd(moved);
  const pushed = after.map((candidate) => {
    const nextStart = Math.max(cursor, candidate.start);
    cursor = nextStart + candidate.duration;
    return nextStart === candidate.start
      ? candidate
      : { ...candidate, start: nextStart };
  });
  return finish(
    withTrackItems(project, MAIN_TRACK_INDEX, [...before, moved, ...pushed]),
    ctx
  );
}

/**
 * Moves an overlay in time and between tracks. `trackIndex` equal to the
 * number of tracks asks for a new track on top. A busy target track sends
 * the item to the nearest track above with room. The item then follows the
 * main clip under its new start.
 */
export function moveOverlayItem(
  project: PostProject,
  itemId: string,
  target: { start: number; trackIndex: number },
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (!located || located.trackIndex === MAIN_TRACK_INDEX) return project;
  const { item, trackIndex: fromTrack } = located;
  const start = Math.max(0, finiteOr(target.start, item.start));
  let trackIndex = clamp(
    Math.round(finiteOr(target.trackIndex, fromTrack)),
    MAIN_TRACK_INDEX + 1,
    project.tracks.length
  );
  // A lone item on the top track asking for a new top track is already there.
  if (
    trackIndex === project.tracks.length &&
    fromTrack === project.tracks.length - 1 &&
    project.tracks[fromTrack]!.items.length === 1
  ) {
    trackIndex = fromTrack;
  }
  const moved = {
    ...item,
    start,
    fill: false,
    anchor: anchorAt(project, start),
  } as PostItem;

  const end = itemEnd(moved);
  let landing = -1;
  for (let index = trackIndex; index < project.tracks.length; index++) {
    const candidate = project.tracks[index]!;
    // A hidden or locked track is full to a landing item: never on it. An
    // item already on a hidden track can still slide along it.
    if (candidate.locked || (candidate.hidden && index !== fromTrack)) continue;
    if (trackHasRoom(candidate, start, end, item.id)) {
      landing = index;
      break;
    }
  }
  if (landing === fromTrack && sameItem(moved, item)) return project;

  const without = withoutItems(project, new Set([item.id]));
  const next =
    landing < 0
      ? withNewTrackOnTop(without, moved, createIdAllocator(project))
      : withTrackItems(without, landing, [
          ...without.tracks[landing]!.items,
          moved,
        ]);
  return finish(next, ctx);
}

/**
 * Moves one edge of an item to a post time. The result depends only on the
 * project and the time, so a drag can re-apply it to the project it started
 * from. Main clips stay end to end: trimming a start cuts the head and the
 * clip keeps its place. An overlay's trim ends any fill and it follows the
 * main clip under its new start.
 */
export function trimItem(
  project: PostProject,
  itemId: string,
  edge: "start" | "end",
  seconds: number,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (!located || !Number.isFinite(seconds)) return project;
  const { item, trackIndex } = located;
  // A drag that lands back on the edge it started from - including a
  // cancelled drag re-applying the original edge - changes nothing. Bailing
  // out here, before any recompute, keeps a fill-linked overlay linked and
  // avoids floating-point noise in a duration that was never really touched.
  const currentEdge = edge === "start" ? item.start : itemEnd(item);
  if (Math.abs(seconds - currentEdge) <= POST_TIME_EPSILON) return project;
  const isMain = trackIndex === MAIN_TRACK_INDEX;
  const delta = seconds - item.start;
  let trimmed: PostItem;

  if (item.kind === "video") {
    const minSpan = POST_MIN_ITEM_SECONDS * item.speed;
    const limit = takeLength(project, item.takeId);
    if (edge === "end") {
      trimmed = {
        ...item,
        sourceOut: clamp(
          item.sourceIn + delta * item.speed,
          item.sourceIn + minSpan,
          Math.max(item.sourceIn + minSpan, limit)
        ),
      };
    } else {
      // The head can move back to the take's first frame, or up to just
      // before the clip's last one; an overlay's start moves with it.
      let shift = clamp(
        delta * item.speed,
        -item.sourceIn,
        item.sourceOut - minSpan - item.sourceIn
      );
      if (!isMain) shift = Math.max(shift, -item.start * item.speed);
      trimmed = {
        ...item,
        sourceIn: item.sourceIn + shift,
        start: isMain ? item.start : item.start + shift / item.speed,
      };
    }
  } else if (edge === "end") {
    trimmed = { ...item, duration: Math.max(POST_MIN_ITEM_SECONDS, delta) };
  } else if (isMain) {
    // A main-track card's own start never moves - the layout closes the gap -
    // but the head cut is however much shorter the clip just got.
    const nextDuration = Math.max(POST_MIN_ITEM_SECONDS, item.duration - delta);
    trimmed = shiftKeyframes(
      { ...item, duration: nextDuration },
      item.duration - nextDuration
    );
  } else {
    const end = itemEnd(item);
    const start = clamp(seconds, 0, Math.max(0, end - POST_MIN_ITEM_SECONDS));
    trimmed = shiftKeyframes(
      { ...item, start, duration: end - start },
      start - item.start
    );
  }

  if (!isMain) {
    trimmed = {
      ...trimmed,
      fill: false,
      anchor: anchorAt(project, trimmed.start),
    };
  }
  if (sameItem(trimmed, item)) return project;
  return finish(replaceItem(project, itemId, trimmed), ctx);
}

/**
 * Moves a clip's In or Out point to a time in its take: the same trim as
 * moving that edge on the timeline, with the point named in the take's time.
 */
export function trimItemToSource(
  project: PostProject,
  itemId: string,
  edge: "start" | "end",
  sourceSeconds: number,
  ctx: EditContext
): PostProject {
  const item = findItem(project, itemId)?.item;
  if (item?.kind !== "video" || !Number.isFinite(sourceSeconds)) return project;
  const seconds = item.start + (sourceSeconds - item.sourceIn) / item.speed;
  return trimItem(project, itemId, edge, seconds, ctx);
}

/** A clip's speed; its span stays and its length follows. */
export function setVideoSpeed(
  project: PostProject,
  itemId: string,
  speed: number,
  ctx: EditContext
): PostProject {
  const item = findItem(project, itemId)?.item;
  if (item?.kind !== "video" || !Number.isFinite(speed)) return project;
  const next = clamp(speed, POST_MIN_SPEED, POST_MAX_SPEED);
  if (next === item.speed) return project;
  return finish(replaceItem(project, itemId, { ...item, speed: next }), ctx);
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Fields an item's settings change. Fields another kind owns are ignored. */
export interface PostItemPatch {
  /** Null or blank removes the name. */
  label?: string | null;
  box?: PostBox;
  opacity?: number;
  fadeIn?: number;
  fadeOut?: number;
  /** Not for a clip, whose length comes from its span. Ends an overlay's fill. */
  duration?: number;
  fit?: "cover" | "contain";
  /** A clip's own shape in its box; null lets it fill the box again. */
  shape?: PostClipShape | null;
  /** A clip's corners, border and shadow, over its own; null squares them. */
  edge?: Partial<PostClipEdge> | null;
  zoom?: number;
  panX?: number;
  panY?: number;
  rotation?: number;
  flip?: boolean;
  volume?: number;
  sourceGeometry?: PostSourceGeometry | null;
  transitionOut?: PostTransitionOut | null;
  autoAdjust?: PostAutoAdjust | null;
  colorGrade?: PostVideoItem["colorGrade"] | null;
  sourceIn?: number;
  sourceOut?: number;
  overlay?: boolean;
  mode?: PostMovesMode;
  text?: string;
  size?: PostTextSize;
  style?: PostTextStyle | null;
  animation?: PostTextAnimation | null;
  /** A clip's effect on its staff ends; null removes it. */
  staffEffect?: PostStaffEffectId | null;
  animationAppearance?: PostAnimationItem["animationAppearance"] | null;
  cardAppearance?: PostCardItem["cardAppearance"] | null;
}

export function updateItem(
  project: PostProject,
  itemId: string,
  patch: PostItemPatch,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (!located) return project;
  const { item, trackIndex } = located;
  const next = { ...item } as Record<string, unknown>;

  if (patch.label !== undefined) {
    const label = cleanLabel(patch.label ?? "");
    if (label) next.label = label;
    else delete next.label;
  }
  if (patch.box) next.box = clampBox(patch.box);
  setNumber(next, "opacity", patch.opacity, 0, 1);

  if (item.kind === "video") {
    const minSpan = POST_MIN_ITEM_SECONDS * item.speed;
    const limit = takeLength(project, item.takeId);
    let sourceIn = item.sourceIn;
    let sourceOut = item.sourceOut;
    if (isFiniteNumber(patch.sourceIn)) {
      const ceiling = isFiniteNumber(patch.sourceOut) ? limit : sourceOut;
      sourceIn = clamp(patch.sourceIn, 0, Math.max(0, ceiling - minSpan));
    }
    if (isFiniteNumber(patch.sourceOut)) {
      sourceOut = clamp(
        patch.sourceOut,
        sourceIn + minSpan,
        Math.max(sourceIn + minSpan, limit)
      );
    }
    next.sourceIn = sourceIn;
    next.sourceOut = sourceOut;
    if (patch.fit) next.fit = patch.fit;
    if (patch.shape !== undefined) {
      if (patch.shape) {
        next.shape = {
          kind: patch.shape.kind,
          ratio: clampShapeRatio(patch.shape.ratio),
        };
      } else delete next.shape;
    }
    if (patch.edge !== undefined) {
      const edge = patch.edge ? mergeEdge(edgeOf(item), patch.edge) : null;
      if (edge) next.edge = edge;
      else delete next.edge;
    }
    setNumber(next, "zoom", patch.zoom, POST_MIN_ZOOM, POST_MAX_ZOOM);
    setNumber(next, "panX", patch.panX, -0.5, 0.5);
    setNumber(next, "panY", patch.panY, -0.5, 0.5);
    if (isFiniteNumber(patch.rotation))
      next.rotation = wrapDegrees(patch.rotation);
    if (patch.flip !== undefined) next.flip = patch.flip;
    setNumber(next, "volume", patch.volume, 0, POST_MAX_VOLUME);
    if (patch.staffEffect !== undefined) {
      if (patch.staffEffect) next.staffEffect = { effect: patch.staffEffect };
      else delete next.staffEffect;
    }
    if (patch.autoAdjust !== undefined) {
      if (patch.autoAdjust) next.autoAdjust = patch.autoAdjust;
      else delete next.autoAdjust;
    }
    if (patch.colorGrade !== undefined) {
      if (patch.colorGrade) next.colorGrade = patch.colorGrade;
      else delete next.colorGrade;
    }
  } else if (isFiniteNumber(patch.duration)) {
    next.duration = Math.max(POST_MIN_ITEM_SECONDS, patch.duration);
    if (trackIndex !== MAIN_TRACK_INDEX) next.fill = false;
  }
  if (item.kind === "video" || item.kind === "image") {
    if (patch.sourceGeometry !== undefined) {
      if (patch.sourceGeometry) next.sourceGeometry = patch.sourceGeometry;
      else delete next.sourceGeometry;
    }
    if (patch.transitionOut !== undefined) {
      if (patch.transitionOut) next.transitionOut = patch.transitionOut;
      else delete next.transitionOut;
    }
  }
  if (item.kind === "animation" && patch.overlay !== undefined) {
    next.overlay = patch.overlay;
  }
  if (
    (item.kind === "animation" || item.kind === "moves") &&
    patch.animationAppearance !== undefined
  ) {
    if (patch.animationAppearance)
      next.animationAppearance = patch.animationAppearance;
    else delete next.animationAppearance;
  }
  if (item.kind === "card" && patch.cardAppearance !== undefined) {
    if (patch.cardAppearance) next.cardAppearance = patch.cardAppearance;
    else delete next.cardAppearance;
  }
  if (item.kind === "moves" && patch.mode) next.mode = patch.mode;
  if (item.kind === "text") {
    if (patch.text !== undefined)
      next.text = patch.text.slice(0, POST_MAX_TEXT_LENGTH);
    if (patch.size) next.size = patch.size;
    if (patch.style !== undefined) {
      if (patch.style) next.style = patch.style;
      else delete next.style;
    }
    if (patch.animation !== undefined) {
      if (patch.animation) next.animation = patch.animation;
      else delete next.animation;
    }
  }

  // Fades fit inside the item's length as it will be laid out.
  const length =
    item.kind === "video"
      ? ((next.sourceOut as number) - (next.sourceIn as number)) / item.speed
      : (next.duration as number);
  setNumber(next, "fadeIn", patch.fadeIn, 0, length);
  setNumber(next, "fadeOut", patch.fadeOut, 0, length);

  const updated = next as unknown as PostItem;
  if (sameItem(updated, item)) return project;
  return finish(replaceItem(project, itemId, updated), ctx);
}

const FRAMING_PATCH_KEYS = ["zoom", "panX", "panY", "rotation"] as const;

/**
 * `updateItem`, except that a field belonging to an animated channel writes
 * (or updates) a keyframe at `s` instead of the static field: zoom, panX,
 * panY and rotation merge into that channel's framing at `s`, clamped the
 * same way `updateItem` clamps them.
 */
export function updateItemAt(
  project: PostProject,
  itemId: string,
  patch: PostItemPatch,
  s: number,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (!located) return project;
  const { item } = located;

  const framingAnimated =
    item.kind === "video" &&
    isAnimated(item, "framing") &&
    FRAMING_PATCH_KEYS.some((key) => patch[key] !== undefined);
  const boxAnimated = patch.box !== undefined && isAnimated(item, "box");
  const opacityAnimated =
    patch.opacity !== undefined && isAnimated(item, "opacity");
  const geometryAnimated =
    patch.sourceGeometry !== undefined &&
    patch.sourceGeometry !== null &&
    isAnimated(item, "sourceGeometry");

  if (
    !framingAnimated &&
    !boxAnimated &&
    !opacityAnimated &&
    !geometryAnimated
  ) {
    return updateItem(project, itemId, patch, ctx);
  }

  const rest: PostItemPatch = { ...patch };
  if (framingAnimated) {
    for (const key of FRAMING_PATCH_KEYS) delete rest[key];
  }
  if (boxAnimated) delete rest.box;
  if (opacityAnimated) delete rest.opacity;
  if (geometryAnimated) delete rest.sourceGeometry;

  let next =
    Object.keys(rest).length > 0
      ? updateItem(project, itemId, rest, ctx)
      : project;

  if (framingAnimated) {
    const current = framingAt(findItem(next, itemId)!.item as PostVideoItem, s);
    const merged: PostFraming = {
      zoom: patch.zoom ?? current.zoom,
      panX: patch.panX ?? current.panX,
      panY: patch.panY ?? current.panY,
      rotation:
        patch.rotation !== undefined
          ? wrapDegrees(patch.rotation)
          : current.rotation,
    };
    next = editItemKeyframes(
      next,
      itemId,
      (it) => writeChannelValue(it, "framing", s, merged),
      ctx
    );
  }
  if (boxAnimated) {
    next = editItemKeyframes(
      next,
      itemId,
      (it) => writeChannelValue(it, "box", s, clampBox(patch.box!)),
      ctx
    );
  }
  if (geometryAnimated) {
    next = editItemKeyframes(
      next,
      itemId,
      (it) => writeChannelValue(it, "sourceGeometry", s, patch.sourceGeometry!),
      ctx
    );
  }
  if (opacityAnimated) {
    next = editItemKeyframes(
      next,
      itemId,
      (it) => writeChannelValue(it, "opacity", s, patch.opacity!),
      ctx
    );
  }
  return next;
}

/** Applies an item-level keyframe edit (see `post-project-keyframes.ts`) and finishes. */
export function editItemKeyframes(
  project: PostProject,
  itemId: string,
  edit: (item: PostItem) => PostItem,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (!located) return project;
  const next = edit(located.item);
  if (next === located.item) return project;
  return finish(replaceItem(project, itemId, next), ctx);
}

/** Clear one clip or the whole post in a single normalized project edit. */
export function clearProjectKeyframes(
  project: PostProject,
  s: number,
  ctx: EditContext,
  itemId?: string
): PostProject {
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.locked) return track;
    const items = track.items.map((item) => {
      if ((itemId && item.id !== itemId) || keyframeCount(item) === 0)
        return item;
      const next = clearItemKeyframes(item, s);
      changed ||= next !== item;
      return next;
    });
    return items.some((item, index) => item !== track.items[index])
      ? { ...track, items }
      : track;
  });
  return changed ? finish({ ...project, tracks }, ctx) : project;
}

/** Zoom, pan and turn back to identity, and framing keyframes dropped. */
export function resetFraming(
  project: PostProject,
  itemId: string,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (!located || located.item.kind !== "video") return project;
  const item = located.item;
  const framing = item.keyframes?.framing;
  const isIdentity =
    item.zoom === 1 &&
    item.panX === 0 &&
    item.panY === 0 &&
    item.rotation === 0;
  if (isIdentity && (!framing || framing.length === 0)) return project;
  const next = { ...item, zoom: 1, panX: 0, panY: 0, rotation: 0 } as Record<
    string,
    unknown
  >;
  if (item.keyframes) {
    const { framing: _dropped, ...restChannels } = item.keyframes;
    if (Object.keys(restChannels).length > 0) next.keyframes = restChannels;
    else delete next.keyframes;
  }
  return finish(replaceItem(project, itemId, next as unknown as PostItem), ctx);
}

/**
 * Makes an overlay span the main clip under its start and follow it, or
 * lets it keep its own length. Clips never fill: their length is their own.
 */
export function setItemFill(
  project: PostProject,
  itemId: string,
  fill: boolean,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (
    !located ||
    located.trackIndex === MAIN_TRACK_INDEX ||
    located.item.kind === "video" ||
    located.item.fill === fill
  ) {
    return project;
  }
  const { item } = located;
  if (!fill)
    return finish(replaceItem(project, itemId, { ...item, fill: false }), ctx);
  const under = mainItemAt(project, item.start);
  if (!under) return project;
  return finish(
    replaceItem(project, itemId, {
      ...item,
      fill: true,
      start: under.start,
      duration: under.duration,
      anchor: { itemId: under.id, offset: 0 },
    }),
    ctx
  );
}

export function setTrackFlag(
  project: PostProject,
  trackId: string,
  flag: "hidden" | "locked",
  value: boolean,
  ctx: EditContext
): PostProject {
  const track = project.tracks.find((entry) => entry.id === trackId);
  if (!track || track[flag] === value) return project;
  return finish(
    {
      ...project,
      tracks: project.tracks.map((entry) =>
        entry !== track
          ? entry
          : flag === "hidden"
            ? { ...entry, hidden: value }
            : { ...entry, locked: value }
      ),
    },
    ctx
  );
}

/** The post's shape; the default shape is stored as none. */
export function setProjectCanvas(
  project: PostProject,
  canvas: PostCanvasRatio,
  ctx: EditContext
): PostProject {
  if (postCanvasOf(project) === canvas) return project;
  const next: PostProject = { ...project, canvas };
  if (canvas === POST_DEFAULT_CANVAS) delete next.canvas;
  return finish(next, ctx);
}

/** What fills the frame behind the items; the default is stored as none. */
export function setProjectBackground(
  project: PostProject,
  background: PostBackground,
  ctx: EditContext
): PostProject {
  if ((project.background ?? POST_DEFAULT_BACKGROUND) === background)
    return project;
  const next: PostProject = { ...project, background };
  if (background === POST_DEFAULT_BACKGROUND) delete next.background;
  return finish(next, ctx);
}

export function setProjectAudio(
  project: PostProject,
  audio: PostProject["audio"],
  ctx: EditContext
): PostProject {
  if (project.audio === audio) return project;
  return finish({ ...project, audio }, ctx);
}

// ---------------------------------------------------------------------------
// Helpers shared with the looks
// ---------------------------------------------------------------------------

/** The edited project, stamped and laid out by the timeline's rules. */
export function finish(next: PostProject, ctx: EditContext): PostProject {
  return normalizeProject({ ...next, updatedAt: ctx.now });
}

export function replaceItem(
  project: PostProject,
  itemId: string,
  next: PostItem
): PostProject {
  return {
    ...project,
    tracks: project.tracks.map((track) =>
      track.items.some((item) => item.id === itemId)
        ? {
            ...track,
            items: track.items.map((item) =>
              item.id === itemId ? next : item
            ),
          }
        : track
    ),
  };
}

export function withoutItems(
  project: PostProject,
  ids: ReadonlySet<string>
): PostProject {
  return {
    ...project,
    tracks: project.tracks.map((track) =>
      track.items.some((item) => ids.has(item.id))
        ? { ...track, items: track.items.filter((item) => !ids.has(item.id)) }
        : track
    ),
  };
}

export function withTrackItems(
  project: PostProject,
  trackIndex: number,
  items: PostItem[]
): PostProject {
  return {
    ...project,
    tracks: project.tracks.map((track, index) =>
      index === trackIndex ? { ...track, items } : track
    ),
  };
}

/** Collects the ids of the overlays that make up a main clip's look. */
export function addFillOverlays(
  project: PostProject,
  mainItemId: string,
  into: Set<string>
): void {
  for (const { item } of overlaysAnchoredTo(project, mainItemId)) {
    if (item.fill) into.add(item.id);
  }
}

export function cleanLabel(label: string | undefined): string {
  return (label ?? "").trim().slice(0, POST_MAX_LABEL_LENGTH).trim();
}

type ItemBase = Omit<PostCardItem, "kind">;

function withKind(
  kind: Exclude<NewOverlayKind, "video">,
  spec: NewOverlaySpec,
  base: ItemBase
): PostItem {
  switch (kind) {
    case "animation":
      return { ...base, kind: "animation", overlay: spec.overlay ?? true };
    case "moves":
      return { ...base, kind: "moves", mode: spec.mode ?? "arrows" };
    case "carousel":
      return { ...base, kind: "carousel" };
    case "card":
      return { ...base, kind: "card" };
    case "text":
      return {
        ...base,
        kind: "text",
        text: (spec.text ?? "").slice(0, POST_MAX_TEXT_LENGTH),
        size: spec.size ?? "m",
      };
  }
}

/** The anchor that keeps an overlay at a post time: the main clip under it. */
function anchorAt(project: PostProject, start: number): PostAnchor | null {
  const under = mainItemAt(project, start);
  return under ? { itemId: under.id, offset: start - under.start } : null;
}

function appendToMain(project: PostProject, item: PostItem): PostProject {
  const main = project.tracks[MAIN_TRACK_INDEX]!;
  const last = main.items[main.items.length - 1];
  return withTrackItems(project, MAIN_TRACK_INDEX, [
    ...main.items,
    { ...item, start: last ? itemEnd(last) : 0 },
  ]);
}

function withNewTrackOnTop(
  project: PostProject,
  item: PostItem,
  nextId: (prefix: string) => string
): PostProject {
  const track: PostTrack = {
    id: nextId("track"),
    hidden: false,
    locked: false,
    items: [item],
  };
  return { ...project, tracks: [...project.tracks, track] };
}

/** On `fromIndex` when there is room, else the nearest track above, else a new one. */
function placeOnOrAbove(
  project: PostProject,
  item: PostItem,
  fromIndex: number,
  nextId: (prefix: string) => string
): PostProject {
  for (
    let index = Math.max(1, fromIndex);
    index < project.tracks.length;
    index++
  ) {
    const track = project.tracks[index]!;
    if (
      !track.hidden &&
      !track.locked &&
      trackHasRoom(track, item.start, itemEnd(item), item.id)
    ) {
      return withTrackItems(project, index, [...track.items, item]);
    }
  }
  return withNewTrackOnTop(project, item, nextId);
}

/** A fresh clip of a take at speed 1 with its span cut to the take. */
function newVideoFields(
  take: PostTake,
  sourceIn: number,
  sourceOut: number
): Omit<PostVideoItem, "id" | "start" | "box" | "anchor" | "fill"> {
  const length = take.durationSeconds;
  const from = clamp(
    finiteOr(sourceIn, 0),
    0,
    Math.max(0, length - POST_MIN_ITEM_SECONDS)
  );
  const to = clamp(
    Number.isNaN(sourceOut) ? length : sourceOut,
    from + POST_MIN_ITEM_SECONDS,
    Math.max(from + POST_MIN_ITEM_SECONDS, length)
  );
  return {
    kind: "video",
    takeId: take.id,
    sourceIn: from,
    sourceOut: to,
    speed: 1,
    duration: to - from,
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    fit: "cover",
    zoom: 1,
    panX: 0,
    panY: 0,
    rotation: 0,
    flip: false,
    volume: 1,
  };
}

/** The two pieces of a cut `cut` seconds into an item; no fade at the cut. */
function splitPieces(
  item: PostItem,
  cut: number,
  secondId: string
): [PostItem, PostItem] {
  if (item.kind === "video") {
    const at = item.sourceIn + cut * item.speed;
    return [
      {
        ...item,
        sourceOut: at,
        duration: cut,
        fadeOut: 0,
        transitionOut: undefined,
      },
      {
        ...item,
        id: secondId,
        sourceIn: at,
        start: item.start + cut,
        duration: item.duration - cut,
        fadeIn: 0,
      },
    ];
  }
  const second = shiftKeyframes(
    {
      ...item,
      id: secondId,
      start: item.start + cut,
      duration: item.duration - cut,
      fadeIn: 0,
    } as PostItem,
    cut
  );
  return [
    {
      ...item,
      duration: cut,
      fadeOut: 0,
      ...(item.kind === "image" ? { transitionOut: undefined } : {}),
    } as PostItem,
    second,
  ];
}

/** An overlay piece keeps following the original's clip, at its own offset. */
function withOverlaySplitAnchor(
  piece: PostItem,
  original: PostItem,
  shift: number
): PostItem {
  return {
    ...piece,
    fill: false,
    anchor: original.anchor
      ? {
          itemId: original.anchor.itemId,
          offset: original.anchor.offset + shift,
        }
      : null,
  } as PostItem;
}

function takeLength(project: PostProject, takeId: string): number {
  return (
    project.takes.find((take) => take.id === takeId)?.durationSeconds ??
    Infinity
  );
}

function sameItem(left: PostItem, right: PostItem): boolean {
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (x === y) continue;
    if (!x || !y || typeof x !== "object" || typeof y !== "object")
      return false;
    const xs = x as Record<string, unknown>;
    const ys = y as Record<string, unknown>;
    const inner = new Set([...Object.keys(xs), ...Object.keys(ys)]);
    for (const field of inner) if (xs[field] !== ys[field]) return false;
  }
  return true;
}

function setNumber(
  target: Record<string, unknown>,
  key: string,
  value: number | undefined,
  min: number,
  max: number
): void {
  if (isFiniteNumber(value)) target[key] = clamp(value, min, max);
  else if (typeof target[key] === "number") {
    target[key] = clamp(target[key] as number, min, Math.max(min, max));
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function finiteOr(value: number | undefined, fallback: number): number {
  return isFiniteNumber(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
