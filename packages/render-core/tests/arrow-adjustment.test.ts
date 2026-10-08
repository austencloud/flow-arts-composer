import { describe, expect, it } from "vitest";
import {
  arrowDirectionalTuples,
  arrowQuadrantIndex,
  calculateArrowAdjustment,
  hasRotationOverride,
  legacyOrientationBucket,
  resolveArrowRotation,
  rotationOverrideKey,
  shouldMirrorArrow,
  specialPlacementAttributeKey,
  specialPlacementOrientationKeys,
  type ArrowAdjustmentMotion,
  type ArrowAdjustmentPictograph,
} from "../src/calculations/arrow-adjustment.js";
import { calculateArrowRotation } from "../src/calculations/arrow-rotation.js";

function motion(overrides: Partial<ArrowAdjustmentMotion> = {}): ArrowAdjustmentMotion {
  return {
    hand: "left",
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: "s",
    endLocation: "w",
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
    propType: "staff",
    ...overrides,
  };
}

function pictograph(
  left: Partial<ArrowAdjustmentMotion>,
  right: Partial<ArrowAdjustmentMotion>,
  extra: Partial<ArrowAdjustmentPictograph> = {}
): ArrowAdjustmentPictograph {
  return {
    letter: "A",
    leftMotion: motion({ hand: "left", ...left }),
    rightMotion: motion({ hand: "right", ...right }),
    turnsTuple: "(0, 0)",
    ...extra,
  };
}

describe("special placement keys", () => {
  it("buckets orientation keys into the legacy layer folders", () => {
    expect(legacyOrientationBucket("in_out")).toBe("from_layer1");
    expect(legacyOrientationBucket("clock_counter")).toBe("from_layer2");
    expect(legacyOrientationBucket("in_clock")).toBe("from_layer3_blue1_red2");
    expect(legacyOrientationBucket("counter_out")).toBe("from_layer3_blue2_red1");
  });

  it("reads the legacy folder for two staffs and the exact folder for other props", () => {
    const staffs = pictograph({ startOrientation: "in" }, { startOrientation: "clock" });
    expect(specialPlacementOrientationKeys(staffs)).toEqual({
      orientationKey: "from_layer3_blue1_red2",
      legacyKey: "from_layer3_blue1_red2",
    });
    const fans = pictograph(
      { startOrientation: "in", propType: "fan" },
      { startOrientation: "clock", propType: "fan" }
    );
    expect(specialPlacementOrientationKeys(fans).orientationKey).toBe("in_clock");
  });

  it("keys an arrow by colour from a standard start and by motion type from a mixed hybrid start", () => {
    const standard = pictograph({}, {});
    expect(specialPlacementAttributeKey(standard, standard.leftMotion)).toBe("blue");
    expect(specialPlacementAttributeKey(standard, standard.rightMotion)).toBe("red");

    const mixedHybrid = pictograph(
      { startOrientation: "in" },
      { startOrientation: "clock" },
      { letter: "C" }
    );
    expect(specialPlacementAttributeKey(mixedHybrid, mixedHybrid.leftMotion)).toBe("pro");

    const mixedTypes = pictograph(
      { startOrientation: "in", motionType: "pro" },
      { startOrientation: "clock", motionType: "anti" },
      { letter: "C" }
    );
    expect(specialPlacementAttributeKey(mixedTypes, mixedTypes.leftMotion)).toBe(
      "pro_from_layer1"
    );
    expect(specialPlacementAttributeKey(mixedTypes, mixedTypes.rightMotion)).toBe(
      "anti_from_layer2"
    );
  });

  it("builds the rotation override key the app checks", () => {
    const plain = pictograph({ motionType: "static" }, { motionType: "dash" }, { letter: "Φ" });
    expect(rotationOverrideKey(plain, plain.leftMotion)).toBe("static_rot_angle_override");
    const byColour = pictograph({ motionType: "dash" }, { motionType: "dash" }, { letter: "Φ-" });
    expect(rotationOverrideKey(byColour, byColour.rightMotion)).toBe("right_rot_angle_override");
    const mixed = pictograph(
      { motionType: "static", startOrientation: "clock" },
      { motionType: "dash", startOrientation: "in" },
      { letter: "Φ" }
    );
    expect(rotationOverrideKey(mixed, mixed.leftMotion)).toBe(
      "static_from_layer2_rot_angle_override"
    );
  });
});

describe("arrow mirroring and quadrants", () => {
  it("mirrors anti clockwise, other motions counter-clockwise, and never a float", () => {
    expect(shouldMirrorArrow("anti", "cw")).toBe(true);
    expect(shouldMirrorArrow("anti", "ccw")).toBe(false);
    expect(shouldMirrorArrow("pro", "ccw")).toBe(true);
    expect(shouldMirrorArrow("pro", "cw")).toBe(false);
    expect(shouldMirrorArrow("float", "ccw")).toBe(false);
  });

  it("picks the quadrant from the arrow's location", () => {
    expect(arrowQuadrantIndex(motion({ motionType: "pro" }), "sw")).toBe(2);
    expect(arrowQuadrantIndex(motion({ motionType: "pro" }), "e")).toBe(1);
    expect(
      arrowQuadrantIndex(
        motion({ motionType: "static", startLocation: "s", endLocation: "s" }),
        "s"
      )
    ).toBe(2);
  });

  it("turns a diamond pro clockwise nudge around the grid", () => {
    expect(arrowDirectionalTuples(motion({ motionType: "pro" }), 10, 20)).toEqual([
      [10, 20],
      [-20, 10],
      [-10, -20],
      [20, -10],
    ]);
  });

  it("matches the app's float tuples, which index the other grid's locations", () => {
    // The app's directional-tuple-processor looks a diamond float up in the
    // diagonal list (and a box float in the cardinal list), so the step is
    // never found and every float takes the reflected tuples.
    const clockwisePath = motion({ motionType: "float", startLocation: "s", endLocation: "w" });
    const counterPath = motion({ motionType: "float", startLocation: "w", endLocation: "s" });
    expect(arrowDirectionalTuples(clockwisePath, 10, 20)[0]).toEqual([-20, -10]);
    expect(arrowDirectionalTuples(counterPath, 10, 20)[0]).toEqual([-20, -10]);
  });
});

describe("calculateArrowAdjustment", () => {
  const files: Record<string, unknown> = {
    "special/placement_manifest.json": { from_layer1: ["A"] },
    "special/from_layer1/A_placements.json": {
      A: { "(0, 0)": { blue: [5, 7] } },
    },
    "default/default_pro_placements.json": { pro: { "0": [30, 40] } },
  };
  const load = (path: string) => files[path] ?? null;

  it("uses the letter's special placement, turned for the quadrant", () => {
    const p = pictograph({}, {});
    expect(calculateArrowAdjustment(p, p.leftMotion, "sw", load)).toEqual([-5, -7]);
  });

  it("falls back to the default table when the special entry is missing", () => {
    const p = pictograph({}, {});
    expect(calculateArrowAdjustment(p, p.rightMotion, "sw", load)).toEqual([-30, -40]);
  });

  it("skips special placement for a hand placed alone", () => {
    const p = pictograph({}, {});
    expect(calculateArrowAdjustment(p, p.leftMotion, "sw", load, { solo: true })).toEqual([
      -30, -40,
    ]);
  });
});

describe("rotation overrides", () => {
  const files: Record<string, unknown> = {
    "special/placement_manifest.json": { from_layer1: ["Φ"] },
    "special/from_layer1/Φ_placements.json": {
      Φ: { "(0, 0)": { static_rot_angle_override: true } },
    },
  };
  const load = (path: string) => files[path] ?? null;
  const p = pictograph(
    { motionType: "static", startLocation: "n", endLocation: "n" },
    { motionType: "dash", startLocation: "s", endLocation: "n" },
    { letter: "Φ" }
  );

  it("turns a flagged static arrow by the override map", () => {
    expect(hasRotationOverride(p, p.leftMotion, load)).toBe(true);
    expect(resolveArrowRotation(p, p.leftMotion, "n", load)).toBe(180);
  });

  it("leaves unflagged arrows and solo hands on their usual map", () => {
    expect(hasRotationOverride(p, p.rightMotion, load)).toBe(false);
    const usual = calculateArrowRotation("static", "n", "cw", "n", "n", true, 0);
    expect(resolveArrowRotation(p, p.leftMotion, "n", load, { solo: true })).toBe(usual);
  });
});

describe("float rotation", () => {
  it("follows the hand path's map, not the rotation direction", () => {
    expect(calculateArrowRotation("float", "w", "noRotation", "s", "w", true)).toBe(225);
    expect(calculateArrowRotation("float", "s", "noRotation", "w", "s", true)).toBe(315);
  });
});
