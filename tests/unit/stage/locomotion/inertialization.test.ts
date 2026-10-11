import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import { startInertialize, applyInertialize } from "#lib/features/stage/locomotion/motion-matching/inertialization.js";

function angleOf(q: Quaternion): number {
  return 2 * Math.acos(Math.min(1, Math.abs(q.w)));
}

describe("inertialization", () => {
  it("starts at the old pose and decays to the new pose by blend end", () => {
    const oldPose = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 1.0);
    const newPose = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.0);
    const inert = startInertialize(oldPose, newPose, 0.25);

    const atStart = applyInertialize(inert, newPose, 0);
    expect(angleOf(atStart)).toBeCloseTo(1.0, 2);

    const atEnd = applyInertialize(inert, newPose, 0.3);
    expect(angleOf(atEnd)).toBeCloseTo(0.0, 2);
  });

  it("offset magnitude decreases monotonically", () => {
    const oldPose = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 1.2);
    const newPose = new Quaternion();
    const inert = startInertialize(oldPose, newPose, 0.5);
    let prev = Infinity;
    for (let i = 0; i <= 5; i++) {
      const out = applyInertialize(inert, newPose, 0.1);
      const a = angleOf(out);
      expect(a).toBeLessThanOrEqual(prev + 1e-6);
      prev = a;
    }
  });
});
