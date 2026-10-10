import {
  POST_BOX,
  POST_TIME_EPSILON,
  type PostAnimationItem,
  type PostBox,
  type PostKeyframe,
  type PostMotionKey,
  type PostProject,
} from "#lib/shared/media-composition/domain/post-project.js";
import { boxAt } from "#lib/shared/media-composition/domain/post-project-keyframes.js";
import { pipHandoffOf } from "#lib/shared/media-composition/domain/pip-handoff.js";
import {
  MOVE_EASING,
  MOVE_END_SHARE,
  MOVE_START_SHARE,
} from "#lib/shared/media-composition/domain/tunnel-hook.js";

/**
 * The opening tunnel's move from full frame into the animation's box, and the
 * hand-off's shrink into the picture-in-picture square, are written as the
 * animation's own box keyframes so they show in its key lane and can be
 * edited. Keys still tagged `auto` follow the tunnel's length and the
 * hand-off's timing; an edited key loses the tag and becomes the author's,
 * and the rest of its set stops following too.
 */
type BoxKey = PostKeyframe<PostBox>;

const sameKeys = (a: readonly BoxKey[], b: readonly BoxKey[]) =>
  a.length === b.length &&
  a.every((key, index) => JSON.stringify(key) === JSON.stringify(b[index]));

/** One automatic set: drops, keeps, refreshes or adds its keys. */
function syncSet(
  keys: BoxKey[],
  auto: PostMotionKey,
  wanted: BoxKey[] | null,
  span: { from: number; to: number } | null
): BoxKey[] {
  const tagged = keys.filter((key) => key.auto === auto);
  const rest = keys.filter((key) => key.auto !== auto);
  if (!wanted) return rest;
  if (tagged.length > 0 && tagged.length !== wanted.length)
    // Part of the set was edited: the rest becomes the author's as it stands.
    return keys.map((key) =>
      key.auto === auto
        ? { t: key.t, value: key.value, easing: key.easing }
        : key
    );
  if (
    tagged.length === 0 &&
    span &&
    rest.some(
      (key) =>
        key.t >= span.from - POST_TIME_EPSILON &&
        key.t <= span.to + POST_TIME_EPSILON
    )
  )
    // The author keyed this stretch by hand; leave it to them.
    return keys;
  const inside = (t: number) =>
    wanted.some((key) => Math.abs(key.t - t) < POST_TIME_EPSILON);
  return [...rest.filter((key) => !inside(key.t)), ...wanted].sort(
    (a, b) => a.t - b.t
  );
}

function syncAnimation(
  item: PostAnimationItem,
  handoff: ReturnType<typeof pipHandoffOf>
): PostAnimationItem {
  const before = item.keyframes?.box ?? [];
  let keys = [...before];

  const seconds =
    item.tunnelHook?.seconds !== undefined
      ? Math.min(item.tunnelHook.seconds, item.duration)
      : null;
  const settle = seconds === null ? 0 : seconds * MOVE_END_SHARE;
  keys = syncSet(
    keys,
    "tunnel",
    seconds === null
      ? null
      : [
          { t: 0, value: { ...POST_BOX.full }, easing: "hold", auto: "tunnel" },
          {
            t: seconds * MOVE_START_SHARE,
            value: { ...POST_BOX.full },
            easing: [...MOVE_EASING],
            auto: "tunnel",
          },
          { t: settle, value: { ...item.box }, easing: "hold", auto: "tunnel" },
        ],
    seconds === null ? null : { from: 0, to: settle }
  );

  const mine = handoff && handoff.animation.id === item.id ? handoff : null;
  if (mine) {
    const from = mine.start - item.start;
    const to = mine.end - item.start;
    // Where the animation is before the shrink, read without the shrink.
    const own = keys.filter((key) => key.auto !== "handoff");
    const plain = { ...item, keyframes: { ...item.keyframes, box: own } };
    keys = syncSet(
      keys,
      "handoff",
      [
        {
          t: from,
          value: { ...(own.length ? boxAt(plain, mine.start) : item.box) },
          easing: [...MOVE_EASING],
          auto: "handoff",
        },
        {
          t: to,
          value: { ...boxAt(mine.moves, mine.end) },
          easing: "hold",
          auto: "handoff",
        },
      ],
      { from, to }
    );
  } else {
    keys = syncSet(keys, "handoff", null, null);
  }

  if (sameKeys(keys, before)) return item;
  const { box: _box, ...channels } = item.keyframes ?? {};
  const keyframes = keys.length ? { ...channels, box: keys } : channels;
  return Object.keys(keyframes).length
    ? { ...item, keyframes }
    : (({ keyframes: _drop, ...rest }) => rest)(item);
}

/** The project with every animation's automatic move keys in step. */
export function withMotionKeys(project: PostProject): PostProject {
  const handoff = pipHandoffOf(project);
  let changed = false;
  const tracks = project.tracks.map((track) => {
    let trackChanged = false;
    const items = track.items.map((item) => {
      if (item.kind !== "animation") return item;
      const next = syncAnimation(item, handoff);
      if (next !== item) trackChanged = true;
      return next;
    });
    if (!trackChanged) return track;
    changed = true;
    return { ...track, items };
  });
  return changed ? { ...project, tracks } : project;
}
