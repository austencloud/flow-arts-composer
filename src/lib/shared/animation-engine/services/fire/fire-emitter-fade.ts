/**
 * Post-emission fade bookkeeping for the WebGL fire simulation.
 *
 * When every fire-carrying tip disappears — the usual cause is switching a
 * fire-capable prop to hands, whose `PROP_TIP_POINTS` entry is deliberately
 * empty — the simulation has no fuel left to inject but still holds a live
 * plume. That plume has to keep being stepped and redrawn until it burns out,
 * or the fire canvas (WebGL2 with `preserveDrawingBuffer: true`) goes on
 * compositing whatever frame it drew last, forever.
 *
 * Stepping it forever is just as wrong, so the renderer tracks a cheap scalar
 * estimate of the heat still in the field: reset to full on every emitting
 * frame, then decayed the way the solver itself decays temperature once
 * emission stops. The estimate is in the display pass's own units, so it can
 * stop exactly where that pass stops drawing.
 *
 * The decay law is the solver's, not a per-frame constant: `advect` runs the
 * configured dissipation through `computeFluidStepDissipation`, which raises it
 * to `dt / (1/60)`, so a sub-step shorter than 16.7ms decays *less* per step.
 * Assuming one full unit of decay per sub-step reads far too fast anywhere the
 * frame dt is not 1/60 — at 120Hz it settles while the real field is still at
 * 0.63 and under reduced motion at 1.91, both well above the 0.1 visibility
 * gate, which deletes a plume the user can still plainly see. Feed it the
 * renderer's real `subDtSeconds`/`subSteps` (from `computeFireSubStepping`) and
 * the estimate tracks the field at any refresh rate, any playback speed, and
 * under reduced motion.
 *
 * Consequence worth knowing: reduced motion runs the sim at 0.2x, so its fade
 * genuinely takes ~5x longer in wall-clock. That is the field actually cooling
 * more slowly, not the estimate being lazy.
 */

import { computeFluidStepDissipation } from "../fluid/web-gl-fluid-solver-2d";

/**
 * `fireIntensity = (temperature + fuel * 0.5) * displayIntensity` in the fire
 * display shader, and everything that paints a pixel sits inside its
 * `fireIntensity > 0.1` branch. Below this the pass writes a fully transparent
 * frame, so there is nothing left to fade.
 */
export const FIRE_DISPLAY_HEAT_GATE = 0.1;

/**
 * Heat the estimate starts from. Each splat injects `temperatureInjection`
 * (1.1 by default) scaled by intensity, and overlapping splats from a moving
 * tip accumulate, so the peak field value sits comfortably above 1. Four is
 * deliberate headroom: underestimating truncates a plume the user can still
 * see, while overestimating only costs a fraction of a second of extra
 * simulation on a fade that is ending anyway.
 */
export const FIRE_RESIDUAL_PEAK_HEAT = 4;

/**
 * Ceiling on the dissipation the estimate will believe. The solver happily
 * accepts a configured dissipation of 1.0 (never fade at all); the estimate
 * still has to reach the floor so the fade terminates and the renderer stops
 * burning frames.
 */
const MAX_ESTIMATED_DISSIPATION = 0.99;

/**
 * Fallback sub-step used only when the caller cannot supply a usable one. The
 * renderer's `computeFireStepDt` floors a non-positive dt at 16ms, so this is
 * unreachable from the live path; it keeps the estimate progressing at the
 * solver's own reference step rather than stalling if it ever is reached.
 */
const REFERENCE_SUB_DT_SECONDS = 1 / 60;

/**
 * Field heat at which the display pass goes dark, for a given display
 * intensity. Brighter fire keeps a colder field visible, so it has to fade for
 * longer before the canvas is genuinely empty.
 */
export function computeResidualHeatFloor(displayIntensity: number): number {
  return FIRE_DISPLAY_HEAT_GATE / Math.max(displayIntensity, 0.05);
}

/**
 * Advance the residual-heat estimate across one rendered frame that ran
 * `subSteps` solver sub-steps of `subDtSeconds` each with no emission. Returns
 * exactly 0 once the remaining heat can no longer paint anything, which is the
 * renderer's signal to clear and stop.
 */
export function decayResidualHeat(
  previous: number,
  dissipationBase: number,
  subDtSeconds: number,
  subSteps: number,
  floor: number
): number {
  if (!Number.isFinite(previous) || previous <= 0) return 0;

  const steps = Math.max(1, Math.floor(subSteps));
  const base = Math.min(
    Math.max(dissipationBase, 0),
    MAX_ESTIMATED_DISSIPATION
  );
  const subDt =
    Number.isFinite(subDtSeconds) && subDtSeconds > 0
      ? subDtSeconds
      : REFERENCE_SUB_DT_SECONDS;

  // The same call the solver makes per advected sub-step, so the estimate
  // cools at exactly the rate the temperature field does.
  const perSubStep = computeFluidStepDissipation(base, subDt);
  const next = previous * Math.pow(perSubStep, steps);
  return next < floor ? 0 : next;
}

/**
 * How many rendered frames a fade takes at a given sub-step shape. Not used by
 * the render path — it exists so the fade window can be asserted against real
 * physics constants instead of a hand-picked duration.
 */
export function countResidualFadeFrames(
  dissipationBase: number,
  subDtSeconds: number,
  subSteps: number,
  floor: number
): number {
  let heat = FIRE_RESIDUAL_PEAK_HEAT;
  let frames = 0;
  while (heat > 0) {
    heat = decayResidualHeat(
      heat,
      dissipationBase,
      subDtSeconds,
      subSteps,
      floor
    );
    frames++;
  }
  return frames;
}
