import {
  MAIN_TRACK_INDEX,
  POST_BOX,
  createIdAllocator,
  findItem,
  itemEnd,
  mainItems,
  overlaysAnchoredTo,
  trackHasRoom,
  type PostBox,
  type PostItem,
  type PostItemKind,
  type PostProject,
  type PostTrack,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";
import {
  appendCardClip,
  appendVideoClip,
  cleanLabel,
  finish,
  replaceItem,
  splitItemAt,
  withTrackItems,
  withoutItems,
  type EditContext,
} from "$lib/shared/media-composition/domain/post-project-edits";
import { clearChannel } from "$lib/shared/media-composition/domain/post-project-keyframes";

/**
 * Looks are quick layouts for one main clip, built from ordinary items so
 * each part can still be moved, trimmed or removed on its own:
 *
 * - dual: the take on top and the sequence animation below it.
 * - breakdown: the take full frame over a strip of the moves square and the
 *   carousel of upcoming moves.
 * - full: the take alone.
 *
 * The Tutorial preset lays out the whole post from them.
 */

export type PostLook = "dual" | "breakdown" | "full";

/** Overlay kinds a look owns on its clip. */
export const LOOK_OVERLAY_KINDS: readonly PostItemKind[] = [
  "animation",
  "moves",
  "carousel",
];

export const TUTORIAL_FADE_SECONDS = 0.25;

const BOX_EPSILON = 1e-4;

/**
 * Which look a main clip has, "custom" when it has been changed into
 * something else, and null for anything but a main-track clip.
 */
export function lookOf(
  project: PostProject,
  mainItemId: string
): PostLook | "custom" | null {
  const located = findItem(project, mainItemId);
  if (
    !located ||
    located.trackIndex !== MAIN_TRACK_INDEX ||
    located.item.kind !== "video"
  ) {
    return null;
  }
  const kinds = new Set(lookOverlays(project, mainItemId).map(({ item }) => item.kind));
  const box = located.item.box;
  if (sameBox(box, POST_BOX.top) && kinds.size === 1 && kinds.has("animation")) {
    return "dual";
  }
  if (sameBox(box, POST_BOX.full)) {
    if (kinds.size === 0) return "full";
    if (!kinds.has("animation")) return "breakdown";
  }
  return "custom";
}

/**
 * Gives a main clip a look: its own look overlays are replaced, and texts
 * and anything else above it stay. The new overlays fade with the clip and
 * go on the lowest overlay tracks with room, so texts stay above them.
 */
export function applyLook(
  project: PostProject,
  mainItemId: string,
  look: PostLook,
  ctx: EditContext
): PostProject {
  const located = findItem(project, mainItemId);
  if (
    !located ||
    located.trackIndex !== MAIN_TRACK_INDEX ||
    located.item.kind !== "video" ||
    lookOf(project, mainItemId) === look
  ) {
    return project;
  }
  const clip = located.item;
  const owned = new Set(lookOverlays(project, mainItemId).map(({ item }) => item.id));
  let next = withoutItems(project, owned);
  // The look's own box replaces whatever box (and box animation) the clip
  // had; its framing and opacity keyframes are the clip's own and stay.
  const clipWithoutBoxKeyframes = clearChannel(clip, "box", clip.start);
  next = replaceItem(next, clip.id, {
    ...clipWithoutBoxKeyframes,
    box: { ...(look === "dual" ? POST_BOX.top : POST_BOX.full) },
  });

  const nextId = createIdAllocator(next);
  const base = (box: PostBox) => ({
    id: "",
    start: clip.start,
    duration: clip.duration,
    box: { ...box },
    opacity: 1,
    fadeIn: clip.fadeIn,
    fadeOut: clip.fadeOut,
    anchor: { itemId: clip.id, offset: 0 },
    fill: true,
  });
  const added: PostItem[] =
    look === "dual"
      ? [{ ...base(POST_BOX.bottom), id: nextId("animation"), kind: "animation", overlay: true }]
      : look === "breakdown"
        ? [
            { ...base(POST_BOX.stripSquare), id: nextId("moves"), kind: "moves", mode: "alternate" },
            { ...base(POST_BOX.stripCarousel), id: nextId("carousel"), kind: "carousel" },
          ]
        : [];

  let insertAt = MAIN_TRACK_INDEX + 1;
  for (const item of added) {
    const placed = placeLow(next, item, insertAt, nextId);
    next = placed.project;
    insertAt = placed.trackIndex + 1;
  }
  return finish(next, ctx);
}

export interface TutorialLabels {
  runThrough: string;
  slowMo: string;
  card: string;
}

export interface TutorialResult {
  project: PostProject;
  /**
   * When both clips come from one recording, where the slow version starts
   * in it, so its timing can count from move 1 again.
   */
  timingSplit: { takeId: string; atSeconds: number } | null;
}

/**
 * The contest tutorial from what is on the timeline: the run through in
 * the dual view, the slow version with the breakdown strip, then the card.
 * With one clip, or one video and no clips yet, the recording is cut in half
 * as a starting point to trim. Texts and other overlays stay.
 */
export function applyTutorialPreset(
  project: PostProject,
  labels: TutorialLabels,
  ctx: EditContext
): TutorialResult {
  let next = project;
  if (mainVideos(next).length === 0) {
    const takes = next.takes.slice(0, 2);
    if (takes.length === 0) return { project, timingSplit: null };
    for (const take of takes) {
      next = appendVideoClip(next, take.id, ctx)?.project ?? next;
    }
  }
  const only = mainVideos(next);
  // A lone clip is cut in half as a starting point to trim, so that midpoint
  // is a guess rather than a real cut; timing should not be pinned to it.
  let guessedCut = false;
  if (only.length === 1) {
    const clip = only[0]!;
    next = splitItemAt(next, clip.id, clip.start + clip.duration / 2, ctx)?.project ?? next;
    guessedCut = true;
  }

  const videos = mainVideos(next);
  const [runThrough, slowMo] = videos;
  if (!runThrough) return { project, timingSplit: null };

  // The main track becomes the two clips first, the rest after, no cards.
  const cards = new Set(
    mainItems(next)
      .filter((item) => item.kind === "card")
      .map((item) => item.id)
  );
  for (const id of [...cards]) {
    for (const { item } of overlaysAnchoredTo(next, id)) {
      if (item.fill) cards.add(item.id);
    }
  }
  next = withoutItems(next, cards);
  next = withTrackItems(next, MAIN_TRACK_INDEX, [
    ...videos,
    ...next.tracks[MAIN_TRACK_INDEX]!.items.filter((item) => item.kind !== "video"),
  ]);
  next = finish(next, ctx);

  next = styleClip(next, runThrough.id, labels.runThrough, 0, "dual", ctx);
  if (slowMo) {
    next = styleClip(next, slowMo.id, labels.slowMo, TUTORIAL_FADE_SECONDS, "breakdown", ctx);
  }
  next = appendCardClip(next, ctx, {
    label: labels.card,
    fadeIn: TUTORIAL_FADE_SECONDS,
  }).project;

  const timingSplit =
    !guessedCut && slowMo && slowMo.takeId === runThrough.takeId
      ? { takeId: slowMo.takeId, atSeconds: slowMo.sourceIn }
      : null;
  if (sameContent(next, project)) return { project, timingSplit };
  return { project: next, timingSplit };
}

function mainVideos(project: PostProject): PostVideoItem[] {
  return mainItems(project).filter(
    (item): item is PostVideoItem => item.kind === "video"
  );
}

function lookOverlays(project: PostProject, mainItemId: string) {
  return overlaysAnchoredTo(project, mainItemId).filter(
    ({ item }) => item.fill && LOOK_OVERLAY_KINDS.includes(item.kind)
  );
}

/** Names a clip, sets its fade-in and gives it a look that fades with it. */
function styleClip(
  project: PostProject,
  clipId: string,
  label: string,
  fadeIn: number,
  look: PostLook,
  ctx: EditContext
): PostProject {
  const clip = findItem(project, clipId)?.item;
  if (!clip) return project;
  const name = cleanLabel(label);
  const named: Record<string, unknown> = {
    ...clip,
    fadeIn: Math.min(fadeIn, clip.duration),
  };
  if (name) named.label = name;
  else delete named.label;
  const next = finish(
    replaceItem(project, clipId, named as unknown as PostItem),
    ctx
  );
  // Re-lay the look even when it is already there, so it takes the new fade.
  const reset = applyLook(next, clipId, "full", ctx);
  return look === "full" ? reset : applyLook(reset, clipId, look, ctx);
}

/**
 * Puts an item on the lowest overlay track from `fromIndex` with room for
 * it, or on a new track inserted there, below anything added later.
 */
function placeLow(
  project: PostProject,
  item: PostItem,
  fromIndex: number,
  nextId: (prefix: string) => string
): { project: PostProject; trackIndex: number } {
  for (let index = fromIndex; index < project.tracks.length; index++) {
    const track = project.tracks[index]!;
    if (
      !track.hidden &&
      !track.locked &&
      trackHasRoom(track, item.start, itemEnd(item))
    ) {
      return {
        project: withTrackItems(project, index, [...track.items, item]),
        trackIndex: index,
      };
    }
  }
  const trackIndex = Math.min(fromIndex, project.tracks.length);
  const track: PostTrack = {
    id: nextId("track"),
    hidden: false,
    locked: false,
    items: [item],
  };
  const tracks = [...project.tracks];
  tracks.splice(trackIndex, 0, track);
  return { project: { ...project, tracks }, trackIndex };
}

/** The same place and turn: a look's box is never turned. */
function sameBox(left: PostBox, right: PostBox): boolean {
  return (
    Math.abs(left.x - right.x) < BOX_EPSILON &&
    Math.abs(left.y - right.y) < BOX_EPSILON &&
    Math.abs(left.width - right.width) < BOX_EPSILON &&
    Math.abs(left.height - right.height) < BOX_EPSILON &&
    Math.abs((left.turn ?? 0) - (right.turn ?? 0)) < BOX_EPSILON
  );
}

/** The same post apart from when it was saved. */
function sameContent(left: PostProject, right: PostProject): boolean {
  return (
    JSON.stringify({ ...left, updatedAt: 0 }) ===
    JSON.stringify({ ...right, updatedAt: 0 })
  );
}
