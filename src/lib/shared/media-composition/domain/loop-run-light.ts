import type { TrailPoint } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import type { LoopLightStroke } from "#lib/shared/media-composition/domain/loop-run.js";

/**
 * The LOOP run canvas stage's light as points the 2D animation canvas's trail
 * painter draws (`Canvas2DTrailRenderer.renderTrails`). The animation canvas
 * gathers its trail point by point as frames play, which a seek or an export
 * frame out of order cannot replay, so here every point is worked out afresh
 * from the stretches `loopRunFrame` says are lit: each step's move sampled at
 * one fixed density, plus the exact ends of the stretch. The same `t` always
 * gives the same points, whatever was asked before.
 */

/** One prop end at a moment of a step's move, in the canvas's 950 view box. */
export interface LoopLightTip {
  /** 0 the left (blue) prop, 1 the right (red). */
  prop: 0 | 1;
  /** Which of the prop's ends. */
  tip: number;
  x: number;
  y: number;
}

/** The props' ends `progress` of the way through step `step`'s move, as the animation canvas puts them. */
export type LoopLightSampler = (step: number, progress: number) => readonly LoopLightTip[];

/** Samples per step's move: enough that the trail painter's curve through them is smooth at any stage size. */
export const LOOP_LIGHT_SAMPLES = 48;

/** The trail painter's input: each prop's points, one curve per stroke and end. */
export interface LoopLightPoints {
  left: TrailPoint[];
  right: TrailPoint[];
}

/** Ends of one stroke share a curve; each stroke gets its own block of curve numbers. */
const CURVES_PER_STROKE = 16;
/** Two samples closer than this (view box units) are one point. */
const SAME_POINT = 1e-6;

/** The shares of a step's move a span is sampled at: the fixed grid inside it and its two ends. */
export function loopLightShares(from: number, to: number, samples = LOOP_LIGHT_SAMPLES): number[] {
  const shares = [from];
  for (let j = Math.floor(from * samples) + 1; j / samples < to; j++) shares.push(j / samples);
  if (to > from) shares.push(to);
  return shares;
}

/**
 * Every point of `strokes`, mapped through `place` (view box units to the
 * caller's canvas). A span that carries on from the step before skips its
 * first sample, which is the last one's end.
 */
export function loopLightPoints(
  strokes: readonly LoopLightStroke[],
  sample: LoopLightSampler,
  place: (x: number, y: number) => { x: number; y: number } = (x, y) => ({ x, y }),
  samples = LOOP_LIGHT_SAMPLES
): LoopLightPoints {
  const out: LoopLightPoints = { left: [], right: [] };
  strokes.forEach((stroke, index) => {
    const last = new Map<string, { x: number; y: number }>();
    stroke.forEach((span, i) => {
      const before = stroke[i - 1];
      const carries = before !== undefined && before.to >= 1 && span.from <= 0 && before.step === span.step - 1;
      const shares = loopLightShares(span.from, span.to, samples);
      for (const share of carries ? shares.slice(1) : shares)
        for (const tip of sample(span.step, share)) {
          const key = `${tip.prop}:${tip.tip}`;
          const at = place(tip.x, tip.y);
          const previous = last.get(key);
          if (previous && Math.hypot(at.x - previous.x, at.y - previous.y) < SAME_POINT) continue;
          last.set(key, at);
          (tip.prop === 0 ? out.left : out.right).push({
            x: at.x,
            y: at.y,
            timestamp: 0,
            propIndex: tip.prop,
            tipIndex: index * CURVES_PER_STROKE + tip.tip,
          });
        }
    });
  });
  return out;
}
