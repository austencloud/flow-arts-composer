/**
 * controlPresence: how the controls around a piece of work step aside and come
 * back when a mode changes.
 *
 * Every control in a family reads as part of one movement, so a mode change
 * never pops some buttons while others fade on their own clock. Leaving is
 * quick and starts at the press, each control dropping toward the edge it
 * lives on. Arriving waits until the panel carrying the control has nearly
 * landed, so nothing fades in while it is being dragged across the screen,
 * then runs as a short wave outward from the primary control.
 *
 * Both directions walk one path, a function of Svelte's `t`, and differ only in
 * how long they take. Svelte starts a reversal from wherever the interrupted
 * transition had reached, so pressing Stop halfway through Play turns the same
 * controls around without a jump.
 *
 * Only `opacity` and `transform` move, which the compositor can run while a
 * new workspace's first mount keeps the main thread busy.
 */
import { backOut, cubicOut } from "svelte/easing";
import type { TransitionConfig } from "svelte/transition";
import { DURATION, SLIDE, STAGGER } from "./transitions";
import { motionDuration, reducedMotion } from "./motion";

/** The edge of the workspace a control lives on, and leaves toward. */
export type ControlEdge = "top" | "right" | "bottom" | "left";

/** The outermost ring a family uses; a wider one would read as slow. */
const FAR_RING = 2;
/** How far a control travels from its home edge. */
const TRAVEL_PX = SLIDE.md;
/** A control at rest is full size; it starts this much smaller. */
const START_SCALE = 0.94;

/** First control starting to last control settling. */
export const CONTROL_ARRIVE_MS = DURATION.emphasis + STAGGER.micro * FAR_RING;
export const CONTROL_LEAVE_MS = DURATION.fast;

/**
 * How long an arrival waits for a panel slide to land. The slide's last stretch
 * barely moves, so the wave can start before it ends and finish with it.
 */
export const CONTROL_LANDING_MS = DURATION.normal;

export interface ControlPose {
  opacity: number;
  x: number;
  y: number;
  scale: number;
}

/**
 * Where a control is at `t` (0 away, 1 at rest). A ring's share of the timeline
 * is held back, so ring 0 moves first on the way in and last on the way out.
 */
export function controlPose(
  t: number,
  ring: number,
  edge: ControlEdge
): ControlPose {
  const clampedRing = Math.min(FAR_RING, Math.max(0, ring));
  const start = (clampedRing * STAGGER.micro) / CONTROL_ARRIVE_MS;
  const p = Math.min(1, Math.max(0, (t - start) / (1 - start)));
  const settle = backOut(p);
  const away = TRAVEL_PX * (1 - settle);
  return {
    opacity: cubicOut(p),
    x: edge === "left" ? -away : edge === "right" ? away : 0,
    y: edge === "top" ? -away : edge === "bottom" ? away : 0,
    scale: START_SCALE + (1 - START_SCALE) * settle,
  };
}

export interface ControlPresenceParams {
  /** Where the control lives. Bottom unless it says otherwise. */
  edge?: ControlEdge;
  /** 0 is the primary control; each ring out moves one beat later. */
  ring?: number;
  /** Time to wait for a moving panel. Read when the arrival starts. */
  lead?: () => number;
  /** False skips the motion, for a surface painting for the first time. */
  animate?: () => boolean;
}

function presence(
  ring: number,
  edge: ControlEdge,
  duration: number
): Pick<TransitionConfig, "duration" | "css"> {
  return {
    duration,
    css: (t) => {
      const { opacity, x, y, scale } = controlPose(t, ring, edge);
      return `opacity: ${opacity}; transform: translate(${x}px, ${y}px) scale(${scale});`;
    },
  };
}

/** `in:` half: waits for the panel to land, then joins the wave. */
export function controlArrive(
  node: Element,
  { edge = "bottom", ring = 0, lead, animate }: ControlPresenceParams = {}
): TransitionConfig {
  if (reducedMotion() || animate?.() === false) return { duration: 0 };
  // A control already on its way out turns straight around; only one that is
  // really absent has a landing to wait for.
  const turningBack = node.getAnimations().length > 0;
  return {
    ...presence(ring, edge, motionDuration(CONTROL_ARRIVE_MS)),
    delay: turningBack ? 0 : (lead?.() ?? 0),
  };
}

/** `out:` half: quick, from the press, toward the control's own edge. */
export function controlLeave(
  _node: Element,
  { edge = "bottom", ring = 0, animate }: ControlPresenceParams = {}
): TransitionConfig {
  if (reducedMotion() || animate?.() === false) return { duration: 0 };
  return presence(ring, edge, motionDuration(CONTROL_LEAVE_MS));
}
