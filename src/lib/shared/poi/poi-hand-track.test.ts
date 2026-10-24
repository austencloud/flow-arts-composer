import { describe, expect, it } from "vitest";
import { CAPS, capStrip } from "#lib/shared/guide-topics/caps-topic.js";
import {
  DEFAULT_POI_STRING_OPTIONS,
  poiHandTrack3D,
  poiPlanePointTo3D,
  solvePoiHandPaths,
} from "./poi-hand-track.js";

const at = (
  plane: "wall" | "wheel" | "floor",
  x: number,
  y: number,
  yaw = 0
) => {
  const out = new Float64Array(3);
  poiPlanePointTo3D(plane, x, y, { origin: { x: 0, y: 1.4, z: 0 }, yaw }, out);
  return Array.from(out);
};

describe("poiPlanePointTo3D", () => {
  // The solver draws on canvas axes, y down: the top of the circle is -y.
  it("puts the top of a wall-plane circle above the hand", () => {
    const [x, y, z] = at("wall", 0, -0.5);
    expect(x).toBeCloseTo(0);
    expect(y).toBeCloseTo(1.9);
    expect(z).toBeCloseTo(0);
  });

  it("lays the wheel plane across the performer and the floor plane flat", () => {
    const wheel = at("wheel", 0.5, -0.5);
    expect(wheel[0]).toBeCloseTo(0);
    expect(wheel[1]).toBeCloseTo(1.9);
    expect(wheel[2]).toBeCloseTo(0.5);
    const floor = at("floor", 0.5, -0.5);
    expect(floor[1]).toBeCloseTo(1.4);
  });

  it("turns with the performer", () => {
    const [x, , z] = at("wall", -0.5, 0, Math.PI / 2);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-0.5);
  });
});

describe("poiHandTrack3D", () => {
  it("matches the plane solve in the wall plane when the hand is in reach", () => {
    const motions = capStrip(CAPS.find((c) => c.id === "1-EE")!)
      .slice(1)
      .map((step) => step.motions.right!);
    const solve = solvePoiHandPaths(motions, DEFAULT_POI_STRING_OPTIONS);
    const track = poiHandTrack3D(solve, "wall", DEFAULT_POI_STRING_OPTIONS);
    let worst = 0;
    for (let i = 0; i < solve.handX.length; i++) {
      worst = Math.max(
        worst,
        Math.hypot(
          track.hand[i * 3]! + solve.handX[i]!,
          track.hand[i * 3 + 1]! + solve.handY[i]!,
          track.hand[i * 3 + 2]!
        )
      );
    }
    expect(worst).toBeLessThan(0.01);
  });
});
