/**
 * Prop timing-and-direction element for the MCP renderer.
 *
 * Mirrors `src/lib/shared/shape-matrix/domain/prop-relationship.ts`: the
 * PROPS (not the hands) are classified from each motion's spin direction and
 * the phase between the two prop bearings at the start of the step. Float or
 * no rotation on either hand, or unequal turn rates, yield no element.
 */

export type PropElementalType =
  | "water"
  | "fire"
  | "earth"
  | "air"
  | "sun"
  | "moon";

export interface PropTnDMotion {
  rotationDirection: string;
  startLocation: string;
  startOrientation?: string;
  turns?: number | "fl";
}

const PI = Math.PI;
const HALF_PI = PI / 2;
const QUARTER = PI / 4;
const TAU = PI * 2;

/** Math-space bearing of each grid location (east = 0, clockwise positive). */
const LOCATION_ANGLES: Record<string, number> = {
  e: 0,
  s: HALF_PI,
  w: PI,
  n: -HALF_PI,
  ne: -HALF_PI / 2,
  se: HALF_PI / 2,
  sw: PI - HALF_PI / 2,
  nw: PI + HALF_PI / 2,
};

/** Radial orientations in quarter steps, same order as the app's RADIAL_CYCLE. */
const RADIAL_CYCLE = [
  "in",
  "clockin",
  "clock",
  "clockout",
  "out",
  "counterout",
  "counter",
  "counterin",
];

const ELEMENT_BY_FAMILY: Record<string, PropElementalType> = {
  "tog-same": "earth",
  "tog-opp": "air",
  "split-same": "water",
  "split-opp": "fire",
  "quarter-same": "sun",
  "quarter-opp": "moon",
};

function normalize(angle: number): number {
  const n = angle % TAU;
  return n < 0 ? n + TAU : n;
}

function spin(direction: string | undefined): "cw" | "ccw" | null {
  const d = direction?.toLowerCase();
  return d === "cw" || d === "ccw" ? d : null;
}

function staffAngle(motion: PropTnDMotion): number {
  const center = LOCATION_ANGLES[motion.startLocation.toLowerCase()];
  if (center === undefined) return Number.NaN;
  const k = RADIAL_CYCLE.indexOf((motion.startOrientation ?? "in").toLowerCase());
  return k === -1
    ? normalize(center - HALF_PI)
    : normalize(center + PI - k * QUARTER);
}

function timingFromPhase(delta: number): "tog" | "split" | "quarter" {
  if (delta < HALF_PI / 2) return "tog";
  if (delta > PI - HALF_PI / 2) return "split";
  return "quarter";
}

export function derivePropElementalType(
  left: PropTnDMotion,
  right: PropTnDMotion
): PropElementalType | null {
  if (left.turns === "fl" || right.turns === "fl") return null;
  const leftSpin = spin(left.rotationDirection);
  const rightSpin = spin(right.rotationDirection);
  if (!leftSpin || !rightSpin) return null;
  if ((left.turns ?? 0) !== (right.turns ?? 0)) return null;

  const leftAngle = staffAngle(left);
  const rightAngle = staffAngle(right);
  if (Number.isNaN(leftAngle) || Number.isNaN(rightAngle)) return null;

  const raw = normalize(leftAngle - rightAngle);
  const delta = Math.min(raw, TAU - raw);
  const direction = leftSpin === rightSpin ? "same" : "opp";
  return ELEMENT_BY_FAMILY[`${timingFromPhase(delta)}-${direction}`] ?? null;
}
