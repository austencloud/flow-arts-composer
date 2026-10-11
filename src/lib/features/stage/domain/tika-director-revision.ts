import type { PerformerDomainSnapshot } from "#lib/shared/3d/undo/scene-undo-types.js";

/**
 * The part of a rig's editing snapshot that counts as authored scene state for
 * TIKA's revision guard.
 *
 * A rig's loaded sequence and its per-beat plane overrides follow the document:
 * assigning lanes makes the viewer load the new sequence a tick later, and that
 * load resets the overrides. Folding them into the revision made every sequence
 * direction look like "the scene changed" the moment it finished, so its undo
 * refused to run. Character, prop, look settings, and the custom planes are the
 * edits a person makes directly, and those still invalidate a stale direction.
 */
export function describeCastForDirectorRevision(
  snapshots: readonly PerformerDomainSnapshot[]
) {
  return snapshots.map((snapshot) => ({
    characterId: snapshot.characterId,
    displayName: snapshot.displayName,
    settings: snapshot.settings,
    planes: {
      customLeftPlane: snapshot.planes.customLeftPlane,
      customRightPlane: snapshot.planes.customRightPlane,
      planeMode: snapshot.planes.planeMode,
    },
  }));
}
