/**
 * Camera math for the Composer fly-through prototypes (dev-only test route).
 *
 * Both versions stage the real /composer sections on a fixed stage; this
 * module only turns a scroll offset into where each section sits in depth. It
 * never touches the DOM, so the flight can be tested without a browser.
 *
 * Stops: the camera follows the scroll. It rests at one section, pans through
 * it when the section is taller than the stage, then flies to the next one
 * along a winding path.
 * Glide: the same rests and pans, but leaving a section starts one timed glide
 * straight ahead to the next, whatever the scroll does meanwhile.
 */

/** CSS perspective both versions project through, in px. */
export const FLIGHT_PERSPECTIVE = 1000;
/** Depth between neighbouring stops, in px. */
export const STOP_SPACING = 1600;
/** Stops this many places ahead have faded out and leave the scene. */
export const AHEAD_FADE = 2.2;
/** A stop behind the camera has faded out after this fraction of a flight. */
export const PASS_FADE = 0.4;
/** Sideways swing of the path between stops, as a fraction of stage width. */
export const LANE_SWING = 0.16;
/** Vertical swing of the path between stops, as a fraction of stage height. */
export const RISE_SWING = 0.04;
/** Scroll px short of a dock that still counts as resting on it. */
export const DOCK_TOLERANCE = 1;

export interface StopsPlanInput {
  /** Layout height of each stop, in page order. */
  readonly heights: readonly number[];
  /** Stage height a docked stop can use before it must pan. */
  readonly room: number;
  /** Scroll distance of one flight between neighbouring stops. */
  readonly travel: number;
  /** Scroll distance the camera rests at a stop before flying on. */
  readonly hold: number;
}

export interface StopsPlan {
  /** How far each stop pans while docked; 0 when it fits the stage. */
  readonly pans: readonly number[];
  /** Scroll offset where each stop docks with its top in view. */
  readonly docks: readonly number[];
  readonly travel: number;
  readonly hold: number;
  /** Scroll length of the whole flight. */
  readonly length: number;
}

export interface CameraState {
  /** Continuous stop coordinate: 2 rests on stop 2, 2.5 is halfway to 3. */
  readonly position: number;
  /** Current pan of every stop, so a stop left behind keeps its end in view. */
  readonly pans: readonly number[];
}

export interface StopPose {
  /** translateZ in px; negative is ahead of the camera. */
  readonly z: number;
  readonly opacity: number;
  /** False once the stop has faded out and should leave the scene. */
  readonly present: boolean;
  /** True only while the camera rests on this stop. */
  readonly docked: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function planStops({
  heights,
  room,
  travel,
  hold,
}: StopsPlanInput): StopsPlan {
  const pans = heights.map((height) => Math.max(0, Math.ceil(height - room)));
  const docks: number[] = [];
  let cursor = 0;
  pans.forEach((pan, index) => {
    docks.push(cursor);
    cursor += pan + hold;
    if (index < pans.length - 1) cursor += travel;
  });
  return { pans, docks, travel, hold, length: cursor };
}

/** Scroll offset where the camera leaves stop `index` for the next one. */
export function departOffset(plan: StopsPlan, index: number): number {
  return (plan.docks[index] ?? 0) + (plan.pans[index] ?? 0) + plan.hold;
}

export function cameraAt(plan: StopsPlan, offset: number): CameraState {
  const count = plan.docks.length;
  const scroll = clamp(offset, 0, plan.length);
  let position = Math.max(0, count - 1);
  for (let index = 0; index < count - 1; index += 1) {
    const depart = departOffset(plan, index);
    if (scroll <= depart) {
      position = index;
      break;
    }
    if (scroll < plan.docks[index + 1]) {
      position = index + (scroll - depart) / plan.travel;
      // A smooth scroll can stop a device pixel short of a dock. That still
      // counts as arrived, so the panel lands flat instead of a hair deep.
      if (plan.docks[index + 1] - scroll < DOCK_TOLERANCE) position = index + 1;
      break;
    }
  }
  const pans = plan.pans.map((pan, index) =>
    clamp(scroll - plan.docks[index], 0, pan)
  );
  return { position, pans };
}

/** The stop the controls should mark as current. */
export function activeStop(position: number): number {
  return Math.round(position);
}

/**
 * Where the camera should come to rest once scrolling stops, or null when it
 * already rests on a stop. A flight that has started finishes in the direction
 * it was moving, so one wheel notch or arrow press carries you a whole stop.
 * Flying backwards arrives at the far end of a tall stop, where you left it.
 */
export function settleOffset(
  plan: StopsPlan,
  offset: number,
  direction: number
): number | null {
  const { position } = cameraAt(plan, offset);
  const from = Math.floor(position);
  if (position === from) return null;
  const forward = direction > 0 || (direction === 0 && position - from >= 0.5);
  return forward ? plan.docks[from + 1] : plan.docks[from] + plan.pans[from];
}

export function stopPose(relative: number): StopPose {
  const z = 0 - relative * STOP_SPACING;
  const opacity =
    relative >= 0
      ? clamp(1 - relative / AHEAD_FADE, 0, 1)
      : clamp(1 + relative / PASS_FADE, 0, 1);
  return {
    z,
    opacity,
    present: relative > -PASS_FADE && relative < AHEAD_FADE,
    docked: Math.abs(relative) < 0.001,
  };
}

/** Sideways and vertical place of a stop on the path, in stage fractions. */
function lane(index: number): { x: number; y: number } {
  if (index <= 0) return { x: 0, y: 0 };
  const side = index % 2 === 1 ? 1 : -1;
  return { x: side * LANE_SWING, y: -side * RISE_SWING };
}

/** Path offset at a continuous camera position, interpolated between stops. */
export function pathAt(position: number): { x: number; y: number } {
  const from = Math.floor(position);
  const t = position - from;
  const a = lane(from);
  const b = lane(from + 1);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Stop offset from the camera's own place on the path, in stage fractions. */
export function laneOffset(
  index: number,
  position: number
): { x: number; y: number } {
  const stop = lane(index);
  const camera = pathAt(position);
  return { x: stop.x - camera.x, y: stop.y - camera.y };
}

/** Glide: depth the next stop waits at before it arrives, in px. */
export const GLIDE_AHEAD_DEPTH = 180;
/** Glide: depth a stop drifts toward the camera as it is left, in px. */
export const GLIDE_BEHIND_DEPTH = 140;
/** Glide: an arriving stop starts to show once it is this close, in stops. */
export const GLIDE_ARRIVE_SHOW = 0.65;
/** Glide: an arriving stop is fully clear once it is this close. */
export const GLIDE_ARRIVE_CLEAR = 0.1;
/** Glide: a stop left behind has faded out after this much of a glide. */
export const GLIDE_LEAVE_FADE = 0.5;
/** Glide: star depth travelled per glide, in px. */
export const GLIDE_STAR_STEP = 240;

export interface GlidePose {
  /** translateZ in px; negative is ahead of the camera. */
  readonly z: number;
  readonly opacity: number;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Where a stop sits during a glide, from its place relative to the camera: 0
 * rests in the stage plane, 1 waits one stop ahead, -1 has been left one stop
 * behind. The leaving stop is almost gone before the arriving one shows, so
 * two sections' text never reads at once.
 */
export function glidePose(relative: number): GlidePose {
  const place = clamp(relative, -1, 1);
  if (place >= 0) {
    return {
      z: -place * GLIDE_AHEAD_DEPTH,
      opacity: 1 - smoothstep(GLIDE_ARRIVE_CLEAR, GLIDE_ARRIVE_SHOW, place),
    };
  }
  return {
    z: -place * GLIDE_BEHIND_DEPTH,
    opacity: 1 - smoothstep(0, GLIDE_LEAVE_FADE, -place),
  };
}

/** Scroll offsets that count as resting on stop `index`: its pan, with the
    plan's hold on either side. */
export function restRange(
  plan: StopsPlan,
  index: number
): { start: number; end: number } {
  const dock = plan.docks[index] ?? 0;
  return {
    start: dock - plan.hold,
    end: dock + (plan.pans[index] ?? 0) + plan.hold,
  };
}

/** The stop whose rest range is closest to a scroll offset. */
export function nearestStop(plan: StopsPlan, offset: number): number {
  let nearest = 0;
  let nearestDistance = Infinity;
  plan.docks.forEach((_dock, index) => {
    const { start, end } = restRange(plan, index);
    const distance =
      offset < start ? start - offset : offset > end ? offset - end : 0;
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
}

/**
 * The stop a scroll away from the current one should glide to: at least the
 * neighbour in the direction of the scroll, further when the scroll went
 * further, as a dragged scrollbar does. Null while the offset still rests on
 * the current stop, and past the last stop, where the page runs on to its
 * footer.
 */
export function glideTarget(
  plan: StopsPlan,
  current: number,
  offset: number
): number | null {
  const { start, end } = restRange(plan, current);
  const last = plan.docks.length - 1;
  if (offset > end && current < last) {
    return Math.max(current + 1, nearestStop(plan, offset));
  }
  if (offset < start && current > 0) {
    return Math.min(current - 1, nearestStop(plan, offset));
  }
  return null;
}

/** How far stop `index` has panned at a scroll offset. */
export function restPan(
  plan: StopsPlan,
  index: number,
  offset: number
): number {
  return clamp(offset - (plan.docks[index] ?? 0), 0, plan.pans[index] ?? 0);
}

/** Scroll offset that shows stop `index` panned by `pan`. */
export function landingOffset(
  plan: StopsPlan,
  index: number,
  pan: number
): number {
  return (plan.docks[index] ?? 0) + clamp(pan, 0, plan.pans[index] ?? 0);
}
