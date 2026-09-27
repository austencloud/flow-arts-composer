/**
 * Staffs against the performer's rendered mesh.
 *
 * The package's `CollisionDetector` models the body as spheres on the spine
 * bones and a face sphere placed from the shoulder line. On the shipped rigs
 * that formula puts the face 8 cm behind the head, and the spine spheres miss
 * the front of the chest: the torso reaches 17-19 cm in front of the spine
 * bones and 6-12 cm behind them. The scoreboard needs to know whether a staff
 * passes through what the viewer sees, so this skins the rig's own triangles
 * every frame and measures each staff's centre line against them.
 *
 * Triangles are grouped by the bone that dominates their first vertex. Each
 * frame the posed vertices give every group a bounding box, and a staff is
 * measured exactly only against the triangles of groups its box reaches. The
 * hands are left out: they hold the staffs.
 *
 * `auditPosedMeshAgainstStaff` (`diagnostics/contact-correct`) answers the
 * same question for one frame; it allocates per triangle and tests every
 * triangle, which is too slow for the 6,480 frames of each scoreboard rig.
 */

import { Matrix4, type Object3D, type SkinnedMesh } from "three";

export const BODY_ZONES = [
  "head",
  "torso",
  "leg",
  "leftUpperArm",
  "leftForearm",
  "rightUpperArm",
  "rightForearm",
] as const;
export type BodyZone = (typeof BODY_ZONES)[number];

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Closest distance from a staff's centre line to each zone, metres; only
 *  zones within the query's reach are present. */
export type ZoneDistances = Partial<Record<BodyZone, number>>;

/** Which zone a bone's skin belongs to; null for the hands. Mixamo names:
 *  the clavicles (`*Shoulder`) belong to the torso. */
function zoneOfBone(name: string): BodyZone | null {
  if (/Hand|Thumb|Index|Middle|Ring|Pinky/.test(name)) return null;
  const side = /Left/.test(name) ? "left" : "right";
  if (/ForeArm/.test(name)) return `${side}Forearm`;
  if (/Arm/.test(name)) return `${side}UpperArm`;
  if (/Leg|Foot|Toe/.test(name)) return "leg";
  if (/Head|Eye|Neck/.test(name)) return "head";
  return "torso";
}

/** A triangle whose corners fall in different zones takes the most common
 *  one, ties to the earlier zone in this order. */
const ZONE_PRIORITY: readonly BodyZone[] = [
  "head",
  "torso",
  "leg",
  "leftUpperArm",
  "rightUpperArm",
  "leftForearm",
  "rightForearm",
];

function isRendered(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Exact distances (Ericson, Real-Time Collision Detection, 5.1.5 and 5.1.9)
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Squared distance between segments p1q1 and p2q2. */
function segmentSegmentDistanceSq(
  p1x: number,
  p1y: number,
  p1z: number,
  q1x: number,
  q1y: number,
  q1z: number,
  p2x: number,
  p2y: number,
  p2z: number,
  q2x: number,
  q2y: number,
  q2z: number
): number {
  const d1x = q1x - p1x;
  const d1y = q1y - p1y;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2y = q2y - p2y;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const ry = p1y - p2y;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z;
  const e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s: number;
  let t: number;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z;
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const dx = p1x + d1x * s - (p2x + d2x * t);
  const dy = p1y + d1y * s - (p2y + d2y * t);
  const dz = p1z + d1z * s - (p2z + d2z * t);
  return dx * dx + dy * dy + dz * dz;
}

/** Squared distance from point p to triangle abc. */
function pointTriangleDistanceSq(
  px: number,
  py: number,
  pz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): number {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const acx = cx - ax;
  const acy = cy - ay;
  const acz = cz - az;
  const apx = px - ax;
  const apy = py - ay;
  const apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx: number;
  let qy: number;
  let qz: number;
  if (d1 <= 0 && d2 <= 0) {
    qx = ax;
    qy = ay;
    qz = az;
  } else {
    const bpx = px - bx;
    const bpy = py - by;
    const bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    const vc = d1 * d4 - d3 * d2;
    if (d3 >= 0 && d4 <= d3) {
      qx = bx;
      qy = by;
      qz = bz;
    } else if (vc <= 0 && d1 >= 0 && d3 <= 0) {
      const v = d1 / (d1 - d3);
      qx = ax + abx * v;
      qy = ay + aby * v;
      qz = az + abz * v;
    } else {
      const cpx = px - cx;
      const cpy = py - cy;
      const cpz = pz - cz;
      const d5 = abx * cpx + aby * cpy + abz * cpz;
      const d6 = acx * cpx + acy * cpy + acz * cpz;
      const vb = d5 * d2 - d1 * d6;
      if (d6 >= 0 && d5 <= d6) {
        qx = cx;
        qy = cy;
        qz = cz;
      } else if (vb <= 0 && d2 >= 0 && d6 <= 0) {
        const w = d2 / (d2 - d6);
        qx = ax + acx * w;
        qy = ay + acy * w;
        qz = az + acz * w;
      } else {
        const va = d3 * d6 - d5 * d4;
        if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
          const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
          qx = bx + (cx - bx) * w;
          qy = by + (cy - by) * w;
          qz = bz + (cz - bz) * w;
        } else {
          const denom = 1 / (va + vb + vc);
          const v = vb * denom;
          const w = vc * denom;
          qx = ax + abx * v + acx * w;
          qy = ay + aby * v + acy * w;
          qz = az + abz * v + acz * w;
        }
      }
    }
  }
  const dx = px - qx;
  const dy = py - qy;
  const dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

/** True when segment pq crosses triangle abc (Moller-Trumbore). */
function segmentCrossesTriangle(
  px: number,
  py: number,
  pz: number,
  qx: number,
  qy: number,
  qz: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number
): boolean {
  const dx = qx - px;
  const dy = qy - py;
  const dz = qz - pz;
  const e1x = bx - ax;
  const e1y = by - ay;
  const e1z = bz - az;
  const e2x = cx - ax;
  const e2y = cy - ay;
  const e2z = cz - az;
  const hx = dy * e2z - dz * e2y;
  const hy = dz * e2x - dx * e2z;
  const hz = dx * e2y - dy * e2x;
  const det = e1x * hx + e1y * hy + e1z * hz;
  if (Math.abs(det) < 1e-14) return false;
  const inv = 1 / det;
  const sx = px - ax;
  const sy = py - ay;
  const sz = pz - az;
  const u = inv * (sx * hx + sy * hy + sz * hz);
  if (u < 0 || u > 1) return false;
  const rx = sy * e1z - sz * e1y;
  const ry = sz * e1x - sx * e1z;
  const rz = sx * e1y - sy * e1x;
  const v = inv * (dx * rx + dy * ry + dz * rz);
  if (v < 0 || u + v > 1) return false;
  const t = inv * (e2x * rx + e2y * ry + e2z * rz);
  return t >= 0 && t <= 1;
}

// ---------------------------------------------------------------------------
// The mesh
// ---------------------------------------------------------------------------

interface MeshBones {
  mesh: SkinnedMesh;
  /** Offset of this mesh's bones in the skin-matrix table. */
  boneOffset: number;
}

export interface BodyMesh {
  /** Poses the mesh from the rig's current bone matrices. Call after
   *  `updateMatrixWorld`. */
  pose(): void;
  /** Keeps the current pose as the square body `distances(..., "square")`
   *  measures against. */
  keepAsSquare(): void;
  /**
   * Closest distance from the staff's centre line a-b to every zone within
   * `reachM` of it, on the current pose or the kept square one.
   */
  distances(
    a: Point3,
    b: Point3,
    reachM: number,
    body?: "current" | "square",
    zones?: readonly BodyZone[]
  ): ZoneDistances;
  readonly triangleCount: number;
}

/** Skins every visible mesh under `root` except the hands. */
export function createBodyMesh(root: Object3D): BodyMesh {
  const meshes: MeshBones[] = [];
  let boneCount = 0;
  root.traverse((object) => {
    const mesh = object as SkinnedMesh;
    if (!mesh.isSkinnedMesh || !isRendered(mesh)) return;
    meshes.push({ mesh, boneOffset: boneCount });
    boneCount += mesh.skeleton.bones.length;
  });

  // Vertices used by body triangles, in one table across meshes.
  const slotOf = meshes.map(() => new Map<number, number>());
  const bindXYZ: number[] = [];
  const skinBone: number[] = [];
  const skinWeight: number[] = [];
  const triangles: number[] = [];
  const triangleZone: number[] = [];
  const triangleGroup: number[] = [];
  const groupKey = new Map<number, number>();

  const bindMatrixScratch = new Matrix4();
  meshes.forEach(({ mesh, boneOffset }, meshIndex) => {
    const geometry = mesh.geometry;
    const position = geometry.getAttribute("position");
    const index = geometry.getIndex();
    const skinIndex = geometry.getAttribute("skinIndex");
    const weights = geometry.getAttribute("skinWeight");
    const bones = mesh.skeleton.bones;
    const dominant = (vertex: number) => {
      let best = 0;
      let bestWeight = -1;
      for (let k = 0; k < 4; k++) {
        const w = weights.getComponent(vertex, k);
        if (w > bestWeight) {
          bestWeight = w;
          best = skinIndex.getComponent(vertex, k);
        }
      }
      return best;
    };
    const slot = (vertex: number) => {
      const known = slotOf[meshIndex]!.get(vertex);
      if (known !== undefined) return known;
      const id = bindXYZ.length / 3;
      bindMatrixScratch.copy(mesh.bindMatrix);
      const e = bindMatrixScratch.elements;
      const x = position.getX(vertex);
      const y = position.getY(vertex);
      const z = position.getZ(vertex);
      bindXYZ.push(
        e[0]! * x + e[4]! * y + e[8]! * z + e[12]!,
        e[1]! * x + e[5]! * y + e[9]! * z + e[13]!,
        e[2]! * x + e[6]! * y + e[10]! * z + e[14]!
      );
      for (let k = 0; k < 4; k++) {
        skinBone.push(boneOffset + skinIndex.getComponent(vertex, k));
        skinWeight.push(weights.getComponent(vertex, k));
      }
      slotOf[meshIndex]!.set(vertex, id);
      return id;
    };
    const count = (index ? index.count : position.count) / 3;
    for (let t = 0; t < count; t++) {
      const corners = [0, 1, 2].map((k) =>
        index ? index.getX(t * 3 + k) : t * 3 + k
      );
      const cornerBones = corners.map(dominant);
      const zones = cornerBones.map((bone) =>
        zoneOfBone(bones[bone]?.name ?? "")
      );
      if (zones.includes(null)) continue;
      let zone = ZONE_PRIORITY[0]!;
      let best = -1;
      for (const candidate of ZONE_PRIORITY) {
        const n = zones.filter((z) => z === candidate).length;
        if (n > best) {
          best = n;
          zone = candidate;
        }
      }
      const key = boneOffset + cornerBones[0]!;
      let group = groupKey.get(key);
      if (group === undefined) {
        group = groupKey.size;
        groupKey.set(key, group);
      }
      for (const corner of corners) triangles.push(slot(corner));
      triangleZone.push(BODY_ZONES.indexOf(zone));
      triangleGroup.push(group);
    }
  });

  const vertexCount = bindXYZ.length / 3;
  const triangleCount = triangleZone.length;
  const groupCount = groupKey.size;
  const bind = Float64Array.from(bindXYZ);
  const bonesOf = Int32Array.from(skinBone);
  const weightsOf = Float64Array.from(skinWeight);
  const tri = Int32Array.from(triangles);
  const zoneOf = Uint8Array.from(triangleZone);
  // Triangles and vertices of each group, for the per-frame boxes.
  const groupTriangles: number[][] = Array.from(
    { length: groupCount },
    () => []
  );
  const groupVertexSets: Set<number>[] = Array.from(
    { length: groupCount },
    () => new Set()
  );
  for (let t = 0; t < triangleCount; t++) {
    const group = triangleGroup[t]!;
    groupTriangles[group]!.push(t);
    for (let k = 0; k < 3; k++) groupVertexSets[group]!.add(tri[t * 3 + k]!);
  }
  const groupTri = groupTriangles.map((list) => Int32Array.from(list));
  const groupVerts = groupVertexSets.map((set) => Int32Array.from(set));

  const skin = new Float64Array(boneCount * 12);
  const current = new Float64Array(vertexCount * 3);
  const currentBoxes = new Float64Array(groupCount * 6);
  const square = new Float64Array(vertexCount * 3);
  const squareBoxes = new Float64Array(groupCount * 6);
  const finalMatrix = new Matrix4();
  const boneMatrix = new Matrix4();

  function boxes(posed: Float64Array, out: Float64Array) {
    for (let g = 0; g < groupCount; g++) {
      let minX = Infinity;
      let minY = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let maxZ = -Infinity;
      const verts = groupVerts[g]!;
      for (let i = 0; i < verts.length; i++) {
        const v = verts[i]! * 3;
        const x = posed[v]!;
        const y = posed[v + 1]!;
        const z = posed[v + 2]!;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      out.set([minX, minY, minZ, maxX, maxY, maxZ], g * 6);
    }
  }

  function pose() {
    for (const { mesh, boneOffset } of meshes) {
      // world = matrixWorld * bindMatrixInverse * sum(w * bone * inverse)
      // * bindMatrix * position, with bindMatrix applied up front.
      finalMatrix.multiplyMatrices(mesh.matrixWorld, mesh.bindMatrixInverse);
      const bones = mesh.skeleton.bones;
      const inverses = mesh.skeleton.boneInverses;
      for (let i = 0; i < bones.length; i++) {
        boneMatrix
          .multiplyMatrices(bones[i]!.matrixWorld, inverses[i]!)
          .premultiply(finalMatrix);
        const e = boneMatrix.elements;
        const o = (boneOffset + i) * 12;
        skin[o] = e[0]!;
        skin[o + 1] = e[4]!;
        skin[o + 2] = e[8]!;
        skin[o + 3] = e[12]!;
        skin[o + 4] = e[1]!;
        skin[o + 5] = e[5]!;
        skin[o + 6] = e[9]!;
        skin[o + 7] = e[13]!;
        skin[o + 8] = e[2]!;
        skin[o + 9] = e[6]!;
        skin[o + 10] = e[10]!;
        skin[o + 11] = e[14]!;
      }
    }
    for (let v = 0; v < vertexCount; v++) {
      const x = bind[v * 3]!;
      const y = bind[v * 3 + 1]!;
      const z = bind[v * 3 + 2]!;
      let ox = 0;
      let oy = 0;
      let oz = 0;
      for (let k = 0; k < 4; k++) {
        const w = weightsOf[v * 4 + k]!;
        if (w === 0) continue;
        const m = bonesOf[v * 4 + k]! * 12;
        ox +=
          w *
          (skin[m]! * x + skin[m + 1]! * y + skin[m + 2]! * z + skin[m + 3]!);
        oy +=
          w *
          (skin[m + 4]! * x +
            skin[m + 5]! * y +
            skin[m + 6]! * z +
            skin[m + 7]!);
        oz +=
          w *
          (skin[m + 8]! * x +
            skin[m + 9]! * y +
            skin[m + 10]! * z +
            skin[m + 11]!);
      }
      current[v * 3] = ox;
      current[v * 3 + 1] = oy;
      current[v * 3 + 2] = oz;
    }
    boxes(current, currentBoxes);
  }

  function distances(
    a: Point3,
    b: Point3,
    reachM: number,
    body: "current" | "square" = "current",
    zones: readonly BodyZone[] = BODY_ZONES
  ): ZoneDistances {
    const posed = body === "square" ? square : current;
    const groupBoxes = body === "square" ? squareBoxes : currentBoxes;
    let wanted = 0;
    for (const zone of zones) wanted |= 1 << BODY_ZONES.indexOf(zone);
    const minX = Math.min(a.x, b.x) - reachM;
    const minY = Math.min(a.y, b.y) - reachM;
    const minZ = Math.min(a.z, b.z) - reachM;
    const maxX = Math.max(a.x, b.x) + reachM;
    const maxY = Math.max(a.y, b.y) + reachM;
    const maxZ = Math.max(a.z, b.z) + reachM;
    const reachSq = reachM * reachM;
    const best = new Float64Array(BODY_ZONES.length).fill(Infinity);
    for (let g = 0; g < groupCount; g++) {
      const o = g * 6;
      if (
        groupBoxes[o]! > maxX ||
        groupBoxes[o + 3]! < minX ||
        groupBoxes[o + 1]! > maxY ||
        groupBoxes[o + 4]! < minY ||
        groupBoxes[o + 2]! > maxZ ||
        groupBoxes[o + 5]! < minZ
      )
        continue;
      const list = groupTri[g]!;
      for (let i = 0; i < list.length; i++) {
        const t = list[i]!;
        const zone = zoneOf[t]!;
        if (!(wanted & (1 << zone))) continue;
        const i0 = tri[t * 3]! * 3;
        const i1 = tri[t * 3 + 1]! * 3;
        const i2 = tri[t * 3 + 2]! * 3;
        const ax = posed[i0]!;
        const ay = posed[i0 + 1]!;
        const az = posed[i0 + 2]!;
        const bx = posed[i1]!;
        const by = posed[i1 + 1]!;
        const bz = posed[i1 + 2]!;
        const cx = posed[i2]!;
        const cy = posed[i2 + 1]!;
        const cz = posed[i2 + 2]!;
        if (
          Math.min(ax, bx, cx) > maxX ||
          Math.max(ax, bx, cx) < minX ||
          Math.min(ay, by, cy) > maxY ||
          Math.max(ay, by, cy) < minY ||
          Math.min(az, bz, cz) > maxZ ||
          Math.max(az, bz, cz) < minZ
        )
          continue;
        let dSq: number;
        if (
          segmentCrossesTriangle(
            a.x,
            a.y,
            a.z,
            b.x,
            b.y,
            b.z,
            ax,
            ay,
            az,
            bx,
            by,
            bz,
            cx,
            cy,
            cz
          )
        ) {
          dSq = 0;
        } else {
          dSq = Math.min(
            pointTriangleDistanceSq(
              a.x,
              a.y,
              a.z,
              ax,
              ay,
              az,
              bx,
              by,
              bz,
              cx,
              cy,
              cz
            ),
            pointTriangleDistanceSq(
              b.x,
              b.y,
              b.z,
              ax,
              ay,
              az,
              bx,
              by,
              bz,
              cx,
              cy,
              cz
            ),
            segmentSegmentDistanceSq(
              a.x,
              a.y,
              a.z,
              b.x,
              b.y,
              b.z,
              ax,
              ay,
              az,
              bx,
              by,
              bz
            ),
            segmentSegmentDistanceSq(
              a.x,
              a.y,
              a.z,
              b.x,
              b.y,
              b.z,
              bx,
              by,
              bz,
              cx,
              cy,
              cz
            ),
            segmentSegmentDistanceSq(
              a.x,
              a.y,
              a.z,
              b.x,
              b.y,
              b.z,
              cx,
              cy,
              cz,
              ax,
              ay,
              az
            )
          );
        }
        if (dSq > reachSq) continue;
        const d = Math.sqrt(dSq);
        if (d < best[zone]!) best[zone] = d;
      }
    }
    const out: ZoneDistances = {};
    BODY_ZONES.forEach((zone, i) => {
      if (best[i]! <= reachM) out[zone] = best[i]!;
    });
    return out;
  }

  return {
    pose,
    keepAsSquare() {
      square.set(current);
      squareBoxes.set(currentBoxes);
    },
    distances,
    triangleCount,
  };
}
