import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import {
  DEFAULT_POI_STRING_OPTIONS,
  POI_SAMPLES_PER_BEAT,
  solvePoiHandPaths,
  type PoiStringOptions,
} from "#lib/shared/poi/poi-hand-track.js";
import { LOOSE_TENSION } from "#lib/shared/poi/poi-tether.js";

/**
 * The Poi String lab's reading of the shared hand solve
 * (`#lib/shared/poi/poi-hand-track.ts`): how far the hand has to stray from
 * the drawn path on every frame and beat, banded by effort.
 */

/**
 * Rough bands for how hard the hand works, by how far it strays from the drawn
 * path. They are a reading aid, not physics: gravity alone moves the hand of
 * a plain wall-plane circle about 20 cm at 180 bpm.
 */
export type PoiHandEffort = "close" | "steer" | "hard" | "loose";
export const STEER_STRAY_METRES = 0.15;
export const HARD_STRAY_METRES = 0.35;

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
  const solve = solvePoiHandPaths(motions, options);
  const samples: PoiHandSample[] = Array.from(solve.headX, (x, i) => {
    const drawn = { x: solve.drawnX[i]!, y: solve.drawnY[i]! };
    const hand = { x: solve.handX[i]!, y: solve.handY[i]! };
    const tension = solve.tension[i]!;
    const stray = Math.hypot(hand.x - drawn.x, hand.y - drawn.y);
    return {
      beat: i / POI_SAMPLES_PER_BEAT,
      drawn,
      hand,
      head: { x, y: solve.headY[i]! },
      tension,
      stray,
      effort: effortOf(stray, tension),
    };
  });

  const beats = motions.map((_, b) => {
    const run = samples.slice(
      b * POI_SAMPLES_PER_BEAT,
      (b + 1) * POI_SAMPLES_PER_BEAT
    );
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
