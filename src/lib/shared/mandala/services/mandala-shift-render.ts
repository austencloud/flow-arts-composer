/**
 * One frame of a shifting mandala, as a pure function of beats.
 *
 * `prepareShiftingMandala` does the work that depends only on the sequences
 * and the line shape (path options, the morph plan between each neighbouring
 * pair). `frameAt` turns a beat count into the geometry, palette and spin to
 * draw, and `drawShiftingMandalaFrame` paints it. The Studio preview, the
 * export surface and the arrangement cell all go through these three, so a
 * frame drawn at beat 7.25 is the same picture everywhere.
 */

import { calculate } from "./mandala-geometry-calculator";
import { renderMandalaToCanvas } from "./mandala-renderer";
import { getMandalaPathOptions } from "./mandala-path-options";
import { planMandalaMorph, type MandalaMorphPlan } from "./mandala-path-interpolator";
import { pairTipEnds } from "#lib/shared/pictograph/prop/domain/prop-tip-ends.js";
import {
  DEFAULT_OVERLAP_CONFIG,
  type MandalaPalette,
  type MandalaPaths,
} from "../domain/mandala-types";
import {
  ENGINE_GRID_RADIUS,
  MANDALA_GRID_RADIUS,
  MANDALA_STANDARD_TIP_DX,
} from "../domain/mandala-constants";
import {
  PRESET_COLORS,
  flowGradientColors,
  flowPalette,
  mixColors,
  withAlpha,
} from "../domain/mandala-palette";
import type { MandalaLook, MandalaShift } from "../domain/mandala-shift-types";
import { breathAt, colorPhaseAt, shiftFrameAt, spinAt } from "./mandala-shift";
import type { MandalaPathOptions, StepLike } from "./types";

/**
 * The viewer's reach: a depth of 100 breathes the tips out to dx 250. The
 * breath starts from the standard picture (dx 120, the mandala as its card
 * shows it) rather than from nothing, so a depth of 0 is a still mandala and
 * the figure never collapses to the grid between breaths.
 */
const MAX_TIP_DX = 250;

/** The on-screen SVG glow's standard deviation, in mandala units. */
const GLOW_STDDEV = 3;

const EMPTY_PATHS: MandalaPaths = { left: [], right: [], purple: [] };

export interface ShiftingMandalaSource {
  steps: readonly StepLike[];
  leftPropType?: string;
  rightPropType?: string;
}

export interface PreparedShiftingMandala {
  readonly sources: readonly ShiftingMandalaSource[];
  readonly options: readonly (MandalaPathOptions | undefined)[];
  /** The morph plan from source `i` to source `j`, made once and kept. */
  plan(i: number, j: number): MandalaMorphPlan;
  /** The geometry of source `i` at a tip offset. */
  geometry(i: number, tipDx: number): MandalaPaths;
}

/**
 * Work that depends only on the sequences and the line shape. Make a new one
 * when either changes; a look's colours, depth or spin need no new plan.
 */
export function prepareShiftingMandala(
  sources: readonly ShiftingMandalaSource[],
  shape: MandalaLook["shape"]
): PreparedShiftingMandala {
  const options = sources.map((source) =>
    getMandalaPathOptions(shape, pairTipEnds(source.leftPropType, source.rightPropType))
  );
  const plans = new Map<string, MandalaMorphPlan>();
  const geometry = (i: number, tipDx: number): MandalaPaths => {
    const source = sources[i];
    if (!source) return EMPTY_PATHS;
    return calculate(
      source.steps,
      source.leftPropType,
      source.rightPropType,
      options[i],
      tipDx === MANDALA_STANDARD_TIP_DX ? undefined : { dx: tipDx, dy: 0 }
    );
  };
  return {
    sources,
    options,
    geometry,
    plan(i, j) {
      const key = `${i}>${j}`;
      let plan = plans.get(key);
      if (!plan) {
        // Pairing is decided on the standard geometry: point counts do not
        // depend on the tip offset, so the plan holds at every breath.
        plan = planMandalaMorph(
          geometry(i, MANDALA_STANDARD_TIP_DX),
          geometry(j, MANDALA_STANDARD_TIP_DX)
        );
        plans.set(key, plan);
      }
      return plan;
    },
  };
}

export type ShiftingMandalaGradient = {
  left: [string, string];
  right: [string, string];
  purple: [string, string];
};

export interface ShiftingMandalaFrame {
  /** The lines to draw. While morphing, the blend of the two sequences. */
  paths: MandalaPaths;
  /**
   * Reduced motion only: the sequence arriving, drawn over `paths` at
   * `alpha`, instead of the lines flowing.
   */
  crossfade: { paths: MandalaPaths; alpha: number } | null;
  tipDx: number;
  palette: MandalaPalette;
  gradient: ShiftingMandalaGradient | undefined;
  rotDeg: number;
  bg: string;
}

function solidPalette(pair: [string, string], fillAlpha: number): MandalaPalette {
  const [c1, c2] = pair;
  const mix = mixColors(c1, c2);
  return {
    leftStroke: c1,
    leftFill: withAlpha(c1, fillAlpha),
    rightStroke: c2,
    rightFill: withAlpha(c2, fillAlpha),
    purpleStroke: mix,
    purpleFill: withAlpha(mix, fillAlpha),
  };
}

/** The picture at `beats` (fractional beats from the clip's anchor). */
export function shiftingMandalaFrameAt(
  prepared: PreparedShiftingMandala,
  shift: MandalaShift,
  look: MandalaLook,
  beats: number,
  beatsPerBar: number,
  reducedMotion = false
): ShiftingMandalaFrame {
  const colors = PRESET_COLORS[look.preset];
  const reach = (look.depth / 100) * (MAX_TIP_DX - MANDALA_STANDARD_TIP_DX);
  const tipDx = reducedMotion
    ? MANDALA_STANDARD_TIP_DX
    : MANDALA_STANDARD_TIP_DX + reach * breathAt(beats, look.breathBeats);
  const count = prepared.sources.length;
  const frame = shiftFrameAt(shift, count, beats, beatsPerBar);

  let paths = count > 0 ? prepared.geometry(frame.from, tipDx) : EMPTY_PATHS;
  let crossfade: ShiftingMandalaFrame["crossfade"] = null;
  if (frame.morphT > 0 && frame.to !== frame.from) {
    const toPaths = prepared.geometry(frame.to, tipDx);
    if (reducedMotion) {
      crossfade = { paths: toPaths, alpha: frame.morphT };
    } else {
      paths = prepared.plan(frame.from, frame.to).at(paths, toPaths, frame.morphT);
    }
  }

  const palette =
    look.colorMode === "flow"
      ? flowPalette(colors.morph, colorPhaseAt(beats, look.breathBeats))
      : solidPalette(colors.pair, colors.fillAlpha ?? 0.15);
  const gradient =
    look.colorMode === "flow"
      ? flowGradientColors(colors.morph, colorPhaseAt(beats, look.breathBeats))
      : undefined;
  const rotDeg = reducedMotion ? 0 : spinAt(beats, beatsPerBar, look.spinPerBar);

  return { paths, crossfade, tipDx, palette, gradient, rotDeg, bg: colors.bg };
}

export interface ShiftingMandalaScratch {
  a: OffscreenCanvas;
  b: OffscreenCanvas;
}

/**
 * Paint a frame into a `width` by `height` box of logical pixels (the context
 * already carries any device scale). The figure sits in the largest centred
 * square.
 */
export function drawShiftingMandalaFrame(
  ctx: CanvasRenderingContext2D,
  frame: ShiftingMandalaFrame,
  width: number,
  height: number,
  lineWeight: number,
  scratch?: ShiftingMandalaScratch
): void {
  ctx.fillStyle = frame.bg;
  ctx.fillRect(0, 0, width, height);

  const size = Math.min(width, height);
  if (size <= 0) return;
  const offsetX = (width - size) / 2;
  const offsetY = (height - size) / 2;
  const center = size / 2;

  // The glow is a device-space shadow, so it scales with the figure the way
  // the SVG filter's blur does. Same fit as the viewer's export frames.
  const effectiveTipDx = Math.max(frame.tipDx, MANDALA_STANDARD_TIP_DX);
  const tipReach = (effectiveTipDx * MANDALA_GRID_RADIUS) / ENGINE_GRID_RADIUS;
  const deviceScale = ctx.getTransform().a || 1;
  const renderScale = (center / ((MANDALA_GRID_RADIUS + tipReach) * 1.05)) * deviceScale;
  const glow = {
    blur: GLOW_STDDEV * renderScale,
    bloomBlur: DEFAULT_OVERLAP_CONFIG.bloomBlur * renderScale,
  };

  const paint = (paths: MandalaPaths): void => {
    renderMandalaToCanvas(ctx, paths, {
      size,
      style: "stroke",
      show: "both",
      palette: frame.palette,
      strokeWidth: lineWeight,
      tipDx: frame.tipDx,
      gradient: frame.gradient,
      glow,
      offsetX,
      offsetY,
      maskScratch: scratch,
    });
  };

  ctx.save();
  if (frame.rotDeg !== 0) {
    ctx.translate(offsetX + center, offsetY + center);
    ctx.rotate((frame.rotDeg * Math.PI) / 180);
    ctx.translate(-(offsetX + center), -(offsetY + center));
  }
  if (frame.crossfade) {
    ctx.globalAlpha = 1 - frame.crossfade.alpha;
    paint(frame.paths);
    ctx.globalAlpha = frame.crossfade.alpha;
    paint(frame.crossfade.paths);
    ctx.globalAlpha = 1;
  } else {
    paint(frame.paths);
  }
  ctx.restore();
}
