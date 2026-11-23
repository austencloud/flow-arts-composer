/**
 * The street furniture around the lot: black iron fence and railings (with
 * star ornaments), parked cars, street-lamp lanterns and street-light heads,
 * and the soft pool of light a lamp throws on the ground.
 *
 * Every builder returns plain geometry in world metres, sorted by the material
 * bucket it belongs to; the assembly merges each bucket into one mesh. All the
 * geometry here is non-indexed so any of it merges with any other.
 */

import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Vector3 } from "three";
import { MeshBuilder, type V3 } from "./site-walk-around-geometry";
import { SURROUND_SIZES, starSegments, type CarShape, type LampShape, type PoleShape, type StarSpec } from "./site-walk-around";
import type { Pt } from "./site-walk-plan";

const solid = (g: BufferGeometry): BufferGeometry => (g.index ? g.toNonIndexed() : g);

// ------------------------------------------------------------------ iron fence

/** Half-widths and heights of an iron fence's parts, metres. */
const IRON = {
  post: 0.024,
  rail: 0.016,
  railTall: 0.022,
  picket: 0.009,
  handBelow: 0.11,
  groundGap: 0.05,
  starWidth: 0.02,
} as const;

/**
 * A black iron fence or railing along a polyline: square posts every 8 ft, a top
 * rail, a second rail a hand below it, a bottom rail, and flat-topped pickets
 * about 4.5 in apart. With `stars`, a star of thin bars hangs in the middle of
 * every bay of that spacing. Returns one geometry, or none for a degenerate line.
 */
export function ironFenceParts(line: readonly Pt[], height: number, stars: StarSpec | null): BufferGeometry[] {
  const b = new MeshBuilder();
  const topRail = height - 0.07;
  const rails = [topRail, topRail - IRON.handBelow, 0.14];
  let travelled = 0;
  let nextStar = stars ? stars.every / 2 : Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const c = line[i + 1]!;
    const length = Math.hypot(c.x - a.x, c.z - a.z);
    if (length < 1e-6) continue;
    const ux = (c.x - a.x) / length;
    const uz = (c.z - a.z) / length;
    const at = (d: number): Pt => ({ x: a.x + ux * d, z: a.z + uz * d });
    const mid = at(length / 2);
    for (const y of rails) b.obox(mid.x, mid.z, ux, uz, length / 2, IRON.rail, y - IRON.railTall, y + IRON.railTall);
    const bays = Math.max(1, Math.round(length / SURROUND_SIZES.ironPostSpacing));
    for (let k = i === 0 ? 0 : 1; k <= bays; k++) {
      const p = at((length * k) / bays);
      b.obox(p.x, p.z, ux, uz, IRON.post, IRON.post, 0, height);
    }
    const count = Math.floor(length / SURROUND_SIZES.picketSpacing);
    for (let k = 0; k < count; k++) {
      const p = at(((k + 0.5) * length) / count);
      b.obox(p.x, p.z, ux, uz, IRON.picket, IRON.picket, IRON.groundGap, height - 0.03);
    }
    if (stars) {
      // A star's centre sits between the top two rails' span and the bottom rail.
      const radius = stars.size / 2;
      const { tips, segments } = starSegments(stars.points, stars.skip, radius);
      const centreY = Math.max(radius + 0.2, height * 0.5);
      while (nextStar - travelled <= length) {
        const centre = at(nextStar - travelled);
        for (const side of [1, -1]) {
          const off = 0.013 * side;
          const nx = -uz * side;
          const nz = ux * side;
          for (const [s, t] of segments) {
            const [x0, y0] = tips[s]!;
            const [x1, y1] = tips[t]!;
            // A thin flat bar in the fence's plane between the two tips.
            const dx = x1 - x0;
            const dy = y1 - y0;
            const len = Math.hypot(dx, dy) || 1;
            const wx = (-dy / len) * IRON.starWidth;
            const wy = (dx / len) * IRON.starWidth;
            const corner = (u: number, v: number): V3 => [centre.x + ux * u - uz * off, centreY + v, centre.z + uz * u + ux * off];
            b.face([corner(x0 - wx, y0 - wy), corner(x1 - wx, y1 - wy), corner(x1 + wx, y1 + wy), corner(x0 + wx, y0 + wy)], [nx, 0, nz]);
          }
        }
        nextStar += stars.every;
      }
    }
    travelled += length;
  }
  const g = b.build();
  return g ? [g] : [];
}

// ------------------------------------------------------------------ cars

export interface CarParts {
  body: BufferGeometry[];
  glass: BufferGeometry[];
  tyre: BufferGeometry[];
  head: BufferGeometry[];
  tail: BufferGeometry[];
}

type UY = readonly [number, number];

/** A side-view outline (u forward, y up, counter-clockwise) extruded across the car to half-width `hw`. */
function prism(b: MeshBuilder, profile: readonly UY[], hw: number): void {
  const w = (u: number, y: number, x: number): V3 => [x, y, u];
  b.face(
    profile.map(([u, y]) => w(u, y, hw)),
    [1, 0, 0],
  );
  b.face(
    profile.map(([u, y]) => w(u, y, -hw)),
    [-1, 0, 0],
  );
  for (let i = 0; i < profile.length; i++) {
    const [u0, y0] = profile[i]!;
    const [u1, y1] = profile[(i + 1) % profile.length]!;
    // A counter-clockwise outline's outward normal is (dy, -dx).
    b.face([w(u0, y0, -hw), w(u1, y1, -hw), w(u1, y1, hw), w(u0, y0, hw)], [0, -(u1 - u0), y1 - y0]);
  }
}

const centroid = (pts: readonly UY[]): UY => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];
const shrink = (pts: readonly UY[], k: number): UY[] => {
  const [cu, cy] = centroid(pts);
  return pts.map(([u, y]) => [cu + (u - cu) * k, cy + (y - cy) * k]);
};

/** A parked car in world metres: body, glass band, four wheels, lamps. At turn 0 its length runs along the plan's y. */
export function carParts(car: CarShape): CarParts {
  const size = SURROUND_SIZES.car[car.body];
  const { length: L, width: W, height: H } = size;
  const suv = car.body === "suv";
  const low = 0.3;
  const belt = H * 0.56;
  const hw = W / 2;
  const f = (share: number) => share * L;
  const bodyB = new MeshBuilder(hexToRgb(car.colour));
  // The lower body: a hood a little lower than the boot, a straight sill, rounded off by the profile's slope.
  prism(
    bodyB,
    [
      [-L / 2, low],
      [L / 2, low],
      [L / 2, belt - 0.1],
      [f(0.3), belt],
      [-f(0.5) + (suv ? 0 : 0.05), belt + 0.04],
    ],
    hw,
  );
  const cabin: UY[] = suv
    ? [
        [-f(0.5), belt],
        [f(0.16), belt],
        [f(0.05), H],
        [-f(0.4), H],
      ]
    : [
        [-f(0.24), belt],
        [f(0.17), belt],
        [f(0.02), H],
        [-f(0.12), H],
      ];
  prism(bodyB, cabin, hw * 0.88);
  const glassB = new MeshBuilder();
  const gw = hw * 0.88 + 0.004;
  const glassSide = shrink(cabin, 0.86);
  for (const side of [1, -1]) {
    glassB.face(
      glassSide.map(([u, y]): V3 => [gw * side, y, u]),
      [side, 0, 0],
    );
  }
  // Windscreen and rear glass: the cabin's front and back edges, a little narrower than the body.
  const edge = (from: UY, to: UY, hint: V3, k: number) => {
    const gwid = hw * 0.88 * k;
    const out = 0.004;
    const lift = (p: UY, x: number): V3 => [x, p[1], p[0] + (hint[2] > 0 ? out : -out)];
    glassB.face([lift(from, -gwid), lift(to, -gwid), lift(to, gwid), lift(from, gwid)], hint);
  };
  edge(cabin[1]!, cabin[2]!, [0, 0.5, 1], 0.9);
  edge(cabin[3]!, cabin[0]!, [0, 0.4, -1], 0.9);
  const headB = new MeshBuilder();
  const tailB = new MeshBuilder();
  for (const side of [1, -1]) {
    headB.box(side * hw * 0.62 - 0.17, side * hw * 0.62 + 0.17, belt - 0.26, belt - 0.12, L / 2 - 0.01, L / 2 + 0.02);
    tailB.box(side * hw * 0.64 - 0.15, side * hw * 0.64 + 0.15, belt - 0.2, belt - 0.07, -L / 2 - 0.02, -L / 2 + 0.01);
  }
  const radius = 0.33;
  const tyres: BufferGeometry[] = [];
  for (const u of [-0.32, 0.32]) {
    for (const side of [1, -1]) {
      const g = new CylinderGeometry(radius, radius, 0.22, 14);
      g.rotateZ(Math.PI / 2);
      g.translate(side * (hw - 0.07), radius, f(u));
      tyres.push(solid(g));
    }
  }
  const place = new Matrix4().makeRotationY(-car.turn).setPosition(new Vector3(car.at.x, 0, car.at.z));
  const finish = (builder: MeshBuilder): BufferGeometry[] => {
    const g = builder.build();
    return g ? [g.applyMatrix4(place)] : [];
  };
  return {
    body: finish(bodyB),
    glass: finish(glassB),
    tyre: tyres.map((g) => g.applyMatrix4(place)),
    head: finish(headB),
    tail: finish(tailB),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  // Linear values, as the vertex-colour attribute is read in linear space.
  const lin = (c: number) => Math.pow(c / 255, 2.2);
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

// ------------------------------------------------------------------ lamps

export interface LampParts {
  metal: BufferGeometry[];
  /** The glass that glows at Dusk and Night. */
  glass: BufferGeometry[];
}

/** A black post-top street lantern: a plinth, a slim shaft, a glass lantern and a cap. */
export function lampPostParts(lamp: LampShape): LampParts {
  const { at, height } = lamp;
  const metal: BufferGeometry[] = [];
  const put = (g: BufferGeometry, y: number) => {
    g.translate(at.x, y, at.z);
    return solid(g);
  };
  const lanternH = 0.42;
  const top = height - 0.2;
  metal.push(put(new CylinderGeometry(0.13, 0.17, 0.5, 10), 0.25));
  metal.push(put(new CylinderGeometry(0.045, 0.07, top - 0.5 - lanternH, 8), 0.5 + (top - 0.5 - lanternH) / 2));
  metal.push(put(new CylinderGeometry(0.1, 0.07, 0.07, 8), top - lanternH - 0.03));
  const cap = new CylinderGeometry(0.02, 0.27, 0.2, 4);
  cap.rotateY(Math.PI / 4);
  metal.push(put(cap, top + 0.1));
  metal.push(put(new CylinderGeometry(0.02, 0.02, 0.1, 6), top + 0.25));
  const glass = put(new BoxGeometry(0.3, lanternH, 0.3), top - lanternH / 2);
  return { metal, glass: [glass] };
}

/** Where a street light's lamp hangs: the end of its arm. */
export function streetLightHead(pole: PoleShape): {
  x: number;
  y: number;
  z: number;
  dir: Pt;
} {
  const toward = pole.lampToward ?? { x: pole.at.x, z: pole.at.z + 1 };
  const dx = toward.x - pole.at.x;
  const dz = toward.z - pole.at.z;
  const len = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / len, z: dz / len };
  const reach = SURROUND_SIZES.lampArmLength;
  return {
    x: pole.at.x + dir.x * reach,
    y: pole.height - 0.35,
    z: pole.at.z + dir.z * reach,
    dir,
  };
}

/** A pole's street light: an arm reaching toward `lampToward`, a housing, and the lens under it that glows. */
export function streetLightParts(pole: PoleShape): LampParts {
  const head = streetLightHead(pole);
  const b = new MeshBuilder();
  const y = pole.height - 0.15;
  const { dir } = head;
  const reach = SURROUND_SIZES.lampArmLength;
  // The arm rises a little to the head, in two straight pieces so it bends up like a real bracket.
  const knee = {
    x: pole.at.x + dir.x * reach * 0.55,
    z: pole.at.z + dir.z * reach * 0.55,
  };
  const arm = (a: Pt, c: Pt, ya: number, yc: number) => {
    const length = Math.hypot(c.x - a.x, c.z - a.z);
    const mid = { x: (a.x + c.x) / 2, z: (a.z + c.z) / 2 };
    const ux = (c.x - a.x) / length;
    const uz = (c.z - a.z) / length;
    // Tilt by lifting the far end: approximated by a box that spans both heights.
    b.obox(mid.x, mid.z, ux, uz, length / 2, 0.035, Math.min(ya, yc), Math.max(ya, yc) + 0.07);
  };
  arm(pole.at, knee, y - 0.05, y + 0.02);
  arm(knee, { x: head.x, z: head.z }, y + 0.02, y + 0.09);
  // The housing: a long low box with its lens on the underside.
  b.obox(head.x, head.z, dir.x, dir.z, 0.5, 0.17, head.y + 0.15, head.y + 0.33);
  const lens = new MeshBuilder();
  const vx = -dir.z;
  const vz = dir.x;
  const corner = (a: number, c: number): V3 => [
    head.x + dir.x * 0.46 * a + vx * 0.14 * c,
    head.y + 0.145,
    head.z + dir.z * 0.46 * a + vz * 0.14 * c,
  ];
  lens.face([corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], [0, -1, 0]);
  const metal = b.build();
  const glass = lens.build();
  return { metal: metal ? [metal] : [], glass: glass ? [glass] : [] };
}

/** A flat square on the ground under a lamp, its UVs 0..1, for the soft pool texture. */
export function poolSquare(x: number, z: number, radius: number, y: number): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute(
    "position",
    new Float32BufferAttribute(
      [
        x - radius,
        y,
        z - radius,
        x + radius,
        y,
        z - radius,
        x + radius,
        y,
        z + radius,
        x - radius,
        y,
        z - radius,
        x + radius,
        y,
        z + radius,
        x - radius,
        y,
        z + radius,
      ],
      3,
    ),
  );
  g.setAttribute("normal", new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  return g;
}
