import {
  InstancedMesh,
  Matrix4,
  Raycaster,
  Vector2,
  Vector3,
  type Camera,
  type Intersection,
  type Material,
  type Object3D,
} from "three";
import type {
  ViewPose,
  ViewTarget3D,
} from "#lib/shared/review/view-capture.js";

export interface EnvironmentReviewReading {
  camera: ViewPose;
  target?: ViewTarget3D;
}

const CENTRE = new Vector2(0, 0);
const direction = new Vector3();
const instanceMatrix = new Matrix4();
const worldMatrix = new Matrix4();
const origin = new Vector3();

const rounded = (value: number) => Math.round(value * 10_000) / 10_000;

const point = (value: Vector3) => ({
  x: rounded(value.x),
  y: rounded(value.y),
  z: rounded(value.z),
});

/** Convert Three's active camera into the shared replayable first-person pose. */
export function readEnvironmentReviewPose(camera: Camera): ViewPose {
  camera.getWorldPosition(origin);
  camera.getWorldDirection(direction);
  return {
    ...point(origin),
    yaw: rounded(Math.atan2(direction.x, direction.z)),
    // UnifiedCameraController defines positive pitch as looking down.
    pitch: rounded(Math.asin(Math.max(-1, Math.min(1, -direction.y)))),
  };
}

function materialNames(object: Object3D): string[] | undefined {
  const material = (
    object as Object3D & {
      material?: Material | Material[];
    }
  ).material;
  if (!material) return undefined;
  const names = (Array.isArray(material) ? material : [material])
    .map((entry) => entry.name.trim())
    .filter(Boolean);
  return names.length > 0 ? [...new Set(names)] : undefined;
}

function namedPath(object: Object3D): string[] | undefined {
  const path: string[] = [];
  let current: Object3D | null = object;
  while (current && path.length < 5) {
    if (current.name) path.push(current.name);
    current = current.parent;
  }
  return path.length > 0 ? path : undefined;
}

function primitiveMetadata(object: Object3D): ViewTarget3D["metadata"] {
  const metadata = Object.fromEntries(
    Object.entries(object.userData).filter(
      (entry): entry is [string, string | number | boolean] =>
        typeof entry[1] === "string" ||
        typeof entry[1] === "number" ||
        typeof entry[1] === "boolean"
    )
  );
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function hitOrigin(hit: Intersection<Object3D>): Vector3 {
  if (hit.instanceId !== undefined && hit.object instanceof InstancedMesh) {
    hit.object.getMatrixAt(hit.instanceId, instanceMatrix);
    worldMatrix.multiplyMatrices(hit.object.matrixWorld, instanceMatrix);
    return origin.setFromMatrixPosition(worldMatrix);
  }
  return hit.object.getWorldPosition(origin);
}

/**
 * Identify the exact object under the centre of a review camera.
 *
 * `instance` matters here: Autumn's repeated trees share one GPU mesh, so the
 * material identifies the family while instance + origin identifies the exact
 * placement Austen is looking at.
 */
export function inspectEnvironmentReviewTarget(
  scene: Object3D,
  camera: Camera,
  raycaster = new Raycaster()
): ViewTarget3D | undefined {
  scene.updateMatrixWorld(true);
  camera.updateMatrixWorld(true);
  raycaster.setFromCamera(CENTRE, camera);
  const hit = raycaster.intersectObjects(scene.children, true)[0];
  if (!hit) return undefined;

  const materials = materialNames(hit.object);
  const path = namedPath(hit.object);
  const metadata = primitiveMetadata(hit.object);
  return {
    object:
      hit.object.name ||
      hit.object.parent?.name ||
      hit.object.type ||
      "(unnamed 3D object)",
    ...(hit.instanceId !== undefined ? { instance: hit.instanceId } : {}),
    ...(materials ? { materials } : {}),
    point: point(hit.point),
    origin: point(hitOrigin(hit)),
    distance: rounded(hit.distance),
    ...(path ? { path } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

/** Rebuild an environment camera preset from a copied first-person pose. */
export function environmentReviewPresetFromPose(
  pose: ViewPose,
  fov: number
): {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
} {
  const horizontal = Math.cos(pose.pitch);
  return {
    position: [pose.x, pose.y, pose.z],
    target: [
      pose.x + Math.sin(pose.yaw) * horizontal,
      pose.y - Math.sin(pose.pitch),
      pose.z + Math.cos(pose.yaw) * horizontal,
    ],
    fov,
  };
}
