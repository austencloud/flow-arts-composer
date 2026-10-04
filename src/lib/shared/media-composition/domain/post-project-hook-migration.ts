import {
  POST_BOX,
  POST_MAX_SPOKEN_LENGTH,
  POST_TIME_EPSILON,
  createIdAllocator,
  itemEnd,
  mainItemAt,
  type PostAnimationItem,
  type PostItem,
  type PostItemKeyframes,
  type PostProject,
  type PostTitlesItem,
} from "$lib/shared/media-composition/domain/post-project";
import { openingTitlesSpan } from "$lib/shared/media-composition/domain/tunnel-titles";

/**
 * Posts saved before the opening tunnel was part of the animation held it as a
 * separate full-frame item ending where the animation began. The two are one
 * canvas, so the animation takes over the hook's span and carries the intro
 * itself: it starts when the hook did, keeps its own look, and its keyframes
 * stay where they were in the post. A hook with no animation after it stays as
 * it was. Projects without a separate hook come back untouched.
 */
export function mergeSeparateTunnelHook(project: PostProject): PostProject {
  const items = project.tracks.flatMap((track) => track.items);
  const hook = items.find(
    (item): item is PostAnimationItem =>
      item.kind === "animation" &&
      !!item.tunnelHook &&
      item.tunnelHook.seconds === undefined
  );
  if (!hook?.tunnelHook) return project;
  const hookEnd = itemEnd(hook);
  const next = items.find(
    (item): item is PostAnimationItem =>
      item.kind === "animation" &&
      !item.tunnelHook &&
      Math.abs(item.start - hookEnd) < POST_TIME_EPSILON
  );
  if (!next) return project;

  const seconds = hook.duration;
  const merged: PostAnimationItem = {
    ...next,
    start: hook.start,
    duration: next.duration + seconds,
    fadeIn: 0,
    // An animation placed against its clip, not filling it, keeps its start.
    ...(next.anchor && !next.fill
      ? { anchor: { ...next.anchor, offset: next.anchor.offset - seconds } }
      : {}),
    tunnelHook: { ...hook.tunnelHook, seconds },
    animationAppearance: next.animationAppearance ?? hook.animationAppearance,
    ...(next.keyframes
      ? { keyframes: shiftKeyframes(next.keyframes, seconds) }
      : {}),
  };
  const tracks = project.tracks.map((track) => ({
    ...track,
    items: track.items
      .filter((item) => item.id !== hook.id)
      .map((item): PostItem => (item.id === next.id ? merged : item)),
  }));
  return { ...project, tracks };
}

/** The item starts earlier by `seconds`, so keys that were fixed in the post move with it. */
function shiftKeyframes(
  keyframes: PostItemKeyframes,
  seconds: number
): PostItemKeyframes {
  const out: Record<string, unknown> = {};
  for (const [channel, frames] of Object.entries(keyframes)) {
    out[channel] = Array.isArray(frames)
      ? frames.map((kf) => ({ ...kf, t: kf.t + seconds }))
      : frames;
  }
  return out as PostItemKeyframes;
}

/**
 * Posts saved while the opening titles were a setting of the tunnel animation
 * hold them on its `tunnelHook`. Titles are their own clip now: each such
 * animation loses the setting, and a titles clip with the same words goes on a
 * new track above, over the opening. Titles that were switched off just go.
 */
export function splitTunnelHookTitles(project: PostProject): PostProject {
  const owner = project.tracks
    .flatMap((track) => track.items)
    .find(
      (item): item is PostAnimationItem =>
        item.kind === "animation" && !!item.tunnelHook?.titles
    );
  const legacy = owner?.tunnelHook?.titles;
  if (!owner?.tunnelHook || !legacy) return project;

  const { titles: _titles, ...hook } = owner.tunnelHook;
  const stripped: PostProject = {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      items: track.items.map(
        (item): PostItem =>
          item.id === owner.id ? { ...owner, tunnelHook: hook } : item
      ),
    })),
  };
  if (!legacy.name) return stripped;
  const spoken = legacy.spoken?.trim().slice(0, POST_MAX_SPOKEN_LENGTH);

  const span = openingTitlesSpan(stripped);
  if (!span) return stripped;
  const nextId = createIdAllocator(stripped);
  const under = mainItemAt(stripped, span.start);
  const titles: PostTitlesItem = {
    id: nextId("titles"),
    kind: "titles",
    start: span.start,
    duration: span.duration,
    box: { ...POST_BOX.full },
    opacity: 1,
    fadeIn: 0,
    fadeOut: 0,
    anchor: under
      ? { itemId: under.id, offset: span.start - under.start }
      : null,
    fill: false,
    ...(spoken ? { spoken } : {}),
  };
  return {
    ...stripped,
    tracks: [
      ...stripped.tracks,
      { id: nextId("track"), hidden: false, locked: false, items: [titles] },
    ],
  };
}
