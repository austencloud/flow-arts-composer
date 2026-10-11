import { describe, it, expect } from "vitest";
import { Vector3, Quaternion } from "three";
import { computeClavicleRotation } from "#lib/shared/3d/services/clavicle-raiser.js";

function angleDegrees(q: Quaternion): number {
  const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
  return (angle * 180) / Math.PI;
}

function expectUnitQuaternion(q: Quaternion) {
  expect(q.length()).toBeCloseTo(1, 4);
}

function expectIdentity(q: Quaternion) {
  expect(q.w).toBeCloseTo(1, 3);
  expect(q.x).toBeCloseTo(0, 3);
  expect(q.y).toBeCloseTo(0, 3);
  expect(q.z).toBeCloseTo(0, 3);
}

describe("ClavicleRaiser", () => {
  const shoulderRestY = 1.4;
  const armLength = 0.55;

  describe("hand below shoulder: no rotation", () => {
    it("hand at waist height", () => {
      const q = computeClavicleRotation(
        new Vector3(0.3, 0.9, 0), "left", shoulderRestY, armLength
      );
      expectIdentity(q);
    });

    it("hand at shoulder height", () => {
      const q = computeClavicleRotation(
        new Vector3(0.3, shoulderRestY, 0), "left", shoulderRestY, armLength
      );
      expectIdentity(q);
    });
  });

  describe("activation threshold: setting phase", () => {
    it("hand slightly above shoulder: still no rotation (within setting phase)", () => {
      const q = computeClavicleRotation(
        new Vector3(0, shoulderRestY + armLength * 0.1, 0),
        "left", shoulderRestY, armLength
      );
      expectIdentity(q);
    });

    it("hand just past threshold: small but nonzero rotation", () => {
      const q = computeClavicleRotation(
        new Vector3(0, shoulderRestY + armLength * 0.25, 0),
        "left", shoulderRestY, armLength
      );
      expectUnitQuaternion(q);
      const angle = angleDegrees(q);
      expect(angle).toBeGreaterThan(0);
      expect(angle).toBeLessThan(5);
    });
  });

  describe("overhead positions", () => {
    it("hand well above shoulder: significant rotation", () => {
      const q = computeClavicleRotation(
        new Vector3(0, shoulderRestY + armLength * 0.6, 0),
        "left", shoulderRestY, armLength
      );
      expectUnitQuaternion(q);
      const angle = angleDegrees(q);
      expect(angle).toBeGreaterThan(3);
      expect(angle).toBeLessThan(15);
    });

    it("hand at maximum reach: capped at 15 degrees", () => {
      const q = computeClavicleRotation(
        new Vector3(0, shoulderRestY + armLength, 0),
        "left", shoulderRestY, armLength
      );
      expectUnitQuaternion(q);
      const angle = angleDegrees(q);
      expect(angle).toBeCloseTo(15, 0);
    });

    it("hand beyond maximum reach: still capped at 15 degrees", () => {
      const q = computeClavicleRotation(
        new Vector3(0, shoulderRestY + armLength * 1.5, 0),
        "left", shoulderRestY, armLength
      );
      expectUnitQuaternion(q);
      const angle = angleDegrees(q);
      expect(angle).toBeCloseTo(15, 0);
    });
  });

  describe("left vs right: opposite rotation directions", () => {
    it("same elevation produces opposite X-axis rotations", () => {
      const leftQ = computeClavicleRotation(
        new Vector3(0, shoulderRestY + armLength * 0.6, 0),
        "left", shoulderRestY, armLength
      );
      const rightQ = computeClavicleRotation(
        new Vector3(0, shoulderRestY + armLength * 0.6, 0),
        "right", shoulderRestY, armLength
      );
      expect(angleDegrees(leftQ)).toBeCloseTo(angleDegrees(rightQ), 1);
      // Rotation around X axis: the X component of the quaternion carries the sign
      expect(Math.sign(leftQ.x)).not.toBe(Math.sign(rightQ.x));
    });
  });

  describe("all results are unit quaternions", () => {
    const positions = [
      new Vector3(0, 0.5, 0),
      new Vector3(0, shoulderRestY, 0),
      new Vector3(0, shoulderRestY + armLength * 0.5, 0),
      new Vector3(0, shoulderRestY + armLength, 0),
      new Vector3(0, shoulderRestY + armLength * 2, 0),
    ];
    positions.forEach((pos, i) => {
      it(`position ${i}: unit quaternion`, () => {
        const q = computeClavicleRotation(pos, "left", shoulderRestY, armLength);
        expectUnitQuaternion(q);
      });
    });
  });

  describe("monotonic increase", () => {
    it("higher hand produces equal or greater rotation", () => {
      const heights = [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      let prevAngle = 0;
      for (const h of heights) {
        const q = computeClavicleRotation(
          new Vector3(0, shoulderRestY + armLength * h, 0),
          "left", shoulderRestY, armLength
        );
        const angle = angleDegrees(q);
        expect(angle).toBeGreaterThanOrEqual(prevAngle - 0.001);
        prevAngle = angle;
      }
    });
  });
});
