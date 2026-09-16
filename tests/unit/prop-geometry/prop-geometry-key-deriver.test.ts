import { describe, it, expect } from "vitest";
import { derivePropGeometryKey } from "$lib/shared/pictograph/arrow/positioning/prop-geometry/domain/prop-geometry-key-deriver";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";

function makeMotion(over: Partial<MotionData> = {}): MotionData {
  return {
    hand: "left",
    motionType: "anti",
    startLocation: "w",
    endLocation: "n",
    startOrientation: "in",
    endOrientation: "out",
    rotationDirection: "ccw",
    turns: 1.5,
    propType: "staff",
    gridMode: "diamond",
    ...over,
  } as MotionData;
}

function makePictograph(left: MotionData, right: MotionData): PictographData {
  return {
    id: "t",
    letter: "Q",
    startPlacement: "gamma1",
    endPlacement: "gamma15",
    motions: { left, right },
  } as PictographData;
}

describe("derivePropGeometryKey", () => {
  it("builds a 9-dimension key from left motion context", () => {
    const left = makeMotion();
    const right = makeMotion({
      hand: "right",
      motionType: "static",
      endOrientation: "in",
      turns: 0,
    });
    const key = derivePropGeometryKey(
      makePictograph(left, right),
      left,
      "left"
    );
    expect(key).toEqual({
      placementFrame: "canonical",
      propType: "staff",
      otherPropType: "staff",
      positionType: "gamma",
      endOrientation: "out",
      otherEndOrientation: "in",
      motionType: "anti",
      turns: "1.5",
      arrowColor: "left",
    });
  });

  it("uses the motion hand when no explicit hand is passed", () => {
    const left = makeMotion({ propType: "staff" });
    const right = makeMotion({
      hand: "right",
      propType: "fan",
      motionType: "static",
      endOrientation: "clock",
      turns: 0,
    });

    expect(
      derivePropGeometryKey(makePictograph(left, right), left)
    ).toMatchObject({
      propType: "staff",
      otherPropType: "fan",
      arrowColor: "left",
    });
    expect(
      derivePropGeometryKey(makePictograph(left, right), right)
    ).toMatchObject({
      propType: "fan",
      otherPropType: "staff",
      arrowColor: "right",
    });
  });

  it("normalizes legacy color arguments at the compatibility boundary", () => {
    const left = makeMotion();
    const right = makeMotion({ hand: "right", propType: "fan" });

    expect(
      derivePropGeometryKey(makePictograph(left, right), left, "blue")
        ?.arrowColor
    ).toBe("left");
    expect(
      derivePropGeometryKey(makePictograph(left, right), right, "red")
        ?.arrowColor
    ).toBe("right");
  });

  it("returns null when endPlacement is missing", () => {
    const left = makeMotion();
    const right = makeMotion({ hand: "right" });
    const pg = makePictograph(left, right);
    (pg as { endPlacement?: string }).endPlacement = undefined;
    expect(derivePropGeometryKey(pg, left, "left")).toBeNull();
  });

  it("returns null when a motion is absent", () => {
    const left = makeMotion();
    const pg = {
      id: "t",
      letter: "Q",
      startPlacement: "a",
      endPlacement: "beta5",
      motions: { left },
    } as unknown as PictographData;
    expect(derivePropGeometryKey(pg, left, "left")).toBeNull();
  });
});
