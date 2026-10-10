import { describe, it, expect } from "vitest";
import { Vector3, Quaternion } from "three";
import { computeSpineTwist } from "#lib/shared/3d/services/spine-twister.js";

function quatToYawDeg(q: Quaternion): number {
  const sinY = 2 * (q.w * q.y + q.x * q.z);
  const cosY = 1 - 2 * (q.y * q.y + q.z * q.z);
  return Math.atan2(sinY, cosY) * (180 / Math.PI);
}

function quatAngleDeg(q: Quaternion): number {
  return 2 * Math.acos(Math.max(-1, Math.min(1, q.w))) * (180 / Math.PI);
}

const BODY_CENTER = new Vector3(0, 0, 0);
const ALL_BONES = new Set(["Spine", "Spine1", "Spine2", "Neck", "Head"]);

describe("Iterative Aim Spine Solver", () => {
  describe("no targets", () => {
    it("returns identity quaternions when no hand targets provided", () => {
      const result = computeSpineTwist(null, null, BODY_CENTER, 0.5, ALL_BONES);
      for (const key of ["spine", "spine1", "spine2", "neck", "head", "hips"] as const) {
        expect(quatAngleDeg(result[key])).toBeLessThan(0.1);
      }
    });
  });

  describe("target directly ahead", () => {
    it("produces minimal rotation when target is on the forward axis", () => {
      const target = new Vector3(0, 0, 2);
      const result = computeSpineTwist(target, target, BODY_CENTER, 1.0, ALL_BONES);
      for (const key of ["spine", "spine1", "spine2", "neck", "head"] as const) {
        expect(quatAngleDeg(result[key])).toBeLessThan(5);
      }
    });
  });

  describe("target 45° left", () => {
    it("distributes rotation with lower spine absorbing more", () => {
      const target = new Vector3(-1, 0, 1);
      const result = computeSpineTwist(target, target, BODY_CENTER, 1.0, ALL_BONES);

      const spineYaw = Math.abs(quatToYawDeg(result.spine));
      const spine1Yaw = Math.abs(quatToYawDeg(result.spine1));
      const spine2Yaw = Math.abs(quatToYawDeg(result.spine2));

      expect(spineYaw).toBeGreaterThan(spine1Yaw);
      expect(spineYaw).toBeGreaterThan(1);
      expect(spine1Yaw).toBeGreaterThan(1);
      expect(spine2Yaw).toBeGreaterThan(0.5);
    });
  });

  describe("bodyFreedom = 0 (Square)", () => {
    it("Spine bone contributes nothing at bodyFreedom 0", () => {
      const target = new Vector3(-1, 0, 1);
      const result = computeSpineTwist(target, target, BODY_CENTER, 0.0, ALL_BONES);

      expect(quatAngleDeg(result.spine)).toBeLessThan(0.1);
      expect(quatAngleDeg(result.spine1)).toBeGreaterThan(1);
    });
  });

  describe("bodyFreedom = 1 (Expressive)", () => {
    it("Spine bone contributes maximally at bodyFreedom 1", () => {
      const target = new Vector3(-1, 0, 0.5);
      const result = computeSpineTwist(target, target, BODY_CENTER, 1.0, ALL_BONES);

      expect(quatAngleDeg(result.spine)).toBeGreaterThan(10);
    });
  });

  describe("anatomical limits", () => {
    it("no bone exceeds its max swing limit even at extreme targets", () => {
      const target = new Vector3(-2, 0.5, -1);
      const result = computeSpineTwist(target, target, BODY_CENTER, 1.0, ALL_BONES);

      expect(quatAngleDeg(result.spine)).toBeLessThanOrEqual(35 + 1);
      expect(quatAngleDeg(result.spine1)).toBeLessThanOrEqual(25 + 1);
      expect(quatAngleDeg(result.spine2)).toBeLessThanOrEqual(20 + 1);
      expect(quatAngleDeg(result.neck)).toBeLessThanOrEqual(45 + 1);
      expect(quatAngleDeg(result.head)).toBeLessThanOrEqual(70 + 1);
    });
  });

  describe("single hand mode", () => {
    it("produces reduced rotation with only one hand target", () => {
      const target = new Vector3(-1, 0, 1);
      const twoHand = computeSpineTwist(target, target, BODY_CENTER, 1.0, ALL_BONES);
      const oneHand = computeSpineTwist(target, null, BODY_CENTER, 1.0, ALL_BONES);

      const twoHandTotal = quatAngleDeg(twoHand.spine) + quatAngleDeg(twoHand.spine1);
      const oneHandTotal = quatAngleDeg(oneHand.spine) + quatAngleDeg(oneHand.spine1);
      expect(oneHandTotal).toBeLessThan(twoHandTotal);
    });

    it("produces reduced hip counter-rotation with single hand", () => {
      const target = new Vector3(-1, 0, 1);
      const result = computeSpineTwist(target, null, BODY_CENTER, 1.0, ALL_BONES);
      expect(quatAngleDeg(result.hips)).toBeLessThan(15);
    });
  });

  describe("hip counter-rotation", () => {
    it("hips counter-rotate opposite to spine at Square (−20%)", () => {
      const target = new Vector3(-1, 0, 1);
      const result = computeSpineTwist(target, target, BODY_CENTER, 0.0, ALL_BONES);

      const spineYaw = quatToYawDeg(result.spine1);
      const hipsYaw = quatToYawDeg(result.hips);

      if (Math.abs(spineYaw) > 1) {
        expect(Math.sign(hipsYaw)).not.toBe(Math.sign(spineYaw));
      }
    });
  });

  describe("smooth transitions", () => {
    it("bodyFreedom interpolates smoothly between 0 and 1", () => {
      const target = new Vector3(-1, 0, 1);
      const steps = [0.0, 0.25, 0.5, 0.75, 1.0];
      const spineAngles = steps.map((bf) => {
        const r = computeSpineTwist(target, target, BODY_CENTER, bf, ALL_BONES);
        return quatAngleDeg(r.spine);
      });

      for (let i = 1; i < spineAngles.length; i++) {
        expect(spineAngles[i]).toBeGreaterThanOrEqual(spineAngles[i - 1] - 0.1);
      }
    });
  });

  describe("missing bones", () => {
    it("works when Spine bone is not in available set", () => {
      const bonesWithoutSpine = new Set(["Spine1", "Spine2", "Neck", "Head"]);
      const target = new Vector3(-1, 0, 1);
      const result = computeSpineTwist(target, target, BODY_CENTER, 1.0, bonesWithoutSpine);

      expect(quatAngleDeg(result.spine)).toBeLessThan(0.1);
      expect(quatAngleDeg(result.spine1)).toBeGreaterThan(1);
    });
  });
});
