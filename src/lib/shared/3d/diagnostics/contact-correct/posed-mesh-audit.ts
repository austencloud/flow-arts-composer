import { Triangle, Vector3, type Object3D, type SkinnedMesh } from "three";

export interface FiniteStaffCylinder {
  a: Readonly<Vector3>;
  b: Readonly<Vector3>;
  radius: number;
}

export interface HeldPalmExclusion {
  boneNames: ReadonlySet<string>;
  gripCenter: Readonly<Vector3>;
  gripAxis: Readonly<Vector3>;
  halfAxialWindow: number;
}

export interface PosedMeshAuditOptions {
  root: Object3D | null | undefined;
  staff: FiniteStaffCylinder;
  heldPalm?: HeldPalmExclusion;
  maxTriangles?: number;
}

export type PosedMeshAuditStatus = "available" | "unavailable" | "exhausted";

export interface PosedMeshAuditResult {
  status: PosedMeshAuditStatus;
  maximumPenetrationM: number | null;
  affectedRegions: readonly string[];
  testedTriangles: number;
  excludedPalmTriangles: number;
  reason: string | null;
  /** Dominant skinning bones identify the affected skin, not anatomical tissue. */
  worstIntersection?: {
    meshName: string;
    triangleIndex: number;
    boneNames: readonly string[];
    penetrationM: number;
  } | null;
  /** Surface-triangle contact only; a separate closed-volume query is required
   * before certifying that a shaft wholly inside a torso is clear. */
  interiorContainment: "clear" | "contained" | "unavailable" | "ambiguous";
}

const DEFAULT_MAX_TRIANGLES = 250_000;
const RAY_DIRECTIONS = [
  new Vector3(1, 0.271, 0.613).normalize(),
  new Vector3(-0.417, 1, 0.193).normalize(),
];
const watertightByGeometry = new WeakMap<object, boolean>();

function isRendered(object: Object3D): boolean {
  for (
    let current: Object3D | null = object;
    current;
    current = current.parent
  ) {
    if (!current.visible) return false;
  }
  return true;
}

function dominantBoneName(
  mesh: SkinnedMesh,
  vertexIndex: number
): string | null {
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
  return (
    mesh.skeleton.bones[skinIndex.getComponent(vertexIndex, bestSlot)]?.name ??
    null
  );
}

function isHeldPalmTriangle(
  mesh: SkinnedMesh,
  indices: readonly number[],
  vertices: readonly Vector3[],
  exclusion: HeldPalmExclusion | undefined
): boolean {
  if (!exclusion || exclusion.boneNames.size === 0) return false;
  const axis = exclusion.gripAxis;
  if (axis.lengthSq() < 1e-12) return false;
  const inverseAxisLength = 1 / axis.length();
  const centerProjection = exclusion.gripCenter.dot(axis) * inverseAxisLength;

  return indices.every((index, slot) => {
    const boneName = dominantBoneName(mesh, index);
    if (!boneName || !exclusion.boneNames.has(boneName)) return false;
    // This is the grip-axis projection without subtracting from a posed
    // vertex. The triangle is still needed for the collision query below.
    const axialPosition =
      vertices[slot]!.dot(axis) * inverseAxisLength - centerProjection;
    return Math.abs(axialPosition) <= exclusion.halfAxialWindow;
  });
}

function segmentSegmentDistanceSq(
  a: Vector3,
  b: Vector3,
  c: Vector3,
  d: Vector3
): number {
  const ab = new Vector3().subVectors(b, a);
  const cd = new Vector3().subVectors(d, c);
  const ac = new Vector3().subVectors(a, c);
  const aa = ab.dot(ab);
  const cc = cd.dot(cd);
  const acDot = ab.dot(cd);
  const abAc = ab.dot(ac);
  const cdAc = cd.dot(ac);
  const denominator = aa * cc - acDot * acDot;
  let s = denominator > 1e-12 ? (acDot * cdAc - cc * abAc) / denominator : 0;
  s = Math.max(0, Math.min(1, s));
  let t = cc > 1e-12 ? (acDot * s + cdAc) / cc : 0;
  t = Math.max(0, Math.min(1, t));
  if (aa > 1e-12) s = Math.max(0, Math.min(1, (acDot * t - abAc) / aa));
  return new Vector3()
    .copy(ab)
    .multiplyScalar(s)
    .add(a)
    .distanceToSquared(new Vector3().copy(cd).multiplyScalar(t).add(c));
}

function segmentIntersectsTriangle(
  a: Vector3,
  b: Vector3,
  triangle: Triangle
): boolean {
  const direction = new Vector3().subVectors(b, a);
  const length = direction.length();
  if (length <= 1e-12) return triangle.containsPoint(a);
  direction.multiplyScalar(1 / length);
  const normal = triangle.getNormal(new Vector3());
  const denominator = normal.dot(direction);
  if (Math.abs(denominator) <= 1e-12) return false;
  const distance =
    normal.dot(new Vector3().subVectors(triangle.a, a)) / denominator;
  if (distance < 0 || distance > length) return false;
  return triangle.containsPoint(
    new Vector3().copy(direction).multiplyScalar(distance).add(a)
  );
}

// Triangle vertices alone miss a staff that pierces a large face polygon. This
// compares the finite shaft axis to the whole triangle as well as its edges.
function triangleStaffDistance(
  triangle: Triangle,
  staff: FiniteStaffCylinder
): number {
  if (segmentIntersectsTriangle(staff.a, staff.b, triangle)) return 0;
  const closest = new Vector3();
  let distanceSq = Math.min(
    triangle.closestPointToPoint(staff.a, closest).distanceToSquared(staff.a),
    triangle.closestPointToPoint(staff.b, closest).distanceToSquared(staff.b)
  );
  // A shaft can run parallel to a broad triangle with both caps outside its
  // footprint. Midpoint sampling catches that interior face contact without
  // relying on vertices or edge-only tests.
  const midpoint = new Vector3().lerpVectors(staff.a, staff.b, 0.5);
  distanceSq = Math.min(
    distanceSq,
    triangle.closestPointToPoint(midpoint, closest).distanceToSquared(midpoint)
  );
  for (const vertex of [triangle.a, triangle.b, triangle.c]) {
    distanceSq = Math.min(
      distanceSq,
      segmentSegmentDistanceSq(staff.a, staff.b, vertex, triangle.a)
    );
    distanceSq = Math.min(
      distanceSq,
      segmentSegmentDistanceSq(staff.a, staff.b, vertex, triangle.b)
    );
    distanceSq = Math.min(
      distanceSq,
      segmentSegmentDistanceSq(staff.a, staff.b, vertex, triangle.c)
    );
  }
  return Math.sqrt(distanceSq);
}

function rayTriangleDistance(
  origin: Vector3,
  direction: Vector3,
  triangle: Triangle
): number | null {
  const edgeAB = new Vector3().subVectors(triangle.b, triangle.a);
  const edgeAC = new Vector3().subVectors(triangle.c, triangle.a);
  const p = new Vector3().crossVectors(direction, edgeAC);
  const determinant = edgeAB.dot(p);
  if (Math.abs(determinant) < 1e-9) return null;
  const inverse = 1 / determinant;
  const offset = new Vector3().subVectors(origin, triangle.a);
  const u = offset.dot(p) * inverse;
  if (u < -1e-7 || u > 1 + 1e-7) return null;
  const q = new Vector3().crossVectors(offset, edgeAB);
  const v = direction.dot(q) * inverse;
  if (v < -1e-7 || u + v > 1 + 1e-7) return null;
  const distance = edgeAC.dot(q) * inverse;
  return distance > 1e-7 ? distance : null;
}

function watertight(mesh: SkinnedMesh): boolean {
  const cached = watertightByGeometry.get(mesh.geometry);
  if (cached !== undefined) return cached;
  const position = mesh.geometry.getAttribute("position");
  if (!position) return false;
  const index = mesh.geometry.getIndex();
  const edgeCounts = new Map<string, number>();
  const pointKey = (vertex: number) =>
    `${position.getX(vertex).toFixed(6)},${position.getY(vertex).toFixed(6)},${position.getZ(vertex).toFixed(6)}`;
  const addEdge = (first: number, second: number) => {
    const [a, b] = [pointKey(first), pointKey(second)].sort();
    const key = `${a}|${b}`;
    edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  };
  const count = (index ? index.count : position.count) / 3;
  for (let i = 0; i < count; i += 1) {
    const offset = i * 3;
    const a = index ? index.getX(offset) : offset;
    const b = index ? index.getX(offset + 1) : offset + 1;
    const c = index ? index.getX(offset + 2) : offset + 2;
    addEdge(a, b);
    addEdge(b, c);
    addEdge(c, a);
  }
  const result =
    edgeCounts.size > 0 &&
    [...edgeCounts.values()].every((count) => count === 2);
  watertightByGeometry.set(mesh.geometry, result);
  return result;
}

function pointInsideClosedMesh(
  point: Vector3,
  triangles: readonly Triangle[]
): "clear" | "contained" | "ambiguous" {
  const parities = RAY_DIRECTIONS.map((direction) => {
    const distances = triangles
      .map((triangle) => rayTriangleDistance(point, direction, triangle))
      .filter((distance): distance is number => distance !== null)
      .sort((a, b) => a - b);
    const uniqueHits = distances.filter(
      (distance, index) =>
        index === 0 || Math.abs(distance - distances[index - 1]!) > 1e-6
    );
    return uniqueHits.length % 2 === 1;
  });
  return parities[0] === parities[1]
    ? parities[0]
      ? "contained"
      : "clear"
    : "ambiguous";
}

export function auditPosedMeshAgainstStaff(
  options: PosedMeshAuditOptions
): PosedMeshAuditResult {
  if (!options.root) {
    return {
      status: "unavailable",
      maximumPenetrationM: null,
      affectedRegions: [],
      testedTriangles: 0,
      excludedPalmTriangles: 0,
      reason: "missing-mesh-root",
      interiorContainment: "unavailable",
    };
  }
  const maxTriangles = options.maxTriangles ?? DEFAULT_MAX_TRIANGLES;
  let foundSkinnedMesh = false;
  let testedTriangles = 0;
  let excludedPalmTriangles = 0;
  let maximumPenetrationM = 0;
  let worstIntersection: PosedMeshAuditResult["worstIntersection"] = null;
  const affectedRegions = new Set<string>();
  const closedMeshTriangles: Triangle[][] = [];
  let hasNonWatertightMesh = false;
  let budgetExhausted = false;
  const va = new Vector3();
  const vb = new Vector3();
  const vc = new Vector3();

  options.root.updateWorldMatrix(true, true);
  // SkinnedMesh refreshes its attached bind inverse in updateMatrixWorld,
  // not updateWorldMatrix. Match the renderer before reading posed vertices.
  options.root.updateMatrixWorld(true);
  options.root.traverse((object) => {
    if (!(object as SkinnedMesh).isSkinnedMesh || !isRendered(object)) return;
    const mesh = object as SkinnedMesh;
    const position = mesh.geometry.getAttribute("position");
    if (!position || !mesh.getVertexPosition) return;
    foundSkinnedMesh = true;
    const isClosed = watertight(mesh);
    if (!isClosed) hasNonWatertightMesh = true;
    const meshTriangles: Triangle[] = [];
    const index = mesh.geometry.getIndex();
    const triangleCount = (index ? index.count : position.count) / 3;
    for (
      let triangleIndex = 0;
      triangleIndex < triangleCount;
      triangleIndex += 1
    ) {
      if (testedTriangles >= maxTriangles) {
        budgetExhausted = true;
        break;
      }
      const offset = triangleIndex * 3;
      const ia = index ? index.getX(offset) : offset;
      const ib = index ? index.getX(offset + 1) : offset + 1;
      const ic = index ? index.getX(offset + 2) : offset + 2;
      mesh.getVertexPosition(ia, va).applyMatrix4(mesh.matrixWorld);
      mesh.getVertexPosition(ib, vb).applyMatrix4(mesh.matrixWorld);
      mesh.getVertexPosition(ic, vc).applyMatrix4(mesh.matrixWorld);
      const vertices = [va, vb, vc];
      const triangle = new Triangle(va, vb, vc);
      // Palm contact may be intentionally excluded from surface penetration,
      // but it must remain in the closed-volume shell. Removing it creates a
      // false hole that can turn an enclosed staff into a clearance pass.
      if (isClosed)
        meshTriangles.push(new Triangle(va.clone(), vb.clone(), vc.clone()));
      testedTriangles += 1;
      if (isHeldPalmTriangle(mesh, [ia, ib, ic], vertices, options.heldPalm)) {
        excludedPalmTriangles += 1;
        continue;
      }
      const distance = triangleStaffDistance(triangle, options.staff);
      const penetration = options.staff.radius - distance;
      if (penetration > 0) {
        if (penetration > maximumPenetrationM) {
          worstIntersection = {
            meshName: mesh.name || "unnamed-skinned-mesh",
            triangleIndex,
            boneNames: [
              ...new Set(
                [ia, ib, ic]
                  .map((vertex) => dominantBoneName(mesh, vertex))
                  .filter((name): name is string => name !== null)
              ),
            ].sort(),
            penetrationM: penetration,
          };
        }
        maximumPenetrationM = Math.max(maximumPenetrationM, penetration);
        affectedRegions.add(mesh.name || "unnamed-skinned-mesh");
      }
    }
    if (isClosed) closedMeshTriangles.push(meshTriangles);
  });

  if (!foundSkinnedMesh) {
    return {
      status: "unavailable",
      maximumPenetrationM: null,
      affectedRegions: [],
      testedTriangles,
      excludedPalmTriangles,
      reason: "no-skinned-mesh",
      interiorContainment: "unavailable",
    };
  }
  const containment =
    hasNonWatertightMesh || closedMeshTriangles.length === 0 || budgetExhausted
      ? "unavailable"
      : [0.25, 0.5, 0.75]
          .map((t) => {
            const point = new Vector3().lerpVectors(
              options.staff.a,
              options.staff.b,
              t
            );
            const checks = closedMeshTriangles.map((triangles) =>
              pointInsideClosedMesh(point, triangles)
            );
            return checks.includes("contained")
              ? "contained"
              : checks.includes("ambiguous")
                ? "ambiguous"
                : "clear";
          })
          .reduce<"clear" | "contained" | "ambiguous">(
            (state, next) =>
              state === "contained" || next === "contained"
                ? "contained"
                : state === "ambiguous" || next === "ambiguous"
                  ? "ambiguous"
                  : "clear",
            "clear"
          );
  return {
    status: budgetExhausted ? "exhausted" : "available",
    maximumPenetrationM,
    worstIntersection,
    affectedRegions: [...affectedRegions].sort(),
    testedTriangles,
    excludedPalmTriangles,
    reason: budgetExhausted ? "triangle-budget-exhausted" : null,
    interiorContainment: containment,
  };
}
