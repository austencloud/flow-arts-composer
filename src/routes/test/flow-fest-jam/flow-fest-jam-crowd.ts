/**
 * The jam's crowd: watchers along the rope, the safety people in their chairs
 * and the DJ, all real character models, posed by a handful of shared
 * skeletons instead of one full rig each.
 *
 * Each "driver" is one clone of a character with its own mixer playing an idle
 * (standing or sitting) clip. Every figure that wears that character binds its
 * own SkinnedMesh to the driver's skeleton, so a hundred people cost a dozen
 * mixer updates and a dozen bone-texture uploads a frame. Two or three drivers
 * per character at different clip times keep neighbours from breathing in
 * unison. A figure turns by turning its placement group, which is all the
 * watchers' "notice" needs.
 *
 * The shared sitting clip was made for a low seat: knees drawn up, arms round
 * them, feet in the air. On a camp chair the legs are re-bent each update so
 * the thighs lie along the seat and the feet stand on the ground, and the
 * hands come to rest on the thighs (see `seatOnChair`).
 *
 * Both clips are renamed onto the model's bone prefix the way the scene
 * package's loaders do it, but against every bone in the model. The shared
 * seated-audience loader reads one mesh's skeleton, which in most of the cast
 * is the eyelashes, so it can only seat the museum's six.
 *
 * The character models come in five to seven pieces (body, shirt, trousers,
 * shoes, hair, eyelashes) over two materials. A figure draws one merged piece
 * per material, so a person costs two draw calls rather than seven.
 */

import {
  AnimationClip,
  type Bone,
  type BufferGeometry,
  DetachedBindMode,
  AnimationMixer,
  Color,
  Group,
  LoopRepeat,
  Quaternion,
  type Matrix4,
  Skeleton,
  Sphere,
  Vector3,
  type KeyframeTrack,
  type Material,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { SkinnedMesh as SkinnedMeshClass } from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const JAM_STANDING_IDLE_URL = "/animations/locomotion-pack/idle.glb";

const gltfLoader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();

/** One fetch and parse per URL however many kinds share it. */
function loadGltf(url: string): Promise<GLTF> {
  let pending = gltfCache.get(url);
  if (!pending) {
    pending = gltfLoader.loadAsync(url);
    gltfCache.set(url, pending);
    void pending.catch(() => gltfCache.delete(url));
  }
  return pending;
}

type Fbx = Object3D & { animations: AnimationClip[] };
const fbxLoader = new FBXLoader();
const fbxCache = new Map<string, Promise<Fbx>>();

function loadFbx(url: string): Promise<Fbx> {
  let pending = fbxCache.get(url);
  if (!pending) {
    pending = fbxLoader.loadAsync(url) as Promise<Fbx>;
    fbxCache.set(url, pending);
    void pending.catch(() => fbxCache.delete(url));
  }
  return pending;
}

function firstSkinnedMesh(root: Object3D): SkinnedMesh | null {
  let found: SkinnedMesh | null = null;
  root.traverse((child) => {
    if (!found && (child as SkinnedMesh).isSkinnedMesh) found = child as SkinnedMesh;
  });
  return found;
}

/**
 * Every bone name in a model. Not one mesh's skeleton: in several characters
 * the first skinned mesh is the eyelashes or the shoes, bound to a handful of
 * bones with no arms and sometimes no hips.
 */
function boneNames(root: Object3D): Set<string> {
  const names = new Set<string>();
  root.traverse((child) => {
    if ((child as Bone).isBone) names.add(child.name);
  });
  return names;
}

function bonePrefix(names: ReadonlySet<string>): string {
  for (const name of names) {
    const at = name.indexOf("Hips");
    if (at !== -1) return name.slice(0, at);
  }
  return "";
}

const CLIP_PREFIXES = ["mixamorig1", "mixamorig:", "mixamorig", ""];

/**
 * The standing idle on this model's bones: rotations only, with the pelvis
 * rotation left out (Mixamo's separate exports bake the character's base
 * orientation into it) and every position track dropped so the figure stays
 * on its spot.
 */
function standingIdleFor(model: Object3D, raw: AnimationClip): AnimationClip {
  const names = boneNames(model);
  const modelPrefix = bonePrefix(names);
  const first = raw.tracks[0]?.name.split(".")[0] ?? "";
  const clipPrefix = CLIP_PREFIXES.find((p) => p && first.startsWith(p)) ?? "";
  const tracks: KeyframeTrack[] = [];
  for (const track of raw.tracks) {
    const dot = track.name.indexOf(".");
    if (dot === -1) continue;
    const property = track.name.slice(dot);
    if (property !== ".quaternion") continue;
    const core = track.name.slice(clipPrefix.length, dot);
    if (core === "Hips") continue;
    const target = `${modelPrefix}${core}`;
    if (!names.has(target)) continue;
    const cloned = track.clone();
    cloned.name = `${target}${property}`;
    tracks.push(cloned);
  }
  return new AnimationClip("jam-standing-idle", raw.duration, tracks);
}

/**
 * The sitting clip on this model's bones, built as the shared seated-audience
 * loader builds it: every rotation, plus the pelvis position from centimetres
 * to metres so the hips drop to seat height.
 */
function sittingClipFor(model: Object3D, raw: AnimationClip, clipPrefix: string): AnimationClip {
  const names = boneNames(model);
  const modelPrefix = bonePrefix(names);
  const tracks: KeyframeTrack[] = [];
  for (const track of raw.tracks) {
    const dot = track.name.lastIndexOf(".");
    if (dot === -1) continue;
    const bone = track.name.slice(0, dot);
    const property = track.name.slice(dot);
    const hipsPosition = property === ".position" && bone.includes("Hips");
    if (property === ".position" && !hipsPosition) continue;
    const core = clipPrefix && bone.startsWith(clipPrefix) ? bone.slice(clipPrefix.length) : bone;
    const target = `${modelPrefix}${core}`;
    if (!names.has(target)) continue;
    const cloned = track.clone();
    cloned.name = `${target}${property}`;
    if (hipsPosition) for (let i = 0; i < cloned.values.length; i++) cloned.values[i] = cloned.values[i]! * 0.01;
    tracks.push(cloned);
  }
  return new AnimationClip(raw.name || "sitting-idle", raw.duration, tracks);
}

/**
 * One draw of a figure: a source mesh, or several that share a material merged
 * onto one skeleton.
 */
interface Part {
  source: SkinnedMesh;
  geometry: BufferGeometry;
  skeleton: Skeleton;
}

interface Driver {
  root: Object3D;
  mixer: AnimationMixer;
  meshes: SkinnedMesh[];
  parts: Part[];
  /** Set for a sitting figure on a chair: re-bends the clip's limbs each update. */
  chair?: ChairPose;
}

/** Three bones of a leg or arm, root to tip. */
interface Limb {
  upper: Bone;
  lower: Bone;
  end: Bone;
  /** +1 for the left side of the body, -1 for the right, in root space (+x is the figure's left). */
  side: number;
}

interface ChairPose {
  /** The ground under the chair, root space. */
  floorY: number;
  legs: Limb[];
  arms: Limb[];
}

const ik = {
  hip: new Vector3(),
  knee: new Vector3(),
  tip: new Vector3(),
  target: new Vector3(),
  dir: new Vector3(),
  pole: new Vector3(),
  from: new Vector3(),
  to: new Vector3(),
  turn: new Quaternion(),
  world: new Quaternion(),
  parent: new Quaternion(),
  keep: new Quaternion(),
};

/** Turn a bone in world space so the direction `from` points along `to`. */
function swing(bone: Bone, from: Vector3, to: Vector3): void {
  ik.turn.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(ik.world).premultiply(ik.turn);
  bone.parent!.getWorldQuaternion(ik.parent).invert();
  bone.quaternion.copy(ik.parent.multiply(ik.world));
  bone.updateMatrixWorld(true);
}

/**
 * Two-bone reach: bend the limb so its tip lands on `target`, the middle joint
 * pushed toward `pole`. The tip keeps its world orientation.
 */
function reach(limb: Limb, target: Vector3, pole: Vector3): void {
  const { hip, knee, tip, dir } = ik;
  limb.end.getWorldQuaternion(ik.keep);
  limb.upper.getWorldPosition(hip);
  limb.lower.getWorldPosition(knee);
  limb.end.getWorldPosition(tip);
  const l1 = hip.distanceTo(knee);
  const l2 = knee.distanceTo(tip);
  dir.subVectors(target, hip);
  const d = Math.min(Math.max(dir.length(), Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.999);
  dir.normalize();
  const cos = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  ik.pole.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  // Where the middle joint goes, then turn the upper bone onto it.
  ik.to.copy(hip).addScaledVector(dir, cos * l1).addScaledVector(ik.pole, Math.sqrt(Math.max(0, 1 - cos * cos)) * l1).sub(hip);
  ik.from.subVectors(knee, hip);
  swing(limb.upper, ik.from, ik.to);
  // Then the lower bone onto the target.
  limb.lower.getWorldPosition(knee);
  limb.end.getWorldPosition(tip);
  ik.from.subVectors(tip, knee);
  ik.to.copy(hip).addScaledVector(dir, d).sub(knee);
  swing(limb.lower, ik.from, ik.to);
  limb.end.parent!.getWorldQuaternion(ik.parent).invert();
  limb.end.quaternion.copy(ik.parent.multiply(ik.keep));
  limb.end.updateMatrixWorld(true);
}

/** Ankle bone height above the sole, metres. */
const ANKLE_ABOVE_SOLE = 0.08;

/**
 * Sit the driver properly on a chair: thighs along the seat, shins down, feet
 * flat on the ground a little apart, hands resting on the thighs. The figure
 * faces +z in root space.
 */
function applyChairPose(pose: ChairPose): void {
  const target = new Vector3();
  const pole = new Vector3();
  const knees: Vector3[] = [];
  for (const leg of pose.legs) {
    leg.upper.getWorldPosition(ik.hip);
    const hipX = ik.hip.x;
    const hipZ = ik.hip.z;
    leg.lower.getWorldPosition(ik.knee);
    const thigh = ik.hip.distanceTo(ik.knee);
    target.set(hipX + leg.side * 0.06, pose.floorY + ANKLE_ABOVE_SOLE, hipZ + thigh * 0.92);
    reach(leg, target, pole.set(0, 1, 1));
    knees.push(leg.lower.getWorldPosition(new Vector3()));
  }
  pose.arms.forEach((arm, i) => {
    const leg = pose.legs.find((l) => l.side === arm.side) ?? pose.legs[i];
    if (!leg) return;
    leg.upper.getWorldPosition(ik.hip);
    const knee = knees[pose.legs.indexOf(leg)]!;
    // Two thirds of the way down the thigh, on top of it.
    target.copy(ik.hip).lerp(knee, 0.62);
    target.y += 0.11;
    target.x += arm.side * 0.03;
    reach(arm, target, pole.set(arm.side, -0.4, -1));
  });
}

function limb(root: Object3D, upper: string, lower: string, end: string, side: number): Limb | null {
  const found = new Map<string, Bone>();
  root.traverse((o) => {
    if (!(o as Bone).isBone) return;
    for (const name of [upper, lower, end]) if (o.name.endsWith(name)) found.set(name, o as Bone);
  });
  const [a, b, c] = [found.get(upper), found.get(lower), found.get(end)];
  return a && b && c ? { upper: a, lower: b, end: c, side } : null;
}

function chairPoseFor(root: Object3D, floorY: number): ChairPose | null {
  const legs = [limb(root, "LeftUpLeg", "LeftLeg", "LeftFoot", 1), limb(root, "RightUpLeg", "RightLeg", "RightFoot", -1)];
  const arms = [limb(root, "LeftArm", "LeftForeArm", "LeftHand", 1), limb(root, "RightArm", "RightForeArm", "RightHand", -1)];
  if (legs.some((l) => !l)) return null;
  return { floorY, legs: legs as Limb[], arms: arms.filter((a): a is Limb => !!a) };
}

/** A merged geometry and the bone order its skin indices refer to. */
interface Merged {
  geometry: BufferGeometry;
  boneNames: string[];
  boneInverses: Matrix4[];
}

const mergedCache = new Map<string, Merged | null>();

/** mergeGeometries needs the same attributes and indexing throughout, and no morphs. */
function mergeable(geometries: readonly BufferGeometry[]): boolean {
  const shape = (g: BufferGeometry) =>
    [
      g.index ? "i" : "n",
      ...Object.keys(g.attributes)
        .sort()
        .map((name) => {
          const a = g.getAttribute(name);
          return `${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`;
        }),
    ].join(",");
  const first = shape(geometries[0]!);
  return geometries.every((g) => shape(g) === first && Object.keys(g.morphAttributes).length === 0);
}

/**
 * Several pieces as one geometry. glTF gives each piece its own skin, so each
 * piece's skin indices are renumbered onto one bone list, the union of theirs
 * by bone name. Null if the pieces disagree on a bone's bind pose.
 */
function mergePieces(list: readonly SkinnedMesh[]): Merged | null {
  const boneNames: string[] = [];
  const boneInverses: Matrix4[] = [];
  const at = new Map<string, number>();
  for (const mesh of list) {
    mesh.skeleton.bones.forEach((bone, i) => {
      const inverse = mesh.skeleton.boneInverses[i]!;
      const known = at.get(bone.name);
      if (known === undefined) {
        at.set(bone.name, boneNames.length);
        boneNames.push(bone.name);
        boneInverses.push(inverse.clone());
      } else if (!boneInverses[known]!.elements.every((v, k) => Math.abs(v - inverse.elements[k]!) < 1e-4)) {
        throw new Error("bind mismatch");
      }
    });
  }
  const pieces = list.map((mesh) => {
    const g = mesh.geometry.clone();
    // Influences past four are unused by three's skinning; drop them.
    for (const name of Object.keys(g.attributes)) if (/^(joints|weights)_\d+$/.test(name)) g.deleteAttribute(name);
    const index = g.getAttribute("skinIndex");
    const remap = mesh.skeleton.bones.map((bone) => at.get(bone.name)!);
    for (let v = 0; v < index.count; v++) {
      for (let k = 0; k < 4; k++) index.setComponent(v, k, remap[index.getComponent(v, k)] ?? 0);
    }
    return g;
  });
  if (!mergeable(pieces)) return null;
  const geometry = mergeGeometries(pieces);
  for (const piece of pieces) piece.dispose();
  if (!geometry) return null;
  geometry.computeBoundingSphere();
  return { geometry, boneNames, boneInverses };
}

/**
 * The driver's meshes grouped by material and merged where they share a bind
 * and a placement under the root, so they skin identically as one. Anything
 * that will not merge stays a part of its own. Merged geometry is cached by
 * its sources, which every clone of a model shares; each driver gets its own
 * skeleton over its own bones in the merged order.
 */
function partsFor(root: Object3D, meshes: readonly SkinnedMesh[]): Part[] {
  const groups = new Map<string, SkinnedMesh[]>();
  for (const mesh of meshes) {
    const material = mesh.material as Material;
    const key = [
      material.uuid,
      mesh.bindMatrix.elements.map((v) => v.toFixed(5)).join(","),
      mesh.matrixWorld.elements.map((v) => v.toFixed(5)).join(","),
    ].join("|");
    const list = groups.get(key) ?? [];
    list.push(mesh);
    groups.set(key, list);
  }
  const bones = new Map<string, Bone>();
  root.traverse((o) => {
    if ((o as Bone).isBone && !bones.has(o.name)) bones.set(o.name, o as Bone);
  });
  const parts: Part[] = [];
  for (const list of groups.values()) {
    const single = () => {
      for (const mesh of list) parts.push({ source: mesh, geometry: mesh.geometry, skeleton: mesh.skeleton });
    };
    if (list.length === 1) {
      single();
      continue;
    }
    const cacheKey = list.map((m) => m.geometry.uuid).join("+");
    let merged = mergedCache.get(cacheKey);
    if (merged === undefined) {
      try {
        merged = mergePieces(list);
      } catch {
        merged = null;
      }
      mergedCache.set(cacheKey, merged);
    }
    const driverBones = merged?.boneNames.map((name) => bones.get(name));
    if (!merged || !driverBones || driverBones.some((b) => !b)) {
      single();
      continue;
    }
    parts.push({ source: list[0]!, geometry: merged.geometry, skeleton: new Skeleton(driverBones as Bone[], merged.boneInverses) });
  }
  return parts;
}

/** What a kind of figure measures in its first posed frame. */
export interface CrowdKindMeasure {
  /** Lowest point of the posed body, root space. */
  minY: number;
  /** Standing: top of the head. */
  maxY: number;
  /** Sitting: the underside of the buttocks and thighs, and how far forward of the root the pelvis sits. */
  seatY: number;
  hipsForward: number;
}

interface Kind {
  key: string;
  drivers: Driver[];
  measure: CrowdKindMeasure;
}

export interface CrowdFigurePlacement {
  x: number;
  y: number;
  z: number;
  /** three.js rotation.y; the model faces +z at 0. */
  rotationY: number;
  scale?: number;
  /** 0..1, a small per-person shift in the clothes' colour. */
  tint?: number;
}

interface Figure {
  group: Group;
  kind: Kind;
  meshes: SkinnedMesh[];
}

const TINTS = ["#ffffff", "#d9cfc2", "#c4cbd6", "#d6c4c4", "#c9d4c4", "#bfb8cc"].map((c) => new Color(c));
const scratchVertex = new Vector3();

/**
 * Lowest skinned vertex among those mostly weighted to the pelvis and thighs,
 * in driver-root space: where the body meets a seat. Every piece counts; in
 * some characters the biggest piece is the shirt, with nothing below the waist.
 */
function measureSeat(meshes: readonly SkinnedMesh[], root: Object3D): { seatY: number; minY: number; maxY: number } {
  root.updateMatrixWorld(true);
  let seatY = Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const mesh of meshes) {
    const seatBones = new Set<number>();
    mesh.skeleton.bones.forEach((b, i) => {
      if (/(Hips|UpLeg)$/.test(b.name)) seatBones.add(i);
    });
    const position = mesh.geometry.getAttribute("position");
    const skinIndex = mesh.geometry.getAttribute("skinIndex");
    const skinWeight = mesh.geometry.getAttribute("skinWeight");
    mesh.skeleton.update();
    for (let i = 0; i < position.count; i++) {
      mesh.getVertexPosition(i, scratchVertex);
      scratchVertex.applyMatrix4(mesh.matrixWorld);
      minY = Math.min(minY, scratchVertex.y);
      maxY = Math.max(maxY, scratchVertex.y);
      let best = 0;
      let bestBone = -1;
      for (let k = 0; k < 4; k++) {
        const w = skinWeight.getComponent(i, k);
        if (w > best) {
          best = w;
          bestBone = skinIndex.getComponent(i, k);
        }
      }
      if (seatBones.has(bestBone)) seatY = Math.min(seatY, scratchVertex.y);
    }
  }
  return { seatY, minY, maxY };
}

export class JamCrowd {
  readonly group = new Group();
  private readonly kinds = new Map<string, Promise<Kind>>();
  private readonly figures = new Map<string, Figure>();
  private readonly drivers: Driver[] = [];
  private clock = 0;
  private sinceUpdate = 0;
  private readonly materials: Material[] = [];

  constructor() {
    this.group.name = "FFJ_Crowd";
    // The crowd group stays at the origin; recomposing it each frame would
    // force every person under it to recompute their world matrix.
    this.group.matrixAutoUpdate = false;
  }

  /**
   * A kind of figure: one character in one clip, posed by `driverCount`
   * skeletons spread across the clip. Loads once; later calls share it.
   */
  addKind(
    key: string,
    modelUrl: string,
    clip: "standing" | "seated",
    seatedClipUrl?: string,
    driverCount = 2,
    /** Sitting: the chair's seat top above the ground, metres. */
    seatHeight?: number,
  ): Promise<Kind> {
    const existing = this.kinds.get(key);
    if (existing) return existing;
    const pending = (async (): Promise<Kind> => {
      const drivers: Driver[] = [];
      let source: { scene: Object3D; clip: AnimationClip | null };
      if (clip === "seated") {
        const [model, sitting] = await Promise.all([loadGltf(modelUrl), loadFbx(seatedClipUrl!)]);
        if (!sitting.animations[0]) throw new Error(`[jam crowd] ${seatedClipUrl} has no clip`);
        source = { scene: model.scene, clip: sittingClipFor(model.scene, sitting.animations[0], bonePrefix(boneNames(sitting))) };
      } else {
        const [model, idle] = await Promise.all([loadGltf(modelUrl), loadGltf(JAM_STANDING_IDLE_URL)]);
        const mesh = firstSkinnedMesh(model.scene);
        if (!mesh || !idle.animations[0]) throw new Error(`[jam crowd] ${modelUrl} has no skin or the idle has no clip`);
        source = { scene: model.scene, clip: standingIdleFor(model.scene, idle.animations[0]) };
      }
      if (!source.clip) throw new Error(`[jam crowd] no clip for ${key}`);
      for (let d = 0; d < driverCount; d++) {
        const root = cloneSkinned(source.scene);
        const mixer = new AnimationMixer(root);
        const action = mixer.clipAction(source.clip);
        action.setLoop(LoopRepeat, Infinity);
        action.play();
        mixer.update((source.clip.duration * (d + 0.37)) / driverCount);
        const meshes: SkinnedMesh[] = [];
        root.traverse((child) => {
          if ((child as SkinnedMesh).isSkinnedMesh && (child as SkinnedMesh).geometry.getAttribute("position")?.count) {
            meshes.push(child as SkinnedMesh);
          }
        });
        root.updateMatrixWorld(true);
        drivers.push({ root, mixer, meshes, parts: partsFor(root, meshes) });
        this.drivers.push(drivers[drivers.length - 1]!);
      }
      // Measure the first driver in its posed first frame.
      const first = drivers[0]!;
      let seat = measureSeat(first.meshes, first.root);
      if (clip === "seated" && seatHeight !== undefined) {
        // The re-bent legs move the thighs' underside a little, so measure,
        // bend, and measure again.
        for (let pass = 0; pass < 2; pass++) {
          for (const driver of drivers) {
            driver.chair ??= chairPoseFor(driver.root, 0) ?? undefined;
            if (!driver.chair) continue;
            driver.chair.floorY = seat.seatY - seatHeight;
            applyChairPose(driver.chair);
          }
          seat = measureSeat(first.meshes, first.root);
        }
      }
      let hips: Object3D | undefined;
      first.root.traverse((o) => {
        if (!hips && (o as Bone).isBone && o.name.endsWith("Hips")) hips = o;
      });
      const hipsWorld = hips ? hips.getWorldPosition(new Vector3()) : new Vector3();
      return {
        key,
        drivers,
        measure: { minY: seat.minY, maxY: seat.maxY, seatY: seat.seatY, hipsForward: hipsWorld.z },
      };
    })();
    this.kinds.set(key, pending);
    void pending.catch(() => this.kinds.delete(key));
    return pending;
  }

  async measure(key: string): Promise<CrowdKindMeasure> {
    const kind = await this.kinds.get(key);
    if (!kind) throw new Error(`[jam crowd] unknown kind ${key}`);
    return kind.measure;
  }

  /** Add a person. Resolves once their meshes are in the group. */
  async place(id: string, key: string, at: CrowdFigurePlacement, driverIndex = 0): Promise<void> {
    const kind = await this.kinds.get(key);
    if (!kind) throw new Error(`[jam crowd] unknown kind ${key}`);
    const driver = kind.drivers[driverIndex % kind.drivers.length]!;
    const group = new Group();
    group.name = `FFJ_Crowd_${id}`;
    // A person only moves when move, turn or lift says so; recompose then,
    // not on every frame.
    group.matrixAutoUpdate = false;
    const tint = TINTS[Math.floor((at.tint ?? 0) * TINTS.length) % TINTS.length]!;
    const meshes = driver.parts.map(({ source, geometry, skeleton }) => {
      const material = this.tinted(source.material as Material, tint);
      const mesh = new SkinnedMeshClass(geometry, material);
      mesh.name = source.name;
      // Detached: the figure keeps the driver's bind and is placed by its own
      // group, so every instance can stand somewhere else on one skeleton.
      mesh.bindMode = DetachedBindMode;
      mesh.bind(skeleton, source.bindMatrix);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(source.matrixWorld);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      // The skinned bound would be recomputed from the bones; the bind pose's
      // sphere, padded for arms, is plenty for culling a person.
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      mesh.boundingSphere = (geometry.boundingSphere ?? new Sphere()).clone();
      mesh.boundingSphere.radius *= 1.4;
      group.add(mesh);
      return mesh;
    });
    this.figures.get(id)?.group.removeFromParent();
    this.figures.set(id, { group, kind, meshes });
    this.move(id, at);
    this.group.add(group);
  }

  move(id: string, at: CrowdFigurePlacement): void {
    const figure = this.figures.get(id);
    if (!figure) return;
    const g = figure.group;
    const s = at.scale ?? 1;
    g.position.set(at.x, at.y, at.z);
    g.rotation.set(0, at.rotationY, 0);
    g.scale.setScalar(s);
    g.updateMatrix();
  }

  /** Turn a person in place, three.js rotation.y. */
  turn(id: string, rotationY: number): void {
    const figure = this.figures.get(id);
    if (!figure || figure.group.rotation.y === rotationY) return;
    figure.group.rotation.y = rotationY;
    figure.group.updateMatrix();
  }

  /** Raise or lower a person in place. */
  lift(id: string, y: number): void {
    const figure = this.figures.get(id);
    if (!figure || figure.group.position.y === y) return;
    figure.group.position.y = y;
    figure.group.updateMatrix();
  }

  setVisible(id: string, visible: boolean): void {
    const figure = this.figures.get(id);
    if (figure) figure.group.visible = visible;
  }

  has(id: string): boolean {
    return this.figures.has(id);
  }

  /** Advance every driver. Idles are slow, so 30 updates a second is plenty. */
  update(delta: number): void {
    this.clock += delta;
    this.sinceUpdate += delta;
    if (this.sinceUpdate < 1 / 30) return;
    const step = this.sinceUpdate;
    this.sinceUpdate = 0;
    for (const driver of this.drivers) {
      driver.mixer.update(step);
      driver.root.updateMatrixWorld(true);
      if (driver.chair) applyChairPose(driver.chair);
    }
  }

  private tintedCache = new Map<string, Material>();
  private tinted(material: Material, tint: Color): Material {
    const key = `${material.uuid}:${tint.getHexString()}`;
    let out = this.tintedCache.get(key);
    if (!out) {
      out = material.clone();
      const coloured = out as Material & { color?: Color };
      coloured.color?.multiply(tint);
      this.tintedCache.set(key, out);
      this.materials.push(out);
    }
    return out;
  }

  dispose(): void {
    for (const driver of this.drivers) driver.mixer.stopAllAction();
    for (const material of this.materials) material.dispose();
    this.group.clear();
    this.figures.clear();
  }
}
