import { Vector3, type Object3D } from "three";

/** What the capture and the stage call the lock in their records. */
export const STAFF_PALM_LOCK_MODE = "prop-authoritative-palm-locked-v1";

/**
 * A grip this close to the palm already counts as held: the capture's palm
 * check allows 2 mm. Inside it the staff stays exactly where the grid puts it.
 */
export const STAFF_PALM_LOCK_TOLERANCE_M = 0.002;

const _target = new Vector3();
const _current = new Vector3();

/**
 * Lock a staff to the palm after the arm has solved toward the full-grid
 * grip. The hand keeps aiming at the grid; where the arm falls short, the
 * staff comes in to meet the palm by exactly the shortfall, along the line
 * from its grip to the palm. Only the translation of `correction` changes,
 * so the staff keeps the orientation the grid gave it.
 *
 * `gripWorld` is the staff's rendered grip, which is `correction`'s world
 * origin. Returns how far the staff moved, in metres (0 when it was held).
 */
export function lockStaffToPalm(
  correction: Object3D,
  palmWorld: Vector3,
  gripWorld: Vector3
): number {
  const shortfallM = palmWorld.distanceTo(gripWorld);
  if (!(shortfallM > STAFF_PALM_LOCK_TOLERANCE_M)) return 0;
  const parent = correction.parent;
  if (!parent) return 0;
  parent.updateWorldMatrix(true, false);
  // The move is taken in the parent's frame so a rotated or scaled anchor
  // still lands the grip on the palm.
  parent.worldToLocal(_target.copy(palmWorld));
  parent.worldToLocal(_current.copy(gripWorld));
  correction.position.add(_target.sub(_current));
  correction.updateMatrixWorld(true);
  return shortfallM;
}

/**
 * Tip effects place themselves from the prop state, in the hand branch's
 * frame, not from the rendered mesh. A locked staff carries its effects by
 * `shift`, its rendered grip less its anchor, in that same frame.
 */
export function propStateFollowingStaff<T extends { worldPosition: Vector3 }>(
  prop: T,
  shift: Vector3 | null
): T {
  return shift
    ? { ...prop, worldPosition: prop.worldPosition.clone().add(shift) }
    : prop;
}
