/**
 * Spreads fire splats along the path a tip travelled this frame. For a bare
 * chord (two points) the result equals the renderer's original sweep: the same
 * count from `ceil(length / stepUV)` and evenly spaced points from start to
 * end. With intermediate points the splats follow the polyline by arc length,
 * so a slow frame paints a curve instead of a straight streak.
 */

export interface SweepPoint {
  x: number;
  y: number;
}

/**
 * Writes the splat positions into `out` (reusing its objects) and returns the
 * count: `min(cap, max(1, ceil(length / stepUV)))`. A count of one places the
 * single splat at the end point, as the chord sweep did.
 */
export function sweepPolyline(
  points: readonly SweepPoint[],
  stepUV: number,
  cap: number,
  out: SweepPoint[]
): number {
  const last = points[points.length - 1];
  if (!last) return 0;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    length += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const count = Math.min(cap, Math.max(1, Math.ceil(length / stepUV)));
  if (count === 1 || length === 0) {
    write(out, 0, last.x, last.y);
    return 1;
  }
  let seg = 1;
  let segStart = 0;
  let segLen = Math.hypot(
    points[1]!.x - points[0]!.x,
    points[1]!.y - points[0]!.y
  );
  for (let s = 0; s < count; s++) {
    const d = (length * s) / (count - 1);
    while (seg < points.length - 1 && d > segStart + segLen) {
      segStart += segLen;
      seg++;
      segLen = Math.hypot(
        points[seg]!.x - points[seg - 1]!.x,
        points[seg]!.y - points[seg - 1]!.y
      );
    }
    const a = points[seg - 1]!;
    const b = points[seg]!;
    const t = segLen > 0 ? Math.min(1, (d - segStart) / segLen) : 1;
    write(out, s, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }
  return count;
}

function write(out: SweepPoint[], i: number, x: number, y: number): void {
  const p = out[i];
  if (p) {
    p.x = x;
    p.y = y;
  } else {
    out[i] = { x, y };
  }
}
