import { describe, expect, it } from "vitest";
import type { SVGPathData } from "#lib/shared/mandala/domain/mandala-types.js";
import { flowerPetalAnchor, flowerPetalMarks } from "../flower-petal-anchor";

function path(...anglesAndRadii: readonly [number, number][]): SVGPathData {
  return {
    d: "",
    tipIndex: 0,
    beats: [
      anglesAndRadii.map(([degrees, radius]) => ({
        x: radius * Math.cos((degrees * Math.PI) / 180),
        y: radius * Math.sin((degrees * Math.PI) / 180),
      })),
    ],
  };
}

const onAxes = [0, 90, 180, 270];
const onCorners = [45, 135, 225, 315];
const ring = (angles: readonly number[], radius: number) =>
  angles.map((angle): [number, number] => [angle, radius]);

describe("flowerPetalAnchor", () => {
  it("reads an antispin petal at the farthest points", () => {
    const axesFar = path(...ring(onAxes, 100), ...ring(onCorners, 20));
    const cornersFar = path(...ring(onCorners, 100), ...ring(onAxes, 20));
    expect(flowerPetalAnchor([axesFar], "anti")).toBe("cardinal");
    expect(flowerPetalAnchor([cornersFar], "anti")).toBe("diagonal");
  });

  it("reads an inspin petal at the nearest points", () => {
    const axesFar = path(...ring(onAxes, 100), ...ring(onCorners, 20));
    const cornersFar = path(...ring(onCorners, 100), ...ring(onAxes, 20));
    expect(flowerPetalAnchor([axesFar], "pro")).toBe("diagonal");
    expect(flowerPetalAnchor([cornersFar], "pro")).toBe("cardinal");
  });

  it("allows a few degrees either way", () => {
    const nearlyOnAxes = path(
      [8, 100],
      [98, 100],
      [172, 100],
      [262, 100],
      [45, 20]
    );
    expect(flowerPetalAnchor([nearlyOnAxes], "anti")).toBe("cardinal");
  });

  it("names nothing when the petals point both ways", () => {
    const eight = path(...ring([...onAxes, ...onCorners], 100), [22, 20]);
    expect(flowerPetalAnchor([eight], "anti")).toBeNull();
  });

  it("names nothing when the petals sit between the two", () => {
    const between = path(...ring([22, 112, 202, 292], 100), [0, 20]);
    expect(flowerPetalAnchor([between], "anti")).toBeNull();
  });

  it("names nothing without a path", () => {
    expect(flowerPetalAnchor([], "pro")).toBeNull();
  });
});

describe("flowerPetalMarks", () => {
  const expectAngles = (actual: readonly number[], expected: number[]) => {
    expect(actual).toHaveLength(expected.length);
    expected.forEach((angle, index) =>
      expect(actual[index]).toBeCloseTo(angle, 5)
    );
  };

  it("marks four far points on the axes at their tips", () => {
    const flower = path(...ring(onAxes, 100), ...ring(onCorners, 20));
    const marks = flowerPetalMarks([flower], "anti", 4)!;
    expectAngles(marks.angles, [-90, 0, 90, 180]);
    expect(marks.reach).toBe(100);
    for (const point of marks.points) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(100, 5);
    }
  });

  it("marks four far points on the diagonals at their tips", () => {
    const flower = path(...ring(onCorners, 100), ...ring(onAxes, 20));
    const marks = flowerPetalMarks([flower], "anti", 4)!;
    expectAngles(marks.angles, [-135, -45, 45, 135]);
    expect(marks.points[3]!.x).toBeCloseTo(-100 * Math.SQRT1_2, 5);
    expect(marks.points[3]!.y).toBeCloseTo(100 * Math.SQRT1_2, 5);
  });

  it("marks three petals, evenly spaced", () => {
    const flower = path(
      ...ring([90, 210, 330], 100),
      ...ring([30, 150, 270], 20)
    );
    expectAngles(
      flowerPetalMarks([flower], "anti", 3)!.angles,
      [-150, -30, 90]
    );
  });

  it("marks an inner loop on a ring at half the reach", () => {
    const flower = path(...ring(onCorners, 10), ...ring(onAxes, 100));
    const marks = flowerPetalMarks([flower], "pro", 4)!;
    expectAngles(marks.angles, [-135, -45, 45, 135]);
    for (const point of marks.points) {
      expect(Math.hypot(point.x, point.y)).toBeCloseTo(50, 5);
    }
  });

  it("keeps a real inner point that reaches far enough out", () => {
    const flower = path(...ring(onCorners, 40), ...ring(onAxes, 100));
    const marks = flowerPetalMarks([flower], "pro", 4)!;
    expect(Math.hypot(marks.points[0]!.x, marks.points[0]!.y)).toBeCloseTo(
      40,
      5
    );
  });

  it("makes one mark per petal when a petal's points fan out", () => {
    const flower = path(
      ...ring([78, 90, 102, -158, -146, -34, -22], 5),
      ...ring([30, 150, 270], 100)
    );
    expectAngles(flowerPetalMarks([flower], "pro", 3)!.angles, [-150, -30, 90]);
  });

  it("marks nothing without petals or a path", () => {
    const flower = path(...ring(onAxes, 100), [45, 20]);
    expect(flowerPetalMarks([flower], "pro", 0)).toBeNull();
    expect(flowerPetalMarks([], "anti", 4)).toBeNull();
  });

  it("marks nothing when the points disagree about where the petals sit", () => {
    const scattered = path(...ring([0, 22.5, 45, 67.5], 100), [10, 20]);
    expect(flowerPetalMarks([scattered], "anti", 4)).toBeNull();
  });
});
