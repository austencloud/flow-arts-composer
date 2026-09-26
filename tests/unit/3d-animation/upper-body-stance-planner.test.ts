import { describe, expect, it } from "vitest";
import {
  MAX_STANCE_YAW_RAD,
  planUpperBodyStance,
  planUpperBodyStanceYaw,
} from "$lib/shared/3d/collision/upper-body-stance-planner";

const GRID_DEPTH = 0.3;
const LANE = 0.16;

describe("planUpperBodyStanceYaw", () => {
  it("faces east when both grips move east", () => {
    const targets = {
      left: { x: 0.48, z: GRID_DEPTH },
      right: { x: 0.44, z: GRID_DEPTH },
    };
    const yaw = planUpperBodyStanceYaw(targets);
    const plan = planUpperBodyStance(targets);

    expect(yaw).toBeCloseTo(MAX_STANCE_YAW_RAD, 8);
    expect(plan.pitchRad).toBe(0);
    // Both hands come forward of the turned chest: the grid's forward offset is
    // cancelled and each hand takes its own shoulder's depth lane.
    expect(plan.leftDepthOffsetM).toBeCloseTo(-LANE - GRID_DEPTH, 8);
    expect(plan.rightDepthOffsetM).toBeCloseTo(LANE - GRID_DEPTH, 8);
  });

  it("faces west when both grips move west", () => {
    const targets = {
      left: { x: -0.48, z: GRID_DEPTH },
      right: { x: -0.44, z: GRID_DEPTH },
    };
    const yaw = planUpperBodyStanceYaw(targets);
    const plan = planUpperBodyStance(targets);

    expect(yaw).toBeCloseTo(-MAX_STANCE_YAW_RAD, 8);
    expect(plan.leftDepthOffsetM).toBeCloseTo(LANE - GRID_DEPTH, 8);
    expect(plan.rightDepthOffsetM).toBeCloseTo(-LANE - GRID_DEPTH, 8);
  });

  it("lands both grips in front of the turned chest, inside the elbow span", () => {
    for (const side of [1, -1]) {
      const targets = {
        left: { x: side * 0.48, z: GRID_DEPTH },
        right: { x: side * 0.44, z: GRID_DEPTH },
      };
      const plan = planUpperBodyStance(targets);
      const leftDepth = targets.left.z + plan.leftDepthOffsetM;
      const rightDepth = targets.right.z + plan.rightDepthOffsetM;

      // Chest-lateral placement at a full side hold IS the audience depth axis.
      // A shoulder half-span is ~0.19 m, so ±0.08 sits well inside the arms.
      expect(Math.abs(leftDepth)).toBeLessThanOrEqual(LANE + 1e-9);
      expect(Math.abs(rightDepth)).toBeLessThanOrEqual(LANE + 1e-9);
      // The pair straddles the centerline rather than sitting to one side.
      expect(Math.sign(leftDepth)).toBe(-Math.sign(rightDepth));
      expect(leftDepth + rightDepth).toBeCloseTo(0, 8);
      // Each hand stays on its own shoulder's side: the performer's left is
      // rig-local +X, so a positive yaw puts the left shoulder at negative depth.
      expect(Math.sign(leftDepth)).toBe(-Math.sign(plan.yawRad));
      // The full hidden-depth budget still separates the two staffs.
      expect(Math.abs(leftDepth - rightDepth)).toBeCloseTo(2 * LANE, 8);
    }
  });

  it("keeps the depth budget when the grid plane sits at another depth", () => {
    const plan = planUpperBodyStance({
      left: { x: 0.48, z: 0.9 },
      right: { x: 0.44, z: 0.9 },
    });
    expect(0.9 + plan.leftDepthOffsetM).toBeCloseTo(-LANE, 8);
    expect(0.9 + plan.rightDepthOffsetM).toBeCloseTo(LANE, 8);
  });

  it("does not dilute a side stance with the wall plane depth offset", () => {
    const near = planUpperBodyStanceYaw({
      left: { x: 0.48, z: 0.15 },
      right: { x: 0.44, z: 0.15 },
    });
    const far = planUpperBodyStanceYaw({
      left: { x: 0.48, z: 0.9 },
      right: { x: 0.44, z: 0.9 },
    });

    expect(far).toBeCloseTo(near, 8);
    expect(near).toBeCloseTo(MAX_STANCE_YAW_RAD, 8);
  });

  it("stays square for opposed targets", () => {
    const plan = planUpperBodyStance({
      left: { x: 0.45, z: GRID_DEPTH },
      right: { x: -0.45, z: GRID_DEPTH },
    });
    expect(plan).toEqual({
      yawRad: 0,
      pitchRad: 0,
      leftDepthOffsetM: 0,
      rightDepthOffsetM: 0,
    });
  });

  it("stays square inside the centered dead zone", () => {
    const plan = planUpperBodyStance({
      left: { x: 0.04, z: GRID_DEPTH },
      right: { x: 0.06, z: GRID_DEPTH },
    });
    expect(plan).toEqual({
      yawRad: 0,
      pitchRad: 0,
      leftDepthOffsetM: 0,
      rightDepthOffsetM: 0,
    });
  });

  it("holds the authored depth until the chest is genuinely side-on", () => {
    // A half-turned chest still occupies the depth the rear grip would move
    // into, so the re-expression waits for the stance instead of dragging the
    // grip through the torso on the way in.
    const partial = planUpperBodyStance({
      left: { x: 0.17, z: GRID_DEPTH },
      right: { x: 0.15, z: GRID_DEPTH },
    });
    expect(Math.abs(partial.yawRad)).toBeGreaterThan(0);
    expect(Math.abs(partial.yawRad)).toBeLessThan(Math.PI / 2 * 0.8);
    expect(partial.leftDepthOffsetM).toBeCloseTo(0, 12);
    expect(partial.rightDepthOffsetM).toBeCloseTo(0, 12);
  });

  it("ramps the hand re-expression in continuously above the knee", () => {
    const near = planUpperBodyStance({
      left: { x: 0.235, z: GRID_DEPTH },
      right: { x: 0.235, z: GRID_DEPTH },
    });
    const full = planUpperBodyStance({
      left: { x: 0.48, z: GRID_DEPTH },
      right: { x: 0.44, z: GRID_DEPTH },
    });

    expect(Math.abs(near.yawRad)).toBeGreaterThan((Math.PI / 2) * 0.8);
    expect(Math.abs(near.yawRad)).toBeLessThan(Math.abs(full.yawRad));
    expect(Math.abs(near.leftDepthOffsetM)).toBeGreaterThan(0);
    expect(Math.abs(near.leftDepthOffsetM)).toBeLessThan(
      Math.abs(full.leftDepthOffsetM)
    );
  });
});

describe("hug reach at a same-side hold", () => {
  // A mid-size adult rig: 44 cm shoulder span, 60 cm shoulder-to-grip reach.
  const MEASURED = {
    upperArmM: 0.28,
    forearmM: 0.32,
    shoulderWidthM: 0.44,
    reachM: 0.6,
  };
  const EAST = {
    left: { x: 0.48, z: GRID_DEPTH },
    right: { x: 0.44, z: GRID_DEPTH },
  };

  it("draws the two hands closer together than the un-measured stance", () => {
    const before = planUpperBodyStance(EAST);
    const after = planUpperBodyStance(EAST, MEASURED);

    const separation = (plan: ReturnType<typeof planUpperBodyStance>) =>
      Math.abs(
        plan.leftDepthOffsetM +
          EAST.left.z -
          (plan.rightDepthOffsetM + EAST.right.z)
      );

    expect(separation(after)).toBeLessThan(separation(before));
    // Still two distinct lanes, so the grips never occupy one point.
    expect(separation(after)).toBeGreaterThan(0.05);
  });

  it("keeps both grips inside the shoulder span", () => {
    const plan = planUpperBodyStance(EAST, MEASURED);
    const shoulderHalfSpan = MEASURED.shoulderWidthM / 2;

    for (const lane of [
      plan.leftDepthOffsetM + EAST.left.z,
      plan.rightDepthOffsetM + EAST.right.z,
    ]) {
      expect(Math.abs(lane)).toBeLessThan(shoulderHalfSpan);
    }
  });

  it("keeps the grips straddling the chest midline", () => {
    const plan = planUpperBodyStance(EAST, MEASURED);
    const leftLane = plan.leftDepthOffsetM + EAST.left.z;
    const rightLane = plan.rightDepthOffsetM + EAST.right.z;

    expect(Math.sign(leftLane)).toBe(-Math.sign(rightLane));
    expect(Math.abs(leftLane)).toBeCloseTo(Math.abs(rightLane), 8);
  });

  it("leaves the square stance untouched", () => {
    const targets = {
      left: { x: -0.44, z: GRID_DEPTH },
      right: { x: 0.44, z: GRID_DEPTH },
    };
    const plan = planUpperBodyStance(targets, MEASURED);

    expect(plan.yawRad).toBe(0);
    expect(plan.leftDepthOffsetM).toBe(0);
    expect(plan.rightDepthOffsetM).toBe(0);
  });

  it("never widens past the un-measured lane on a very broad rig", () => {
    const broad = { ...MEASURED, shoulderWidthM: 0.9, reachM: 0.75 };
    const plan = planUpperBodyStance(EAST, broad);

    expect(Math.abs(plan.leftDepthOffsetM + EAST.left.z)).toBeLessThanOrEqual(
      LANE + 1e-9
    );
  });
});
