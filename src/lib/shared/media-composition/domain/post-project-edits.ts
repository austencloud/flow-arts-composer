import {
  DEFAULT_TUNNEL_HOOK,
  DEFAULT_TUNNEL_HOOK_SECONDS,
  MAIN_TRACK_INDEX,
  POST_MIN_BOX_SIZE,
  POST_MIN_ITEM_SECONDS,
  POST_TIME_EPSILON,
  addOverlayItem,
  clampBox,
  findItem,
  finish,
  finiteOr,
  itemEnd,
  mainItemAt,
  replaceItem,
  timingVideoAt,
  videoPostSeconds,
  type EditContext,
  type PostItem,
  type PostItemKeyframes,
  type PostProject,
  type PostVideoItem,
  type TunnelBackdropFrame,
  type TunnelHook,
} from "@austencloud/video-editor/core";
import type {
  PostAnimationAppearance,
  PostAnimationItem,
} from "#lib/shared/post-studio-plugin/index.js";
import {
  resolveTakeTiming,
  takePassStartsAround,
  takeTimingMoveBeats,
  type TakeTiming,
} from "#lib/shared/media-composition/domain/take-timing.js";
import { openingTitlesSpan } from "#lib/shared/media-composition/domain/tunnel-titles.js";

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

/**
 * Gives the post's animation an opening tunnel. The animation itself starts
 * earlier by the intro's length and opens on the full frame, where the
 * sequence's own tunnel plays through; it then eases into its own box as the
 * extra performers fade. It stays one item on one canvas, so there is no
 * hand-off to a second animation. Everything after it moves later by the
 * intro, which is then lined up with its footage (`lineUpTunnelHook`) when
 * the take is timed. Returns null when there is no animation or it already
 * has an intro.
 */
export function addTunnelHook(
  project: PostProject,
  ctx: EditContext,
  init: { seconds?: number; hook?: TunnelHook; clock?: TunnelHookClock } = {}
): { project: PostProject; itemId: string } | null {
  if (findTunnelHook(project)) return null;
  let target: PostAnimationItem | null = null;
  for (const track of project.tracks) {
    for (const item of track.items) {
      if (!target && item.kind === "animation") target = item;
    }
  }
  if (!target) return null;
  const seconds = Math.max(
    POST_MIN_ITEM_SECONDS * 10,
    finiteOr(init.seconds, DEFAULT_TUNNEL_HOOK_SECONDS)
  );
  const opening = target;
  const tracks = project.tracks.map((track, trackIndex) => ({
    ...track,
    items: track.items.map((item): PostItem => {
      if (item.id === opening.id) {
        return {
          ...opening,
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
      if (item.start < opening.start - POST_TIME_EPSILON) return item;
      // A main clip that follows its neighbours would snap back to zero, so
      // each is pinned where the intro leaves it.
      return {
        ...item,
        start: item.start + seconds,
        ...(trackIndex === MAIN_TRACK_INDEX ? { pinnedStart: true } : {}),
      };
    }),
  }));
  return {
    project: lineUpTunnelHook(
      finish({ ...project, tracks }, ctx),
      ctx,
      init.clock
    ),
    itemId: opening.id,
  };
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
 * post after that, and what is placed against it stays put. Returns the
 * project unchanged when there is no tunnel, no footage where it ends, no
 * fitted timing for that take, or too little footage before the cue.
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
  if (!timing || !moveBeats?.length) return project;

  // The take's media time where the intro ends now.
  const atIntroEnd =
    video.sourceIn + (hook.start + seconds - video.start) * video.speed;
  const { earlier, later } = takePassStartsAround(
    resolveTakeTiming(timing, moveBeats),
    atIntroEnd
  );
  const before = main.filter(
    (item) =>
      item.id !== video.id && item.start < video.start - POST_TIME_EPSILON
  );
  const clear = before.every(
    (item) => itemEnd(item) <= hook.start + POST_TIME_EPSILON
  );
  const introFor = (cue: number) => seconds + (cue - atIntroEnd) / video.speed;
  const fits = (cue: number | null): cue is number => {
    if (cue === null || !clear) return false;
    const intro = introFor(cue);
    return (
      intro >= MIN_LINED_UP_INTRO_SECONDS &&
      intro <= MAX_INTRO_SECONDS &&
      hook.start + intro < itemEnd(video) - POST_MIN_ITEM_SECONDS &&
      cue - intro * video.speed >= -POST_TIME_EPSILON
    );
  };
  const cue = [earlier, later]
    .filter(fits)
    .sort((a, b) => Math.abs(a - atIntroEnd) - Math.abs(b - atIntroEnd))[0];
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

/** Takes the intro off the animation and brings everything back to where it was. */
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
              ...rest,
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
          return item.start >= introEnd - POST_TIME_EPSILON
            ? { ...item, start: Math.max(0, item.start - seconds) }
            : item;
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
