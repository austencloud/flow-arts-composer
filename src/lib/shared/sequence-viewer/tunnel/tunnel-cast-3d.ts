/**
 * The tunnel page's 3D stage: every performer in the cast on the 3D stage at
 * once, each dancing the sequence the 2D tunnel draws for them, on the 2D
 * tunnel's clock and in its colors.
 *
 * Staging follows the footage a partner tunnel comes from: performers stand
 * in a file facing the audience, the front performer nearest the camera and
 * each next one about an arm span further back, on the same left/right line.
 *
 * Each performer dances its layer's `sequence`, the choreography exactly as
 * the 2D tunnel overlays it seen from the front. A partner tunnel's back
 * performer is stored turned 180° and the formation turns them back, so the
 * drawn layer is their own sequence as filmed; facing the camera, it reads
 * the same in 3D as in the 2D overlay.
 */
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
import {
  getViewerFrontStageCameraZ,
  getViewerFrontStageFacingAngle,
} from "#lib/shared/3d/domain/viewer-formation-facing.js";
import { getSceneUndoManager } from "#lib/shared/3d/undo/get-scene-undo-manager.js";
import type { PerformerPropColors } from "#lib/shared/3d/rendering/performer-prop-tint.js";
import type { BuiltTunnelLayer } from "./tunnel-layer-builder";
import { tunnelEffectiveStepAt } from "./tunnel-prop-sampling";

/** Front-to-back spacing: about one arm span, so neither reaches the other. */
export const TUNNEL_CAST_DEPTH_SPACING_M = 1.7;

export interface TunnelCastPerformer3D {
  /** The stage appearance this performer is, stable across rebuilds. */
  id: string;
  /** What people call this performer, e.g. "Front". */
  label: string;
  /** The choreography as the 2D tunnel draws it. */
  sequence: SequenceData;
  /** The layer's Stagger and Speed, as the 2D tunnel samples it. */
  offset: number;
  speed: number;
  colors: PerformerPropColors;
}

/**
 * One performer per tunnel layer, in the 2D tunnel's order (front first),
 * with that layer's timing and the colors the 2D tunnel paints it in.
 * `rows` is the controller's `speedPerformers`, which runs in layer order.
 */
export function buildTunnelCast3D(
  layers: readonly BuiltTunnelLayer[],
  rows: readonly { leftHex: string; rightHex: string }[],
  timingFor: (layer: BuiltTunnelLayer) => { offset: number; speed: number }
): TunnelCastPerformer3D[] {
  return layers.map((layer, index) => {
    const timing = timingFor(layer);
    const row = rows[index];
    return {
      id: layer.stageInstanceId,
      label: layer.performerLabel,
      sequence: layer.sequence,
      offset: timing.offset,
      speed: timing.speed,
      colors: {
        left: row?.leftHex ?? "",
        right: row?.rightHex ?? "",
      },
    };
  });
}

/**
 * Each performer's playhead for the shared `currentStep`, sampled the way the
 * 2D tunnel samples that layer. 3D step N is 2D beat N (the start position is
 * step 0), so the value passes straight through as the performer's step.
 */
export function tunnelCastPerformerSteps(
  cast: readonly TunnelCastPerformer3D[],
  currentStep: number
): (number | null)[] {
  return cast.map((performer) =>
    tunnelEffectiveStepAt(
      performer.sequence.steps?.length ?? 0,
      currentStep,
      performer.offset,
      performer.speed
    )
  );
}

export interface TunnelCastStanding {
  x: number;
  z: number;
  facingAngle: number;
}

/**
 * Where each performer stands, front first: a file along the stage's depth
 * axis, centred on the stage, the front performer on the camera's side.
 * Environments differ in which side of the stage the camera opens from, so
 * the file follows the same sign the opening camera does. `spacing` is the
 * metres between neighbours; a post can stand its pair closer than the
 * tunnel page's arm span.
 */
export function tunnelCastStandings(
  count: number,
  environmentId: SceneEnvironmentId,
  spacing = TUNNEL_CAST_DEPTH_SPACING_M
): TunnelCastStanding[] {
  const cameraSide = Math.sign(getViewerFrontStageCameraZ(0, 1, environmentId));
  const facingAngle = getViewerFrontStageFacingAngle(environmentId);
  const middle = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => ({
    x: 0,
    z: cameraSide * (middle - index) * spacing,
    facingAngle,
  }));
}

interface TunnelCastRig {
  readonly position: { x: number; z: number };
  readonly facingAngle: number;
  readonly sourceSequence: SequenceData | null;
  readonly displayName: string | null;
  snapFacingAngle(angle: number): void;
  setDisplayName(name: string | null): void;
  loadSequence(sequence: SequenceData): void;
}

/** The part of the 3D viewer the cast is staged through. */
export interface TunnelCastViewer {
  readonly environmentId: SceneEnvironmentId;
  readonly performerManager: {
    readonly performers: readonly TunnelCastRig[];
    ensurePerformerCount(count: number): void;
    removePerformer(index?: number): unknown;
    cancelFormationTransition(): void;
  };
}

const STANDING_EPSILON = 1e-4;

/** Unsigned difference between two headings, so π and -π count as one. */
function angleBetween(a: number, b: number): number {
  const turn = Math.PI * 2;
  const difference = (((a - b) % turn) + turn) % turn;
  return Math.min(difference, turn - difference);
}

/**
 * Put the cast on the viewer's stage: one rig per performer, each in its
 * place, facing the audience, holding its own sequence. Idempotent: a rig
 * already holding its sequence is not reloaded (a reload restarts its step
 * state). Runs without undo, since the cast is the page's, not an edit.
 *
 * Returns whether anyone moved or the cast changed size, so the caller can
 * reframe the camera only when the shot actually changed. `options.spacing`
 * goes to `tunnelCastStandings`.
 */
export function applyTunnelCastToViewer(
  viewer: TunnelCastViewer,
  cast: readonly TunnelCastPerformer3D[],
  options: { spacing?: number } = {}
): boolean {
  if (cast.length === 0) return false;
  const manager = viewer.performerManager;
  const standings = tunnelCastStandings(
    cast.length,
    viewer.environmentId,
    options.spacing
  );
  let restaged = false;

  getSceneUndoManager().withoutUndo(() => {
    if (manager.performers.length !== cast.length) {
      restaged = true;
      manager.ensurePerformerCount(cast.length);
      while (manager.performers.length > cast.length) {
        manager.removePerformer(manager.performers.length - 1);
      }
    }
    // A count change starts the manager's own glide into formation slots; the
    // cast's places are the page's, so that glide would fight them.
    if (restaged) manager.cancelFormationTransition();

    cast.forEach((performer, index) => {
      const rig = manager.performers[index];
      const standing = standings[index];
      if (!rig || !standing) return;
      if (
        Math.abs(rig.position.x - standing.x) > STANDING_EPSILON ||
        Math.abs(rig.position.z - standing.z) > STANDING_EPSILON ||
        angleBetween(rig.facingAngle, standing.facingAngle) > STANDING_EPSILON
      ) {
        restaged = true;
        rig.position.x = standing.x;
        rig.position.z = standing.z;
        rig.snapFacingAngle(standing.facingAngle);
      }
      if (rig.displayName !== performer.label) {
        rig.setDisplayName(performer.label);
      }
      if (rig.sourceSequence !== performer.sequence) {
        rig.loadSequence(performer.sequence);
      }
    });
  });

  return restaged;
}
