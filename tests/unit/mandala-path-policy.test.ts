import { describe, expect, it } from "vitest";
import {
  toAnimationPathPolicy,
  toMandalaPathShape,
} from "#lib/shared/mandala/services/mandala-path-policy.js";

describe("mandala path policy", () => {
  it.each(["arc", "linear", "concave"] as const)(
    "round-trips the fixed %s path shape",
    (pathShape) => {
      const policy = toAnimationPathPolicy(pathShape, {
        pathShape: "arc",
        motionAwarePaths: true,
      });

      expect(policy).toEqual({ pathShape, motionAwarePaths: false });
      expect(toMandalaPathShape(policy)).toBe(pathShape);
    }
  );

  it("maps Hybrid to By Motion without discarding the last fixed shape", () => {
    const policy = toAnimationPathPolicy("hybrid", {
      pathShape: "concave",
      motionAwarePaths: false,
    });

    expect(policy).toEqual({
      pathShape: "concave",
      motionAwarePaths: true,
    });
    expect(toMandalaPathShape(policy)).toBe("hybrid");
  });
});
