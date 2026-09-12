import { describe, it, expect } from "vitest";
import { buildConstraintSet } from "../../../../src/generation/constraints/composition/build-constraint-set.js";
import { ConstraintType } from "../../../../src/generation/constraints/constraint-types.js";

describe("buildConstraintSet", () => {
  it("returns empty constraints for empty options", () => {
    const result = buildConstraintSet({});
    expect(result.hard).toHaveLength(0);
    expect(result.soft).toHaveLength(0);
  });

  it("creates hard MotionType constraint for motionType: 'pro'", () => {
    const result = buildConstraintSet({ motionType: "pro" });
    const motionConstraint = result.hard.find(c => c.type === ConstraintType.MOTION_TYPE);
    expect(motionConstraint).toBeDefined();
    expect(motionConstraint!.mode).toBe("hard");
    expect(motionConstraint!.description).toContain("pro");
  });

  it("creates hard RotationDirection constraint for rotationDirection: 'cw'", () => {
    const result = buildConstraintSet({ rotationDirection: "cw" });
    const rotConstraint = result.hard.find(c => c.type === ConstraintType.ROTATION_DIRECTION);
    expect(rotConstraint).toBeDefined();
    expect(rotConstraint!.mode).toBe("hard");
  });

  it("creates soft ContinuityConstraint for propContinuity: 'maximize'", () => {
    const result = buildConstraintSet({ propContinuity: "maximize" });
    const continuityConstraint = result.soft.find(c => c.type === ConstraintType.CONTINUITY);
    expect(continuityConstraint).toBeDefined();
    expect(continuityConstraint!.mode).toBe("soft");
  });

  it("creates ReversalConstraint for propContinuity: 'force-reversals'", () => {
    const result = buildConstraintSet({ propContinuity: "force-reversals" });
    const reversalConstraint = [...result.hard, ...result.soft].find(c => c.type === ConstraintType.REVERSAL);
    expect(reversalConstraint).toBeDefined();
  });

  it("creates exclude constraint for motionFamily.exclude", () => {
    const result = buildConstraintSet({ motionFamily: { exclude: ["dash"] } });
    const motionConstraint = result.hard.find(c => c.type === ConstraintType.MOTION_TYPE);
    expect(motionConstraint).toBeDefined();
    expect(motionConstraint!.description).toContain("Exclude");
    expect(motionConstraint!.description).toContain("dash");
  });

  it("composes multiple dimensions correctly", () => {
    const result = buildConstraintSet({
      motionType: "pro",
      rotationDirection: "ccw",
      propContinuity: "maximize",
    });
    expect(result.hard.length).toBeGreaterThanOrEqual(2); // motionType + rotationDirection
    expect(result.soft.length).toBeGreaterThanOrEqual(1); // propContinuity
  });

  it("skips 'any' values without creating constraints", () => {
    const result = buildConstraintSet({
      motionType: "any",
      rotationDirection: "any",
      turns: "any",
    });
    expect(result.hard).toHaveLength(0);
    expect(result.soft).toHaveLength(0);
  });

  it("handles motionFamily.include by excluding non-included families", () => {
    const result = buildConstraintSet({ motionFamily: { include: ["shift"] } });
    // Should create excludes for dash and static
    const excludes = result.hard.filter(c =>
      c.type === ConstraintType.MOTION_TYPE && c.description.includes("Exclude")
    );
    expect(excludes).toHaveLength(2);
    expect(excludes.some(c => c.description.includes("dash"))).toBe(true);
    expect(excludes.some(c => c.description.includes("static"))).toBe(true);
  });

  it("creates hand path continuity constraint for handPathContinuity: 'maximize'", () => {
    const result = buildConstraintSet({ handPathContinuity: "maximize" });
    const handPath = result.soft.find(c => c.type === ConstraintType.HAND_PATH);
    expect(handPath).toBeDefined();
  });

  it("creates hard TurnConstraint for turns: 0", () => {
    const result = buildConstraintSet({ turns: 0 });
    const turnConstraint = result.hard.find(c => c.type === ConstraintType.TURN);
    expect(turnConstraint).toBeDefined();
    expect(turnConstraint!.mode).toBe("hard");
  });

  it("creates soft DashPreferenceConstraint for dashPreference: 'maximize'", () => {
    const result = buildConstraintSet({ dashPreference: "maximize" });
    const dashPref = result.soft.find(
      c => c.type === ConstraintType.MOTION_TYPE && c.description.toLowerCase().includes("maximize dash")
    );
    expect(dashPref).toBeDefined();
    expect(dashPref!.mode).toBe("soft");
    // Weight must be > 1.0 so it dominates other soft constraints.
    // Without this boost, the 3-way average (prop + handpath + dash)
    // drowns the dash signal and the setting has no visible effect.
    expect(result.weights?.get(ConstraintType.MOTION_TYPE)).toBeGreaterThan(1.0);
  });

  it("creates soft DashAvoidanceConstraint for dashPreference: 'minimize'", () => {
    const result = buildConstraintSet({ dashPreference: "minimize" });
    const dashAvoid = result.soft.find(
      c => c.type === ConstraintType.MOTION_TYPE && c.description.toLowerCase().includes("minimize dash")
    );
    expect(dashAvoid).toBeDefined();
    expect(dashAvoid!.mode).toBe("soft");
    expect(result.weights?.get(ConstraintType.MOTION_TYPE)).toBeGreaterThan(1.0);
  });

  it("does not create a dash constraint when dashPreference is undefined", () => {
    const result = buildConstraintSet({ propContinuity: "maximize" });
    const motionSoft = result.soft.find(c => c.type === ConstraintType.MOTION_TYPE);
    expect(motionSoft).toBeUndefined();
    expect(result.weights).toBeUndefined();
  });

  it("creates a hard HandRelationshipConstraint for handRelationship", () => {
    const result = buildConstraintSet({
      handRelationship: { map: "reflect-north-south", inverted: true },
    });
    const constraint = result.hard.find(
      (c) => c.type === ConstraintType.HAND_RELATIONSHIP
    );
    expect(constraint).toBeDefined();
    expect(constraint!.mode).toBe("hard");
    expect(constraint!.description).toContain("reflect-north-south");
    expect(constraint!.description).toContain("inverted");
    expect(result.soft).toHaveLength(0);
  });

  it("does not create a hand relationship constraint when the option is absent", () => {
    const result = buildConstraintSet({ propContinuity: "maximize" });
    expect(
      result.hard.find((c) => c.type === ConstraintType.HAND_RELATIONSHIP)
    ).toBeUndefined();
  });
});
