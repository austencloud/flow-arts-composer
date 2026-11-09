import { describe, expect, it } from "vitest";
import { controlPose } from "./control-presence";

describe("controlPose", () => {
  it("rests exactly in place at the end of the path", () => {
    expect(controlPose(1, 2, "bottom")).toMatchObject({
      opacity: 1,
      scale: 1,
    });
    expect(Math.abs(controlPose(1, 2, "bottom").y)).toBeLessThan(1e-9);
  });

  it("is fully gone at the start of the path, offset toward its own edge", () => {
    expect(controlPose(0, 0, "bottom").opacity).toBe(0);
    expect(controlPose(0, 0, "bottom").y).toBeGreaterThan(0);
    expect(controlPose(0, 0, "top").y).toBeLessThan(0);
    expect(controlPose(0, 0, "right").x).toBeGreaterThan(0);
    expect(controlPose(0, 0, "left").x).toBeLessThan(0);
  });

  it("moves the primary control before the outer rings", () => {
    const t = 0.1;
    expect(controlPose(t, 0, "bottom").opacity).toBeGreaterThan(
      controlPose(t, 1, "bottom").opacity
    );
    expect(controlPose(t, 1, "bottom").opacity).toBeGreaterThan(
      controlPose(t, 2, "bottom").opacity
    );
  });

  it("never leaves opacity's range while the transform overshoots", () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const { opacity } = controlPose(t, 1, "bottom");
      expect(opacity).toBeGreaterThanOrEqual(0);
      expect(opacity).toBeLessThanOrEqual(1);
    }
  });

  it("treats a ring outside the family as its nearest ring", () => {
    expect(controlPose(0.5, 9, "bottom")).toEqual(
      controlPose(0.5, 2, "bottom")
    );
  });
});
