import { describe, expect, it } from "vitest";
import { materializeTurn } from "../../../src/generation/turns/TurnMaterializer.js";
import { relatedRotationDirection } from "../../../src/generation/constraints/style/hand-relationship-constraint.js";

describe("materializeTurn forcedRotationDirection", () => {
  it("uses the forced direction for a dash or static that gained turns", () => {
    const turn = materializeTurn(
      { motionType: "dash", rotationDirection: "noRotation" },
      1,
      { forcedRotationDirection: "ccw", propContinuity: "maximize", previousRotation: "cw" }
    );
    expect(turn.rotationDirection).toBe("ccw");
  });

  it("never overrides a shift's own direction", () => {
    const turn = materializeTurn(
      { motionType: "pro", rotationDirection: "cw" },
      2,
      { forcedRotationDirection: "ccw" }
    );
    expect(turn.rotationDirection).toBe("cw");
  });

  it("leaves a zero-turn dash without a direction", () => {
    const turn = materializeTurn(
      { motionType: "dash", rotationDirection: "noRotation" },
      0,
      { forcedRotationDirection: "ccw" }
    );
    expect(turn.rotationDirection).toBe("noRotation");
  });
});

describe("relatedRotationDirection", () => {
  it("flips the spin across a reflection and keeps it for identity and rotation", () => {
    expect(relatedRotationDirection("cw", { map: "reflect-north-south" })).toBe("ccw");
    expect(relatedRotationDirection("cw", { map: "reflect-east-west" })).toBe("ccw");
    expect(relatedRotationDirection("cw", { map: "identity" })).toBe("cw");
    expect(relatedRotationDirection("cw", { map: "rotate-180" })).toBe("cw");
  });

  it("inverted flips it back", () => {
    expect(relatedRotationDirection("cw", { map: "reflect-north-south", inverted: true })).toBe("cw");
    expect(relatedRotationDirection("ccw", { map: "identity", inverted: true })).toBe("cw");
  });

  it("has nothing to say about a hand that is not spinning", () => {
    expect(relatedRotationDirection("noRotation", { map: "reflect-north-south" })).toBeUndefined();
    expect(relatedRotationDirection(undefined, { map: "identity" })).toBeUndefined();
  });
});
