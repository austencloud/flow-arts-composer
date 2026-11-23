/**
 * Silhouette agreement between a real skinned character and its fitted body
 * pick capsules. Both are flattened onto a 1 cm grid from the front and from
 * the side. The mesh is rasterised triangle by triangle from CPU-skinned
 * vertices; each capsule is the exact orthographic silhouette of a swept
 * sphere (a stadium).
 */
import {
  Box3,
  Bone,
  Object3D,
  Quaternion,
  Vector3,
  type SkinnedMesh,
} from "three";
import {
  BODY_PICK_SEGMENT_STRIDE,
  fitBodyPickCapsules,
  writeBodyPickSegments,
} from "#lib/shared/3d/domain/performer-body-pick.js";

export const CELL_M = 0.01;
export const OVERREACH_LIMIT_M = 0.05;
export const COVERAGE_LIMIT_M = 0.03;

export type PoseName = "bind" | "left-arm-up" | "right-arm-up" | "legs-apart";
export const POSES: readonly PoseName[] = [
  "bind",
  "left-arm-up",
  "right-arm-up",
  "legs-apart",
];

export function findBone(root: Object3D, suffix: string): Bone | null {
  let hit: Bone | null = null;
  root.traverse((node) => {
    if (!hit && (node as Bone).isBone && node.name.endsWith(suffix))
      hit = node as Bone;
  });
  return hit;
}

const worldA = new Vector3();
const worldB = new Vector3();
const qWorld = new Quaternion();
const qParent = new Quaternion();
const qDelta = new Quaternion();

/** Turn `bone` so the direction to `child` points along `target` (world). */
function aim(bone: Bone, child: Bone, target: Vector3): void {
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(worldA);
  child.getWorldPosition(worldB);
  const current = worldB.sub(worldA).normalize();
  qDelta.setFromUnitVectors(current, target.clone().normalize());
  bone.getWorldQuaternion(qWorld);
  qWorld.premultiply(qDelta);
  if (bone.parent) bone.parent.getWorldQuaternion(qParent);
  else qParent.identity();
  bone.quaternion.copy(qParent.invert().multiply(qWorld));
  bone.updateMatrixWorld(true);
}

export interface BindPose {
  restore(): void;
}

function snapshot(root: Object3D): BindPose {
  const saved: { bone: Bone; q: Quaternion }[] = [];
  root.traverse((node) => {
    if ((node as Bone).isBone)
      saved.push({ bone: node as Bone, q: node.quaternion.clone() });
  });
  return {
    restore() {
      for (const { bone, q } of saved) bone.quaternion.copy(q);
      root.updateMatrixWorld(true);
    },
  };
}

export function bindPoseOf(root: Object3D): BindPose {
  return snapshot(root);
}

export function applyPose(root: Object3D, pose: PoseName): void {
  const arm = (side: "Left" | "Right", target: Vector3) => {
    const upper = findBone(root, `${side}Arm`);
    const fore = findBone(root, `${side}ForeArm`);
    if (!upper || !fore) return;
    aim(upper, fore, target);
    const hand = findBone(root, `${side}Hand`);
    if (hand) aim(fore, hand, target);
  };
  if (pose === "left-arm-up") {
    arm("Left", new Vector3(0, 1, 0));
    arm("Right", new Vector3(0, -1, 0));
  } else if (pose === "right-arm-up") {
    arm("Right", new Vector3(0, 1, 0));
    arm("Left", new Vector3(0, -1, 0));
  } else if (pose === "legs-apart") {
    for (const side of ["Left", "Right"] as const) {
      const thigh = findBone(root, `${side}UpLeg`);
      const shin = findBone(root, `${side}Leg`);
      if (!thigh || !shin) continue;
      thigh.getWorldPosition(worldA);
      const outward = Math.sign(worldA.x) || 1;
      aim(thigh, shin, new Vector3(outward * 0.6, -1, 0));
    }
    arm("Left", new Vector3(0, -1, 0));
    arm("Right", new Vector3(0, -1, 0));
  }
  root.updateMatrixWorld(true);
}

interface Grid {
  minU: number;
  minV: number;
  width: number;
  height: number;
  cells: Uint8Array;
}

function makeGrid(
  minU: number,
  maxU: number,
  minV: number,
  maxV: number
): Grid {
  const width = Math.ceil((maxU - minU) / CELL_M) + 1;
  const height = Math.ceil((maxV - minV) / CELL_M) + 1;
  return { minU, minV, width, height, cells: new Uint8Array(width * height) };
}

function rasteriseTriangle(
  grid: Grid,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): void {
  const minX = Math.max(
    0,
    Math.floor((Math.min(ax, bx, cx) - grid.minU) / CELL_M)
  );
  const maxX = Math.min(
    grid.width - 1,
    Math.ceil((Math.max(ax, bx, cx) - grid.minU) / CELL_M)
  );
  const minY = Math.max(
    0,
    Math.floor((Math.min(ay, by, cy) - grid.minV) / CELL_M)
  );
  const maxY = Math.min(
    grid.height - 1,
    Math.ceil((Math.max(ay, by, cy) - grid.minV) / CELL_M)
  );
  const denominator = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  if (Math.abs(denominator) < 1e-14) {
    // A sliver: splat its corners so thin parts are not lost.
    for (const [x, y] of [
      [ax, ay],
      [bx, by],
      [cx, cy],
    ] as const) {
      const gx = Math.round((x - grid.minU) / CELL_M);
      const gy = Math.round((y - grid.minV) / CELL_M);
      if (gx >= 0 && gy >= 0 && gx < grid.width && gy < grid.height)
        grid.cells[gy * grid.width + gx] = 1;
    }
    return;
  }
  const pad = 0.5 * CELL_M;
  for (let gy = minY; gy <= maxY; gy += 1) {
    const y = grid.minV + gy * CELL_M;
    for (let gx = minX; gx <= maxX; gx += 1) {
      const x = grid.minU + gx * CELL_M;
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / denominator;
      const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / denominator;
      const l3 = 1 - l1 - l2;
      const edge = pad / Math.max(Math.sqrt(Math.abs(denominator)), 1e-6);
      if (l1 >= -edge && l2 >= -edge && l3 >= -edge)
        grid.cells[gy * grid.width + gx] = 1;
    }
  }
}

function distanceToSegment2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const sx = bx - ax;
  const sy = by - ay;
  const lengthSq = sx * sx + sy * sy;
  const t =
    lengthSq < 1e-12
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * sx + (py - ay) * sy) / lengthSq));
  return Math.hypot(px - (ax + sx * t), py - (ay + sy * t));
}

function dilatedContains(grid: Grid, gx: number, gy: number, reach: number) {
  const r = Math.ceil(reach / CELL_M);
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      if (Math.hypot(dx, dy) * CELL_M > reach) continue;
      const x = gx + dx;
      const y = gy + dy;
      if (x < 0 || y < 0 || x >= grid.width || y >= grid.height) continue;
      if (grid.cells[y * grid.width + x]) return true;
    }
  }
  return false;
}

export interface ViewScore {
  meshCells: number;
  capsuleCells: number;
  /** Capsule cells with no mesh within 5 cm. */
  overreachCells: number;
  /** Mesh cells with no capsule within 3 cm. */
  uncoveredCells: number;
  /** Where the uncovered cells are: "u,v" metres rounded to 10 cm, counted. */
  uncoveredWhere: Record<string, number>;
  overreachWhere: Record<string, number>;
}

export interface PoseScore {
  pose: PoseName;
  front: ViewScore;
  side: ViewScore;
  overreach: number;
  uncovered: number;
}

export function scorePose(
  root: Object3D,
  meshes: readonly SkinnedMesh[],
  segments: Float32Array,
  count: number
): PoseScore {
  const front = scoreView(root, meshes, segments, count, 0);
  const side = scoreView(root, meshes, segments, count, 2);
  const capsuleCells = front.capsuleCells + side.capsuleCells;
  const meshCells = front.meshCells + side.meshCells;
  return {
    pose: "bind",
    front,
    side,
    overreach:
      (front.overreachCells + side.overreachCells) / Math.max(1, capsuleCells),
    uncovered:
      (front.uncoveredCells + side.uncoveredCells) / Math.max(1, meshCells),
  };
}

function scoreView(
  _root: Object3D,
  meshes: readonly SkinnedMesh[],
  segments: Float32Array,
  count: number,
  horizontalAxis: 0 | 2
): ViewScore {
  const uAt = (v: Vector3) => (horizontalAxis === 0 ? v.x : v.z);

  // Posed vertices once, then bounds.
  const vertexSets: Float32Array[] = [];
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const point = new Vector3();
  for (const mesh of meshes) {
    mesh.skeleton.update();
    const position = mesh.geometry.getAttribute("position");
    const out = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i += 1) {
      mesh.getVertexPosition(i, point);
      point.applyMatrix4(mesh.matrixWorld);
      out[i * 2] = uAt(point);
      out[i * 2 + 1] = point.y;
      minU = Math.min(minU, out[i * 2]!);
      maxU = Math.max(maxU, out[i * 2]!);
      minV = Math.min(minV, point.y);
      maxV = Math.max(maxV, point.y);
    }
    vertexSets.push(out);
  }
  for (let s = 0; s < count; s += 1) {
    const at = s * BODY_PICK_SEGMENT_STRIDE;
    const r = segments[at + 6]!;
    const hs = horizontalAxis;
    for (const o of [0, 3]) {
      minU = Math.min(minU, segments[at + o + hs]! - r);
      maxU = Math.max(maxU, segments[at + o + hs]! + r);
      minV = Math.min(minV, segments[at + o + 1]! - r);
      maxV = Math.max(maxV, segments[at + o + 1]! + r);
    }
  }
  const pad = 0.1;
  const meshGrid = makeGrid(minU - pad, maxU + pad, minV - pad, maxV + pad);
  const capsuleGrid = makeGrid(minU - pad, maxU + pad, minV - pad, maxV + pad);

  meshes.forEach((mesh, meshIndex) => {
    const uv = vertexSets[meshIndex]!;
    const index = mesh.geometry.getIndex();
    const triangles = index
      ? index.count / 3
      : mesh.geometry.getAttribute("position").count / 3;
    for (let t = 0; t < triangles; t += 1) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      rasteriseTriangle(
        meshGrid,
        uv[a * 2]!,
        uv[a * 2 + 1]!,
        uv[b * 2]!,
        uv[b * 2 + 1]!,
        uv[c * 2]!,
        uv[c * 2 + 1]!
      );
    }
  });

  for (let s = 0; s < count; s += 1) {
    const at = s * BODY_PICK_SEGMENT_STRIDE;
    const ax = segments[at + horizontalAxis]!;
    const ay = segments[at + 1]!;
    const bx = segments[at + 3 + horizontalAxis]!;
    const by = segments[at + 4]!;
    const r = segments[at + 6]!;
    const x0 = Math.max(
      0,
      Math.floor((Math.min(ax, bx) - r - capsuleGrid.minU) / CELL_M)
    );
    const x1 = Math.min(
      capsuleGrid.width - 1,
      Math.ceil((Math.max(ax, bx) + r - capsuleGrid.minU) / CELL_M)
    );
    const y0 = Math.max(
      0,
      Math.floor((Math.min(ay, by) - r - capsuleGrid.minV) / CELL_M)
    );
    const y1 = Math.min(
      capsuleGrid.height - 1,
      Math.ceil((Math.max(ay, by) + r - capsuleGrid.minV) / CELL_M)
    );
    for (let gy = y0; gy <= y1; gy += 1)
      for (let gx = x0; gx <= x1; gx += 1) {
        const x = capsuleGrid.minU + gx * CELL_M;
        const y = capsuleGrid.minV + gy * CELL_M;
        if (distanceToSegment2D(x, y, ax, ay, bx, by) <= r)
          capsuleGrid.cells[gy * capsuleGrid.width + gx] = 1;
      }
  }

  const score: ViewScore = {
    meshCells: 0,
    capsuleCells: 0,
    overreachCells: 0,
    uncoveredCells: 0,
    uncoveredWhere: {},
    overreachWhere: {},
  };
  const bucket = (gx: number, gy: number) =>
    `${(Math.round((grid0.minU + gx * CELL_M) * 10) / 10).toFixed(1)},${(Math.round((grid0.minV + gy * CELL_M) * 10) / 10).toFixed(1)}`;
  const grid0 = meshGrid;
  for (let gy = 0; gy < meshGrid.height; gy += 1)
    for (let gx = 0; gx < meshGrid.width; gx += 1) {
      const at = gy * meshGrid.width + gx;
      if (capsuleGrid.cells[at]) {
        score.capsuleCells += 1;
        if (!dilatedContains(meshGrid, gx, gy, OVERREACH_LIMIT_M)) {
          score.overreachCells += 1;
          const k = bucket(gx, gy);
          score.overreachWhere[k] = (score.overreachWhere[k] ?? 0) + 1;
        }
      }
      if (meshGrid.cells[at]) {
        score.meshCells += 1;
        if (!dilatedContains(capsuleGrid, gx, gy, COVERAGE_LIMIT_M)) {
          score.uncoveredCells += 1;
          const k = bucket(gx, gy);
          score.uncoveredWhere[k] = (score.uncoveredWhere[k] ?? 0) + 1;
        }
      }
    }
  return score;
}

export interface CharacterReport {
  capsuleCount: number;
  kept: string[];
  poses: PoseScore[];
}

/** The app sizes every Character to this height; do the same here. */
const PERFORMER_HEIGHT_M = 1.905;

export function measureCharacter(scene: Object3D): CharacterReport {
  scene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(scene, true);
  const measured = bounds.max.y - bounds.min.y;
  if (measured > 0) scene.scale.multiplyScalar(PERFORMER_HEIGHT_M / measured);
  scene.updateMatrixWorld(true);
  const meshes: SkinnedMesh[] = [];
  scene.traverse((o) => {
    const m = o as SkinnedMesh;
    if (m.isSkinnedMesh && m.visible) meshes.push(m);
  });
  const saved = bindPoseOf(scene);
  const fit = fitBodyPickCapsules(scene);
  const segments = new Float32Array(
    fit.capsules.length * BODY_PICK_SEGMENT_STRIDE
  );
  const poses: PoseScore[] = [];
  for (const pose of POSES) {
    saved.restore();
    applyPose(scene, pose);
    const count = writeBodyPickSegments(fit, segments);
    const score = scorePose(scene, meshes, segments, count);
    score.pose = pose;
    poses.push(score);
  }
  saved.restore();
  return {
    capsuleCount: fit.capsules.length,
    kept: fit.capsules.map((capsule) => {
      const length = capsule.a.distanceTo(capsule.b);
      return `${capsule.bone.name} len=${length.toFixed(2)} r=${capsule.radius.toFixed(3)}`;
    }),
    poses,
  };
}
