import { withCalculatedArrowLocations } from "$lib/features/assemble-lab/services/builder-step-converter";
import { createStartPlacementData } from "$lib/shared/foundation/domain/factories/create-start-placement-data";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import {
  GridLocation,
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import {
  createMotionData,
  type MotionData,
} from "$lib/shared/pictograph/shared/domain/models/motion-data";

export const ISOLATION_STEP_COUNT = 4;
// Match the unscaled production fire-double-staff.glb (900 mm).
export const ISOLATION_STAFF_LENGTH_CM = 90;
export const DEFAULT_TORSO_KEYFRAMES = [0, -0.08, -0.42, -0.94] as const;
export interface TorsoKeyframe {
  phase: number;
  yaw: number;
}
export const DEFAULT_TORSO_POSE_KEYFRAMES: readonly TorsoKeyframe[] =
  DEFAULT_TORSO_KEYFRAMES.map((yaw, phase) => ({ phase, yaw }));

export interface IsolationSnapshot {
  image: string;
  phase: number;
  torsoKeyframes: TorsoKeyframe[];
}

export function wrapIsolationPhase(phase: number): number {
  return (
    ((phase % ISOLATION_STEP_COUNT) + ISOLATION_STEP_COUNT) %
    ISOLATION_STEP_COUNT
  );
}

export function selectedIsolationKeyframe(phase: number): number {
  return Math.floor(wrapIsolationPhase(phase)) % ISOLATION_STEP_COUNT;
}

function smoothstep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/** Cyclic easing means the return to South has no hard torso seam. */
export function torsoYawAt(
  phase: number,
  keyframes: readonly number[]
): number {
  const safe =
    keyframes.length === ISOLATION_STEP_COUNT
      ? keyframes
      : DEFAULT_TORSO_KEYFRAMES;
  const wrapped = wrapIsolationPhase(phase);
  const index = Math.floor(wrapped);
  const next = (index + 1) % ISOLATION_STEP_COUNT;
  return (
    safe[index]! + (safe[next]! - safe[index]!) * smoothstep(wrapped - index)
  );
}

export function torsoYawAtKeyframes(
  phase: number,
  keyframes: readonly TorsoKeyframe[]
): number {
  const sorted = [...keyframes].sort((a, b) => a.phase - b.phase);
  if (sorted.length === 0) return 0;
  const wrapped = wrapIsolationPhase(phase);
  const after = sorted.find((keyframe) => keyframe.phase > wrapped) ?? {
    ...sorted[0]!,
    phase: sorted[0]!.phase + ISOLATION_STEP_COUNT,
  };
  const before = [...sorted]
    .reverse()
    .find((keyframe) => keyframe.phase <= wrapped) ?? {
    ...sorted[sorted.length - 1]!,
    phase: sorted[sorted.length - 1]!.phase - ISOLATION_STEP_COUNT,
  };
  const position =
    wrapped < before.phase ? wrapped + ISOLATION_STEP_COUNT : wrapped;
  return (
    before.yaw +
    (after.yaw - before.yaw) *
      smoothstep((position - before.phase) / (after.phase - before.phase))
  );
}

export function upsertTorsoKeyframe(
  keyframes: readonly TorsoKeyframe[],
  phase: number,
  yaw: number
): TorsoKeyframe[] {
  const wrapped = wrapIsolationPhase(phase);
  const match = keyframes.findIndex(
    (keyframe) => Math.abs(keyframe.phase - wrapped) < 0.005
  );
  const next = keyframes.map((keyframe) => ({ ...keyframe }));
  if (match >= 0) next[match] = { phase: wrapped, yaw };
  else next.push({ phase: wrapped, yaw });
  return next.sort((a, b) => a.phase - b.phase);
}

export function captureIsolationSnapshot(
  image: string,
  phase: number,
  torsoKeyframes: readonly TorsoKeyframe[]
): IsolationSnapshot {
  return {
    image,
    phase: wrapIsolationPhase(phase),
    torsoKeyframes: torsoKeyframes.map((keyframe) => ({ ...keyframe })),
  };
}

export function restoreIsolationSnapshot(
  snapshot: IsolationSnapshot
): IsolationSnapshot {
  return {
    image: snapshot.image,
    phase: snapshot.phase,
    torsoKeyframes: snapshot.torsoKeyframes.map((keyframe) => ({
      ...keyframe,
    })),
  };
}

function motion(
  hand: HandSide,
  from: GridLocation,
  to: GridLocation
): MotionData {
  const startOrientation = Orientation.IN;
  return createMotionData({
    hand,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.COUNTER_CLOCKWISE,
    startLocation: from,
    endLocation: to,
    startOrientation,
    endOrientation: startOrientation,
    turns: 0,
    gridMode: GridMode.DIAMOND,
    arrowLocation: from,
  });
}

// Keep the requested grid locations; the front camera must not rewrite the score.
const path = [
  GridLocation.SOUTH,
  GridLocation.EAST,
  GridLocation.NORTH,
  GridLocation.WEST,
] as const;

export const ISOLATION_SEQUENCE: SequenceData = createSequenceData({
  id: "single-hand-isolation-loop",
  name: "Single-hand isolation",
  word: "",
  gridMode: GridMode.DIAMOND,
  isCircular: true,
  startPlacement: createStartPlacementData({
    id: "single-hand-isolation-start",
    letter: null,
    startPlacement: GridPlacement.ALPHA1,
    endPlacement: GridPlacement.ALPHA1,
    gridPlacement: GridPlacement.ALPHA1,
    motions: {
      [HandSide.LEFT]: undefined,
      [HandSide.RIGHT]: motion(
        HandSide.RIGHT,
        GridLocation.SOUTH,
        GridLocation.SOUTH
      ),
    },
  }),
  steps: path.map((from, index) =>
    withCalculatedArrowLocations(
      createStepData({
        id: `single-hand-isolation-${index + 1}`,
        stepNumber: index + 1,
        duration: 1,
        startPlacement: GridPlacement.ALPHA1,
        endPlacement: GridPlacement.ALPHA1,
        gridMode: GridMode.DIAMOND,
        motions: {
          // An absent motion sends the free arm through the rig's rest path, not a
          // visible-but-hidden second prop.
          [HandSide.LEFT]: undefined,
          [HandSide.RIGHT]: motion(
            HandSide.RIGHT,
            from,
            path[(index + 1) % path.length]!
          ),
        },
      })
    )
  ),
});
