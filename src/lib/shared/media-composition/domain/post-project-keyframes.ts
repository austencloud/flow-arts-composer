import { cssCubicBezier } from "$lib/shared/transitions/ws-ease";
import {
  POST_KEYFRAME_MERGE_SECONDS,
  POST_MAX_ZOOM,
  POST_MIN_ZOOM,
  POST_TIME_EPSILON,
  clampBox,
  clampFraming,
  itemEnd,
  wrapDegrees,
  type PostBox,
  type PostEasing,
  type PostFraming,
  type PostItem,
  type PostItemKeyframes,
  type PostKeyframe,
  type PostKeyframeChannel,
  type PostVideoItem,
} from "$lib/shared/media-composition/domain/post-project";

/**
 * Pure, item-level keyframe reading and editing. `s` is always post seconds;
 * an item's own `keyframes.*[].t` is content time (see `keyframeTimeOf`). An
 * edit returns the same item reference when nothing actually changes, so a
 * caller can skip the undo step exactly as the other post-project modules do.
 */

// ---------------------------------------------------------------------------
// Channel value plumbing
// ---------------------------------------------------------------------------

/** The value shape each channel keyframes. */
export interface PostChannelValue {
  framing: PostFraming;
  box: PostBox;
  opacity: number;
}

const VIDEO_CHANNELS: readonly PostKeyframeChannel[] = ["framing", "box", "opacity"];
const OTHER_CHANNELS: readonly PostKeyframeChannel[] = ["box", "opacity"];

/** The channels an item's kind can animate; only video has `framing`. */
export function channelsOf(item: PostItem): readonly PostKeyframeChannel[] {
  return item.kind === "video" ? VIDEO_CHANNELS : OTHER_CHANNELS;
}

function itemKeyframes(item: PostItem): PostItemKeyframes | undefined {
  return (item as { keyframes?: PostItemKeyframes }).keyframes;
}

function rawKeyframes<Ch extends PostKeyframeChannel>(
  item: PostItem,
  channel: Ch
): readonly PostKeyframe<PostChannelValue[Ch]>[] | undefined {
  const keyframes = itemKeyframes(item);
  const list = keyframes?.[channel] as PostKeyframe<PostChannelValue[Ch]>[] | undefined;
  return list && list.length > 0 ? list : undefined;
}

function staticValueOf<Ch extends PostKeyframeChannel>(
  item: PostItem,
  channel: Ch
): PostChannelValue[Ch] {
  if (channel === "opacity") return item.opacity as PostChannelValue[Ch];
  if (channel === "box") return item.box as PostChannelValue[Ch];
  const video = item as PostVideoItem;
  return {
    zoom: video.zoom,
    panX: video.panX,
    panY: video.panY,
    rotation: video.rotation,
  } as PostChannelValue[Ch];
}

export function clampChannelValue<Ch extends PostKeyframeChannel>(
  channel: Ch,
  value: PostChannelValue[Ch]
): PostChannelValue[Ch] {
  if (channel === "opacity") {
    return Math.min(1, Math.max(0, value as number)) as PostChannelValue[Ch];
  }
  if (channel === "box") return clampBox(value as PostBox) as PostChannelValue[Ch];
  return clampFraming(value as PostFraming) as PostChannelValue[Ch];
}

/** Structural equality for a channel's value shape (reused by normalize). */
export function sameChannelValue(
  channel: PostKeyframeChannel,
  a: unknown,
  b: unknown
): boolean {
  if (a === b) return true;
  if (channel === "opacity") return a === b;
  if (channel === "box") {
    const x = a as PostBox;
    const y = b as PostBox;
    return x.x === y.x && x.y === y.y && x.width === y.width && x.height === y.height;
  }
  const x = a as PostFraming;
  const y = b as PostFraming;
  return (
    x.zoom === y.zoom &&
    x.panX === y.panX &&
    x.panY === y.panY &&
    x.rotation === y.rotation
  );
}

function lerpChannelValue<Ch extends PostKeyframeChannel>(
  channel: Ch,
  from: PostChannelValue[Ch],
  to: PostChannelValue[Ch],
  e: number
): PostChannelValue[Ch] {
  const lerp = (a: number, b: number) => a + (b - a) * e;
  if (channel === "opacity") {
    return lerp(from as number, to as number) as PostChannelValue[Ch];
  }
  if (channel === "box") {
    const a = from as PostBox;
    const b = to as PostBox;
    return {
      x: lerp(a.x, b.x),
      y: lerp(a.y, b.y),
      width: lerp(a.width, b.width),
      height: lerp(a.height, b.height),
    } as PostChannelValue[Ch];
  }
  const a = from as PostFraming;
  const b = to as PostFraming;
  return {
    zoom: lerp(a.zoom, b.zoom),
    panX: lerp(a.panX, b.panX),
    panY: lerp(a.panY, b.panY),
    rotation: lerp(a.rotation, b.rotation),
  } as PostChannelValue[Ch];
}

function withStaticValue<Ch extends PostKeyframeChannel>(
  item: PostItem,
  channel: Ch,
  value: PostChannelValue[Ch]
): PostItem {
  const clamped = clampChannelValue(channel, value);
  if (channel === "opacity") {
    return item.opacity === clamped ? item : { ...item, opacity: clamped as number };
  }
  if (channel === "box") {
    return sameChannelValue("box", item.box, clamped)
      ? item
      : { ...item, box: clamped as PostBox };
  }
  const video = item as PostVideoItem;
  const framing = clamped as PostFraming;
  if (
    video.zoom === framing.zoom &&
    video.panX === framing.panX &&
    video.panY === framing.panY &&
    video.rotation === framing.rotation
  ) {
    return item;
  }
  return { ...item, ...framing } as PostItem;
}

/** Sets (or clears) one channel's keyframe list, pruning an empty object. */
function withChannel<Ch extends PostKeyframeChannel>(
  item: PostItem,
  channel: Ch,
  keyframes: PostKeyframe<PostChannelValue[Ch]>[] | undefined
): PostItem {
  const existing = itemKeyframes(item);
  const nonEmpty = keyframes && keyframes.length > 0 ? keyframes : undefined;
  if ((existing?.[channel] as unknown) === nonEmpty) return item;
  const nextKeyframes: Record<string, unknown> = { ...existing };
  if (nonEmpty) nextKeyframes[channel] = nonEmpty;
  else delete nextKeyframes[channel];
  const next = item as Record<string, unknown>;
  if (Object.keys(nextKeyframes).length === 0) {
    if (!existing) return item;
    const { keyframes: _drop, ...rest } = next;
    return rest as unknown as PostItem;
  }
  return { ...item, keyframes: nextKeyframes } as unknown as PostItem;
}

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

/** Post seconds -> the item's own content-time clock. */
export function keyframeTimeOf(item: PostItem, s: number): number {
  if (item.kind === "video") {
    return item.sourceIn + (s - item.start) * item.speed;
  }
  return s - item.start;
}

/** The item's content-time clock -> post seconds. */
export function postSecondsOfKeyframe(item: PostItem, t: number): number {
  if (item.kind === "video") {
    return item.start + (t - item.sourceIn) / item.speed;
  }
  return item.start + t;
}

/** Whether content time `t` currently falls inside the item's visible span. */
export function keyframeInView(item: PostItem, t: number): boolean {
  const s = postSecondsOfKeyframe(item, t);
  return s >= item.start - POST_TIME_EPSILON && s <= itemEnd(item) + POST_TIME_EPSILON;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export function isAnimated(item: PostItem, channel: PostKeyframeChannel): boolean {
  return rawKeyframes(item, channel) !== undefined;
}

/** `keyframes[channel]` sorted by post time within half a frame, else -1. */
export function keyframeIndexAt(
  item: PostItem,
  channel: PostKeyframeChannel,
  s: number
): number {
  const list = rawKeyframes(item, channel);
  if (!list) return -1;
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < list.length; index++) {
    const distance = Math.abs(postSecondsOfKeyframe(item, list[index]!.t) - s);
    if (distance <= POST_KEYFRAME_MERGE_SECONDS && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function sampleChannel<Ch extends PostKeyframeChannel>(
  item: PostItem,
  channel: Ch,
  s: number
): PostChannelValue[Ch] {
  const list = rawKeyframes(item, channel);
  if (!list) return staticValueOf(item, channel);
  const t = keyframeTimeOf(item, s);
  const first = list[0]!;
  if (t <= first.t) return clampChannelValue(channel, first.value);
  const last = list[list.length - 1]!;
  if (t >= last.t) return clampChannelValue(channel, last.value);
  for (let index = 1; index < list.length; index++) {
    const next = list[index]!;
    if (t >= next.t) continue;
    const previous = list[index - 1]!;
    if (previous.easing === "hold") {
      return clampChannelValue(channel, previous.value);
    }
    const p = (t - previous.t) / (next.t - previous.t);
    const e = sampleEasing(previous.easing, p);
    return clampChannelValue(
      channel,
      lerpChannelValue(channel, previous.value, next.value, e)
    );
  }
  return clampChannelValue(channel, last.value);
}

export function channelValueAt<Ch extends PostKeyframeChannel>(
  item: PostItem,
  channel: Ch,
  s: number
): PostChannelValue[Ch] {
  return sampleChannel(item, channel, s);
}

export function framingAt(item: PostVideoItem, s: number): PostFraming {
  return channelValueAt(item, "framing", s);
}

export function boxAt(item: PostItem, s: number): PostBox {
  return channelValueAt(item, "box", s);
}

export function opacityAt(item: PostItem, s: number): number {
  return channelValueAt(item, "opacity", s);
}

/** The nearest in-view keyframe strictly before/after `s`, or null. */
export function adjacentKeyframeSeconds(
  item: PostItem,
  channel: PostKeyframeChannel,
  s: number,
  direction: "previous" | "next"
): number | null {
  const list = rawKeyframes(item, channel);
  if (!list) return null;
  const seconds = list
    .filter((kf) => keyframeInView(item, kf.t))
    .map((kf) => postSecondsOfKeyframe(item, kf.t))
    .sort((a, b) => a - b);
  if (direction === "previous") {
    let result: number | null = null;
    for (const value of seconds) {
      if (value < s - POST_TIME_EPSILON) result = value;
      else break;
    }
    return result;
  }
  for (const value of seconds) {
    if (value > s + POST_TIME_EPSILON) return value;
  }
  return null;
}

export interface PostKeyframeMarker {
  seconds: number;
  channels: PostKeyframeChannel[];
}

/** In-view keyframes across every channel, merged within half a frame. */
export function keyframeMarkers(item: PostItem): PostKeyframeMarker[] {
  const points: { seconds: number; channel: PostKeyframeChannel }[] = [];
  for (const channel of channelsOf(item)) {
    const list = rawKeyframes(item, channel);
    if (!list) continue;
    for (const kf of list) {
      if (!keyframeInView(item, kf.t)) continue;
      points.push({ seconds: postSecondsOfKeyframe(item, kf.t), channel });
    }
  }
  points.sort((a, b) => a.seconds - b.seconds);
  const markers: PostKeyframeMarker[] = [];
  for (const point of points) {
    const last = markers[markers.length - 1];
    if (last && Math.abs(point.seconds - last.seconds) <= POST_KEYFRAME_MERGE_SECONDS) {
      if (!last.channels.includes(point.channel)) last.channels.push(point.channel);
    } else {
      markers.push({ seconds: point.seconds, channels: [point.channel] });
    }
  }
  return markers;
}

export interface PostKeyframeSegment {
  fromSeconds: number;
  toSeconds: number;
  easing: PostEasing;
  /** The departing keyframe's index in `keyframes[channel]`. */
  index: number;
}

/**
 * The segment holding `s`: on a keyframe, the one it departs into, or the one
 * arriving when it is the last keyframe. Null with fewer than two keyframes,
 * or when `s` sits before the first or after the last.
 */
export function segmentAt(
  item: PostItem,
  channel: PostKeyframeChannel,
  s: number
): PostKeyframeSegment | null {
  const list = rawKeyframes(item, channel);
  if (!list || list.length < 2) return null;
  const seconds = list.map((kf) => postSecondsOfKeyframe(item, kf.t));
  const onIndex = seconds.findIndex(
    (value) => Math.abs(value - s) <= POST_KEYFRAME_MERGE_SECONDS
  );
  if (onIndex >= 0) {
    const index = onIndex === list.length - 1 ? onIndex - 1 : onIndex;
    return {
      fromSeconds: seconds[index]!,
      toSeconds: seconds[index + 1]!,
      easing: list[index]!.easing,
      index,
    };
  }
  for (let index = 0; index < list.length - 1; index++) {
    if (s > seconds[index]! && s < seconds[index + 1]!) {
      return {
        fromSeconds: seconds[index]!,
        toSeconds: seconds[index + 1]!,
        easing: list[index]!.easing,
        index,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

export const EASING_PRESETS = {
  linear: [0, 0, 1, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
  smooth: [0.65, 0, 0.35, 1],
  overshoot: [0.34, 1.56, 0.64, 1],
  hold: "hold",
} as const satisfies Record<string, PostEasing>;

export type PostEasingPresetId = keyof typeof EASING_PRESETS;

export const DEFAULT_EASING: PostEasing = EASING_PRESETS["ease-in-out"];

/** The preset id a curve matches within 1e-3, else `"custom"`. */
export function easingPresetOf(easing: PostEasing): PostEasingPresetId | "custom" {
  if (easing === "hold") return "hold";
  for (const id of Object.keys(EASING_PRESETS) as PostEasingPresetId[]) {
    const preset = EASING_PRESETS[id];
    if (preset === "hold") continue;
    if (
      Math.abs(preset[0] - easing[0]) < 1e-3 &&
      Math.abs(preset[1] - easing[1]) < 1e-3 &&
      Math.abs(preset[2] - easing[2]) < 1e-3 &&
      Math.abs(preset[3] - easing[3]) < 1e-3
    ) {
      return id;
    }
  }
  return "custom";
}

const bezierCache = new Map<string, (p: number) => number>();

/**
 * Eases progress `p` in [0, 1]. `hold` reads as a step: 0 until `p` reaches 1.
 * Bezier functions are cached by their four control-point numbers, so
 * per-frame sampling allocates nothing new.
 */
export function sampleEasing(easing: PostEasing, p: number): number {
  const clamped = Math.min(1, Math.max(0, p));
  if (easing === "hold") return clamped >= 1 ? 1 : 0;
  const key = easing.join(",");
  let fn = bezierCache.get(key);
  if (!fn) {
    fn = cssCubicBezier(easing[0], easing[1], easing[2], easing[3]);
    bezierCache.set(key, fn);
  }
  return fn(clamped);
}

// ---------------------------------------------------------------------------
// Edits
// ---------------------------------------------------------------------------

/** Adds a keyframe at `s`, or updates the one within half a frame of it. */
export function setKeyframe<Ch extends PostKeyframeChannel>(
  item: PostItem,
  channel: Ch,
  s: number,
  value?: PostChannelValue[Ch]
): PostItem {
  const t = keyframeTimeOf(item, s);
  if (!keyframeInView(item, t)) return item;
  const existing = rawKeyframes(item, channel);
  const resolvedValue = clampChannelValue(
    channel,
    value !== undefined ? value : channelValueAt(item, channel, s)
  );
  const index = keyframeIndexAt(item, channel, s);
  if (index >= 0) {
    const current = existing![index]!;
    if (current.t === t && sameChannelValue(channel, current.value, resolvedValue)) {
      return item;
    }
    const next = existing!.map((kf, i) =>
      i === index ? { t, value: resolvedValue, easing: kf.easing } : kf
    );
    return withChannel(item, channel, next);
  }
  const segment = segmentAt(item, channel, s);
  const easing = segment ? segment.easing : DEFAULT_EASING;
  const next = [...(existing ?? []), { t, value: resolvedValue, easing }].sort(
    (a, b) => a.t - b.t
  );
  return withChannel(item, channel, next);
}

/** Removes the keyframe at `s`. The last one leaves its value in the static field. */
export function removeKeyframe(
  item: PostItem,
  channel: PostKeyframeChannel,
  s: number
): PostItem {
  const existing = rawKeyframes(item, channel);
  if (!existing) return item;
  const index = keyframeIndexAt(item, channel, s);
  if (index < 0) return item;
  const removedValue = existing[index]!.value;
  const next = existing.filter((_, i) => i !== index);
  if (next.length === 0) {
    return withStaticValue(withChannel(item, channel, undefined), channel, removedValue);
  }
  return withChannel(item, channel, next);
}

/** Adds a keyframe at `s` if there is none there yet, else removes it. */
export function toggleKeyframe(
  item: PostItem,
  channel: PostKeyframeChannel,
  s: number
): PostItem {
  return keyframeIndexAt(item, channel, s) >= 0
    ? removeKeyframe(item, channel, s)
    : setKeyframe(item, channel, s);
}

/** Removes whichever channel each has a keyframe at `s`. */
export function removeKeyframesAt(item: PostItem, s: number): PostItem {
  let next = item;
  for (const channel of channelsOf(item)) next = removeKeyframe(next, channel, s);
  return next;
}

/**
 * Moves every channel's keyframe at `fromS` to `toS`, clamped to the item's
 * span. One landing on another replaces it. Pure, so a drag can re-apply it
 * to the project it started from.
 */
export function moveKeyframes(item: PostItem, fromS: number, toS: number): PostItem {
  const clampedTo = Math.min(itemEnd(item), Math.max(item.start, toS));
  const toT = keyframeTimeOf(item, clampedTo);
  let next = item;
  for (const channel of channelsOf(item)) {
    const list = rawKeyframes(item, channel);
    if (!list) continue;
    const fromIndex = keyframeIndexAt(item, channel, fromS);
    if (fromIndex < 0) continue;
    const moving = list[fromIndex]!;
    if (Math.abs(toT - moving.t) <= POST_TIME_EPSILON) continue;
    const landingIndex = keyframeIndexAt(item, channel, clampedTo);
    const relocated = { ...moving, t: toT };
    let updated = list.filter((_, i) => i !== fromIndex);
    if (landingIndex >= 0 && landingIndex !== fromIndex) {
      const target = list[landingIndex]!;
      updated = updated.filter((kf) => kf !== target);
    }
    updated = [...updated, relocated].sort((a, b) => a.t - b.t);
    next = withChannel(next, channel, updated as never);
  }
  return next;
}

/** Sets the easing of the segment under `s`; a no-op with no such segment. */
export function setSegmentEasing(
  item: PostItem,
  channel: PostKeyframeChannel,
  s: number,
  easing: PostEasing
): PostItem {
  const segment = segmentAt(item, channel, s);
  if (!segment) return item;
  const list = rawKeyframes(item, channel)!;
  const current = list[segment.index]!;
  if (sameEasing(current.easing, easing)) return item;
  const next = list.map((kf, i) => (i === segment.index ? { ...kf, easing } : kf));
  return withChannel(item, channel, next as never);
}

function sameEasing(a: PostEasing, b: PostEasing): boolean {
  if (a === "hold" || b === "hold") return a === b;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/**
 * The auto-key rule: while `channel` has keyframes, writes (or updates) one
 * at `s`; otherwise it changes the static field. A write outside the item's
 * span does nothing when the channel is animated.
 */
export function writeChannelValue<Ch extends PostKeyframeChannel>(
  item: PostItem,
  channel: Ch,
  s: number,
  value: PostChannelValue[Ch]
): PostItem {
  if (isAnimated(item, channel)) return setKeyframe(item, channel, s, value);
  return withStaticValue(item, channel, value);
}

/** Un-animates a channel; its static field takes the value at `s`. */
export function clearChannel(
  item: PostItem,
  channel: PostKeyframeChannel,
  s: number
): PostItem {
  if (!isAnimated(item, channel)) return item;
  const value = channelValueAt(item, channel, s);
  return withStaticValue(withChannel(item, channel, undefined), channel, value);
}

/**
 * Shifts every channel's `t` by `-headCut`, so a start trim never moves an
 * animation. A no-op for video, whose keyframes already ride the take's own
 * clock and so never need to move for a trim.
 */
export function shiftKeyframes(item: PostItem, headCut: number): PostItem {
  if (item.kind === "video" || headCut === 0) return item;
  if (!isAnimated(item, "box") && !isAnimated(item, "opacity")) return item;
  let next = item;
  for (const channel of OTHER_CHANNELS) {
    const list = rawKeyframes(item, channel);
    if (!list) continue;
    next = withChannel(
      next,
      channel,
      list.map((kf) => ({ ...kf, t: kf.t - headCut })) as never
    );
  }
  return next;
}
