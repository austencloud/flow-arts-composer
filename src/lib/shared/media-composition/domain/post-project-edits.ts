import {
  DEFAULT_TUNNEL_HOOK,
  DEFAULT_TUNNEL_HOOK_SECONDS,
  EASING_PRESETS,
  boxAt,
  channelKeyframeSeconds,
  isAnimated,
  postOutputSize,
  removeKeyframe,
  setKeyframe,
  setSegmentEasing,
  type PostBox,
  MAIN_TRACK_INDEX,
  POST_MIN_BOX_SIZE,
  POST_MAX_SPEED,
  POST_MIN_ITEM_SECONDS,
  POST_MIN_SPEED,
  POST_TIME_EPSILON,
  addOverlayItem,
  appendToMain,
  clampBox,
  createIdAllocator,
  findItem,
  finish,
  finiteOr,
  itemEnd,
  mainItemAt,
  replaceItem,
  trackHasRoom,
  withNewTrackOnTop,
  withTrackItems,
  timingVideoAt,
  videoFootageSeconds,
  videoPostSeconds,
  type EditContext,
  type PostItem,
  type PostItemKeyframes,
  type PostProject,
  type PostVideoItem,
  type TunnelBackdropFrame,
  type TunnelHook,
} from "@austencloud/video-editor/core";
import type { GridJoin } from "@tka/tka-types";
import type {
  PostAnimationAppearance,
  PostAnimationItem,
  PostTitlesItem,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  resolveTakeTiming,
  takePassStartsAround,
  takeTimingMoveBeats,
  type TakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";
import {
  openingTitlesSpan,
  pairNameShare,
} from "#lib/shared/media-composition/domain/tunnel-titles.js";
import { CARD_TITLE_LANDING_SECONDS } from "#lib/shared/post-studio-plugin/card-ending.js";
import { shiftTkaItemTimes } from "#lib/shared/post-studio-plugin/item-times.js";
import {
  arrangementDurationSeconds,
  createArrangementItem,
} from "#lib/shared/media-composition/domain/post-arrangement-item.js";
import { createMandalaItem } from "#lib/shared/media-composition/domain/post-mandala-item.js";
import type { MandalaSequenceSnapshot } from "#lib/shared/post-studio-plugin/index.js";
import {
  validateArrangementSnapshot,
  type ArrangementSnapshot,
} from "#lib/shared/media-composition/domain/arrangement.js";
import {
  clearCell,
  moveCell,
  resizeCell,
  setBpm,
  setCellAppearance,
  setCellGridJoin,
  setCellLayers,
  setCellMandala,
  setCellMediaType,
  type ArrangementCellMandalaPatch,
  setCellMotionVisibility,
  setCellOffset,
  setCellTipEffects,
  setCellTipEfforts,
  setGrid,
  setSkipStartPlacement,
  staggerCells,
  type ArrangementCellOffset,
} from "#lib/shared/media-composition/domain/arrangement-edits.js";
import type {
  CellMediaType,
  TunnelLayerConfig,
} from "#lib/shared/animation-engine/domain/compose-types.js";
import type {
  TipEffectMap,
  TipEffortMap,
} from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";

/**
 * tka's own timeline edits: the titles clip, the opening tunnel hook and the
 * swap of a recovered PIP video for the live animation. Each one is pure like
 * the generic edits in `@austencloud/video-editor/core`, which it builds on:
 * it takes the project and returns the next one, laid out by `finish`. Pass
 * the context from `editContext` in `#lib/shared/post-studio-plugin/index.js`, which
 * carries the TKA plugin.
 */

/**
 * Adds the sequence's name as a titles clip. Over the opening tunnel it spans
 * the words' time with the tunnel; otherwise it starts at `at`.
 */
export function addTitlesItem(
  project: PostProject,
  ctx: EditContext,
  init: { at?: number; spoken?: string } = {}
): { project: PostProject; itemId: string } | null {
  const opening = openingTitlesSpan(project);
  return addOverlayItem(
    project,
    {
      kind: "titles",
      at: opening?.start ?? finiteOr(init.at ?? 0, 0),
      ...(opening ? { duration: opening.duration } : {}),
      ...(init.spoken !== undefined ? { spoken: init.spoken } : {}),
      fill: false,
    },
    ctx
  );
}

/**
 * The name pair's big spot on the hook, as a share of the frame: centred near
 * the top, its letters as tall as the opening's titles.
 */
export const TITLES_HOOK_BOX: PostBox = {
  x: 0.2,
  y: 0.135,
  width: 0.6,
  height: 0.094,
};
/**
 * Where a parked pair sits: its left edge and top, as shares of the frame,
 * inside the part a 4:5 feed crop of a 9:16 post keeps.
 */
export const TITLES_PARK_LEFT = 0.033;
export const TITLES_PARK_TOP = 0.155;
/** A parked pair's size against the box it leaves. */
export const TITLES_PARK_SCALE = 0.45;
/** Seconds the pair takes to glide into its parked spot. */
export const TITLES_PARK_GLIDE_SECONDS = 0.8;

/**
 * A parked pair's size: the box it leaves, scaled down evenly so the pair
 * keeps its shape, but never below the smallest box the editor allows.
 */
export function parkedSize(box: PostBox): { width: number; height: number } {
  const scale = Math.min(
    1,
    Math.max(
      TITLES_PARK_SCALE,
      POST_MIN_BOX_SIZE / box.width,
      POST_MIN_BOX_SIZE / box.height
    )
  );
  return { width: box.width * scale, height: box.height * scale };
}

/**
 * Parks a titles clip's name pair small in the top left: a box key at
 * `seconds` holding the box as it is (the hook's big spot when the box has
 * never moved), and an eased key `TITLES_PARK_GLIDE_SECONDS` later in the
 * parked spot. The words then stay to the clip's last frame. Both keys are
 * ordinary ones the author can move or change. A clip too short for the glide
 * is left as it is.
 */
export function parkTitles(
  project: PostProject,
  itemId: string,
  seconds: number,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  const item = located?.item;
  if (item?.kind !== "titles") return project;
  const end = itemEnd(item);
  const from = Math.max(
    item.start,
    Math.min(finiteOr(seconds, item.start), end - TITLES_PARK_GLIDE_SECONDS)
  );
  const to = from + TITLES_PARK_GLIDE_SECONDS;
  if (to > end + POST_TIME_EPSILON) return project;
  const box = isAnimated(item, "box")
    ? boxAt(item, from)
    : { ...TITLES_HOOK_BOX };
  const parked = clampBox({
    x: TITLES_PARK_LEFT,
    y: TITLES_PARK_TOP,
    ...parkedSize(box),
  });
  let next: PostItem = setKeyframe(item, "box", from, box);
  next = setKeyframe(next, "box", to, parked);
  next = setSegmentEasing(
    next,
    "box",
    from + TITLES_PARK_GLIDE_SECONDS / 2,
    EASING_PRESETS["ease-in-out"]
  );
  if (next.kind === "titles") next = { ...next, leave: "stay" };
  return finish(replaceItem(project, itemId, next), ctx);
}

/** Where a card draws its header word, as fractions of the card's own box. */
export interface CardWordRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The titles painter keeps this share of its name band clear on each side
 * (`calculateHeaderWordSideInset` at a band of glyph / 0.65), and the box is
 * given a little more than the word so it never shrinks to fit.
 */
const LANDED_SIDE_INSET = 0.25 / 0.65;
const LANDED_WIDTH_SLACK = 1.04;

/**
 * The titles box that puts the pair's name exactly over a card's header
 * word at the same size: the name's letters fill the top `pairNameShare`
 * of a pair's box (less with a larger `spokenSize`), so the box is the
 * word's height over that share, its top on the word's top, and centred on
 * the word.
 */
export function titlesBoxOverWord(
  cardBox: PostBox,
  word: CardWordRect,
  frame: { width: number; height: number },
  spokenSize?: number
): PostBox {
  const wordX = cardBox.x + word.x * cardBox.width;
  const wordY = cardBox.y + word.y * cardBox.height;
  const wordW = word.width * cardBox.width;
  const wordH = word.height * cardBox.height;
  const height = wordH / pairNameShare(spokenSize);
  const glyphPx = wordH * frame.height;
  const width =
    (wordW * frame.width * LANDED_WIDTH_SLACK +
      2 * glyphPx * LANDED_SIDE_INSET) /
    frame.width;
  return { x: wordX + wordW / 2 - width / 2, y: wordY, width, height };
}

/**
 * Lands a titles clip's name on a card's header word: a box key at the
 * later of `seconds` and the card's start holding the box as it is, then an
 * eased key `CARD_TITLE_LANDING_SECONDS` later over the card's word. Later
 * box keys go, the words stay to the clip's end, the spoken line fades out
 * from the landing on, and the card stops drawing its own word. Both clips
 * must still be on screen when the name lands; otherwise nothing changes.
 * `word` is where the card draws its word inside its own box; only a drawn
 * card knows that, so the caller measures it.
 */
export function landTitlesOnCard(
  project: PostProject,
  titlesId: string,
  cardId: string,
  seconds: number,
  word: CardWordRect,
  ctx: EditContext
): PostProject {
  const titles = findItem(project, titlesId)?.item;
  const card = findItem(project, cardId)?.item;
  if (titles?.kind !== "titles" || card?.kind !== "card") return project;
  if (![word.x, word.y, word.width, word.height].every(Number.isFinite))
    return project;
  if (word.width <= 0 || word.height <= 0) return project;
  const from = Math.max(
    titles.start,
    card.start,
    finiteOr(seconds, titles.start)
  );
  const to = from + CARD_TITLE_LANDING_SECONDS;
  if (to > itemEnd(titles) + POST_TIME_EPSILON) return project;
  if (to > itemEnd(card) + POST_TIME_EPSILON) return project;
  const box = isAnimated(titles, "box")
    ? boxAt(titles, from)
    : { ...TITLES_HOOK_BOX };
  // The landed box is the clip's shortest, so its line takes the small size.
  const landed = titlesBoxOverWord(
    boxAt(card, to),
    word,
    postOutputSize(project.canvas),
    titles.spokenSizeSmall ?? titles.spokenSize
  );
  let next: PostItem = titles;
  for (const key of channelKeyframeSeconds(titles, "box")) {
    if (key > from + POST_TIME_EPSILON) next = removeKeyframe(next, "box", key);
  }
  next = setKeyframe(next, "box", from, box);
  next = setKeyframe(next, "box", to, landed);
  next = setSegmentEasing(
    next,
    "box",
    from + CARD_TITLE_LANDING_SECONDS / 2,
    EASING_PRESETS["ease-in-out"]
  );
  if (next.kind === "titles") {
    next = {
      ...next,
      leave: "stay",
      quiet: { from: from - titles.start, to: titles.duration },
    };
  }
  const nextCard = { ...card, headerTitle: "clip" as const };
  return finish(
    replaceItem(replaceItem(project, titlesId, next), cardId, nextCard),
    ctx
  );
}

/** The animation that opens with the tunnel, when the post has one. */
export function findTunnelHook(project: PostProject): PostAnimationItem | null {
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (item.kind === "animation" && item.tunnelHook) return item;
    }
  }
  return null;
}

/** Content-time keys of an item that starts `seconds` later (or earlier, negative). */
function withKeysShifted(
  keyframes: PostItemKeyframes | undefined,
  seconds: number
): { keyframes?: PostItemKeyframes } {
  if (!keyframes) return {};
  const out: Record<string, unknown> = {};
  for (const [channel, frames] of Object.entries(keyframes)) {
    out[channel] = Array.isArray(frames)
      ? frames.map((kf) => ({ ...kf, t: kf.t + seconds }))
      : frames;
  }
  return { keyframes: out as PostItemKeyframes };
}

/** Whether an item is the name, opening with whatever starts at `start`. */
function isOpeningTitles(
  item: PostItem,
  start: number
): item is PostTitlesItem {
  return (
    item.kind === "titles" && Math.abs(item.start - start) <= POST_TIME_EPSILON
  );
}

/**
 * The name's clip keeping its start while the footage under it moves later
 * (earlier when negative). It lasts `longer` more, and its keys and spans
 * stay with the footage they were set on; the main clip it follows moved by
 * `anchorBy`.
 */
function titlesHeldAtStart(
  item: PostTitlesItem,
  longer: number,
  anchorBy: number
): PostItem {
  return {
    ...shiftTkaItemTimes(item, -longer),
    duration: Math.max(POST_MIN_ITEM_SECONDS, item.duration + longer),
    // Filling its clip would leave the tunnel with no name.
    fill: false,
    ...(item.anchor
      ? { anchor: { ...item.anchor, offset: item.anchor.offset - anchorBy } }
      : {}),
    ...withKeysShifted(item.keyframes, longer),
  } as PostItem;
}

/**
 * The default intro, or a shorter one when the footage has less than that
 * before its cut, so the tunnel never opens on an empty frame.
 */
function defaultIntroSeconds(
  main: readonly PostItem[],
  opening: PostAnimationItem
): number {
  const video = timingVideoAt(main, opening.start, opening.anchor?.itemId);
  if (!video || video.start < opening.start - POST_TIME_EPSILON)
    return DEFAULT_TUNNEL_HOOK_SECONDS;
  const before = video.sourceIn / video.speed;
  return before >= MIN_LINED_UP_INTRO_SECONDS
    ? Math.min(DEFAULT_TUNNEL_HOOK_SECONDS, before)
    : DEFAULT_TUNNEL_HOOK_SECONDS;
}

/**
 * Gives the post's animation an opening tunnel: the one named by `itemId`, or
 * else the first animation in lane order. The animation itself starts
 * earlier by the intro's length and opens on the full frame, where the
 * sequence's own tunnel plays through; it then eases into its own box as the
 * extra performers fade. It stays one item on one canvas, so there is no
 * hand-off to a second animation. Everything after it moves later by the
 * intro, except the name: a titles clip that starts with the animation opens
 * with the tunnel instead. The footage then plays behind the intro, lined up
 * with it when the take is timed (`lineUpTunnelHook`). Returns null when
 * there is no animation or it already has an intro.
 */
export function addTunnelHook(
  project: PostProject,
  ctx: EditContext,
  init: {
    seconds?: number;
    hook?: TunnelHook;
    clock?: TunnelHookClock;
    itemId?: string;
  } = {}
): { project: PostProject; itemId: string } | null {
  if (findTunnelHook(project)) return null;
  let target: PostAnimationItem | null = null;
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (
        !target &&
        item.kind === "animation" &&
        (init.itemId === undefined || item.id === init.itemId)
      )
        target = item;
    }
  }
  if (!target) return null;
  const opening = target;
  const main = project.tracks[MAIN_TRACK_INDEX]?.items ?? [];
  const seconds = Math.max(
    POST_MIN_ITEM_SECONDS * 10,
    finiteOr(init.seconds, defaultIntroSeconds(main, opening))
  );
  const movesLater = (item: PostItem) =>
    item.start >= opening.start - POST_TIME_EPSILON;
  const tunnelOnly = new Set<string>();
  const tracks = project.tracks.map((track, trackIndex) => ({
    ...track,
    items: track.items.map((item): PostItem => {
      if (item.id === opening.id) {
        return {
          ...(shiftTkaItemTimes(opening, -seconds) as PostAnimationItem),
          duration: opening.duration + seconds,
          fadeIn: 0,
          // The animation keeps its place; what it follows moves later.
          ...(opening.anchor && !opening.fill
            ? {
                anchor: {
                  ...opening.anchor,
                  offset: opening.anchor.offset - seconds,
                },
              }
            : {}),
          ...withKeysShifted(opening.keyframes, seconds),
          tunnelHook: { ...(init.hook ?? DEFAULT_TUNNEL_HOOK), seconds },
        };
      }
      if (!movesLater(item)) return item;
      if (isOpeningTitles(item, opening.start)) {
        const follows = main.find((clip) => clip.id === item.anchor?.itemId);
        // A name no longer than the intro belongs to the tunnel alone.
        const stays = item.duration > seconds + POST_TIME_EPSILON;
        if (!stays) tunnelOnly.add(item.id);
        return titlesHeldAtStart(
          item,
          stays ? seconds : 0,
          follows && movesLater(follows) ? seconds : 0
        );
      }
      // A main clip that follows its neighbours would snap back to zero, so
      // each is pinned where the intro leaves it.
      return {
        ...item,
        start: item.start + seconds,
        ...(trackIndex === MAIN_TRACK_INDEX ? { pinnedStart: true } : {}),
      };
    }),
  }));
  const opened = lineUpTunnelHook(
    finish({ ...project, tracks }, ctx),
    ctx,
    init.clock
  );
  return {
    project: withTitlesOverTunnel(opened, tunnelOnly, ctx),
    itemId: opening.id,
  };
}

/** Gives the named titles clips the words' own share of the tunnel. */
function withTitlesOverTunnel(
  project: PostProject,
  ids: ReadonlySet<string>,
  ctx: EditContext
): PostProject {
  const span = openingTitlesSpan(project);
  if (ids.size === 0 || !span) return project;
  const tracks = project.tracks.map((track) => ({
    ...track,
    items: track.items.map((item) =>
      ids.has(item.id) ? { ...item, duration: span.duration } : item
    ),
  }));
  return finish({ ...project, tracks }, ctx);
}

/** The take timings a line-up reads; by default the ones saved in the post. */
export interface TunnelHookClock {
  timings?: Record<string, TakeTiming>;
  /** The sequence's move lengths; by default the ones the timing was checked against. */
  moveBeats?: readonly number[];
}

/** The shortest intro a line-up leaves, so the tunnel still has room to play. */
const MIN_LINED_UP_INTRO_SECONDS = 2;
/** The longest intro the hook can hold. */
const MAX_INTRO_SECONDS = 60;

/**
 * Lines the opening tunnel up with its footage. The intro ends on the moment
 * the performer lands on the opening pose, at the pass start nearest where it
 * ends now, so the tunnel's own ease finishes on that pose and step 1 starts
 * from rest as the footage does. The footage plays behind the whole intro:
 * its clip starts with the animation, keeps every frame where it was in the
 * post after that, and what is placed against it stays put. With no fitted
 * timing for that take, or no pass start the footage reaches, the intro ends
 * where it did and the footage still plays behind it. Returns the project
 * unchanged when there is no tunnel, no footage where it ends, or too little
 * footage before that.
 */
export function lineUpTunnelHook(
  project: PostProject,
  ctx: EditContext,
  clock: TunnelHookClock = {}
): PostProject {
  const hook = findTunnelHook(project);
  const seconds = hook?.tunnelHook?.seconds;
  if (!hook?.tunnelHook || seconds === undefined) return project;
  const main = project.tracks[MAIN_TRACK_INDEX]?.items ?? [];
  const video = timingVideoAt(main, hook.start + seconds, hook.anchor?.itemId);
  if (!video) return project;
  const timing = (clock.timings ?? project.timings)?.[video.takeId];
  const moveBeats =
    clock.moveBeats ?? (timing ? takeTimingMoveBeats(timing) : null);
  // The take's media time where the intro ends now.
  const atIntroEnd =
    video.sourceIn + (hook.start + seconds - video.start) * video.speed;
  const { earlier, later } =
    timing && moveBeats?.length
      ? takePassStartsAround(resolveTakeTiming(timing, moveBeats), atIntroEnd)
      : { earlier: null, later: null };
  const before = main.filter(
    (item) =>
      item.id !== video.id && item.start < video.start - POST_TIME_EPSILON
  );
  const clear = before.every(
    (item) => itemEnd(item) <= hook.start + POST_TIME_EPSILON
  );
  const introFor = (cue: number) => seconds + (cue - atIntroEnd) / video.speed;
  const reached = (cue: number) => {
    const intro = introFor(cue);
    return (
      clear &&
      // The intro ends on the footage, never on a held last frame.
      hook.start + intro <
        video.start + videoFootageSeconds(video) - POST_MIN_ITEM_SECONDS &&
      cue - intro * video.speed >= -POST_TIME_EPSILON
    );
  };
  const cue =
    [earlier, later]
      .filter((pass): pass is number => {
        if (pass === null) return false;
        const intro = introFor(pass);
        return (
          intro >= MIN_LINED_UP_INTRO_SECONDS &&
          intro <= MAX_INTRO_SECONDS &&
          reached(pass)
        );
      })
      .sort((a, b) => Math.abs(a - atIntroEnd) - Math.abs(b - atIntroEnd))[0] ??
    // A clip already playing before the tunnel keeps what it shows there.
    (video.start >= hook.start - POST_TIME_EPSILON && reached(atIntroEnd)
      ? atIntroEnd
      : undefined);
  if (cue === undefined) return project;

  const intro = introFor(cue);
  const sourceIn = Math.max(0, cue - intro * video.speed);
  // How much earlier the clip now starts; items placed against it keep their place.
  const earlierBy = video.start - hook.start;
  if (
    hook.tunnelHook.backdrop &&
    Math.abs(intro - seconds) < POST_TIME_EPSILON &&
    Math.abs(earlierBy) < POST_TIME_EPSILON
  )
    return project;
  const tracks = project.tracks.map((track) => ({
    ...track,
    items: track.items.map((item): PostItem => {
      if (item.id === video.id) {
        return {
          ...video,
          start: hook.start,
          sourceIn,
          duration: videoPostSeconds({ ...video, sourceIn }),
          pinnedStart: true,
        };
      }
      const anchor =
        item.anchor?.itemId === video.id
          ? { ...item.anchor, offset: item.anchor.offset + earlierBy }
          : item.anchor;
      if (item.id === hook.id) {
        return {
          ...hook,
          ...(hook.fill ? {} : { anchor }),
          tunnelHook: { ...hook.tunnelHook!, seconds: intro, backdrop: true },
        };
      }
      // Filling the clip would now stretch an overlay over the backdrop too.
      return anchor === item.anchor ? item : { ...item, anchor, fill: false };
    }),
  }));
  return finish({ ...project, tracks }, ctx);
}

/**
 * Takes the footage back out from under the intro: its clip starts where the
 * intro ends again, and what is placed against it stays put.
 */
function withoutTunnelBackdrop(
  project: PostProject,
  hook: PostAnimationItem
): PostProject {
  const introEnd = hook.start + (hook.tunnelHook?.seconds ?? hook.duration);
  const main = project.tracks[MAIN_TRACK_INDEX]?.items ?? [];
  const video = timingVideoAt(main, introEnd, hook.anchor?.itemId);
  if (!video || video.start >= introEnd - POST_TIME_EPSILON) return project;
  const laterBy = introEnd - video.start;
  // An intro ending on the clip's held last frame leaves no footage to start from.
  if (laterBy > videoFootageSeconds(video) - POST_MIN_ITEM_SECONDS)
    return project;
  const sourceIn = video.sourceIn + laterBy * video.speed;
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      items: track.items.map((item): PostItem => {
        if (item.id === video.id) {
          return {
            ...video,
            start: introEnd,
            sourceIn,
            duration: videoPostSeconds({ ...video, sourceIn }),
          };
        }
        if (
          item.anchor?.itemId !== video.id ||
          (item.fill && item.id === hook.id)
        )
          return item;
        return {
          ...item,
          anchor: { ...item.anchor, offset: item.anchor.offset - laterBy },
        };
      }),
    })),
  };
}

/**
 * Takes the intro off the animation and brings everything back to where it
 * was. A name that opened with the tunnel opens with the animation again, and
 * one that went on past the intro is shorter by it.
 */
export function removeTunnelHook(
  project: PostProject,
  ctx: EditContext
): PostProject {
  const found = findTunnelHook(project);
  if (!found?.tunnelHook) return project;
  const base = found.tunnelHook.backdrop
    ? withoutTunnelBackdrop(project, found)
    : project;
  const hook = findTunnelHook(base);
  if (!hook?.tunnelHook) return project;
  // A hook saved as its own item is all intro, so the item itself goes.
  const separate = hook.tunnelHook.seconds === undefined;
  const seconds = hook.tunnelHook.seconds ?? hook.duration;
  const introEnd = hook.start + seconds;
  const main = base.tracks[MAIN_TRACK_INDEX]?.items ?? [];
  const movesEarlier = (item: PostItem) =>
    item.start >= introEnd - POST_TIME_EPSILON;
  const tracks = base.tracks
    .map((track) => ({
      ...track,
      items: track.items
        .filter((item) => !(separate && item.id === hook.id))
        .map((item): PostItem => {
          if (item.id === hook.id) {
            const {
              tunnelHook: _intro,
              tunnelAppearance: _look,
              ...rest
            } = item as PostAnimationItem;
            return {
              ...shiftTkaItemTimes(rest as PostItem, seconds),
              start: introEnd,
              duration: Math.max(
                POST_MIN_ITEM_SECONDS,
                hook.duration - seconds
              ),
              ...(hook.anchor && !hook.fill
                ? {
                    anchor: {
                      ...hook.anchor,
                      offset: hook.anchor.offset + seconds,
                    },
                  }
                : {}),
              ...withKeysShifted(hook.keyframes, -seconds),
            } as PostItem;
          }
          if (movesEarlier(item))
            return { ...item, start: Math.max(0, item.start - seconds) };
          if (!isOpeningTitles(item, hook.start)) return item;
          const follows = main.find((clip) => clip.id === item.anchor?.itemId);
          return titlesHeldAtStart(
            item,
            itemEnd(item) > introEnd + POST_TIME_EPSILON ? -seconds : 0,
            follows && movesEarlier(follows) ? -seconds : 0
          );
        }),
    }))
    .filter(
      (track, index) => index === MAIN_TRACK_INDEX || track.items.length > 0
    );
  return finish({ ...base, tracks }, ctx);
}

/** Sets how fast the hook plays the sequence; `null` returns to the default ease. */
export function setTunnelHookSpeed(
  project: PostProject,
  speed: NonNullable<TunnelHook["speed"]> | null,
  ctx: EditContext
): PostProject {
  const hook = findTunnelHook(project);
  if (!hook?.tunnelHook) return project;
  const { speed: _previous, ...rest } = hook.tunnelHook;
  const tunnelHook: TunnelHook = speed ? { ...rest, speed } : rest;
  const tracks = project.tracks.map((track) => ({
    ...track,
    items: track.items.map((item) =>
      item.id === hook.id ? { ...item, tunnelHook } : item
    ),
  }));
  return finish({ ...project, tracks }, ctx);
}

/** Frames the footage behind the opening tunnel; null shows the whole picture. */
export function setTunnelHookBackdropFrame(
  project: PostProject,
  frame: TunnelBackdropFrame | null,
  ctx: EditContext
): PostProject {
  const hook = findTunnelHook(project);
  if (!hook?.tunnelHook) return project;
  const { backdropFrame: _previous, ...rest } = hook.tunnelHook;
  const tunnelHook: TunnelHook = frame
    ? { ...rest, backdropFrame: { ...frame } }
    : rest;
  const tracks = project.tracks.map((track) => ({
    ...track,
    items: track.items.map((item) =>
      item.id === hook.id ? { ...item, tunnelHook } : item
    ),
  }));
  return finish({ ...project, tracks }, ctx);
}

/**
 * Sets what the opening tunnel shows differently from the animation it opens.
 * `changes` merge into what the tunnel already sets; a flag set back to the
 * animation's own value follows the animation again. `null` makes the tunnel
 * look like the animation throughout.
 */
export function setTunnelAppearance(
  project: PostProject,
  changes: PostAnimationAppearance | null,
  ctx: EditContext
): PostProject {
  const hook = findTunnelHook(project);
  if (!hook) return project;
  const own: Record<string, unknown> = hook.animationAppearance ?? {};
  const kept = Object.fromEntries(
    Object.entries(
      changes ? { ...hook.tunnelAppearance, ...changes } : {}
    ).filter(
      ([key, value]) =>
        value !== undefined &&
        JSON.stringify(value) !== JSON.stringify(own[key])
    )
  ) as PostAnimationAppearance;
  const { tunnelAppearance: _previous, ...rest } = hook;
  const next: PostAnimationItem =
    Object.keys(kept).length > 0 ? { ...rest, tunnelAppearance: kept } : rest;
  return finish(replaceItem(project, hook.id, next), ctx);
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
// Arrangements
// ---------------------------------------------------------------------------

/** A new arrangement joins the main track when it is empty, otherwise it overlays the playhead. */
export function addArrangementItem(
  project: PostProject,
  snapshot: ArrangementSnapshot,
  at: number,
  ctx: EditContext
): { project: PostProject; itemId: string } {
  const valid = validateArrangementSnapshot(snapshot);
  const nextId = createIdAllocator(project);
  const main = project.tracks[MAIN_TRACK_INDEX]!;
  const onMain = main.items.length === 0;
  const itemId = nextId("arrangement");
  const item = createArrangementItem(
    valid,
    itemId,
    onMain ? 0 : Math.max(0, at),
    onMain
  );
  if (onMain)
    return { project: finish(appendToMain(project, item), ctx), itemId };
  const under = mainItemAt(project, item.start);
  const overlay = {
    ...item,
    anchor: under
      ? { itemId: under.id, offset: item.start - under.start }
      : null,
  };
  const top = project.tracks.length - 1;
  const track = project.tracks[top]!;
  const next =
    top > MAIN_TRACK_INDEX &&
    !track.hidden &&
    !track.locked &&
    trackHasRoom(track, overlay.start, itemEnd(overlay))
      ? withTrackItems(project, top, [...track.items, overlay])
      : withNewTrackOnTop(project, overlay, nextId);
  return { project: finish(next, ctx), itemId };
}

/**
 * A new mandala clip, placed as an arrangement is: on the main track when it
 * is empty, else over the playhead on the top track with room.
 */
export function addMandalaItem(
  project: PostProject,
  sequences: readonly MandalaSequenceSnapshot[],
  at: number,
  ctx: EditContext
): { project: PostProject; itemId: string } {
  const nextId = createIdAllocator(project);
  const main = project.tracks[MAIN_TRACK_INDEX]!;
  const onMain = main.items.length === 0;
  const itemId = nextId("mandala");
  const item = createMandalaItem(
    sequences,
    itemId,
    onMain ? 0 : Math.max(0, at),
    onMain
  );
  if (onMain)
    return { project: finish(appendToMain(project, item), ctx), itemId };
  const under = mainItemAt(project, item.start);
  const overlay = {
    ...item,
    anchor: under
      ? { itemId: under.id, offset: item.start - under.start }
      : null,
  };
  const top = project.tracks.length - 1;
  const track = project.tracks[top]!;
  const next =
    top > MAIN_TRACK_INDEX &&
    !track.hidden &&
    !track.locked &&
    trackHasRoom(track, overlay.start, itemEnd(overlay))
      ? withTrackItems(project, top, [...track.items, overlay])
      : withNewTrackOnTop(project, overlay, nextId);
  return { project: finish(next, ctx), itemId };
}

/** The Arrangement editor applies its complete grid as one timeline edit. */
export function setArrangementSnapshot(
  project: PostProject,
  itemId: string,
  snapshot: ArrangementSnapshot,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (located?.item.kind !== "arrangement") return project;
  const valid = validateArrangementSnapshot(snapshot);
  if (JSON.stringify(valid) === JSON.stringify(located.item.snapshot))
    return project;
  const total = arrangementDurationSeconds(valid);
  const sourceIn = Math.min(
    located.item.sourceIn,
    Math.max(0, total - POST_MIN_ITEM_SECONDS)
  );
  const previousTotal = arrangementDurationSeconds(located.item.snapshot);
  const keptEnd =
    Math.abs(located.item.sourceOut - previousTotal) < POST_TIME_EPSILON
      ? total
      : located.item.sourceOut;
  const sourceOut = Math.min(
    total,
    Math.max(sourceIn + POST_MIN_ITEM_SECONDS, keptEnd)
  );
  return finish(
    replaceItem(project, itemId, {
      ...located.item,
      snapshot: valid,
      sourceIn,
      sourceOut,
      duration: (sourceOut - sourceIn) / located.item.speed,
    }),
    ctx
  );
}

/**
 * A new tempo for an arrangement, keeping the clip on the same beats: its
 * trimmed-in and trimmed-out points scale by old ÷ new, so a clip cut at bar
 * four still ends at bar four, and its length on the timeline follows. Not
 * `setArrangementSnapshot`, which keeps source seconds instead.
 */
export function setArrangementBpm(
  project: PostProject,
  itemId: string,
  bpm: number,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (located?.item.kind !== "arrangement") return project;
  const item = located.item;
  const snapshot = setBpm(item.snapshot, bpm);
  if (snapshot === item.snapshot) return project;
  const factor = item.snapshot.bpm / snapshot.bpm;
  const total = arrangementDurationSeconds(snapshot);
  const sourceOut = Math.min(
    total,
    Math.max(POST_MIN_ITEM_SECONDS, item.sourceOut * factor)
  );
  const sourceIn = Math.max(
    0,
    Math.min(item.sourceIn * factor, sourceOut - POST_MIN_ITEM_SECONDS)
  );
  return finish(
    replaceItem(project, itemId, {
      ...item,
      snapshot,
      sourceIn,
      sourceOut,
      duration: (sourceOut - sourceIn) / item.speed,
    }),
    ctx
  );
}

/** One grid edit on an arrangement item; the clip's length follows through `setArrangementSnapshot`. */
function editArrangement(
  project: PostProject,
  itemId: string,
  ctx: EditContext,
  edit: (snapshot: ArrangementSnapshot) => ArrangementSnapshot
): PostProject {
  const located = findItem(project, itemId);
  if (located?.item.kind !== "arrangement") return project;
  const next = edit(located.item.snapshot);
  return next === located.item.snapshot
    ? project
    : setArrangementSnapshot(project, itemId, next, ctx);
}

/** Rows × cols of the visible grid, clamped to 1..8; see `setGrid`. */
export function setArrangementGrid(
  project: PostProject,
  itemId: string,
  rows: number,
  cols: number,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setGrid(snapshot, rows, cols)
  );
}

export function setArrangementSkipStartPlacement(
  project: PostProject,
  itemId: string,
  skipStartPlacement: boolean,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setSkipStartPlacement(snapshot, skipStartPlacement)
  );
}

/** Swaps a cell with the one at `row`,`col`; an invalid drop changes nothing. */
export function moveArrangementCell(
  project: PostProject,
  itemId: string,
  cellId: string,
  row: number,
  col: number,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    moveCell(snapshot, cellId, row, col)
  );
}

/** Spans clamped to the grid and to empty neighbours; see `resizeCell`. */
export function resizeArrangementCell(
  project: PostProject,
  itemId: string,
  cellId: string,
  colSpan: number,
  rowSpan: number,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    resizeCell(snapshot, cellId, colSpan, rowSpan)
  );
}

export function setArrangementCellLayers(
  project: PostProject,
  itemId: string,
  cellId: string,
  layers: TunnelLayerConfig[],
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellLayers(snapshot, cellId, layers)
  );
}

export function setArrangementCellMediaType(
  project: PostProject,
  itemId: string,
  cellId: string,
  mediaType: CellMediaType,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellMediaType(snapshot, cellId, mediaType)
  );
}

export function setArrangementCellMandala(
  project: PostProject,
  itemId: string,
  cellId: string,
  patch: ArrangementCellMandalaPatch,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellMandala(snapshot, cellId, patch)
  );
}

export function setArrangementCellOffset(
  project: PostProject,
  itemId: string,
  cellId: string,
  offset: ArrangementCellOffset,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellOffset(snapshot, cellId, offset)
  );
}

/** A cell's look, or the grid's when `cellId` is null. */
export function setArrangementCellAppearance(
  project: PostProject,
  itemId: string,
  cellId: string | null,
  appearance: PostAnimationAppearance | undefined,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellAppearance(snapshot, cellId, appearance)
  );
}

export function setArrangementCellTipEffects(
  project: PostProject,
  itemId: string,
  cellId: string,
  map: TipEffectMap | undefined,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellTipEffects(snapshot, cellId, map)
  );
}

export function setArrangementCellTipEfforts(
  project: PostProject,
  itemId: string,
  cellId: string,
  map: TipEffortMap | undefined,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellTipEfforts(snapshot, cellId, map)
  );
}

export function setArrangementCellMotionVisibility(
  project: PostProject,
  itemId: string,
  cellId: string,
  visible: { left?: boolean; right?: boolean },
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellMotionVisibility(snapshot, cellId, visible)
  );
}

/** A cell's own join: a pair, one grid (null), or `undefined` to follow its sequence. */
export function setArrangementCellGridJoin(
  project: PostProject,
  itemId: string,
  cellId: string,
  join: GridJoin | null | undefined,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    setCellGridJoin(snapshot, cellId, join)
  );
}

/** The clip's playback speed; its source span stays and its length follows, as a video's does. */
export function setArrangementSpeed(
  project: PostProject,
  itemId: string,
  speed: number,
  ctx: EditContext
): PostProject {
  const located = findItem(project, itemId);
  if (located?.item.kind !== "arrangement" || !Number.isFinite(speed))
    return project;
  const item = located.item;
  const next = Math.min(POST_MAX_SPEED, Math.max(POST_MIN_SPEED, speed));
  if (next === item.speed) return project;
  return finish(
    replaceItem(project, itemId, {
      ...item,
      speed: next,
      duration: (item.sourceOut - item.sourceIn) / next,
    }),
    ctx
  );
}

export function clearArrangementCell(
  project: PostProject,
  itemId: string,
  cellId: string,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    clearCell(snapshot, cellId)
  );
}

/** Offsets the filled cells by `beatsPerCell` each, in reading order. */
export function staggerArrangement(
  project: PostProject,
  itemId: string,
  beatsPerCell: number,
  ctx: EditContext
): PostProject {
  return editArrangement(project, itemId, ctx, (snapshot) =>
    staggerCells(snapshot, beatsPerCell)
  );
}
