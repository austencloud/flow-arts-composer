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
 * The per-frame order mirrors `Avatar3D`'s legacy path: props and blend, stance
 * yaw, finger grips, animator update, then the render contact lock, which
 * slides the staff at most `CONTACT_LOCK_MAX_M` toward the palm without
 * rotating it. Idle and walking animation, foot planting and root motion are
 * off, and the tempo is one step per second.
 *
 * Gaps are measured from the palm to the staff's centre line, so the visible
 * gap is roughly a staff radius smaller.
 */

import type {
  Quaternion as QuaternionType,
  Vector3 as Vector3Type,
} from "three";
import { Group, Quaternion, Vector3 } from "three";
import {
  CollisionDetector,
  DEFAULT_SCENE_DIMENSIONS,
  GRID_OFFSETS,
  GripType,
  PLANE_MODE_CONFIGS,
  PlaneMode,
  createAvatarServices,
} from "@austencloud/scene-3d";
import type {
  BodySnapshot,
  CollisionEvent,
  PropSegment,
} from "@austencloud/scene-3d";
import {
  createCharacterInstanceState,
  makeStandaloneDeps,
} from "$lib/shared/3d/state/character-instance-state.svelte";
import {
  buildStanceYawTrackForSource,
  resolveTrackedUpperBodyStance,
} from "$lib/shared/3d/collision/stance-yaw-track";
import { propContinuityCorpus } from "../../tools/prop-continuity-corpus";
import { avatar, loadRig } from "./locomotion-harness";

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
const STAFF_RADIUS_M = 0.012;

const STAFF_ZONES: CollisionEvent["zone"][] = [
  "prop-through-head",
  "prop-through-torso",
  "prop-through-arm",
  "prop-through-prop",
];

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
  staffThroughBody: number;
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
  /** Staff-frames where the rendered staff passes through a body part. */
  staffThrough: Record<string, number>;
  sequences: SequenceScore[];
  worstBeats: WorstBeat[];
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
  services.fingers.initialize(state.fingerChains!, state.meshes);
  services.animator.setContactMode("legacy");
  return { services, root };
}

type Rig = Awaited<ReturnType<typeof buildRig>>;

interface HandProp {
  worldPosition: Vector3Type;
  worldRotation: QuaternionType;
  [key: string]: unknown;
}

interface RenderedHand {
  gapM: number;
  staffA: Vector3Type;
  staffB: Vector3Type;
}

function staffQuat(prop: HandProp | null): QuaternionType | null {
  return prop ? prop.worldRotation.clone().multiply(STAFF_HORIZONTAL) : null;
}

/** Palm-to-axis gap after the clamped render lock, plus the rendered shaft. */
function renderHand(
  rig: Rig,
  side: "left" | "right",
  prop: HandProp | null,
  quat: QuaternionType | null
): RenderedHand | null {
  if (!prop || !quat) return null;
  const palm = rig.services.animator.getPalmWorldPoint(side, new Vector3());
  if (!palm) return null;
  const axis = new Vector3(0, 1, 0).applyQuaternion(quat).normalize();
  const toPalm = palm.clone().sub(prop.worldPosition);
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
    staffA: centre.clone().add(half),
    staffB: centre.clone().sub(half),
  };
}

function bodySnapshot(rig: Rig): BodySnapshot {
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
  const body = {
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
    face: new Vector3(),
  };
  // Same face sphere as the package's computeFaceCenter (not exported): the
  // head joint sits at the skull base, so the face is 8 cm forward, 5 cm up.
  const lateral = body.rightShoulder.clone().sub(body.leftShoulder);
  lateral.y = 0;
  const forward =
    lateral.lengthSq() > 1e-6
      ? new Vector3(-lateral.z, 0, lateral.x).normalize()
      : new Vector3(0, 0, 1);
  body.face.copy(body.head).addScaledVector(forward, 0.08);
  body.face.y += 0.05;
  return body as unknown as BodySnapshot;
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
 * Sweep the corpus on one rig. `limit` trims the corpus for quick local runs;
 * the gates assume the full corpus.
 */
export async function runContactScoreboard(
  rigId: string,
  options: { limit?: number } = {}
): Promise<ContactScore> {
  const mode = PlaneMode.WALL;
  const config = PLANE_MODE_CONFIGS[mode];
  const gridOffset = GRID_OFFSETS[mode];
  const rig = await buildRig(rigId);
  const animator = rig.services.animator as unknown as {
    hugBlend(): number;
    setStanceYawSegments?(segments: unknown): void;
  };
  const detector = new CollisionDetector();
  const gaps: number[] = [];
  const forearms: number[] = [];
  const palms: number[] = [];
  const staffThrough: Record<string, number> = Object.fromEntries(
    STAFF_ZONES.map((zone) => [zone, 0])
  );
  const beatWorst = new Map<string, WorstBeat>();
  const sequences: SequenceScore[] = [];
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
  };

  try {
    const corpus = propContinuityCorpus().slice(0, options.limit);
    for (const entry of corpus) {
      const perSequence: SequenceScore = {
        sequence: entry.id,
        handFrames: 0,
        gapOver3cm: 0,
        staffThroughBody: 0,
      };
      const state = createCharacterInstanceState(
        { id: `scoreboard-${entry.id}`, persistent: false },
        makeStandaloneDeps()
      );
      state.setPlaneMode(mode);
      state.loadSequence(entry.sequence);
      const track = buildStanceYawTrackForSource(state, mode);
      const frames = Math.max(
        1,
        Math.round(state.motionStepCount * FRAMES_PER_STEP)
      );

      for (let f = -WARMUP_FRAMES; f < frames; f++) {
        const phase = Math.max(0, f) / FRAMES_PER_STEP;
        const { left, right } = state.propStatesAtScoreTime(phase);
        const stance = resolveTrackedUpperBodyStance(
          track,
          phase,
          mode,
          left,
          right,
          null
        );
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
          left: renderHand(rig, "left", blue, blueQuat),
          right: renderHand(rig, "right", red, redQuat),
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
        }

        const body = bodySnapshot(rig);
        const segment = (hand: RenderedHand | null): PropSegment | null =>
          hand && { a: hand.staffA, b: hand.staffB, radius: STAFF_RADIUS_M };
        const events = detector.detect(
          body,
          segment(hands.left),
          segment(hands.right),
          step,
          phase - step
        );
        for (const event of events) {
          if (event.zone in staffThrough) {
            staffThrough[event.zone]!++;
            perSequence.staffThroughBody++;
          }
        }

        if (hands.left && hands.right) {
          score.pairFrames++;
          const forearm = segmentDistance(
            body.leftElbow,
            body.leftHand,
            body.rightElbow,
            body.rightHand
          );
          forearms.push(forearm);
          if (forearm < 0.08) score.forearmsUnder8cm++;
          if (forearm < 0.04) score.forearmsUnder4cm++;
          const leftPalm = services.animator.getPalmWorldPoint(
            "left",
            new Vector3()
          );
          const rightPalm = services.animator.getPalmWorldPoint(
            "right",
            new Vector3()
          );
          if (leftPalm && rightPalm) {
            const palm = leftPalm.distanceTo(rightPalm);
            palms.push(palm);
            if (palm < 0.06) score.palmsUnder6cm++;
          }
        }
      }
      sequences.push(perSequence);
    }
  } finally {
    detector.dispose();
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
    sequences,
    worstBeats: [...beatWorst.values()]
      .sort((a, b) => b.gapM - a.gapM)
      .slice(0, 20),
  };
}
