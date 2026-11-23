/**
 * Small geometry tools for the surroundings, all pure three.js: a face builder
 * that winds every polygon to face the way it is told to, offsets of outlines
 * and polylines with mitred corners, and a few world-space helpers. Walls,
 * roofs, fences and cars are built from these so the lighting never depends on
 * which way a triangle happened to be wound.
 */

import { BufferGeometry, Float32BufferAttribute, ShapeUtils, Vector2 } from "three";
import type { Pt } from "./site-walk-plan";

export type V3 = readonly [number, number, number];
export type UV = readonly [number, number];

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * Collects flat-shaded convex polygons into one geometry (position, normal,
 * uv, and a vertex colour when a tint is given). Every face is wound to face
 * the `outward` direction it is given, so a roof, a wall or a soffit lights
 * correctly under three's double-sided shading.
 */
export class MeshBuilder {
  private readonly position: number[] = [];
  private readonly normal: number[] = [];
  private readonly uv: number[] = [];
  private readonly colour: number[] = [];
  private readonly tint: readonly [number, number, number] | null;

  constructor(tint: readonly [number, number, number] | null = null) {
    this.tint = tint;
  }

  get empty(): boolean {
    return this.position.length === 0;
  }

  /** A convex planar polygon (3 or more points), facing `outward`. */
  face(points: readonly V3[], outward: V3, uvs?: readonly UV[]): this {
    if (points.length < 3) return this;
    // Newell's method gives the polygon's own normal whatever its winding.
    let nx = 0;
    let ny = 0;
    let nz = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!;
      const b = points[(i + 1) % points.length]!;
      nx += (a[1] - b[1]) * (a[2] + b[2]);
      ny += (a[2] - b[2]) * (a[0] + b[0]);
      nz += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-12) return this;
    let n: V3 = [nx / length, ny / length, nz / length];
    let order = points.map((_, i) => i);
    if (dot(n, outward) < 0) {
      order = order.reverse();
      n = [-n[0], -n[1], -n[2]];
    }
    for (let k = 1; k + 1 < order.length; k++) {
      for (const index of [order[0]!, order[k]!, order[k + 1]!]) {
        const p = points[index]!;
        this.position.push(p[0], p[1], p[2]);
        this.normal.push(n[0], n[1], n[2]);
        const t = uvs?.[index];
        this.uv.push(t ? t[0] : 0, t ? t[1] : 0);
        if (this.tint) this.colour.push(this.tint[0], this.tint[1], this.tint[2]);
      }
    }
    return this;
  }

  /** An axis-aligned box. */
  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): this {
    const c = [
      [x0, y0, z0],
      [x1, y0, z0],
      [x1, y1, z0],
      [x0, y1, z0],
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ] as const satisfies readonly V3[];
    this.face([c[0], c[1], c[2], c[3]], [0, 0, -1]);
    this.face([c[4], c[5], c[6], c[7]], [0, 0, 1]);
    this.face([c[0], c[3], c[7], c[4]], [-1, 0, 0]);
    this.face([c[1], c[2], c[6], c[5]], [1, 0, 0]);
    this.face([c[0], c[1], c[5], c[4]], [0, -1, 0]);
    this.face([c[3], c[2], c[6], c[7]], [0, 1, 0]);
    return this;
  }

  /**
   * A box standing on the plan: centred at (cx, cz), `hl` half-length along the
   * unit direction (ux, uz), `ht` half-thickness across it, from y0 to y1.
   */
  obox(cx: number, cz: number, ux: number, uz: number, hl: number, ht: number, y0: number, y1: number): this {
    const vx = -uz;
    const vz = ux;
    const at = (a: number, b: number, y: number): V3 => [cx + ux * hl * a + vx * ht * b, y, cz + uz * hl * a + vz * ht * b];
    const ring = (y: number) => [at(-1, -1, y), at(1, -1, y), at(1, 1, y), at(-1, 1, y)];
    const lo = ring(y0);
    const hi = ring(y1);
    this.face(lo, [0, -1, 0]);
    this.face(hi, [0, 1, 0]);
    const hints: V3[] = [
      [-vx, 0, -vz],
      [ux, 0, uz],
      [vx, 0, vz],
      [-ux, 0, -uz],
    ];
    for (let i = 0; i < 4; i++) this.face([lo[i]!, lo[(i + 1) % 4]!, hi[(i + 1) % 4]!, hi[i]!], hints[i]!);
    return this;
  }

  /**
   * An arbitrary simple outline laid flat at height `y`, facing up or down.
   * With `tile`, UVs run in world metres over that size so a texture tiles true.
   */
  cap(ring: readonly Pt[], y: number, up: boolean, tile?: number): this {
    if (ring.length < 3) return this;
    const triangles = ShapeUtils.triangulateShape(
      ring.map((p) => new Vector2(p.x, p.z)),
      [],
    );
    const dir: V3 = [0, up ? 1 : -1, 0];
    for (const tri of triangles) {
      const pts = tri.map((index) => ring[index]!);
      this.face(
        pts.map((p) => [p.x, y, p.z] as const),
        dir,
        tile ? pts.map((p) => [p.x / tile, p.z / tile] as const) : undefined,
      );
    }
    return this;
  }

  build(): BufferGeometry | null {
    if (this.empty) return null;
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.position, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.normal, 3));
    g.setAttribute("uv", new Float32BufferAttribute(this.uv, 2));
    if (this.tint) g.setAttribute("color", new Float32BufferAttribute(this.colour, 3));
    return g;
  }
}

/** A quad lying along `a` to `b` in a vertical plane: from height y0 to y1, `out` metres off the line toward `normal`. */
export function upright(a: Pt, b: Pt, y0: number, y1: number, normal: Pt, out = 0): V3[] {
  const ox = normal.x * out;
  const oz = normal.z * out;
  return [
    [a.x + ox, y0, a.z + oz],
    [b.x + ox, y0, b.z + oz],
    [b.x + ox, y1, b.z + oz],
    [a.x + ox, y1, a.z + oz],
  ];
}

// ------------------------------------------------------------------ outlines

/** Twice the signed area: positive when the ring runs from +x toward +z (clockwise on the plan). */
export function ringArea(ring: readonly Pt[]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += ring[j]!.x * ring[i]!.z - ring[i]!.x * ring[j]!.z;
  return area;
}

/** The unit normal of the edge a to b pointing out of a ring of the given orientation (+1 or -1 area sign). */
export function edgeOutward(a: Pt, b: Pt, areaSign: number): Pt {
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const dx = (b.x - a.x) / length;
  const dz = (b.z - a.z) / length;
  // For a ring running +x toward +z (positive area), the outside is to the left of travel: (dz, -dx).
  return areaSign >= 0 ? { x: dz, z: -dx } : { x: -dz, z: dx };
}

const MITRE_LIMIT = 3;

/** A corner pushed out along both of its edges' normals, so the offset edges meet. */
function mitre(prev: Pt, here: Pt, next: Pt, side: (a: Pt, b: Pt) => Pt, dist: number): Pt {
  const n1 = side(prev, here);
  const n2 = side(here, next);
  const k = 1 + n1.x * n2.x + n1.z * n2.z;
  const scale = Math.min(MITRE_LIMIT, 1 / Math.max(k, 1e-6)) * dist;
  return {
    x: here.x + (n1.x + n2.x) * scale,
    z: here.z + (n1.z + n2.z) * scale,
  };
}

/** A closed outline grown outward by `dist` (shrunk when negative), corners mitred. */
export function offsetRing(ring: readonly Pt[], dist: number): Pt[] {
  if (ring.length < 3 || dist === 0) return [...ring];
  const sign = Math.sign(ringArea(ring)) || 1;
  const side = (a: Pt, b: Pt) => edgeOutward(a, b, sign);
  return ring.map((p, i) => mitre(ring[(i + ring.length - 1) % ring.length]!, p, ring[(i + 1) % ring.length]!, side, dist));
}

/** The left of travel (as seen on the plan) for a heading a to b. */
export function leftOf(a: Pt, b: Pt): Pt {
  const length = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.z - a.z) / length, z: -(b.x - a.x) / length };
}

/** An open line moved `dist` to its left (right when negative), corners mitred, ends squared. */
export function offsetLine(line: readonly Pt[], dist: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < line.length; i++) {
    const p = line[i]!;
    const prev = line[i - 1];
    const next = line[i + 1];
    if (prev && next) out.push(mitre(prev, p, next, leftOf, dist));
    else {
      const n = prev ? leftOf(prev, p) : leftOf(p, next!);
      out.push({ x: p.x + n.x * dist, z: p.z + n.z * dist });
    }
  }
  return out;
}

/** Length of a polyline. */
export function lineLength(line: readonly Pt[]): number {
  let total = 0;
  for (let i = 0; i + 1 < line.length; i++) total += Math.hypot(line[i + 1]!.x - line[i]!.x, line[i + 1]!.z - line[i]!.z);
  return total;
}

/** A strip between two same-length edges, with UVs in world metres (along / across over `tile`). */
export function stripBetween(left: readonly Pt[], right: readonly Pt[], y: number, tile: number, builder: MeshBuilder): void {
  let along = 0;
  for (let i = 0; i + 1 < left.length; i++) {
    const length = Math.hypot(left[i + 1]!.x - left[i]!.x, left[i + 1]!.z - left[i]!.z);
    const width = Math.hypot(left[i]!.x - right[i]!.x, left[i]!.z - right[i]!.z);
    const u0 = along / tile;
    const u1 = (along + length) / tile;
    builder.face(
      [
        [left[i]!.x, y, left[i]!.z],
        [left[i + 1]!.x, y, left[i + 1]!.z],
        [right[i + 1]!.x, y, right[i + 1]!.z],
        [right[i]!.x, y, right[i]!.z],
      ],
      [0, 1, 0],
      [
        [u0, 0],
        [u1, 0],
        [u1, width / tile],
        [u0, width / tile],
      ],
    );
    along += length;
  }
}
