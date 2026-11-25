/**
 * The small shape builders the site's meshes share: flat polygons, boxes and
 * bars laid along a line, upright sheets, posts, and the pole and wire builders.
 * All are plain three.js geometry in world metres, x and z from the plan.
 */

import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Quaternion,
  ShapeUtils,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";
import type { Pt } from "./site-walk-plan";

/** Heights of the flat layers above the ground, metres. A few centimetres apart so none fights another. */
export const LAYER = {
  ground: -0.01,
  lot: 0.01,
  street: 0.01,
  area: 0.03,
  stage: 0.04,
  edge: 0.06,
} as const;

/** A flat polygon at a height, facing up, triangulated. With `tile`, UVs run in world metres over that size so a texture tiles true. */
export function flat(points: readonly Pt[], y: number, tile?: number): BufferGeometry | null {
  if (points.length < 3) return null;
  const triangles = ShapeUtils.triangulateShape(
    points.map((p) => new Vector2(p.x, p.z)),
    [],
  );
  if (!triangles.length) return null;
  const position = new Float32Array(points.length * 3);
  const normal = new Float32Array(points.length * 3);
  points.forEach((p, i) => {
    position.set([p.x, y, p.z], i * 3);
    normal.set([0, 1, 0], i * 3);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(position, 3));
  g.setAttribute("normal", new Float32BufferAttribute(normal, 3));
  const uv = new Float32Array(points.length * 2);
  if (tile) points.forEach((p, i) => uv.set([p.x / tile, p.z / tile], i * 2));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  // x and z read as a page have their up side facing the ground, so each triangle is turned over
  // to face the sky. A double-sided material lights the far side of one that faces away, which
  // had the sun under the lawn.
  const up = triangles.flatMap(([a, b, c]) => {
    const p = points[a!]!;
    const q = points[b!]!;
    const r = points[c!]!;
    return (q.z - p.z) * (r.x - p.x) - (q.x - p.x) * (r.z - p.z) >= 0 ? [a!, b!, c!] : [a!, c!, b!];
  });
  g.setIndex(up);
  return g;
}

/** A box laid along a to b, from height y0 to y1, `thick` metres across. */
export function run(a: Pt, b: Pt, y0: number, y1: number, thick: number): BufferGeometry | null {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return null;
  const g = new BoxGeometry(length, y1 - y0, thick);
  g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
  g.translate((a.x + b.x) / 2, (y0 + y1) / 2, (a.z + b.z) / 2);
  return g;
}

/** A thin round bar laid along a to b at a height. */
export function tube(a: Pt, b: Pt, y: number, radius: number): BufferGeometry | null {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return null;
  const g = new CylinderGeometry(radius, radius, length, 6);
  g.rotateZ(Math.PI / 2);
  g.rotateY(-Math.atan2(b.z - a.z, b.x - a.x));
  g.translate((a.x + b.x) / 2, y, (a.z + b.z) / 2);
  return g;
}

/** An upright sheet from a to b, y0 to y1, its texture repeating every `tile` metres. */
export function sheet(a: Pt, b: Pt, y0: number, y1: number, tile: number): BufferGeometry | null {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return null;
  const nx = -(b.z - a.z) / length;
  const nz = (b.x - a.x) / length;
  const u = length / tile;
  const v = (y1 - y0) / tile;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y1, a.z], 3));
  g.setAttribute("normal", new Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  g.setAttribute("uv", new Float32BufferAttribute([0, 0, u, 0, u, v, 0, v], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/** A flat strip along a to b, `width` metres across, a half-width longer at each end so joints close. */
export function strip(a: Pt, b: Pt, width: number, y: number): BufferGeometry | null {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return null;
  const dx = (b.x - a.x) / length;
  const dz = (b.z - a.z) / length;
  const h = width / 2;
  const p0 = { x: a.x - dx * h, z: a.z - dz * h };
  const p1 = { x: b.x + dx * h, z: b.z + dz * h };
  return flat(
    [
      { x: p0.x - dz * h, z: p0.z + dx * h },
      { x: p1.x - dz * h, z: p1.z + dx * h },
      { x: p1.x + dz * h, z: p1.z - dx * h },
      { x: p0.x + dz * h, z: p0.z - dx * h },
    ],
    y,
  );
}

export function post(p: Pt, height: number, radius: number): BufferGeometry {
  const g = new CylinderGeometry(radius, radius, height, 6);
  g.translate(p.x, height / 2, p.z);
  return g;
}

/** Paint every vertex of a vertex-coloured part one colour. */
export function recolour(g: BufferGeometry, colour: string): void {
  const c = new Color(colour);
  const count = g.getAttribute("position").count;
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colours.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new Float32BufferAttribute(colours, 3));
}

/** A thin round bar between two points in space. */
export function bar3(p: Vector3, q: Vector3, radius: number): BufferGeometry {
  const dir = new Vector3().subVectors(q, p);
  const length = dir.length();
  const g = new CylinderGeometry(radius, radius, length, 6);
  g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.normalize()));
  g.translate((p.x + q.x) / 2, (p.y + q.y) / 2, (p.z + q.z) / 2);
  return g;
}

export function closedRing(points: readonly Pt[]): Pt[] {
  return [...points, points[0]!];
}

/** The three wire offsets across a crossarm, as a share of the arm's half width. */
export const WIRE_OFFSETS = [-0.3, 0, 0.3] as const;

/** A utility pole: trunk, a crossarm turned across `dir`, and three insulators. `arm` is the height of the wires' own line. */
export function poleParts(p: Pt, dir: Pt, height: number, wiresHeight: number): { wood: BufferGeometry[]; insulators: BufferGeometry[] } {
  const trunk = new CylinderGeometry(0.11, 0.16, height, 10);
  trunk.translate(p.x, height / 2, p.z);
  const arm = new BoxGeometry(0.1, 0.1, 1.5);
  // The arm's long side lies across the wires.
  arm.rotateY(-Math.atan2(dir.z, dir.x));
  arm.translate(p.x, wiresHeight - 0.2, p.z);
  const nx = -dir.z;
  const nz = dir.x;
  const insulators = WIRE_OFFSETS.map((offset) => {
    const g = new CylinderGeometry(0.022, 0.04, 0.16, 8);
    g.translate(p.x + nx * offset * 2, wiresHeight - 0.2 + 0.05 + 0.08, p.z + nz * offset * 2);
    return g;
  });
  return { wood: [trunk, arm], insulators };
}

/** Three wires for one span a to b, hung from the insulator tops and sagging gently. */
export function wireSpan(a: Pt, b: Pt, wiresHeight: number): BufferGeometry[] {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return [];
  const nx = -(b.z - a.z) / length;
  const nz = (b.x - a.x) / length;
  const sag = Math.min(0.9, length * 0.012);
  const steps = Math.max(6, Math.round(length / 0.8));
  return WIRE_OFFSETS.map((offset) => {
    const spread = offset * 2;
    const y0 = wiresHeight - 0.2 + 0.05 + 0.16;
    const pts: Vector3[] = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      pts.push(new Vector3(a.x + (b.x - a.x) * t + nx * spread, y0 - sag * 4 * t * (1 - t), a.z + (b.z - a.z) * t + nz * spread));
    }
    return new TubeGeometry(new CatmullRomCurve3(pts), steps * 2, 0.014, 4, false);
  });
}
