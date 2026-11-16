/**
 * Performer contact scoreboard
 *
 * Plays the prop-continuity corpus through the production animator in the
 * default `legacy` contact mode and measures, every 1/60 of a step, whether
 * each palm is actually on its staff and whether a staff passes through the
 * body. It exists because the performer had no such measurement: fixes were
 * judged by eye, so a change that traded one failure for another (hands let go
 * to avoid clipping) passed unnoticed. See
 * `docs/architecture/performer-contact-review.md`.
 *
 * The per-frame order mirrors `Avatar3D`'s legacy path as the wired hosts
 * drive it: hard-beat displacement of the props (the same track, sample and
 * `displaceProp` the renderers use, with the animator's legacy pair split off),
 * props and blend, stance yaw, finger grips, animator update, then the render
 * contact lock, which slides the staff at most `CONTACT_LOCK_MAX_M` toward the
 * palm without rotating it. Idle and walking animation, foot planting and root
 * motion are off, and the tempo is one step per second.
 *
 * Gaps are measured from the palm to the staff's centre line, so the visible
 * gap is roughly a staff radius smaller.
 *
 * Staffs are measured against the rig's own skinned mesh (`performer-body-
 * mesh.ts`) at four stages: on the grid with the body square, where the stance
 * plans them (grid plus corridor), after hard-beat displacement, and as drawn.
 */

import type {
  Quaternion as QuaternionType,
  Vector3 as Vector3Type,
} from "three";
import { Group, Quaternion, Vector3 } from "three";
import {
  DEFAULT_SCENE_DIMENSIONS,
  GRID_OFFSETS,
  GripType,
  PLANE_MODE_CONFIGS,
  PlaneMode,
  createAvatarServices,
} from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "#lib/shared/3d/state/character-instance-state.svelte.js";
import {
  buildStanceYawTrackForSource,
  resolveTrackedUpperBodyStance,
} from "#lib/shared/3d/collision/stance-yaw-track.js";
import { MAX_STANCE_YAW_RAD } from "#lib/shared/3d/collision/upper-body-stance-planner.js";
import {
  buildHardBeatTrack,
  displaceProp,
  sampleHardBeatTrack,
  type DisplacedBeat,
  type HardBeatTrackOptions,
} from "#lib/shared/3d/collision/hard-beat-displacement.js";
import { propContinuityCorpus } from "../../tools/prop-continuity-corpus";
import { avatar, loadRig } from "./locomotion-harness";
import {
  BODY_ZONES,
  createBodyMesh,
  type BodyMesh,
  type BodyZone,
} from "./performer-body-mesh";

/** Height every catalog rig is scaled to by the stage viewer. */
export const PERFORMER_HEIGHT_M = 1.905;
/** Grid centre height and depth used by the stage viewer. */
const GRID_Y_M = 0.82 * PERFORMER_HEIGHT_M;
/** `Avatar3D`'s legacy render lock: staff translation toward the palm. */
export const CONTACT_LOCK_MAX_M = 0.06;
/** Samples per motion step (one step per second at 60 fps). */
const FRAMES_PER_STEP = 60;
/** Frames played at phase 0 before measuring, so smoothing settles. */
const WARMUP_FRAMES = 60;
/** Euler(0, 0, pi/2): `Avatar3D`'s staff-horizontal correction. */
const STAFF_HORIZONTAL = new Quaternion(0, 0, Math.SQRT1_2, Math.SQRT1_2);
const STAFF_HALF_LENGTH_M = DEFAULT_SCENE_DIMENSIONS.staffLength / 2;
const STAFF_RADIUS_M = DEFAULT_SCENE_DIMENSIONS.staffRadius;
/** Clearance under which a staff that misses the head or torso counts as a
 *  near miss. */
const NEAR_MISS_M = 0.03;
/** Where the stance commits side-on (the planner's corridor knee), and how
 *  close to the midline a grip counts as on it, for the bucket Austen named:
 *  a staff at the south point while the chest turns sideways. */
const SIDE_ON_RAD = 0.8 * MAX_STANCE_YAW_RAD;
const MIDLINE_M = 0.1;
/** Chest-over-pelvis twists reported, from the rendered bones. */
const TWIST_45_RAD = Math.PI / 4;
const TWIST_60_RAD = Math.PI / 3;
/** Displacements below this are not reported, as in the planner. */
const DISPLACED_EPS_M = 0.001;
/** `ElbowPoleComputer.computePairRouting`: shoulder half-width, the crossing
 *  at which the elbows start routing over/under, and the height dead zone
 *  inside which the left hand is over. */
const ROUTING_SHOULDER_HALF_WIDTH_M = 0.2;
const ROUTING_CROSS_ENGAGE = 0.25;
const ROUTING_HEIGHT_DEAD_ZONE_M = 0.04;

/**
 * Where a staff is measured: on the grid with the body square to the audience
 * (the bind pose, no corridor), where the stance plans it (grid plus
 * corridor), after hard-beat displacement, and as drawn after the render
 * lock. The last three are measured against the body as posed that frame.
 */
export const STAFF_STAGES = [
  "square",
  "planned",
  "displaced",
  "rendered",
] as const;
export type StaffStage = (typeof STAFF_STAGES)[number];

/** What a staff passes through. Arms split by whose they are: the arm holding
 *  the staff reaches it at the grip, so its forearm is counted apart. */
export const STAFF_CONTACTS = [
  "head",
  "torso",
  "leg",
  "ownForearm",
  "ownUpperArm",
  "otherArm",
] as const;
export type StaffContact = (typeof STAFF_CONTACTS)[number];
export type ContactCounts = Record<StaffContact, number>;

function contactOf(zone: BodyZone, side: "left" | "right"): StaffContact {
  if (zone === "head" || zone === "torso" || zone === "leg") return zone;
  if (!zone.startsWith(side)) return "otherArm";
  return zone.endsWith("Forearm") ? "ownForearm" : "ownUpperArm";
}

/** Arms are measured on the drawn staff only: the hands are not where the
 *  earlier stages put the staffs, so an arm there says nothing. */
const STAGE_ZONES: Record<StaffStage, readonly BodyZone[]> = {
  square: ["head", "torso", "leg"],
  planned: ["head", "torso", "leg"],
  displaced: ["head", "torso", "leg"],
  rendered: BODY_ZONES,
};

export interface WorstBeat {
  sequence: string;
  step: number;
  side: "left" | "right";
  gapM: number;
}

export interface SequenceScore {
  sequence: string;
  handFrames: number;
  gapOver3cm: number;
  /** Staff-frames through the head or torso, per stage. */
  headTorso: Record<StaffStage, number>;
}

/** Drawn staffs through the head or torso, grouped by beat and hand. */
export interface StaffHitBeat {
  sequence: string;
  step: number;
  side: "left" | "right";
  zone: "head" | "torso";
  frames: number;
  /** Whether the stance's planned staff already hit on those frames. */
  plannedFrames: number;
  /** Largest planned chest yaw on those frames, degrees. */
  chestDegMax: number;
}

/** Staffs at the south or north point while the chest is side-on. */
export interface MidlineTurned {
  staffFrames: number;
  plannedHeadTorso: number;
  renderedHeadTorso: number;
}

/** Chest (Spine2) yaw over pelvis (Hips) yaw on the rendered bones. */
export interface TwistReport {
  frames: number;
  over45: number;
  over60: number;
  maxDeg: number;
  maxSequence: string | null;
}

/** One planner report entry, with what the render lock still did on top. */
export interface ScoreboardDisplacedBeat extends DisplacedBeat {
  sequence: string;
  /** Largest lock translation on this beat, from the displaced staff. */
  lockMaxM: number;
  /** Largest part of that lock outside the staff's radial/depth plane: the
   *  angular drift the lock still adds. */
  lockTangentialMaxM: number;
}

/** Where the lock may move a staff: anywhere (the legacy lock), or only along
 *  its radial line and in depth, like the planner. */
export type ContactLockMode = "free" | "radial-depth";

/** Forearm contacts under 4 cm, grouped by beat. */
export interface ForearmCluster {
  sequence: string;
  step: number;
  frames: number;
  minM: number;
  /** Of those frames, how many had a lane whose downstage hand is not the
   *  hand elbow routing puts over. */
  routingLaneMismatchFrames: number;
  /** Mean over the frames with a lane: how far the downstage staff is
   *  planned in front of the other (lane plus corridor), and how far the
   *  downstage palm actually ends up in front of the other palm. */
  laneTargetSeparationM: number | null;
  laneRealizedSeparationM: number | null;
}

/** Whether the depth lanes reach the hands, over pair-frames with a lane. */
export interface LaneRealization {
  frames: number;
  /** Mean planned depth separation of the staffs (lane plus corridor). */
  targetSeparationMeanM: number;
  /** Mean depth separation the palms actually reach. */
  realizedSeparationMeanM: number;
  /** Frames where the palms reach less than half the planned separation. */
  underHalfFrames: number;
}

/** The largest rendered moves, per hand-frame, measured in the grid frame
 *  from where the score puts each staff. */
export interface RenderedMoves {
  radialInMaxM: number;
  radialOutMaxM: number;
  depthMaxAbsM: number;
  /** The part of a displacement that is neither radial nor depth. */
  offPlaneMaxM: number;
  /** The render lock on top, and its part that is neither radial nor depth. */
  lockMaxM: number;
  lockOffPlaneMaxM: number;
}

/** Joint positions in the rig's frame. */
export interface ArmSnapshot {
  head: Vector3Type;
  neck: Vector3Type;
  spine2: Vector3Type;
  spine1: Vector3Type;
  hips: Vector3Type;
  leftShoulder: Vector3Type;
  rightShoulder: Vector3Type;
  leftElbow: Vector3Type;
  rightElbow: Vector3Type;
  leftHand: Vector3Type;
  rightHand: Vector3Type;
}

/** One measured frame, for diagnostic probes. Grid-frame positions are
 *  relative to each hand's grid centre; the body is in the rig's frame. */
export interface ScoreboardFrame {
  sequence: string;
  phase: number;
  authored: { left: Vector3Type | null; right: Vector3Type | null };
  displaced: { left: Vector3Type | null; right: Vector3Type | null };
  shift: ReturnType<typeof sampleHardBeatTrack>;
  corridor: { left: number; right: number; chestRad: number };
  body: ArmSnapshot;
  /** Rendered chest yaw over pelvis yaw. */
  twistRad: number;
  forearmM: number | null;
  gap: { left: number | null; right: number | null };
  routedOver: "left" | "right" | null;
  /** What each staff passes through, per stage. */
  staffHits: Record<
    StaffStage,
    { left: StaffContact[]; right: StaffContact[] }
  >;
}

export interface ContactScore {
  rig: string;
  handFrames: number;
  /** Palm more than 3 cm from the rendered staff's centre line. */
  gapOver3cm: number;
  gapOver6cm: number;
  gapP50M: number;
  gapP90M: number;
  gapMaxM: number;
  /** Frames with the body square to the audience (hug rule not engaged). */
  squareHandFrames: number;
  squareGapOver3cm: number;
  pairFrames: number;
  forearmsUnder4cm: number;
  forearmsUnder8cm: number;
  forearmMinM: number;
  palmsUnder6cm: number;
  palmMinM: number;
  /**
   * Staff-frames whose staff passes through each zone of the rig's mesh, per
   * stage. Comparing stages separates what the grid puts in the body (square),
   * what the stance adds by turning and moving the staffs in depth (planned),
   * what hard-beat displacement adds, and what the render lock adds.
   */
  staffThrough: Record<StaffStage, ContactCounts>;
  /** Staff-frames within `NEAR_MISS_M` of the head or torso without
   *  touching, per stage. */
  staffNearHeadTorso: Record<StaffStage, number>;
  /** Drawn staffs through the head or torso, by beat, most frames first. */
  staffHitBeats: StaffHitBeat[];
  midlineTurned: MidlineTurned;
  twist: TwistReport;
  /** Every (sequence, step, hand) the planner displaced, from its report. */
  displacedBeats: ScoreboardDisplacedBeat[];
  /** Displaced beats a cap or the minimum radius stopped short. */
  cappedBeats: number;
  /** Hand-frames displaced by more than 1 mm on a beat the report omits, in
   *  any direction, including ones the planner may not use. */
  unlistedDisplacedFrames: number;
  renderedMoves: RenderedMoves;
  /** Pair-frames with an active depth lane where the downstage hand is not
   *  the hand the animator's elbow routing puts over. */
  routingLaneMismatchFrames: number;
  /** Those frames that are also forearm contacts. */
  routingLaneMismatchForearmsUnder6cm: number;
  routingLaneMismatchForearmsUnder4cm: number;
  laneRealization: LaneRealization;
  forearmClusters: ForearmCluster[];
  sequences: SequenceScore[];
  worstBeats: WorstBeat[];
}

export interface ContactScoreboardOptions {
  /** Trims the corpus for quick local runs; the gates assume all of it. */
  limit?: number;
  /** False plays the authored props with the animator's legacy pair split,
   *  as the unwired hosts still do. */
  displace?: boolean;
  /** Planner overrides for tuning runs. */
  hardBeat?: Pick<HardBeatTrackOptions, "limits" | "body" | "laneForwardShare">;
  /** The render lock's freedom; "free" is what both renderers do. */
  lockMode?: ContactLockMode;
  /** Called with every measured frame, for diagnostic probes. */
  onFrame?: (frame: ScoreboardFrame) => void;
}

async function buildRig(id: string) {
  const { scene } = await loadRig(avatar(id));
  const services = createAvatarServices({
    enableLocomotion: false,
    enableRootMotion: false,
    enableFootPlanting: false,
  });
  // processGLTF is on the implementation, not the contract.
  (
    services.skeleton as unknown as {
      processGLTF(scene: unknown, gltf: null, id: string): void;
    }
  ).processGLTF(scene, null, id);
  services.skeleton.setHeight(PERFORMER_HEIGHT_M);
  const root = new Group();
  root.add(scene);
  root.position.y = -services.skeleton.getFeetOffset();
  root.updateMatrixWorld(true);
  const state = services.skeleton.getState();
  // The bind pose is the square body, and the rest the twist is measured from.
  const body: BodyMesh = createBodyMesh(root);
  body.pose();
  body.keepAsSquare();
  const bindQuaternion = (name: string) =>
    state.bones.get(name as never)?.getWorldQuaternion(new Quaternion()) ??
    new Quaternion();
  const rest = {
    hips: bindQuaternion("Hips"),
    chest: bindQuaternion("Spine2"),
  };
  services.fingers.initialize(state.fingerChains!, state.meshes);
  services.animator.setContactMode("legacy");
  return { services, root, body, rest };
}

type Rig = Awaited<ReturnType<typeof buildRig>>;

interface HandProp {
  worldPosition: Vector3Type;
  worldRotation: QuaternionType;
  [key: string]: unknown;
}

interface RenderedHand {
  gapM: number;
  /** The lock's translation of the staff toward the palm. */
  lock: Vector3Type;
  staffA: Vector3Type;
  staffB: Vector3Type;
}

function staffQuat(prop: HandProp | null): QuaternionType | null {
  return prop ? prop.worldRotation.clone().multiply(STAFF_HORIZONTAL) : null;
}

/** Palm-to-axis gap after the clamped render lock, plus the rendered shaft.
 *  `grid` is where the score puts the staff in the grid frame; its radial line
 *  and depth bound a "radial-depth" lock. */
function renderHand(
  rig: Rig,
  side: "left" | "right",
  prop: HandProp | null,
  quat: QuaternionType | null,
  grid: Vector3Type | null,
  lockMode: ContactLockMode
): RenderedHand | null {
  if (!prop || !quat) return null;
  const palm = rig.services.animator.getPalmWorldPoint(side, new Vector3());
  if (!palm) return null;
  const axis = new Vector3(0, 1, 0).applyQuaternion(quat).normalize();
  let toPalm = palm.clone().sub(prop.worldPosition);
  if (lockMode === "radial-depth" && grid) {
    const [radial, depth] = radialDepthBasis(grid);
    toPalm = radial
      .clone()
      .multiplyScalar(toPalm.dot(radial))
      .addScaledVector(depth, toPalm.dot(depth));
  }
  const len = toPalm.length();
  const lock = toPalm.multiplyScalar(
    len > CONTACT_LOCK_MAX_M ? CONTACT_LOCK_MAX_M / len : 1
  );
  const centre = prop.worldPosition.clone().add(lock);
  const d = palm.clone().sub(centre);
  const gapM = d.addScaledVector(axis, -d.dot(axis)).length();
  const half = axis.clone().multiplyScalar(STAFF_HALF_LENGTH_M);
  return {
    gapM,
    lock,
    staffA: centre.clone().add(half),
    staffB: centre.clone().sub(half),
  };
}

function bodySnapshot(rig: Rig): ArmSnapshot {
  const skeleton = rig.services.skeleton;
  const bones = skeleton.getState().bones;
  const at = (name: string) => {
    const v = new Vector3();
    bones.get(name as never)?.getWorldPosition(v);
    return v;
  };
  const left = skeleton.getLeftArmChain()!;
  const right = skeleton.getRightArmChain()!;
  const world = (bone: { getWorldPosition(v: Vector3Type): Vector3Type }) =>
    bone.getWorldPosition(new Vector3());
  return {
    head: at("Head"),
    neck: at("Neck"),
    spine2: at("Spine2"),
    spine1: at("Spine1"),
    hips: at("Hips"),
    leftShoulder: world(left.root),
    rightShoulder: world(right.root),
    leftElbow: world(left.middle),
    rightElbow: world(right.middle),
    leftHand: world(left.effector),
    rightHand: world(right.effector),
  };
}

/** A bone's yaw from its bind orientation, positive swinging the performer's
 *  left side upstage, as the stance's yaw does. */
function boneYaw(rig: Rig, name: string, rest: QuaternionType): number {
  const bone = rig.services.skeleton.getState().bones.get(name as never);
  if (!bone) return 0;
  const turn = bone
    .getWorldQuaternion(new Quaternion())
    .multiply(rest.clone().invert());
  const lateral = new Vector3(1, 0, 0).applyQuaternion(turn);
  return Math.atan2(-lateral.z, lateral.x);
}

function wrapAngle(rad: number): number {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

/** Closest distance between two segments, sampled (21 x 21). */
function segmentDistance(
  a0: Vector3Type,
  a1: Vector3Type,
  b0: Vector3Type,
  b1: Vector3Type
): number {
  let best = Infinity;
  const p = new Vector3();
  const q = new Vector3();
  for (let i = 0; i <= 20; i++) {
    p.lerpVectors(a0, a1, i / 20);
    for (let j = 0; j <= 20; j++) {
      q.lerpVectors(b0, b1, j / 20);
      best = Math.min(best, p.distanceTo(q));
    }
  }
  return best;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(q * (sorted.length - 1))]!;
}

/**
 * An orthonormal basis of the plane a staff may move in: its radial line out
 * of the grid centre and depth. Grid frame, so the rig's world frame here.
 */
function radialDepthBasis(grid: Vector3Type): [Vector3Type, Vector3Type] {
  const radius = grid.length();
  const depth = new Vector3(0, 0, 1);
  // A staff at the grid centre has no radial line: depth only.
  if (radius < 1e-9) return [new Vector3(), depth];
  const radial = grid.clone().divideScalar(radius);
  const rest = depth.addScaledVector(radial, -radial.z);
  return [radial, rest.lengthSq() > 1e-12 ? rest.normalize() : new Vector3()];
}

/** A move's radial (inward positive) and depth parts, and what is left over. */
function radialDepthParts(grid: Vector3Type, move: Vector3Type) {
  const [radial, depth] = radialDepthBasis(grid);
  const along = move.dot(radial);
  const across = move.dot(depth);
  const offPlane = move
    .clone()
    .addScaledVector(radial, -along)
    .addScaledVector(depth, -across);
  // Depth is +z; its radial share already sits in `along`.
  const depthM = depth.z > 1e-9 ? across / depth.z : 0;
  return {
    radialInM: -(along - depthM * radial.z),
    depthM,
    offPlaneM: offPlane.length(),
  };
}

/**
 * Which hand the animator's elbow routing puts over, on the targets it is
 * handed (`ElbowPoleComputer.computePairRouting`), or null when the hands are
 * not crossed enough to route. Grid frame: +x is the performer's left.
 */
function routedOverHand(
  left: Vector3Type,
  right: Vector3Type
): "left" | "right" | null {
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const crossing = Math.min(
    clamp01(-left.x / ROUTING_SHOULDER_HALF_WIDTH_M),
    clamp01(right.x / ROUTING_SHOULDER_HALF_WIDTH_M)
  );
  if (crossing < ROUTING_CROSS_ENGAGE) return null;
  return left.y - right.y >= -ROUTING_HEIGHT_DEAD_ZONE_M ? "left" : "right";
}

/**
 * Sweep the corpus on one rig. `limit` trims the corpus for quick local runs;
 * the gates assume the full corpus.
 */
export async function runContactScoreboard(
  rigId: string,
  options: ContactScoreboardOptions = {}
): Promise<ContactScore> {
  const mode = PlaneMode.WALL;
  const config = PLANE_MODE_CONFIGS[mode];
  const gridOffset = GRID_OFFSETS[mode];
  const displace = options.displace ?? true;
  const lockMode = options.lockMode ?? "free";
  const rig = await buildRig(rigId);
  const animator = rig.services.animator as unknown as {
    hugBlend(): number;
    setStanceYawSegments?(segments: unknown): void;
  };
  // Hosts that hand the rig displaced props turn the legacy split off.
  rig.services.animator.setPairSeparation?.(!displace);
  const gaps: number[] = [];
  const forearms: number[] = [];
  const palms: number[] = [];
  const perStage = <T>(make: () => T) =>
    Object.fromEntries(STAFF_STAGES.map((stage) => [stage, make()])) as Record<
      StaffStage,
      T
    >;
  const staffThrough = perStage(
    () =>
      Object.fromEntries(
        STAFF_CONTACTS.map((contact) => [contact, 0])
      ) as ContactCounts
  );
  const staffNearHeadTorso = perStage(() => 0);
  const hitBeats = new Map<string, StaffHitBeat>();
  const midlineTurned: MidlineTurned = {
    staffFrames: 0,
    plannedHeadTorso: 0,
    renderedHeadTorso: 0,
  };
  const twist: TwistReport = {
    frames: 0,
    over45: 0,
    over60: 0,
    maxDeg: 0,
    maxSequence: null,
  };
  const beatWorst = new Map<string, WorstBeat>();
  const sequences: SequenceScore[] = [];
  const displacedBeats: ScoreboardDisplacedBeat[] = [];
  const clusters = new Map<string, ForearmCluster>();
  const clusterLanes = new Map<
    string,
    { frames: number; target: number; realized: number }
  >();
  const laneRealization: LaneRealization = {
    frames: 0,
    targetSeparationMeanM: 0,
    realizedSeparationMeanM: 0,
    underHalfFrames: 0,
  };
  const renderedMoves: RenderedMoves = {
    radialInMaxM: 0,
    radialOutMaxM: 0,
    depthMaxAbsM: 0,
    offPlaneMaxM: 0,
    lockMaxM: 0,
    lockOffPlaneMaxM: 0,
  };
  const score = {
    handFrames: 0,
    gapOver3cm: 0,
    gapOver6cm: 0,
    squareHandFrames: 0,
    squareGapOver3cm: 0,
    pairFrames: 0,
    forearmsUnder4cm: 0,
    forearmsUnder8cm: 0,
    palmsUnder6cm: 0,
    unlistedDisplacedFrames: 0,
    routingLaneMismatchFrames: 0,
    routingLaneMismatchForearmsUnder6cm: 0,
    routingLaneMismatchForearmsUnder4cm: 0,
  };

  {
    const corpus = propContinuityCorpus().slice(0, options.limit);
    for (const entry of corpus) {
      const perSequence: SequenceScore = {
        sequence: entry.id,
        handFrames: 0,
        gapOver3cm: 0,
        headTorso: perStage(() => 0),
      };
      const state = createCharacterInstanceState(
        { id: `scoreboard-${entry.id}`, persistent: false },
        makeStandaloneDeps()
      );
      state.setPlaneMode(mode);
      state.loadSequence(entry.sequence);
      const track = buildStanceYawTrackForSource(state, mode);
      const hardBeat = displace
        ? buildHardBeatTrack({
            source: state,
            stanceTrack: track,
            heightM: PERFORMER_HEIGHT_M,
            planeMode: mode,
            ...options.hardBeat,
          })
        : null;
      const beats = new Map<string, ScoreboardDisplacedBeat>();
      for (const beat of hardBeat?.report ?? []) {
        const entryBeat = {
          ...beat,
          sequence: entry.id,
          lockMaxM: 0,
          lockTangentialMaxM: 0,
        };
        beats.set(`${beat.step}|${beat.hand}`, entryBeat);
        displacedBeats.push(entryBeat);
      }
      // A new score is a seek for the hosts: contact history starts over.
      if (displace) rig.services.animator.resetContactHistory?.();
      const frames = Math.max(
        1,
        Math.round(state.motionStepCount * FRAMES_PER_STEP)
      );

      for (let f = -WARMUP_FRAMES; f < frames; f++) {
        const phase = Math.max(0, f) / FRAMES_PER_STEP;
        const authoredProps = state.propStatesAtScoreTime(phase);
        // The stance is planned from the authored props, as the hosts do.
        const stance = resolveTrackedUpperBodyStance(
          track,
          phase,
          mode,
          authoredProps.left,
          authoredProps.right,
          null
        );
        const shift = sampleHardBeatTrack(hardBeat, phase);
        const left = displaceProp(authoredProps.left, shift.left);
        const right = displaceProp(authoredProps.right, shift.right);
        const place = (
          prop: typeof left,
          lateral: number,
          depth: number
        ): HandProp | null =>
          prop && {
            ...prop,
            worldPosition: new Vector3(
              lateral + prop.worldPosition.x,
              GRID_Y_M + prop.worldPosition.y,
              gridOffset + depth + prop.worldPosition.z
            ),
            worldRotation: new Quaternion(
              prop.worldRotation.x,
              prop.worldRotation.y,
              prop.worldRotation.z,
              prop.worldRotation.w
            ),
          };
        const blue = place(
          left,
          config.blueLateralOffset,
          stance.leftDepthOffsetM
        );
        const red = place(
          right,
          config.redLateralOffset,
          stance.rightDepthOffsetM
        );
        const blueQuat = staffQuat(blue);
        const redQuat = staffQuat(red);
        // Where the stance plans each staff: the grid plus its depth
        // corridor, before hard-beat displacement.
        const bluePlanned = place(
          authoredProps.left,
          config.blueLateralOffset,
          stance.leftDepthOffsetM
        );
        const redPlanned = place(
          authoredProps.right,
          config.redLateralOffset,
          stance.rightDepthOffsetM
        );

        const services = rig.services;
        animator.setStanceYawSegments?.(stance.segments);
        services.animator.setPropsAndBlend(
          blue as never,
          red as never,
          undefined,
          { blue: blueQuat, red: redQuat } as never
        );
        services.animator.setStanceYaw?.(stance.yawRad);
        services.fingers.setGrips(
          blue ? GripType.SQUARE : GripType.IDLE,
          red ? GripType.SQUARE : GripType.IDLE
        );
        services.fingers.update(1 / 60);
        services.animator.update(1 / 60);
        rig.root.updateMatrixWorld(true);
        if (f < 0) continue;

        const square = animator.hugBlend() <= 1e-3;
        const step = Math.floor(phase);
        const hands = {
          left: renderHand(
            rig,
            "left",
            blue,
            blueQuat,
            authoredProps.left?.worldPosition ?? null,
            lockMode
          ),
          right: renderHand(
            rig,
            "right",
            red,
            redQuat,
            authoredProps.right?.worldPosition ?? null,
            lockMode
          ),
        };
        for (const side of ["left", "right"] as const) {
          const hand = hands[side];
          if (!hand) continue;
          score.handFrames++;
          perSequence.handFrames++;
          gaps.push(hand.gapM);
          if (hand.gapM > 0.03) {
            score.gapOver3cm++;
            perSequence.gapOver3cm++;
          }
          if (hand.gapM > 0.06) score.gapOver6cm++;
          if (square) {
            score.squareHandFrames++;
            if (hand.gapM > 0.03) score.squareGapOver3cm++;
          }
          const key = `${entry.id}|${step}|${side}`;
          const prior = beatWorst.get(key);
          if (!prior || hand.gapM > prior.gapM) {
            beatWorst.set(key, {
              sequence: entry.id,
              step,
              side,
              gapM: hand.gapM,
            });
          }

          const grid = authoredProps[side]!.worldPosition;
          const beat = beats.get(`${step}|${side}`);
          const move = radialDepthParts(
            grid,
            (side === "left" ? left : right)!.worldPosition.clone().sub(grid)
          );
          const lock = radialDepthParts(grid, hand.lock);
          const moves = renderedMoves;
          moves.radialInMaxM = Math.max(moves.radialInMaxM, move.radialInM);
          moves.radialOutMaxM = Math.max(moves.radialOutMaxM, -move.radialInM);
          moves.depthMaxAbsM = Math.max(
            moves.depthMaxAbsM,
            Math.abs(move.depthM)
          );
          moves.offPlaneMaxM = Math.max(moves.offPlaneMaxM, move.offPlaneM);
          moves.lockMaxM = Math.max(moves.lockMaxM, hand.lock.length());
          moves.lockOffPlaneMaxM = Math.max(
            moves.lockOffPlaneMaxM,
            lock.offPlaneM
          );
          if (
            !beat &&
            (Math.abs(move.radialInM) > DISPLACED_EPS_M ||
              Math.abs(move.depthM) > DISPLACED_EPS_M ||
              move.offPlaneM > DISPLACED_EPS_M)
          ) {
            score.unlistedDisplacedFrames++;
          }
          if (beat) {
            beat.lockMaxM = Math.max(beat.lockMaxM, hand.lock.length());
            beat.lockTangentialMaxM = Math.max(
              beat.lockTangentialMaxM,
              lock.offPlaneM
            );
          }
        }

        const body = bodySnapshot(rig);
        rig.body.pose();
        const twistRad = wrapAngle(
          boneYaw(rig, "Spine2", rig.rest.chest) -
            boneYaw(rig, "Hips", rig.rest.hips)
        );
        twist.frames++;
        if (Math.abs(twistRad) > TWIST_45_RAD) twist.over45++;
        if (Math.abs(twistRad) > TWIST_60_RAD) twist.over60++;
        const twistDeg = (Math.abs(twistRad) * 180) / Math.PI;
        if (twistDeg > twist.maxDeg) {
          twist.maxDeg = twistDeg;
          twist.maxSequence = entry.id;
        }

        type Staff = { a: Vector3Type; b: Vector3Type };
        const unlocked = (
          prop: HandProp | null,
          quat: QuaternionType | null
        ): Staff | null => {
          if (!prop || !quat) return null;
          const half = new Vector3(0, 1, 0)
            .applyQuaternion(quat)
            .normalize()
            .multiplyScalar(STAFF_HALF_LENGTH_M);
          return {
            a: prop.worldPosition.clone().add(half),
            b: prop.worldPosition.clone().sub(half),
          };
        };
        const staffs: Record<
          StaffStage,
          { left: Staff | null; right: Staff | null }
        > = {
          square: {
            left: unlocked(
              place(authoredProps.left, config.blueLateralOffset, 0),
              blueQuat
            ),
            right: unlocked(
              place(authoredProps.right, config.redLateralOffset, 0),
              redQuat
            ),
          },
          planned: {
            left: unlocked(bluePlanned, blueQuat),
            right: unlocked(redPlanned, redQuat),
          },
          displaced: {
            left: unlocked(blue, blueQuat),
            right: unlocked(red, redQuat),
          },
          rendered: {
            left: hands.left && { a: hands.left.staffA, b: hands.left.staffB },
            right: hands.right && {
              a: hands.right.staffA,
              b: hands.right.staffB,
            },
          },
        };
        const staffHits = perStage(() => ({
          left: [] as StaffContact[],
          right: [] as StaffContact[],
        }));
        for (const stage of STAFF_STAGES) {
          for (const side of ["left", "right"] as const) {
            const staff = staffs[stage][side];
            if (!staff) continue;
            const distances = rig.body.distances(
              staff.a,
              staff.b,
              STAFF_RADIUS_M + NEAR_MISS_M,
              stage === "square" ? "square" : "current",
              STAGE_ZONES[stage]
            );
            const hits = staffHits[stage][side];
            for (const zone of STAGE_ZONES[stage]) {
              if ((distances[zone] ?? Infinity) >= STAFF_RADIUS_M) continue;
              const contact = contactOf(zone, side);
              if (hits.includes(contact)) continue;
              staffThrough[stage][contact]++;
              hits.push(contact);
            }
            if (hits.includes("head") || hits.includes("torso")) {
              perSequence.headTorso[stage]++;
            } else if (
              Math.min(
                distances.head ?? Infinity,
                distances.torso ?? Infinity
              ) <
              STAFF_RADIUS_M + NEAR_MISS_M
            ) {
              staffNearHeadTorso[stage]++;
            }
          }
        }
        const headOrTorso = (contacts: StaffContact[]) =>
          contacts.includes("head") || contacts.includes("torso");
        const chestRad = stance.segments.chestRad;
        for (const side of ["left", "right"] as const) {
          const grid = authoredProps[side]?.worldPosition;
          const rendered = staffHits.rendered[side];
          const planned = staffHits.planned[side];
          if (
            grid &&
            Math.abs(chestRad) > SIDE_ON_RAD &&
            Math.abs(grid.x) < MIDLINE_M
          ) {
            midlineTurned.staffFrames++;
            if (headOrTorso(planned)) midlineTurned.plannedHeadTorso++;
            if (headOrTorso(rendered)) midlineTurned.renderedHeadTorso++;
          }
          for (const zone of ["head", "torso"] as const) {
            if (!rendered.includes(zone)) continue;
            const key = `${entry.id}|${step}|${side}|${zone}`;
            const beat = hitBeats.get(key) ?? {
              sequence: entry.id,
              step,
              side,
              zone,
              frames: 0,
              plannedFrames: 0,
              chestDegMax: 0,
            };
            beat.frames++;
            if (planned.includes(zone)) beat.plannedFrames++;
            beat.chestDegMax = Math.max(
              beat.chestDegMax,
              (Math.abs(chestRad) * 180) / Math.PI
            );
            hitBeats.set(key, beat);
          }
        }

        const laneActive =
          shift.downstageHand !== null &&
          (Math.abs(shift.left.depthM) > DISPLACED_EPS_M ||
            Math.abs(shift.right.depthM) > DISPLACED_EPS_M);
        const routedOver =
          left && right
            ? routedOverHand(left.worldPosition, right.worldPosition)
            : null;
        const mismatch =
          laneActive &&
          routedOver !== null &&
          routedOver !== shift.downstageHand;
        if (mismatch) score.routingLaneMismatchFrames++;

        let forearm: number | null = null;
        if (hands.left && hands.right) {
          score.pairFrames++;
          const leftPalm = services.animator.getPalmWorldPoint(
            "left",
            new Vector3()
          );
          const rightPalm = services.animator.getPalmWorldPoint(
            "right",
            new Vector3()
          );
          // Depth separation planned for the staffs against what the palms
          // reach, downstage hand minus the other, on frames with a lane.
          let lane: { target: number; realized: number } | null = null;
          if (laneActive && leftPalm && rightPalm) {
            const sign = shift.downstageHand === "left" ? 1 : -1;
            const target =
              sign *
              (shift.left.depthM +
                stance.leftDepthOffsetM -
                (shift.right.depthM + stance.rightDepthOffsetM));
            const realized = sign * (leftPalm.z - rightPalm.z);
            lane = { target, realized };
            laneRealization.frames++;
            laneRealization.targetSeparationMeanM += target;
            laneRealization.realizedSeparationMeanM += realized;
            if (realized < target / 2) laneRealization.underHalfFrames++;
          }
          forearm = segmentDistance(
            body.leftElbow,
            body.leftHand,
            body.rightElbow,
            body.rightHand
          );
          forearms.push(forearm);
          if (forearm < 0.08) score.forearmsUnder8cm++;
          if (forearm < 0.06 && mismatch)
            score.routingLaneMismatchForearmsUnder6cm++;
          if (forearm < 0.04) {
            score.forearmsUnder4cm++;
            if (mismatch) score.routingLaneMismatchForearmsUnder4cm++;
            const key = `${entry.id}|${step}`;
            const cluster = clusters.get(key) ?? {
              sequence: entry.id,
              step,
              frames: 0,
              minM: Infinity,
              routingLaneMismatchFrames: 0,
              laneTargetSeparationM: null,
              laneRealizedSeparationM: null,
            };
            cluster.frames++;
            cluster.minM = Math.min(cluster.minM, forearm);
            if (mismatch) cluster.routingLaneMismatchFrames++;
            clusters.set(key, cluster);
            if (lane) {
              const sums = clusterLanes.get(key) ?? {
                frames: 0,
                target: 0,
                realized: 0,
              };
              sums.frames++;
              sums.target += lane.target;
              sums.realized += lane.realized;
              clusterLanes.set(key, sums);
            }
          }
          if (leftPalm && rightPalm) {
            const palm = leftPalm.distanceTo(rightPalm);
            palms.push(palm);
            if (palm < 0.06) score.palmsUnder6cm++;
          }
        }
        options.onFrame?.({
          sequence: entry.id,
          phase,
          authored: {
            left: authoredProps.left?.worldPosition ?? null,
            right: authoredProps.right?.worldPosition ?? null,
          },
          displaced: {
            left: left?.worldPosition ?? null,
            right: right?.worldPosition ?? null,
          },
          shift,
          corridor: {
            left: stance.leftDepthOffsetM,
            right: stance.rightDepthOffsetM,
            chestRad: stance.segments.chestRad,
          },
          body,
          twistRad,
          forearmM: forearm,
          gap: {
            left: hands.left?.gapM ?? null,
            right: hands.right?.gapM ?? null,
          },
          routedOver,
          staffHits,
        });
      }
      sequences.push(perSequence);
    }
  }

  if (laneRealization.frames > 0) {
    laneRealization.targetSeparationMeanM /= laneRealization.frames;
    laneRealization.realizedSeparationMeanM /= laneRealization.frames;
  }
  for (const [key, sums] of clusterLanes) {
    const cluster = clusters.get(key)!;
    cluster.laneTargetSeparationM = sums.target / sums.frames;
    cluster.laneRealizedSeparationM = sums.realized / sums.frames;
  }

  return {
    rig: rigId,
    ...score,
    gapP50M: quantile(gaps, 0.5),
    gapP90M: quantile(gaps, 0.9),
    gapMaxM: quantile(gaps, 1),
    forearmMinM: quantile(forearms, 0),
    palmMinM: quantile(palms, 0),
    staffThrough,
    staffNearHeadTorso,
    staffHitBeats: [...hitBeats.values()].sort(
      (a, b) => b.frames - a.frames || a.sequence.localeCompare(b.sequence)
    ),
    midlineTurned,
    twist,
    displacedBeats,
    cappedBeats: displacedBeats.filter((beat) => beat.capped).length,
    renderedMoves,
    laneRealization,
    forearmClusters: [...clusters.values()].sort(
      (a, b) => b.frames - a.frames || a.minM - b.minM
    ),
    sequences,
    worstBeats: [...beatWorst.values()]
      .sort((a, b) => b.gapM - a.gapM)
      .slice(0, 20),
  };
}
