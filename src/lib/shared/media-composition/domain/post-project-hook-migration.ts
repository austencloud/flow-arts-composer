import {
  POST_TIME_EPSILON,
  itemEnd,
  type PostAnimationItem,
  type PostItem,
  type PostItemKeyframes,
  type PostProject,
} from "$lib/shared/media-composition/domain/post-project";

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
