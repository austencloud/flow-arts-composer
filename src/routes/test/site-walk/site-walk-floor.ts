/**
 * The one place that knows how high the floor is.
 *
 * The plan has no heights and never gets any: they come from the surroundings
 * file, which raises plan things by id (a platform, each stair tread) and may
 * carry a grid of the lawn's own heights. `siteFloor` reads both against the
 * plan and answers every height question the walk asks: the walker's floor,
 * where guests stand, what railings and fences stand on, and the meshes.
 *
 * With no surroundings file, or one without heights, the floor is flat at 0
 * everywhere, as it always was. A raised entry or a railing whose plan thing
 * is missing is listed in `notDrawn`, never thrown.
 */

import { distanceToPolyline, insidePolygon } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";
import type { GroundGrid, RailingShape, SiteSurroundings } from "./site-walk-around";
import { type PlanThings, type Pt, type SiteWalkWorld } from "./site-walk-plan";

/** Sizes the floor uses, metres. */
export const FLOOR_SIZES = {
  /** How far round a post or a door the floor is looked for, so one on a platform's edge stands on the platform. */
  edgeReach: 0.3,
  /** How far a guest keeps from a raised edge, top or foot: half a body and a little room. */
  guestEdgeClear: 0.35,
} as const;

export interface RaisedArea {
  id: string;
  points: Pt[];
  /** Top above the flat ground, metres. */
  height: number;
  guests: boolean;
}

export interface SiteFloor {
  raised: RaisedArea[];
  grid: GroundGrid | null;
  /** The lawn under a point: the grid's height, or 0 off the grid. Raised areas are not in it. */
  groundAt(p: Pt): number;
  /** The floor at a point: the top of a raised area covering it, else the ground. */
  heightAt(p: Pt): number;
  raisedAt(p: Pt): RaisedArea | null;
  /** The highest floor within `reach` of a point. */
  highestNear(p: Pt, reach?: number): number;
  /** How far a point is from the nearest raised area's outline, metres; Infinity with none. */
  edgeDistance(p: Pt): number;
  /** Plan things the surroundings stand up themselves, so the plan's own drawing and collider of them are left out. */
  hidden: PlanThings;
  /** The surroundings' railings with every `of` looked up into a line; a railing whose plan thing is missing is left out. */
  railings: RailingShape[];
  /** Entries whose plan thing is missing, once each. */
  notDrawn: string[];
}

/** Height from a grid by bilinear blending; 0 off the grid. */
export function gridHeight(grid: GroundGrid, p: Pt): number {
  const rows = grid.rows.length;
  const cols = grid.rows[0]!.length;
  const u = (p.x - grid.origin.x) / grid.spacing;
  const v = (p.z - grid.origin.z) / grid.spacing;
  // A hair of rounding at the far edge still counts as on the grid.
  const EDGE = 1e-6;
  if (!(u >= -EDGE && v >= -EDGE && u <= cols - 1 + EDGE && v <= rows - 1 + EDGE)) return 0;
  const c = Math.max(0, Math.min(cols - 2, Math.floor(u)));
  const r = Math.max(0, Math.min(rows - 2, Math.floor(v)));
  const fu = u - c;
  const fv = v - r;
  const a = grid.rows[r]![c]!;
  const b = grid.rows[r]![c + 1]!;
  const d = grid.rows[r + 1]![c]!;
  const e = grid.rows[r + 1]![c + 1]!;
  return (a * (1 - fu) + b * fu) * (1 - fv) + (d * (1 - fu) + e * fu) * fv;
}

/** A box's long middle line, end to end. */
function boxLine(corners: readonly [Pt, Pt, Pt, Pt], w: number, d: number): Pt[] {
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 });
  const [nw, ne, se, sw] = corners;
  return w >= d ? [mid(nw, sw), mid(ne, se)] : [mid(nw, ne), mid(sw, se)];
}

export function siteFloor(world: SiteWalkWorld, around: SiteSurroundings | null | undefined): SiteFloor {
  const notDrawn: string[] = [];
  const miss = (name: string) => {
    if (!notDrawn.includes(name)) notDrawn.push(name);
  };
  const hidden = {
    fences: new Set<number>(),
    patios: new Set<number>(),
    buildings: new Set<number>(),
    boxes: new Set<number>(),
  };

  const raised: RaisedArea[] = [];
  for (const [n, spec] of (around?.raised ?? []).entries()) {
    if (!spec.of) {
      if (spec.points) raised.push({ id: `raised-${n + 1}`, points: spec.points, height: spec.height, guests: spec.guests });
      continue;
    }
    const index = world.ids.patios.indexOf(spec.of);
    if (index < 0) {
      miss(`raised: ${spec.of}`);
      continue;
    }
    hidden.patios.add(index);
    raised.push({ id: spec.of, points: world.patios[index]!, height: spec.height, guests: spec.guests });
  }

  const railings: RailingShape[] = [];
  for (const railing of around?.railings ?? []) {
    if (!railing.of) {
      railings.push(railing);
      continue;
    }
    const fence = world.ids.fences.indexOf(railing.of);
    const box = world.ids.boxes.indexOf(railing.of);
    if (fence >= 0) {
      hidden.fences.add(fence);
      railings.push({ ...railing, points: world.fences[fence]! });
    } else if (box >= 0) {
      hidden.boxes.add(box);
      const rect = world.boxes[box]!;
      railings.push({ ...railing, points: boxLine(rect.corners, rect.w, rect.d) });
    } else miss(`railing: ${railing.of}`);
  }

  for (const building of around?.buildings ?? []) {
    if (!building.of) continue;
    const index = world.ids.buildings.indexOf(building.of);
    if (index < 0) miss(`building: ${building.of}`);
    else hidden.buildings.add(index);
  }

  const grid = around?.groundHeights ?? null;
  const groundAt = (p: Pt): number => (grid ? gridHeight(grid, p) : 0);
  const raisedAt = (p: Pt): RaisedArea | null => {
    let best: RaisedArea | null = null;
    for (const area of raised) if (insidePolygon(p, area.points) && (!best || area.height > best.height)) best = area;
    return best;
  };
  const heightAt = (p: Pt): number => raisedAt(p)?.height ?? groundAt(p);
  const highestNear = (p: Pt, reach: number = FLOOR_SIZES.edgeReach): number => {
    let best = heightAt(p);
    for (const share of [0.5, 1]) {
      for (let k = 0; k < 8; k++) {
        const angle = (k / 8) * Math.PI * 2;
        best = Math.max(best, heightAt({ x: p.x + Math.cos(angle) * reach * share, z: p.z + Math.sin(angle) * reach * share }));
      }
    }
    return best;
  };
  const edgeDistance = (p: Pt): number => {
    let best = Infinity;
    for (const area of raised) best = Math.min(best, distanceToPolyline(p, [...area.points, area.points[0]!]));
    return best;
  };

  return { raised, grid, groundAt, heightAt, raisedAt, highestNear, edgeDistance, hidden, railings, notDrawn };
}

/** Where a guest may stand: not on a tread or anything else that holds none, and not hard against a raised edge. */
export function guestMayStand(floor: SiteFloor, p: Pt): boolean {
  const on = floor.raisedAt(p);
  if (on && !on.guests) return false;
  return floor.edgeDistance(p) >= FLOOR_SIZES.guestEdgeClear;
}

// ------------------------------------------------------------------ along a line

/**
 * What a fence or railing along `line` stands on: the floor at each post
 * (`spacing` apart per stretch, as the iron posts are), and between posts a
 * straight run from one to the next, so its rails slope down a stair.
 * `at` answers for any point near the line; each stretch's `low` is the
 * lowest ground or base under it and `high` its highest base, for colliders
 * that leave no gap underneath.
 */
export function floorAlong(floor: SiteFloor, line: readonly Pt[], spacing: number): { at(p: Pt): number; stretches: { low: number; high: number }[] } {
  const stops: { s: number; base: number }[] = [];
  const starts: number[] = [];
  const stretches: { low: number; high: number }[] = [];
  let s0 = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i]!;
    const b = line[i + 1]!;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    starts.push(s0);
    const bays = Math.max(1, Math.round(length / spacing));
    let low = Infinity;
    let high = -Infinity;
    for (let k = 0; k <= bays; k++) {
      const t = k / bays;
      const p = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const base = floor.highestNear(p);
      low = Math.min(low, base, floor.groundAt(p));
      high = Math.max(high, base);
      if (k > 0 || i === 0) stops.push({ s: s0 + length * t, base });
    }
    stretches.push({ low, high });
    s0 += length;
  }
  const flatLine = stops.every((stop) => stop.base === 0);
  const at = (p: Pt): number => {
    if (flatLine || stops.length === 0) return 0;
    // The nearest stretch, and how far along the whole line the point sits.
    let best = { d: Infinity, s: 0 };
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
      const d = Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z);
      if (d < best.d) best = { d, s: starts[i]! + Math.sqrt(len2) * t };
    }
    const s = best.s;
    if (s <= stops[0]!.s) return stops[0]!.base;
    for (let k = 0; k + 1 < stops.length; k++) {
      const a = stops[k]!;
      const b = stops[k + 1]!;
      if (s <= b.s) return b.s - a.s < 1e-9 ? b.base : a.base + ((b.base - a.base) * (s - a.s)) / (b.s - a.s);
    }
    return stops[stops.length - 1]!.base;
  };
  return { at, stretches };
}

/** How tall a thing standing on the floor reaches, for colliders: from its lowest base to its highest top. */
export function standingSpan(low: number, high: number, height: number): { y: number; h: number } {
  return { y: (low + high + height) / 2, h: high + height - low };
}

