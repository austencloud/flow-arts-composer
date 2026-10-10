import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import {
  StanceSimulator,
  restPoseFromHeight,
} from "#lib/features/lab/tabs/collision-lab/services/stance-simulator.js";
import type { SimPropTarget } from "#lib/features/lab/tabs/collision-lab/services/contracts/IStanceSimulator";
import type { StancePose } from "#lib/features/lab/tabs/collision-lab/domain/types.js";

const NEUTRAL_STANCE: StancePose = {
  footOffsetX: 0,
  footOffsetZ: 0,
  rootYawRad: 0,
  spinePitchRad: 0,
};

function makeStaffTarget(gripWorld: Vector3, axisWorld: Vector3): SimPropTarget {
  const half = axisWorld.clone().multiplyScalar(0.43); // 86 cm staff
  return {
    gripWorld: gripWorld.clone(),
    tipAWorld: gripWorld.clone().add(half),
    tipBWorld: gripWorld.clone().sub(half),
    radius: 0.012,
  };
}

describe("restPoseFromHeight", () => {
  it("produces proportions consistent with the input height", () => {
    const rest = restPoseFromHeight(1.7);
    expect(rest.upperArmLength).toBeCloseTo(0.186 * 1.7, 4);
    expect(rest.forearmLength).toBeCloseTo(0.146 * 1.7, 4);
    // Mixamo convention: character's right shoulder at +X, left at -X.
    expect(rest.leftShoulder.x).toBeLessThan(0);
    expect(rest.rightShoulder.x).toBeGreaterThan(0);
    expect(rest.leftShoulder.x).toBeCloseTo(-rest.rightShoulder.x, 6);
  });
});

describe("StanceSimulator reach", () => {
  const rest = restPoseFromHeight(1.7);
  const sim = new StanceSimulator(rest);
  const maxReach = rest.upperArmLength + rest.forearmLength;

  it("reports zero shortfall for a target at neutral arm reach", () => {
    // Place the target at the left shoulder + 30 cm out along +X, +Z.
    // That's well within reach.
    const shoulder = rest.leftShoulder;
    const target = new Vector3(shoulder.x + 0.2, shoulder.y, shoulder.z + 0.2);
    const result = sim.evaluate(
      NEUTRAL_STANCE,
      makeStaffTarget(target, new Vector3(0, 1, 0)),
      makeStaffTarget(
        new Vector3(rest.rightShoulder.x - 0.2, rest.rightShoulder.y, 0.2),
        new Vector3(0, 1, 0)
      )
    );
    expect(result.reachShortfall.left).toBeLessThan(0.001);
    expect(result.reachShortfall.right).toBeLessThan(0.001);
  });

  it("reports positive shortfall for a target far beyond reach", () => {
    // Target 2 m forward of the left shoulder — no way to touch it.
    const target = new Vector3(
      rest.leftShoulder.x,
      rest.leftShoulder.y,
      rest.leftShoulder.z + 2
    );
    const rightTarget = new Vector3(
      rest.rightShoulder.x,
      rest.rightShoulder.y,
      rest.rightShoulder.z + 0.2
    );
    const result = sim.evaluate(
      NEUTRAL_STANCE,
      makeStaffTarget(target, new Vector3(0, 1, 0)),
      makeStaffTarget(rightTarget, new Vector3(0, 1, 0))
    );
    expect(result.reachShortfall.left).toBeGreaterThan(2 - maxReach - 0.01);
    expect(result.feasible).toBe(false);
  });

  it("foot offset in X reduces the shortfall for a laterally-offset target", () => {
    // Target is 80 cm to the performer's LEFT (+X), beyond natural reach.
    const target = new Vector3(0.8, rest.leftShoulder.y, 0);
    const rightTarget = new Vector3(
      rest.rightShoulder.x,
      rest.rightShoulder.y,
      0.2
    );
    const neutral = sim.evaluate(
      NEUTRAL_STANCE,
      makeStaffTarget(target, new Vector3(0, 1, 0)),
      makeStaffTarget(rightTarget, new Vector3(0, 1, 0))
    );
    const stepped = sim.evaluate(
      { ...NEUTRAL_STANCE, footOffsetX: 0.3 },
      makeStaffTarget(target, new Vector3(0, 1, 0)),
      makeStaffTarget(rightTarget, new Vector3(0, 1, 0))
    );
    expect(stepped.reachShortfall.left).toBeLessThan(neutral.reachShortfall.left);
  });
});

describe("StanceSimulator collisions", () => {
  const rest = restPoseFromHeight(1.7);
  const sim = new StanceSimulator(rest);

  it("detects a staff passing through the face", () => {
    // Vertical staff centered on the face (head position + 8 cm forward
    // + 5 cm up, which is the face center the simulator derives).
    const faceZ = 0.08;
    const faceY = rest.head.y + 0.05;
    const grip = new Vector3(0, faceY, faceZ);
    const target = makeStaffTarget(grip, new Vector3(0, 1, 0));
    const safeRight = makeStaffTarget(
      new Vector3(rest.rightShoulder.x - 0.2, rest.rightShoulder.y, 0.2),
      new Vector3(0, 1, 0)
    );
    const result = sim.evaluate(NEUTRAL_STANCE, target, safeRight);
    const headEvents = result.collisions.filter((c) => c.zone === "prop-through-head");
    expect(headEvents.length).toBeGreaterThan(0);
    expect(headEvents[0]!.depth).toBeGreaterThan(0);
  });

  it("reports no face collision for a staff far to the side", () => {
    const farLeft = new Vector3(1.0, rest.leftShoulder.y, 0);
    const target = makeStaffTarget(farLeft, new Vector3(0, 1, 0));
    const safeRight = makeStaffTarget(
      new Vector3(rest.rightShoulder.x - 0.2, rest.rightShoulder.y, 0.2),
      new Vector3(0, 1, 0)
    );
    const result = sim.evaluate(NEUTRAL_STANCE, target, safeRight);
    const headEvents = result.collisions.filter((c) => c.zone === "prop-through-head");
    expect(headEvents.length).toBe(0);
  });
});

describe("StanceSimulator balance", () => {
  const rest = restPoseFromHeight(1.7);
  const sim = new StanceSimulator(rest);

  it("reports positive balance margin in neutral stance", () => {
    const rightTarget = new Vector3(
      rest.rightShoulder.x - 0.2,
      rest.rightShoulder.y,
      0.2
    );
    const leftTarget = new Vector3(
      rest.leftShoulder.x + 0.2,
      rest.leftShoulder.y,
      0.2
    );
    const result = sim.evaluate(
      NEUTRAL_STANCE,
      makeStaffTarget(leftTarget, new Vector3(0, 1, 0)),
      makeStaffTarget(rightTarget, new Vector3(0, 1, 0))
    );
    expect(result.balanceMargin).toBeGreaterThan(0);
  });
});
