import { describe, expect, it } from "vitest";
import { Group, Quaternion, Vector3 } from "three";
import {
  lockStaffToPalm,
  propStateFollowingStaff,
} from "../../../src/lib/shared/3d/domain/staff-palm-lock";

// The rig's prop tree: a turned, scaled anchor parents the correction group
// the staff mesh hangs from, so the lock has to work in the anchor's frame.
function staffTree() {
  const anchor = new Group();
  anchor.position.set(0.3, 1.4, -0.2);
  anchor.quaternion.setFromAxisAngle(new Vector3(0.3, 1, 0.2).normalize(), 1.1);
  anchor.scale.setScalar(0.8);
  const correction = new Group();
  correction.position.set(0.01, -0.02, 0.005);
  correction.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.4);
  correction.scale.x = -1;
  anchor.add(correction);
  anchor.updateMatrixWorld(true);
  return { anchor, correction };
}

const world = (correction: Group) => correction.getWorldPosition(new Vector3());
const worldQuat = (correction: Group) =>
  correction.getWorldQuaternion(new Quaternion());

describe("staff palm lock", () => {
  it("leaves a staff the palm already holds exactly where the grid put it", () => {
    const { correction } = staffTree();
    const grip = world(correction);
    const before = correction.position.clone();
    const palm = grip.clone().add(new Vector3(0.001, -0.0005, 0.0008));
    expect(lockStaffToPalm(correction, palm, grip)).toBe(0);
    expect(correction.position.toArray()).toEqual(before.toArray());
  });

  it("moves an unreachable staff by the shortfall along the grip-to-palm line", () => {
    const { correction } = staffTree();
    const grip = world(correction);
    const palm = grip.clone().add(new Vector3(-0.21, 0.07, 0.12));
    const shortfall = palm.distanceTo(grip);
    const moved = lockStaffToPalm(correction, palm, grip);
    expect(moved).toBeCloseTo(shortfall, 12);
    const after = world(correction);
    expect(after.distanceTo(palm)).toBeLessThan(1e-9);
    const step = after.clone().sub(grip);
    expect(step.length()).toBeCloseTo(shortfall, 9);
    expect(
      step.normalize().dot(palm.clone().sub(grip).normalize())
    ).toBeCloseTo(1, 9);
  });

  it("keeps the staff's orientation from the grid", () => {
    const { correction } = staffTree();
    const quaternion = worldQuat(correction);
    const localQuaternion = correction.quaternion.clone();
    const scale = correction.scale.clone();
    const grip = world(correction);
    lockStaffToPalm(
      correction,
      grip.clone().add(new Vector3(0.1, 0.3, -0.05)),
      grip
    );
    expect(worldQuat(correction).angleTo(quaternion)).toBeLessThan(1e-6);
    expect(correction.quaternion.equals(localQuaternion)).toBe(true);
    expect(correction.scale.equals(scale)).toBe(true);
  });

  it("carries the tip effects with the locked staff, and leaves an unlocked prop alone", () => {
    const prop = { worldPosition: new Vector3(0.4, 1.2, 0.1), angle: 2 };
    expect(propStateFollowingStaff(prop, null)).toBe(prop);
    const moved = propStateFollowingStaff(prop, new Vector3(-0.1, 0.02, 0));
    expect(moved.worldPosition.toArray()).toEqual([
      0.30000000000000004, 1.22, 0.1,
    ]);
    expect(moved.angle).toBe(2);
    expect(prop.worldPosition.toArray()).toEqual([0.4, 1.2, 0.1]);
  });
});
