/**
 * Buildings made of parts: walls with windows, doors, garage doors and emblems,
 * and flat, hip and gable roofs that overhang the wall with a fascia.
 *
 * A part is built in its own frame (x along its width, z along its depth, y up)
 * and then turned and moved onto the plan, so a turned part needs no special
 * case. Nothing here makes a material: the geometries come back sorted by the
 * bucket they belong to (one per wall kind, shingles, fascia, glass lit and
 * dark, and so on) and the assembly merges each bucket into one mesh.
 */

import type { BufferGeometry } from "three";
import { Color, Matrix4 } from "three";
import { MeshBuilder, edgeOutward, offsetRing, ringArea, type V3 } from "./site-walk-around-geometry";
import {
  SURROUND_SIZES,
  hashText,
  starSegments,
  type BuildingShape,
  type FaceSide,
  type FaceSpec,
  type PolyPart,
  type RectPart,
  type WallKind,
  type WindowRow,
} from "./site-walk-around";
import { seededRandom, turned, type Pt } from "./site-walk-plan";
import type { SiteFloor } from "./site-walk-floor";

/** Metres one repeat of each wall picture covers (brick: sixteen courses). */
export const WALL_TILE: Record<WallKind, number> = {
  "brick-buff": 16 * SURROUND_SIZES.brickCourse,
  "brick-red": 16 * SURROUND_SIZES.brickCourse,
  "brick-brown": 16 * SURROUND_SIZES.brickCourse,
  stone: 8 * 0.3048,
  "siding-white": 8 * (4 / 12) * 0.3048,
  concrete: 8 * 0.3048,
};
/** Metres one repeat of the shingle picture covers. */
export const ROOF_TILE = 1.524;

export interface BuildingGeometries {
  walls: Partial<Record<WallKind, BufferGeometry[]>>;
  /** Shingles, painted by vertex colour. */
  roof: BufferGeometry[];
  /** The pale top of a flat roof. */
  roofTop: BufferGeometry[];
  /** Fascia boards, soffits, and the dark underside of a slab. */
  fascia: BufferGeometry[];
  glassDark: BufferGeometry[];
  glassLit: BufferGeometry[];
  /** Window and door frames, sills. */
  trim: BufferGeometry[];
  door: BufferGeometry[];
  garage: BufferGeometry[];
  groove: BufferGeometry[];
  emblem: BufferGeometry[];
}

/** How many windows a house face of this length gets: one about every 11 ft, none on a stub. */
export function autoWindowCount(length: number): number {
  return length < SURROUND_SIZES.autoWindow.every * 0.5 ? 0 : Math.max(1, Math.round(length / SURROUND_SIZES.autoWindow.every));
}

const FRAME = {
  width: 0.06,
  depth: 0.05,
  ledge: 0.09,
  glassOut: 0.012,
  leaf: 0.02,
  trimOut: 0.03,
} as const;
const FASCIA_BOARD = 0.2;

function emptyGeometries(): BuildingGeometries {
  return {
    walls: {},
    roof: [],
    roofTop: [],
    fascia: [],
    glassDark: [],
    glassLit: [],
    trim: [],
    door: [],
    garage: [],
    groove: [],
    emblem: [],
  };
}

/** One bucket's builders for a part: made on first use, collected at the end. */
class PartBuilders {
  private readonly by = new Map<string, MeshBuilder>();
  get(key: string): MeshBuilder {
    let b = this.by.get(key);
    if (!b) this.by.set(key, (b = new MeshBuilder()));
    return b;
  }
  drain(key: string): BufferGeometry | null {
    return this.by.get(key)?.build() ?? null;
  }
}

/** The face a rect part's wall stands on, in the part's own frame. */
interface FaceFrame {
  side: FaceSide;
  length: number;
  outward: V3;
  at(u: number, y: number, out?: number): V3;
  /** A box from offset u0 to u1, height y0 to y1, standing out o0 to o1 from the wall. */
  slab(b: MeshBuilder, u0: number, u1: number, y0: number, y1: number, o0: number, o1: number): void;
}

function faceFrame(part: RectPart, side: FaceSide): FaceFrame {
  const hw = part.w / 2;
  const hd = part.d / 2;
  const mid: V3 = side === "n" ? [0, 0, -hd] : side === "s" ? [0, 0, hd] : side === "e" ? [hw, 0, 0] : [-hw, 0, 0];
  const outward: V3 = side === "n" ? [0, 0, -1] : side === "s" ? [0, 0, 1] : side === "e" ? [1, 0, 0] : [-1, 0, 0];
  const along: V3 = side === "n" || side === "s" ? [1, 0, 0] : [0, 0, 1];
  const at = (u: number, y: number, out = 0): V3 => [mid[0] + along[0] * u + outward[0] * out, y, mid[2] + along[2] * u + outward[2] * out];
  return {
    side,
    length: side === "n" || side === "s" ? part.w : part.d,
    outward,
    at,
    slab(b, u0, u1, y0, y1, o0, o1) {
      const p = at(u0, y0, o0);
      const q = at(u1, y1, o1);
      b.box(Math.min(p[0], q[0]), Math.max(p[0], q[0]), y0, y1, Math.min(p[2], q[2]), Math.max(p[2], q[2]));
    },
  };
}

// ------------------------------------------------------------------ openings

function addWindow(frame: FaceFrame, b: PartBuilders, u: number, width: number, sill: number, head: number, lit: boolean): void {
  const u0 = u - width / 2;
  const u1 = u + width / 2;
  const glass = b.get(lit ? "glassLit" : "glassDark");
  glass.face(
    [
      frame.at(u0, sill, FRAME.glassOut),
      frame.at(u1, sill, FRAME.glassOut),
      frame.at(u1, head, FRAME.glassOut),
      frame.at(u0, head, FRAME.glassOut),
    ],
    frame.outward,
  );
  const trim = b.get("trim");
  const f = FRAME.width;
  frame.slab(trim, u0 - f, u0, sill - f, head + f, 0, FRAME.depth);
  frame.slab(trim, u1, u1 + f, sill - f, head + f, 0, FRAME.depth);
  frame.slab(trim, u0, u1, head, head + f, 0, FRAME.depth);
  frame.slab(trim, u0 - f, u1 + f, sill - f - 0.04, sill, 0, FRAME.ledge);
  // A bar across the middle of a tall window, so the glass reads as two sashes.
  if (head - sill > 0.9) frame.slab(trim, u0, u1, (sill + head) / 2 - 0.015, (sill + head) / 2 + 0.015, 0, FRAME.depth * 0.7);
}

/** Where a point of a part's own frame lands on the plan. */
const onPlan = (part: RectPart, local: V3): Pt => turned(part.centre, { x: local[0], z: local[2] }, part.turn);

function addFace(part: RectPart, id: string, side: FaceSide, b: PartBuilders, own: FaceSpec | undefined, floor: SiteFloor | null): void {
  const frame = faceFrame(part, side);
  const L = frame.length;
  const H = part.height;
  const keepClear: { from: number; to: number }[] = [];

  if (own?.door) {
    const d = own.door;
    // A door opens onto the floor in front of it: a platform's top where one meets the wall.
    const sill = floor ? floor.highestNear(onPlan(part, frame.at(d.at, 0, 0.3))) : 0;
    const h = Math.min(sill + d.h, H - 0.2);
    const u0 = d.at - d.w / 2;
    const u1 = d.at + d.w / 2;
    b.get(d.glass ? "glassDark" : "door").face(
      [frame.at(u0, sill + 0.05, FRAME.leaf), frame.at(u1, sill + 0.05, FRAME.leaf), frame.at(u1, h, FRAME.leaf), frame.at(u0, h, FRAME.leaf)],
      frame.outward,
    );
    const trim = b.get("trim");
    frame.slab(trim, u0 - FRAME.width, u0, sill, h + FRAME.width, 0, FRAME.depth);
    frame.slab(trim, u1, u1 + FRAME.width, sill, h + FRAME.width, 0, FRAME.depth);
    frame.slab(trim, u0, u1, h, h + FRAME.width, 0, FRAME.depth);
    // A small light on a solid door, and a handle.
    if (d.glass) frame.slab(trim, d.at - 0.015, d.at + 0.015, sill + 0.05, h, 0, FRAME.depth * 0.6);
    else frame.slab(trim, u1 - 0.18, u1 - 0.12, sill + 0.95, sill + 1.1, FRAME.leaf, FRAME.leaf + 0.05);
    keepClear.push({ from: u0 - FRAME.width, to: u1 + FRAME.width });
  }
  if (own?.garage) {
    const g = own.garage;
    const h = Math.min(g.h, H - 0.2);
    const u0 = g.at - g.w / 2;
    const u1 = g.at + g.w / 2;
    b.get("garage").face(
      [frame.at(u0, 0.02, FRAME.leaf), frame.at(u1, 0.02, FRAME.leaf), frame.at(u1, h, FRAME.leaf), frame.at(u0, h, FRAME.leaf)],
      frame.outward,
    );
    // Four panels: three grooves across, a seam down the middle of each panel row.
    for (let k = 1; k < 4; k++) {
      const y = (h * k) / 4;
      b.get("groove").face(
        [
          frame.at(u0, y - 0.012, FRAME.leaf + 0.004),
          frame.at(u1, y - 0.012, FRAME.leaf + 0.004),
          frame.at(u1, y + 0.012, FRAME.leaf + 0.004),
          frame.at(u0, y + 0.012, FRAME.leaf + 0.004),
        ],
        frame.outward,
      );
    }
    const trim = b.get("trim");
    frame.slab(trim, u0 - FRAME.width, u0, 0, h + FRAME.width, 0, FRAME.depth);
    frame.slab(trim, u1, u1 + FRAME.width, 0, h + FRAME.width, 0, FRAME.depth);
    frame.slab(trim, u0, u1, h, h + FRAME.width, 0, FRAME.depth);
    keepClear.push({ from: u0 - FRAME.width, to: u1 + FRAME.width });
  }

  // Windows: the file's own row, or a house's windows when the part asks and the face has no entry of its own.
  let row: WindowRow | null = own?.windows ?? null;
  if (!own && part.windowsAuto) {
    const count = autoWindowCount(L);
    const a = SURROUND_SIZES.autoWindow;
    row =
      count > 0
        ? {
            count,
            width: a.width,
            sill: a.sill,
            head: a.sill + a.height,
            lit: a.litShare,
          }
        : null;
  }
  if (row) {
    const pitch = L / row.count;
    const width = Math.min(row.width, pitch * 0.85);
    const head = Math.min(row.head, H - 0.25);
    if (head - row.sill > 0.3) {
      for (let i = 0; i < row.count; i++) {
        const u = -L / 2 + (i + 0.5) * pitch;
        if (keepClear.some((c) => u + width / 2 > c.from - 0.15 && u - width / 2 < c.to + 0.15)) continue;
        // A seeded draw per window, so the same file always lights the same ones.
        const lit = seededRandom(hashText(`${id}:${side}:${i}`))() < row.lit;
        addWindow(frame, b, u, width, row.sill, head, lit);
      }
    }
  }

  if (own?.emblem) {
    const e = own.emblem;
    const star = starSegments(e.points, e.skip, e.size / 2);
    const t = 0.025;
    for (const [from, to] of star.segments) {
      const [ax, ay] = star.tips[from]!;
      const [bx, by] = star.tips[to]!;
      const length = Math.hypot(bx - ax, by - ay) || 1;
      const nx = (-(by - ay) / length) * t;
      const ny = ((bx - ax) / length) * t;
      b.get("emblem").face(
        [
          frame.at(e.at + ax - nx, e.up + ay - ny, FRAME.trimOut),
          frame.at(e.at + bx - nx, e.up + by - ny, FRAME.trimOut),
          frame.at(e.at + bx + nx, e.up + by + ny, FRAME.trimOut),
          frame.at(e.at + ax + nx, e.up + ay + ny, FRAME.trimOut),
        ],
        frame.outward,
      );
    }
  }
}

// ------------------------------------------------------------------ roofs

function flatRoof(part: RectPart, b: PartBuilders): void {
  const o = part.roof.overhang;
  const hw = part.w / 2 + o;
  const hd = part.d / 2 + o;
  const y0 = part.height;
  const y1 = y0 + SURROUND_SIZES.fasciaDepth;
  // The four edges n, e, s, w with the way each faces.
  const edges: { p: [number, number]; q: [number, number]; out: V3 }[] = [
    { p: [-hw, -hd], q: [hw, -hd], out: [0, 0, -1] },
    { p: [hw, -hd], q: [hw, hd], out: [1, 0, 0] },
    { p: [hw, hd], q: [-hw, hd], out: [0, 0, 1] },
    { p: [-hw, hd], q: [-hw, -hd], out: [-1, 0, 0] },
  ];
  const fascia = b.get("fascia");
  for (const { p, q, out } of edges)
    fascia.face(
      [
        [p[0], y0, p[1]],
        [q[0], y0, q[1]],
        [q[0], y1, q[1]],
        [p[0], y1, p[1]],
      ],
      out,
    );
  fascia.face(
    [
      [-hw, y0, -hd],
      [hw, y0, -hd],
      [hw, y0, hd],
      [-hw, y0, hd],
    ],
    [0, -1, 0],
  );
  b.get("roofTop").face(
    [
      [-hw, y1, -hd],
      [hw, y1, -hd],
      [hw, y1, hd],
      [-hw, y1, hd],
    ],
    [0, 1, 0],
  );
}

/** A hip or gable roof. Returns its shingles (painted by vertex colour); the boards and soffits go in `b`. */
function pitchedRoof(part: RectPart, b: PartBuilders): BufferGeometry | null {
  const { roof } = part;
  const gable = roof.type === "gable";
  const alongX = gable && roof.ridge ? roof.ridge === "w" : part.w >= part.d;
  const s = alongX ? part.d / 2 : part.w / 2;
  const l = alongX ? part.w / 2 : part.d / 2;
  const o = roof.overhang;
  const H = part.height;
  const R = roof.rise;
  const slope = R / s;
  const yEave = H - o * slope;
  const hyp = Math.sqrt(1 + slope * slope);
  // (along, across, y) in the roof's own axes, mapped to the part's x, y, z.
  const P = (a: number, c: number, y: number): V3 => (alongX ? [a, y, c] : [c, y, a]);
  const tint = new Color(roof.colour);
  const shingles = new MeshBuilder([tint.r, tint.g, tint.b]);
  const reach = l + o;
  const ridgeEnd = gable ? l + o : l - s;
  const run = ((s + o) * hyp) / ROOF_TILE;

  for (const side of [-1, 1] as const) {
    // One long slope, from its eave line up to the ridge.
    shingles.face(
      [P(-reach, side * (s + o), yEave), P(reach, side * (s + o), yEave), P(ridgeEnd, 0, H + R), P(-ridgeEnd, 0, H + R)],
      P(0, side, R * 2),
      [
        [-reach / ROOF_TILE, 0],
        [reach / ROOF_TILE, 0],
        [ridgeEnd / ROOF_TILE, run],
        [-ridgeEnd / ROOF_TILE, run],
      ],
    );
  }
  if (!gable) {
    for (const end of [-1, 1] as const) {
      // A hip end: a triangle from the end eave up to the ridge's end.
      shingles.face([P(end * reach, -(s + o), yEave), P(end * reach, s + o, yEave), P(end * (l - s), 0, H + R)], P(end, 0, R * 2), [
        [-(s + o) / ROOF_TILE, 0],
        [(s + o) / ROOF_TILE, 0],
        [0, run],
      ]);
    }
  }

  const fascia = b.get("fascia");
  const eaves: [number, number][] = [
    [-reach, -(s + o)],
    [reach, -(s + o)],
    [reach, s + o],
    [-reach, s + o],
  ];
  const walls: [number, number][] = [
    [-l, -s],
    [l, -s],
    [l, s],
    [-l, s],
  ];
  for (let i = 0; i < 4; i++) {
    const [a0, c0] = eaves[i]!;
    const [a1, c1] = eaves[(i + 1) % 4]!;
    // On a gable the sides at the ends are rakes: a barge board below, no flat soffit.
    if (gable && Math.abs(a0 - a1) < 1e-9) continue;
    const out = P((a0 + a1) / 2, (c0 + c1) / 2, 0);
    fascia.face([P(a0, c0, yEave), P(a1, c1, yEave), P(a1, c1, yEave - FASCIA_BOARD), P(a0, c0, yEave - FASCIA_BOARD)], out);
    const [w0a, w0c] = walls[i]!;
    const [w1a, w1c] = walls[(i + 1) % 4]!;
    fascia.face([P(a0, c0, yEave), P(a1, c1, yEave), P(w1a, w1c, H), P(w0a, w0c, H)], [0, -1, 0]);
  }
  if (gable) {
    // The barge board up each gable end, a dark edge that frames the wall triangle.
    for (const end of [-1, 1] as const) {
      const e = end * reach;
      // Two slanted boards, one up each rake, so the wall's triangle stays open between them.
      for (const side of [-1, 1] as const) {
        fascia.face(
          [P(e, side * (s + o), yEave), P(e, 0, H + R), P(e, 0, H + R - FASCIA_BOARD), P(e, side * (s + o), yEave - FASCIA_BOARD)],
          P(end, 0, 0),
        );
      }
    }
  }
  return shingles.build();
}

// ------------------------------------------------------------------ parts

function gableTriangles(part: RectPart, b: PartBuilders): void {
  const { roof } = part;
  if (roof.type !== "gable") return;
  const alongX = roof.ridge ? roof.ridge === "w" : part.w >= part.d;
  const s = alongX ? part.d / 2 : part.w / 2;
  const l = alongX ? part.w / 2 : part.d / 2;
  const tile = WALL_TILE[part.wall];
  const wall = b.get(`wall:${part.wall}`);
  const H = part.height;
  for (const end of [-1, 1] as const) {
    const P = (c: number, y: number): V3 => (alongX ? [end * l, y, c] : [c, y, end * l]);
    const out: V3 = alongX ? [end, 0, 0] : [0, 0, end];
    wall.face([P(-s, H), P(s, H), P(0, H + roof.rise)], out, [
      [-s / tile, H / tile],
      [s / tile, H / tile],
      [0, (H + roof.rise) / tile],
    ]);
  }
}

function buildRect(out: BuildingGeometries, id: string, part: RectPart, floor: SiteFloor | null): void {
  const b = new PartBuilders();
  const H = part.height;
  const tile = WALL_TILE[part.wall];
  const wall = b.get(`wall:${part.wall}`);
  for (const side of ["n", "e", "s", "w"] as const) {
    const frame = faceFrame(part, side);
    const L = frame.length;
    wall.face([frame.at(-L / 2, 0), frame.at(L / 2, 0), frame.at(L / 2, H), frame.at(-L / 2, H)], frame.outward, [
      [0, 0],
      [L / tile, 0],
      [L / tile, H / tile],
      [0, H / tile],
    ]);
    addFace(part, id, side, b, part.faces[side], floor);
  }
  gableTriangles(part, b);
  let shingles: BufferGeometry | null = null;
  if (part.roof.type === "flat") flatRoof(part, b);
  else shingles = pitchedRoof(part, b);

  // Turn it onto the plan: three.js turns about y the other way from the plan's clockwise.
  const m = new Matrix4().makeRotationY(-part.turn).setPosition(part.centre.x, 0, part.centre.z);
  collect(out, b, part.wall, m, shingles);
}

function buildPoly(out: BuildingGeometries, part: PolyPart): void {
  const b = new PartBuilders();
  const H = part.height;
  const tile = WALL_TILE[part.wall];
  const wall = b.get(`wall:${part.wall}`);
  const sign = Math.sign(ringArea(part.points)) || 1;
  part.points.forEach((p, i) => {
    const q = part.points[(i + 1) % part.points.length]!;
    const n = edgeOutward(p, q, sign);
    const length = Math.hypot(q.x - p.x, q.z - p.z);
    wall.face(
      [
        [p.x, 0, p.z],
        [q.x, 0, q.z],
        [q.x, H, q.z],
        [p.x, H, p.z],
      ],
      [n.x, 0, n.z],
      [
        [0, 0],
        [length / tile, 0],
        [length / tile, H / tile],
        [0, H / tile],
      ],
    );
  });
  const ring = offsetRing(part.points, part.roof.overhang);
  const y1 = H + SURROUND_SIZES.fasciaDepth;
  const fascia = b.get("fascia");
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    const n = edgeOutward(p, q, sign);
    fascia.face(
      [
        [p.x, H, p.z],
        [q.x, H, q.z],
        [q.x, y1, q.z],
        [p.x, y1, p.z],
      ],
      [n.x, 0, n.z],
    );
  });
  fascia.cap(ring, H, false);
  b.get("roofTop").cap(ring, y1, true);
  collect(out, b, part.wall, new Matrix4(), null);
}

/** Move a part's finished pieces into the building's buckets, through the part's own matrix. */
function collect(out: BuildingGeometries, b: PartBuilders, wallKind: WallKind, m: Matrix4, shingles: BufferGeometry | null): void {
  const put = (list: BufferGeometry[], key: string) => {
    const g = b.drain(key);
    if (g) list.push(g.applyMatrix4(m));
  };
  const walls = (out.walls[wallKind] ??= []);
  put(walls, `wall:${wallKind}`);
  put(out.roofTop, "roofTop");
  put(out.fascia, "fascia");
  put(out.glassDark, "glassDark");
  put(out.glassLit, "glassLit");
  put(out.trim, "trim");
  put(out.door, "door");
  put(out.garage, "garage");
  put(out.groove, "groove");
  put(out.emblem, "emblem");
  if (shingles) out.roof.push(shingles.applyMatrix4(m));
}

/** With a floor, a door stands on the floor in front of it. */
export function buildingGeometries(building: BuildingShape, floor: SiteFloor | null = null): BuildingGeometries {
  const out = emptyGeometries();
  building.parts.forEach((part, index) => {
    const id = `${building.id}:${index}`;
    if (part.shape === "rect") buildRect(out, id, part, floor);
    else buildPoly(out, part);
  });
  return out;
}
