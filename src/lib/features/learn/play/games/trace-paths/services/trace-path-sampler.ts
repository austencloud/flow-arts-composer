/**
 * Trace Path Sampler — the ONE place trace-game geometry comes from.
 *
 * The trace game asks a player to drag a fingertip along the same route the
 * hand-path renderer already draws. If the evaluator re-derived that curve from
 * scratch we would end up grading people against a second, subtly different
 * interpretation of the grid — the line on screen and the line being scored
 * would drift apart and nobody would be able to tell why a "perfect" trace
 * scored 80%. So this module delegates to the renderer's own geometry
 * (`getPathPoints`) and only changes the coordinate space.
 *
 * Two deliberate choices worth understanding before you edit anything here:
 *
 * 1. We ALWAYS pass `overridePathType` explicitly. Without it `getPathPoints`
 *    asks `getAnimationVisibilityManager()` — a browser singleton holding the
 *    user's display preference — which hand-path shape to draw. That makes the
 *    function impure, unusable in a plain node test, and (worse) it would mean
 *    a player who flips a *display* preference silently changes the route they
 *    are being graded against. The expected route must not move when a display
 *    toggle moves, so the game pins the shape from geometry alone: opposite
 *    points are a dash (straight through center), everything else is the arc
 *    around the grid circle. "concave" (the petal path) is never used for
 *    grading — it dips toward center and would put the route where a finger
 *    cannot reasonably follow it on a small stage.
 *
 * 2. Everything leaves here in a normalized 0..1 stage space. Tolerances in
 *    this feature are stage-relative, so a phone and a 4K monitor score the
 *    same trace identically.
 */

import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  getPathPoints,
  isOpposite,
} from "#lib/features/hand-paths/hand-path-builder/services/hand-path-animator.js";
import type { NormalizedPoint } from "../domain/trace-types";
import { TRACE_PATH_SAMPLE_COUNT } from "../domain/trace-config";

/**
 * The pictograph scene is a 950x950 square (center 475,475). Every renderer in
 * the codebase works in these units; we divide by this to normalize.
 */
export const STAGE_UNITS = 950;

/**
 * How finely a single beat's route is sampled before normalization.
 *
 * Segments, not points — `TRACE_PATH_SAMPLE_COUNT` is the point count the
 * tolerances file asks for, and a polyline of N points has N-1 segments. Left
 * derived rather than copied so the density stays tunable in one place.
 */
export const DEFAULT_PATH_SEGMENTS = TRACE_PATH_SAMPLE_COUNT - 1;

/**
 * Which curve the game grades a segment against, decided purely from the two
 * grid locations. See the note at the top of this file for why this is not
 * allowed to consult the user's animation path-shape preference.
 */
export function pathTypeForSegment(
  from: GridLocation,
  to: GridLocation
): "arc" | "linear" {
  // Diametrically opposite points are a dash: the hand cuts straight through
  // the middle rather than travelling the long way around the circle.
  return isOpposite(from, to) ? "linear" : "arc";
}

/**
 * The canonical route for one beat of one hand, in normalized stage space.
 *
 * Returns `segments + 1` points (both endpoints included). A same-point
 * segment (a hold) collapses to that many copies of a single point, which is
 * the honest answer — there is no route to follow, only a place to stay.
 */
export function sampleSegmentPath(
  from: GridLocation,
  to: GridLocation,
  segments: number = DEFAULT_PATH_SEGMENTS
): NormalizedPoint[] {
  const raw = getPathPoints(from, to, segments, pathTypeForSegment(from, to));
  return raw.map((p) => ({ x: p.x / STAGE_UNITS, y: p.y / STAGE_UNITS }));
}

/**
 * Uniformly resample a polyline by arc length.
 *
 * This is what makes a 30 Hz trace and a 120 Hz trace comparable: raw pointer
 * events arrive at whatever rate the device feels like, so comparing them
 * point-for-point would score the same gesture differently on different
 * hardware. Resampling both to a fixed count of evenly-spaced points removes
 * the device from the equation.
 *
 * A zero-length input (a hold, or a finger that never moved) yields `count`
 * copies of the single point rather than dividing by zero.
 */
export function arcLengthResample(
  points: readonly NormalizedPoint[],
  count: number
): NormalizedPoint[] {
  if (count <= 0) return [];
  if (points.length === 0) return [];

  const first = points[0]!;
  if (points.length === 1 || count === 1) {
    return Array.from({ length: count }, () => ({ x: first.x, y: first.y }));
  }

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cumulative[cumulative.length - 1]!;

  if (total === 0) {
    return Array.from({ length: count }, () => ({ x: first.x, y: first.y }));
  }

  const out: NormalizedPoint[] = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const target = (total * i) / (count - 1);
    while (cursor < cumulative.length - 2 && cumulative[cursor + 1]! < target) {
      cursor++;
    }
    const segStart = cumulative[cursor]!;
    const segEnd = cumulative[cursor + 1]!;
    const segLength = segEnd - segStart;
    const t = segLength === 0 ? 0 : (target - segStart) / segLength;
    const a = points[cursor]!;
    const b = points[cursor + 1]!;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  return out;
}

/**
 * Cut a polyline short at `progress` (0..1 by arc length), interpolating the
 * final point rather than snapping to the nearest vertex.
 *
 * Shape accuracy is judged against the part of the route the player actually
 * covered — how MUCH of the route they covered is coverage's job, and grading
 * it twice would punish the same mistake in two places. Without this, the
 * accuracy score would silently depend on where the arrival tolerance happened
 * to trip, which moves with the device's event rate.
 */
export function truncatePolyline(
  points: readonly NormalizedPoint[],
  progress: number
): NormalizedPoint[] {
  if (points.length < 2) return [...points];
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped >= 1) return [...points];

  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = cumulative[cumulative.length - 1]!;
  if (total === 0) return [points[0]!, points[0]!];

  const target = total * clamped;
  const out: NormalizedPoint[] = [points[0]!];
  for (let i = 1; i < points.length; i++) {
    if (cumulative[i]! <= target) {
      out.push(points[i]!);
      continue;
    }
    const segStart = cumulative[i - 1]!;
    const segLength = cumulative[i]! - segStart;
    const t = segLength === 0 ? 0 : (target - segStart) / segLength;
    const a = points[i - 1]!;
    const b = points[i]!;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    break;
  }
  return out;
}

/**
 * Total arc length of a polyline, in normalized stage units.
 */
export function polylineLength(points: readonly NormalizedPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** The rectangle a pointer event was measured against. */
export interface StageRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Convert a raw client-space pointer coordinate into normalized stage space.
 *
 * The stage renders the 950x950 scene with `preserveAspectRatio="xMidYMid
 * meet"`, so on a non-square element the scene is letterboxed. We undo that
 * here — otherwise a wide stage would stretch the route horizontally and every
 * tolerance would be wrong on one axis. Keeping this in the sampler means the
 * pointer layer never has to reinvent it, and the evaluator only ever sees
 * clean 0..1 coordinates.
 */
export function normalizeStagePoint(
  clientX: number,
  clientY: number,
  rect: StageRect
): NormalizedPoint {
  const side = Math.min(rect.width, rect.height);
  if (side <= 0) return { x: 0, y: 0 };
  const insetX = rect.left + (rect.width - side) / 2;
  const insetY = rect.top + (rect.height - side) / 2;
  return { x: (clientX - insetX) / side, y: (clientY - insetY) / side };
}
