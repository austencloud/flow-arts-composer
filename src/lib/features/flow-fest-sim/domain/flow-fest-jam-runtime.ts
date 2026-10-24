/**
 * The moving parts of "Dusk at Middle Earth", kept pure so they can be tested
 * and so the Unreal slice can port the same numbers.
 *
 * The layout module says where everything is; this one says how it moves:
 * the clock and the sun through the evening, the opening shot between its
 * keys, the performers' slow wander inside the rope, and the attention timers
 * behind the linger, notice and duet verbs. Nothing here touches rendering.
 */

import {
  distanceToPolyline,
  insidePolygon,
  type FlowFestJamLayout,
  type JamObstacle,
  type JamOutsideSpinner,
  type JamPerformer,
  type JamPoint,
  type JamShotKey,
} from "./flow-fest-jam-layout";

// ---------------------------------------------------------------------------
// Clock and sun

/** Sunset at Camden in mid-May, festival clock hours (20:50). */
const SUNSET_HOUR = 20 + 50 / 60;
/** The sun's apparent elevation at the moment its top edge leaves the horizon. */
const SUNSET_ELEVATION_DEGREES = -0.83;
/** Near sunset at 39.6 degrees north in May the sun drops about ten degrees an hour. */
const DEGREES_PER_HOUR = 10;

/**
 * Festival clock hour for a sun elevation in the evening. Linear around
 * sunset, which is close enough for the hour either side the slice covers.
 */
export function jamHourForSunElevation(elevationDegrees: number): number {
  return SUNSET_HOUR - (elevationDegrees - SUNSET_ELEVATION_DEGREES) / DEGREES_PER_HOUR;
}

/**
 * The evening sun elevation for a festival clock hour. The descent slows past
 * astronomical dusk so the deep night settles rather than diving below -18.
 */
export function jamSunElevationForHour(hour: number): number {
  const linear = SUNSET_ELEVATION_DEGREES - (hour - SUNSET_HOUR) * DEGREES_PER_HOUR;
  if (linear >= -12) return linear;
  return -12 - 6 * (1 - Math.exp(-(-12 - linear) / 6));
}

/** Where the night stands when the player is handed control. */
export const JAM_HANDOVER_SUN_ELEVATION_DEGREES = -7;
/** The night holds at 22:30, the layout's full jam. */
export const JAM_NIGHT_HOLD_HOUR = 22.5;
/** Real seconds the night takes to build from the hand-over to the hold. */
export const JAM_NIGHT_BUILD_SECONDS = 240;

/**
 * Festival hour a number of real seconds after the hand-over. Eases out of the
 * opening's pace and into the hold, so the change is felt rather than watched.
 */
export function jamHourAfterHandover(seconds: number): number {
  const start = jamHourForSunElevation(JAM_HANDOVER_SUN_ELEVATION_DEGREES);
  const t = Math.max(0, Math.min(1, seconds / JAM_NIGHT_BUILD_SECONDS));
  const eased = t * t * (3 - 2 * t);
  return start + (JAM_NIGHT_HOLD_HOUR - start) * eased;
}

// ---------------------------------------------------------------------------
// The opening shot

export interface JamShotSample {
  x: number;
  heightAboveGround: number;
  z: number;
  lookX: number;
  lookHeightAboveGround: number;
  lookZ: number;
  sunElevationDegrees: number;
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const SHOT_FIELDS = ["x", "heightAboveGround", "z", "lookX", "lookHeightAboveGround", "lookZ"] as const;

/**
 * The camera between the opening's keys: a Catmull-Rom curve through the
 * positions so the descent never kinks at a key, eased at both ends so it
 * starts from rest and lands at eye height without a bump. The sun moves
 * linearly in elevation between keys, as it does in the sky.
 */
export function sampleJamShot(keys: readonly JamShotKey[], seconds: number): JamShotSample {
  const first = keys[0]!;
  const last = keys[keys.length - 1]!;
  const duration = last.seconds - first.seconds;
  const clamped = Math.max(first.seconds, Math.min(last.seconds, seconds));
  // Ease the whole move in and out over its length, then find the segment.
  const u = duration > 0 ? (clamped - first.seconds) / duration : 1;
  const eased = u * u * (3 - 2 * u);
  const travel = first.seconds + eased * duration;
  let i = 0;
  while (i + 2 < keys.length && keys[i + 1]!.seconds <= travel) i++;
  const a = keys[i]!;
  const b = keys[i + 1] ?? a;
  const span = b.seconds - a.seconds;
  const t = span > 0 ? Math.max(0, Math.min(1, (travel - a.seconds) / span)) : 0;
  const before = keys[i - 1] ?? a;
  const after = keys[i + 2] ?? b;
  const out = {} as JamShotSample;
  for (const field of SHOT_FIELDS) out[field] = catmullRom(before[field], a[field], b[field], after[field], t);
  // The sun follows real time, not the eased camera.
  let j = 0;
  while (j + 2 < keys.length && keys[j + 1]!.seconds <= clamped) j++;
  const sa = keys[j]!;
  const sb = keys[j + 1] ?? sa;
  const sunSpan = sb.seconds - sa.seconds;
  const st = sunSpan > 0 ? Math.max(0, Math.min(1, (clamped - sa.seconds) / sunSpan)) : 0;
  out.sunElevationDegrees = sa.sunElevationDegrees + (sb.sunElevationDegrees - sa.sunElevationDegrees) * st;
  return out;
}

// ---------------------------------------------------------------------------
// Who is where as the night builds

/** Performers inside at this hour, lowest `order` first. */
export function jamPerformersInside(layout: Pick<FlowFestJamLayout, "performers" | "night">, inside: number): JamPerformer[] {
  const count = Math.round(Math.max(0, Math.min(1, inside)) * layout.performers.length);
  return [...layout.performers].sort((a, b) => a.order - b.order).slice(0, count);
}

/**
 * Which inside performers carry fire. Before the rope comes on everything is
 * unlit; after, fire finishes light in step-in order up to the frame cap and
 * the rest wait to dip, as at a real jam where the dip station has a queue.
 * `canBurn` leaves out performers whose prop has no fire model yet.
 */
export function jamFireIds(
  inside: readonly JamPerformer[],
  ropeGlow: number,
  maxFireAtOnce: number,
  canBurn: (performer: JamPerformer) => boolean = () => true
): Set<string> {
  const lit = new Set<string>();
  if (ropeGlow < 0.35) return lit;
  for (const performer of inside) {
    if (performer.finish !== "fire" || !canBurn(performer)) continue;
    if (lit.size >= maxFireAtOnce) break;
    lit.add(performer.id);
  }
  return lit;
}

/**
 * LED spinners out at the edge, by the same night curve as the circle: "a third
 * of the people are performing", inside and out together.
 */
export function jamOutsideSpinnersOut(layout: Pick<FlowFestJamLayout, "outsideSpinners">, inside: number): JamOutsideSpinner[] {
  const count = Math.round(Math.max(0, Math.min(1, inside)) * layout.outsideSpinners.length);
  return [...layout.outsideSpinners].sort((a, b) => a.order - b.order).slice(0, count);
}

/**
 * Where an outside spinner stands at time t: a slow drift around their spot,
 * never further than their `wanderRadius`, with their own periods so the edge
 * does not sway in unison. Facing follows their yaw with a small turn.
 */
export function jamOutsideSpot(spinner: JamOutsideSpinner, seconds: number): JamPoint & { yaw: number } {
  const [s0, s1, s2, s3] = spinner.seeds;
  const t = seconds;
  const r = spinner.wanderRadius;
  const ax = Math.sin(t * (0.021 + 0.02 * s0) + s1 * 6.283) * 0.7 + Math.sin(t * (0.047 + 0.02 * s2) + s3 * 6.283) * 0.3;
  const az = Math.cos(t * (0.019 + 0.02 * s1) + s2 * 6.283) * 0.7 + Math.cos(t * (0.043 + 0.02 * s3) + s0 * 6.283) * 0.3;
  const len = Math.hypot(ax, az);
  const k = len > 1 ? 1 / len : 1;
  return {
    x: spinner.x + ax * k * r,
    z: spinner.z + az * k * r,
    yaw: spinner.yaw + 0.35 * Math.sin(t * (0.05 + 0.03 * s3) + s0 * 6.283),
  };
}

/**
 * Which way an outside spinner faces: their layout yaw, turned if needed so
 * they face open grass rather than a canopy, the pavilion or a tent a few
 * metres off (an open canopy they stand under does not count). Sixteen headings are scored by how far a ray runs before it
 * meets an obstacle (up to 8 m), with a pull toward the layout yaw so the
 * circle-facing ones keep facing the circle. Layout yaw convention.
 */
export function jamOutsideOpenYaw(spinner: JamPoint & { yaw: number }, obstacles: readonly JamObstacle[]): number {
  const reach = 8;
  let best = spinner.yaw;
  let bestScore = -Infinity;
  for (let k = 0; k < 16; k++) {
    const yaw = spinner.yaw + ((k < 8 ? k : k - 16) * Math.PI) / 8;
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw);
    let free = reach;
    for (const o of obstacles) {
      // Ray against a circle: distance along the ray to the first touch.
      const ox = o.x - spinner.x;
      const oz = o.z - spinner.z;
      // Standing under an open canopy is not facing it.
      if (Math.hypot(ox, oz) < o.radius + 0.4) continue;
      const along = ox * dx + oz * dz;
      if (along <= 0) continue;
      const off2 = ox * ox + oz * oz - along * along;
      const r2 = (o.radius + 0.4) ** 2;
      if (off2 > r2) continue;
      free = Math.min(free, Math.max(0, along - Math.sqrt(r2 - off2)));
    }
    const score = free + 2.5 * Math.cos(yaw - spinner.yaw);
    if (score > bestScore) {
      bestScore = score;
      best = yaw;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// The wander

export interface JamWanderer {
  id: string;
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Seconds of walking so far; the sine anchors advance only while walking. */
  walkClock: number;
  /** Seconds left in the current walk or pause. */
  phaseLeft: number;
  paused: boolean;
  /** Walking speed for this performer, 0.2 to 0.5 m/s. */
  speed: number;
  /** Count of walk/pause phases so far, to vary the next one's length. */
  phases: number;
  seeds: [number, number, number, number];
  home: JamPoint;
  /** Set while a performer is pulled away from its own wander (the duet). */
  hold?: JamPoint | null;
  /** True from the flame until they reach their own spot: a straight walk in, no pauses. */
  approaching?: boolean;
}

export const JAM_WANDER = {
  minSpeed: 0.2,
  maxSpeed: 0.5,
  /** The walk from the lighting flame to their spot, m/s. */
  approachSpeed: 1.3,
  /** Within this of their spot the walk in is over. */
  arriveMeters: 0.6,
  repelMeters: 2.5,
  minPause: 10,
  maxPause: 40,
  minWalk: 8,
  maxWalk: 24,
  /** How far from the rope a performer is ever allowed to stand. */
  ropeMarginMeters: 1.2,
} as const;

function frac(x: number): number {
  return x - Math.floor(x);
}

/** A cheap repeatable 0..1 from a seed and a counter. */
function seededUnit(seed: number, n: number): number {
  return frac(Math.sin((seed * 91.7 + n * 12.9898) * 43.758) * 43758.5453);
}

export function createJamWanderer(performer: JamPerformer, at?: JamPoint): JamWanderer {
  const [s0, s1, s2, s3] = performer.seeds;
  const start = at ?? performer.start;
  return {
    id: performer.id,
    x: start.x,
    z: start.z,
    vx: 0,
    vz: 0,
    walkClock: s0 * 200,
    // Start some mid-pause and some mid-walk so the circle does not move in unison.
    phaseLeft: JAM_WANDER.minPause * (0.2 + s1),
    paused: s2 < 0.5,
    speed: JAM_WANDER.minSpeed + (JAM_WANDER.maxSpeed - JAM_WANDER.minSpeed) * s3,
    phases: 0,
    seeds: performer.seeds,
    home: performer.start,
  };
}

/** Seconds a performer stands at the lighting flame on the way in. */
export const JAM_LIGHT_UP_SECONDS = 4;

/**
 * A performer stepping inside after the dip: they start at the lighting flame,
 * stand at it to light, then walk straight to their own spot at an ordinary
 * walking pace without stopping, and only then start to drift.
 */
export function createJamEntrant(performer: JamPerformer, flame: JamPoint): JamWanderer {
  const w = createJamWanderer(performer, flame);
  w.paused = true;
  w.phaseLeft = JAM_LIGHT_UP_SECONDS;
  w.approaching = true;
  return w;
}

/** Furthest a performer's drift target ever gets from their spot on either axis, m. */
export const JAM_WANDER_REACH_METERS = 3.5;

/**
 * Where a wanderer is heading: its home plus two slow sine terms on each
 * axis, with periods and phases from its seeds. The amplitudes keep the
 * target within JAM_WANDER_REACH_METERS of home on each axis, so each
 * performer drifts round their own patch of the floor.
 */
export function jamWanderTarget(w: Pick<JamWanderer, "home" | "seeds" | "walkClock">): JamPoint {
  const [s0, s1, s2, s3] = w.seeds;
  const t = w.walkClock;
  const ax = 1.4 + 1.0 * s1;
  const az = 1.2 + 1.2 * s2;
  const x =
    w.home.x +
    ax * Math.sin(t * (0.021 + 0.017 * s0) + s1 * 6.283) +
    0.45 * ax * Math.sin(t * (0.047 + 0.03 * s2) + s3 * 6.283);
  const z =
    w.home.z +
    az * Math.sin(t * (0.019 + 0.015 * s3) + s0 * 6.283) +
    0.45 * az * Math.cos(t * (0.043 + 0.028 * s1) + s2 * 6.283);
  return { x, z };
}

/** Closest point on a closed polygon's edge to p. */
function nearestOnRing(p: JamPoint, ring: readonly JamPoint[]): JamPoint {
  let best = Infinity;
  let out = ring[0]!;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
    const q = { x: a.x + dx * t, z: a.z + dz * t };
    const d = Math.hypot(p.x - q.x, p.z - q.z);
    if (d < best) {
      best = d;
      out = q;
    }
  }
  return out;
}

export interface JamWanderContext {
  boundary: readonly JamPoint[];
  centre: JamPoint;
  /** Other bodies to keep clear of, such as the player while inside. */
  extraBodies?: readonly JamPoint[];
}

/**
 * Advance every wanderer by dt. Each steers toward its sine target at its own
 * speed while walking, stands still while paused, and is pushed off the rope
 * and off its neighbours inside 2.5 m. Nobody ever ends a step outside the
 * rope's margin: a step that would is pulled back toward the middle.
 */
export function stepJamWanderers(wanderers: JamWanderer[], dt: number, context: JamWanderContext): void {
  if (dt <= 0) return;
  const ring = context.boundary;
  const closed = [...ring, ring[0]!];
  for (const w of wanderers) {
    w.phaseLeft -= dt;
    let walkingIn = !!w.approaching && w.phaseLeft <= 0 && !w.hold;
    if (walkingIn && Math.hypot(w.home.x - w.x, w.home.z - w.z) <= JAM_WANDER.arriveMeters) {
      // Arrived: their drift starts with a pause, as anyone's does on reaching their spot.
      w.approaching = false;
      walkingIn = false;
      w.paused = true;
      w.phaseLeft = JAM_WANDER.minPause * (0.5 + w.seeds[2]);
    } else if (w.approaching) {
      // Lighting at the flame, then walking in: no walk/pause phases until they arrive.
    } else if (w.phaseLeft <= 0) {
      w.phases += 1;
      w.paused = !w.paused;
      const r = seededUnit(w.seeds[0] + w.seeds[3], w.phases);
      w.phaseLeft = w.paused
        ? JAM_WANDER.minPause + (JAM_WANDER.maxPause - JAM_WANDER.minPause) * r
        : JAM_WANDER.minWalk + (JAM_WANDER.maxWalk - JAM_WANDER.minWalk) * r;
    }

    let wantX = 0;
    let wantZ = 0;
    if (w.hold) {
      const dx = w.hold.x - w.x;
      const dz = w.hold.z - w.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.15) {
        const s = Math.min(JAM_WANDER.maxSpeed, d * 0.6);
        wantX = (dx / d) * s;
        wantZ = (dz / d) * s;
      }
    } else if (walkingIn) {
      const dx = w.home.x - w.x;
      const dz = w.home.z - w.z;
      const d = Math.hypot(dx, dz) || 1;
      // Ease the last metre so the arrival is a stop, not a collision.
      const s = JAM_WANDER.approachSpeed * Math.min(1, d + 0.35);
      wantX = (dx / d) * s;
      wantZ = (dz / d) * s;
    } else if (!w.paused) {
      w.walkClock += dt;
      const target = jamWanderTarget(w);
      const dx = target.x - w.x;
      const dz = target.z - w.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.3) {
        wantX = (dx / d) * w.speed;
        wantZ = (dz / d) * w.speed;
      }
    }

    // Keep 2.5 m from the rope while walking, and from each other always. Someone
    // standing still (lighting up at the flame, or pausing) stays put; the step
    // guard below still keeps them off the rope itself.
    let pushX = 0;
    let pushZ = 0;
    const ropeDistance = distanceToPolyline(w, closed);
    if (ropeDistance < JAM_WANDER.repelMeters && (!w.paused || w.hold) && !walkingIn) {
      const q = nearestOnRing(w, ring);
      const inside = insidePolygon(w, ring as JamPoint[]);
      let nx = w.x - q.x;
      let nz = w.z - q.z;
      const len = Math.hypot(nx, nz) || 1;
      nx /= len;
      nz /= len;
      if (!inside) {
        nx = -nx;
        nz = -nz;
      }
      const k = 1 - ropeDistance / JAM_WANDER.repelMeters;
      pushX += nx * k * 0.6;
      pushZ += nz * k * 0.6;
    }
    const others: JamPoint[] = [...wanderers.filter((o) => o !== w), ...(context.extraBodies ?? [])];
    for (const o of others) {
      const dx = w.x - o.x;
      const dz = w.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d >= JAM_WANDER.repelMeters || d < 1e-6) continue;
      const k = 1 - d / JAM_WANDER.repelMeters;
      // Someone walking in steps round people rather than being stopped by them.
      const strength = walkingIn ? 0.25 : 0.45;
      pushX += (dx / d) * k * strength;
      pushZ += (dz / d) * k * strength;
    }

    // Smooth the velocity so turns are walked, not snapped.
    const goalX = wantX + pushX;
    const goalZ = wantZ + pushZ;
    const blend = 1 - Math.exp(-dt * (walkingIn ? 3 : 1.6));
    w.vx += (goalX - w.vx) * blend;
    w.vz += (goalZ - w.vz) * blend;
    const cap = walkingIn ? JAM_WANDER.approachSpeed : JAM_WANDER.maxSpeed;
    const speed = Math.hypot(w.vx, w.vz);
    if (speed > cap) {
      w.vx *= cap / speed;
      w.vz *= cap / speed;
    }

    let nx = w.x + w.vx * dt;
    let nz = w.z + w.vz * dt;
    const next = { x: nx, z: nz };
    if (!insidePolygon(next, ring as JamPoint[]) || distanceToPolyline(next, closed) < JAM_WANDER.ropeMarginMeters) {
      // Refuse the step and lean back toward the middle.
      const dx = context.centre.x - w.x;
      const dz = context.centre.z - w.z;
      const d = Math.hypot(dx, dz) || 1;
      nx = w.x + (dx / d) * JAM_WANDER.minSpeed * dt;
      nz = w.z + (dz / d) * JAM_WANDER.minSpeed * dt;
      w.vx = (dx / d) * JAM_WANDER.minSpeed;
      w.vz = (dz / d) * JAM_WANDER.minSpeed;
    }
    w.x = nx;
    w.z = nz;
  }
}

// ---------------------------------------------------------------------------
// Attention: linger, notice, duet

export interface JamAttentionState {
  /** Seconds of slow walking near the rope. */
  lingerSeconds: number;
  /** 0 to 1, eased; how far the camera has settled into the spectator framing. */
  linger: number;
  /** Seconds of unbroken flow inside the rope. */
  flowSeconds: number;
  /** 0 to 1, eased; how turned toward the player the watchers are. */
  notice: number;
  /** True once a performer should come over and mirror the player. */
  duet: boolean;
}

export function createJamAttention(): JamAttentionState {
  return { lingerSeconds: 0, linger: 0, flowSeconds: 0, notice: 0, duet: false };
}

export interface JamAttentionInput {
  /** Player ground speed, m/s. */
  speed: number;
  /** Distance from the player to the rope, m. */
  ropeDistance: number;
  insideRope: boolean;
  flowing: boolean;
  sitting: boolean;
}

function approach(value: number, target: number, rate: number, dt: number): number {
  return value + (target - value) * (1 - Math.exp(-rate * dt));
}

/**
 * One tick of the quiet verbs. Lingering counts up while the player walks
 * slowly near the rope (or sits there) and the framing eases in after the
 * settle time; it eases back out the moment they walk on. Flowing inside the
 * rope counts up toward notice and duet; stopping resets the count and the
 * watchers' attention drifts back over a few seconds, not in one cut.
 */
export function stepJamAttention(
  state: JamAttentionState,
  dt: number,
  input: JamAttentionInput,
  numbers: FlowFestJamLayout["interaction"],
): JamAttentionState {
  const near = input.ropeDistance <= numbers.lingerRadiusMeters;
  const slow = input.speed <= numbers.lingerSpeedMetersPerSecond;
  const lingering = !input.insideRope && near && (slow || input.sitting);
  const lingerSeconds = lingering ? state.lingerSeconds + dt : 0;
  const settled = lingerSeconds >= numbers.lingerSettleSeconds;
  const linger = approach(state.linger, settled ? 1 : 0, settled ? 0.7 : 1.8, dt);

  const flowingInside = input.flowing && input.insideRope;
  const flowSeconds = flowingInside ? state.flowSeconds + dt : 0;
  const noticed = flowSeconds >= numbers.noticeSeconds;
  const notice = approach(state.notice, noticed ? 1 : 0, noticed ? 0.9 : 0.35, dt);
  const duet = flowSeconds >= numbers.duetSeconds;

  return { lingerSeconds, linger, flowSeconds, notice, duet };
}

/**
 * Heading for a person who watches the circle but turns toward the player as
 * attention builds. `facingAngle` is the avatar convention: 0 faces +z and
 * the direction is (sin, cos).
 */
export function jamWatcherFacing(
  person: JamPoint,
  baseFacing: number,
  player: JamPoint | null,
  notice: number,
  radius: number,
): number {
  if (!player || notice <= 0.001) return baseFacing;
  const dx = player.x - person.x;
  const dz = player.z - person.z;
  const d = Math.hypot(dx, dz);
  if (d > radius || d < 0.5) return baseFacing;
  const toward = Math.atan2(dx, dz);
  let diff = toward - baseFacing;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  // Closer people turn further; nobody beyond the radius turns at all.
  const weight = notice * (1 - Math.max(0, d - radius * 0.6) / (radius * 0.4));
  return baseFacing + diff * Math.max(0, Math.min(1, weight));
}

/**
 * Which way a performer inside the rope faces. Walking in from the flame they
 * face where they are going; otherwise they face out toward the crowd, each a
 * little off straight-out by their own seed, turning slowly back and forth
 * over a minute or so. Avatar facing convention.
 */
export function jamSpinnerFacing(
  w: Pick<JamWanderer, "x" | "z" | "vx" | "vz" | "seeds" | "approaching">,
  centre: JamPoint,
  seconds: number,
): number {
  if (w.approaching && Math.hypot(w.vx, w.vz) > 0.3) return Math.atan2(w.vx, w.vz);
  const [s0, s1, , s3] = w.seeds;
  const out = Math.atan2(w.x - centre.x, w.z - centre.z);
  const lean = (s0 - 0.5) * 1.1;
  const sway = 0.55 * Math.sin(seconds * (0.05 + 0.04 * s3) + s1 * 6.283);
  return out + lean + sway;
}

/** Layout yaw (0 faces +x, turning toward +z) to the avatar facing convention. */
export function jamYawToFacing(yaw: number): number {
  return Math.PI / 2 - yaw;
}

/**
 * Where the duet partner stands: about 3 m from the player, on the side
 * toward the circle's middle so the pair reads from the edge.
 */
export function jamDuetSpot(player: JamPoint, centre: JamPoint, boundary: readonly JamPoint[]): JamPoint {
  const dx = centre.x - player.x;
  const dz = centre.z - player.z;
  const d = Math.hypot(dx, dz) || 1;
  const spot = { x: player.x + (dx / d) * 3, z: player.z + (dz / d) * 3 };
  if (insidePolygon(spot, boundary as JamPoint[])) return spot;
  return { x: player.x + (dx / d) * 1.5, z: player.z + (dz / d) * 1.5 };
}
