import {
  EASING_PRESETS,
  POST_MIN_ITEM_SECONDS,
  POST_TIME_EPSILON,
  addOverlayItem,
  boxAt,
  findItem,
  finish,
  finiteOr,
  itemEnd,
  postCanvasOf,
  postOutputSize,
  postSecondsOfKeyframe,
  replaceItem,
  setKeyframe,
  setSegmentEasing,
  shiftKeyframes,
  updateItem,
  type EditContext,
  type NewOverlaySpec,
  type PostItem,
  type PostItemKind,
  type PostProject,
} from "@austencloud/video-editor/core";
import {
  FLASH_ITEM_SECONDS,
  flashSquareBox,
} from "#lib/shared/media-composition/domain/flash.js";

/**
 * Two of tka's timeline edits for tutorial reels, pure like the rest: a
 * flash clip at a hit, and one canvas panel flying into the next clip on its
 * lane while it dissolves into it.
 */

export interface FlashInit {
  at?: number;
  strength?: number;
  fade?: number;
  marks?: boolean;
}

/**
 * A flash clip at `at` (its start is the hit): `FLASH_ITEM_SECONDS` long,
 * with a centred square box on the post's canvas.
 */
export function flashOverlaySpec(
  project: PostProject,
  init: FlashInit = {}
): NewOverlaySpec {
  return {
    kind: "flash",
    at: Math.max(0, finiteOr(init.at ?? 0, 0)),
    duration: FLASH_ITEM_SECONDS,
    box: flashSquareBox(postOutputSize(postCanvasOf(project))),
    fill: false,
    ...(init.strength !== undefined ? { strength: init.strength } : {}),
    ...(init.fade !== undefined ? { fade: init.fade } : {}),
    ...(init.marks !== undefined ? { marks: init.marks } : {}),
  };
}

/** Adds the flash clip `flashOverlaySpec` describes. */
export function addFlashItem(
  project: PostProject,
  ctx: EditContext,
  init: FlashInit = {}
): { project: PostProject; itemId: string } | null {
  return addOverlayItem(project, flashOverlaySpec(project, init), ctx);
}

/** The canvas kinds that can fly into the next clip. Footage has its own framing match. */
export const FLY_KINDS: readonly PostItemKind[] = [
  "animation",
  "moves",
  "mandala",
  "card",
];
/** How long the flight and its cross-fade last unless told otherwise. */
export const FLY_DEFAULT_SECONDS = 1.13;
/** The range the panel's length control offers. */
export const FLY_MIN_SECONDS = 0.2;
export const FLY_MAX_SECONDS = 3;
/** The flight's curve: slow away, fast across, slow to land. */
export const FLY_EASING = EASING_PRESETS["ease-in-out"];

interface FlyPair {
  item: PostItem;
  next: PostItem;
  /** The two are already joined by a cross-fade. */
  joined: boolean;
}

function flyPairOf(project: PostProject, itemId: string): FlyPair | null {
  const located = findItem(project, itemId);
  if (!located || !FLY_KINDS.includes(located.item.kind)) return null;
  const items = project.tracks[located.trackIndex]?.items ?? [];
  const next = items[located.itemIndex + 1];
  if (!next || !FLY_KINDS.includes(next.kind)) return null;
  const item = located.item;
  const transition = item.transitionOut;
  const joined =
    !!transition &&
    (transition.incomingId === undefined || transition.incomingId === next.id);
  // A cross-fade joins neighbours that meet; a gap between them has nothing to join.
  if (!joined && Math.abs(itemEnd(item) - next.start) > POST_TIME_EPSILON)
    return null;
  return { item, next, joined };
}

/** Whether the clip has a neighbour after it on its lane that it can fly into. */
export function canFlyIntoNext(project: PostProject, itemId: string): boolean {
  return flyPairOf(project, itemId) !== null;
}

/** The clip with no box keys between post seconds `from` and `to`, ends included. */
function withoutBoxKeysIn(item: PostItem, from: number, to: number): PostItem {
  const keys = item.keyframes?.box;
  if (!keys) return item;
  const kept = keys.filter((key) => {
    const s = postSecondsOfKeyframe(item, key.t);
    return s < from - POST_TIME_EPSILON || s > to + POST_TIME_EPSILON;
  });
  if (kept.length === keys.length) return item;
  const { box: _box, ...others } = item.keyframes ?? {};
  const keyframes = kept.length ? { ...others, box: kept } : others;
  const next = { ...item } as PostItem & { keyframes?: unknown };
  if (Object.keys(keyframes).length) next.keyframes = keyframes;
  else delete next.keyframes;
  return next as PostItem;
}

/** The clip riding the flight: a key at each end and the flight's curve between. */
function withFlight(
  item: PostItem,
  from: number,
  to: number,
  fromBox: ReturnType<typeof boxAt>,
  toBox: ReturnType<typeof boxAt>
): PostItem {
  let next = setKeyframe(item, "box", from, fromBox);
  next = setKeyframe(next, "box", to, toBox);
  return setSegmentEasing(next, "box", (from + to) / 2, FLY_EASING);
}

/** What `flyIntoNextEdit` did. */
export type FlyOutcome =
  /** The pair is joined, or joined again at a new length. */
  | "joined"
  /** It would write exactly what is there. */
  | "unchanged"
  /** The clip has no neighbour after it that it can fly into. */
  | "refused"
  /** The two clips cannot overlap for that long. */
  | "too-short";

/**
 * Flies a canvas clip into the next clip on its lane: it cross-fades into
 * that clip over `seconds`, and both ride one box path across the overlap,
 * from where the outgoing clip's box is as the overlap starts to where the
 * incoming clip's box is as it ends, on `FLY_EASING`. Both clips carry the
 * same two keys at the same times, so the two read as one panel that
 * changes what it shows on the way. Outside the overlap each clip keeps its
 * own box and keys.
 *
 * The keys are ordinary ones the author can move or change. Running it again
 * first takes out every box key inside the old overlap, so it replaces what
 * it wrote before.
 *
 * The cross-fade itself is the editor's own. On an overlay lane the editor
 * pulls the incoming clip and every clip after it earlier; these posts are
 * cut to a song, so here only the incoming clip's start moves: it starts
 * earlier by the overlap and keeps its end (and its own keys keep their post
 * times), and every later clip on the lane stays where it was. On the main
 * lane the editor's own layout stands.
 */
export function flyIntoNextEdit(
  project: PostProject,
  itemId: string,
  seconds: number,
  ctx: EditContext
): { project: PostProject; outcome: FlyOutcome } {
  const pair = flyPairOf(project, itemId);
  if (!pair) return { project, outcome: "refused" };
  const located = findItem(project, itemId)!;
  const overlayLane = located.trackIndex > 0;
  const lane = project.tracks[located.trackIndex]!.items;
  const nextId = pair.next.id;
  const nextIndex = located.itemIndex + 1;
  // Where the incoming clip ends, and the later clips start, before the edit.
  const incomingEnd = itemEnd(pair.next);
  const laterStarts = new Map(
    lane.slice(nextIndex + 1).map((item) => [item.id, item.start])
  );
  let next = project;
  if (pair.joined) {
    const from = pair.next.start;
    const to = itemEnd(pair.item);
    next = replaceItem(next, itemId, withoutBoxKeysIn(pair.item, from, to));
    next = replaceItem(next, nextId, withoutBoxKeysIn(pair.next, from, to));
  }
  const incomingBefore = findItem(next, nextId)!.item;
  next = updateItem(
    next,
    itemId,
    {
      transitionOut: {
        type: "crossfade",
        duration: Math.max(
          POST_MIN_ITEM_SECONDS,
          finiteOr(seconds, FLY_DEFAULT_SECONDS)
        ),
      },
    },
    ctx
  );
  if (overlayLane) {
    const moved = findItem(next, nextId)?.item;
    if (moved && moved.start < incomingEnd - POST_TIME_EPSILON) {
      // Back to its old end, with its own keys where they were on the post.
      const lead = incomingBefore.start - moved.start;
      next = replaceItem(next, nextId, {
        ...shiftKeyframes(moved, -lead),
        duration: incomingEnd - moved.start,
      } as PostItem);
    }
    for (const [id, start] of laterStarts) {
      const later = findItem(next, id)?.item;
      if (later && Math.abs(later.start - start) > POST_TIME_EPSILON / 10)
        next = replaceItem(next, id, { ...later, start } as PostItem);
    }
  }
  const outgoing = findItem(next, itemId)?.item;
  const incoming = findItem(next, nextId)?.item;
  if (!outgoing?.transitionOut || !incoming)
    return { project, outcome: "too-short" };
  const from = Math.max(
    incoming.start,
    itemEnd(outgoing) - outgoing.transitionOut.duration
  );
  const to = Math.min(itemEnd(outgoing), itemEnd(incoming));
  if (to - from < POST_MIN_ITEM_SECONDS - POST_TIME_EPSILON)
    return { project, outcome: "too-short" };
  const outgoingBare = withoutBoxKeysIn(outgoing, from, to);
  const incomingBare = withoutBoxKeysIn(incoming, from, to);
  const fromBox = boxAt(outgoingBare, from);
  const toBox = boxAt(incomingBare, to);
  next = replaceItem(
    next,
    itemId,
    withFlight(outgoingBare, from, to, fromBox, toBox)
  );
  next = replaceItem(
    next,
    nextId,
    withFlight(incomingBare, from, to, fromBox, toBox)
  );
  next = finish(next, ctx);
  // A run that would write what is already there leaves no trace in history.
  if (JSON.stringify(next.tracks) === JSON.stringify(project.tracks))
    return { project, outcome: "unchanged" };
  return { project: next, outcome: "joined" };
}

/** `flyIntoNextEdit`'s project: the same object when nothing changed or the pair cannot join. */
export function flyIntoNext(
  project: PostProject,
  itemId: string,
  seconds: number,
  ctx: EditContext
): PostProject {
  return flyIntoNextEdit(project, itemId, seconds, ctx).project;
}
