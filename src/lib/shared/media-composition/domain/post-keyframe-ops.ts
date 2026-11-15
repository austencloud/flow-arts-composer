import {
  EASING_PRESETS,
  channelKeyframeSeconds,
  channelsOf,
  clearChannel,
  clearProjectKeyframes,
  editItemKeyframes,
  findItem,
  isAnimated,
  itemEnd,
  keyframeInView,
  keyframeTimeOf,
  moveKeyframe,
  moveOverlayItem,
  placeMainItem,
  removeKeyframe,
  resolvePostTime,
  segmentAt,
  setKeyframe,
  setSegmentEasing,
  updateItemAt,
  type EditContext,
  type PostItem,
  type PostItemKeyframes,
  type PostItemPatch,
  type PostKeyframeChannel,
  type PostProject,
  type PostTimeRef,
} from "@austencloud/video-editor/core";

/**
 * The command line's keyframe and move edits. Every write goes through the
 * core's own edits (updateItemAt, editItemKeyframes, moveOverlayItem,
 * placeMainItem), so a scripted change lays out exactly like one made by hand.
 * Times are post seconds; `own` means seconds from the item's start.
 */

export const KEYFRAME_ACTIONS = [
  "list",
  "set",
  "move",
  "retime",
  "delete",
  "clear",
] as const;
export type KeyframeAction = (typeof KEYFRAME_ACTIONS)[number];

export type KeyframeOp = {
  op: "keyframe";
  item: string;
  action: KeyframeAction;
  at?: PostTimeRef;
  to?: PostTimeRef;
  times?: PostTimeRef[];
  channel?: string;
  patch?: PostItemPatch;
  easing?: string;
  /** The times are seconds from the item's start, not post times. */
  own?: boolean;
};

export type MoveOp = {
  op: "move";
  item: string;
  to: PostTimeRef;
  /** An overlay's target track, as moveOverlayItem reads it. */
  track?: number;
};

/** How close a named time must be to a keyframe to mean that keyframe. */
export const KEYFRAME_FIND_SECONDS = 0.02;

/** The patch fields that keyframe, and the channel each writes. */
const FIELD_CHANNELS: Record<string, PostKeyframeChannel> = {
  box: "box",
  opacity: "opacity",
  sourceGeometry: "sourceGeometry",
  zoom: "framing",
  panX: "framing",
  panY: "framing",
  rotation: "framing",
};

const EASING_NAMES = Object.keys(EASING_PRESETS);

function seconds(value: number): string {
  return `${Math.round(value * 1000) / 1000} s`;
}

function located(project: PostProject, id: unknown) {
  if (typeof id !== "string" || !id) throw new Error("--item is required.");
  const found = findItem(project, id);
  if (!found) throw new Error(`No item "${id}" in this post.`);
  return found;
}

/** A named time as post seconds. */
function postTime(
  item: PostItem,
  ref: unknown,
  music: PostProject["music"],
  name: string,
  own: boolean | undefined
): number {
  if (!own) return resolvePostTime(ref, music, name);
  if (typeof ref !== "number" || !Number.isFinite(ref))
    throw new Error(`With --own, --${name} is seconds from the item's start.`);
  return item.start + ref;
}

function insideItem(item: PostItem, s: number, name: string): void {
  if (s < item.start - 1e-6 || s > itemEnd(item) + 1e-6)
    throw new Error(
      `--${name} ${seconds(s)} is outside ${item.id}, which runs ${seconds(item.start)} to ${seconds(itemEnd(item))}.`
    );
}

function checkedChannel(item: PostItem, channel: unknown): PostKeyframeChannel {
  const known = channelsOf(item);
  const match = known.find((name) => name === channel);
  if (!match)
    throw new Error(
      `${item.id} (${item.kind}) has no channel "${String(channel)}". Its channels: ${known.join(", ")}.`
    );
  return match;
}

/** The channels an action looks at: the named one, else every channel. */
function channelsFor(
  item: PostItem,
  channel: unknown
): readonly PostKeyframeChannel[] {
  return channel === undefined
    ? channelsOf(item)
    : [checkedChannel(item, channel)];
}

/** The keyframe each channel has within the find distance of `s`. */
function keysAt(
  item: PostItem,
  channels: readonly PostKeyframeChannel[],
  s: number
): { channel: PostKeyframeChannel; at: number }[] {
  const found: { channel: PostKeyframeChannel; at: number }[] = [];
  for (const channel of channels) {
    let best: number | null = null;
    for (const at of channelKeyframeSeconds(item, channel))
      if (
        Math.abs(at - s) <= KEYFRAME_FIND_SECONDS &&
        (best === null || Math.abs(at - s) < Math.abs(best - s))
      )
        best = at;
    if (best !== null) found.push({ channel, at: best });
  }
  if (found.length > 0) return found;
  let before: { channel: string; at: number } | null = null;
  let after: { channel: string; at: number } | null = null;
  for (const channel of channels)
    for (const at of channelKeyframeSeconds(item, channel)) {
      if (at < s && (!before || at > before.at)) before = { channel, at };
      if (at > s && (!after || at < after.at)) after = { channel, at };
    }
  const where = (key: { channel: string; at: number } | null) =>
    key ? `${key.channel} at ${seconds(key.at)}` : "none";
  throw new Error(
    `${item.id} has no keyframe within ${KEYFRAME_FIND_SECONDS} s of ${seconds(s)}. Nearest before: ${where(before)}; after: ${where(after)}.`
  );
}

function withChannelTimes(
  item: PostItem,
  channel: PostKeyframeChannel,
  times: number[]
): PostItem {
  const keyframes = (item as { keyframes?: PostItemKeyframes }).keyframes ?? {};
  const list = keyframes[channel] ?? [];
  // Keys a trim has pushed out of view keep their place; times go to the rest, in order.
  const visible = list
    .filter((key) => keyframeInView(item, key.t))
    .sort((a, b) => a.t - b.t);
  const retimed = new Map(
    visible.map((key, index) => [key, keyframeTimeOf(item, times[index]!)])
  );
  const next = list
    .map((key) => (retimed.has(key) ? { ...key, t: retimed.get(key)! } : key))
    .sort((a, b) => a.t - b.t);
  return { ...item, keyframes: { ...keyframes, [channel]: next } } as PostItem;
}

function setAction(
  project: PostProject,
  item: PostItem,
  op: KeyframeOp,
  ctx: EditContext
): PostProject {
  if (op.at === undefined) throw new Error("set needs --at.");
  const patch = op.patch;
  if (!patch || typeof patch !== "object" || Array.isArray(patch))
    throw new Error(
      'set needs --patch with fields to key, such as {"opacity":0.5}.'
    );
  const fields = Object.keys(patch);
  if (fields.length === 0)
    throw new Error("set needs at least one field in --patch.");
  const wrong = fields.filter((field) => !(field in FIELD_CHANNELS));
  if (wrong.length > 0)
    throw new Error(
      `set keys only fields that animate (${Object.keys(FIELD_CHANNELS).join(", ")}); got ${wrong.join(", ")}.`
    );
  const channels = [
    ...new Set(
      fields.map((field) => checkedChannel(item, FIELD_CHANNELS[field]))
    ),
  ];
  let easing: (typeof EASING_PRESETS)[keyof typeof EASING_PRESETS] | undefined;
  if (op.easing !== undefined) {
    if (!EASING_NAMES.includes(op.easing))
      throw new Error(
        `Unknown easing "${op.easing}". Use one of ${EASING_NAMES.join(", ")}.`
      );
    easing = EASING_PRESETS[op.easing as keyof typeof EASING_PRESETS];
  }
  const s = postTime(item, op.at, project.music, "at", op.own);
  insideItem(item, s, "at");
  let next = project;
  // updateItemAt keys a channel that is already animated; a still channel gets
  // its first keyframe here, holding its current value, so the patch keys it too.
  for (const channel of channels)
    if (!isAnimated(item, channel))
      next = editItemKeyframes(
        next,
        item.id,
        (it) => setKeyframe(it, channel, s),
        ctx
      );
  next = updateItemAt(next, item.id, patch, s, ctx);
  if (easing !== undefined) {
    const after = findItem(next, item.id)!.item;
    for (const channel of channels) {
      if (!segmentAt(after, channel, s))
        throw new Error(
          `An easing shapes the move between two keyframes; ${item.id} has one keyframe on ${channel}.`
        );
      next = editItemKeyframes(
        next,
        item.id,
        (it) => setSegmentEasing(it, channel, s, easing),
        ctx
      );
    }
  }
  return next;
}

function moveAction(
  project: PostProject,
  item: PostItem,
  op: KeyframeOp,
  ctx: EditContext
): PostProject {
  if (op.at === undefined || op.to === undefined)
    throw new Error("move needs --at and --to.");
  const from = postTime(item, op.at, project.music, "at", op.own);
  const to = postTime(item, op.to, project.music, "to", op.own);
  insideItem(item, to, "to");
  const moving = keysAt(item, channelsFor(item, op.channel), from);
  for (const { channel, at } of moving) {
    const others = channelKeyframeSeconds(item, channel).filter(
      (s) => s !== at
    );
    const clash = others.find((s) => Math.abs(s - to) <= KEYFRAME_FIND_SECONDS);
    if (clash !== undefined)
      throw new Error(
        `${channel} already has a keyframe at ${seconds(clash)}; two keyframes cannot share a moment.`
      );
    const before = others.filter((s) => s < at).pop();
    const after = others.find((s) => s > at);
    if (
      (before !== undefined && to < before) ||
      (after !== undefined && to > after)
    )
      throw new Error(
        `Moving ${channel}'s keyframe to ${seconds(to)} would pass its neighbour at ${seconds((to < at ? before : after)!)}; keyframes keep their order.`
      );
  }
  return editItemKeyframes(
    project,
    item.id,
    (it) =>
      moving.reduce(
        (current, { channel, at }) => moveKeyframe(current, channel, at, to),
        it
      ),
    ctx
  );
}

function retimeAction(
  project: PostProject,
  item: PostItem,
  op: KeyframeOp,
  ctx: EditContext
): PostProject {
  if (op.channel === undefined) throw new Error("retime needs --channel.");
  const channel = checkedChannel(item, op.channel);
  if (!Array.isArray(op.times) || op.times.length === 0)
    throw new Error("retime needs --times, one time per keyframe.");
  const current = channelKeyframeSeconds(item, channel);
  if (current.length === 0)
    throw new Error(`${item.id} has no keyframes on ${channel}.`);
  if (op.times.length !== current.length)
    throw new Error(
      `${item.id} has ${current.length} keyframes on ${channel}; --times gave ${op.times.length}.`
    );
  const times = op.times.map((ref, index) =>
    postTime(item, ref, project.music, `times[${index + 1}]`, op.own)
  );
  times.forEach((s, index) => {
    insideItem(item, s, "times");
    const previous = times[index - 1];
    if (previous !== undefined && s - previous <= KEYFRAME_FIND_SECONDS)
      throw new Error(
        `--times must rise, each more than ${KEYFRAME_FIND_SECONDS} s after the one before; ${seconds(s)} follows ${seconds(previous)}.`
      );
  });
  return editItemKeyframes(
    project,
    item.id,
    (it) => withChannelTimes(it, channel, times),
    ctx
  );
}

function deleteAction(
  project: PostProject,
  item: PostItem,
  op: KeyframeOp,
  ctx: EditContext
): PostProject {
  if (op.at === undefined) throw new Error("delete needs --at.");
  const s = postTime(item, op.at, project.music, "at", op.own);
  insideItem(item, s, "at");
  const doomed = keysAt(item, channelsFor(item, op.channel), s);
  return editItemKeyframes(
    project,
    item.id,
    (it) =>
      doomed.reduce(
        (current, { channel, at }) => removeKeyframe(current, channel, at),
        it
      ),
    ctx
  );
}

function clearAction(
  project: PostProject,
  item: PostItem,
  op: KeyframeOp,
  ctx: EditContext
): PostProject {
  // The value left in place is the one at --at, else at the item's start.
  const s =
    op.at === undefined
      ? item.start
      : postTime(item, op.at, project.music, "at", op.own);
  insideItem(item, s, "at");
  if (op.channel === undefined)
    return clearProjectKeyframes(project, s, ctx, item.id);
  const channel = checkedChannel(item, op.channel);
  return editItemKeyframes(
    project,
    item.id,
    (it) => clearChannel(it, channel, s),
    ctx
  );
}

/** Applies a keyframe action. `list` changes nothing; the command line prints it. */
export function keyframeEdit(
  project: PostProject,
  op: KeyframeOp,
  ctx: EditContext
): PostProject {
  if (!KEYFRAME_ACTIONS.includes(op.action))
    throw new Error(`--action must be one of ${KEYFRAME_ACTIONS.join(", ")}.`);
  const { item } = located(project, op.item);
  if (op.channel !== undefined) checkedChannel(item, op.channel);
  let next: PostProject;
  switch (op.action) {
    case "list":
      return project;
    case "set":
      next = setAction(project, item, op, ctx);
      break;
    case "move":
      next = moveAction(project, item, op, ctx);
      break;
    case "retime":
      next = retimeAction(project, item, op, ctx);
      break;
    case "delete":
      next = deleteAction(project, item, op, ctx);
      break;
    case "clear":
      next = clearAction(project, item, op, ctx);
      break;
  }
  return JSON.stringify(next.tracks) === JSON.stringify(project.tracks)
    ? project
    : next;
}

/** Moves a clip in time, keyframes and all, through the core's own move. */
export function moveItemEdit(
  project: PostProject,
  op: MoveOp,
  ctx: EditContext
): PostProject {
  const found = located(project, op.item);
  if (op.to === undefined) throw new Error("move needs --to.");
  const to = resolvePostTime(op.to, project.music, "to");
  if (to < 0) throw new Error("--to cannot be before the post starts.");
  let next: PostProject;
  if (found.trackIndex === 0) {
    if (op.track !== undefined && op.track !== 0)
      throw new Error(
        `${found.item.id} is on the main track and stays there; leave out --track.`
      );
    next = placeMainItem(project, found.item.id, to, ctx);
  } else {
    const track = op.track ?? found.trackIndex;
    if (!Number.isInteger(track) || track < 1 || track > project.tracks.length)
      throw new Error(
        `--track must be a whole number from 1 to ${project.tracks.length} (${project.tracks.length} asks for a new track on top).`
      );
    next = moveOverlayItem(
      project,
      found.item.id,
      { start: to, trackIndex: track },
      ctx
    );
  }
  return JSON.stringify(next.tracks) === JSON.stringify(project.tracks)
    ? project
    : next;
}
