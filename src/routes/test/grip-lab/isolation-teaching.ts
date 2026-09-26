import type { AuthoredContactPose } from "@austencloud/scene-3d";
import { sampleIsolationChannel } from "$lib/shared/3d/performers/isolation-keyframes";
import { wrapStaffIsolationPhase } from "$lib/shared/3d/performers/staff-isolation";

export const POSE_CHANNELS = [
  "turn",
  "lean",
  "pitch",
  "pelvisX",
  "pelvisY",
  "pelvisZ",
  "elbowX",
  "elbowY",
  "elbowZ",
  "tipX",
  "tipY",
  "tipZ",
  "gripRelaxation",
  "gripTilt",
  "wristBend",
  "wristTwist",
  "thumbSpread",
  "thumbCurl",
  "indexCurl",
  "middleCurl",
  "ringCurl",
  "pinkyCurl",
  "thumbJoint1",
  "thumbJoint2",
  "thumbJoint3",
  "indexJoint1",
  "indexJoint2",
  "indexJoint3",
  "middleJoint1",
  "middleJoint2",
  "middleJoint3",
  "ringJoint1",
  "ringJoint2",
  "ringJoint3",
  "pinkyJoint1",
  "pinkyJoint2",
  "pinkyJoint3",
  "wristRaise",
] as const;
// Preserve links created before grip editing and before individual hand editing.
const LEGACY_POSE_ROW_LENGTH = 13;
const PRE_HAND_POSE_ROW_LENGTH = 15;
const PRE_JOINT_POSE_ROW_LENGTH = 23;
const PRE_WRIST_RAISE_POSE_ROW_LENGTH = POSE_CHANNELS.length - 1;
export type PoseChannel = (typeof POSE_CHANNELS)[number];
export type TeachingPose = Record<PoseChannel, number>;
export interface TeachingKey extends TeachingPose {
  phase: number;
}
export type PoseHandle =
  | "chest"
  | "pelvis"
  | "elbow"
  | "tip"
  | "grip"
  | "fingers";
export const TEACHING_KEY_PHASE_TOLERANCE = 0.005;
// Place this teaching circle within arm reach; drift measures movement around this fixed anchor.
export const TEACHING_ANCHOR_OFFSET: [number, number, number] = [0, 0, -0.25];
export const TRANSITIONS = [
  { value: "all", label: "Full loop" },
  { value: "0", label: "S → E" },
  { value: "1", label: "E → N" },
  { value: "2", label: "N → W" },
  { value: "3", label: "W → S" },
];

const NEUTRAL: TeachingPose = {
  turn: 0,
  lean: 0,
  pitch: 0,
  pelvisX: 0,
  pelvisY: 0,
  pelvisZ: 0,
  elbowX: -0.2,
  elbowY: -0.8,
  elbowZ: 0.35,
  tipX: 0,
  tipY: 0,
  tipZ: 0,
  gripRelaxation: 0,
  gripTilt: 1.0472,
  wristBend: 0,
  wristTwist: 0,
  thumbSpread: 0,
  thumbCurl: 0,
  indexCurl: 0,
  middleCurl: 0,
  ringCurl: 0,
  pinkyCurl: 0,
  thumbJoint1: 0,
  thumbJoint2: 0,
  thumbJoint3: 0,
  indexJoint1: 0,
  indexJoint2: 0,
  indexJoint3: 0,
  middleJoint1: 0,
  middleJoint2: 0,
  middleJoint3: 0,
  ringJoint1: 0,
  ringJoint2: 0,
  ringJoint3: 0,
  pinkyJoint1: 0,
  pinkyJoint2: 0,
  pinkyJoint3: 0,
  wristRaise: 0,
};
export function defaultTeachingKeys(): TeachingKey[] {
  return [
    { ...NEUTRAL, phase: 0, tipY: 0.09 },
    { ...NEUTRAL, phase: 1 },
    { ...NEUTRAL, phase: 2, gripRelaxation: 1, thumbSpread: 0.4363 },
    {
      ...NEUTRAL,
      phase: 3,
      turn: 1.5,
      lean: 0.1,
      pelvisX: -0.035,
      pelvisZ: 0.025,
      elbowY: -0.6,
      elbowZ: 1,
      tipX: -0.08,
      // Give the thumb end room to pass inside the right elbow at West.
      tipZ: 0.1,
    },
    {
      ...NEUTRAL,
      phase: 3.5,
      turn: 1.3,
      lean: 0.05,
      pelvisX: -0.0175,
      pelvisZ: 0.0125,
      tipX: -0.1,
      tipY: 0.07,
      tipZ: 0.05,
    },
  ];
}
export function sampleTeachingPose(
  phase: number,
  keys: readonly TeachingKey[]
): TeachingPose {
  return Object.fromEntries(
    POSE_CHANNELS.map((channel) => [
      channel,
      sampleIsolationChannel(phase, keys, (key) => key[channel]),
    ])
  ) as TeachingPose;
}
/** Key positions stay on millisecond-sized beats so scrubber selection stays predictable. */
export function normalizeTeachingKeyPhase(phase: number): number | null {
  if (!Number.isFinite(phase)) return null;
  return wrapStaffIsolationPhase(
    Math.round(wrapStaffIsolationPhase(phase) * 1000) / 1000
  );
}
export function teachingKeyAtPhase(
  keys: readonly TeachingKey[],
  phase: number
): TeachingKey | undefined {
  const target = Number.isFinite(phase) ? wrapStaffIsolationPhase(phase) : null;
  return target === null
    ? undefined
    : keys.find(
        (key) => Math.abs(key.phase - target) < TEACHING_KEY_PHASE_TOLERANCE
      );
}
export function canAddTeachingKeyAtPhase(
  keys: readonly TeachingKey[],
  phase: number
): boolean {
  const target = normalizeTeachingKeyPhase(phase);
  return (
    target !== null &&
    !keys.some(
      (key) => Math.abs(key.phase - target) < TEACHING_KEY_PHASE_TOLERANCE
    )
  );
}
/** A retime may approach its original beat, but never crowd a different keyframe. */
export function canMoveTeachingKey(
  keys: readonly TeachingKey[],
  fromPhase: number,
  toPhase: number
): boolean {
  const source = teachingKeyAtPhase(keys, fromPhase);
  const destination = normalizeTeachingKeyPhase(toPhase);
  return (
    !!source &&
    destination !== null &&
    (source.phase === destination ||
      !keys.some(
        (key) =>
          key !== source &&
          Math.abs(key.phase - destination) < TEACHING_KEY_PHASE_TOLERANCE
      ))
  );
}
export function channelLimit(channel: PoseChannel): number {
  if (channel === "wristRaise") return 0.08;
  if (channel === "wristBend" || channel === "wristTwist") return Math.PI / 6;
  if (channel === "thumbSpread") return Math.PI / 4;
  if (channel.endsWith("Curl")) return Math.PI / 4;
  if (channel.includes("Joint")) return Math.PI / 3;
  if (channel === "gripRelaxation") return 1;
  if (channel === "gripTilt") return (80 * Math.PI) / 180;
  if (channel === "turn") return Math.PI / 2;
  if (channel === "lean" || channel === "pitch") return 0.35;
  if (channel.startsWith("elbow")) return 1.5;
  if (channel.startsWith("tip")) return 0.2;
  return 0.15;
}
export function upsertTeachingKey(
  keys: readonly TeachingKey[],
  phase: number,
  changes: Partial<TeachingPose>
): TeachingKey[] {
  const t = normalizeTeachingKeyPhase(phase) ?? 0;
  const pose = sampleTeachingPose(t, keys);
  for (const channel of POSE_CHANNELS) {
    const next = changes[channel];
    if (next !== undefined && Number.isFinite(next)) {
      pose[channel] = Math.max(
        channel === "gripRelaxation" || channel === "gripTilt"
          ? 0
          : -channelLimit(channel),
        Math.min(channelLimit(channel), next)
      );
    }
    pose[channel] = Math.round(pose[channel] * 10000) / 10000;
  }
  return [
    ...keys.filter(
      (key) => Math.abs(key.phase - t) >= TEACHING_KEY_PHASE_TOLERANCE
    ),
    { ...pose, phase: t },
  ].sort((a, b) => a.phase - b.phase);
}
/** The ordinary North grip follows the original turn. An authored wrist edit
 * on the East-to-North passage selects the shorter, inward-facing approach. */
export function isolationPalmRoll(
  phase: number,
  inwardApproach = false
): number {
  const t = wrapStaffIsolationPhase(phase);
  if (!inwardApproach) {
    const roll = Math.PI - 0.18;
    if (t < 2) return (t / 2) * roll;
    if (t < 2.5) return roll;
    if (t < 3) return (3 - t) * 2 * roll;
    return 0;
  }
  const stageLeftRoll = -2.8;
  const northRoll = -Math.PI - 0.18;
  if (t <= 1) return 0;
  if (t < 1.9) {
    const progress = (t - 1) / 0.9;
    return stageLeftRoll * progress * progress * (3 - 2 * progress);
  }
  if (t < 2)
    return stageLeftRoll + (t - 1.9) * 10 * (northRoll - stageLeftRoll);
  if (t < 2.5) return northRoll;
  if (t < 3) return (3 - t) * 2 * (northRoll + 2 * Math.PI);
  return 0;
}
export function authoredBodyPose(
  pose: TeachingPose,
  phase = 0,
  keys?: readonly TeachingKey[]
): AuthoredContactPose {
  const inwardApproach =
    keys?.some(
      (key) =>
        key.phase > 1 &&
        key.phase < 2 &&
        (Math.abs(key.wristBend) > 0.1 || Math.abs(key.wristTwist) > 0.1)
    ) ?? false;
  return {
    pelvisOffset: { x: pose.pelvisX, y: pose.pelvisY, z: pose.pelvisZ },
    torsoYawRad: pose.turn,
    torsoLeanRad: pose.lean,
    torsoPitchRad: pose.pitch,
    elbowPole: { x: pose.elbowX, y: pose.elbowY, z: pose.elbowZ },
    gripRelaxation: pose.gripRelaxation,
    gripTiltRad: pose.gripTilt,
    gripPalmRollRad: isolationPalmRoll(phase, inwardApproach),
    gripRiseM: pose.wristRaise,
  };
}
/** Bound the actual tip displacement, including depth, rather than loosening the grip. */
export function allowedTipOffset(
  pose: TeachingPose,
  toleranceM: number
): [number, number, number] {
  const length = Math.hypot(pose.tipX, pose.tipY, pose.tipZ);
  const scale = length > 0 ? Math.min(1, Math.max(0, toleranceM) / length) : 0;
  return [pose.tipX * scale, pose.tipY * scale, pose.tipZ * scale];
}
export function encodeTeachingKeys(keys: readonly TeachingKey[]): string {
  return JSON.stringify(
    keys.map((key) => [
      key.phase,
      ...POSE_CHANNELS.map(
        (channel) => Math.round(key[channel] * 10000) / 10000
      ),
    ])
  );
}
export function decodeTeachingKeys(raw: string | null): TeachingKey[] {
  if (!raw || raw.length > 48000) return defaultTeachingKeys();
  try {
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows) || !rows.length || rows.length > 100)
      return defaultTeachingKeys();
    let keys: TeachingKey[] = [];
    for (const row of rows) {
      if (
        !Array.isArray(row) ||
        ![
          POSE_CHANNELS.length + 1,
          PRE_WRIST_RAISE_POSE_ROW_LENGTH,
          PRE_JOINT_POSE_ROW_LENGTH,
          PRE_HAND_POSE_ROW_LENGTH,
          LEGACY_POSE_ROW_LENGTH,
        ].includes(row.length) ||
        !row.every(
          (value) => typeof value === "number" && Number.isFinite(value)
        ) ||
        row[0] < 0 ||
        row[0] >= 4
      )
        return defaultTeachingKeys();
      // Old pose links describe a closed grip. Keep those reproducible instead
      // of silently giving their existing keyframes a different hand pose.
      const legacy = row.length === LEGACY_POSE_ROW_LENGTH;
      keys = upsertTeachingKey(
        keys,
        row[0],
        Object.fromEntries(
          POSE_CHANNELS.map((channel, i) => [
            channel,
            i + 1 >= row.length
              ? NEUTRAL[channel]
              : legacy && channel === "gripRelaxation"
                ? 0
                : legacy && channel === "gripTilt"
                  ? NEUTRAL.gripTilt
                  : row[i + 1],
          ])
        )
      );
    }
    return keys;
  } catch {
    return defaultTeachingKeys();
  }
}
