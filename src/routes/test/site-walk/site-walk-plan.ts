/**
 * A gig's flat site plan, read into things standing in the world.
 *
 * The plan is a JSON sheet in feet: x grows to the right, y grows down the
 * page. This module turns it into world-space shapes in metres (world x = plan
 * x, world z = plan y, y up) and answers the questions the walk needs: where
 * the canopy's walls are and which one faces the stage, where each "Stand"
 * button puts you, where the guests stand, and what stops you. It reads no
 * DOM and builds no three.js objects, so the tests cover all of it; the
 * builder in `site-walk-meshes.ts` only turns these shapes into meshes.
 *
 * The plan format is owned by whoever writes the sheet. Anything this file
 * does not know how to stand up is listed in `notDrawn` by kind, never thrown.
 */

import { distanceToPolyline, insidePolygon, type JamPoint } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";

/** Plan units are feet; the world is metres. Converted once, here. */
export const FEET_TO_METRES = 0.3048;
const ft = (feet: number) => feet * FEET_TO_METRES;

/** A point on the ground: world x and z, metres. */
export type Pt = JamPoint;

/**
 * Every guessed size in one place, in metres. The plan carries none of these:
 * its own `width` on a street is a drawing width, and heights are not drawn.
 */
export const SITE_SIZES = {
  streetWidth: ft(24),
  fenceHeight: ft(6),
  fencePostSpacing: ft(8),
  ropeHeight: ft(3),
  ropePostSpacing: ft(10),
  wiresHeight: ft(25),
  poleHeight: ft(30),
  eaveHeight: ft(7),
  roofRise: ft(3),
  bannerWidth: ft(8),
  bannerHeight: ft(4),
  /** Height of the banner panel's middle above the ground. */
  bannerCentreHeight: 1.2,
  buildingHeight: ft(12),
  boxHeight: ft(3),
  doorSize: ft(3),
  candleHeight: ft(1),
  safetySize: ft(2.5),
  /** How far outside the stage-facing wall "At the canopy" puts you. */
  canopyStandDistance: 1.5,
  /** Thickness of a fence or wall for walking into. */
  colliderThickness: 0.12,
  /** The most the body steps up on its own: low enough that a crate or the safety station is a wall. */
  walkStepHeight: 0.2,
  guestSpacing: 0.8,
} as const;

export type CanopySide = "n" | "e" | "s" | "w";

export interface CanopyWall {
  side: CanopySide;
  /** The wall's two ends on the ground, after the turn. */
  a: Pt;
  b: Pt;
  /** Unit vector pointing out of the canopy. */
  normal: Pt;
  open: boolean;
}

export interface CanopyShape {
  centre: Pt;
  /** Width and depth in metres, before turning. */
  w: number;
  d: number;
  /** Turn in radians, clockwise on the plan. */
  turn: number;
  /** nw, ne, se, sw before turning, placed after it. */
  corners: [Pt, Pt, Pt, Pt];
  /** n, e, s, w, in that order. */
  walls: CanopyWall[];
  /** The closed wall that carries the banner, or null when none is closed. */
  bannerSide: CanopySide | null;
}

export interface RectShape {
  centre: Pt;
  w: number;
  d: number;
  turn: number;
  corners: [Pt, Pt, Pt, Pt];
}

export interface StreetShape {
  /** Triangles and quads (3 or 4 corners) that together make the asphalt. */
  quads: Pt[][];
}

/** Where a Stand button puts you: a spot, and the direction to look in. */
export interface Stand {
  x: number;
  z: number;
  /** Camera yaw: forward is (sin yaw, cos yaw) in (x, z). */
  yaw: number;
}

export interface SiteWalkWorld {
  title: string;
  lot: Pt[] | null;
  lotCentre: Pt | null;
  streets: StreetShape[];
  fences: Pt[][];
  patios: Pt[][];
  guestArea: Pt[] | null;
  stage: Pt[] | null;
  perimeters: Pt[][];
  canopies: CanopyShape[];
  safeties: Pt[];
  poles: Pt[];
  wires: Pt[][];
  buildings: Pt[][];
  boxes: RectShape[];
  doors: Pt[];
  candles: Pt[];
  /** Kinds that were skipped, once each, in the order first met. */
  notDrawn: string[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  stands: {
    start: Stand;
    guests: Stand | null;
    stage: Stand | null;
    canopy: Stand | null;
  };
}

export type SitePlanRead = { ok: true; world: SiteWalkWorld } | { ok: false; message: string };

const NOT_A_PLAN = "That file is not a site plan.";

// ------------------------------------------------------------------ geometry

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function readPoint(v: unknown): Pt | null {
  if (!Array.isArray(v) || v.length < 2 || !finite(v[0]) || !finite(v[1])) return null;
  return { x: ft(v[0]), z: ft(v[1]) };
}

export function readPoints(v: unknown, min: number): Pt[] | null {
  if (!Array.isArray(v) || v.length < min) return null;
  const out: Pt[] = [];
  for (const p of v) {
    const pt = readPoint(p);
    if (!pt) return null;
    out.push(pt);
  }
  return out;
}

function readRect(thing: Record<string, unknown>): RectShape | null {
  const centre = readPoint(thing.at);
  const w = thing.w;
  const d = thing.d;
  if (!centre || !finite(w) || !finite(d) || w <= 0 || d <= 0) return null;
  const turn = finite(thing.turn) ? (thing.turn * Math.PI) / 180 : 0;
  const wm = ft(w);
  const dm = ft(d);
  return {
    centre,
    w: wm,
    d: dm,
    turn,
    corners: rectCorners(centre, wm, dm, turn),
  };
}

/** A local offset turned clockwise on the plan (x toward y), then moved to the centre. */
export function turned(centre: Pt, local: Pt, turn: number): Pt {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  return {
    x: centre.x + local.x * c - local.z * s,
    z: centre.z + local.x * s + local.z * c,
  };
}

export function rectCorners(centre: Pt, w: number, d: number, turn: number): [Pt, Pt, Pt, Pt] {
  const hw = w / 2;
  const hd = d / 2;
  return [
    turned(centre, { x: -hw, z: -hd }, turn),
    turned(centre, { x: hw, z: -hd }, turn),
    turned(centre, { x: hw, z: hd }, turn),
    turned(centre, { x: -hw, z: hd }, turn),
  ];
}

export function centroidOf(poly: readonly Pt[]): Pt {
  let area = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    const cross = a.x * b.z - b.x * a.z;
    area += cross;
    cx += (a.x + b.x) * cross;
    cz += (a.z + b.z) * cross;
  }
  if (Math.abs(area) < 1e-9) {
    const n = poly.length || 1;
    return {
      x: poly.reduce((s, p) => s + p.x, 0) / n,
      z: poly.reduce((s, p) => s + p.z, 0) / n,
    };
  }
  return { x: cx / (3 * area), z: cz / (3 * area) };
}

/** The centroid when it lies inside the area, otherwise the nearest inside point to it. */
function interiorPoint(poly: readonly Pt[]): Pt {
  const c = centroidOf(poly);
  const ring = [...poly];
  if (insidePolygon(c, ring)) return c;
  const xs = poly.map((p) => p.x);
  const zs = poly.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  let best: Pt | null = null;
  let bestD = Infinity;
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    for (let j = 0; j <= steps; j++) {
      const p = {
        x: minX + ((maxX - minX) * i) / steps,
        z: minZ + ((maxZ - minZ) * j) / steps,
      };
      if (!insidePolygon(p, ring)) continue;
      const dist = Math.hypot(p.x - c.x, p.z - c.z);
      if (dist < bestD) {
        bestD = dist;
        best = p;
      }
    }
  }
  return best ?? c;
}

/** Camera yaw that looks from one point toward another: forward is (sin yaw, cos yaw). */
export function yawToward(from: Pt, to: Pt): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  return dx === 0 && dz === 0 ? 0 : Math.atan2(dx, dz);
}

/** The asphalt for one street line: a strip on the side away from the lot. */
function streetFor(line: readonly Pt[], lotCentre: Pt | null): StreetShape {
  const width = SITE_SIZES.streetWidth;
  const quads: Pt[][] = [];
  let previousNormal: Pt | null = null;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length < 1e-9) continue;
    const ux = (b.x - a.x) / length;
    const uz = (b.z - a.z) / length;
    let n: Pt = { x: -uz, z: ux };
    if (lotCentre) {
      // The lot's centroid sits on one side of the line; the road takes the other.
      const toLot = (lotCentre.x - a.x) * n.x + (lotCentre.z - a.z) * n.z;
      if (toLot > 0) n = { x: -n.x, z: -n.z };
    }
    quads.push([a, b, { x: b.x + n.x * width, z: b.z + n.z * width }, { x: a.x + n.x * width, z: a.z + n.z * width }]);
    if (previousNormal) {
      // Fill the wedge a bend leaves on its outer side.
      quads.push([
        a,
        {
          x: a.x + previousNormal.x * width,
          z: a.z + previousNormal.z * width,
        },
        { x: a.x + n.x * width, z: a.z + n.z * width },
      ]);
    }
    previousNormal = n;
  }
  return { quads };
}

const SIDES: CanopySide[] = ["n", "e", "s", "w"];
const SIDE_LOCAL_NORMAL: Record<CanopySide, Pt> = {
  n: { x: 0, z: -1 },
  e: { x: 1, z: 0 },
  s: { x: 0, z: 1 },
  w: { x: -1, z: 0 },
};

function canopyFor(rect: RectShape, openSide: CanopySide | null, target: Pt | null): CanopyShape {
  const [nw, ne, se, sw] = rect.corners;
  const ends: Record<CanopySide, [Pt, Pt]> = {
    n: [nw, ne],
    e: [ne, se],
    s: [se, sw],
    w: [sw, nw],
  };
  const walls: CanopyWall[] = SIDES.map((side) => {
    const local = SIDE_LOCAL_NORMAL[side];
    const c = Math.cos(rect.turn);
    const s = Math.sin(rect.turn);
    return {
      side,
      a: ends[side][0],
      b: ends[side][1],
      normal: { x: local.x * c - local.z * s, z: local.x * s + local.z * c },
      open: side === openSide,
    };
  });
  const closed = walls.filter((wall) => !wall.open);
  let banner: CanopyWall | undefined;
  if (target) {
    const dx = target.x - rect.centre.x;
    const dz = target.z - rect.centre.z;
    banner = closed.reduce<CanopyWall | undefined>(
      (best, wall) => (!best || wall.normal.x * dx + wall.normal.z * dz > best.normal.x * dx + best.normal.z * dz ? wall : best),
      undefined,
    );
  } else {
    banner = closed[0];
  }
  return {
    ...rect,
    corners: rect.corners,
    walls,
    bannerSide: banner?.side ?? null,
  };
}

// ------------------------------------------------------------------ reading

export function readSitePlanText(text: string): SitePlanRead {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, message: NOT_A_PLAN };
  }
  return readSitePlan(json);
}

export function readSitePlan(raw: unknown): SitePlanRead {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, message: NOT_A_PLAN };
  const plan = raw as Record<string, unknown>;
  if (!Array.isArray(plan.things)) return { ok: false, message: NOT_A_PLAN };

  const things = plan.things.filter((t): t is Record<string, unknown> => !!t && typeof t === "object" && !Array.isArray(t));
  const notDrawn: string[] = [];
  const skip = (kind: unknown) => {
    const name = typeof kind === "string" && kind ? kind : "unknown";
    if (!notDrawn.includes(name)) notDrawn.push(name);
  };

  const title = typeof plan.title === "string" && plan.title.trim() ? plan.title.trim().slice(0, 60) : "Site plan";

  let lot: Pt[] | null = null;
  let guestArea: Pt[] | null = null;
  let stage: Pt[] | null = null;
  const fences: Pt[][] = [];
  const patios: Pt[][] = [];
  const perimeters: Pt[][] = [];
  const safeties: Pt[] = [];
  const poles: Pt[] = [];
  const wires: Pt[][] = [];
  const buildings: Pt[][] = [];
  const boxes: RectShape[] = [];
  const doors: Pt[] = [];
  const candles: Pt[] = [];
  const streetLines: Pt[][] = [];
  const canopyRaw: { rect: RectShape; open: CanopySide | null }[] = [];

  for (const thing of things) {
    const kind = thing.kind;
    switch (kind) {
      case "lot": {
        const pts = readPoints(thing.points, 3);
        if (!pts) skip(kind);
        else lot ??= pts;
        break;
      }
      case "guests": {
        const pts = readPoints(thing.points, 3);
        if (!pts) skip(kind);
        else guestArea ??= pts;
        break;
      }
      case "stage": {
        const pts = readPoints(thing.points, 3);
        if (!pts) skip(kind);
        else stage ??= pts;
        break;
      }
      case "patio":
      case "building": {
        const pts = readPoints(thing.points, 3);
        if (!pts) skip(kind);
        else (kind === "patio" ? patios : buildings).push(pts);
        break;
      }
      case "fence":
      case "perimeter":
      case "wires":
      case "street": {
        const pts = readPoints(thing.points, 2);
        if (!pts) skip(kind);
        else if (kind === "fence") fences.push(pts);
        else if (kind === "perimeter") perimeters.push(pts);
        else if (kind === "wires") wires.push(pts);
        else streetLines.push(pts);
        break;
      }
      case "safety":
      case "pole":
      case "door":
      case "candles": {
        const pt = readPoint(thing.at);
        if (!pt) skip(kind);
        else (kind === "safety" ? safeties : kind === "pole" ? poles : kind === "door" ? doors : candles).push(pt);
        break;
      }
      case "canopy": {
        const rect = readRect(thing);
        if (!rect) skip(kind);
        else
          canopyRaw.push({
            rect,
            open: SIDES.includes(thing.openSide as CanopySide) ? (thing.openSide as CanopySide) : null,
          });
        break;
      }
      case "box": {
        const rect = readRect(thing);
        if (!rect) skip(kind);
        else boxes.push(rect);
        break;
      }
      default:
        skip(kind);
    }
  }

  const lotCentre = lot ? centroidOf(lot) : null;
  const stageCentre = stage ? centroidOf(stage) : null;
  const guestCentre = guestArea ? centroidOf(guestArea) : null;
  const canopyTarget = stageCentre ?? guestCentre ?? lotCentre;

  const streets = streetLines.map((line) => streetFor(line, lotCentre));
  const canopies = canopyRaw.map(({ rect, open }) => canopyFor(rect, open, canopyTarget));

  const all: Pt[] = [
    ...(lot ?? []),
    ...streets.flatMap((s) => s.quads.flat()),
    ...fences.flat(),
    ...patios.flat(),
    ...(guestArea ?? []),
    ...(stage ?? []),
    ...perimeters.flat(),
    ...canopies.flatMap((c) => c.corners),
    ...safeties,
    ...poles,
    ...wires.flat(),
    ...buildings.flat(),
    ...boxes.flatMap((b) => b.corners),
    ...doors,
    ...candles,
  ];
  const bounds = all.length
    ? {
        minX: Math.min(...all.map((p) => p.x)),
        maxX: Math.max(...all.map((p) => p.x)),
        minZ: Math.min(...all.map((p) => p.z)),
        maxZ: Math.max(...all.map((p) => p.z)),
      }
    : { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

  // The stands.
  const stageStand: Stand | null =
    stage && stageCentre
      ? {
          x: stageCentre.x,
          z: stageCentre.z,
          yaw: guestCentre || lotCentre ? yawToward(stageCentre, (guestCentre ?? lotCentre)!) : 0,
        }
      : null;

  const guestsStand: Stand | null = guestArea
    ? (() => {
        const p = interiorPoint(guestArea);
        return {
          x: p.x,
          z: p.z,
          yaw: stageCentre ? yawToward(p, stageCentre) : 0,
        };
      })()
    : null;

  const firstCanopy = canopies[0];
  const bannerWall = firstCanopy?.walls.find((wall) => wall.side === firstCanopy.bannerSide);
  const canopyStand: Stand | null =
    firstCanopy && bannerWall
      ? (() => {
          const mid = {
            x: (bannerWall.a.x + bannerWall.b.x) / 2,
            z: (bannerWall.a.z + bannerWall.b.z) / 2,
          };
          const spot = {
            x: mid.x + bannerWall.normal.x * SITE_SIZES.canopyStandDistance,
            z: mid.z + bannerWall.normal.z * SITE_SIZES.canopyStandDistance,
          };
          return {
            x: spot.x,
            z: spot.z,
            yaw: stageCentre ? yawToward(spot, stageCentre) : Math.atan2(bannerWall.normal.x, bannerWall.normal.z),
          };
        })()
      : null;

  const fallbackPoint = lotCentre ?? {
    x: (bounds.minX + bounds.maxX) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
  const start: Stand = guestsStand ?? {
    x: fallbackPoint.x,
    z: fallbackPoint.z,
    yaw: stageCentre ? yawToward(fallbackPoint, stageCentre) : 0,
  };

  return {
    ok: true,
    world: {
      title,
      lot,
      lotCentre,
      streets,
      fences,
      patios,
      guestArea,
      stage,
      perimeters,
      canopies,
      safeties,
      poles,
      wires,
      buildings,
      boxes,
      doors,
      candles,
      notDrawn,
      bounds,
      stands: {
        start,
        guests: guestsStand,
        stage: stageStand,
        canopy: canopyStand,
      },
    },
  };
}

// ------------------------------------------------------------------ guests

export interface GuestFigure {
  x: number;
  z: number;
  /** Camera-style yaw, which is also the figure's three.js rotation.y (0 faces +z). */
  yaw: number;
}

export interface GuestCrowd {
  figures: GuestFigure[];
  /** True when the area was too small to hold the asked-for number. */
  capped: boolean;
}

/** A small seeded generator: the same seed always gives the same crowd. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Standing guests: inside the area, never closer than the spacing, denser at
 * the front (nearest the stage) and thinner toward the back. A first pass
 * thins the back on purpose; if that leaves the crowd short, a second pass
 * fills the gaps evenly before the count is given up as capped.
 */
export function placeGuests(
  area: readonly Pt[],
  count: number,
  options: { seed: number; facing: Pt | null; minSpacing?: number },
): GuestCrowd {
  const spacing = options.minSpacing ?? SITE_SIZES.guestSpacing;
  const ring = [...area];
  const xs = area.map((p) => p.x);
  const zs = area.map((p) => p.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  const random = seededRandom(options.seed);

  const reference = options.facing;
  // Depth is how far back from the stage a spot is, along the line from the
  // stage to the middle of the area, so a wide area still thins front to back.
  const middle = centroidOf(area);
  const lineLength = reference ? Math.hypot(middle.x - reference.x, middle.z - reference.z) : 0;
  const dirX = reference && lineLength > 1e-9 ? (middle.x - reference.x) / lineLength : 0;
  const dirZ = reference && lineLength > 1e-9 ? (middle.z - reference.z) / lineLength : 0;
  const depthOf = (p: Pt) => (reference ? (p.x - reference.x) * dirX + (p.z - reference.z) * dirZ : 0);
  const depths = area.map(depthOf);
  const near = reference ? Math.min(...depths) : 0;
  const far = reference ? Math.max(...depths) : 0;
  const keepChance = (p: Pt): number => {
    if (!reference || far - near < 1e-6) return 1;
    const t = Math.min(1, Math.max(0, (depthOf(p) - near) / (far - near)));
    return 1 - 0.7 * t;
  };

  const placed: GuestFigure[] = [];
  const tryPlace = (thin: boolean): void => {
    const p = {
      x: minX + random() * (maxX - minX),
      z: minZ + random() * (maxZ - minZ),
    };
    if (!insidePolygon(p, ring)) return;
    if (thin && random() > keepChance(p)) return;
    for (const other of placed) if (Math.hypot(other.x - p.x, other.z - p.z) < spacing) return;
    placed.push({
      x: p.x,
      z: p.z,
      yaw: reference ? yawToward(p, reference) : 0,
    });
  };

  const firstPass = count * 60 + 2000;
  for (let i = 0; i < firstPass && placed.length < count; i++) tryPlace(true);
  const secondPass = count * 200 + 4000;
  for (let i = 0; i < secondPass && placed.length < count; i++) tryPlace(false);

  return { figures: placed, capped: placed.length < count };
}

// ------------------------------------------------------------------ performers

/** Fire performers keep this far from the stage edge, metres. */
export const PERFORMER_EDGE_CLEARANCE = 1.5;
/** And this far from each other. */
const PERFORMER_SPACING = 2.5;

/**
 * Where fire performers stand on the stage: spread along its long side, inside
 * it and never closer than 1.5 m to its edge or 2.5 m to each other, the same
 * spots for the same seed. A stage too small to hold them all gets fewer, and
 * one with no room inside the clearance gets none.
 */
export function placePerformers(stage: readonly Pt[], count: number, options: { seed: number }): Pt[] {
  if (stage.length < 3 || count < 1) return [];
  const ring = [...stage];
  const closed = [...stage, stage[0]!];

  // The long side sets the axis; flip it so it points toward +x.
  let axis = { x: 1, z: 0 };
  let longest = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    if (length > longest) {
      longest = length;
      axis = { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
    }
  }
  if (axis.x < 0 || (axis.x === 0 && axis.z < 0)) axis = { x: -axis.x, z: -axis.z };
  const across = { x: -axis.z, z: axis.x };
  const alongAxis = (p: Pt) => p.x * axis.x + p.z * axis.z;
  const side = (p: Pt) => p.x * across.x + p.z * across.z;

  // Every spot on a fine grid that is inside the stage and clear of its edge.
  const STEP = 0.25;
  const ts = ring.map(alongAxis);
  const us = ring.map(side);
  const usable: { p: Pt; t: number; u: number }[] = [];
  for (let t = Math.min(...ts); t <= Math.max(...ts); t += STEP) {
    for (let u = Math.min(...us); u <= Math.max(...us); u += STEP) {
      const p = { x: t * axis.x + u * across.x, z: t * axis.z + u * across.z };
      if (insidePolygon(p, ring) && distanceToPolyline(p, closed) >= PERFORMER_EDGE_CLEARANCE) usable.push({ p, t, u });
    }
  }
  if (!usable.length) return [];

  const tLow = Math.min(...usable.map((c) => c.t));
  const tHigh = Math.max(...usable.map((c) => c.t));
  const uMid = (Math.min(...usable.map((c) => c.u)) + Math.max(...usable.map((c) => c.u))) / 2;
  const uHalf = (Math.max(...usable.map((c) => c.u)) - Math.min(...usable.map((c) => c.u))) / 2;
  const random = seededRandom(options.seed);

  const chosen: { p: Pt; t: number }[] = [];
  for (let i = 0; i < count; i++) {
    const slot = (tHigh - tLow) / count;
    const targetT = tLow + (i + 0.5) * slot + (random() - 0.5) * slot * 0.5;
    const targetU = uMid + (random() - 0.5) * uHalf * 0.8;
    let best: { p: Pt; t: number } | null = null;
    let bestD = Infinity;
    for (const c of usable) {
      if (chosen.some((o) => Math.hypot(o.p.x - c.p.x, o.p.z - c.p.z) < PERFORMER_SPACING)) continue;
      const d = (c.t - targetT) ** 2 + (c.u - targetU) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { p: c.p, t: c.t };
      }
    }
    if (best) chosen.push(best);
  }
  return chosen.sort((a, b) => a.t - b.t).map((c) => c.p);
}

// ------------------------------------------------------------------ colliders

/** A standing box: centre, length along its run, height, thickness, turn about y. */
export interface BoxCollider {
  x: number;
  y: number;
  z: number;
  /** Length along the run. */
  w: number;
  h: number;
  /** Thickness. */
  t: number;
  /** three.js rotation.y that lays the box's x axis along the run. */
  rotationY: number;
}

export function wallBox(a: Pt, b: Pt, height: number): BoxCollider | null {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  if (length < 1e-6) return null;
  return {
    x: (a.x + b.x) / 2,
    y: height / 2,
    z: (a.z + b.z) / 2,
    w: length,
    h: height,
    t: SITE_SIZES.colliderThickness,
    rotationY: -Math.atan2(b.z - a.z, b.x - a.x),
  };
}

/** A square post standing at a point, `size` metres across. */
export function postBox(p: Pt, size: number, height: number): BoxCollider {
  return {
    x: p.x,
    y: height / 2,
    z: p.z,
    w: size,
    h: height,
    t: size,
    rotationY: 0,
  };
}

/** Points along a polyline, about `spacing` apart, always including both ends of every stretch. */
export function along(line: readonly Pt[], spacing: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / spacing));
    for (let s = i === 0 ? 0 : 1; s <= steps; s++)
      out.push({
        x: a.x + ((b.x - a.x) * s) / steps,
        z: a.z + ((b.z - a.z) * s) / steps,
      });
  }
  return out;
}

/**
 * What stops you: each fence stretch, each closed canopy wall, then the
 * canopy legs, the pole, the safety station, each building edge, each box and
 * the rope's posts. The rope itself is not here: you can duck it.
 */
export function siteColliders(world: SiteWalkWorld, options: { fenceHeight?: number } = {}): BoxCollider[] {
  const out: BoxCollider[] = [];
  const fenceHeight = options.fenceHeight ?? SITE_SIZES.fenceHeight;
  for (const line of world.fences) {
    for (let i = 0; i + 1 < line.length; i++) {
      const box = wallBox(line[i]!, line[i + 1]!, fenceHeight);
      if (box) out.push(box);
    }
  }
  for (const canopy of world.canopies) {
    for (const wall of canopy.walls) {
      if (wall.open) continue;
      const box = wallBox(wall.a, wall.b, SITE_SIZES.eaveHeight);
      if (box) out.push(box);
    }
  }
  for (const canopy of world.canopies) for (const corner of canopy.corners) out.push(postBox(corner, 0.1, SITE_SIZES.eaveHeight));
  for (const p of world.poles) out.push(postBox(p, 0.26, SITE_SIZES.poleHeight));
  for (const p of world.safeties) out.push(postBox(p, SITE_SIZES.safetySize, SITE_SIZES.safetySize));
  for (const ring of world.buildings) {
    for (let i = 0; i < ring.length; i++) {
      const box = wallBox(ring[i]!, ring[(i + 1) % ring.length]!, SITE_SIZES.buildingHeight);
      if (box) out.push(box);
    }
  }
  for (const rect of world.boxes) {
    out.push({
      x: rect.centre.x,
      y: SITE_SIZES.boxHeight / 2,
      z: rect.centre.z,
      w: rect.w,
      h: SITE_SIZES.boxHeight,
      t: rect.d,
      rotationY: -rect.turn,
    });
  }
  for (const line of world.perimeters)
    for (const p of along(line, SITE_SIZES.ropePostSpacing)) out.push(postBox(p, 0.07, SITE_SIZES.ropeHeight + 0.05));
  return out;
}
