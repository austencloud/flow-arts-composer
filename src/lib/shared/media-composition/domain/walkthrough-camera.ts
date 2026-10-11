import {
  DEFAULT_EASING,
  EASING_PRESETS,
  framingAt,
  sampleEasing,
} from "#lib/shared/media-composition/domain/post-project-keyframes.js";
import {
  POST_FRAME_RATE,
  type PostEasing,
  type PostFraming,
  type PostKeyframe,
  type PostVideoItem,
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
/**
 * A target this big a share of the frame, across or down, stands out without
 * a zoom: Generate, at 40% of the width, does; a Level button, at 12%, sits in
 * a row of others and does not.
 */
export const FOCUS_SHARE = 0.25;
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
/**
 * A zoom move gets a key this often. The engine blends zoom and pan each on
 * its own, which between two far keys swings the view toward the centre and
 * then slides it across; between close keys the swing is small.
 */
const PATH_STEP_SECONDS = 2 / POST_FRAME_RATE;
/**
 * A step whose middle strays further than this from the path, as a share of
 * the frame (half a pixel at 1920 wide), is split once, down to a key each
 * frame. Keys closer than half a frame would merge.
 */
const PATH_TOLERANCE = 1 / 4000;
const LINEAR: PostEasing = EASING_PRESETS.linear;
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

/** Whether a target needs the camera to move in to be picked out. */
export function needsFocus(region: ShareRect): boolean {
  return region.width < FOCUS_SHARE && region.height < FOCUS_SHARE;
}

function containsRect(outer: ShareRect, inner: ShareRect): boolean {
  return (
    inner.x >= outer.x - EPSILON &&
    inner.y >= outer.y - EPSILON &&
    inner.x + inner.width <= outer.x + outer.width + EPSILON &&
    inner.y + inner.height <= outer.y + outer.height + EPSILON
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

/**
 * A moment the camera should serve: a click seen close, a click that only
 * has to be in view, or a pull out.
 */
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
      /** The camera stays if it shows the target and pulls out if not. */
      kind: "see";
      time: number;
      region: ShareRect;
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
      /** Clicks the shot was kept for, which must stay in view. */
      seen: ShareRect[];
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
    if (beat.kind === "see") {
      if (current?.kind !== "close") continue;
      if (containsRect(viewOfFraming(current.framing), beat.region)) {
        current.seen.push(beat.region);
        continue;
      }
      shots.push({
        kind: "wide",
        time: beat.time,
        startAt: beat.time - ARRIVE_BEFORE_SECONDS - MOVE_SECONDS,
        due: beat.time,
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
      const framing = framingForRegion(region, maxZoom);
      const view = viewOfFraming(framing);
      if (
        regionZoom(region, maxZoom) >= GROUP_ZOOM_SHARE * maxZoom &&
        current.seen.every((seen) => containsRect(view, seen))
      ) {
        current.region = region;
        current.lastTime = beat.time;
        current.framing = framing;
        continue;
      }
    }
    shots.push({
      kind: "close",
      time: beat.time,
      lastTime: beat.time,
      region: beat.region,
      seen: [],
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

function framingOfView(view: ShareRect): PostFraming {
  return framingForView(
    view.x + view.width / 2,
    view.y + view.height / 2,
    1 / view.width
  );
}

function lerpRect(a: ShareRect, b: ShareRect, q: number): ShareRect {
  const mix = (from: number, to: number) => from + (to - from) * q;
  return {
    x: mix(a.x, b.x),
    y: mix(a.y, b.y),
    width: mix(a.width, b.width),
    height: mix(a.height, b.height),
  };
}

/** What the engine shows a share `w` of the way between two linear keys. */
function blendFraming(a: PostFraming, b: PostFraming, w: number): PostFraming {
  const mix = (from: number, to: number) => from + (to - from) * w;
  return {
    zoom: mix(a.zoom, b.zoom),
    panX: mix(a.panX, b.panX),
    panY: mix(a.panY, b.panY),
    rotation: mix(a.rotation, b.rotation),
  };
}

/**
 * The inside keys of a move that changes zoom, as [share of the move,
 * framing]. The view keeps to the straight line between its two rectangles,
 * growing or shrinking about one fixed point at an even rate of zoom, eased.
 */
function zoomPath(
  move: CameraMove,
  fromValue: PostFraming,
  toValue: PostFraming
): [number, PostFraming][] {
  const from = viewOfFraming(move.from);
  const to = viewOfFraming(move.to);
  const at = (progress: number): PostFraming => {
    if (progress <= 0) return fromValue;
    if (progress >= 1) return toValue;
    const q = sampleEasing(DEFAULT_EASING, progress);
    // Even zoom: the width changes by one factor each equal step.
    const width = from.width * (to.width / from.width) ** q;
    const along = (width - from.width) / (to.width - from.width);
    return framingOfView(lerpRect(from, to, along));
  };
  // How far a framing's view is from the line between the two rectangles.
  const offPath = (framing: PostFraming) => {
    const view = viewOfFraming(framing);
    const along = (view.width - from.width) / (to.width - from.width);
    return Math.max(
      Math.abs(view.x - (from.x + (to.x - from.x) * along)),
      Math.abs(view.y - (from.y + (to.y - from.y) * along))
    );
  };
  const seconds = move.end - move.start;
  const steps = Math.max(2, Math.ceil(seconds / PATH_STEP_SECONDS));
  const canSplit = seconds / steps / 2 >= 1 / POST_FRAME_RATE - EPSILON;
  const keys: [number, PostFraming][] = [];
  let previous = fromValue;
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps;
    const next = at(progress);
    if (
      canSplit &&
      offPath(blendFraming(previous, next, 0.5)) > PATH_TOLERANCE
    ) {
      const middle = (step - 0.5) / steps;
      keys.push([middle, at(middle)]);
    }
    if (step < steps) keys.push([progress, next]);
    previous = next;
  }
  return keys;
}

/**
 * A wide end of a zoom move, given the pan of the move's other end. At zoom 1
 * the pan shows nothing, and on the straight path out of the whole frame the
 * pan never changes, so the step next to the wide end stays on the path.
 */
function wideEnd(other: PostFraming): PostFraming {
  return { ...WIDE, panX: other.panX, panY: other.panY };
}

/**
 * The moves as one framing keyframe list in take seconds, wide at the start.
 * A move that changes zoom gets inside keys from `zoomPath` with linear steps
 * between. A pan at one zoom is straight already and keeps two keys.
 */
export function cameraKeyframes(
  moves: readonly CameraMove[],
  rangeStart: number
): PostKeyframe<PostFraming>[] {
  const keys: PostKeyframe<PostFraming>[] = [
    { t: rangeStart, value: WIDE, easing: DEFAULT_EASING },
  ];
  for (const move of moves) {
    const last = keys.at(-1)!;
    const zooms = Math.abs(move.from.zoom - move.to.zoom) > EPSILON;
    const isWide = (framing: PostFraming) => framing.zoom <= 1 + EPSILON;
    const fromValue = zooms && isWide(move.from) ? wideEnd(move.to) : move.from;
    const toValue = zooms && isWide(move.to) ? wideEnd(move.from) : move.to;
    const easing = zooms ? LINEAR : DEFAULT_EASING;
    let start = move.start;
    if (move.start - last.t > SAME_KEY_GAP) {
      keys.push({ t: start, value: fromValue, easing });
    } else if (sameFraming(last.value, fromValue)) {
      start = last.t;
      last.easing = easing;
    } else {
      // A wide end with another pan, which shows the same view: hold it a
      // frame so neither move's step next to it changes pan.
      start = last.t + 1 / POST_FRAME_RATE;
      keys.push({ t: start, value: fromValue, easing });
    }
    if (zooms) {
      const timed = { ...move, start };
      for (const [progress, value] of zoomPath(timed, fromValue, toValue)) {
        keys.push({
          t: start + (move.end - start) * progress,
          value,
          easing: LINEAR,
        });
      }
    }
    keys.push({ t: move.end, value: toValue, easing: DEFAULT_EASING });
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
