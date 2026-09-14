/**
 * Offline upper-body proxy for comparing when an authored root turn starts.
 * It reads authored prop states but never writes to the score source or rig.
 */
import type { PropState3D } from "@austencloud/scene-3d";
import { computeStanceLoss } from "./stance-optimizer";
import { StanceSimulator, restPoseFromHeight } from "./stance-simulator";
import type { SimPropTarget } from "./types";
import type { StancePose } from "../domain/types";
import { propStateToStaffTarget } from "$lib/shared/3d/services/swept-volume/swept-volume-builder";
const ZERO_STANCE: StancePose = {
  footOffsetX: 0,
  footOffsetZ: 0,
  rootYawRad: 0,
  spinePitchRad: 0,
  torsoTwistRad: 0,
};

export interface StaffTurnScoreSource {
  readonly motionStepCount: number;
  propStatesAtScoreTime(scoreTime: number): {
    left: PropState3D | null;
    right: PropState3D | null;
  };
}

export interface AuthoredRootYawCurve {
  readonly startStep: number;
  readonly turnDurationSteps: number;
  readonly holdDurationSteps: number;
  readonly returnDurationSteps: number;
  readonly yawRad: number;
}

export interface TurnPreparationScenario {
  readonly label: string;
  readonly curve: AuthoredRootYawCurve | null;
}

export interface TurnPreparationMetrics {
  readonly sampleCount: number;
  readonly maxReachShortfallM: number;
  readonly collisionFrameCount: number;
  readonly collisionCount: number;
  /** Sum of sampled depths scaled by score-time spacing; resolution independent. */
  readonly collisionDepthIntegralMSteps: number;
  /** Collision-depth integral averaged over the whole score cycle. */
  readonly meanCollisionDepthM: number;
  /** Raw sampled sum, retained only to make a diagnostic trace auditable. */
  readonly totalCollisionDepthM: number;
  readonly maxCollisionDepthM: number;
  readonly strictClear: boolean;
  readonly summedStanceLoss: number;
  readonly maxAngularSpeedRadPerStep: number;
  readonly seamYawDifferenceRad: number;
  readonly seamAngularSpeedDifferenceRadPerStep: number;
}

export interface TurnPreparationResult {
  readonly label: string;
  readonly metrics: TurnPreparationMetrics;
}

export interface StaffTurnPreparationStudy {
  readonly stepCount: number;
  readonly phaseStep: number;
  readonly results: readonly TurnPreparationResult[];
}

/**
 * Convert an authored renderer prop state to the same rigid staff segment the
 * collision-lab sweep uses. `worldPosition` and `worldRotation` already come
 * from the production interpolation owner; only the shared avatar-frame Z
 * translation remains here.
 */
/** A C1 raised-cosine pulse: starts and ends at neutral, including loop seam. */
export function sampleAuthoredRootYaw(
  curve: AuthoredRootYawCurve | null,
  scoreTime: number,
  stepCount: number
): number {
  if (!curve) return 0;
  validateCurve(curve, stepCount);
  if (!Number.isFinite(scoreTime))
    throw new Error("Staff-turn score time must be finite.");
  const duration =
    curve.turnDurationSteps +
    curve.holdDurationSteps +
    curve.returnDurationSteps;
  const local =
    (((scoreTime - curve.startStep) % stepCount) + stepCount) % stepCount;
  if (local >= duration) return 0;
  if (local < curve.turnDurationSteps) {
    return curve.yawRad * raisedCosine(local / curve.turnDurationSteps);
  }
  if (local < curve.turnDurationSteps + curve.holdDurationSteps)
    return curve.yawRad;
  const returnProgress =
    (local - curve.turnDurationSteps - curve.holdDurationSteps) /
    curve.returnDurationSteps;
  return curve.yawRad * (1 - raisedCosine(returnProgress));
}

export function evaluateStaffTurnPreparation(
  source: StaffTurnScoreSource,
  scenarios: readonly TurnPreparationScenario[],
  phaseStep = 0.025
): StaffTurnPreparationStudy {
  if (
    !Number.isFinite(source.motionStepCount) ||
    source.motionStepCount <= 0 ||
    !Number.isInteger(source.motionStepCount)
  ) {
    throw new Error(
      "Staff-turn study requires a positive finite integer motionStepCount."
    );
  }
  if (!Number.isFinite(phaseStep) || phaseStep <= 0) {
    throw new Error("Staff-turn study requires a positive finite phaseStep.");
  }
  const stepCount = source.motionStepCount;
  const sampleCount = Math.max(1, Math.ceil(stepCount / phaseStep));
  const simulator = new StanceSimulator(restPoseFromHeight(1.7));
  const targets = Array.from({ length: sampleCount }, (_, index) => {
    const props = source.propStatesAtScoreTime(index * phaseStep);
    if (!props.left || !props.right) {
      throw new Error(
        `Staff-turn study requires both props at sample ${index}.`
      );
    }
    assertFinitePropState(props.left, index, "left");
    assertFinitePropState(props.right, index, "right");
    return {
      left: propStateToStaffTarget(props.left),
      right: propStateToStaffTarget(props.right),
    };
  });
  return {
    stepCount,
    phaseStep,
    results: scenarios.map((scenario) =>
      evaluateScenario(simulator, scenario, targets, stepCount, phaseStep)
    ),
  };
}

function evaluateScenario(
  simulator: StanceSimulator,
  scenario: TurnPreparationScenario,
  targets: readonly { left: SimPropTarget; right: SimPropTarget }[],
  stepCount: number,
  phaseStep: number
): TurnPreparationResult {
  let maxReachShortfallM = 0;
  let collisionFrameCount = 0;
  let collisionCount = 0;
  let totalCollisionDepthM = 0;
  let collisionDepthIntegralMSteps = 0;
  let maxCollisionDepthM = 0;
  let summedStanceLoss = 0;
  const yaws: number[] = [];

  for (let index = 0; index < targets.length; index += 1) {
    const scoreTime = index * phaseStep;
    const yaw = sampleAuthoredRootYaw(scenario.curve, scoreTime, stepCount);
    yaws.push(yaw);
    const props = targets[index]!;
    const result = simulator.evaluate(
      { ...ZERO_STANCE, rootYawRad: yaw },
      props.left,
      props.right
    );
    maxReachShortfallM = Math.max(
      maxReachShortfallM,
      result.reachShortfall.left,
      result.reachShortfall.right
    );
    if (result.collisions.length > 0) collisionFrameCount += 1;
    collisionCount += result.collisions.length;
    totalCollisionDepthM += result.totalCollisionDepth;
    collisionDepthIntegralMSteps +=
      result.totalCollisionDepth * Math.min(phaseStep, stepCount - scoreTime);
    maxCollisionDepthM = Math.max(
      maxCollisionDepthM,
      ...result.collisions.map((collision) => collision.depth)
    );
    summedStanceLoss += computeStanceLoss(result);
  }

  const angular = angularMetrics(scenario.curve, stepCount, yaws, phaseStep);
  return {
    label: scenario.label,
    metrics: {
      sampleCount: targets.length,
      maxReachShortfallM,
      collisionFrameCount,
      collisionCount,
      collisionDepthIntegralMSteps,
      meanCollisionDepthM: collisionDepthIntegralMSteps / stepCount,
      totalCollisionDepthM,
      maxCollisionDepthM,
      strictClear: maxReachShortfallM <= 1e-6 && collisionCount === 0,
      summedStanceLoss,
      ...angular,
    },
  };
}

function angularMetrics(
  curve: AuthoredRootYawCurve | null,
  stepCount: number,
  yaws: readonly number[],
  phaseStep: number
) {
  let maxAngularSpeedRadPerStep = 0;
  for (let index = 1; index < yaws.length; index += 1) {
    maxAngularSpeedRadPerStep = Math.max(
      maxAngularSpeedRadPerStep,
      Math.abs((yaws[index]! - yaws[index - 1]!) / phaseStep)
    );
  }
  const wrapInterval = stepCount - (yaws.length - 1) * phaseStep;
  if (wrapInterval > 0 && yaws.length > 1) {
    maxAngularSpeedRadPerStep = Math.max(
      maxAngularSpeedRadPerStep,
      Math.abs((yaws[0]! - yaws.at(-1)!) / wrapInterval)
    );
  }
  const seamEpsilon = Math.min(1e-4, phaseStep / 10, stepCount / 10);
  const seamYawDifferenceRad = Math.abs(
    sampleAuthoredRootYaw(curve, 0, stepCount) -
      sampleAuthoredRootYaw(curve, stepCount, stepCount)
  );
  const leftVelocity =
    (sampleAuthoredRootYaw(curve, stepCount, stepCount) -
      sampleAuthoredRootYaw(curve, stepCount - seamEpsilon, stepCount)) /
    seamEpsilon;
  const rightVelocity =
    (sampleAuthoredRootYaw(curve, seamEpsilon, stepCount) -
      sampleAuthoredRootYaw(curve, 0, stepCount)) /
    seamEpsilon;
  return {
    maxAngularSpeedRadPerStep,
    seamYawDifferenceRad,
    seamAngularSpeedDifferenceRadPerStep: Math.abs(
      leftVelocity - rightVelocity
    ),
  };
}

function validateCurve(curve: AuthoredRootYawCurve, stepCount: number): void {
  const values = [
    curve.startStep,
    curve.turnDurationSteps,
    curve.holdDurationSteps,
    curve.returnDurationSteps,
    curve.yawRad,
  ];
  if (
    !values.every(Number.isFinite) ||
    curve.startStep < 0 ||
    curve.startStep >= stepCount ||
    curve.turnDurationSteps <= 0 ||
    curve.holdDurationSteps < 0 ||
    curve.returnDurationSteps <= 0 ||
    curve.turnDurationSteps +
      curve.holdDurationSteps +
      curve.returnDurationSteps >
      stepCount
  ) {
    throw new Error(
      "Staff-turn curve must be finite, fit one cycle, and have positive turn/return durations."
    );
  }
}

function assertFinitePropState(
  state: PropState3D,
  index: number,
  hand: string
): void {
  const values = [
    state.worldPosition.x,
    state.worldPosition.y,
    state.worldPosition.z,
    state.worldRotation.x,
    state.worldRotation.y,
    state.worldRotation.z,
    state.worldRotation.w,
  ];
  if (!values.every(Number.isFinite)) {
    throw new Error(
      `Staff-turn study received nonfinite ${hand} prop state at sample ${index}.`
    );
  }
}

function raisedCosine(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return (1 - Math.cos(Math.PI * t)) / 2;
}
