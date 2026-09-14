/**
 * Locomotion harness
 *
 * Loading a rig and a clip pack under jsdom is where this suite spends its
 * landmines, and there are two worth naming because both fail quietly: a GLB
 * sliced out of a pooled Node Buffer parses as garbage and reports an
 * unsupported asset version, and a textured GLB hangs the parse forever
 * because jsdom cannot decode an image and three waits for one. The plumbing
 * below solves both, once, for every suite that needs a posed skeleton.
 *
 * `driveRig` runs the animation pipeline the way `Avatar3D` does, including
 * the option to run `FootPlanter` after the animator. That option is the whole
 * reason this file exists. Foot IK is where a leg is finally posed, so a
 * harness that stops at the animator cannot see an IK defect at all, which is
 * how a knee bending 84 degrees off sagittal reached a screenshot with the
 * gait suite green.
 */

import fs from "node:fs";
import path from "node:path";
import { expect } from "vitest";
import { AnimationClip, Bone, Group, Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  buildTwoBoneChain,
  ContactCurveCache,
  extractClipFootprint,
  FootPlanter,
  HingeConstrainedLegIKSolver,
  kneeHingeReferenceAxis,
  LocomotionAnimator,
  LocomotionState,
  registerClipFootprint,
  trimLeadingHold,
  type BoneChain,
  type IAvatarSkeletonBuilder,
} from "@austencloud/scene-3d";
import {
  analyzeGait,
  type GaitReport,
} from "$lib/shared/3d/diagnostics/gait/gait-analysis";
import type { GaitFrame } from "$lib/shared/3d/diagnostics/gait/gait-frame";
import {
  collectRiggedAvatars,
  sampleRig,
} from "$lib/shared/3d/diagnostics/gait/gait-rig-sampler";

const AVATAR_DIR = "static/models/avatars/_optimized";

/**
 * Where the large binary assets live.
 *
 * The avatar GLBs are gitignored, so a worktree has none, and every modifying
 * task in this repo runs in a worktree. A harness that resolved them from the
 * current directory alone could therefore only ever run in the primary
 * checkout, which is the one place agents are told not to work -- the suite
 * would skip forever and catch nothing.
 *
 * Git already records the way back: a linked worktree's `.git` is a file
 * reading `gitdir: <primary>/.git/worktrees/<name>`, so the primary checkout is
 * three levels above that path. Everything is verified to exist before it is
 * returned; a layout this does not recognise falls back to the current
 * directory and `avatarAssetsPresent` reports the assets missing.
 */
function resolveAssetRoot(): string {
  const here = process.cwd();
  if (fs.existsSync(path.join(here, AVATAR_DIR))) return here;
  try {
    const dotGit = path.join(here, ".git");
    if (!fs.statSync(dotGit).isFile()) return here;
    const link = fs.readFileSync(dotGit, "utf8").trim();
    const match = /^gitdir:\s*(.+)$/.exec(link);
    if (!match) return here;
    // <primary>/.git/worktrees/<name> -> <primary>
    const primary = path.resolve(match[1]!, "..", "..", "..");
    return fs.existsSync(path.join(primary, AVATAR_DIR)) ? primary : here;
  } catch {
    return here;
  }
}

const ASSET_ROOT = resolveAssetRoot();

const PACK = path.resolve(ASSET_ROOT, "static/animations/locomotion-pack");

export const avatar = (id: string) =>
  path.resolve(ASSET_ROOT, `${AVATAR_DIR}/${id}.glb`);

/**
 * Shipped characters, not clip GLBs.
 *
 * The pack's GLBs each carry the full armature and no skinned mesh, which makes
 * one of them look like a convenient rig. It is not: those are raw Mixamo
 * exports, so the armature is turned a quarter turn, scaled by 0.01, and its
 * Hips sit at -104.27 **centimetres on local Z**. The optimize pipeline emits
 * the opposite -- an identity root with Hips at 0.99 **metres on Y** -- and
 * `prepareClip` bob mode writes the pelvis bob to local Y as a fraction of hip
 * height. That is correct for the shipped convention and silently lands on the
 * wrong axis, 100x too small, on the raw one: measuring a pack GLB reports a
 * pelvis frozen to the millimetre and a duty factor half what the app has.
 */
export const RIGS = ["ch01", "ch07", "ch10", "ch12", "ch18"];
export const REFERENCE_RIG = avatar(RIGS[0]!);

const CLIP_FILES: Record<string, string> = {
  idle: "idle.glb",
  forward: "walk-forward.glb",
  backward: "walk-backward.glb",
  strafeLeft: "strafe-left.glb",
  strafeRight: "strafe-right.glb",
  runForward: "run.glb",
  runStrafeLeft: "strafe-run-left.glb",
  runStrafeRight: "strafe-run-right.glb",
};

/** The two fields `loadAnimations` would have filled over the network. */
interface ClipInjectionSeam {
  pendingClips: Map<string, AnimationClip>;
  clipsLoaded: boolean;
}

const loader = new GLTFLoader();

/**
 * Node copies a file into a shared pool, so a `Buffer` is a view into a larger
 * allocation. Slicing its `ArrayBuffer` by offset is the one place this can go
 * wrong quietly: a mis-sliced GLB parses as JSON and reports an unsupported
 * asset version rather than a bad offset. Copy, then check the magic.
 */
function readGlb(file: string): Uint8Array {
  const buffer = fs.readFileSync(file);
  const bytes = new Uint8Array(buffer.byteLength);
  bytes.set(buffer);
  const magic = String.fromCharCode(...bytes.subarray(0, 4));
  if (magic !== "glTF") throw new Error(`${file}: magic "${magic}"`);
  return bytes;
}

const GLB_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const GLTF_MAGIC = 0x46546c67;

/** Extensions that exist only to describe an image payload. */
const TEXTURE_EXTENSIONS = new Set([
  "KHR_texture_basisu",
  "EXT_texture_webp",
  "KHR_texture_transform",
  "EXT_meshopt_compression",
]);

/**
 * Remove every image from a GLB, leaving the skeleton untouched.
 *
 * jsdom cannot decode an image and three waits on the decode forever, so a
 * textured avatar hangs the parse rather than failing it. Shading has no
 * bearing on where a bone ends up, so this drops images, textures, samplers and
 * the material references to them, and leaves nodes, skins, meshes and
 * accessors exactly as shipped.
 */
function stripTextures(bytes: Uint8Array): ArrayBuffer {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = GLB_HEADER_BYTES;
  let json: Record<string, unknown> | null = null;
  let bin: Uint8Array | null = null;

  while (offset < bytes.byteLength) {
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    const start = offset + CHUNK_HEADER_BYTES;
    const chunk = bytes.subarray(start, start + length);
    if (type === JSON_CHUNK) {
      json = JSON.parse(new TextDecoder().decode(chunk)) as Record<
        string,
        unknown
      >;
    } else if (type === BIN_CHUNK) {
      bin = chunk;
    }
    offset = start + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error("GLB has no JSON chunk");

  delete json.images;
  delete json.textures;
  delete json.samplers;
  for (const material of (json.materials ?? []) as Record<string, unknown>[]) {
    delete material.normalTexture;
    delete material.occlusionTexture;
    delete material.emissiveTexture;
    delete material.extensions;
    const pbr = material.pbrMetallicRoughness as
      | Record<string, unknown>
      | undefined;
    if (pbr) {
      delete pbr.baseColorTexture;
      delete pbr.metallicRoughnessTexture;
    }
  }
  const keep = (name: string) => !TEXTURE_EXTENSIONS.has(name);
  json.extensionsUsed = ((json.extensionsUsed ?? []) as string[]).filter(keep);
  json.extensionsRequired = ((json.extensionsRequired ?? []) as string[]).filter(
    keep
  );

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4;
  const binBytes = bin ?? new Uint8Array(0);
  const binPad = (4 - (binBytes.byteLength % 4)) % 4;
  const total =
    GLB_HEADER_BYTES +
    CHUNK_HEADER_BYTES +
    jsonBytes.byteLength +
    jsonPad +
    (bin ? CHUNK_HEADER_BYTES + binBytes.byteLength + binPad : 0);

  const out = new Uint8Array(total);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, GLTF_MAGIC, true);
  outView.setUint32(4, 2, true);
  outView.setUint32(8, total, true);
  outView.setUint32(12, jsonBytes.byteLength + jsonPad, true);
  outView.setUint32(16, JSON_CHUNK, true);
  out.set(jsonBytes, 20);
  out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonBytes.byteLength + jsonPad);
  if (bin) {
    const binStart = 20 + jsonBytes.byteLength + jsonPad;
    outView.setUint32(binStart, binBytes.byteLength + binPad, true);
    outView.setUint32(binStart + 4, BIN_CHUNK, true);
    out.set(binBytes, binStart + CHUNK_HEADER_BYTES);
  }
  return out.buffer;
}

function parse(
  data: ArrayBuffer
): Promise<{ scene: Object3D; animations: AnimationClip[] }> {
  return new Promise((resolve, reject) =>
    loader.parse(data, "", resolve as never, reject)
  );
}

const clips = new Map<string, AnimationClip>();
const rigs = new Map<string, ArrayBuffer>();

/** Strip once per rig; `parse` is cheap, re-reading and re-encoding is not. */
function rigData(file: string): ArrayBuffer {
  let data = rigs.get(file);
  if (!data) {
    data = stripTextures(readGlb(file));
    rigs.set(file, data);
  }
  return data;
}

// ---------------------------------------------------------------------------
// Driving the pipeline
// ---------------------------------------------------------------------------

/**
 * Load the clip pack once per process, the way the app loads it.
 *
 * `loadSharedAnimation` trims each clip's leading hold and registers the
 * footprint of the rig it was authored on before the animator sees it; the
 * animator only bakes contact-preserved legs for a clip that has a footprint.
 * A loader that skipped this handed every suite the raw pack, and the tests
 * measured a leg the app never plays (found 2026-09-07).
 *
 * Separate from the drive so a suite can await it in `beforeAll` and get the
 * parse cost, and any parse failure, attributed to setup rather than to
 * whichever test happened to run first.
 */
export async function loadPackClips(): Promise<Map<string, AnimationClip>> {
  if (clips.size === Object.keys(CLIP_FILES).length) return clips;
  for (const [key, file] of Object.entries(CLIP_FILES)) {
    const gltf = await parse(readGlb(path.join(PACK, file)).buffer);
    const clip = gltf.animations[0];
    if (!clip) continue;
    trimLeadingHold(clip);
    const footprint = extractClipFootprint(gltf.scene, clip);
    if (footprint) registerClipFootprint(clip, footprint);
    clips.set(key, clip);
  }
  expect(clips.size, "every pack clip parsed").toBe(
    Object.keys(CLIP_FILES).length
  );
  return clips;
}

/**
 * Every shipped character, not just the five the motion-quality suite spot
 * checks. A rig-intake contract has to see all of them or it is not an intake.
 */
export const ALL_RIGS = [
  "ch01",
  "ch07",
  "ch10",
  "ch12",
  "ch18",
  "ch21",
  "ch22",
  "ch24",
  "ch34",
  "ch41",
  "ch42",
  "ch44",
];

/**
 * True when the avatar GLBs are present in this checkout.
 *
 * They are gitignored, so a fresh clone and CI do not have them. A suite that
 * needs a character skips rather than failing: a missing large binary is not
 * the same finding as a broken rig, and reporting it as one trains people to
 * ignore the suite.
 */
export function avatarAssetsPresent(): boolean {
  return ALL_RIGS.every((id) => fs.existsSync(avatar(id)));
}

function boneFinder(root: Object3D) {
  return (suffix: string): Bone | null => {
    let hit: Bone | null = null;
    root.traverse((node) => {
      if (!hit && (node as Bone).isBone && node.name.endsWith(suffix)) {
        hit = node as Bone;
      }
    });
    return hit;
  };
}

/**
 * The three methods `FootPlanter` asks a skeleton for, bound to real bones.
 *
 * Not a stand-in for the skeleton service: the chains come from the package
 * `buildTwoBoneChain`, so rest directions and segment lengths are computed by
 * the code that ships. The only thing reimplemented here is finding a bone by
 * name, which the service does against a prefix this harness cannot assume,
 * because the avatars carry `mixamorig12:` and the clip pack does not.
 */
function skeletonAdapter(root: Object3D): IAvatarSkeletonBuilder {
  const bone = boneFinder(root);
  const chain = (side: "Left" | "Right"): BoneChain | null => {
    const upper = bone(`${side}UpLeg`);
    const knee = bone(`${side}Leg`);
    const ankle = bone(`${side}Foot`);
    return upper && knee && ankle
      ? buildTwoBoneChain(upper, knee, ankle)
      : null;
  };
  return {
    getBone: (name: string) => bone(name),
    getLeftLegChain: () => chain("Left"),
    getRightLegChain: () => chain("Right"),
  } as unknown as IAvatarSkeletonBuilder;
}

export interface DriveRigOptions {
  /** Commanded ground speed in metres per second, as a function of time. */
  speedAt: (t: number) => number;
  seconds: number;
  /** Frames discarded before recording, so the blend springs reach target. */
  settleSeconds?: number;
  frameRate?: number;
  /** Absolute path to the rig GLB. Defaults to the reference rig. */
  rig?: string;
  /** Clip keys withheld from the animator, to model an incomplete pack. */
  omitClips?: string[];
  /**
   * Run `FootPlanter` after the animator, as the app does. Off by default so a
   * suite can isolate the animator; on is the configuration that matches what
   * a viewer actually sees.
   */
  planting?: boolean;
  /**
   * Reach the live planter before the first frame.
   *
   * The point of a fault-injection seam is that the anatomy checks can be
   * shown to fail on a defect rather than merely pass on healthy rigs. A
   * metric nobody has ever seen go red is an assumption, not a check.
   */
  onPlanter?: (planter: FootPlanter) => void;
  /**
   * Heading rate in radians per second. Zero walks the straight line; a
   * nonzero rate walks a circle, facing the way it is going, so a plant
   * has the ground rotate under it the way the walk lab circle does.
   */
  turnRate?: number;
}

export interface DriveRigResult {
  frames: GaitFrame[];
  report: GaitReport;
  /** `getGaitTier()` sampled on every recorded frame. */
  tiers: number[];
  /** Commanded speed on every recorded frame, for reading a sweep back. */
  speeds: number[];
}

/**
 * Walk a rig along +Z, or round a circle at `turnRate`, and record what the
 * bones did.
 *
 * A fresh animator and planter per call: blend springs, the gait clock, the
 * tier split and every foot lock are stateful, and a run that inherited
 * another mid-blend pose would be measuring the previous case as much as its
 * own.
 */
export async function driveRig({
  speedAt,
  seconds,
  settleSeconds = 2,
  frameRate = 60,
  rig: rigFile = REFERENCE_RIG,
  omitClips = [],
  planting = false,
  onPlanter,
  turnRate = 0,
}: DriveRigOptions): Promise<DriveRigResult> {
  const rig = await parse(rigData(rigFile));
  const travel = new Group();
  travel.add(rig.scene);

  const animator = new LocomotionAnimator();
  const seam = animator as unknown as ClipInjectionSeam;
  const injected = new Map(clips);
  for (const key of omitClips) injected.delete(key);
  seam.pendingClips = injected;
  seam.clipsLoaded = true;
  animator.initialize(rig.scene);

  travel.updateMatrixWorld(true);

  let planter: FootPlanter | null = null;
  if (planting) {
    planter = new FootPlanter();
    planter.initialize(
      skeletonAdapter(rig.scene),
      new HingeConstrainedLegIKSolver(),
      new ContactCurveCache()
    );
    // The ankle-to-sole distance is a property of the rig, and the shipped
    // default misses it far enough on these avatars that the plant target
    // sits below the reach of the leg. Avatar3D applies both the same way.
    const sole = animator.getSoleOffset?.() ?? 0;
    if (sole > 0) planter.configure({ footHeightOffset: sole });
    const toe = animator.getToeOffset?.() ?? -1;
    if (toe >= 0) planter.configure({ toeHeightOffset: toe });
    onPlanter?.(planter);
  }

  const avatars = collectRiggedAvatars(travel);
  expect(avatars, "sampler found the rig leg chains").toHaveLength(1);
  const rigged = avatars[0]!;

  const dt = 1 / frameRate;
  const frames: GaitFrame[] = [];
  const tiers: number[] = [];
  const speeds: number[] = [];
  let heading = 0;

  const total = Math.round((settleSeconds + seconds) * frameRate);
  for (let i = 0; i < total; i++) {
    const elapsed = i * dt;
    const speed = speedAt(Math.max(0, elapsed - settleSeconds));
    const moving = speed > 0.01;

    animator.setLocomotion({
      isMoving: moving,
      speed,
      moveDirection: { x: 0, z: 1 },
    });
    animator.update(dt);

    heading += turnRate * dt;
    travel.rotation.y = heading;
    travel.position.x += speed * dt * Math.sin(heading);
    travel.position.z += speed * dt * Math.cos(heading);
    travel.updateMatrixWorld(true);

    if (planter) {
      const contact = animator.getFootContact?.();
      planter.update(dt, {
        // The rig group stands on y = 0 here, so the plane its feet snap to
        // is y = 0 as well.
        groundY: 0,
        locomotionState: moving
          ? LocomotionState.WALKING
          : LocomotionState.IDLE,
        isMoving: moving,
        contactLeft: contact?.left,
        contactRight: contact?.right,
        lockConfidence: animator.getFootPlantConfidence?.() ?? 1,
        strideScale: animator.getStrideScale?.() ?? 1,
        travelDirection: moving
          ? { x: Math.sin(heading), z: Math.cos(heading) }
          : undefined,
      });
    }

    if (elapsed < settleSeconds) continue;
    frames.push(sampleRig(rigged, { t: elapsed - settleSeconds, dt }));
    tiers.push(animator.getGaitTier());
    speeds.push(speed);
  }

  animator.dispose();
  return { frames, report: analyzeGait(frames), tiers, speeds };
}

// ---------------------------------------------------------------------------
// Static intake
// ---------------------------------------------------------------------------

export interface LoadedRig {
  scene: Object3D;
  skeleton: IAvatarSkeletonBuilder;
  leftLeg: BoneChain;
  rightLeg: BoneChain;
  /** The rig's own mediolateral axis, right hip toward left hip, in world. */
  hipAxis: { x: number; y: number; z: number };
}

/**
 * Parse a rig and hand back its bind pose, without animating anything.
 *
 * A rig can be wrong before it ever moves: an IK hinge axis is derived once, at
 * bind, and a rig whose knees are authored dead straight gives that derivation
 * almost nothing to work with. Checking that statically is far cheaper than
 * driving a gait and reading the damage back out of it, and it names the rig
 * rather than the symptom.
 */
export async function loadRig(file: string): Promise<LoadedRig> {
  const gltf = await parse(rigData(file));
  const scene = gltf.scene;
  // Every world-space measurement below reads matrixWorld, and a freshly
  // parsed graph has not composed one yet.
  scene.updateMatrixWorld(true);

  const skeleton = skeletonAdapter(scene);
  const leftLeg = skeleton.getLeftLegChain();
  const rightLeg = skeleton.getRightLegChain();
  expect(leftLeg, `${path.basename(file)} has a left leg chain`).toBeTruthy();
  expect(rightLeg, `${path.basename(file)} has a right leg chain`).toBeTruthy();

  const bone = boneFinder(scene);
  const leftHip = bone("LeftUpLeg")!;
  const rightHip = bone("RightUpLeg")!;
  const axis = kneeHingeReferenceAxis(leftHip, rightHip);

  return {
    scene,
    skeleton,
    leftLeg: leftLeg!,
    rightLeg: rightLeg!,
    hipAxis: { x: axis.x, y: axis.y, z: axis.z },
  };
}
