import { describe, it, expect } from "vitest";
import { classifyRotationStyle } from "#lib/shared/shape-matrix/domain/rotation-style.js";

// Minimal sequence shape: steps with blue/red motions carrying a motionType.
function seq(pairs: Array<[string, string]>): any {
  return {
    steps: pairs.map(([left, right]) => ({
      isBlank: false,
      motions: { left: { motionType: left }, right: { motionType: right } },
    })),
  };
}

describe("classifyRotationStyle", () => {
  it("both pro → iso", () => {
    expect(
      classifyRotationStyle(
        seq([
          ["static", "static"],
          ["pro", "pro"],
        ])
      )
    ).toBe("iso");
  });
  it("both anti → antispin", () => {
    expect(classifyRotationStyle(seq([["anti", "anti"]]))).toBe("antispin");
  });
  it("one pro one anti → hybrid", () => {
    expect(classifyRotationStyle(seq([["pro", "anti"]]))).toBe("hybrid");
  });
  it("uses prefloatMotionType when a hand floats", () => {
    const s = {
      steps: [
        {
          isBlank: false,
          motions: {
            left: { motionType: "float", prefloatMotionType: "anti" },
            right: { motionType: "anti" },
          },
        },
      ],
    } as any;
    expect(classifyRotationStyle(s)).toBe("antispin");
  });
  it("skips non-rotating (static/dash) steps; falls back to hybrid if none rotate", () => {
    expect(
      classifyRotationStyle(
        seq([
          ["static", "static"],
          ["dash", "dash"],
        ])
      )
    ).toBe("hybrid");
  });
});
