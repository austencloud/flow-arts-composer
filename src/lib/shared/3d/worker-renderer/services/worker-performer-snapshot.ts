import {
  cmToUnits,
  GRID_OFFSETS,
  PlaneMode,
  PLANE_MODE_CONFIGS,
  PROP_COLORS,
  userProportionsState,
} from "@austencloud/scene-3d";
import type { CharacterInstanceState } from "../../state/character-instance-state.svelte";
import { resolvePerformerUpperBodyStance } from "../../domain/performer-upper-body-stance";
import { CANONICAL_PERFORMER_ANCHOR_Y } from "../../environments/domain/stage-coordinate-frame";
import type {
  WorkerPerformerEffectIntent,
  WorkerPerformerSnapshot,
  WorkerPooledEffectConfigs,
  WorkerPerformerPropType,
  WorkerPropSnapshot,
  WorkerSelectionMarkerSnapshot,
} from "../domain/worker-renderer-protocol";
import { isWorkerPerformerPropType } from "../domain/worker-renderer-protocol";
import { getPerformerColor } from "../../constants/performer-colors";
import type { WorkerPropBuild } from "../worlds/props/worker-prop-factory-types";
import { isWorkerEffectExact } from "../effects/worker-effect-support";

export interface WorkerPerformerSnapshotOptions {
  leftPropType: string;
  rightPropType: string;
  propBuild: WorkerPropBuild;
  leftPropFlipped?: boolean;
  rightPropFlipped?: boolean;
  enableLocomotion?: boolean;
  badge?: {
    index: number;
    selected: boolean;
    allMode: boolean;
    visible: boolean;
  };
  selectionMarker?: Omit<WorkerSelectionMarkerSnapshot, "groundPosition">;
  effectIntent?: WorkerPerformerEffectIntent | null;
}

type SupportedWorkerPerformerSnapshotOptions =
  WorkerPerformerSnapshotOptions & {
    leftPropType: WorkerPerformerPropType;
    rightPropType: WorkerPerformerPropType;
  };

function serializeProp(
  state: CharacterInstanceState["leftPropState"],
  handAnchor: readonly [number, number, number],
  flipped: boolean
): WorkerPropSnapshot | null {
  if (!state) return null;
  return {
    centerPathAngle: state.centerPathAngle,
    staffRotationAngle: state.staffRotationAngle,
    plane: state.plane,
    handAnchor: [...handAnchor],
    flipped,
    worldPosition: state.worldPosition.toArray(),
    worldRotation: state.worldRotation.toArray(),
    gripType: state.gripType,
  };
}

export function supportsWorkerPerformer(
  options: WorkerPerformerSnapshotOptions
): options is SupportedWorkerPerformerSnapshotOptions {
  return (
    isWorkerPerformerPropType(options.leftPropType) &&
    isWorkerPerformerPropType(options.rightPropType)
  );
}

/**
 * Resolve the physical prop length from the same owner used by the serialized
 * performer. Effect anchor construction needs the half-length before the
 * snapshot exists, so exporting this avoids a second, subtly divergent unit
 * conversion at the application/worker boundary.
 */
export function resolveWorkerPerformerStaffLength(
  performer: CharacterInstanceState
): number {
  const staffLengthCm = performer.settings.staffLengthCm;
  return staffLengthCm == null
    ? userProportionsState.staffLength
    : cmToUnits(staffLengthCm);
}

export function supportsWorkerPerformerEffectIntent(
  intent: WorkerPerformerEffectIntent | null | undefined
): boolean {
  if (!intent) return true;
  for (const decision of intent.tips) {
    if (!isWorkerEffectExact(decision.effect)) {
      return false;
    }
    if (
      decision.effect !== "none" &&
      decision.effect !== "trails" &&
      decision.effect !== "led" &&
      !intent.pooled[decision.effect as keyof WorkerPooledEffectConfigs]
    ) {
      return false;
    }
  }
  return true;
}

function assertExactEffectIntent(
  intent: WorkerPerformerEffectIntent | null | undefined
): void {
  if (supportsWorkerPerformerEffectIntent(intent)) return;
  const unsupported = intent?.tips.find(
    ({ effect }) => !isWorkerEffectExact(effect)
  )?.effect;
  if (unsupported) {
    throw new Error(`Worker performer cannot reproduce ${unsupported} exactly`);
  }
  throw new Error("Worker performer is missing resolved effect parameters");
}

/**
 * Serialize the app's already-resolved Choreo state without moving semantic
 * timing or plane math into the rendering worker.
 */
export function createWorkerPerformerSnapshot(
  performer: CharacterInstanceState,
  options: WorkerPerformerSnapshotOptions
): WorkerPerformerSnapshot {
  if (!supportsWorkerPerformer(options)) {
    throw new Error(
      `Worker performer cannot reproduce ${options.leftPropType}/${options.rightPropType} exactly`
    );
  }
  assertExactEffectIntent(options.effectIntent);
  if (
    options.effectIntent &&
    (options.effectIntent.propBuild.finish !== options.propBuild.finish ||
      options.effectIntent.propBuild.fanBuild !== options.propBuild.fanBuild ||
      options.effectIntent.propBuild.fanFrameColor !==
        options.propBuild.fanFrameColor ||
      options.effectIntent.propBuild.fanCover !== options.propBuild.fanCover ||
      options.effectIntent.propBuild.triangleGrip !==
        options.propBuild.triangleGrip)
  ) {
    throw new Error(
      "Worker performer effect intent uses a different prop build"
    );
  }
  const stance = resolvePerformerUpperBodyStance(performer);
  const staffLength = resolveWorkerPerformerStaffLength(performer);
  const modeConfig = PLANE_MODE_CONFIGS[performer.planeMode];
  const dualWheel = performer.planeMode === PlaneMode.DUAL_WHEEL;
  const gridOffset = GRID_OFFSETS[performer.planeMode];
  const leftHandAnchor = [
    dualWheel ? staffLength / 2 : modeConfig.blueLateralOffset,
    0,
    dualWheel ? 0 : gridOffset + stance.leftDepthOffsetM,
  ] as const;
  const rightHandAnchor = [
    dualWheel ? -staffLength / 2 : modeConfig.redLateralOffset,
    0,
    dualWheel ? 0 : gridOffset + stance.rightDepthOffsetM,
  ] as const;
  return {
    id: performer.id,
    avatarId: performer.characterId,
    position: [
      performer.position.x,
      CANONICAL_PERFORMER_ANCHOR_Y,
      performer.position.z,
    ],
    facingAngle: performer.facingAngle,
    avatarHeightCm: userProportionsState.heightCm,
    groundY: userProportionsState.groundY,
    staffLength,
    staffThickness: userProportionsState.dimensions.staffRadius,
    propBuild: { ...options.propBuild },
    handColors: { blue: PROP_COLORS.blue.main, red: PROP_COLORS.red.main },
    leftPropType: options.leftPropType,
    rightPropType: options.rightPropType,
    leftProp: performer.showLeft
      ? serializeProp(
          performer.leftPropState,
          leftHandAnchor,
          options.leftPropFlipped ?? false
        )
      : null,
    rightProp: performer.showRight
      ? serializeProp(
          performer.rightPropState,
          rightHandAnchor,
          options.rightPropFlipped ?? false
        )
      : null,
    stanceYaw: stance.yawRad,
    stanceSegments: stance.segments,
    spinePitchOffset: stance.pitchRad,
    badge: options.badge?.visible
      ? {
          index: options.badge.index,
          color: getPerformerColor(options.badge.index),
          opacity: options.badge.selected
            ? 1
            : options.badge.allMode
              ? 0.6
              : 0.35,
          selected: options.badge.selected,
        }
      : null,
    selectionMarker: options.selectionMarker
      ? {
          ...options.selectionMarker,
          groundPosition: [
            performer.position.x,
            userProportionsState.groundY + CANONICAL_PERFORMER_ANCHOR_Y,
            performer.position.z,
          ],
        }
      : null,
    effectIntent: options.effectIntent
      ? structuredClone(options.effectIntent)
      : null,
    locomotion: options.enableLocomotion
      ? {
          isMoving: performer.isMoving,
          moveSpeed: performer.moveSpeed,
          moveDirection: {
            x: performer.moveDirection.x,
            z: performer.moveDirection.z,
          },
          lateralGait: "sidestep",
          gaitTimingSample: performer.gaitTimingSample
            ? { ...performer.gaitTimingSample }
            : null,
          terminalStepPlan: performer.terminalStepPlan
            ? {
                ...performer.terminalStepPlan,
                stepDistances: [
                  ...performer.terminalStepPlan.stepDistances,
                ] as [number, number],
              }
            : null,
          // The production viewer does not currently schedule authored root
          // turns: every supported plane mode keeps body heading at zero.
          // Keep the protocol lane explicit so a future app-owned planner can
          // supply a real request without moving that decision into rendering.
          turnRequest: null,
        }
      : null,
  };
}
