import { describe, it, expect } from "vitest";
import { Vector3 } from "three";
import { restPoseFromHeight } from "#lib/features/lab/tabs/collision-lab/services/stance-simulator.js";
import { SweptTube } from "./swept-tube";
import { planVacate } from "./dodge-vacate-planner";
import type { SweepSample } from "./dodge-types";

const body = restPoseFromHeight(1.8);

/** A vertical staff at (x,y,z), shaft ±halfLen along Y (chest-height sweep). */
function vstaff(x: number, z: number, halfLen = 0.43): SweepSample {
  const grip = new Vector3(x, 0, z);
  return {
    gripWorld: grip,
    tipAWorld: grip.clone().add(new Vector3(0, halfLen, 0)),
    tipBWorld: grip.clone().add(new Vector3(0, -halfLen, 0)),
    radius: 0.012,
  };
}

/** A sweep that travels along +X across the front of the body (z≈0.3). */
function sweepAlongX(): { left: SweptTube; right: SweptTube } {
  const left: SweepSample[] = [];
  const right: SweepSample[] = [];
  for (let i = 0; i < 12; i++) {
    const f = i / 11;
    left.push(vstaff(-0.3 + 0.6 * f, 0.3));
    right.push(vstaff(-0.3 + 0.6 * f, 0.3));
  }
  return { left: new SweptTube(left), right: new SweptTube(right) };
}

describe("planVacate", () => {
  it("is deterministic — same input twice gives identical output", () => {
    const { left, right } = sweepAlongX();
    const a = planVacate(left, right, body, { side: "auto", aggression: 0.6 });
    const b = planVacate(left, right, body, { side: "auto", aggression: 0.6 });
    expect(a.placement).toEqual(b.placement);
  });

  it("faces the grid center", () => {
    const { left, right } = sweepAlongX();
    const p = planVacate(left, right, body, { side: "auto", aggression: 0.6 }).placement;
    const expected = Math.atan2(-p.footOffsetX, -p.footOffsetZ);
    expect(Math.abs(p.rootYawRad - expected)).toBeLessThan(1e-6);
  });

  it("steps off the sweep line (does not stand on the props)", () => {
    const { left, right } = sweepAlongX();
    const p = planVacate(left, right, body, { side: "auto", aggression: 0.6 }).placement;
    // The sweep runs along z=0.3; vacating means stepping to a different z
    // (or far enough in x to clear), never staying on the swept line.
    const footOnSweepLine = Math.abs(p.footOffsetZ - 0.3) < 0.05 &&
      p.footOffsetX > -0.4 && p.footOffsetX < 0.4;
    expect(footOnSweepLine).toBe(false);
  });

  it("side knob flips the chosen quadrant on a symmetric sweep", () => {
    const { left, right } = sweepAlongX();
    const leftPlan = planVacate(left, right, body, { side: "left", aggression: 0.6 }).placement;
    const rightPlan = planVacate(left, right, body, { side: "right", aggression: 0.6 }).placement;
    // Opposite sides → opposite sign on the vacate axis (here the z step).
    expect(Math.sign(leftPlan.footOffsetZ)).toBe(-Math.sign(rightPlan.footOffsetZ));
  });

  it("aggression increases the step distance (up to the reach bound)", () => {
    const { left, right } = sweepAlongX();
    const low = planVacate(left, right, body, { side: "left", aggression: 0.1 }).placement;
    const high = planVacate(left, right, body, { side: "left", aggression: 1.0 }).placement;
    const dLow = Math.hypot(low.footOffsetX, low.footOffsetZ);
    const dHigh = Math.hypot(high.footOffsetX, high.footOffsetZ);
    expect(dHigh).toBeGreaterThanOrEqual(dLow);
  });

  it("keeps both grips within arm reach (hands are the hard constraint)", () => {
    const { left, right } = sweepAlongX();
    const res = planVacate(left, right, body, { side: "auto", aggression: 1.0 });
    const p = res.placement;
    const reach = body.upperArmLength + body.forearmLength;
    // Shoulders sit at the stepped root + rest shoulder offsets, at shoulder
    // height. Worst grip must be within reach (+ a small shrug/lean tolerance).
    const lsh = new Vector3(p.footOffsetX + body.leftShoulder.x, body.leftShoulder.y, p.footOffsetZ);
    const rsh = new Vector3(p.footOffsetX + body.rightShoulder.x, body.rightShoulder.y, p.footOffsetZ);
    const grips = [left.centroid(), right.centroid()];
    const worst = Math.max(
      ...grips.map((g) => Math.min(lsh.distanceTo(g), rsh.distanceTo(g)))
    );
    expect(worst).toBeLessThanOrEqual(reach + 0.15);
  });

  it("degenerate (static) sweep → face-center neutral, no NaN", () => {
    const stat = new SweptTube([vstaff(0.5, 0.3), vstaff(0.5, 0.3)]);
    const p = planVacate(stat, stat, body, { side: "auto", aggression: 0.6 }).placement;
    expect(Number.isFinite(p.footOffsetX)).toBe(true);
    expect(Number.isFinite(p.rootYawRad)).toBe(true);
    expect(Number.isFinite(p.torsoTwistRad)).toBe(true);
  });
});
