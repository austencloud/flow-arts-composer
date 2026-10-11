import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { AvatarAnimator } from "../../../node_modules/@austencloud/scene-3d/src/lib/services/implementations/AvatarAnimator";
import { MAX_STANCE_YAW_RAD } from "#lib/shared/3d/collision/upper-body-stance-planner.js";

/**
 * The stance blade is one open-loop pass: it measures the yaw the pose already
 * carries and turns the spine by the remainder. The remainder is a delta, and
 * it used to be bounded by `MAX_STANCE_YAW`, whose own doc comment calls it the
 * stance yaw *input* clamp. Those are different quantities.
 *
 * SpineTwister runs before the blade and on several catalog rigs turns the
 * chest the opposite way from the request, so the blade starts from roughly
 * -20 degrees while the planner asks for +87. The delta it needs is 107, the
 * clamp handed back 90, and the frame rendered 70 - Austen's "he has not turned
 * his torso to be 90 degrees all the way". Measured on main at 4a55798fb8:
 *
 *   rig    requested  pre-blade chest  delta needed  delta applied  rendered
 *   ch18       -87          +20.37        -107.37         -90        -69.70
 *   ch01       -87          +20.20        -107.20         -90        -69.64
 *   ch41       -87          +20.38        -107.38         -90        -69.54
 *   ch07       -87           +2.81         -89.81       -89.81       -87.06
 *   intake     -87           -4.27         -82.73       -82.73       -87.00
 *
 * The shortfall is exactly `|delta needed| - 90` wherever the clamp bit, and
 * zero everywhere it did not - a saturation, not a per-rig deficit. ch07 and
 * intake never tripped it, which is why the control rig always looked correct.
 */

const packageFile = (path: string) =>
  readFileSync(
    resolve(process.cwd(), "node_modules/@austencloud/scene-3d", path),
    "utf8"
  );

type StanceProbe = {
  resolveStanceYawCorrection(
    requestedYawRad: number,
    referenceForward: Vector3,
    achievedForward: Vector3
  ): number;
};

const probe = () =>
  new AvatarAnimator({} as never, {} as never) as unknown as StanceProbe;

const deg = (value: number) => (value * Math.PI) / 180;
const toDeg = (value: number) => (value * 180) / Math.PI;

/** The reference forward the animator captures once per root: rig-local +Z. */
const REFERENCE = new Vector3(0, 0, 1);

/** The forward a chest already bladed by `yawDeg` presents to that reference. */
const chestForward = (yawDeg: number) =>
  new Vector3(Math.sin(deg(yawDeg)), 0, Math.cos(deg(yawDeg)));

/** The angle the blade will actually be sitting at once `correction` is applied. */
const settled = (preBladeDeg: number, correctionRad: number) => {
  const total = preBladeDeg + toDeg(correctionRad);
  return total - 360 * Math.round(total / 360);
};

describe("stance yaw delivery", () => {
  it("delivers the requested stance from a chest the twist turned the other way", () => {
    const animator = probe();

    // The three rigs that under-delivered, at their measured pre-blade chests.
    for (const [requestedDeg, preBladeDeg] of [
      [-87, 20.37],
      [-87, 20.2],
      [-87, 20.38],
      [87, -20.38],
      [87, -20.18],
      [87, -20.41],
    ]) {
      const correction = animator.resolveStanceYawCorrection(
        deg(requestedDeg),
        REFERENCE,
        chestForward(preBladeDeg)
      );

      // The delta genuinely exceeds a quarter turn here. Bounding it at 90
      // degrees is what left 17 degrees on the table.
      expect(Math.abs(toDeg(correction))).toBeGreaterThan(90);
      expect(settled(preBladeDeg, correction)).toBeCloseTo(requestedDeg, 6);
    }
  });

  it("leaves the rigs that never saturated exactly where they already were", () => {
    const animator = probe();

    // ch07 and the intake control rig. Their deltas fit inside a quarter turn,
    // so the fix must be a no-op for them.
    for (const [requestedDeg, preBladeDeg] of [
      [-87, 2.81],
      [-87, -4.27],
      [87, -1.7],
      [87, 4.27],
    ]) {
      const correction = animator.resolveStanceYawCorrection(
        deg(requestedDeg),
        REFERENCE,
        chestForward(preBladeDeg)
      );
      expect(toDeg(correction)).toBeCloseTo(requestedDeg - preBladeDeg, 6);
    }
  });

  it("lands on the request across the whole stance range the planner can ask for", () => {
    const animator = probe();

    for (let requestedDeg = -87; requestedDeg <= 87; requestedDeg += 3) {
      for (let preBladeDeg = -60; preBladeDeg <= 60; preBladeDeg += 5) {
        const correction = animator.resolveStanceYawCorrection(
          deg(requestedDeg),
          REFERENCE,
          chestForward(preBladeDeg)
        );
        expect(settled(preBladeDeg, correction)).toBeCloseTo(requestedDeg, 6);
      }
    }
  });

  it("returns the short way around rather than a delta past a half turn", () => {
    const animator = probe();

    // `requested - atan2(...)` reaches 267 degrees on its own. Handing that to
    // the spine would wind the chest the long way around to the same pose.
    for (const preBladeDeg of [-179, -120, 120, 179]) {
      for (const requestedDeg of [-87, 87]) {
        const correction = animator.resolveStanceYawCorrection(
          deg(requestedDeg),
          REFERENCE,
          chestForward(preBladeDeg)
        );
        expect(Math.abs(toDeg(correction))).toBeLessThanOrEqual(180 + 1e-9);
        expect(settled(preBladeDeg, correction)).toBeCloseTo(requestedDeg, 6);
      }
    }
  });

  it("still bounds the requested stance itself, not the correction", () => {
    const animator = probe();

    // A caller asking past the animator's own stance ceiling is clamped on the
    // way in, exactly as `setStanceYaw` clamps it. The app never asks for this
    // - the shared planner tops out at 87 - but the ceiling has to survive.
    const correction = animator.resolveStanceYawCorrection(
      deg(140),
      REFERENCE,
      chestForward(0)
    );
    expect(toDeg(correction)).toBeCloseTo(90, 6);
    expect(toDeg(MAX_STANCE_YAW_RAD)).toBeCloseTo(87, 6);
  });

  it("ships the delta form in source and runtime", () => {
    for (const code of [
      packageFile("src/lib/services/implementations/AvatarAnimator.ts"),
      packageFile("dist/lib/services/implementations/AvatarAnimator.js"),
    ]) {
      // The correction wraps into a half turn instead of saturating against
      // the stance ceiling.
      expect(code).toMatch(
        /return delta - Math\.PI \* 2 \* Math\.round\(delta \/ \(Math\.PI \* 2\)\)/
      );
      // The old shape: the returned delta itself squeezed through the input
      // clamp. Any rig whose twist opposed the request lost the difference.
      expect(code).not.toMatch(
        /Math\.min\(MAX_STANCE_YAW,\s*requestedYawRad - achievedYaw\)/
      );
    }
  });
});
