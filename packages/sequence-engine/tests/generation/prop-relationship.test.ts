// tests/generation/prop-relationship.test.ts
import { describe, expect, it } from "vitest";
import {
  classifyPropRelationship,
  derivePartnerOrientation,
  LOCATION_BEARINGS,
  propBearing,
  propPhase,
  RADIAL_ORIENTATION_CYCLE,
  reportPropRelationship,
  timingFromPhase,
  type PropRelationshipMotion,
} from "../../src/generation/prop-relationship.js";

const PI = Math.PI;
const near = (a: number, b: number) =>
  Math.abs(((((a - b) % (2 * PI)) + 3 * PI) % (2 * PI)) - PI) < 1e-9;

function motion(
  overrides: Partial<PropRelationshipMotion> = {}
): PropRelationshipMotion {
  return {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "n",
    endLocation: "e",
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
    ...overrides,
  };
}

describe("propBearing", () => {
  it("points in toward the center for the in orientation", () => {
    expect(near(propBearing("in", "e")!, PI)).toBe(true);
    expect(near(propBearing("in", "n")!, PI / 2)).toBe(true);
  });

  it("steps a quarter turn per radial orientation", () => {
    expect(near(propBearing("clock", "e")!, PI / 2)).toBe(true);
    expect(near(propBearing("out", "e")!, 0)).toBe(true);
    expect(near(propBearing("counter", "e")!, -PI / 2)).toBe(true);
  });

  it("is undefined off the table", () => {
    expect(propBearing("centerN", "e")).toBeUndefined();
    expect(propBearing("in", "center")).toBeUndefined();
  });

  it("covers every location and every radial orientation", () => {
    for (const location of Object.keys(LOCATION_BEARINGS)) {
      for (const orientation of RADIAL_ORIENTATION_CYCLE) {
        expect(propBearing(orientation, location)).toBeTypeOf("number");
      }
    }
  });
});

describe("propPhase and timingFromPhase", () => {
  it("reads the difference under the same spin", () => {
    expect(near(propPhase(PI / 2, PI / 2, "same"), 0)).toBe(true);
    expect(near(propPhase(PI, 0, "same"), PI)).toBe(true);
  });

  it("reads the sum against South under opposite spin", () => {
    // Both point South: together.
    expect(near(propPhase(PI / 2, PI / 2, "opp"), 0)).toBe(true);
    // One South, one North: split.
    expect(near(propPhase(PI / 2, -PI / 2, "opp"), PI)).toBe(true);
  });

  it("classes the phase with quarter bands", () => {
    expect(timingFromPhase(0)).toBe("tog");
    expect(timingFromPhase(PI / 8)).toBe("tog");
    expect(timingFromPhase(PI / 2)).toBe("quarter");
    expect(timingFromPhase(-PI / 2)).toBe("quarter");
    expect(timingFromPhase(PI)).toBe("split");
    expect(timingFromPhase(PI + PI / 8)).toBe("split");
  });

  it("classes an exact band edge as quarter, not tog or split", () => {
    expect(timingFromPhase(PI / 4)).toBe("quarter");
    expect(timingFromPhase(-PI / 4)).toBe("quarter");
    expect(timingFromPhase((3 * PI) / 4)).toBe("quarter");
    expect(timingFromPhase(PI / 4 + 2 * PI)).toBe("quarter");
    expect(timingFromPhase(PI / 4 - 1e-6)).toBe("tog");
    expect(timingFromPhase((3 * PI) / 4 + 1e-6)).toBe("split");
  });

  it("classes just inside a band edge as quarter, not tog or split", () => {
    expect(timingFromPhase(PI / 4 + 1e-6)).toBe("quarter");
    expect(timingFromPhase((3 * PI) / 4 - 1e-6)).toBe("quarter");
  });

  it("classes the wrapped mirror of the tog/quarter and quarter/split edges", () => {
    // 5*PI/4 and -3*PI/4 are the same angle, folding to the same distance
    // from zero as (3*PI)/4 above: an exact band edge, so quarter as well.
    expect(timingFromPhase((5 * PI) / 4)).toBe("quarter");
    expect(timingFromPhase((-3 * PI) / 4)).toBe("quarter");
    // 7*PI/4 folds to PI/4, the tog/quarter band edge from above: also
    // exact, so quarter as well.
    expect(timingFromPhase((7 * PI) / 4)).toBe("quarter");
  });
});

describe("classifyPropRelationship", () => {
  it("is float when either prop is not spinning", () => {
    expect(
      classifyPropRelationship(
        motion({ motionType: "dash", rotationDirection: "noRotation" }),
        motion()
      )
    ).toEqual({ kind: "float" });
    expect(
      classifyPropRelationship(
        motion({
          motionType: "float",
          turns: "fl",
          rotationDirection: "noRotation",
        }),
        motion()
      )
    ).toEqual({ kind: "float" });
  });

  it("reads Together Same for two in props on the same arc", () => {
    // Both hands N to E, both in, both cw: same bearing throughout.
    expect(classifyPropRelationship(motion(), motion())).toEqual({
      kind: "full",
      direction: "same",
      timing: "tog",
    });
  });

  it("reads Split Same for in against out on the same arc", () => {
    expect(
      classifyPropRelationship(
        motion({ startOrientation: "out", endOrientation: "out" }),
        motion()
      )
    ).toEqual({ kind: "full", direction: "same", timing: "split" });
  });

  it("reads Together Opposite when the bearings sum to South twice", () => {
    // Left at N pointing in (South, pi/2), right at S pointing in (North,
    // -pi/2): sum is 0, minus pi is -pi: split. Flip the right to out
    // (South): sum is pi, together.
    const left = motion({
      startLocation: "n",
      endLocation: "n",
      rotationDirection: "ccw",
    });
    const rightIn = motion({ startLocation: "s", endLocation: "s" });
    const rightOut = motion({
      startLocation: "s",
      endLocation: "s",
      startOrientation: "out",
      endOrientation: "out",
    });
    expect(classifyPropRelationship(left, rightIn)).toEqual({
      kind: "full",
      direction: "opp",
      timing: "split",
    });
    expect(classifyPropRelationship(left, rightOut)).toEqual({
      kind: "full",
      direction: "opp",
      timing: "tog",
    });
  });

  it("is direction-only when the start and end phases disagree", () => {
    expect(
      classifyPropRelationship(motion({ endOrientation: "out" }), motion())
    ).toEqual({ kind: "direction-only", direction: "same" });
  });
});

describe("derivePartnerOrientation", () => {
  it("round-trips through the classifier for every radial pair", () => {
    const locations = ["n", "e", "s", "w"];
    for (const direction of ["same", "opp"] as const) {
      for (const timing of ["tog", "quarter", "split"] as const) {
        for (const rightLocation of locations) {
          for (const leftLocation of locations) {
            for (const rightOrientation of ["in", "out", "clock", "counter"]) {
              const left = derivePartnerOrientation(
                { orientation: rightOrientation, location: rightLocation },
                leftLocation,
                direction,
                timing
              );
              expect(
                left,
                `${direction} ${timing} R ${rightOrientation}@${rightLocation} L@${leftLocation}`
              ).toBeDefined();
              expect(["in", "out", "clock", "counter"]).toContain(left);
              const reading = classifyPropRelationship(
                motion({
                  startLocation: leftLocation,
                  endLocation: leftLocation,
                  startOrientation: left!,
                  endOrientation: left!,
                  rotationDirection: direction === "same" ? "cw" : "ccw",
                }),
                motion({
                  startLocation: rightLocation,
                  endLocation: rightLocation,
                  startOrientation: rightOrientation,
                  endOrientation: rightOrientation,
                })
              );
              expect(reading).toEqual({ kind: "full", direction, timing });
            }
          }
        }
      }
    }
  });

  it("lands on a radial-four orientation from a diagonal pair too", () => {
    const left = derivePartnerOrientation(
      { orientation: "in", location: "ne" },
      "sw",
      "opp",
      "quarter"
    );
    expect(["in", "out", "clock", "counter"]).toContain(left);
  });
});

describe("reportPropRelationship", () => {
  const start = {
    motions: {
      left: motion({ motionType: "static" }),
      right: motion({ motionType: "static" }),
    },
  };
  it("counts holding, offending and exempt beats and names the first miss", () => {
    const hold = { motions: { left: motion(), right: motion() } };
    const miss = {
      motions: {
        left: motion({ startOrientation: "out", endOrientation: "out" }),
        right: motion(),
      },
    };
    const exempt = {
      motions: {
        left: motion({ motionType: "dash", rotationDirection: "noRotation" }),
        right: motion(),
      },
    };
    const report = reportPropRelationship([start, hold, exempt, miss, hold], {
      direction: "same",
      timing: "tog",
    });
    expect(report).toEqual({
      holding: 2,
      offending: 1,
      exempt: 1,
      firstOffendingIndex: 3,
    });
  });

  it("checks direction alone when no timing is requested", () => {
    const split = {
      motions: {
        left: motion({ startOrientation: "out", endOrientation: "out" }),
        right: motion(),
      },
    };
    expect(
      reportPropRelationship([start, split], { direction: "same" }).offending
    ).toBe(0);
    expect(
      reportPropRelationship([start, split], { direction: "opp" }).offending
    ).toBe(1);
  });
});
