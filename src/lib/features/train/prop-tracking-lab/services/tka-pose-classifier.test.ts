import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { TkaPoseClassifier } from "./tka-pose-classifier";
import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

const c = new TkaPoseClassifier();

describe("TkaPoseClassifier.classifyLocation", () => {
  it("maps the four cardinals (X=East, Y=North)", () => {
    expect(c.classifyLocation(new Vector3(0, 1, 0))).toBe("n");
    expect(c.classifyLocation(new Vector3(1, 0, 0))).toBe("e");
    expect(c.classifyLocation(new Vector3(0, -1, 0))).toBe("s");
    expect(c.classifyLocation(new Vector3(-1, 0, 0))).toBe("w");
  });

  it("maps the four intercardinals", () => {
    expect(c.classifyLocation(new Vector3(1, 1, 0))).toBe("ne");
    expect(c.classifyLocation(new Vector3(1, -1, 0))).toBe("se");
    expect(c.classifyLocation(new Vector3(-1, -1, 0))).toBe("sw");
    expect(c.classifyLocation(new Vector3(-1, 1, 0))).toBe("nw");
  });

  it("ignores Z (depth) and small radius noise", () => {
    expect(c.classifyLocation(new Vector3(0.02, 0.98, 0.7))).toBe("n");
  });

  it("snaps near-boundary angles to the nearest 45deg bucket", () => {
    expect(
      c.classifyLocation(new Vector3(Math.sin(0.35), Math.cos(0.35), 0))
    ).toBe("n");
    expect(
      c.classifyLocation(new Vector3(Math.sin(0.6), Math.cos(0.6), 0))
    ).toBe("ne");
  });
});

describe("TkaPoseClassifier.classifyOrientation", () => {
  it("shaft pointing away from center = OUT", () => {
    const grip = new Vector3(0, 1, 0);
    const axisOut = new Vector3(0, 1, 0); // points further out (north)
    expect(c.classifyOrientation(grip, axisOut)).toBe(Orientation.OUT);
  });

  it("shaft pointing toward center = IN", () => {
    const grip = new Vector3(0, 1, 0);
    const axisIn = new Vector3(0, -1, 0); // points back toward center
    expect(c.classifyOrientation(grip, axisIn)).toBe(Orientation.IN);
  });

  it("shaft perpendicular, tangent toward +East at North = CLOCK", () => {
    const grip = new Vector3(0, 1, 0);
    const axisTangentCW = new Vector3(1, 0, 0);
    expect(c.classifyOrientation(grip, axisTangentCW)).toBe(Orientation.CLOCK);
  });

  it("shaft perpendicular, tangent toward -East at North = COUNTER", () => {
    const grip = new Vector3(0, 1, 0);
    const axisTangentCCW = new Vector3(-1, 0, 0);
    expect(c.classifyOrientation(grip, axisTangentCCW)).toBe(
      Orientation.COUNTER
    );
  });

  it("ignores the out-of-plane (Z) component of the shaft", () => {
    const grip = new Vector3(0, 1, 0);
    const axisOutTilted = new Vector3(0, 1, 0.5); // tilted toward camera but radial in-plane
    expect(c.classifyOrientation(grip, axisOutTilted)).toBe(Orientation.OUT);
  });
});

import { MotionType } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

describe("TkaPoseClassifier.classifyHandMotion", () => {
  it("same location = static", () => {
    expect(c.classifyHandMotion("n", "n")).toBe("static");
  });
  it("adjacent (45deg) = shift", () => {
    expect(c.classifyHandMotion("n", "ne")).toBe("shift");
    expect(c.classifyHandMotion("e", "n")).toBe("shift");
  });
  it("opposite (180deg) = dash", () => {
    expect(c.classifyHandMotion("n", "s")).toBe("dash");
    expect(c.classifyHandMotion("ne", "sw")).toBe("dash");
  });
  it("90deg cardinal-to-cardinal counts as a shift (diamond adjacency)", () => {
    expect(c.classifyHandMotion("n", "e")).toBe("shift");
  });
});

describe("TkaPoseClassifier.classifyShiftType", () => {
  it("prop rotates WITH the arc (propNet ~= arc) = pro", () => {
    expect(c.classifyShiftType(Math.PI / 2, Math.PI / 2)).toBe(MotionType.PRO);
  });
  it("prop rotates AGAINST the arc (propNet ~= -arc) = anti", () => {
    expect(c.classifyShiftType(Math.PI / 2, -Math.PI / 2)).toBe(
      MotionType.ANTI
    );
  });
  it("prop holds absolute angle (propNet ~= 0) = float", () => {
    expect(c.classifyShiftType(Math.PI / 2, 0)).toBe(MotionType.FLOAT);
  });
  it("pro with extra spin still classifies pro (sign matches arc)", () => {
    expect(c.classifyShiftType(Math.PI / 2, Math.PI / 2 + 2 * Math.PI)).toBe(
      MotionType.PRO
    );
  });
});

import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { StaffPose3D } from "../domain/notation-3d";

function pose(grip: Vector3, axis: Vector3): StaffPose3D {
  return { gripPos: grip, axisDir: axis };
}

describe("TkaPoseClassifier.classifyMotion (full per-staff notation)", () => {
  it("static, no spin = static motion, 0 turns", () => {
    const start = pose(new Vector3(0, 1, 0), new Vector3(0, 1, 0));
    const end = pose(new Vector3(0, 1, 0), new Vector3(0, 1, 0));
    const n = c.classifyMotion("left", start, end, 0, 0, 1);
    expect(n.handMotion).toBe("static");
    expect(n.motionType).toBe(MotionType.STATIC);
    expect(n.turns).toBe(0);
    expect(n.startLocation).toBe("n");
    expect(n.endLocation).toBe("n");
  });

  it("dash N->S with one extra turn of spin", () => {
    const start = pose(new Vector3(0, 1, 0), new Vector3(0, 1, 0));
    const end = pose(new Vector3(0, -1, 0), new Vector3(0, -1, 0));
    const n = c.classifyMotion("left", start, end, 0, Math.PI, 1);
    expect(n.handMotion).toBe("dash");
    expect(n.motionType).toBe(MotionType.DASH);
    expect(n.turns).toBe(1);
    expect(n.rotationDirection).toBe(RotationDirection.COUNTER_CLOCKWISE);
  });

  it("pro shift N->E at base rotation = 0 turns", () => {
    const start = pose(new Vector3(0, 1, 0), new Vector3(0, 1, 0));
    const end = pose(new Vector3(1, 0, 0), new Vector3(1, 0, 0));
    const n = c.classifyMotion(
      "left",
      start,
      end,
      -Math.PI / 2,
      -Math.PI / 2,
      1
    );
    expect(n.handMotion).toBe("shift");
    expect(n.motionType).toBe(MotionType.PRO);
    expect(n.turns).toBe(0);
  });

  it("anti shift with a half extra turn rounds turns to 0.5", () => {
    const start = pose(new Vector3(0, 1, 0), new Vector3(0, 1, 0));
    const end = pose(new Vector3(1, 0, 0), new Vector3(1, 0, 0));
    const n = c.classifyMotion("left", start, end, -Math.PI / 2, Math.PI, 1);
    expect(n.motionType).toBe(MotionType.ANTI);
    expect(n.turns).toBe(0.5);
  });

  it("carries the lowest confidence over the beat span", () => {
    const p = pose(new Vector3(0, 1, 0), new Vector3(0, 1, 0));
    const n = c.classifyMotion("right", p, p, 0, 0, 0.42);
    expect(n.confidence).toBeCloseTo(0.42, 5);
    expect(n.hand).toBe("right");
  });
});
