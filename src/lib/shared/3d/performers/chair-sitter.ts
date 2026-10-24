/**
 * One character sitting, in a chair or on the ground: its own clone of the
 * model, playing the sitting clip remapped onto every bone the model has,
 * with the legs and arms re-bent for a chair (chair-seat.ts).
 *
 * The scene package's seated-audience loader remaps the clip onto one mesh's
 * skeleton, which in most of the human cast is the eyelashes or the shoes, so
 * it leaves those characters in their bind pose. This reads every bone, the
 * way the Flow Fest jam's crowd does.
 */

import {
  AnimationMixer,
  LoopRepeat,
  type AnimationClip,
  type Object3D,
  type SkinnedMesh,
} from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import {
  applyChairPose,
  boneNames,
  bonePrefix,
  measureSeat,
  seatOnChair,
  sittingClipFor,
  type ChairPose,
  type SeatMeasure,
} from "./chair-seat";

const gltfLoader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();

type Fbx = Object3D & { animations: AnimationClip[] };
const fbxLoader = new FBXLoader();
const fbxCache = new Map<string, Promise<Fbx>>();

function cached<T>(
  cache: Map<string, Promise<T>>,
  url: string,
  load: () => Promise<T>
): Promise<T> {
  let pending = cache.get(url);
  if (!pending) {
    pending = load();
    cache.set(url, pending);
    void pending.catch(() => cache.delete(url));
  }
  return pending;
}

const loadGltf = (url: string) =>
  cached(gltfCache, url, () => gltfLoader.loadAsync(url));
const loadFbx = (url: string) =>
  cached(fbxCache, url, () => fbxLoader.loadAsync(url) as Promise<Fbx>);

/** Fetch and parse the sitting clip ahead of the first sitter. */
export function preloadSittingClip(url: string): Promise<unknown> {
  return loadFbx(url);
}

export interface ChairSitter {
  root: Object3D;
  /** The posed body measured on the ground, and fitted to the chair. */
  groundMeasure: SeatMeasure;
  chairMeasure: SeatMeasure;
  /** False for a rig the chair pose cannot bend; it sits on the ground. */
  canChair: boolean;
  /** Advance the clip; on a chair, re-bend it to the seat. */
  update(delta: number, onChair: boolean): void;
  dispose(): void;
}

/**
 * A character ready to sit. `seatTop` is the chair's seat top above the
 * ground, in the root's own (unscaled) units; `timeOffset` starts the clip
 * part way through so neighbours do not breathe together.
 */
export async function createChairSitter(
  modelUrl: string,
  clipUrl: string,
  seatTop: number,
  timeOffset = 0
): Promise<ChairSitter> {
  const [model, sitting] = await Promise.all([
    loadGltf(modelUrl),
    loadFbx(clipUrl),
  ]);
  const raw = sitting.animations[0];
  if (!raw) throw new Error(`[chair-sitter] ${clipUrl} has no clip`);
  const clip = sittingClipFor(model.scene, raw, bonePrefix(boneNames(sitting)));

  const root = cloneSkinned(model.scene);
  const meshes: SkinnedMesh[] = [];
  root.traverse((child) => {
    const mesh = child as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    // The bind pose's bounds would cull a sitting body wrongly.
    mesh.frustumCulled = false;
    if (mesh.geometry.getAttribute("position")?.count) meshes.push(mesh);
  });
  const mixer = new AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.setLoop(LoopRepeat, Infinity);
  action.play();
  mixer.update(timeOffset);
  root.updateMatrixWorld(true);

  const groundMeasure = measureSeat(meshes, root);
  const fitted = seatOnChair(root, meshes, seatTop);
  const pose: ChairPose | null = fitted.pose;

  return {
    root,
    groundMeasure,
    chairMeasure: fitted.measure,
    canChair: pose !== null,
    update(delta, onChair) {
      mixer.update(delta);
      if (onChair && pose) applyChairPose(pose);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}
