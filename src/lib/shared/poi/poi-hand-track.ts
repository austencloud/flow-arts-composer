import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { calculateMotionEndpoints } from "#lib/shared/animation-engine/services/endpoint-calculator.js";
import { lerpAngle } from "#lib/shared/animation-engine/services/angle-calculator.js";

/**
 * Where a hand has to go for its poi to follow one hand's beats. The poi head
 * follows the drawing; the hand is what gives. A string pulls only along
 * itself, so on every frame the hand sits one string length from the head,
 * in the direction of the pull the head needs (its acceleration less
 * gravity). Any smooth head path has such a hand, so every pattern can be
 * spun; what changes is how far the hand has to stray from the drawn one.
 *
 * Real hands round off a turnaround rather than reversing in an instant, so
 * both paths are smoothed over `turnaroundBeats`. A poi can't change speed in
 * an instant either, so the head's speed along its drawn path is eased over
 * `speedBlendBeats`. Beats still run at an even tempo, as the animation does.
 *
 * The Poi String lab reads the solve as a verdict (how far the hand strays);
 * the 3D performers read it as a track the string sim follows.
 */
export interface PoiStringOptions {
  /** Poi length, hand to head, in metres. */
  stringLength: number;
  /** Radius of the hand's circle, in metres. */
  handRadius: number;
  bpm: number;
  gravity: boolean;
  /** How long a hand takes to round off a sharp change, in beats. */
  turnaroundBeats: number;
  /** How long the poi head takes to change speed, in beats. */
  speedBlendBeats: number;
}

export const DEFAULT_POI_STRING_OPTIONS: PoiStringOptions = {
  stringLength: 0.6,
  handRadius: 0.6,
  bpm: 180,
  gravity: true,
  turnaroundBeats: 0.06,
  speedBlendBeats: 0.25,
};

export const POI_SAMPLES_PER_BEAT = 120;
export const GRAVITY = 9.81;

/**
 * One hand's solve as flat arrays, one entry per sample, in the plane's
 * canvas axes: y points down and gravity pulls toward +y.
 */
export interface PoiHandSolve {
  beats: number;
  /** Where the drawing puts the hand, smoothed. */
  drawnX: Float64Array;
  drawnY: Float64Array;
  /** Where the hand must be for the string to carry the head. */
  handX: Float64Array;
  handY: Float64Array;
  /** The intended head path. */
  headX: Float64Array;
  headY: Float64Array;
  /** String pull, in multiples of the poi's weight. */
  tension: Float64Array;
}

/**
 * Solves one hand's beats, taken as a loop: the last beat flows back into
 * the first.
 */
export function solvePoiHandPaths(
  motions: readonly MotionData[],
  options: PoiStringOptions = DEFAULT_POI_STRING_OPTIONS
): PoiHandSolve {
  const L = options.stringLength;
  const dt = 60 / options.bpm / POI_SAMPLES_PER_BEAT;
  const { hands, heads } = tracePaths(motions, options);
  const sigma = options.turnaroundBeats * POI_SAMPLES_PER_BEAT;
  const drawn = smoothLoop(hands, sigma);
  const head = smoothLoop(
    easeSpeed(heads, options.speedBlendBeats * POI_SAMPLES_PER_BEAT),
    sigma
  );
  const n = head.length;
  const g = options.gravity ? GRAVITY : 0;
  const solve: PoiHandSolve = {
    beats: motions.length,
    drawnX: new Float64Array(n),
    drawnY: new Float64Array(n),
    handX: new Float64Array(n),
    handY: new Float64Array(n),
    headX: new Float64Array(n),
    headY: new Float64Array(n),
    tension: new Float64Array(n),
  };

  for (let i = 0; i < n; i++) {
    const [x, y] = head[i]!;
    const [px, py] = head[(i - 1 + n) % n]!;
    const [nx, ny] = head[(i + 1) % n]!;
    // The string's pull plus gravity gives the head its acceleration, so the
    // pull is the acceleration less gravity, and the hand lies along it.
    const fx = (nx - 2 * x + px) / (dt * dt);
    const fy = (ny - 2 * y + py) / (dt * dt) - g;
    const pull = Math.hypot(fx, fy);
    const [dx, dy] = drawn[i]!;
    // With no pull at all the poi is in free flight and the hand is free.
    solve.handX[i] = pull > 0 ? x + (L * fx) / pull : dx;
    solve.handY[i] = pull > 0 ? y + (L * fy) / pull : dy;
    solve.drawnX[i] = dx;
    solve.drawnY[i] = dy;
    solve.headX[i] = x;
    solve.headY[i] = y;
    solve.tension[i] = pull / GRAVITY;
  }
  return solve;
}

/** The planes a poi track can spin in, named as the performers name them. */
export type PoiTrackPlane = "wall" | "wheel" | "floor";

/**
 * Where the performer stands. The track is solved round the hand's own grid
 * centre; this places that centre in the world and turns it to the
 * performer's facing (radians about +y).
 */
export interface PoiTrackTransform {
  origin: { x: number; y: number; z: number };
  yaw: number;
}

const IDENTITY_TRANSFORM: PoiTrackTransform = {
  origin: { x: 0, y: 0, z: 0 },
  yaw: 0,
};

/**
 * Maps a canvas point in a plane to 3D, metres, y up. The axes are the ones
 * `planeAngleToWorldPosition` uses for the props, so a track point lands
 * where the performer's own prop would: canvas y points down, so it turns
 * into −y in the two upright planes, and the floor's north runs to +z.
 */
export function poiPlanePointTo3D(
  plane: PoiTrackPlane,
  x: number,
  y: number,
  transform: PoiTrackTransform,
  out: Float64Array,
  offset = 0
): void {
  let lx: number;
  let ly: number;
  let lz: number;
  if (plane === "wall") {
    lx = -x;
    ly = -y;
    lz = 0;
  } else if (plane === "wheel") {
    lx = 0;
    ly = -y;
    lz = x;
  } else {
    lx = -x;
    ly = 0;
    lz = -y;
  }
  const c = Math.cos(transform.yaw);
  const s = Math.sin(transform.yaw);
  // Three's rotation about +y: x' = x cos + z sin, z' = −x sin + z cos.
  out[offset] = transform.origin.x + lx * c + lz * s;
  out[offset + 1] = transform.origin.y + ly;
  out[offset + 2] = transform.origin.z - lx * s + lz * c;
}

/**
 * One hand's track in 3D: the hand target and the intended head, xyz per
 * sample. The head comes from the plane's solve; the hand is solved again
 * in 3D against real gravity (−y), so a floor-plane poi gets a hand that
 * holds it up, which the in-plane solve can't see. In the two upright planes
 * the result is the plane solve, mapped, until the hand reaches its stray cap.
 */
export interface PoiHandTrack {
  beats: number;
  samplesPerBeat: number;
  plane: PoiTrackPlane;
  stringLength: number;
  /** The plane solve the 3D track came from. */
  solve: PoiHandSolve;
  hand: Float64Array;
  head: Float64Array;
  tension: Float64Array;
}

/**
 * How far a hand will go from its drawn path to carry the poi, metres: the
 * Poi String lab's "hard" band. A fast spin needs about 20 cm; a slow one
 * would need the hand over the head at the top of the circle, which no
 * spinner does, so the hand stops here and the string goes slack instead.
 */
export const POI_MAX_HAND_STRAY = 0.35;

export function poiHandTrack3D(
  solve: PoiHandSolve,
  plane: PoiTrackPlane,
  options: Pick<PoiStringOptions, "stringLength" | "bpm" | "gravity">,
  transform: PoiTrackTransform = IDENTITY_TRANSFORM,
  maxHandStray = POI_MAX_HAND_STRAY
): PoiHandTrack {
  const n = solve.headX.length;
  const L = options.stringLength;
  const dt = 60 / options.bpm / POI_SAMPLES_PER_BEAT;
  const g = options.gravity ? GRAVITY : 0;
  const head = new Float64Array(n * 3);
  const hand = new Float64Array(n * 3);
  const tension = new Float64Array(n);
  for (let i = 0; i < n; i++)
    poiPlanePointTo3D(
      plane,
      solve.headX[i]!,
      solve.headY[i]!,
      transform,
      head,
      i * 3
    );
  const drawn = new Float64Array(3);
  for (let i = 0; i < n; i++) {
    const a = i * 3;
    const p = ((i - 1 + n) % n) * 3;
    const q = ((i + 1) % n) * 3;
    const fx = (head[q]! - 2 * head[a]! + head[p]!) / (dt * dt);
    const fy = (head[q + 1]! - 2 * head[a + 1]! + head[p + 1]!) / (dt * dt) + g;
    const fz = (head[q + 2]! - 2 * head[a + 2]! + head[p + 2]!) / (dt * dt);
    const pull = Math.sqrt(fx * fx + fy * fy + fz * fz);
    poiPlanePointTo3D(
      plane,
      solve.drawnX[i]!,
      solve.drawnY[i]!,
      transform,
      drawn
    );
    if (pull > 0) {
      let sx = head[a]! + (L * fx) / pull - drawn[0]!;
      let sy = head[a + 1]! + (L * fy) / pull - drawn[1]!;
      let sz = head[a + 2]! + (L * fz) / pull - drawn[2]!;
      const stray = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (stray > maxHandStray) {
        sx *= maxHandStray / stray;
        sy *= maxHandStray / stray;
        sz *= maxHandStray / stray;
      }
      hand[a] = drawn[0]! + sx;
      hand[a + 1] = drawn[1]! + sy;
      hand[a + 2] = drawn[2]! + sz;
    } else {
      hand[a] = drawn[0]!;
      hand[a + 1] = drawn[1]!;
      hand[a + 2] = drawn[2]!;
    }
    tension[i] = pull / GRAVITY;
  }
  return {
    beats: solve.beats,
    samplesPerBeat: POI_SAMPLES_PER_BEAT,
    plane,
    stringLength: L,
    solve,
    hand,
    head,
    tension,
  };
}

/**
 * Reads a track at a time in beats, looping, with linear interpolation
 * between samples. Writes xyz into `outHand` and `outHead`.
 */
export function samplePoiHandTrack(
  track: PoiHandTrack,
  beat: number,
  outHand: Float64Array,
  outHead: Float64Array
): void {
  const n = track.hand.length / 3;
  const span = n;
  let at = (beat * track.samplesPerBeat) % span;
  if (at < 0) at += span;
  const i = Math.floor(at);
  const t = at - i;
  const a = (i % n) * 3;
  const b = ((i + 1) % n) * 3;
  for (let k = 0; k < 3; k++) {
    outHand[k] =
      track.hand[a + k]! + (track.hand[b + k]! - track.hand[a + k]!) * t;
    outHead[k] =
      track.head[a + k]! + (track.head[b + k]! - track.head[a + k]!) * t;
  }
}

export type PoiHandSide = "left" | "right";

/** One hand's beats from a sequence, start pose left out. */
export function poiHandMotions(
  sequence: SequenceData,
  side: PoiHandSide
): MotionData[] {
  const motions: MotionData[] = [];
  for (const step of sequence.steps) {
    if (step.stepNumber === 0) continue;
    const motion = step.motions[side];
    if (motion) motions.push(motion);
  }
  return motions;
}

const TRACK_CACHE_LIMIT = 32;
const trackCache = new Map<string, PoiHandTrack>();

/**
 * The 3D track for one hand of a sequence, solved once per sequence, hand,
 * plane and solver settings. A TKA loop at 120 samples a beat is a few
 * kilobytes, so the cache holds a few dozen and drops the oldest.
 */
export function getPoiHandTrack(
  sequence: SequenceData,
  side: PoiHandSide,
  plane: PoiTrackPlane,
  options: PoiStringOptions = DEFAULT_POI_STRING_OPTIONS,
  transform: PoiTrackTransform = IDENTITY_TRANSFORM,
  maxHandStray = POI_MAX_HAND_STRAY
): PoiHandTrack | null {
  const key = [
    sequence.id,
    sequence.steps.length,
    side,
    plane,
    options.bpm,
    options.handRadius,
    options.stringLength,
    options.gravity,
    options.turnaroundBeats,
    options.speedBlendBeats,
    transform.origin.x,
    transform.origin.y,
    transform.origin.z,
    transform.yaw,
    maxHandStray,
  ].join("|");
  const cached = trackCache.get(key);
  if (cached) return cached;
  const motions = poiHandMotions(sequence, side);
  if (motions.length === 0) return null;
  const track = poiHandTrack3D(
    solvePoiHandPaths(motions, options),
    plane,
    options,
    transform,
    maxHandStray
  );
  if (trackCache.size >= TRACK_CACHE_LIMIT)
    trackCache.delete(trackCache.keys().next().value!);
  trackCache.set(key, track);
  return track;
}

/** The drawn hand and poi head, frame by frame, before any smoothing. */
function tracePaths(
  motions: readonly MotionData[],
  options: PoiStringOptions
): { hands: [number, number][]; heads: [number, number][] } {
  const L = options.stringLength;
  const R = options.handRadius;

  // The staff angle runs on unwrapped, the same way the animation turns the
  // prop through its turns.
  const hands: [number, number][] = [];
  const heads: [number, number][] = [];
  for (const motion of motions) {
    const ends = calculateMotionEndpoints(motion);
    const start = [
      Math.cos(ends.startCenterAngle),
      Math.sin(ends.startCenterAngle),
    ];
    const end = [
      Math.cos(ends.targetCenterAngle),
      Math.sin(ends.targetCenterAngle),
    ];
    // A quarter move travels the circle; a move across goes straight through.
    const across = start[0]! * end[0]! + start[1]! * end[1]! < -0.5;
    for (let k = 0; k < POI_SAMPLES_PER_BEAT; k++) {
      const p = k / POI_SAMPLES_PER_BEAT;
      let hx: number, hy: number;
      if (across) {
        hx = R * (start[0]! + (end[0]! - start[0]!) * p);
        hy = R * (start[1]! + (end[1]! - start[1]!) * p);
      } else {
        const a = lerpAngle(ends.startCenterAngle, ends.targetCenterAngle, p);
        hx = R * Math.cos(a);
        hy = R * Math.sin(a);
      }
      const staff = ends.startStaffAngle + ends.staffRotationDelta * p;
      hands.push([hx, hy]);
      heads.push([hx + L * Math.cos(staff), hy + L * Math.sin(staff)]);
    }
  }
  return { hands, heads };
}

/**
 * Keeps the drawn path but eases how fast the head travels along it, so a
 * change of speed at a beat line spreads over `sigma` samples instead of
 * landing in one frame. Easing the spin rate instead would break Gage's
 * turnarounds, where the hand reversing keeps the head moving smoothly while
 * the spin changes speed; smoothing positions would shrink fast circles.
 */
function easeSpeed(
  points: [number, number][],
  sigma: number
): [number, number][] {
  const n = points.length;
  const seg = points.map(([x, y], i): [number, number] => {
    const [nx, ny] = points[(i + 1) % n]!;
    return [Math.hypot(nx - x, ny - y), 0];
  });
  const eased = smoothLoop(seg, sigma);
  const along = [0];
  for (let i = 0; i < n; i++) along.push(along[i]! + seg[i]![0]);
  let travelled = 0;
  let j = 0;
  return eased.map(([step]) => {
    while (j < n - 1 && along[j + 1]! <= travelled) j++;
    const span = seg[j]![0];
    const t = span > 0 ? (travelled - along[j]!) / span : 0;
    const [x, y] = points[j]!;
    const [nx, ny] = points[(j + 1) % n]!;
    travelled += step;
    return [x + (nx - x) * t, y + (ny - y) * t];
  });
}

/** Gaussian smoothing that wraps round the loop. `sigma` is in samples. */
function smoothLoop(
  points: [number, number][],
  sigma: number
): [number, number][] {
  if (sigma < 0.5) return points;
  const reach = Math.ceil(sigma * 4);
  const weights = Array.from({ length: reach * 2 + 1 }, (_, k) =>
    Math.exp(-((k - reach) ** 2) / (2 * sigma * sigma))
  );
  const total = weights.reduce((a, b) => a + b, 0);
  const n = points.length;
  return points.map((_, i) => {
    let x = 0;
    let y = 0;
    weights.forEach((w, k) => {
      const [px, py] = points[(i + k - reach + n * reach) % n]!;
      x += w * px;
      y += w * py;
    });
    return [x / total, y / total];
  });
}
