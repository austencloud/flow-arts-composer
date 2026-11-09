import { describe, expect, it } from "vitest";
import type { SVGPathData } from "#lib/shared/mandala/domain/mandala-types.js";
import { flowerPetalAnchor, turnedPetalAnchor } from "../flower-petal-anchor";

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

describe("turnedPetalAnchor", () => {
  it("swaps corners and sides on an odd count, and keeps them on an even one", () => {
    expect(turnedPetalAnchor("diagonal", 1)).toBe("cardinal");
    expect(turnedPetalAnchor("cardinal", 3)).toBe("diagonal");
    expect(turnedPetalAnchor("diagonal", 2)).toBe("diagonal");
    expect(turnedPetalAnchor("cardinal", 0)).toBe("cardinal");
  });

  it("has nothing to turn when the petals have no anchor", () => {
    expect(turnedPetalAnchor(null, 1)).toBeNull();
  });
});
