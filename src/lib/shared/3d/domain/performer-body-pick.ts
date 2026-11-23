/**
 * Pose-following pick volume for a Character's body.
 *
 * Three has no pick proxy that follows a skinned pose, and the mesh itself is
 * neither cheap to raycast (CPU skinning per triangle) nor on the application
 * thread when the worker renderer draws it. So each Character's body is
 * approximated by a few capsules, one per major bone, fitted once to that
 * Character's own mesh in bind pose. Reading the current pose then costs one
 * matrix read per capsule, and a ray test costs a few multiplies per capsule.
 *
 * Pure: no Svelte, no DOM. It runs in the worker and on the application thread.
 */
import {
  Matrix4,
  Vector3,
  type BufferAttribute,
  type Object3D,
  type SkinnedMesh,
} from "three";

/** Floats per world segment: `[ax, ay, az, bx, by, bz, radius]`. */
export const BODY_PICK_SEGMENT_STRIDE = 7;
/** Most capsules fitted to one Character. */
export const BODY_PICK_MAX_CAPSULES = 32;
/**
 * A bone whose vertex cloud spans less than this share of the Character's
 * height folds into its parent: a finger, a toe or a face bone is not a body
 * part of its own, an upper arm or a shin is.
 */
const MIN_PART_SPAN_OF_HEIGHT = 0.06;
const MIN_CLOUD_POINTS = 12;
const RADIUS_PADDING = 0.01;
const POWER_ITERATIONS = 40;
const RAY_EPSILON = 1e-9;

export interface BodyPickCapsule {
  bone: Object3D;
  /** Segment end points in the bone's local space. */
  a: Vector3;
  b: Vector3;
  /** In the bone's local units. */
  radius: number;
}

export interface BodyPickFit {
  capsules: readonly BodyPickCapsule[];
}

export interface BodyPickRayHit {
  distance: number;
  point: { x: number; y: number; z: number };
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/**
 * The bone index with the largest skin weight for one vertex, or null when the
 * mesh carries no skin data.
 */
export function dominantBoneIndex(
  mesh: SkinnedMesh,
  vertexIndex: number
): number | null {
  const skinIndex = mesh.geometry.getAttribute("skinIndex");
  const skinWeight = mesh.geometry.getAttribute("skinWeight");
  if (!skinIndex || !skinWeight || !mesh.skeleton) return null;

  let bestSlot = 0;
  let bestWeight = -Infinity;
  for (let slot = 0; slot < 4; slot += 1) {
    const weight = skinWeight.getComponent(vertexIndex, slot);
    if (weight > bestWeight) {
      bestWeight = weight;
      bestSlot = slot;
    }
  }
  return skinIndex.getComponent(vertexIndex, bestSlot);
}

function isSkinned(object: Object3D): object is SkinnedMesh {
  return (object as SkinnedMesh).isSkinnedMesh === true;
}

/** Whether a mesh under `root` is drawn and open to the pointer. */
function isPickableSkinnedMesh(mesh: SkinnedMesh, root: Object3D): boolean {
  let current: Object3D | null = mesh;
  while (current) {
    if (!current.visible) return false;
    if (current.userData.performerInteractionExcluded === true) return false;
    if (current === root) break;
    current = current.parent;
  }
  if (current !== root) return false;
  if (
    !mesh.skeleton ||
    !mesh.geometry.getAttribute("position") ||
    !mesh.geometry.getAttribute("skinIndex") ||
    !mesh.geometry.getAttribute("skinWeight")
  )
    return false;
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  return materials.some(
    (material) =>
      material &&
      material.visible &&
      material.colorWrite &&
      (!material.transparent || material.opacity > 0.001)
  );
}

function collectPickableMeshes(root: Object3D): SkinnedMesh[] {
  const meshes: SkinnedMesh[] = [];
  root.traverse((object) => {
    if (isSkinned(object) && isPickableSkinnedMesh(object, root))
      meshes.push(object);
  });
  return meshes;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const position = fraction * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(sorted.length - 1, lower + 1);
  const blend = position - lower;
  return sorted[lower]! * (1 - blend) + sorted[upper]! * blend;
}

/** The largest-variance direction of a point cloud, by power iteration. */
function principalAxis(points: readonly number[], centroid: Vector3): Vector3 {
  let xx = 0;
  let xy = 0;
  let xz = 0;
  let yy = 0;
  let yz = 0;
  let zz = 0;
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i]! - centroid.x;
    const y = points[i + 1]! - centroid.y;
    const z = points[i + 2]! - centroid.z;
    xx += x * x;
    xy += x * y;
    xz += x * z;
    yy += y * y;
    yz += y * z;
    zz += z * z;
  }
  // Start from the covariance column with the most energy, so the start is
  // never orthogonal to the dominant direction.
  const columns = [
    new Vector3(xx, xy, xz),
    new Vector3(xy, yy, yz),
    new Vector3(xz, yz, zz),
  ];
  const axis = columns.reduce((best, column) =>
    column.lengthSq() > best.lengthSq() ? column : best
  );
  if (axis.lengthSq() < 1e-18) return new Vector3(0, 1, 0);
  axis.normalize();
  const next = new Vector3();
  for (let i = 0; i < POWER_ITERATIONS; i += 1) {
    next.set(
      xx * axis.x + xy * axis.y + xz * axis.z,
      xy * axis.x + yy * axis.y + yz * axis.z,
      xz * axis.x + yz * axis.y + zz * axis.z
    );
    if (next.lengthSq() < 1e-18) break;
    axis.copy(next).normalize();
  }
  return axis;
}

/** Diagonal of a point cloud's bounding box. */
function cloudSpan(points: readonly number[]): number {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i]!;
    const y = points[i + 1]!;
    const z = points[i + 2]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ);
}

function fitCapsule(
  bone: Object3D,
  points: readonly number[]
): BodyPickCapsule | null {
  const count = points.length / 3;
  if (count < 3) return null;

  const centroid = new Vector3();
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (let i = 0; i < points.length; i += 3) {
    sumX += points[i]!;
    sumY += points[i + 1]!;
    sumZ += points[i + 2]!;
  }
  centroid.set(sumX / count, sumY / count, sumZ / count);

  const axis = principalAxis(points, centroid);
  const projections: number[] = [];
  const distances: number[] = [];
  for (let i = 0; i < points.length; i += 3) {
    const x = points[i]! - centroid.x;
    const y = points[i + 1]! - centroid.y;
    const z = points[i + 2]! - centroid.z;
    const along = x * axis.x + y * axis.y + z * axis.z;
    projections.push(along);
    distances.push(
      Math.hypot(x - axis.x * along, y - axis.y * along, z - axis.z * along)
    );
  }
  projections.sort((left, right) => left - right);
  distances.sort((left, right) => left - right);

  const low = percentile(projections, 0.005);
  const high = percentile(projections, 0.995);
  const radius = percentile(distances, 0.9) + RADIUS_PADDING;
  // The round caps must not stick out past the body, but a short bone still
  // keeps a sphere at its middle.
  let start = low + radius;
  let end = high - radius;
  let capRadius = radius;
  if (start > end) {
    // Too short for a capsule: one sphere that still reaches both ends.
    start = (low + high) / 2;
    end = start;
    capRadius = Math.max(radius, (high - low) / 2);
  }
  return {
    bone,
    a: centroid.clone().addScaledVector(axis, start),
    b: centroid.clone().addScaledVector(axis, end),
    radius: capRadius,
  };
}

/**
 * Fit capsules to every rendered skinned mesh under `root`, once per loaded
 * Character. The fit works in bind pose, so it does not depend on the pose the
 * Character is in when it runs.
 *
 * Vertices are owned by their dominant bone, then folded from the leaves
 * upward: a bone keeps a capsule once what it owns plus what folded into it
 * spans a body part's worth of space (a fraction of the Character's height),
 * and smaller pieces (fingers, toes, face bones, twist bones) fold into their
 * parent. Judging by spatial size rather than vertex share means a dense head
 * or split skin cannot make an arm vanish into the chest.
 */
export function fitBodyPickCapsules(root: Object3D): BodyPickFit {
  const meshes = collectPickableMeshes(root);
  if (meshes.length === 0) return { capsules: [] };

  const bindMatrix = new Matrix4();
  const point = new Vector3();
  /** Bind-pose world positions of the vertices each bone owns outright. */
  const own = new Map<Object3D, number[]>();
  const inverses = new Map<Object3D, Matrix4>();
  let minY = Infinity;
  let maxY = -Infinity;

  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position") as BufferAttribute;
    const bones = mesh.skeleton.bones;
    bones.forEach((bone, index) => {
      const inverse = mesh.skeleton.boneInverses[index];
      if (inverse && !inverses.has(bone)) inverses.set(bone, inverse);
    });
    bindMatrix.copy(mesh.bindMatrix);
    for (let vertex = 0; vertex < position.count; vertex += 1) {
      const dominant = dominantBoneIndex(mesh, vertex);
      const bone = dominant === null ? undefined : bones[dominant];
      if (!bone || !inverses.has(bone)) continue;
      // Bind-pose model space; every bone's inverse maps from here.
      point.fromBufferAttribute(position, vertex).applyMatrix4(bindMatrix);
      let cloud = own.get(bone);
      if (!cloud) {
        cloud = [];
        own.set(bone, cloud);
      }
      cloud.push(point.x, point.y, point.z);
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }
  const height = maxY - minY;
  if (!(height > 0)) return { capsules: [] };

  const skeletonParent = (bone: Object3D): Object3D | null => {
    let parent = bone.parent;
    while (parent && !inverses.has(parent)) parent = parent.parent;
    return parent;
  };
  const depthOf = (bone: Object3D): number => {
    let depth = 0;
    for (let at = skeletonParent(bone); at; at = skeletonParent(at)) depth += 1;
    return depth;
  };
  const leavesFirst = [...own.keys()]
    .flatMap((bone) => {
      // Ancestors that own nothing still pass folded clouds upward.
      const chain: Object3D[] = [bone];
      for (let at = skeletonParent(bone); at; at = skeletonParent(at))
        chain.push(at);
      return chain;
    })
    .filter((bone, index, all) => all.indexOf(bone) === index)
    .map((bone) => ({ bone, depth: depthOf(bone) }))
    .sort((left, right) => right.depth - left.depth)
    .map((entry) => entry.bone);

  const decide = (threshold: number): Map<Object3D, number[]> => {
    const pending = new Map<Object3D, number[]>();
    for (const [bone, cloud] of own) pending.set(bone, cloud.slice());
    const keptClouds = new Map<Object3D, number[]>();
    for (const bone of leavesFirst) {
      const cloud = pending.get(bone);
      if (!cloud || cloud.length < MIN_CLOUD_POINTS * 3) continue;
      const parent = skeletonParent(bone);
      if (!parent || cloudSpan(cloud) >= threshold) {
        keptClouds.set(bone, cloud);
        continue;
      }
      const target = pending.get(parent);
      if (target) for (const value of cloud) target.push(value);
      else pending.set(parent, cloud);
    }
    return keptClouds;
  };

  let threshold = height * MIN_PART_SPAN_OF_HEIGHT;
  let kept = decide(threshold);
  while (kept.size > BODY_PICK_MAX_CAPSULES) {
    threshold *= 1.15;
    kept = decide(threshold);
  }

  const capsules: BodyPickCapsule[] = [];
  const local = new Vector3();
  for (const [bone, cloud] of kept) {
    const inverse = inverses.get(bone)!;
    const inBone: number[] = [];
    for (let i = 0; i < cloud.length; i += 3) {
      local.set(cloud[i]!, cloud[i + 1]!, cloud[i + 2]!).applyMatrix4(inverse);
      inBone.push(local.x, local.y, local.z);
    }
    const capsule = fitCapsule(bone, inBone);
    if (capsule) capsules.push(capsule);
  }
  return { capsules };
}

/**
 * Write the capsules' current world segments into `out`, seven floats each.
 * Returns how many segments were written (limited by `out`'s room).
 */
export function writeBodyPickSegments(
  fit: BodyPickFit,
  out: Float32Array
): number {
  const room = Math.floor(out.length / BODY_PICK_SEGMENT_STRIDE);
  const count = Math.min(room, fit.capsules.length);
  const point = new Vector3();
  for (let index = 0; index < count; index += 1) {
    const capsule = fit.capsules[index]!;
    const matrix = capsule.bone.matrixWorld;
    const at = index * BODY_PICK_SEGMENT_STRIDE;
    point.copy(capsule.a).applyMatrix4(matrix);
    out[at] = point.x;
    out[at + 1] = point.y;
    out[at + 2] = point.z;
    point.copy(capsule.b).applyMatrix4(matrix);
    out[at + 3] = point.x;
    out[at + 4] = point.y;
    out[at + 5] = point.z;
    out[at + 6] = capsule.radius * matrix.getMaxScaleOnAxis();
  }
  return count;
}

/** Nearest non-negative ray parameter on a sphere, or null. */
function raySphere(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  cx: number,
  cy: number,
  cz: number,
  radius: number
): number | null {
  const lx = ox - cx;
  const ly = oy - cy;
  const lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = -b - root;
  if (near >= 0) return near;
  const far = -b + root;
  return far >= 0 ? far : null;
}

/** Nearest hit of a ray on a capsule's outside, or null. */
function rayCapsule(
  origin: Point3,
  direction: Point3,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  radius: number
): number | null {
  let best: number | null = null;
  const consider = (t: number | null) => {
    if (t !== null && (best === null || t < best)) best = t;
  };
  const { x: ox, y: oy, z: oz } = origin;
  const { x: dx, y: dy, z: dz } = direction;

  consider(raySphere(ox, oy, oz, dx, dy, dz, ax, ay, az, radius));
  consider(raySphere(ox, oy, oz, dx, dy, dz, bx, by, bz, radius));

  // The straight side. A hit whose foot lies beyond the segment belongs to a
  // round cap, which the two spheres already cover.
  const sx = bx - ax;
  const sy = by - ay;
  const sz = bz - az;
  const segmentSq = sx * sx + sy * sy + sz * sz;
  if (segmentSq > RAY_EPSILON) {
    const ex = ox - ax;
    const ey = oy - ay;
    const ez = oz - az;
    const sd = sx * dx + sy * dy + sz * dz;
    const se = sx * ex + sy * ey + sz * ez;
    const de = dx * ex + dy * ey + dz * ez;
    const ee = ex * ex + ey * ey + ez * ez;
    const a = segmentSq - sd * sd;
    if (a > RAY_EPSILON * segmentSq) {
      const b = segmentSq * de - se * sd;
      const c = segmentSq * ee - se * se - radius * radius * segmentSq;
      const discriminant = b * b - a * c;
      if (discriminant >= 0) {
        const t = (-b - Math.sqrt(discriminant)) / a;
        if (t >= 0) {
          const foot = se + t * sd;
          if (foot > 0 && foot < segmentSq) consider(t);
        }
      }
    }
  }
  return best;
}

/**
 * Ray against world segments in the layout `writeBodyPickSegments` writes.
 * `direction` must be unit length. Returns the nearest hit or null.
 */
export function raycastBodyPickSegments(
  origin: Point3,
  direction: Point3,
  segments: ArrayLike<number>
): BodyPickRayHit | null {
  let nearest: number | null = null;
  for (
    let at = 0;
    at + BODY_PICK_SEGMENT_STRIDE <= segments.length;
    at += BODY_PICK_SEGMENT_STRIDE
  ) {
    const distance = rayCapsule(
      origin,
      direction,
      segments[at]!,
      segments[at + 1]!,
      segments[at + 2]!,
      segments[at + 3]!,
      segments[at + 4]!,
      segments[at + 5]!,
      segments[at + 6]!
    );
    if (distance !== null && (nearest === null || distance < nearest))
      nearest = distance;
  }
  if (nearest === null) return null;
  return {
    distance: nearest,
    point: {
      x: origin.x + direction.x * nearest,
      y: origin.y + direction.y * nearest,
      z: origin.z + direction.z * nearest,
    },
  };
}

function skinnedMeshSignature(root: Object3D): string {
  let signature = "";
  root.traverse((object) => {
    if (isSkinned(object)) signature += `${object.uuid};`;
  });
  return signature;
}

/**
 * Body segments for a Character that loads into `root` after `root` exists,
 * on the application thread. It fits lazily on first use and again whenever
 * the set of skinned meshes under `root` changes, then rewrites the same array
 * from the live bones on each call. It does nothing between calls.
 * Returns null while there is no fitted body, so the caller can fall back.
 */
export function createLiveBodyPick(root: Object3D): () => Float32Array | null {
  let signature: string | null = null;
  let fit: BodyPickFit | null = null;
  let segments: Float32Array | null = null;
  return () => {
    const current = skinnedMeshSignature(root);
    if (current !== signature) {
      signature = current;
      fit = current === "" ? null : fitBodyPickCapsules(root);
      segments =
        fit && fit.capsules.length > 0
          ? new Float32Array(fit.capsules.length * BODY_PICK_SEGMENT_STRIDE)
          : null;
    }
    if (!fit || !segments) return null;
    writeBodyPickSegments(fit, segments);
    return segments;
  };
}
