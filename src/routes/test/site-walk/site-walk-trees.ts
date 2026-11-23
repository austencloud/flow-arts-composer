/**
 * Trees: a leafless winter tree grown from a seed, and a dense evergreen.
 *
 * `growBareTree` is pure: the same seed gives the same list of branches. The
 * trunk forks into limbs, limbs into branches, branches into twigs, each one
 * bending a little, leaning up toward the light and out from the trunk. The
 * crown is grown at a nominal size and then scaled so the tallest tip is exactly
 * the asked height and the widest reach exactly half the asked spread, which
 * keeps every seed inside the footprint the file promised. A density loop
 * thins the twigs until the tree fits its triangle budget.
 */

import { BufferGeometry, Float32BufferAttribute } from "three";
import { MeshBuilder, type V3 } from "./site-walk-around-geometry";
import { SURROUND_SIZES, type TreeShape } from "./site-walk-around";
import { seededRandom } from "./site-walk-plan";

export interface Branch {
  a: V3;
  b: V3;
  /** Radius at each end, metres. */
  ra: number;
  rb: number;
  /** 0 trunk, 1 limb, 2 branch, 3 and up twigs. */
  level: number;
}

export interface BareTree {
  branches: Branch[];
  /** The tallest tip and the widest reach from the trunk's axis, metres. */
  top: number;
  reach: number;
}

/** Trunk radius as a share of height, in the nominal unit-height crown. */
const TRUNK = 0.02;
/** Limbs fork this many times; the finest twigs are level 4. */
const MAX_LEVEL = 4;
/** How much a limb thins from foot to tip. */
const TAPER = 0.38;
/** The thinnest a twig is drawn: any finer and it shimmers away at a distance. */
const MIN_TWIG = 0.013;
const BARE_COLOURS = {
  trunk: [0.2, 0.16, 0.13],
  twig: [0.27, 0.23, 0.19],
} as const;

type Vec = [number, number, number];
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k];
const unit = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const crossOf = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dotOf = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A unit vector at right angles to `d`. */
function perpendicular(d: Vec): Vec {
  const helper: Vec = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return unit(crossOf(helper, d));
}

/** `d` turned by `angle` about `axis` (Rodrigues), both unit. */
function rotate(d: Vec, axis: Vec, angle: number): Vec {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const k = crossOf(axis, d);
  const kd = dotOf(axis, d) * (1 - c);
  return [d[0] * c + k[0] * s + axis[0] * kd, d[1] * c + k[1] * s + axis[1] * kd, d[2] * c + k[2] * s + axis[2] * kd];
}

interface Job {
  origin: Vec;
  dir: Vec;
  length: number;
  radius: number;
  level: number;
}

/** One growth at a given density of side branches; the unit-height crown. */
function grow(seed: number, density: number): Branch[] {
  const random = seededRandom((Math.imul(seed | 0, 2654435761) ^ 0x51ed270b) >>> 0);
  const branches: Branch[] = [];
  const wobble = (amount: number): Vec => [(random() - 0.5) * 2 * amount, (random() - 0.5) * 2 * amount, (random() - 0.5) * 2 * amount];

  // The trunk: three pieces, flaring a little at the foot, leaning a hair.
  const trunkHeight = 0.27 + random() * 0.09;
  let pos: Vec = [0, 0, 0];
  let dir: Vec = unit([(random() - 0.5) * 0.08, 1, (random() - 0.5) * 0.08]);
  for (let k = 0; k < 3; k++) {
    dir = unit(add(dir, wobble(0.05)));
    const next = add(pos, scale(dir, trunkHeight / 3));
    branches.push({
      a: pos,
      b: next,
      ra: TRUNK * (k === 0 ? 1.3 : 1 - 0.07 * k),
      rb: TRUNK * (1 - 0.07 * (k + 1)),
      level: 0,
    });
    pos = next;
  }
  const fork = pos;
  const queue: Job[] = [];
  const limbs = 3 + Math.floor(random() * 3);
  const base = random() * Math.PI * 2;
  // A vase (elm) holds its limbs steep; a rounder crown (maple) lets them lean out.
  const lean = 0.34 + random() * 0.3;
  for (let i = 0; i < limbs; i++) {
    const az = base + (i / limbs) * Math.PI * 2 + (random() - 0.5) * 0.8;
    const tilt = lean + (random() - 0.5) * 0.25;
    queue.push({
      origin: fork,
      dir: unit([Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az)]),
      length: 0.3 + random() * 0.12,
      radius: TRUNK * 0.62,
      level: 1,
    });
  }

  for (let head = 0; head < queue.length; head++) {
    const job = queue[head]!;
    const pieces = job.level <= 1 ? 4 : job.level === 2 ? 3 : 2;
    let at = job.origin;
    let d = job.dir;
    const droop = job.level >= 3 ? -0.02 : 0;
    for (let k = 0; k < pieces; k++) {
      // Bend a little, lean toward the light, keep reaching out from the trunk.
      const out: Vec = unit([at[0], 0, at[2]]);
      d = unit(add(add(d, wobble(job.level > 2 ? 0.26 : 0.15)), [out[0] * 0.07, 0.09 + droop, out[2] * 0.07]));
      const next = add(at, scale(d, job.length / pieces));
      branches.push({
        a: at,
        b: next,
        ra: job.radius * (1 - (TAPER * k) / pieces),
        rb: job.radius * (1 - (TAPER * (k + 1)) / pieces),
        level: job.level,
      });
      if (job.level < MAX_LEVEL && k >= 1 && k < pieces && random() < 0.7 * density) {
        const axis = rotate(perpendicular(d), d, random() * Math.PI * 2);
        const child = rotate(d, axis, 0.5 + random() * 0.55);
        queue.push({
          origin: at,
          dir: unit(add(child, [0, 0.12, 0])),
          length: job.length * (0.48 + random() * 0.2),
          radius: job.radius * 0.55,
          level: job.level + 1,
        });
      }
      at = next;
    }
    if (job.level < MAX_LEVEL) {
      const tipRadius = job.radius * (1 - TAPER);
      const forks = 2 + (random() < 0.4 * density ? 1 : 0);
      for (let c = 0; c < forks; c++) {
        const axis = rotate(perpendicular(d), d, (c / forks) * Math.PI * 2 + random() * 1.2);
        const child = rotate(d, axis, 0.3 + random() * 0.4);
        queue.push({
          origin: at,
          dir: unit(add(child, [0, 0.08, 0])),
          length: job.length * (0.62 + random() * 0.18),
          radius: tipRadius * 0.78,
          level: job.level + 1,
        });
      }
    }
  }
  return branches;
}

/** How many branches one tree may have: about 4,500 triangles at most. */
export const MAX_BRANCHES = 650;

export function growBareTree(seed: number, height: number, spread: number, maxBranches = MAX_BRANCHES): BareTree {
  let nominal = grow(seed, 1);
  if (nominal.length > maxBranches) {
    // Over budget: keep every limb and thin the finest twigs evenly, so the same seed always grows the same tree.
    const limbs = nominal.filter((b) => b.level < MAX_LEVEL);
    const twigs = nominal.filter((b) => b.level >= MAX_LEVEL);
    const keep = Math.max(0, maxBranches - limbs.length);
    const picked = Array.from({ length: Math.min(keep, twigs.length) }, (_, i) => twigs[Math.floor((i * twigs.length) / keep)]!);
    nominal = [...limbs, ...picked];
  }
  let top = 0;
  let reach = 0;
  for (const b of nominal) {
    for (const p of [b.a, b.b]) {
      top = Math.max(top, p[1]);
      reach = Math.max(reach, Math.hypot(p[0], p[2]));
    }
  }
  const sy = top > 1e-9 ? height / top : 1;
  const sxz = reach > 1e-9 ? spread / 2 / reach : 1;
  const branches = nominal.map<Branch>((b) => ({
    a: [b.a[0] * sxz, b.a[1] * sy, b.a[2] * sxz],
    b: [b.b[0] * sxz, b.b[1] * sy, b.b[2] * sxz],
    ra: Math.max(MIN_TWIG, b.ra * height),
    rb: Math.max(MIN_TWIG * 0.85, b.rb * height),
    level: b.level,
  }));
  return { branches, top: height, reach: spread / 2 };
}

/** One tree as a single vertex-coloured geometry, smooth round limbs. */
export function bareTreeGeometry(tree: TreeShape): BufferGeometry | null {
  const grown = growBareTree(tree.seed, tree.height, tree.spread);
  const position: number[] = [];
  const normal: number[] = [];
  const colour: number[] = [];
  const random = seededRandom((tree.seed ^ 0x6a09e667) >>> 0);
  for (const b of grown.branches) {
    const axis = unit([b.b[0] - b.a[0], b.b[1] - b.a[1], b.b[2] - b.a[2]]);
    const u = perpendicular(axis);
    const v = crossOf(axis, u);
    const sides = b.ra > 0.12 ? 10 : b.ra > 0.05 ? 6 : b.ra > 0.025 ? 4 : 3;
    const tone = b.level <= 1 ? BARE_COLOURS.trunk : BARE_COLOURS.twig;
    const shade = 0.88 + random() * 0.24;
    const ring = (centre: V3, r: number, i: number): { p: Vec; n: Vec } => {
      const angle = (i / sides) * Math.PI * 2;
      const n: Vec = [
        u[0] * Math.cos(angle) + v[0] * Math.sin(angle),
        u[1] * Math.cos(angle) + v[1] * Math.sin(angle),
        u[2] * Math.cos(angle) + v[2] * Math.sin(angle),
      ];
      return {
        p: [centre[0] + n[0] * r, centre[1] + n[1] * r, centre[2] + n[2] * r],
        n,
      };
    };
    for (let i = 0; i < sides; i++) {
      const a0 = ring(b.a, b.ra, i);
      const a1 = ring(b.a, b.ra, i + 1);
      const b0 = ring(b.b, b.rb, i);
      const b1 = ring(b.b, b.rb, i + 1);
      for (const t of [a0, a1, b0, a1, b1, b0]) {
        position.push(t.p[0], t.p[1], t.p[2]);
        normal.push(t.n[0], t.n[1], t.n[2]);
        colour.push(tone[0] * shade, tone[1] * shade, tone[2] * shade);
      }
    }
  }
  if (!position.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(position, 3));
  g.setAttribute("normal", new Float32BufferAttribute(normal, 3));
  g.setAttribute("color", new Float32BufferAttribute(colour, 3));
  g.setAttribute("uv", new Float32BufferAttribute(new Float32Array((position.length / 3) * 2), 2));
  g.translate(tree.at.x, 0, tree.at.z);
  return g;
}

/** A dense dark evergreen: stacked jagged skirts down to the ground, round about its axis. */
export function evergreenGeometry(tree: TreeShape): BufferGeometry | null {
  const random = seededRandom((tree.seed ^ 0x3c6ef372) >>> 0);
  const tint = [0.07 + random() * 0.02, 0.17 + random() * 0.04, 0.11 + random() * 0.03] as const;
  const b = new MeshBuilder([tint[0], tint[1], tint[2]]);
  const tiers = 6;
  const sectors = 12;
  const R = tree.spread / 2;
  const H = tree.height;
  for (let j = 0; j < tiers; j++) {
    const yBase = H * (0.03 + (0.7 * j) / tiers);
    const yTip = Math.min(H, yBase + H * 0.34);
    const radius = R * (1 - j / (tiers + 0.6));
    const ring: [number, number][] = [];
    for (let i = 0; i < sectors * 2; i++) {
      const angle = (i / (sectors * 2)) * Math.PI * 2;
      const r = radius * (i % 2 === 0 ? 1 : 0.8) * (0.92 + random() * 0.16);
      ring.push([tree.at.x + Math.sin(angle) * r, tree.at.z + Math.cos(angle) * r]);
    }
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      const mx = (p[0] + q[0]) / 2 - tree.at.x;
      const mz = (p[1] + q[1]) / 2 - tree.at.z;
      b.face(
        [
          [p[0], yBase, p[1]],
          [q[0], yBase, q[1]],
          [tree.at.x, yTip, tree.at.z],
        ],
        [mx, radius * 0.6, mz],
      );
    }
  }
  const trunk = Math.max(0.12, H * 0.012);
  b.box(tree.at.x - trunk, tree.at.x + trunk, 0, H * 0.06, tree.at.z - trunk, tree.at.z + trunk);
  return b.build();
}

/** The trunk's width for what stops you, from the file's height. */
export const trunkWidth = (height: number) => Math.max(0.3, height * SURROUND_SIZES.trunkShare * 2);
