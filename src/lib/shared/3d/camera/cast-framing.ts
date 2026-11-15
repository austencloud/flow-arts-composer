// Pure cast-framing geometry shared by the viewer state and the orbit runtime.

export type Point3 = { x: number; y: number; z: number };

/** World-space box around everything the cast draws: bodies, hands and prop tips. */
export interface CastFrameBox {
  min: Point3;
  max: Point3;
}

export interface CastFrameMember {
  position: { x: number; z: number };
  /** Furthest a hand or prop tip reaches from the performer's grid center. */
  reach: number;
  /** Height of the performer's grid center (hands orbit around it). */
  centerY?: number;
}

/** A standing performer is at least this tall above the floor, props aside. */
const CAST_BODY_HEIGHT = 1.8;

export function castFrameBox(
  members: readonly CastFrameMember[],
  floorY: number
): CastFrameBox | null {
  if (members.length === 0) return null;
  const box: CastFrameBox = {
    min: { x: Infinity, y: floorY, z: Infinity },
    max: { x: -Infinity, y: floorY + CAST_BODY_HEIGHT, z: -Infinity },
  };
  for (const member of members) {
    const reach = Number.isFinite(member.reach) ? Math.max(0, member.reach) : 0;
    box.min.x = Math.min(box.min.x, member.position.x - reach);
    box.max.x = Math.max(box.max.x, member.position.x + reach);
    box.min.z = Math.min(box.min.z, member.position.z - reach);
    box.max.z = Math.max(box.max.z, member.position.z + reach);
    box.max.y = Math.max(box.max.y, (member.centerY ?? 0) + reach);
  }
  return box;
}

export function castFrameCenter(box: CastFrameBox): Point3 {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}

/**
 * The share of the view's height and width the cast box covers when seen from
 * `eye` looking at `target` through a pinhole camera. `inFront` is false when
 * any corner sits behind (or on) the lens, in which case the fills are
 * Infinity.
 */
export function projectedBoxFill(
  eye: Point3,
  target: Point3,
  box: CastFrameBox,
  fovDeg: number,
  aspect: number
): { height: number; width: number; inFront: boolean } {
  let fx = target.x - eye.x;
  let fy = target.y - eye.y;
  let fz = target.z - eye.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward x up(0,1,0); a straight-down view borrows +X as right.
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-6) {
    rx = 1;
    rz = 0;
  } else {
    rx /= rl;
    rz /= rl;
  }
  // up = right x forward
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const tanV = Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const tanH = tanV * Math.max(0.05, aspect);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y])
      for (const z of [box.min.z, box.max.z]) {
        const vx = x - eye.x;
        const vy = y - eye.y;
        const vz = z - eye.z;
        const depth = vx * fx + vy * fy + vz * fz;
        if (depth <= 0.05)
          return { height: Infinity, width: Infinity, inFront: false };
        const sx = (vx * rx + vz * rz) / (depth * tanH);
        const sy = (vx * ux + vy * uy + vz * uz) / (depth * tanV);
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
  // Measured from the view centre, so an aim point that is not the box centre
  // (the viewer aims a little above the feet) still keeps every corner inside.
  return {
    height: Math.max(maxY, -minY),
    width: Math.max(maxX, -minX),
    inFront: true,
  };
}

export interface CastFitOptions {
  fovDeg: number;
  aspect: number;
  /** Share of the view height the cast should fill. */
  heightFill?: number;
  /** Never let the cast run wider than this share of the view width. */
  maxWidthFill?: number;
  minDistance?: number;
  maxDistance?: number;
}

/** Opening and crew shots fill about 60 percent of the view height with the cast box (bodies plus prop reach), which leaves the drawn bodies near half. */
export const CAST_HEIGHT_FILL = 0.6;
export const CAST_MAX_WIDTH_FILL = 0.88;

/**
 * How far from `target`, along the unit-free `direction` (target to eye), the
 * camera must sit for the cast box to fill `heightFill` of the view height
 * while staying inside `maxWidthFill` of its width. A wide line on a portrait
 * phone is held by the width limit and fills less height.
 */
export function fitCastDistance(
  target: Point3,
  direction: Point3,
  box: CastFrameBox,
  options: CastFitOptions
): number {
  const heightFill = options.heightFill ?? CAST_HEIGHT_FILL;
  const maxWidthFill = options.maxWidthFill ?? CAST_MAX_WIDTH_FILL;
  const minDistance = options.minDistance ?? 1.5;
  const maxDistance = options.maxDistance ?? 24;
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < 1e-9) return maxDistance;
  const ux = direction.x / length;
  const uy = direction.y / length;
  const uz = direction.z / length;
  const fits = (distance: number): boolean => {
    const fill = projectedBoxFill(
      {
        x: target.x + ux * distance,
        y: target.y + uy * distance,
        z: target.z + uz * distance,
      },
      target,
      box,
      options.fovDeg,
      options.aspect
    );
    return (
      fill.inFront && fill.height <= heightFill && fill.width <= maxWidthFill
    );
  };
  if (fits(minDistance)) return minDistance;
  if (!fits(maxDistance)) return maxDistance;
  let near = minDistance;
  let far = maxDistance;
  for (let step = 0; step < 40; step++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  return far;
}

export function isPointNearCast(
  point: Point3,
  box: CastFrameBox,
  margin = 1.5
): boolean {
  return (
    point.x >= box.min.x - margin &&
    point.x <= box.max.x + margin &&
    point.y >= box.min.y - margin &&
    point.y <= box.max.y + margin &&
    point.z >= box.min.z - margin &&
    point.z <= box.max.z + margin
  );
}

/**
 * Where the performers stand: what a rotate should orbit. Prop reach is left
 * out on purpose; a pivot a staff's length beside a performer is already far
 * enough off to make the orbit feel wrong.
 */
export interface CastStanding {
  spots: readonly { x: number; z: number }[];
  floorY: number;
  /** Top of the tallest performer's head. */
  headY: number;
}

/** A pivot this close (horizontally) to a standing spot is on the performer. */
export const PIVOT_SPOT_RADIUS = 0.75;
/** A pivot may sit this far above the head and still count as on the cast. */
export const PIVOT_HEAD_CLEARANCE = 0.5;
/**
 * A slid pivot this close (horizontally) to the performer is left where the
 * view ray puts it: a pan, or a zoom onto a hand or prop, is the viewer's own
 * framing, and a rotate must not turn the picture back to the body.
 */
export const PIVOT_SLIDE_REACH = 2;

export function castStanding(
  spots: readonly { x: number; z: number }[],
  floorY: number,
  bodyHeight = CAST_BODY_HEIGHT
): CastStanding | null {
  if (spots.length === 0) return null;
  return { spots, floorY, headY: floorY + bodyHeight };
}

/**
 * True when an orbit pivot is on the cast: between the floor and just above
 * head height, and within PIVOT_SPOT_RADIUS of a lone performer's spot, or
 * inside a crew's box of spots padded by that radius.
 */
export function isPivotOnCast(point: Point3, cast: CastStanding): boolean {
  if (cast.spots.length === 0) return false;
  if (point.y < cast.floorY || point.y > cast.headY + PIVOT_HEAD_CLEARANCE)
    return false;
  if (cast.spots.length === 1) {
    const spot = cast.spots[0]!;
    return Math.hypot(point.x - spot.x, point.z - spot.z) <= PIVOT_SPOT_RADIUS;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const spot of cast.spots) {
    minX = Math.min(minX, spot.x);
    maxX = Math.max(maxX, spot.x);
    minZ = Math.min(minZ, spot.z);
    maxZ = Math.max(maxZ, spot.z);
  }
  return (
    point.x >= minX - PIVOT_SPOT_RADIUS &&
    point.x <= maxX + PIVOT_SPOT_RADIUS &&
    point.z >= minZ - PIVOT_SPOT_RADIUS &&
    point.z <= maxZ + PIVOT_SPOT_RADIUS
  );
}

export interface ViewFrustum {
  fovDeg: number;
  aspect: number;
}

/**
 * How far along the view ray (from `position` through `target`) the
 * performer nearest that ray stands, counting only performers in view. Each
 * performer is the upright segment from the floor to the head at their spot;
 * the depth is that of the segment point closest to the ray. Null when no
 * performer is in front of the camera and inside the view.
 */
export function castDepthAlongRay(
  position: Point3,
  target: Point3,
  cast: CastStanding,
  view: ViewFrustum
): number | null {
  return nearestPerformerOnRay(position, target, cast, view)?.depth ?? null;
}

/** The in-view performer nearest the view ray: their depth along it and the point on their body closest to it. */
function nearestPerformerOnRay(
  position: Point3,
  target: Point3,
  cast: CastStanding,
  view: ViewFrustum
): { depth: number; point: Point3 } | null {
  let fx = target.x - position.x;
  let fy = target.y - position.y;
  let fz = target.z - position.z;
  const fl = Math.hypot(fx, fy, fz);
  if (!(fl > 1e-9)) return null;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // Same camera basis as projectedBoxFill.
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-6) {
    rx = 1;
    rz = 0;
  } else {
    rx /= rl;
    rz /= rl;
  }
  const ux = -rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy;
  const tanV = Math.tan(((view.fovDeg / 2) * Math.PI) / 180);
  const tanH = tanV * Math.max(0.05, view.aspect);
  let best: { gap: number; depth: number; point: Point3 } | null = null;
  for (const spot of cast.spots) {
    // Closest point between the ray and the vertical line at the spot, with
    // the height held to the body (floor to head).
    const wx = position.x - spot.x;
    const wz = position.z - spot.z;
    // Lines P(t) = position + t f and Q(h) = (spot.x, h, spot.z).
    const a = 1;
    const b = fy;
    const d = fx * wx + fy * position.y + fz * wz; // f . (position - (spot,0))
    const e = position.y; // up . (position - (spot,0))
    const denom = a - b * b;
    let h =
      denom > 1e-9 ? (a * e - b * d) / denom : (cast.floorY + cast.headY) / 2;
    h = Math.min(cast.headY, Math.max(cast.floorY, h));
    const vx = spot.x - position.x;
    const vy = h - position.y;
    const vz = spot.z - position.z;
    const depth = vx * fx + vy * fy + vz * fz;
    if (depth <= 0.05) continue;
    const sx = (vx * rx + vz * rz) / (depth * tanH);
    const sy = (vx * ux + vy * uy + vz * uz) / (depth * tanV);
    if (Math.abs(sx) > 1 || Math.abs(sy) > 1) continue;
    const gap = Math.hypot(vx - fx * depth, vy - fy * depth, vz - fz * depth);
    if (!best || gap < best.gap)
      best = { gap, depth, point: { x: spot.x, y: h, z: spot.z } };
  }
  return best ? { depth: best.depth, point: best.point } : null;
}

export interface PivotSeat {
  position: Point3;
  target: Point3;
  /** False when the view does not change (a slide along the view ray). */
  animate: boolean;
}

/**
 * Put a rotate's pivot on the performers before the drag moves anything.
 * Null when the pivot is already on the cast (including a close look the
 * wheel stopped on). With a performer in view, the pivot slides along the
 * current view ray to that performer's depth (held inside the orbit range),
 * so the camera and picture stay put. When that slid point is further than
 * PIVOT_SLIDE_REACH from the performer (the ray passes wide of everyone, or
 * the performer is beyond the orbit range), the view turns smoothly onto the
 * performer nearest the ray at their real distance. With
 * nobody in view, the camera keeps its place and turns to the middle of the
 * cast.
 */
export function seatPivotOnCast(
  position: Point3,
  target: Point3,
  cast: CastStanding,
  options: ViewFrustum & { minDistance: number; maxDistance: number }
): PivotSeat | null {
  if (isPivotOnCast(target, cast)) return null;
  const nearest = nearestPerformerOnRay(position, target, cast, options);
  if (nearest) {
    const fx = target.x - position.x;
    const fy = target.y - position.y;
    const fz = target.z - position.z;
    const fl = Math.hypot(fx, fy, fz);
    const radius = Math.min(
      options.maxDistance,
      Math.max(options.minDistance, nearest.depth)
    );
    const slid = {
      x: position.x + (fx / fl) * radius,
      y: position.y + (fy / fl) * radius,
      z: position.z + (fz / fl) * radius,
    };
    const aside = Math.hypot(
      slid.x - nearest.point.x,
      slid.z - nearest.point.z
    );
    if (isPivotOnCast(slid, cast) || aside <= PIVOT_SLIDE_REACH) {
      return { position: { ...position }, target: slid, animate: false };
    }
    return orbitAround(position, nearest.point, options);
  }
  let cx = 0;
  let cz = 0;
  for (const spot of cast.spots) {
    cx += spot.x;
    cz += spot.z;
  }
  const center = {
    x: cx / cast.spots.length,
    y: cast.floorY + (cast.headY - cast.floorY) / 2,
    z: cz / cast.spots.length,
  };
  return orbitAround(position, center, options);
}

/** Turn to `center`, keeping the camera where it is unless the orbit range forces it closer or further. */
function orbitAround(
  position: Point3,
  center: Point3,
  options: { minDistance: number; maxDistance: number }
): PivotSeat {
  let ox = position.x - center.x;
  let oy = position.y - center.y;
  let oz = position.z - center.z;
  let offset = Math.hypot(ox, oy, oz);
  if (offset < 1e-9) {
    ox = 0;
    oy = 0.3;
    oz = 1;
    offset = Math.hypot(ox, oy, oz);
  }
  const distance = Math.min(
    options.maxDistance,
    Math.max(options.minDistance, offset)
  );
  return {
    position: {
      x: center.x + (ox / offset) * distance,
      y: center.y + (oy / offset) * distance,
      z: center.z + (oz / offset) * distance,
    },
    target: center,
    animate: true,
  };
}

/** The camera never sits closer than this above the cast's floor. */
export const CAMERA_FLOOR_CLEARANCE = 0.25;

/**
 * How far to lift the whole orbit rig (pivot and camera together, straight
 * up) so the pivot is at or above the floor and the camera at least
 * `clearance` above it. Zero when both already are. Wheel zoom-in toward a
 * point low in the picture drags the pivot down and forward, and the polar
 * clamp keeps the camera near pivot height, so without this the camera ends
 * at or under the floor.
 */
export function floorLift(
  pivotY: number,
  cameraY: number,
  floorY: number,
  clearance = CAMERA_FLOOR_CLEARANCE
): number {
  if (
    !Number.isFinite(pivotY) ||
    !Number.isFinite(cameraY) ||
    !Number.isFinite(floorY)
  )
    return 0;
  return Math.max(0, floorY - pivotY, floorY + clearance - cameraY);
}
