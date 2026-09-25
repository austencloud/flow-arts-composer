import { Vector3, type Object3D } from "three";

/** The largest gap the lock bridges. Past it the hand cannot reach, and
 *  moving the staff all the way to the palm would look wrong. The same value
 *  as the interactive rig's legacy lock. */
export const WORKER_CONTACT_LOCK_MAX_M = 0.06;

/**
 * The interactive rig's legacy contact lock, for the worker: after the arm
 * solve, move the staff's correction group from its anchor toward the solved
 * palm, by at most `maxM`. Without a palm the correction is cleared. Returns
 * the applied offset in the anchor's frame.
 */
export function applyLegacyContactLock(
  anchor: Object3D,
  correction: Object3D,
  palmWorld: Vector3 | null,
  maxM: number = WORKER_CONTACT_LOCK_MAX_M,
  out: Vector3 = new Vector3()
): Vector3 {
  correction.quaternion.identity();
  if (!palmWorld) {
    correction.position.set(0, 0, 0);
    return out.set(0, 0, 0);
  }
  anchor.updateWorldMatrix(true, false);
  anchor.worldToLocal(out.copy(palmWorld));
  const length = out.length();
  if (length > maxM) out.multiplyScalar(maxM / length);
  correction.position.copy(out);
  return out;
}
