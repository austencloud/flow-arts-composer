/**
 * Swaps the sim's primitive hero props for the Blender-modelled GLBs that
 * `scripts/build-flow-fest-sim-props.py` writes to
 * `static/models/flow-fest-sim/props/`.
 *
 * The production dressing is built synchronously from primitives, and those
 * primitives stay the source of every collider and fixture count. Once a GLB
 * arrives, its model is added beside the primitive and the primitive is
 * hidden. If a GLB fails to load, the primitive simply stays: the scene never
 * waits on these files and never loses a prop because of them.
 *
 * Anchors the dressing exposes (flow-fest-production-geometry.ts):
 *   - FFS_LEDFlowCircle_ModelAnchor   ground centre of the LED circle canopy
 *   - FFS_FireJam_CentralFireRing_Authored   the stone ring, on the pit centre
 *   - FFS_PathLanternPosts_AuthoredWayfinding / FFS_PathLanterns_AuthoredWayfinding
 */

import {
  Group,
  InstancedMesh,
  LOD,
  Matrix4,
  Mesh,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { attachGltfDecoders } from "#lib/shared/3d/scene-boot/gltf-decoders.js";

const PROP_ROOT = "/models/flow-fest-sim/props";

export const FLOW_FEST_AUTHORED_PROP_URLS = {
  canopy: { near: `${PROP_ROOT}/led-flow-canopy.glb`, far: `${PROP_ROOT}/led-flow-canopy-far.glb` },
  fire: { near: `${PROP_ROOT}/fire-circle.glb`, far: `${PROP_ROOT}/fire-circle-far.glb` },
  lantern: { near: `${PROP_ROOT}/path-lantern.glb` },
} as const;

/** Beyond this the canopy and fire swap to their distance models. */
export const FLOW_FEST_AUTHORED_PROP_FAR_METERS = 45;

export interface AuthoredPropMesh {
  name: string;
  geometry: BufferGeometry;
  material: Material;
}

export type AuthoredPropLoader = (url: string) => Promise<AuthoredPropMesh[]>;

export interface FlowFestAuthoredPropsResult {
  canopy: boolean;
  fire: boolean;
  lanterns: boolean;
}

const cache = new Map<string, Promise<AuthoredPropMesh[]>>();

/**
 * Every mesh of a GLB with its node transform baked into the geometry. Cached
 * per URL; callers clone before they put anything in a scene, because the
 * dressing's dispose() frees whatever it owns.
 */
export function loadAuthoredProp(url: string): Promise<AuthoredPropMesh[]> {
  let pending = cache.get(url);
  if (!pending) {
    const loader = new GLTFLoader();
    attachGltfDecoders(loader);
    pending = loader.loadAsync(url).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const meshes: AuthoredPropMesh[] = [];
      gltf.scene.traverse((object) => {
        const mesh = object as Mesh;
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrixWorld);
        const material = Array.isArray(mesh.material) ? mesh.material[0]! : mesh.material;
        meshes.push({ name: material.name || mesh.name, geometry, material });
      });
      if (meshes.length === 0) throw new Error(`${url} has no meshes`);
      return meshes;
    });
    // A failed load is not cached, so a later rebuild can try again.
    pending.catch(() => cache.delete(url));
    cache.set(url, pending);
  }
  return pending;
}

function buildGroup(meshes: AuthoredPropMesh[], name: string, castShadow: boolean): Group {
  const group = new Group();
  group.name = name;
  for (const part of meshes) {
    const mesh = new Mesh(part.geometry.clone(), part.material.clone());
    mesh.name = `${name}_${part.name}`;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

function buildLod(near: AuthoredPropMesh[], far: AuthoredPropMesh[], name: string): LOD {
  const lod = new LOD();
  lod.name = name;
  lod.addLevel(buildGroup(near, `${name}_Near`, true), 0);
  lod.addLevel(buildGroup(far, `${name}_Far`, false), FLOW_FEST_AUTHORED_PROP_FAR_METERS);
  return lod;
}

async function settle<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    console.warn("[flow-fest-sim] authored prop failed to load; keeping the primitive", error);
    return null;
  }
}

/**
 * Load the hero-prop GLBs and swap them into `root`. `isCurrent` is checked
 * after every await: a dressing that was rebuilt or destroyed meanwhile is
 * left untouched.
 */
export async function applyFlowFestAuthoredProps(
  root: Object3D,
  isCurrent: () => boolean,
  load: AuthoredPropLoader = loadAuthoredProp
): Promise<FlowFestAuthoredPropsResult> {
  const urls = FLOW_FEST_AUTHORED_PROP_URLS;
  const [canopyNear, canopyFar, fireNear, fireFar, lantern] = await Promise.all([
    settle(load(urls.canopy.near)),
    settle(load(urls.canopy.far)),
    settle(load(urls.fire.near)),
    settle(load(urls.fire.far)),
    settle(load(urls.lantern.near)),
  ]);
  const result: FlowFestAuthoredPropsResult = { canopy: false, fire: false, lanterns: false };
  if (!isCurrent()) return result;

  const canopyAnchor = root.getObjectByName("FFS_LEDFlowCircle_ModelAnchor");
  if (canopyAnchor && canopyNear && canopyFar) {
    canopyAnchor.add(buildLod(canopyNear, canopyFar, "FFS_LEDFlowCircle_TrussCanopy_GLB"));
    // The primitive posts stay as invisible camera colliders.
    canopyAnchor.parent?.traverse((object) => {
      if (
        object.name.startsWith("FFS_LEDFlowCircle_CanopyPost_") ||
        object.name === "FFS_LEDFlowCircle_FlatCanopy_Authored"
      ) {
        object.visible = false;
      }
    });
    result.canopy = true;
  }

  const fireRing = root.getObjectByName("FFS_FireJam_CentralFireRing_Authored");
  if (fireRing?.parent && fireNear && fireFar) {
    const fire = buildLod(fireNear, fireFar, "FFS_FireJam_FireCircle_GLB");
    fire.position.copy(fireRing.position);
    fireRing.parent.add(fire);
    fireRing.visible = false;
    result.fire = true;
  }

  const posts = root.getObjectByName("FFS_PathLanternPosts_AuthoredWayfinding") as InstancedMesh | undefined;
  const glows = root.getObjectByName("FFS_PathLanterns_AuthoredWayfinding") as InstancedMesh | undefined;
  if (posts?.isInstancedMesh && posts.parent && lantern) {
    posts.parent.add(buildLanternInstances(posts, glows, lantern));
    posts.visible = false;
    if (glows) glows.visible = false;
    result.lanterns = true;
  }
  return result;
}

/**
 * One InstancedMesh per lantern part, on the primitive posts' placements. Each
 * hook turns by the golden angle so a row of them does not read as stamped.
 * The glow keeps the runtime's unlit lantern material, so night tuning still
 * applies.
 */
function buildLanternInstances(posts: InstancedMesh, glows: InstancedMesh | undefined, meshes: AuthoredPropMesh[]): Group {
  const group = new Group();
  group.name = "FFS_PathLanterns_GLB";
  const matrices: Matrix4[] = [];
  const base = new Matrix4();
  const position = new Vector3();
  const quaternion = new Quaternion();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);
  for (let index = 0; index < posts.count; index += 1) {
    posts.getMatrixAt(index, base);
    base.decompose(position, quaternion, scale);
    position.y -= 0.02;
    quaternion.setFromAxisAngle(up, index * 2.39996);
    matrices.push(new Matrix4().compose(position, quaternion, scale));
  }
  for (const part of meshes) {
    const isGlow = /glow/i.test(part.name);
    const material = isGlow && glows ? (glows.material as Material) : part.material.clone();
    const instances = new InstancedMesh(part.geometry.clone(), material, matrices.length);
    instances.name = `FFS_PathLanterns_GLB_${part.name}`;
    instances.castShadow = !isGlow;
    matrices.forEach((matrix, index) => instances.setMatrixAt(index, matrix));
    instances.instanceMatrix.needsUpdate = true;
    instances.computeBoundingSphere();
    group.add(instances);
  }
  return group;
}
