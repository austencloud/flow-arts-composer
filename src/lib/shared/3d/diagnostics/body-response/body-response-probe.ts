/**
 * Body response probe
 *
 * Measures how a spinner's body answers its props on the staff stage, one
 * frame at a time, from the live scene graph: how far the hands reach on the
 * grid, whether each hand is on its staff, whether a staff passes through the
 * head or torso, whether planted feet slide, how often and how high the feet
 * step, and where the pelvis and chest go relative to where the performer
 * stands. The same probe runs before and after the body response lands, so
 * the two sets of numbers are comparable.
 *
 * It reads the pose after the whole animation pipeline has written it, like
 * the gait probe, and reuses that probe's leg-bone discovery
 * (`collectRiggedAvatars`) and its foot floor point (`footFloorY`).
 *
 * The scene contract it relies on (confirmed against the live stage on
 * 2026-10-23):
 *
 * - `PERFORMER_<id>` is the avatar branch; it stands where the performer
 *   stands and turns with their facing.
 * - `PERFORMER_PROP_LEFT` / `PERFORMER_PROP_RIGHT` are its siblings under the
 *   shared rig group, NOT its children. Each sits at its hand's grid centre.
 * - Under each, the prop model (`TKA_FireDoubleStaff` for a fire staff) has
 *   its origin at the hand point (`TKA_Hand_Pivot`).
 *
 * Call `sample(beat, frames)` once per rendered frame; `summary()` and
 * `rows()` read the result. No Svelte, and the per-frame path reuses its
 * vectors; the only per-frame allocation is the row it records.
 */

import { Box3, Matrix4, Quaternion, Vector3, type Object3D } from "three";

import { footFloorY } from "../gait/gait-analysis";
import type { FootFrame } from "../gait/gait-frame";
import {
  collectRiggedAvatars,
  type RiggedAvatar,
} from "../gait/gait-rig-sampler";

/** The parts of a phrase playback frame the probe reads. */
export interface BodyResponseFrameLike {
  phraseIndex?: number;
  facingAngle?: number;
  phrase?: { plane?: string; mode?: string; rest?: boolean };
}

export interface BodyCapsuleSpec {
  name: string;
  /** Bone the capsule starts at (canonical name, without the rig prefix). */
  from: string;
  /** Bone it ends at, or null to end `upM` above `from`. */
  to: string | null;
  upM?: number;
  radiusM: number;
  group: "head" | "torso";
}

/** Estimates for an adult rig; tune them here, not at the call sites. */
export const DEFAULT_BODY_CAPSULES: readonly BodyCapsuleSpec[] = [
  { name: "head", from: "Head", to: null, upM: 0.12, radiusM: 0.1, group: "head" },
  { name: "neck", from: "Neck", to: "Head", radiusM: 0.06, group: "head" },
  { name: "chest", from: "Spine1", to: "Neck", radiusM: 0.14, group: "torso" },
  { name: "waist", from: "Spine", to: "Spine1", radiusM: 0.12, group: "torso" },
  { name: "pelvis", from: "Hips", to: "Spine", radiusM: 0.13, group: "torso" },
];

export interface BodyResponseProbeOptions {
  /**
   * Schedule ids in frame order. Performer i is found at
   * `${rootPrefix}${performerIds[i]}`. Without it, every `rootPrefix` root in
   * the scene is taken in scene order.
   */
  performerIds?: readonly string[];
  /** Default `PERFORMER_phrase-stage-`. */
  rootPrefix?: string;
  /** Prop model name under each prop anchor. Default `TKA_FireDoubleStaff`. */
  propName?: string;
  /** Hand point inside the prop model. Default `TKA_Hand_Pivot`; falls back to the model origin. */
  handPivotName?: string;
  /** Bone name prefix. Default `mixamorig`. */
  bonePrefix?: string;
  capsules?: readonly BodyCapsuleSpec[];
  /** Hand further than this from its staff's centre line counts as off. Default 0.03 m. */
  handGapM?: number;
  /** Foot under this above its floor counts as planted. Default 0.04 m. */
  plantedM?: number;
  /** Foot over this above its floor has left the ground. Default 0.03 m. */
  liftM?: number;
  /** A lifted foot back under this has landed. Default half of `liftM`. */
  landM?: number;
  /**
   * The foot's floor height above the rig root, in metres. Default: read from
   * the data (the 1st percentile of the lower foot's height), because the
   * lowest foot bone of a standing rig sits a couple of centimetres above
   * its sole and the exact amount is the rig's, not ours.
   */
  footFloorM?: number;
  /** Stop recording after this many rows (all performers). Default 40 000. */
  maxRows?: number;
  now?: () => number;
}

/** One performer, one frame. Flat, so it goes straight into a CSV. */
export interface BodyResponseRow {
  t: number;
  dt: number;
  beat: number;
  performer: string;
  phraseIndex: number;
  plane: string;
  mode: string;
  rest: number;
  rootX: number;
  rootZ: number;
  rootYawDeg: number;
  frameFacingDeg: number;
  gridRadiusLeft: number;
  gridRadiusRight: number;
  gridRadius3dLeft: number;
  gridRadius3dRight: number;
  /** How far the contact correction moved the prop's hand point off its grid point. */
  weldLeft: number;
  weldRight: number;
  handGapLeft: number;
  handGapRight: number;
  wristGapLeft: number;
  wristGapRight: number;
  /** Capsule names the left staff is inside, joined with `+`, or empty. */
  hitsLeft: string;
  hitsRight: string;
  /** Lowest foot point above the rig root (not yet above the foot floor). */
  footLeftY: number;
  footRightY: number;
  ankleLeftX: number;
  ankleLeftZ: number;
  ankleRightX: number;
  ankleRightZ: number;
  toeLeftX: number;
  toeLeftZ: number;
  toeRightX: number;
  toeRightZ: number;
  hipsX: number;
  hipsY: number;
  hipsZ: number;
  hipsYawDeg: number;
  chestYawDeg: number;
}

interface PropTrack {
  anchor: Object3D;
  /**
   * The anchor's child on the way to the model: the grid point the score
   * puts the hand on. Between it and the model sit the contact correction
   * groups that weld the prop to the hand.
   */
  gridPoint: Object3D;
  model: Object3D;
  pivot: Object3D;
  /** Staff centre line in the model's own frame, found once. */
  axisLocal: Vector3 | null;
  centreLocal: Vector3;
  halfLength: number;
  meshNames: string[];
}

interface PerformerTrack {
  id: string;
  root: Object3D;
  rig: Object3D;
  legs: RiggedAvatar | null;
  props: [PropTrack | null, PropTrack | null];
  bones: Map<string, Object3D>;
  feet: [FootFrame, FootFrame];
}

const UPPER_BONES = [
  "LeftHand",
  "RightHand",
  "LeftHandMiddle1",
  "RightHandMiddle1",
  "LeftShoulder",
  "RightShoulder",
  "Head",
  "Neck",
  "Spine2",
  "Spine1",
  "Spine",
  "Hips",
  "LeftFoot",
  "RightFoot",
  "LeftToeBase",
  "RightToeBase",
] as const;

const UP = new Vector3(0, 1, 0);
const RAD = 180 / Math.PI;

// --------------------------------------------------------------- geometry

/** Distance from p to segment ab. */
export function pointSegmentDistance(p: Vector3, a: Vector3, b: Vector3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = 0;
  if (len2 > 1e-12) {
    t = ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2;
    t = Math.min(1, Math.max(0, t));
  }
  return Math.hypot(a.x + abx * t - p.x, a.y + aby * t - p.y, a.z + abz * t - p.z);
}

/** Shortest distance between segments p1q1 and p2q2 (Ericson, Real-Time Collision Detection 5.1.9). */
export function segmentSegmentDistance(
  p1: Vector3,
  q1: Vector3,
  p2: Vector3,
  q2: Vector3
): number {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  const EPS = 1e-12;
  let s: number;
  let t: number;
  if (a <= EPS && e <= EPS) {
    s = 0;
    t = 0;
  } else if (a <= EPS) {
    s = 0;
    t = Math.min(1, Math.max(0, f / e));
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= EPS) {
      t = 0;
      s = Math.min(1, Math.max(0, -c / a));
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > EPS ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.min(1, Math.max(0, -c / a));
      } else if (t > 1) {
        t = 1;
        s = Math.min(1, Math.max(0, (b - c) / a));
      }
    }
  }
  return Math.hypot(
    p1.x + d1x * s - (p2.x + d2x * t),
    p1.y + d1y * s - (p2.y + d2y * t),
    p1.z + d1z * s - (p2.z + d2z * t)
  );
}

function wrapDeg(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180;
  if (d === -180) d = 180;
  return d;
}

/** Yaw of a horizontal forward vector, 0 = +z, as `facingAngle` counts it. */
function yawOf(x: number, z: number): number {
  return Math.atan2(x, z);
}

// --------------------------------------------------------------- discovery

function findBone(subtree: Object3D, prefix: string, name: string): Object3D | null {
  const exact = `${prefix}${name}`.toLowerCase();
  let found: Object3D | null = null;
  subtree.traverse((node) => {
    if (!found && node.name.toLowerCase() === exact) found = node;
  });
  if (found) return found;
  // Numbered or namespaced exports: ch07 is `mixamorig8Head`, others
  // `mixamorig:Head`. Strip the prefix and compare whole names, so `Spine`
  // never claims `Spine1`.
  const tail = name.toLowerCase();
  const strip = new RegExp(`^(?:${prefix.toLowerCase()}\\d*[:_]?|.*:)`);
  subtree.traverse((node) => {
    if (found || !(node as { isBone?: boolean }).isBone) return;
    if (node.name.toLowerCase().replace(strip, "") === tail) found = node;
  });
  return found;
}

/** The nearest ancestor of the avatar branch that also holds its prop branches. */
function findRig(root: Object3D): Object3D {
  for (let node = root.parent; node; node = node.parent) {
    if (node.getObjectByName("PERFORMER_PROP_LEFT")) return node;
  }
  return root.parent ?? root;
}

function findProp(
  rig: Object3D,
  anchorName: string,
  propName: string,
  pivotName: string
): PropTrack | null {
  const anchor = rig.getObjectByName(anchorName);
  if (!anchor) return null;
  let model: Object3D | null = anchor.getObjectByName(propName) ?? null;
  if (!model) {
    anchor.traverse((node) => {
      if (model || !node.name.startsWith("TKA_")) return;
      let hasMesh = false;
      node.traverse((n) => {
        if ((n as { isMesh?: boolean }).isMesh) hasMesh = true;
      });
      if (hasMesh) model = node;
    });
  }
  if (!model) return null;
  const found: Object3D = model;
  let gridPoint: Object3D = found;
  while (gridPoint.parent && gridPoint.parent !== anchor) gridPoint = gridPoint.parent;
  return {
    anchor,
    gridPoint,
    model: found,
    pivot: found.getObjectByName(pivotName) ?? found,
    axisLocal: null,
    centreLocal: new Vector3(),
    halfLength: 0,
    meshNames: [],
  };
}

const boxScratch = new Box3();
const meshBox = new Box3();
const toModel = new Matrix4();

/**
 * The staff's centre line in its own frame: the longest side of the box
 * around its meshes, tip to tip. Only the prop's own `TKA_` meshes count, so
 * a flame or trail parented under it cannot stretch the box.
 */
function resolveStaffAxis(prop: PropTrack): boolean {
  prop.model.updateWorldMatrix(true, true);
  const inverse = new Matrix4().copy(prop.model.matrixWorld).invert();
  const meshes: Object3D[] = [];
  prop.model.traverse((node) => {
    if ((node as { isMesh?: boolean }).isMesh) meshes.push(node);
  });
  const own = meshes.filter((m) => m.name.startsWith("TKA_"));
  const used = own.length > 0 ? own : meshes;
  if (used.length === 0) return false;
  boxScratch.makeEmpty();
  for (const mesh of used) {
    const geometry = (mesh as unknown as {
      geometry?: { boundingBox: Box3 | null; computeBoundingBox(): void };
    }).geometry;
    if (!geometry) continue;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) continue;
    toModel.multiplyMatrices(inverse, mesh.matrixWorld);
    meshBox.copy(geometry.boundingBox).applyMatrix4(toModel);
    boxScratch.union(meshBox);
  }
  if (boxScratch.isEmpty()) return false;
  const size = boxScratch.getSize(new Vector3());
  const axis = new Vector3();
  if (size.x >= size.y && size.x >= size.z) axis.set(1, 0, 0);
  else if (size.y >= size.z) axis.set(0, 1, 0);
  else axis.set(0, 0, 1);
  prop.axisLocal = axis;
  prop.halfLength = Math.max(size.x, size.y, size.z) / 2;
  boxScratch.getCenter(prop.centreLocal);
  prop.meshNames = used.map((m) => m.name);
  return true;
}

function emptyFoot(): FootFrame {
  return {
    ankle: { x: 0, y: 0, z: 0 },
    toe: null,
    knee: { x: 0, y: 0, z: 0 },
    hip: { x: 0, y: 0, z: 0 },
    kneeAngle: 180,
    claimedContact: -1,
  };
}

// --------------------------------------------------------------- summary

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))));
  return sorted[i]!;
}

function round(v: number, digits = 4): number {
  if (!Number.isFinite(v)) return v;
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

function range(values: readonly number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [round(lo), round(hi)];
}

export interface FootSummary {
  plantedFrames: number;
  slideSumM: number;
  slideMaxPerFrameM: number;
  steps: number;
  liftMeanM: number;
  liftMaxM: number;
}

export interface BodyResponseStats {
  frames: number;
  gridRadius: { maxM: number; p95M: number; max3dM: number };
  weld: { maxM: number; p95M: number };
  handOff: { left: number; right: number; anyFrames: number; share: number };
  wristOff: { left: number; right: number; share: number };
  handGapP95M: { left: number; right: number };
  /**
   * Frames where a hand is more than `handGapM` further off its shaft than
   * its own usual offset (the median over the performer's whole run). The
   * palm point is read off bones, which sit a couple of centimetres off any
   * held shaft, so this is the count that says a hand left its grip.
   */
  handDrift: { left: number; right: number; anyFrames: number; share: number };
  body: {
    byCapsule: Record<string, number>;
    headFrames: number;
    headShare: number;
    torsoFrames: number;
    torsoShare: number;
  };
  feet: { left: FootSummary; right: FootSummary };
  hipsOffsetM: { x: [number, number]; y: [number, number]; z: [number, number] };
  hipsYawDeg: [number, number];
  chestYawDeg: [number, number];
  /** Frames whose chest yaw jumped more than 30 degrees from the frame before. */
  chestFlip: { frames: number; share: number };
}

interface FootEvents {
  /** Per row index: planted slide this frame (0 when not planted). */
  slide: Float64Array;
  planted: Uint8Array;
  /** Steps, attributed to the row they land on. */
  steps: { row: number; peak: number }[];
}

/**
 * Plant, slide and step for one foot over one performer's rows.
 *
 * Slide is the smaller of the ankle's and the toe's horizontal travel: a foot
 * rolling onto its ball or its heel moves the other joint without sliding,
 * and only a foot whose every point moves is skating.
 */
function footEvents(
  rows: readonly BodyResponseRow[],
  side: "Left" | "Right",
  floor: number,
  thresholds: { plantedM: number; liftM: number; landM: number }
): FootEvents {
  const slide = new Float64Array(rows.length);
  const planted = new Uint8Array(rows.length);
  const steps: { row: number; peak: number }[] = [];
  let lifted = false;
  let peak = 0;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const h = (side === "Left" ? r.footLeftY : r.footRightY) - floor;
    planted[i] = h < thresholds.plantedM ? 1 : 0;
    if (i > 0 && planted[i] && planted[i - 1]) {
      const p = rows[i - 1]!;
      const ankle =
        side === "Left"
          ? Math.hypot(r.ankleLeftX - p.ankleLeftX, r.ankleLeftZ - p.ankleLeftZ)
          : Math.hypot(r.ankleRightX - p.ankleRightX, r.ankleRightZ - p.ankleRightZ);
      const toe =
        side === "Left"
          ? Math.hypot(r.toeLeftX - p.toeLeftX, r.toeLeftZ - p.toeLeftZ)
          : Math.hypot(r.toeRightX - p.toeRightX, r.toeRightZ - p.toeRightZ);
      slide[i] = Number.isFinite(toe) ? Math.min(ankle, toe) : ankle;
    }
    if (!lifted && h > thresholds.liftM) {
      lifted = true;
      peak = h;
    } else if (lifted) {
      peak = Math.max(peak, h);
      if (h < thresholds.landM) {
        lifted = false;
        steps.push({ row: i, peak });
      }
    }
  }
  return { slide, planted, steps };
}

// --------------------------------------------------------------- probe

export interface BodyResponseSummary {
  meta: {
    performers: {
      id: string;
      root: string | null;
      missing: string[];
      bones: Record<string, string>;
      staff: { side: "left" | "right"; meshes: string[]; halfLengthM: number; axisLocal: [number, number, number] }[];
      footFloorAboveRootM: number;
      handGapMedianM: { left: number; right: number };
    }[];
    thresholds: { handGapM: number; plantedM: number; liftM: number; landM: number };
    capsules: readonly BodyCapsuleSpec[];
    beat: { first: number; last: number };
    seconds: number;
    rows: number;
    truncated: boolean;
  };
  fps: { mean: number; p5: number; frames: number };
  performers: Record<string, { overall: BodyResponseStats; planes: Record<string, BodyResponseStats> }>;
}

export interface BodyResponseProbe {
  sample(beat: number, frames: readonly BodyResponseFrameLike[]): void;
  summary(): BodyResponseSummary;
  rows(): BodyResponseRow[];
  reset(): void;
}

export function createBodyResponseProbe(
  scene: Object3D,
  options: BodyResponseProbeOptions = {}
): BodyResponseProbe {
  const rootPrefix = options.rootPrefix ?? "PERFORMER_phrase-stage-";
  const propName = options.propName ?? "TKA_FireDoubleStaff";
  const pivotName = options.handPivotName ?? "TKA_Hand_Pivot";
  const bonePrefix = options.bonePrefix ?? "mixamorig";
  const capsules = options.capsules ?? DEFAULT_BODY_CAPSULES;
  const handGapM = options.handGapM ?? 0.03;
  const plantedM = options.plantedM ?? 0.04;
  const liftM = options.liftM ?? 0.03;
  const landM = options.landM ?? liftM / 2;
  const maxRows = options.maxRows ?? 40_000;
  const now = options.now ?? (() => performance.now());

  let tracks: PerformerTrack[] | null = null;
  let records: BodyResponseRow[] = [];
  const frameTimes: number[] = [];
  let startedAt = -1;
  let lastAt = -1;
  let truncated = false;

  // Scratch, reused every frame.
  const vRoot = new Vector3();
  const vA = new Vector3();
  const vB = new Vector3();
  const vC = new Vector3();
  const vD = new Vector3();
  const vN = new Vector3();
  const vPalm = new Vector3();
  const qRoot = new Quaternion();
  const qInv = new Quaternion();
  const staffEnds: [Vector3, Vector3][] = [
    [new Vector3(), new Vector3()],
    [new Vector3(), new Vector3()],
  ];
  const staffOk: [boolean, boolean] = [false, false];

  function discover(): PerformerTrack[] {
    const roots: { id: string; root: Object3D | null }[] = [];
    if (options.performerIds) {
      for (const id of options.performerIds)
        roots.push({ id, root: scene.getObjectByName(`${rootPrefix}${id}`) ?? null });
    } else {
      scene.traverse((node) => {
        if (node.name.startsWith(rootPrefix))
          roots.push({ id: node.name.slice(rootPrefix.length), root: node });
      });
    }
    const avatars = collectRiggedAvatars(scene);
    return roots
      .filter((r): r is { id: string; root: Object3D } => !!r.root)
      .map(({ id, root }) => {
        const rig = findRig(root);
        const bones = new Map<string, Object3D>();
        for (const name of UPPER_BONES) {
          const bone = findBone(root, bonePrefix, name);
          if (bone) bones.set(name, bone);
        }
        const legs =
          avatars.find((a) => {
            for (let n: Object3D | null = a.hips; n; n = n.parent) if (n === root) return true;
            return false;
          }) ?? null;
        return {
          id,
          root,
          rig,
          legs,
          props: [
            findProp(rig, "PERFORMER_PROP_LEFT", propName, pivotName),
            findProp(rig, "PERFORMER_PROP_RIGHT", propName, pivotName),
          ],
          bones,
          feet: [emptyFoot(), emptyFoot()],
        };
      });
  }

  function ensureTracks(): PerformerTrack[] {
    // Re-discover until every performer has its bones and props: the stage
    // mounts its bodies and props over several frames.
    const complete = (t: PerformerTrack) =>
      t.legs && t.props[0] && t.props[1] && t.bones.has("Head");
    if (!tracks || tracks.length === 0 || !tracks.every(complete)) tracks = discover();
    return tracks;
  }

  function planeNormal(plane: string, out: Vector3): Vector3 | null {
    if (plane === "wall") out.set(0, 0, 1);
    else if (plane === "wheel") out.set(1, 0, 0);
    else if (plane === "floor") out.set(0, 1, 0);
    else return null;
    return out.applyQuaternion(qRoot);
  }

  function capsuleEnds(track: PerformerTrack, spec: BodyCapsuleSpec): boolean {
    const from = track.bones.get(spec.from);
    if (!from) return false;
    from.getWorldPosition(vC);
    if (spec.to === null) {
      vD.copy(vC).addScaledVector(UP, spec.upM ?? 0.12);
      return true;
    }
    const to = track.bones.get(spec.to);
    if (!to) return false;
    to.getWorldPosition(vD);
    return true;
  }

  function sampleTrack(
    track: PerformerTrack,
    t: number,
    dt: number,
    beat: number,
    frame: BodyResponseFrameLike | undefined
  ): BodyResponseRow {
    track.rig.updateWorldMatrix(true, true);
    track.root.getWorldPosition(vRoot);
    track.root.getWorldQuaternion(qRoot);
    qInv.copy(qRoot).invert();
    vA.set(0, 0, 1).applyQuaternion(qRoot);
    const rootYaw = yawOf(vA.x, vA.z);
    const plane = frame?.phrase?.plane ?? "";

    const row: BodyResponseRow = {
      t: round(t, 2),
      dt: round(dt, 2),
      beat: round(beat, 4),
      performer: track.id,
      phraseIndex: frame?.phraseIndex ?? -1,
      plane,
      mode: frame?.phrase?.mode ?? "",
      rest: frame?.phrase?.rest ? 1 : 0,
      rootX: round(vRoot.x),
      rootZ: round(vRoot.z),
      rootYawDeg: round(rootYaw * RAD, 2),
      frameFacingDeg: round((frame?.facingAngle ?? NaN) * RAD, 2),
      gridRadiusLeft: NaN,
      gridRadiusRight: NaN,
      gridRadius3dLeft: NaN,
      gridRadius3dRight: NaN,
      weldLeft: NaN,
      weldRight: NaN,
      handGapLeft: NaN,
      handGapRight: NaN,
      wristGapLeft: NaN,
      wristGapRight: NaN,
      hitsLeft: "",
      hitsRight: "",
      footLeftY: NaN,
      footRightY: NaN,
      ankleLeftX: NaN,
      ankleLeftZ: NaN,
      ankleRightX: NaN,
      ankleRightZ: NaN,
      toeLeftX: NaN,
      toeLeftZ: NaN,
      toeRightX: NaN,
      toeRightZ: NaN,
      hipsX: NaN,
      hipsY: NaN,
      hipsZ: NaN,
      hipsYawDeg: NaN,
      chestYawDeg: NaN,
    };

    // Props: grid radius, staff line, hand gap.
    const normal = planeNormal(plane, vN);
    for (let s = 0; s < 2; s++) {
      staffOk[s] = false;
      const prop = track.props[s];
      if (!prop) continue;
      if (!prop.axisLocal && !resolveStaffAxis(prop)) continue;
      prop.anchor.getWorldPosition(vA);
      prop.gridPoint.getWorldPosition(vB);
      prop.pivot.getWorldPosition(vC);
      const weld = vC.distanceTo(vB);
      vB.sub(vA);
      const r3 = vB.length();
      if (normal) vB.addScaledVector(normal, -vB.dot(normal));
      const [a, b] = staffEnds[s]!;
      a.copy(prop.centreLocal).addScaledVector(prop.axisLocal!, -prop.halfLength);
      b.copy(prop.centreLocal).addScaledVector(prop.axisLocal!, prop.halfLength);
      prop.model.localToWorld(a);
      prop.model.localToWorld(b);
      staffOk[s] = true;

      const side = s === 0 ? "Left" : "Right";
      let wrist = NaN;
      let palm = NaN;
      const hand = track.bones.get(`${side}Hand`);
      if (hand) {
        hand.getWorldPosition(vC);
        wrist = pointSegmentDistance(vC, a, b);
        // The grip is in the palm, between the wrist and the middle knuckle;
        // the wrist joint itself sits several centimetres off any held shaft.
        const knuckle = track.bones.get(`${side}HandMiddle1`);
        if (knuckle) {
          knuckle.getWorldPosition(vPalm);
          vPalm.add(vC).multiplyScalar(0.5);
          palm = pointSegmentDistance(vPalm, a, b);
        } else palm = wrist;
      }
      if (s === 0) {
        row.gridRadiusLeft = round(vB.length());
        row.gridRadius3dLeft = round(r3);
        row.weldLeft = round(weld);
        row.handGapLeft = round(palm);
        row.wristGapLeft = round(wrist);
      } else {
        row.gridRadiusRight = round(vB.length());
        row.gridRadius3dRight = round(r3);
        row.weldRight = round(weld);
        row.handGapRight = round(palm);
        row.wristGapRight = round(wrist);
      }
    }

    // Staff lines against the body capsules.
    let hitsL = "";
    let hitsR = "";
    for (const spec of capsules) {
      if (!capsuleEnds(track, spec)) continue;
      for (let s = 0; s < 2; s++) {
        if (!staffOk[s]) continue;
        const [a, b] = staffEnds[s]!;
        if (segmentSegmentDistance(a, b, vC, vD) < spec.radiusM) {
          if (s === 0) hitsL = hitsL ? `${hitsL}+${spec.name}` : spec.name;
          else hitsR = hitsR ? `${hitsR}+${spec.name}` : spec.name;
        }
      }
    }
    row.hitsLeft = hitsL;
    row.hitsRight = hitsR;

    // Feet, through the gait probe's foot floor point.
    if (track.legs) {
      const legs = [track.legs.left, track.legs.right] as const;
      for (let s = 0; s < 2; s++) {
        const leg = legs[s]!;
        const foot = track.feet[s]!;
        leg.ankle.getWorldPosition(vA);
        foot.ankle.x = vA.x;
        foot.ankle.y = vA.y - vRoot.y;
        foot.ankle.z = vA.z;
        if (leg.toe) {
          leg.toe.getWorldPosition(vB);
          foot.toe ??= { x: 0, y: 0, z: 0 };
          foot.toe.x = vB.x;
          foot.toe.y = vB.y - vRoot.y;
          foot.toe.z = vB.z;
        } else foot.toe = null;
        const y = round(footFloorY(foot));
        if (s === 0) {
          row.footLeftY = y;
          row.ankleLeftX = round(foot.ankle.x);
          row.ankleLeftZ = round(foot.ankle.z);
          row.toeLeftX = foot.toe ? round(foot.toe.x) : NaN;
          row.toeLeftZ = foot.toe ? round(foot.toe.z) : NaN;
        } else {
          row.footRightY = y;
          row.ankleRightX = round(foot.ankle.x);
          row.ankleRightZ = round(foot.ankle.z);
          row.toeRightX = foot.toe ? round(foot.toe.x) : NaN;
          row.toeRightZ = foot.toe ? round(foot.toe.z) : NaN;
        }
      }
      // Hips yaw off the hip joints, as the gait probe reads facing.
      track.legs.left.hip.getWorldPosition(vA);
      track.legs.right.hip.getWorldPosition(vB);
      vB.sub(vA).setY(0);
      if (vB.lengthSq() > 1e-10) {
        vC.crossVectors(UP, vB);
        row.hipsYawDeg = round(wrapDeg((yawOf(vC.x, vC.z) - rootYaw) * RAD), 2);
      }
    }

    // Pelvis offset in the rig's own frame.
    const hips = track.bones.get("Hips") ?? track.legs?.hips;
    if (hips) {
      hips.getWorldPosition(vA).sub(vRoot).applyQuaternion(qInv);
      row.hipsX = round(vA.x);
      row.hipsY = round(vA.y);
      row.hipsZ = round(vA.z);
    }

    // Chest yaw: the clavicle roots are Spine2's children, so the line
    // between them is Spine2's own left-right axis whatever its rest pose.
    const ls = track.bones.get("LeftShoulder");
    const rs = track.bones.get("RightShoulder");
    if (ls && rs) {
      ls.getWorldPosition(vA);
      rs.getWorldPosition(vB);
      vB.sub(vA).setY(0);
      if (vB.lengthSq() > 1e-10) {
        vC.crossVectors(UP, vB);
        row.chestYawDeg = round(wrapDeg((yawOf(vC.x, vC.z) - rootYaw) * RAD), 2);
      }
    }
    return row;
  }

  function statsFor(
    rows: readonly BodyResponseRow[],
    feet: { left: FootEvents; right: FootEvents },
    indices: readonly number[],
    baseline: { left: number; right: number }
  ): BodyResponseStats {
    const n = indices.length;
    const radii: number[] = [];
    let max3d = 0;
    let offL = 0, offR = 0, offAny = 0, wristL = 0, wristR = 0, wristAny = 0;
    let driftL = 0, driftR = 0, driftAny = 0;
    const gapsL: number[] = [];
    const gapsR: number[] = [];
    const byCapsule: Record<string, number> = {};
    for (const c of capsules) byCapsule[c.name] = 0;
    const groupOf = new Map(capsules.map((c) => [c.name, c.group]));
    let headFrames = 0;
    let torsoFrames = 0;
    const welds: number[] = [];
    let flips = 0;
    const hx: number[] = [], hy: number[] = [], hz: number[] = [], hyaw: number[] = [], cyaw: number[] = [];

    for (const i of indices) {
      const r = rows[i]!;
      for (const v of [r.gridRadiusLeft, r.gridRadiusRight]) if (Number.isFinite(v)) radii.push(v);
      for (const v of [r.gridRadius3dLeft, r.gridRadius3dRight]) if (Number.isFinite(v)) max3d = Math.max(max3d, v);
      for (const v of [r.weldLeft, r.weldRight]) if (Number.isFinite(v)) welds.push(v);
      const before = i > 0 ? rows[i - 1]!.chestYawDeg : NaN;
      if (Number.isFinite(before) && Number.isFinite(r.chestYawDeg) && Math.abs(wrapDeg(r.chestYawDeg - before)) > 30) flips++;
      const l = r.handGapLeft > handGapM;
      const rr = r.handGapRight > handGapM;
      if (l) offL++;
      if (rr) offR++;
      if (l || rr) offAny++;
      const dl = r.handGapLeft > baseline.left + handGapM;
      const dr = r.handGapRight > baseline.right + handGapM;
      if (dl) driftL++;
      if (dr) driftR++;
      if (dl || dr) driftAny++;
      const wl = r.wristGapLeft > handGapM;
      const wr = r.wristGapRight > handGapM;
      if (wl) wristL++;
      if (wr) wristR++;
      if (wl || wr) wristAny++;
      if (Number.isFinite(r.handGapLeft)) gapsL.push(r.handGapLeft);
      if (Number.isFinite(r.handGapRight)) gapsR.push(r.handGapRight);
      const hit = new Set([...r.hitsLeft.split("+"), ...r.hitsRight.split("+")].filter(Boolean));
      let head = false;
      let torso = false;
      for (const name of hit) {
        byCapsule[name] = (byCapsule[name] ?? 0) + 1;
        if (groupOf.get(name) === "head") head = true;
        else torso = true;
      }
      if (head) headFrames++;
      if (torso) torsoFrames++;
      if (Number.isFinite(r.hipsX)) {
        hx.push(r.hipsX);
        hy.push(r.hipsY);
        hz.push(r.hipsZ);
      }
      if (Number.isFinite(r.hipsYawDeg)) hyaw.push(r.hipsYawDeg);
      if (Number.isFinite(r.chestYawDeg)) cyaw.push(r.chestYawDeg);
    }
    radii.sort((a, b) => a - b);
    welds.sort((a, b) => a - b);
    gapsL.sort((a, b) => a - b);
    gapsR.sort((a, b) => a - b);

    const foot = (ev: FootEvents): FootSummary => {
      let planted = 0, sum = 0, max = 0;
      const set = new Set(indices);
      for (const i of indices) {
        if (ev.planted[i]) planted++;
        sum += ev.slide[i]!;
        max = Math.max(max, ev.slide[i]!);
      }
      const steps = ev.steps.filter((s) => set.has(s.row));
      const peaks = steps.map((s) => s.peak);
      return {
        plantedFrames: planted,
        slideSumM: round(sum),
        slideMaxPerFrameM: round(max),
        steps: steps.length,
        liftMeanM: round(peaks.length ? peaks.reduce((a, b) => a + b, 0) / peaks.length : 0),
        liftMaxM: round(peaks.length ? Math.max(...peaks) : 0),
      };
    };
    const share = (k: number) => (n ? round(k / n, 4) : 0);
    return {
      frames: n,
      gridRadius: {
        maxM: round(radii.length ? radii[radii.length - 1]! : NaN),
        p95M: round(quantile(radii, 0.95)),
        max3dM: round(max3d),
      },
      weld: { maxM: round(welds.length ? welds[welds.length - 1]! : NaN), p95M: round(quantile(welds, 0.95)) },
      handOff: { left: offL, right: offR, anyFrames: offAny, share: share(offAny) },
      wristOff: { left: wristL, right: wristR, share: share(wristAny) },
      handGapP95M: { left: round(quantile(gapsL, 0.95)), right: round(quantile(gapsR, 0.95)) },
      handDrift: { left: driftL, right: driftR, anyFrames: driftAny, share: share(driftAny) },
      body: {
        byCapsule,
        headFrames,
        headShare: share(headFrames),
        torsoFrames,
        torsoShare: share(torsoFrames),
      },
      feet: { left: foot(feet.left), right: foot(feet.right) },
      hipsOffsetM: { x: range(hx), y: range(hy), z: range(hz) },
      hipsYawDeg: range(hyaw),
      chestYawDeg: range(cyaw),
      chestFlip: { frames: flips, share: share(flips) },
    };
  }

  /** The foot floor for one performer: given, or the 1st percentile of the lower foot. */
  function footFloorFor(rows: readonly BodyResponseRow[]): number {
    if (options.footFloorM !== undefined) return options.footFloorM;
    const lows = rows
      .map((r) => Math.min(r.footLeftY, r.footRightY))
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    return lows.length ? quantile(lows, 0.01) : 0;
  }

  return {
    sample(beat, frames) {
      const t = now();
      if (startedAt < 0) startedAt = t;
      const dt = lastAt < 0 ? 0 : t - lastAt;
      lastAt = t;
      if (dt > 0) frameTimes.push(dt);
      if (records.length >= maxRows) {
        truncated = true;
        return;
      }
      const list = ensureTracks();
      for (let i = 0; i < list.length; i++) {
        records.push(sampleTrack(list[i]!, (t - startedAt) / 1000, dt, beat, frames[i]));
      }
    },

    rows() {
      return records.slice();
    },

    reset() {
      records = [];
      frameTimes.length = 0;
      startedAt = -1;
      lastAt = -1;
      truncated = false;
    },

    summary() {
      const list = tracks ?? [];
      const thresholds = { handGapM, plantedM, liftM, landM };
      const out: BodyResponseSummary["performers"] = {};
      const metaPerformers: BodyResponseSummary["meta"]["performers"] = [];
      for (const track of list) {
        const mine = records.filter((r) => r.performer === track.id);
        const floor = footFloorFor(mine);
        const feet = {
          left: footEvents(mine, "Left", floor, thresholds),
          right: footEvents(mine, "Right", floor, thresholds),
        };
        const all = mine.map((_, i) => i);
        const planes: Record<string, BodyResponseStats> = {};
        const byPlane = new Map<string, number[]>();
        mine.forEach((r, i) => {
          const key = r.plane || "unknown";
          const bucket = byPlane.get(key) ?? [];
          bucket.push(i);
          byPlane.set(key, bucket);
        });
        const median = (key: "handGapLeft" | "handGapRight") =>
          quantile(mine.map((r) => r[key]).filter(Number.isFinite).sort((a, b) => a - b), 0.5);
        const baseline = { left: median("handGapLeft"), right: median("handGapRight") };
        for (const [plane, idx] of byPlane) planes[plane] = statsFor(mine, feet, idx, baseline);
        out[track.id] = { overall: statsFor(mine, feet, all, baseline), planes };

        const missing = UPPER_BONES.filter((b) => !track.bones.has(b)).map(String);
        if (!track.legs) missing.push("legs (collectRiggedAvatars)");
        if (!track.props[0]) missing.push("PERFORMER_PROP_LEFT model");
        if (!track.props[1]) missing.push("PERFORMER_PROP_RIGHT model");
        metaPerformers.push({
          id: track.id,
          root: track.root.name,
          missing,
          bones: Object.fromEntries([...track.bones].map(([k, v]) => [k, v.name])),
          staff: track.props.flatMap((p, s) =>
            p?.axisLocal
              ? [
                  {
                    side: s === 0 ? ("left" as const) : ("right" as const),
                    meshes: p.meshNames,
                    halfLengthM: round(p.halfLength),
                    axisLocal: [p.axisLocal.x, p.axisLocal.y, p.axisLocal.z] as [number, number, number],
                  },
                ]
              : []
          ),
          footFloorAboveRootM: round(floor),
          handGapMedianM: { left: round(baseline.left), right: round(baseline.right) },
        });
      }
      const sortedFps = frameTimes.map((ms) => 1000 / ms).sort((a, b) => a - b);
      const totalMs = frameTimes.reduce((a, b) => a + b, 0);
      return {
        meta: {
          performers: metaPerformers,
          thresholds,
          capsules,
          beat: {
            first: records[0]?.beat ?? NaN,
            last: records[records.length - 1]?.beat ?? NaN,
          },
          seconds: round(totalMs / 1000, 2),
          rows: records.length,
          truncated,
        },
        fps: {
          mean: round(totalMs > 0 ? (frameTimes.length * 1000) / totalMs : 0, 1),
          p5: round(quantile(sortedFps, 0.05), 1),
          frames: frameTimes.length + (frameTimes.length ? 1 : 0),
        },
        performers: out,
      };
    },
  };
}
