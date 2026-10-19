import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import { calculateMotionEndpoints } from "#lib/shared/animation-engine/services/endpoint-calculator.js";
import { lerpAngle } from "#lib/shared/animation-engine/services/angle-calculator.js";

/**
 * Whether a poi could follow one hand's beats, judged by its string. A string
 * can only pull: it can't push the poi head and it can't shove it sideways.
 * From the hand's path and the way the poi points on every frame we work out
 * the force the string would need to carry. If it would have to push, the
 * string goes slack and the poi falls out of the pattern. If it would have to
 * lean far off the line of the string, the hand has to steer hard there.
 *
 * Real hands round off a turnaround rather than reversing in an instant, so
 * the path is smoothed over `turnaroundBeats` before taking accelerations.
 * Beats still run at an even tempo, as the animation does; a spinner who
 * stretches a beat can ease a spike this flags.
 */
export interface PoiStringOptions {
  /** Poi length, hand to head, in metres. */
  stringLength: number;
  /** The hand's circle, as a share of the string length. */
  handCircle: number;
  bpm: number;
  gravity: boolean;
  /** How long a hand takes to round off a sharp change, in beats. */
  turnaroundBeats: number;
}

export const DEFAULT_POI_STRING_OPTIONS: PoiStringOptions = {
  stringLength: 0.6,
  handCircle: 1,
  bpm: 180,
  gravity: true,
  turnaroundBeats: 0.06,
};

/** Past this lean the hand is working hard to keep the poi on its path. */
export const STRAIN_LEAN_DEGREES = 25;

export type PoiStringVerdict = "clean" | "strain" | "slack";

export interface PoiStringSample {
  /** Time through the loop, in beats. */
  beat: number;
  hand: { x: number; y: number };
  head: { x: number; y: number };
  /** String pull, in multiples of the poi's weight. Zero or less is slack. */
  tension: number;
  /** How far the needed force leans off the string, in degrees. */
  lean: number;
  verdict: PoiStringVerdict;
}

export interface PoiStringBeat {
  minTension: number;
  maxLean: number;
  verdict: PoiStringVerdict;
}

export interface PoiStringResult {
  samples: PoiStringSample[];
  beats: PoiStringBeat[];
  verdict: PoiStringVerdict;
}

const SAMPLES_PER_BEAT = 120;
const GRAVITY = 9.81;
const RANK: Record<PoiStringVerdict, number> = {
  clean: 0,
  strain: 1,
  slack: 2,
};

function verdictOf(tension: number, lean: number): PoiStringVerdict {
  if (tension <= 0) return "slack";
  return lean > STRAIN_LEAN_DEGREES ? "strain" : "clean";
}

const worst = (verdicts: PoiStringVerdict[]) =>
  verdicts.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "clean");

/**
 * Runs the check over one hand's beats, taken as a loop: the last beat flows
 * back into the first. Positions use the canvas axes, so y points down and
 * gravity pulls toward +y.
 */
export function checkPoiString(
  motions: readonly MotionData[],
  options: PoiStringOptions = DEFAULT_POI_STRING_OPTIONS
): PoiStringResult {
  const L = options.stringLength;
  const R = options.handCircle * L;
  const beatSeconds = 60 / options.bpm;
  const dt = beatSeconds / SAMPLES_PER_BEAT;

  // Raw positions, frame by frame. The staff angle runs on unwrapped, the
  // same way the animation turns the prop through its turns.
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

  const hand = smoothLoop(hands, options.turnaroundBeats * SAMPLES_PER_BEAT);
  const head = smoothLoop(heads, options.turnaroundBeats * SAMPLES_PER_BEAT);
  const n = head.length;
  const g = options.gravity ? GRAVITY : 0;

  const samples: PoiStringSample[] = head.map(([x, y], i) => {
    const [px, py] = head[(i - 1 + n) % n]!;
    const [nx, ny] = head[(i + 1) % n]!;
    // The string's pull plus gravity gives the head its acceleration, so the
    // pull is the acceleration less gravity.
    const fx = (nx - 2 * x + px) / (dt * dt);
    const fy = (ny - 2 * y + py) / (dt * dt) - g;
    const [hx, hy] = hand[i]!;
    const len = Math.hypot(x - hx, y - hy) || 1;
    const ux = (x - hx) / len;
    const uy = (y - hy) / len;
    const pull = -(fx * ux + fy * uy);
    const sideways = Math.abs(fx * uy - fy * ux);
    const tension = pull / GRAVITY;
    const lean = pull > 0 ? (Math.atan2(sideways, pull) * 180) / Math.PI : 180;
    return {
      beat: i / SAMPLES_PER_BEAT,
      hand: { x: hx, y: hy },
      head: { x, y },
      tension,
      lean,
      verdict: verdictOf(tension, lean),
    };
  });

  const beats = motions.map((_, b) => {
    const run = samples.slice(b * SAMPLES_PER_BEAT, (b + 1) * SAMPLES_PER_BEAT);
    return {
      minTension: Math.min(...run.map((s) => s.tension)),
      maxLean: Math.max(...run.map((s) => s.lean)),
      verdict: worst(run.map((s) => s.verdict)),
    };
  });

  return { samples, beats, verdict: worst(beats.map((b) => b.verdict)) };
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
