import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
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

/**
 * Rough bands for how hard the hand works, by how far it strays from the drawn
 * path. They are a reading aid, not physics: gravity alone moves the hand of
 * a plain wall-plane circle about 20 cm at 180 bpm.
 */
export type PoiHandEffort = "close" | "steer" | "hard" | "loose";
export const STEER_STRAY_METRES = 0.15;
export const HARD_STRAY_METRES = 0.35;
/** Below this pull, in poi weights, the poi is nearly floating. */
export const LOOSE_TENSION = 0.2;

export interface PoiHandSample {
  /** Time through the loop, in beats. */
  beat: number;
  /** Where the drawing puts the hand. */
  drawn: { x: number; y: number };
  /** Where the hand must be for the string to carry the poi head. */
  hand: { x: number; y: number };
  head: { x: number; y: number };
  /** String pull, in multiples of the poi's weight. */
  tension: number;
  /** Distance from the drawn hand to the needed hand, in metres. */
  stray: number;
  effort: PoiHandEffort;
}

export interface PoiHandBeat {
  maxStray: number;
  minTension: number;
  effort: PoiHandEffort;
}

export interface PoiHandResult {
  samples: PoiHandSample[];
  beats: PoiHandBeat[];
  maxStray: number;
  minTension: number;
  effort: PoiHandEffort;
}

const SAMPLES_PER_BEAT = 120;
const GRAVITY = 9.81;
const RANK: Record<PoiHandEffort, number> = {
  close: 0,
  steer: 1,
  hard: 2,
  loose: 3,
};

function effortOf(stray: number, tension: number): PoiHandEffort {
  if (tension < LOOSE_TENSION) return "loose";
  if (stray > HARD_STRAY_METRES) return "hard";
  return stray > STEER_STRAY_METRES ? "steer" : "close";
}

const worst = (efforts: PoiHandEffort[]) =>
  efforts.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "close");

/**
 * Solves one hand's beats, taken as a loop: the last beat flows back into the
 * first. Positions use the canvas axes, so y points down and gravity pulls
 * toward +y.
 */
export function solvePoiHand(
  motions: readonly MotionData[],
  options: PoiStringOptions = DEFAULT_POI_STRING_OPTIONS
): PoiHandResult {
  const L = options.stringLength;
  const dt = 60 / options.bpm / SAMPLES_PER_BEAT;
  const { hands, heads } = tracePaths(motions, options);
  const sigma = options.turnaroundBeats * SAMPLES_PER_BEAT;
  const drawn = smoothLoop(hands, sigma);
  const head = smoothLoop(
    easeSpeed(heads, options.speedBlendBeats * SAMPLES_PER_BEAT),
    sigma
  );
  const n = head.length;
  const g = options.gravity ? GRAVITY : 0;

  const samples: PoiHandSample[] = head.map(([x, y], i) => {
    const [px, py] = head[(i - 1 + n) % n]!;
    const [nx, ny] = head[(i + 1) % n]!;
    // The string's pull plus gravity gives the head its acceleration, so the
    // pull is the acceleration less gravity, and the hand lies along it.
    const fx = (nx - 2 * x + px) / (dt * dt);
    const fy = (ny - 2 * y + py) / (dt * dt) - g;
    const pull = Math.hypot(fx, fy);
    const [dx, dy] = drawn[i]!;
    // With no pull at all the poi is in free flight and the hand is free.
    const hx = pull > 0 ? x + (L * fx) / pull : dx;
    const hy = pull > 0 ? y + (L * fy) / pull : dy;
    const tension = pull / GRAVITY;
    const stray = Math.hypot(hx - dx, hy - dy);
    return {
      beat: i / SAMPLES_PER_BEAT,
      drawn: { x: dx, y: dy },
      hand: { x: hx, y: hy },
      head: { x, y },
      tension,
      stray,
      effort: effortOf(stray, tension),
    };
  });

  const beats = motions.map((_, b) => {
    const run = samples.slice(b * SAMPLES_PER_BEAT, (b + 1) * SAMPLES_PER_BEAT);
    return {
      maxStray: Math.max(...run.map((s) => s.stray)),
      minTension: Math.min(...run.map((s) => s.tension)),
      effort: worst(run.map((s) => s.effort)),
    };
  });

  return {
    samples,
    beats,
    maxStray: Math.max(...beats.map((b) => b.maxStray)),
    minTension: Math.min(...beats.map((b) => b.minTension)),
    effort: worst(beats.map((b) => b.effort)),
  };
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
    for (let k = 0; k < SAMPLES_PER_BEAT; k++) {
      const p = k / SAMPLES_PER_BEAT;
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
