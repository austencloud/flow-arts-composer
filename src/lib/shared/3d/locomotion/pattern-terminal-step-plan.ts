import type { TerminalStepPlan } from "@austencloud/scene-3d";

export interface PatternTerminalIntent {
  id: string;
  remainingDistance: number;
  targetFacing: number;
}

export interface PatternTerminalStepInput {
  intent: PatternTerminalIntent;
  gaitStep: number;
  cadence: number;
  speed: number;
}

const TERMINAL_STEPS = 2;
// The same measured braking profile destination walks use: the captured stop
// covers about 63% of its distance before the terminal placement.
const PENULTIMATE_RATIO = 0.95;
const TERMINAL_RATIO = 0.55;
const BRAKING_STRIDES = PENULTIMATE_RATIO + TERMINAL_RATIO;
// A stop starts on a gait boundary, and the boundary nearest the ideal braking
// distance can sit up to half a stride either side of it.
const ARM_STRIDES = BRAKING_STRIDES + 0.5;
const MAX_TERMINAL_STEP_LENGTH = 0.8;
const MIN_BOUNDARY_CADENCE = 1.2;
const MAX_WALK_CADENCE = 120 / 60;
const MAX_BRAKING_CADENCE = 3;

/**
 * Arm the existing two-step stop on a real gait boundary.
 *
 * A time-scripted path knows how much stage remains, while the animator knows
 * which foot is next. Combining those facts here lets the captured braking
 * motion own the arrival without teaching the path script how to animate.
 * Once the stop begins, the path hands its root to
 * `samplePatternTerminalTravel` so the body brakes with the capture.
 */
export function createPatternTerminalStepPlan(
  input: PatternTerminalStepInput
): TerminalStepPlan | null {
  const { intent, gaitStep, cadence, speed } = input;
  if (!intent.id) throw new RangeError("terminal intent id is required");
  if (
    !Number.isFinite(intent.remainingDistance) ||
    intent.remainingDistance < 0
  ) {
    throw new RangeError(
      "remaining distance must be a non-negative finite number"
    );
  }
  if (!Number.isFinite(intent.targetFacing)) {
    throw new RangeError("target facing must be finite");
  }
  if (!Number.isFinite(gaitStep))
    throw new RangeError("gait step must be finite");
  if (!Number.isFinite(cadence) || cadence <= 0) return null;
  if (!Number.isFinite(speed) || speed <= 0) return null;

  // The locomotion blend starts with a near-zero measured cadence. Treating
  // that transient as a real walking rate would make a two-step stop span most
  // of the runway and arm as soon as the character departs.
  const walkCadence = Math.min(
    MAX_WALK_CADENCE,
    Math.max(MIN_BOUNDARY_CADENCE, cadence)
  );
  const startAtGaitStep = Math.ceil(gaitStep - 1e-6);
  const waitSteps = Math.max(0, startAtGaitStep - gaitStep);
  const waitDistance = (speed * waitSteps) / walkCadence;
  const stride = Math.min(MAX_TERMINAL_STEP_LENGTH, speed / walkCadence);
  const armDistance = waitDistance + stride * ARM_STRIDES;
  if (intent.remainingDistance > armDistance) return null;

  const remainingDistance = Math.max(
    1e-4,
    intent.remainingDistance - waitDistance
  );
  const penultimate = remainingDistance * (PENULTIMATE_RATIO / BRAKING_STRIDES);
  const terminal = remainingDistance - penultimate;
  const landAtGaitStep = startAtGaitStep + TERMINAL_STEPS;
  // The root follows the captured stop, so it enters the brake at a pace set
  // by the braking distance times the cadence. Scaling the cadence against
  // the boundary's distance keeps that pace the one a one-and-a-half-stride
  // stop has at walking cadence, which is what a destination walk brakes at.
  const brakingCadence = Math.min(
    MAX_BRAKING_CADENCE,
    (walkCadence * stride * BRAKING_STRIDES) / remainingDistance
  );

  return {
    id: intent.id,
    startAtGaitStep,
    landAtGaitStep,
    terminalFoot: Math.round(landAtGaitStep) % 2 === 0 ? "left" : "right",
    stepDistances: [penultimate, terminal],
    remainingDistance,
    cadence: brakingCadence,
    targetFacing: intent.targetFacing,
  };
}

/**
 * How much of the braking distance the root has covered, 0 to 1, for the
 * animator's distance step.
 *
 * Inside a stop the animator maps the captured clip's own root curve into its
 * distance step, and spreads each braking step over that step's planned
 * distance. A root that follows it decelerates with the capture. A root held
 * at walking speed until the mark does not: the capture has all but stopped
 * before its terminal foot lands, so the planted feet were dragged forward
 * and the foot plant let go and slid 23 cm to catch up once the stop landed.
 */
export function samplePatternTerminalTravel(
  plan: TerminalStepPlan,
  distanceStep: number
): number {
  if (!Number.isFinite(distanceStep)) {
    throw new RangeError("distance step must be finite");
  }
  const [penultimate, terminal] = plan.stepDistances;
  const progress = Math.min(
    TERMINAL_STEPS,
    Math.max(0, distanceStep - plan.startAtGaitStep)
  );
  const covered =
    penultimate! * Math.min(1, progress) +
    terminal! * Math.max(0, progress - 1);
  return Math.min(1, covered / (penultimate! + terminal!));
}
