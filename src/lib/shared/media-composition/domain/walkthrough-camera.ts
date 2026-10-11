import {
  DEFAULT_EASING,
  framingAt,
} from "#lib/shared/media-composition/domain/post-project-keyframes.js";
import type {
  PostEasing,
  PostFraming,
  PostKeyframe,
  PostVideoItem,
} from "#lib/shared/media-composition/domain/post-project.js";

/**
 * The walkthrough's camera: where it looks at each click and when it moves,
 * as video framing keyframes. Positions are shares of the recorded frame,
 * which the canvas matches, so a share means the same thing in the take and
 * in the output. Times are take seconds.
 *
 * The pan for a view centre follows the compositor: a layer drawn into the
 * whole frame at zoom z and pan p puts the take's point u at
 * `0.5 + p(z - 1) + z(u - 0.5)` of the output (`resolvePanOffset` in
 * `media-fit.ts`, `applyLayerTransform` in `post-studio-frame-compositor.ts`).
 */

export interface ShareRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SharePoint {
  x: number;
  y: number;
}

export const WIDE: PostFraming = { zoom: 1, panX: 0, panY: 0, rotation: 0 };

/** A close shot frames its target widened by these shares of the frame. */
export const SHOT_PAD_X = 0.1;
export const SHOT_PAD_Y = 0.3;
/** Close beats share a shot when their union still fits at this share of the zoom cap. */
export const GROUP_ZOOM_SHARE = 0.8;
/** ...and the next click comes within this many seconds. */
export const GROUP_GAP_SECONDS = 6;
export const MOVE_SECONDS = 0.8;
/** A close move lands this long before its click. */
export const ARRIVE_BEFORE_SECONDS = 0.3;
export const MIN_MOVE_SECONDS = 0.4;
/** Keys this close to a clip's end are replaced by the sampled end key. */
const END_KEY_GAP = 1 / 60;
/** Keys closer than this are one key. */
const SAME_KEY_GAP = 1 / 30;
const EPSILON = 1e-6;

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** The framing that centres the view on (cx, cy), as near as the frame's edges allow. */
export function framingForView(
  cx: number,
  cy: number,
  zoom: number
): PostFraming {
  if (zoom <= 1 + EPSILON) return WIDE;
  const pan = (centre: number) =>
    clamp((-zoom * (centre - 0.5)) / (zoom - 1), -0.5, 0.5);
  return { zoom, panX: pan(cx), panY: pan(cy), rotation: 0 };
}

/** Where a point of the take lands in the output. */
export function toOutput(framing: PostFraming, point: SharePoint): SharePoint {
  const lift = framing.zoom - 1;
  return {
    x: 0.5 + framing.panX * lift + framing.zoom * (point.x - 0.5),
    y: 0.5 + framing.panY * lift + framing.zoom * (point.y - 0.5),
  };
}

export function rectToOutput(framing: PostFraming, rect: ShareRect): ShareRect {
  const corner = toOutput(framing, rect);
  return {
    x: corner.x,
    y: corner.y,
    width: rect.width * framing.zoom,
    height: rect.height * framing.zoom,
  };
}

/** The part of the take a framing shows. */
export function viewOfFraming(framing: PostFraming): ShareRect {
  const zoom = Math.max(1, framing.zoom);
  const lift = zoom - 1;
  return {
    x: 0.5 + (-0.5 - framing.panX * lift) / zoom,
    y: 0.5 + (-0.5 - framing.panY * lift) / zoom,
    width: 1 / zoom,
    height: 1 / zoom,
  };
}

export function unionRect(a: ShareRect, b: ShareRect): ShareRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

/** The zoom that frames a target with room for its bubble, up to the cap. */
export function regionZoom(region: ShareRect, maxZoom: number): number {
  const width = region.width + SHOT_PAD_X;
  const height = region.height + SHOT_PAD_Y;
  return Math.max(1, Math.min(maxZoom, 1 / width, 1 / height));
}

export function framingForRegion(
  region: ShareRect,
  maxZoom: number
): PostFraming {
  return framingForView(
    region.x + region.width / 2,
    region.y + region.height / 2,
    regionZoom(region, maxZoom)
  );
}

export function sameFraming(a: PostFraming, b: PostFraming): boolean {
  return (
    Math.abs(a.zoom - b.zoom) < EPSILON &&
    Math.abs(a.panX - b.panX) < EPSILON &&
    Math.abs(a.panY - b.panY) < EPSILON &&
    Math.abs(a.rotation - b.rotation) < EPSILON
  );
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/** A moment the camera should serve: a click seen close, or a pull out. */
export type CameraBeat =
  | {
      kind: "close";
      /** When the camera must be there. */
      time: number;
      region: ShareRect;
      /** A chapter's first line starts its own shot. */
      newShot?: boolean;
    }
  | {
      kind: "wide";
      time: number;
      /** When the pull out starts. */
      startAt: number;
      /** When it must have landed, when that matters. */
      due?: number;
    };

export type CameraShot =
  | {
      kind: "close";
      time: number;
      lastTime: number;
      region: ShareRect;
      framing: PostFraming;
    }
  | {
      kind: "wide";
      time: number;
      startAt: number;
      due?: number;
      framing: PostFraming;
    };

/** Beats to shots: close beats near each other in time and space share one view. */
export function planShots(
  beats: readonly CameraBeat[],
  maxZoom: number
): CameraShot[] {
  const ordered = [...beats].sort((a, b) => a.time - b.time);
  const shots: CameraShot[] = [];
  for (const beat of ordered) {
    const current = shots.at(-1);
    if (beat.kind === "wide") {
      if (current?.kind === "wide") continue;
      shots.push({
        kind: "wide",
        time: beat.time,
        startAt: beat.startAt,
        ...(beat.due === undefined ? {} : { due: beat.due }),
        framing: WIDE,
      });
      continue;
    }
    if (
      current?.kind === "close" &&
      !beat.newShot &&
      beat.time - current.lastTime < GROUP_GAP_SECONDS
    ) {
      const region = unionRect(current.region, beat.region);
      if (regionZoom(region, maxZoom) >= GROUP_ZOOM_SHARE * maxZoom) {
        current.region = region;
        current.lastTime = beat.time;
        current.framing = framingForRegion(region, maxZoom);
        continue;
      }
    }
    shots.push({
      kind: "close",
      time: beat.time,
      lastTime: beat.time,
      region: beat.region,
      framing: framingForRegion(beat.region, maxZoom),
    });
  }
  return shots;
}

export interface CameraMove {
  start: number;
  end: number;
  from: PostFraming;
  to: PostFraming;
}

/**
 * Shots to moves, in order. A move that would start before the previous one
 * ends starts at that end and takes at least `MIN_MOVE_SECONDS`.
 */
export function scheduleMoves(
  shots: readonly CameraShot[],
  rangeStart: number
): { moves: CameraMove[]; warnings: string[] } {
  const moves: CameraMove[] = [];
  const warnings: string[] = [];
  let current = WIDE;
  let free = rangeStart;
  for (const shot of shots) {
    if (sameFraming(current, shot.framing)) continue;
    const wanted =
      shot.kind === "close"
        ? shot.time - ARRIVE_BEFORE_SECONDS - MOVE_SECONDS
        : shot.startAt;
    const start = Math.max(wanted, free);
    const end = Math.max(wanted + MOVE_SECONDS, start + MIN_MOVE_SECONDS);
    const due = shot.kind === "close" ? shot.time : shot.due;
    if (due !== undefined && end > due + EPSILON) {
      warnings.push(
        `The camera reaches the ${shot.kind} shot at ${end.toFixed(2)} s, after its moment at ${due.toFixed(2)} s.`
      );
    }
    moves.push({ start, end, from: current, to: shot.framing });
    current = shot.framing;
    free = end;
  }
  return { moves, warnings };
}

/** The moves as one framing keyframe list in take seconds, wide at the start. */
export function cameraKeyframes(
  moves: readonly CameraMove[],
  rangeStart: number
): PostKeyframe<PostFraming>[] {
  const keys: PostKeyframe<PostFraming>[] = [
    { t: rangeStart, value: WIDE, easing: DEFAULT_EASING },
  ];
  for (const move of moves) {
    const last = keys.at(-1)!;
    if (move.start - last.t > SAME_KEY_GAP) {
      keys.push({ t: move.start, value: move.from, easing: DEFAULT_EASING });
    }
    keys.push({ t: move.end, value: move.to, easing: DEFAULT_EASING });
  }
  return keys;
}

/** Samples a keyframe list the way the engine does, at take seconds `t`. */
export function cameraSampler(
  keys: readonly PostKeyframe<PostFraming>[]
): (t: number) => PostFraming {
  // An item whose clock is take seconds: start and sourceIn agree at speed 1.
  const probe = {
    kind: "video",
    start: 0,
    sourceIn: 0,
    speed: 1,
    ...WIDE,
    keyframes: { framing: keys },
  } as unknown as PostVideoItem;
  return (t) => framingAt(probe, t);
}

/**
 * The keys one clip of the take, `[a, b]`, carries: the framing at each end,
 * sampled, and the keys strictly inside. A clip after a cut starts on the
 * framing the camera has there.
 */
export function splitKeyframes(
  keys: readonly PostKeyframe<PostFraming>[],
  a: number,
  b: number,
  sample: (t: number) => PostFraming
): PostKeyframe<PostFraming>[] {
  const before = keys.filter((key) => key.t <= a + EPSILON).at(-1);
  const startEasing: PostEasing = before?.easing ?? DEFAULT_EASING;
  return [
    { t: a, value: sample(a), easing: startEasing },
    ...keys.filter((key) => key.t > a + END_KEY_GAP && key.t < b - END_KEY_GAP),
    { t: b, value: sample(b), easing: DEFAULT_EASING },
  ];
}
