import { describe, expect, it } from "vitest";
import { joinedGridPointColors3D } from "../../../src/lib/shared/3d/services/joined-grid-points-3d";

const colors = { left: "#3b82f6", right: "#ef4444" };

describe("joined grid point ownership in meters", () => {
  it("draws the shared hand point once at two steps", () => {
    const points = joinedGridPointColors3D(
      { toward: "e", steps: 2 },
      "diamond",
      0.52,
      1.04,
      colors
    );
    expect(points.left.has("hand:e")).toBe(true);
    expect(points.right.has("hand:w")).toBe(false);
    expect(points.left.get("hand:e")).not.toBe(points.left.get("hand:n"));
    expect(points.left.has("hand:w")).toBe(true);
    expect(points.right.has("hand:e")).toBe(true);
  });

  it("does not merge meter-spaced points using card-unit tolerances", () => {
    const points = joinedGridPointColors3D(
      { toward: "n", steps: 1 },
      "diamond",
      0.52,
      1.04,
      colors
    );
    expect(points.left.get("center:c")).toBe(points.right.get("hand:s"));
    expect(points.right.get("center:c")).toBe(points.left.get("hand:n"));
    expect(points.left.has("outer:n")).toBe(false);
    expect(points.right.has("outer:s")).toBe(false);
    expect(points.left.has("outer:w")).toBe(true);
    expect(points.right.has("outer:e")).toBe(true);
  });

  it("uses diagonal hand points on box grids at any world scale", () => {
    const small = joinedGridPointColors3D(
      { toward: "ne", steps: 2 },
      "box",
      0.26,
      0.52,
      colors
    );
    const large = joinedGridPointColors3D(
      { toward: "ne", steps: 2 },
      "box",
      1.04,
      2.08,
      colors
    );
    expect(small).toEqual(large);
    expect(small.left.has("hand:ne")).toBe(true);
    expect(small.right.has("hand:sw")).toBe(false);
    expect(small.right.has("hand:se")).toBe(true);
  });
});
