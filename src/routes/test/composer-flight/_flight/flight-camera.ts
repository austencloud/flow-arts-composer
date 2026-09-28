/**
 * Camera math for the Composer fly-through prototypes (dev-only test route).
 *
 * Both versions stage the real /composer sections; this module only turns a
 * scroll offset into where each section sits in depth. It never touches the
 * DOM, so the flight can be tested without a browser.
 *
 * Stops: a fixed stage. The camera rests at one section, pans through it when
 * the section is taller than the stage, then flies to the next section.
 * Flow: the page scrolls normally. A section rests flat while it crosses the
 * reading band and only travels in depth while it approaches from below or
 * leaves over the top.
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

export interface FlowPose {
  readonly z: number;
  readonly opacity: number;
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
    const nextDock = plan.docks[index + 1] ?? plan.length;
    if (scroll < nextDock) {
      position = index + (scroll - depart) / plan.travel;
      // A smooth scroll can stop a device pixel short of a dock. That still
      // counts as arrived, so the panel lands flat instead of a hair deep.
      if (nextDock - scroll < DOCK_TOLERANCE) position = index + 1;
      break;
    }
  }
  const pans = plan.pans.map((pan, index) =>
    clamp(scroll - (plan.docks[index] ?? 0), 0, pan)
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
  return forward
    ? (plan.docks[from + 1] ?? null)
    : (plan.docks[from] ?? 0) + (plan.pans[from] ?? 0);
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

/** Viewport fraction below which an approaching section starts to rest. */
export const FLOW_ENTER_LINE = 0.86;
/** Viewport fraction above which a leaving section starts to fly past. */
export const FLOW_LEAVE_LINE = 0.14;
/** Depth per viewport of distance while a section approaches. */
export const FLOW_APPROACH_DEPTH = 2400;
/** Depth per viewport of distance while a section flies past. */
export const FLOW_PASS_DEPTH = 1500;
/** Viewports of approach over which a section fades in from nothing. */
export const FLOW_APPROACH_FADE = 0.55;
/** Viewports of departure over which a section fades out. */
export const FLOW_PASS_FADE = 0.25;

/**
 * Depth of one section in the Flow version from where its layout box sits in
 * the viewport (`top` and `bottom` relative to the viewport top).
 */
export function flowPose(
  top: number,
  bottom: number,
  viewport: number
): FlowPose {
  const enter = viewport * FLOW_ENTER_LINE;
  const leave = viewport * FLOW_LEAVE_LINE;
  if (top > enter) {
    const distance = (top - enter) / viewport;
    return {
      z: -distance * FLOW_APPROACH_DEPTH,
      opacity: clamp(1 - distance / FLOW_APPROACH_FADE, 0, 1),
    };
  }
  if (bottom < leave) {
    const distance = (leave - bottom) / viewport;
    return {
      z: Math.min(distance * FLOW_PASS_DEPTH, FLIGHT_PERSPECTIVE * 0.6),
      opacity: clamp(1 - distance / FLOW_PASS_FADE, 0, 1),
    };
  }
  return { z: 0, opacity: 1 };
}
