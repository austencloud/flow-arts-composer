import { Group, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  WORKER_CONTACT_LOCK_MAX_M,
  applyLegacyContactLock,
} from "$lib/shared/3d/worker-renderer/worlds/worker-contact-lock";

/** A staff anchor under a turned, moved performer root, with its correction
 *  group already knocked off from an earlier frame. */
function rig() {
  const root = new Group();
  root.position.set(2, 0, -1);
  root.rotation.set(0, Math.PI / 2, 0);
  const anchor = new Group();
  anchor.position.set(0.3, 1.2, 0.4);
  const correction = new Group();
  correction.position.set(0.5, 0.5, 0.5);
  correction.rotation.set(0.2, 0.3, 0.4);
  anchor.add(correction);
  root.add(anchor);
  root.updateMatrixWorld(true);
  return { anchor, correction };
}

function palmAt(anchor: Group, local: Vector3): Vector3 {
  return anchor.localToWorld(local.clone());
}

describe("worker contact lock", () => {
  it("closes a small gap to the palm completely", () => {
    const { anchor, correction } = rig();
    const gap = new Vector3(0.02, -0.01, 0.015);
    const applied = applyLegacyContactLock(
      anchor,
      correction,
      palmAt(anchor, gap)
    );
    expect(applied.distanceTo(gap)).toBeLessThan(1e-9);
    expect(correction.position.distanceTo(gap)).toBeLessThan(1e-9);
    expect(correction.quaternion.w).toBe(1);
  });

  it("moves the staff at most 6 cm toward a palm that is further away", () => {
    const { anchor, correction } = rig();
    const gap = new Vector3(0.1, 0.05, -0.08);
    applyLegacyContactLock(anchor, correction, palmAt(anchor, gap));
    expect(WORKER_CONTACT_LOCK_MAX_M).toBe(0.06);
    expect(correction.position.length()).toBeCloseTo(0.06, 12);
    expect(
      correction.position.clone().normalize().dot(gap.clone().normalize())
    ).toBeCloseTo(1, 12);
  });

  it("clears the correction when there is no palm to lock to", () => {
    const { anchor, correction } = rig();
    const applied = applyLegacyContactLock(anchor, correction, null);
    expect(applied.length()).toBe(0);
    expect(correction.position.length()).toBe(0);
    expect(correction.quaternion.w).toBe(1);
  });
});
