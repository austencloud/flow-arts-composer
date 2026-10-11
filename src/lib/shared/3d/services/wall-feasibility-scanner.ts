/**
 * Offline wall-plane feasibility scan. Builds swept volumes for both hands
 * of each step (through calculatePropState — the renderer's own math, so
 * concaveDepth cheats are honored automatically) and evaluates them against
 * a fixed square-to-audience stance with the Collision Lab's StanceSimulator.
 *
 * Offline-only by design (scripts + solver). Not called during playback.
 */
import {
  StanceSimulator,
  restPoseFromHeight,
} from "#lib/features/lab/tabs/collision-lab/services/stance-simulator.js";
import type { SimCollision } from "#lib/features/lab/tabs/collision-lab/services/types.js";
import type { StancePose } from "#lib/features/lab/tabs/collision-lab/domain/types.js";
import { buildSweptVolume } from "./swept-volume/swept-volume-builder";
import type { MotionConfig3D } from "../domain/models/motion-data-3d";

/** Bump when thresholds, stance, or the petal model change shape. */
export const SCAN_VERSION = 1;

const DEFAULT_HEIGHT_M = 1.7;

// Square to the audience: no foot offset, no yaw, upright spine, no twist.
const SQUARE_STANCE: StancePose = {
  footOffsetX: 0,
  footOffsetZ: 0,
  rootYawRad: 0,
  spinePitchRad: 0,
  torsoTwistRad: 0,
};

export interface StepMotionPair {
  left: MotionConfig3D;
  right: MotionConfig3D;
}

export interface StepScanResult {
  clean: boolean;
  collisions: SimCollision[];
  worstDepth: number;
}

export interface SequenceScanResult {
  wallFeasible: boolean;
  flaggedSteps: number[];
  stepResults: StepScanResult[];
}

export function scanStepPair(
  left: MotionConfig3D,
  right: MotionConfig3D,
  heightM = DEFAULT_HEIGHT_M
): StepScanResult {
  const sim = new StanceSimulator(restPoseFromHeight(heightM));
  const leftSweep = buildSweptVolume(left).samples;
  const rightSweep = buildSweptVolume(right).samples;
  const result = sim.evaluateSweep(SQUARE_STANCE, leftSweep, rightSweep);
  return {
    clean: result.collisions.length === 0,
    collisions: result.collisions,
    worstDepth: result.totalCollisionDepth,
  };
}

export function scanSequenceSteps(
  steps: StepMotionPair[],
  heightM = DEFAULT_HEIGHT_M
): SequenceScanResult {
  const stepResults = steps.map((s) => scanStepPair(s.left, s.right, heightM));
  const flaggedSteps = stepResults
    .map((r, i) => (r.clean ? -1 : i))
    .filter((i) => i >= 0);
  return { wallFeasible: flaggedSteps.length === 0, flaggedSteps, stepResults };
}
