import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import {
  StanceSimulator,
  restPoseFromHeight,
} from "#lib/features/lab/tabs/collision-lab/services/stance-simulator.js";
import { StanceOptimizer } from "#lib/features/lab/tabs/collision-lab/services/stance-optimizer.js";
import type { SimPropTarget } from "#lib/features/lab/tabs/collision-lab/services/contracts/IStanceSimulator";
import type {
  OptimizerBounds,
  OptimizerInput,
} from "#lib/features/lab/tabs/collision-lab/services/contracts/IStanceOptimizer";
import type { StancePose } from "#lib/features/lab/tabs/collision-lab/domain/types.js";

const NEUTRAL_STANCE: StancePose = {
  footOffsetX: 0,
  footOffsetZ: 0,
  rootYawRad: 0,
  spinePitchRad: 0,
};

const DEFAULT_BOUNDS: OptimizerBounds = {
  footOffsetX: { min: -1.0, max: 1.0 },
  footOffsetZ: { min: -1.0, max: 1.0 },
  rootYawRad: { min: -Math.PI, max: Math.PI },
  spinePitchRad: { min: -Math.PI / 18, max: (40 * Math.PI) / 180 },
  torsoTwistRad: { min: -Math.PI / 3, max: Math.PI / 3 },
};

function makeStaffTarget(grip: Vector3, axis: Vector3): SimPropTarget {
  const half = axis.clone().normalize().multiplyScalar(0.43);
  return {
    gripWorld: grip.clone(),
    tipAWorld: grip.clone().add(half),
    tipBWorld: grip.clone().sub(half),
    radius: 0.012,
  };
}

function optimizerForHeight(h: number): StanceOptimizer {
  const sim = new StanceSimulator(restPoseFromHeight(h));
  return new StanceOptimizer(sim);
}

describe("StanceOptimizer easy cases", () => {
  it("returns the initial stance when it is already clear and reachable", () => {
    const optimizer = optimizerForHeight(1.7);
    const rest = optimizer.simulator.restPose;

    // Both hands at natural reach in front of the shoulders — no stance
    // change should be necessary.
    const left = makeStaffTarget(
      new Vector3(rest.leftShoulder.x + 0.1, rest.leftShoulder.y, 0.3),
      new Vector3(0, 1, 0)
    );
    const right = makeStaffTarget(
      new Vector3(rest.rightShoulder.x - 0.1, rest.rightShoulder.y, 0.3),
      new Vector3(0, 1, 0)
    );

    const result = optimizer.optimize(
      { left, right },
      NEUTRAL_STANCE,
      DEFAULT_BOUNDS
    );
    expect(result.feasible).toBe(true);
    // Loss should be near zero for an obviously easy pose — collision terms
    // should be absent and reach should be well within envelope.
    expect(result.loss).toBeLessThan(1);
    // Foot shift shouldn't be absurd for a natural reach.
    expect(Math.abs(result.stance.footOffsetX)).toBeLessThan(0.4);
    expect(Math.abs(result.stance.footOffsetZ)).toBeLessThan(0.4);
  });
});

describe("StanceOptimizer shifts the body for offset reach targets", () => {
  it("steps left to reach a target that's just outside natural reach on the left", () => {
    const optimizer = optimizerForHeight(1.7);
    const rest = optimizer.simulator.restPose;
    const maxReach = rest.upperArmLength + rest.forearmLength;

    // Place the blue target 10 cm past max reach on the character's left.
    // The optimizer should shift the feet left to close the gap.
    const left = makeStaffTarget(
      new Vector3(rest.leftShoulder.x + maxReach + 0.1, rest.leftShoulder.y, 0),
      new Vector3(0, 1, 0)
    );
    const right = makeStaffTarget(
      new Vector3(rest.rightShoulder.x - 0.1, rest.rightShoulder.y, 0.2),
      new Vector3(0, 1, 0)
    );

    const result = optimizer.optimize(
      { left, right },
      NEUTRAL_STANCE,
      DEFAULT_BOUNDS
    );
    // Either the optimizer shifted the feet toward +X, or the initial
    // stance was already feasible (it shouldn't be, since the target is
    // past max reach).
    expect(result.stance.footOffsetX).toBeGreaterThan(0.05);
  });
});

describe("StanceOptimizer infeasibility", () => {
  it("reports infeasible for a target 5 m away in any direction", () => {
    const optimizer = optimizerForHeight(1.7);

    const left = makeStaffTarget(
      new Vector3(5, 1.2, 0),
      new Vector3(0, 1, 0)
    );
    const right = makeStaffTarget(
      new Vector3(-0.2, 1.2, 0.2),
      new Vector3(0, 1, 0)
    );

    const result = optimizer.optimize(
      { left, right },
      NEUTRAL_STANCE,
      DEFAULT_BOUNDS
    );
    expect(result.feasible).toBe(false);
    expect(result.simResult.reachShortfall.left).toBeGreaterThan(3);
  });
});

describe("StanceOptimizer avoids collisions", () => {
  it("finds a stance that does not clip the staff through the face", () => {
    const optimizer = optimizerForHeight(1.7);
    const rest = optimizer.simulator.restPose;

    // Place the grip just at the edge of the face sphere so a straight
    // reach would clip. The optimizer should adjust yaw/pitch to clear.
    const faceZ = 0.1;
    const faceY = rest.head.y + 0.05;
    const left = makeStaffTarget(
      new Vector3(0.25, faceY, faceZ),
      new Vector3(0, 1, 0)
    );
    const right = makeStaffTarget(
      new Vector3(-0.25, faceY, faceZ),
      new Vector3(0, 1, 0)
    );

    const result = optimizer.optimize(
      { left, right },
      NEUTRAL_STANCE,
      DEFAULT_BOUNDS
    );
    const headClips = result.simResult.collisions.filter(
      (c) => c.zone === "prop-through-head"
    );
    // If no head clip or much smaller than the worst possible, the
    // optimizer did its job. A small graze is acceptable.
    const worstDepth = headClips.reduce((m, c) => Math.max(m, c.depth), 0);
    expect(worstDepth).toBeLessThan(0.03);
  });
});

describe("StanceOptimizer full-rotation cases", () => {
  it("finds feasible stance for beta at character's far right (needs body shift)", () => {
    // Both hands grip the same point 0.55 m to the character's right.
    // Both props are at EAST wall at wheel-height: (0.55, 0, 0.3). The
    // performer needs to step to the right so BOTH shoulders are within
    // reach of that single point.
    const optimizer = optimizerForHeight(1.7);
    const target = new Vector3(0.55, 0, 0.3);
    const left = makeStaffTarget(target, new Vector3(0, 1, 0));
    const right = makeStaffTarget(target.clone(), new Vector3(0, 1, 0));
    const result = optimizer.optimize(
      { left, right },
      NEUTRAL_STANCE,
      DEFAULT_BOUNDS
    );
    expect(result.feasible).toBe(true);
    expect(result.simResult.reachShortfall.left).toBeLessThan(0.005);
    expect(result.simResult.reachShortfall.right).toBeLessThan(0.005);
  });

  it("finds feasible stance for beta on the far side of the body", () => {
    // Both hands at a point that would be BEHIND the performer in the
    // neutral orientation. Solvable by some combination of walking
    // around the target and rotating.
    const optimizer = optimizerForHeight(1.7);
    const target = new Vector3(0, 0.3, -0.5);
    const left = makeStaffTarget(target, new Vector3(0, 1, 0));
    const right = makeStaffTarget(target.clone(), new Vector3(0, 1, 0));
    const result = optimizer.optimize(
      { left, right },
      NEUTRAL_STANCE,
      DEFAULT_BOUNDS
    );
    expect(result.feasible).toBe(true);
    expect(result.simResult.reachShortfall.left).toBeLessThan(0.005);
    expect(result.simResult.reachShortfall.right).toBeLessThan(0.005);
  });

  it("finds feasible stance for hard cross-plane pose (blue right, red left)", () => {
    // Blue prop on character's FAR right, red prop on character's FAR
    // left — both well beyond natural one-sided reach. The performer
    // has to stand between them and rotate so the left arm faces the
    // left prop and the right arm faces the right prop. The resulting
    // stance should be feasible.
    const optimizer = optimizerForHeight(1.7);
    const left = makeStaffTarget(
      new Vector3(0.5, 0, 0.3), // character-right side
      new Vector3(0, 1, 0)
    );
    const right = makeStaffTarget(
      new Vector3(-0.5, 0, 0.3), // character-left side
      new Vector3(0, 1, 0)
    );
    const result = optimizer.optimize(
      { left, right },
      NEUTRAL_STANCE,
      DEFAULT_BOUNDS
    );
    expect(result.feasible).toBe(true);
    expect(result.simResult.reachShortfall.left).toBeLessThan(0.005);
    expect(result.simResult.reachShortfall.right).toBeLessThan(0.005);
  });

  it("uses full eval budget only when needed (easy case exits early)", () => {
    // An easy pose should resolve on the first yaw seed with only a
    // handful of descent iterations, well under the MAX_TOTAL_EVALS cap.
    const optimizer = optimizerForHeight(1.7);
    const rest = optimizer.simulator.restPose;
    const left = makeStaffTarget(
      new Vector3(rest.leftShoulder.x - 0.05, rest.leftShoulder.y, 0.3),
      new Vector3(0, 1, 0)
    );
    const right = makeStaffTarget(
      new Vector3(rest.rightShoulder.x + 0.05, rest.rightShoulder.y, 0.3),
      new Vector3(0, 1, 0)
    );
    const result = optimizer.optimize(
      { left, right },
      NEUTRAL_STANCE,
      DEFAULT_BOUNDS
    );
    expect(result.feasible).toBe(true);
    // Easy case should use much less than the full 700-eval cap.
    expect(result.evaluations).toBeLessThan(400);
  });
});
