import { getSceneUndoManager } from "#lib/shared/3d/undo/get-scene-undo-manager.js";
import type { Viewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

import type { StagePerformanceFrame } from "../domain/stage-performance-sampler";
import type { StageChoreography } from "../domain/stage-types";

/**
 * The Stage's write seam onto the canonical viewer.
 *
 * Following the Film Director's rule, edits split by kind. Look edits — character,
 * prop, effort, effect, staff length — belong to the performer manager and are
 * never touched here, so the rail's Performer tool keeps working exactly as it
 * does on every other 3D surface. Document edits — how many performers there
 * are, which sequence each one holds, where they stand at this count — are the
 * choreography's, and this module is how they reach the rigs.
 */

/**
 * Match the viewer's cast to the choreography's, and give each rig the sequence
 * its lane is holding.
 *
 * The rigs are a pool the rail also edits, so this runs without undo: the
 * document's own history owns "the cast changed", and a second entry from the
 * scene undo manager would make one edit take two presses of Ctrl+Z.
 */
export function applyStageCastToViewer(
  viewer: Viewer3DState,
  choreography: StageChoreography,
  sequenceByPerformerId: ReadonlyMap<string, SequenceData>
): void {
  const manager = viewer.performerManager;
  const castSize = Math.max(1, choreography.performers.length);

  getSceneUndoManager().withoutUndo(() => {
    manager.ensurePerformerCount(castSize);
    while (manager.performers.length > castSize) {
      manager.removePerformer(manager.performers.length - 1);
    }

    // The Stage owns position over time. A formation transition started by the
    // rail would walk performers on its own clock, fighting the count-based
    // walk this document authored.
    manager.cancelFormationTransition();

    choreography.performers.forEach((performer, index) => {
      const rig = manager.performers[index];
      if (!rig) return;
      rig.setDisplayName(performer.label);

      // Identity-compared: the loader hands back the same cached object, and
      // reloading rebuilds step configs and drops per-step plane overrides.
      const sequence = sequenceByPerformerId.get(performer.id);
      if (sequence && rig.loadedSequence !== sequence) {
        rig.loadSequence(sequence);
      }
    });
  });
}

/**
 * Drive the cast's staging for one count: where each performer stands, which
 * way they face, and what the locomotion animator needs to keep their feet on
 * the ground while they travel.
 *
 * Facing snaps rather than lerps because the formation sampler has already
 * eased it; the rig's own rotation lerp would fight that curve and lag the walk.
 */
export function applyStagePerformerMotion(
  viewer: Viewer3DState,
  choreography: StageChoreography,
  frames: readonly StagePerformanceFrame[],
  isPlaying: boolean
): void {
  const rigs = viewer.performerManager.performers;
  const indexByPerformerId = new Map(
    choreography.performers.map((performer, index) => [performer.id, index])
  );

  for (const frame of frames) {
    const index = indexByPerformerId.get(frame.performerId);
    if (index === undefined) continue;
    const rig = rigs[index];
    if (!rig) continue;

    rig.position.x = frame.worldPosition.x;
    rig.position.z = frame.worldPosition.z;
    rig.snapFacingAngle(frame.bodyFacing);
    rig.setTravel({
      direction: frame.moveDirection,
      speed: frame.speedMetersPerSecond,
      // A paused stage is a held pose, not a performer walking in place.
      moving: isPlaying && frame.isMoving,
      gaitTimingSample: frame.gaitTimingSample ?? null,
      terminalStepPlan: frame.terminalStepPlan ?? null,
    });
  }
}
