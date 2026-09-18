// src/generation/prop-relationship.ts
/**
 * Prop relationship: how the two props relate in spin and in phase.
 *
 * Direction is whether the props spin the same way or opposite ways. Timing
 * is where they sit in their circles relative to each other: Together, Split
 * or Quarter. The phase is the one number equal turns keep constant. With the
 * same spin both bearings advance together, so their difference is fixed.
 * With opposite spin they advance against each other, so their sum is fixed;
 * measured against South (both props pointing down at once, the downbeat)
 * that sum reads Together at zero.
 *
 * Bearings come from the grid location angle and the radial orientation, the
 * same numbers the app's angle-calculator and orientation-angle modules use;
 * the app is to delegate its classifier here so every surface reads one
 * answer.
 */

const PI = Math.PI;
const TAU = 2 * Math.PI;

export type PropDirection = "same" | "opp";
export type PropTiming = "tog" | "split" | "quarter";

/** Angle of each grid location, radians, e at 0 and s at +pi/2 (screen space). */
export const LOCATION_BEARINGS: Readonly<Record<string, number>> = {
  e: 0,
  s: PI / 2,
  w: PI,
  n: -PI / 2,
  ne: -PI / 4,
  se: PI / 4,
  sw: (3 * PI) / 4,
  nw: (5 * PI) / 4,
};

/** Radial orientations in the order that turns the prop by 45 degrees. */
export const RADIAL_ORIENTATION_CYCLE = [
  "in",
  "clockIn",
  "clock",
  "clockOut",
  "out",
  "counterOut",
  "counter",
  "counterIn",
] as const;

/** The phase each timing sits at. Quarter is a quarter turn either way. */
export const PROP_TIMING_PHASE: Readonly<Record<PropTiming, number>> = {
  tog: 0,
  quarter: PI / 2,
  split: PI,
};

export interface PropRelationshipMotion {
  readonly motionType: string;
  readonly rotationDirection: string;
  readonly startLocation: string;
  readonly endLocation: string;
  readonly startOrientation: string;
  readonly endOrientation: string;
  readonly turns?: number | "fl";
}

export type PropRelationshipReading =
  | { kind: "float" }
  | { kind: "direction-only"; direction: PropDirection }
  | { kind: "full"; direction: PropDirection; timing: PropTiming };

export interface PropRelationshipReport {
  /** Beats whose reading matches the request. */
  holding: number;
  /** Beats that read as a different direction or timing. */
  offending: number;
  /** Beats with no prop relation (a float, or an unturned dash or static). */
  exempt: number;
  /** Sequence index (start placement is 0) of the first offending beat. */
  firstOffendingIndex: number | null;
}

function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

export function normalizeAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

/**
 * Where the prop's head points for a radial orientation at a location.
 * Undefined for a centric orientation or the center.
 */
export function propBearing(
  orientation: string,
  location: string
): number | undefined {
  const center = LOCATION_BEARINGS[lower(location)];
  if (center === undefined) return undefined;
  const k = (RADIAL_ORIENTATION_CYCLE as readonly string[]).indexOf(
    orientation
  );
  if (k === -1) return undefined;
  return normalizeAngle(center + PI - k * (PI / 4));
}

/** The phase between two bearings under a spin relation, in [0, 2pi). */
export function propPhase(
  leftBearing: number,
  rightBearing: number,
  direction: PropDirection
): number {
  return normalizeAngle(
    direction === "same"
      ? leftBearing - rightBearing
      : leftBearing + rightBearing - PI
  );
}

/** Radian slack at a timing band edge, absorbing floating-point error. */
const BAND_EDGE_EPSILON = 1e-9;

/** Together within pi/4 of zero, Split within pi/4 of pi, Quarter between. */
export function timingFromPhase(phase: number): PropTiming {
  const wrapped = normalizeAngle(phase);
  const folded = Math.min(wrapped, TAU - wrapped);
  if (folded < PI / 4 - BAND_EDGE_EPSILON) return "tog";
  if (folded > (3 * PI) / 4 + BAND_EDGE_EPSILON) return "split";
  return "quarter";
}

function spinOf(motion: PropRelationshipMotion): "cw" | "ccw" | undefined {
  if (motion.turns === "fl" || lower(motion.motionType) === "float") {
    return undefined;
  }
  const direction = lower(motion.rotationDirection);
  return direction === "cw" || direction === "ccw" ? direction : undefined;
}

/**
 * Read one beat. Float when either prop is not spinning (nothing to relate);
 * direction-only when a bearing is off the table or the beat starts in one
 * timing class and ends in another; full otherwise.
 */
export function classifyPropRelationship(
  left: PropRelationshipMotion,
  right: PropRelationshipMotion
): PropRelationshipReading {
  const leftSpin = spinOf(left);
  const rightSpin = spinOf(right);
  if (!leftSpin || !rightSpin) return { kind: "float" };
  const direction: PropDirection = leftSpin === rightSpin ? "same" : "opp";

  const startLeft = propBearing(left.startOrientation, left.startLocation);
  const startRight = propBearing(right.startOrientation, right.startLocation);
  const endLeft = propBearing(left.endOrientation, left.endLocation);
  const endRight = propBearing(right.endOrientation, right.endLocation);
  if (
    startLeft === undefined ||
    startRight === undefined ||
    endLeft === undefined ||
    endRight === undefined
  ) {
    return { kind: "direction-only", direction };
  }

  const startTiming = timingFromPhase(
    propPhase(startLeft, startRight, direction)
  );
  const endTiming = timingFromPhase(propPhase(endLeft, endRight, direction));
  if (startTiming !== endTiming) return { kind: "direction-only", direction };
  return { kind: "full", direction, timing: startTiming };
}

/** Tolerance, in units of pi/4 steps, for landing on an integer radial step. */
const INTEGER_STEP_EPSILON = 1e-6;

/**
 * The orientation that puts a prop at `leftLocation` in the requested phase
 * with a partner at `right`, or undefined when no radial orientation lands
 * there. Symmetric enough to derive either hand from the other: Together and
 * Split are their own mirror, and Quarter is a quarter either way.
 */
export function derivePartnerOrientation(
  right: { orientation: string; location: string },
  leftLocation: string,
  direction: PropDirection,
  timing: PropTiming
): string | undefined {
  const rightBearing = propBearing(right.orientation, right.location);
  const leftCenter = LOCATION_BEARINGS[lower(leftLocation)];
  if (rightBearing === undefined || leftCenter === undefined) return undefined;
  const phase = PROP_TIMING_PHASE[timing];
  const leftBearing =
    direction === "same" ? rightBearing + phase : PI - rightBearing + phase;
  // bearing = center + pi - k * pi/4, solved for k.
  const raw = normalizeAngle(leftCenter + PI - leftBearing) / (PI / 4);
  const k = Math.round(raw);
  if (Math.abs(raw - k) > INTEGER_STEP_EPSILON) return undefined;
  return RADIAL_ORIENTATION_CYCLE[k % 8];
}

/**
 * Score a whole sequence (index 0 is the start placement and is skipped)
 * against a requested relation. Without a timing only the direction counts.
 */
export function reportPropRelationship(
  steps: ReadonlyArray<{
    motions: { left: PropRelationshipMotion; right: PropRelationshipMotion };
  }>,
  request: { direction: PropDirection; timing?: PropTiming }
): PropRelationshipReport {
  let holding = 0;
  let offending = 0;
  let exempt = 0;
  let firstOffendingIndex: number | null = null;
  for (let i = 1; i < steps.length; i++) {
    const step = steps[i]!;
    const reading = classifyPropRelationship(
      step.motions.left,
      step.motions.right
    );
    if (reading.kind === "float") {
      exempt++;
      continue;
    }
    const holds =
      reading.direction === request.direction &&
      (request.timing === undefined ||
        (reading.kind === "full" && reading.timing === request.timing));
    if (holds) {
      holding++;
    } else {
      offending++;
      firstOffendingIndex ??= i;
    }
  }
  return { holding, offending, exempt, firstOffendingIndex };
}
