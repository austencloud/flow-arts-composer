import { describe, expect, it } from "vitest";
import type {
  MotionData,
  SequenceStep,
} from "../../src/core/types/sequence-engine-types.js";
import { gridPlacementDeriver } from "../../src/core/placements/GridPlacementDeriver.js";
import {
  DEFAULT_FLIPPED_AXIS,
  DEFAULT_MIRRORED_AXIS,
  REFLECTION_AXES,
  REFLECTION_LOCATION_MAPS,
  reflectLocation,
} from "../../src/loop/placement-maps/strict-loop-placement-maps.js";
import {
  LOOPComponent,
  getReflectionAxis,
  loopSpecFromLegacy,
  loopSpecFromWire,
  loopSpecToWire,
  symmetricSpec,
} from "../../src/loop/loop-spec.js";
import { determineEndPlacementForSpec } from "../../src/loop/targeting/LOOPEndPlacementSelector.js";
import { loopDetectorClass } from "../../src/loop/detection/LOOPDetector.js";
import { uniformHalvedRelation } from "../../src/loop/detection/pair-relation.js";

const EXPECTED_MAPS = {
  "north-south": {
    n: "n",
    ne: "nw",
    e: "w",
    se: "sw",
    s: "s",
    sw: "se",
    w: "e",
    nw: "ne",
    c: "c",
  },
  "east-west": {
    n: "s",
    ne: "se",
    e: "e",
    se: "ne",
    s: "n",
    sw: "nw",
    w: "w",
    nw: "sw",
    c: "c",
  },
  "northeast-southwest": {
    n: "e",
    ne: "ne",
    e: "n",
    se: "nw",
    s: "w",
    sw: "sw",
    w: "s",
    nw: "se",
    c: "c",
  },
  "northwest-southeast": {
    n: "w",
    ne: "sw",
    e: "s",
    se: "se",
    s: "e",
    sw: "ne",
    w: "n",
    nw: "nw",
    c: "c",
  },
} as const;

const CARDINAL = new Set(["n", "e", "s", "w"]);
const INTERCARDINAL = new Set(["ne", "se", "sw", "nw"]);

describe("four-axis reflection registry", () => {
  it("contains the exact map for every square reflection axis", () => {
    expect(REFLECTION_AXES).toEqual([
      "north-south",
      "east-west",
      "northeast-southwest",
      "northwest-southeast",
    ]);
    expect(REFLECTION_LOCATION_MAPS).toEqual(EXPECTED_MAPS);
  });

  it.each(REFLECTION_AXES)("%s is an involution", (axis) => {
    for (const location of Object.keys(EXPECTED_MAPS[axis])) {
      const reflected = reflectLocation(location, axis);
      expect(reflected).not.toBeNull();
      expect(reflectLocation(reflected!, axis)).toBe(location);
    }
  });

  it.each(REFLECTION_AXES)(
    "%s preserves Diamond and Box location membership",
    (axis) => {
      for (const location of CARDINAL) {
        expect(CARDINAL.has(reflectLocation(location, axis)!)).toBe(true);
      }
      for (const location of INTERCARDINAL) {
        expect(INTERCARDINAL.has(reflectLocation(location, axis)!)).toBe(true);
      }
    }
  );
});

describe("reflection axes in LOOPSpec", () => {
  it("round-trips an explicit diagonal axis through the wire format", () => {
    const spec = symmetricSpec(
      new Map([
        [
          LOOPComponent.MIRRORED,
          {
            period: 2,
            reflectionAxis: "northeast-southwest" as const,
          },
        ],
      ])
    );

    const roundTrip = loopSpecFromWire(loopSpecToWire(spec));
    expect(
      roundTrip.left?.components.get(LOOPComponent.MIRRORED)?.reflectionAxis
    ).toBe("northeast-southwest");
    expect(loopSpecToWire(roundTrip)).toEqual(loopSpecToWire(spec));
  });

  it("preserves Mirrored and Flipped compatibility defaults", () => {
    const mirrored = loopSpecFromLegacy("mirrored", 2);
    const flipped = loopSpecFromLegacy("flipped", 2);
    expect(
      getReflectionAxis(
        LOOPComponent.MIRRORED,
        mirrored.left!.components.get(LOOPComponent.MIRRORED)!
      )
    ).toBe(DEFAULT_MIRRORED_AXIS);
    expect(
      getReflectionAxis(
        LOOPComponent.FLIPPED,
        flipped.left!.components.get(LOOPComponent.FLIPPED)!
      )
    ).toBe(DEFAULT_FLIPPED_AXIS);
  });
});

describe("cross-grid reflection seam targeting", () => {
  it("applies an east-west reflection to a Box Gamma hand pair", () => {
    const start = gridPlacementDeriver.getGridPlacementFromLocations("se", "sw");
    const expected = gridPlacementDeriver.getGridPlacementFromLocations(
      "ne",
      "nw"
    );
    const spec = reflectionSpec("east-west");

    expect(determineEndPlacementForSpec(spec, start)).toBe(expected);
  });

  it("applies a northeast-southwest reflection to a Diamond Gamma hand pair", () => {
    const start = gridPlacementDeriver.getGridPlacementFromLocations("e", "s");
    const expected = gridPlacementDeriver.getGridPlacementFromLocations("n", "w");
    const spec = reflectionSpec("northeast-southwest");

    expect(determineEndPlacementForSpec(spec, start)).toBe(expected);
  });
});

describe("reflection-axis detection", () => {
  it("distinguishes both diagonal axes from the legacy vertical mirror", () => {
    const first = pair("e", "n", "s", "w");
    const second = pair("n", "e", "w", "s");

    expect(uniformHalvedRelation([first, second])).toMatchObject({
      components: ["mirrored"],
      reflectionAxis: "northeast-southwest",
    });
  });

  it("stores the detected diagonal axis in the rich LOOPSpec", () => {
    const steps = directReflectionSequence(
      ["e", "s"],
      ["n", "w"],
      "northeast-southwest"
    );
    const detected = loopDetectorClass.detectLOOPType(steps);

    expect(detected.isCircular).toBe(true);
    expect(detected.reflectionAxis).toBe("northeast-southwest");
    expect(
      detected.spec?.left?.components.get(LOOPComponent.MIRRORED)
        ?.reflectionAxis
    ).toBe("northeast-southwest");
  });

  it("detects the Box Gamma example as east-west reflection", () => {
    const steps = directReflectionSequence(
      ["se", "sw"],
      ["ne", "nw"],
      "east-west"
    );
    const detected = loopDetectorClass.detectLOOPType(steps);

    expect(detected.isCircular).toBe(true);
    expect(detected.reflectionAxis).toBe("east-west");
    expect(
      detected.spec?.left?.components.get(LOOPComponent.FLIPPED)?.reflectionAxis
    ).toBe("east-west");
  });
});

function reflectionSpec(
  reflectionAxis:
    | "north-south"
    | "east-west"
    | "northeast-southwest"
    | "northwest-southeast"
) {
  return symmetricSpec(
    new Map([[LOOPComponent.MIRRORED, { period: 2, reflectionAxis }]])
  );
}

function pair(
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string
) {
  return {
    left: {
      startLocation: leftStart,
      endLocation: leftEnd,
      motionType: "dash",
    },
    right: {
      startLocation: rightStart,
      endLocation: rightEnd,
      motionType: "dash",
    },
  };
}

function directReflectionSequence(
  start: readonly [string, string],
  reflected: readonly [string, string],
  axis:
    | "north-south"
    | "east-west"
    | "northeast-southwest"
    | "northwest-southeast"
): SequenceStep[] {
  const startPlacement = gridPlacementDeriver.getGridPlacementFromLocations(
    start[0],
    start[1]
  );
  const reflectedPosition = gridPlacementDeriver.getGridPlacementFromLocations(
    reflected[0],
    reflected[1]
  );

  return [
    step(0, startPlacement, startPlacement, start, start),
    step(1, startPlacement, reflectedPosition, start, reflected),
    step(2, reflectedPosition, startPlacement, reflected, [
      reflectLocation(reflected[0], axis)!,
      reflectLocation(reflected[1], axis)!,
    ]),
  ];
}

function step(
  stepNumber: number,
  startPlacement: string,
  endPlacement: string,
  start: readonly [string, string],
  end: readonly [string, string]
): SequenceStep {
  return {
    id: `reflection-${stepNumber}`,
    stepNumber,
    duration: 1,
    letter: null,
    startPlacement,
    endPlacement,
    motions: {
      left: motion(start[0], end[0]),
      right: motion(start[1], end[1]),
    },
  } as SequenceStep;
}

function motion(startLocation: string, endLocation: string): MotionData {
  return {
    motionType: startLocation === endLocation ? "static" : "dash",
    startLocation,
    endLocation,
    rotationDirection: startLocation === endLocation ? "noRotation" : "cw",
    startOrientation: "in",
    endOrientation: "in",
    turns: 0,
  } as MotionData;
}
