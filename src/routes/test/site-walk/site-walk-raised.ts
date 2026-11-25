/**
 * Raised areas as solid blocks: a flat top at the area's height and upright
 * faces down to the ground all round, so a platform reads as one block of
 * stone and each stair tread as its own step. The same triangles are what the
 * walker stands on and bumps into (`raisedCollider`), so what you see is what
 * stops you.
 *
 * The lawn's own heights, when the surroundings carry a grid of them, come
 * here too: the risen lawn as a mesh and a collider, and `drape`, which lays
 * the flat things on the ground (the lot, the guest area, the stage) over it.
 */

import { BufferGeometry, Float32BufferAttribute } from "three";
import { MeshBuilder, edgeOutward, ringArea } from "./site-walk-around-geometry";
import type { SiteFloor } from "./site-walk-floor";
import type { Pt } from "./site-walk-plan";

/** How far the faces reach below the ground, so no gap shows where the ground dips. */
const SINK = 0.03;

/** The blocks' faces, every one facing out of its block; UVs in metres over `tile`. */
export function raisedGeometry(floor: SiteFloor, tile: number): BufferGeometry | null {
  const b = new MeshBuilder();
  for (const area of floor.raised) {
    const ring = area.points;
    if (ring.length < 3) continue;
    const top = area.height;
    b.cap(ring, top, true, tile);
    const sign = Math.sign(ringArea(ring)) || 1;
    let run = 0;
    ring.forEach((p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      const length = Math.hypot(q.x - p.x, q.z - p.z);
      if (length < 1e-6) return;
      const n = edgeOutward(p, q, sign);
      const below = (pt: typeof p) => Math.min(top, floor.groundAt(pt)) - SINK;
      const y0 = below(p);
      const y1 = below(q);
      b.face(
        [
          [p.x, y0, p.z],
          [q.x, y1, q.z],
          [q.x, top, q.z],
          [p.x, top, p.z],
        ],
        [n.x, 0, n.z],
        [
          [run / tile, y0 / tile],
          [(run + length) / tile, y1 / tile],
          [(run + length) / tile, top / tile],
          [run / tile, top / tile],
        ],
      );
      run += length;
    });
  }
  return b.build();
}

/** Lifts every point of a geometry by the height `at` gives under it, in place. */
export function liftOnto(g: BufferGeometry, at: (p: Pt) => number): BufferGeometry {
  const position = g.getAttribute("position");
  for (let i = 0; i < position.count; i++) {
    const by = at({ x: position.getX(i), z: position.getZ(i) });
    if (by !== 0) position.setY(i, position.getY(i) + by);
  }
  position.needsUpdate = true;
  return g;
}

/** The blocks as one triangle soup for the physics world, or null with none. */
export function raisedCollider(floor: SiteFloor): { vertices: Float32Array; indices: Uint32Array } | null {
  const g = raisedGeometry(floor, 1);
  if (!g) return null;
  const position = g.getAttribute("position");
  const vertices = new Float32Array(position.array as ArrayLike<number>);
  const indices = new Uint32Array(position.count);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  g.dispose();
  return { vertices, indices };
}

// ------------------------------------------------------------------ the lawn's heights

/** The grid's cells that rise off the flat ground, each as the four corner heights; empty with no grid. */
function risenCells(floor: SiteFloor): { x0: number; z0: number; s: number; h: [number, number, number, number] }[] {
  const grid = floor.grid;
  if (!grid) return [];
  const cells = [];
  const s = grid.spacing;
  for (let r = 0; r + 1 < grid.rows.length; r++) {
    for (let c = 0; c + 1 < grid.rows[0]!.length; c++) {
      const h: [number, number, number, number] = [grid.rows[r]![c]!, grid.rows[r]![c + 1]!, grid.rows[r + 1]![c + 1]!, grid.rows[r + 1]![c]!];
      if (Math.max(...h) <= RISE_MIN) continue;
      cells.push({ x0: grid.origin.x + c * s, z0: grid.origin.z + r * s, s, h });
    }
  }
  return cells;
}

/** Below this the grid counts as the flat ground, which the big ground plane and box already are (m). */
const RISE_MIN = 0.002;

/**
 * The lawn where it rises off the flat ground: the grid's cells at their own
 * heights, `y` above them, facing up, UVs in metres over `tile`. Null with no
 * grid or a flat one. It lies over the flat ground plane, which still runs out
 * to the horizon everywhere else.
 */
export function groundPatch(floor: SiteFloor, y: number, tile: number): BufferGeometry | null {
  const cells = risenCells(floor);
  if (!cells.length) return null;
  const b = new MeshBuilder();
  for (const { x0, z0, s, h } of cells) {
    const corners = [
      [x0, h[0] + y, z0],
      [x0 + s, h[1] + y, z0],
      [x0 + s, h[2] + y, z0 + s],
      [x0, h[3] + y, z0 + s],
    ] as [number, number, number][];
    b.face(corners, [0, 1, 0], corners.map(([x, , z]) => [x / tile, z / tile] as [number, number]));
  }
  return b.build();
}

/** The risen lawn as one triangle soup for the physics world, or null with no grid or a flat one. */
export function groundCollider(floor: SiteFloor): { vertices: Float32Array; indices: Uint32Array } | null {
  const g = groundPatch(floor, 0, 1);
  if (!g) return null;
  const position = g.getAttribute("position");
  const vertices = new Float32Array(position.array as ArrayLike<number>);
  const indices = new Uint32Array(position.count);
  for (let i = 0; i < indices.length; i++) indices[i] = i;
  g.dispose();
  return { vertices, indices };
}

/**
 * Lays a geometry over the lawn: every triangle wider than `step` across the
 * ground is split until none is, inside `bounds` only, then each point is lifted
 * by the height `at` gives under it. Returns a new, unindexed geometry with the
 * same attributes; the one passed in is disposed.
 */
export function drape(g: BufferGeometry, at: (p: Pt) => number, step: number, bounds: { minX: number; maxX: number; minZ: number; maxZ: number }): BufferGeometry {
  const source = g.index ? g.toNonIndexed() : g;
  const names = Object.keys(source.attributes);
  const sizes = names.map((n) => source.getAttribute(n).itemSize);
  const input = names.map((n) => source.getAttribute(n).array as ArrayLike<number>);
  const count = source.getAttribute("position").count;
  const out: number[][] = names.map(() => []);
  const position = names.indexOf("position");
  // A vertex is every attribute's values side by side.
  const vertex = (i: number) => names.map((_, a) => Array.from({ length: sizes[a]! }, (_, k) => input[a]![i * sizes[a]! + k]!));
  const mid = (p: number[][], q: number[][]) => p.map((values, a) => values.map((v, k) => (v + q[a]![k]!) / 2));
  const wide = (p: number[][], q: number[][]) => Math.hypot(p[position]![0]! - q[position]![0]!, p[position]![2]! - q[position]![2]!) > step;
  const overlaps = (t: number[][][]) => {
    const xs = t.map((v) => v[position]![0]!);
    const zs = t.map((v) => v[position]![2]!);
    return Math.max(...xs) >= bounds.minX && Math.min(...xs) <= bounds.maxX && Math.max(...zs) >= bounds.minZ && Math.min(...zs) <= bounds.maxZ;
  };
  const emit = (t: number[][][]) => {
    for (const v of t) v.forEach((values, a) => out[a]!.push(...values));
  };
  const split = (t: number[][][], depth: number) => {
    const [p, q, r] = t as [number[][], number[][], number[][]];
    if (depth >= 12 || !overlaps(t) || !(wide(p, q) || wide(q, r) || wide(r, p))) return emit(t);
    const pq = mid(p, q);
    const qr = mid(q, r);
    const rp = mid(r, p);
    split([p, pq, rp], depth + 1);
    split([pq, q, qr], depth + 1);
    split([rp, qr, r], depth + 1);
    split([pq, qr, rp], depth + 1);
  };
  for (let i = 0; i + 2 < count; i += 3) split([vertex(i), vertex(i + 1), vertex(i + 2)], 0);
  const result = new BufferGeometry();
  names.forEach((n, a) => result.setAttribute(n, new Float32BufferAttribute(out[a]!, sizes[a]!)));
  if (source !== g) source.dispose();
  g.dispose();
  return liftOnto(result, at);
}

/** Where the grid rises off the flat ground, metres; null with no grid or a flat one. */
export function risenBounds(floor: SiteFloor): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  const cells = risenCells(floor);
  if (!cells.length) return null;
  return {
    minX: Math.min(...cells.map((c) => c.x0)),
    maxX: Math.max(...cells.map((c) => c.x0 + c.s)),
    minZ: Math.min(...cells.map((c) => c.z0)),
    maxZ: Math.max(...cells.map((c) => c.z0 + c.s)),
  };
}
