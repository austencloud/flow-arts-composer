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
  /** Source `i` at the standard reach, made once: the strip's still of it. */
  still(i: number): MandalaPaths;
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
  const stills = new Map<number, MandalaPaths>();
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
    still(i) {
      let still = stills.get(i);
      if (!still) {
        still = geometry(i, MANDALA_STANDARD_TIP_DX);
        stills.set(i, still);
      }
      return still;
    },
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

/** One cell of the strip: a sequence's still and how lit it is, 0 to 1. */
export interface ShiftingMandalaStripCell {
  paths: MandalaPaths;
  lit: number;
}

export interface ShiftingMandalaFrame {
  /** The lines to draw. While morphing, the blend of the two sequences. */
  paths: MandalaPaths;
  /**
   * The strip's cells in list order, or null with the strip off. The light
   * crosses from the leaving cell to the arriving one with the morph.
   */
  strip: { cells: ShiftingMandalaStripCell[] } | null;
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

/** Where the look puts the strip; a look saved before the strip has none. */
export function lookStrip(look: MandalaLook): "off" | "bottom" {
  return look.strip ?? "off";
}

/**
 * How lit each strip cell is at a shift frame: the leaving sequence fades
 * as the arriving one brightens, so a steady shift slides the light and a
 * landing shift crosses it over the morph. Reduced motion jumps instead.
 */
export function stripLitAt(
  count: number,
  frame: { from: number; to: number; morphT: number },
  reducedMotion = false
): number[] {
  const lit = new Array<number>(count).fill(0);
  if (count === 0) return lit;
  const t = reducedMotion || frame.to === frame.from ? 0 : frame.morphT;
  lit[frame.from] = 1 - t;
  if (frame.to !== frame.from) lit[frame.to] = t;
  return lit;
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

  let strip: ShiftingMandalaFrame["strip"] = null;
  if (lookStrip(look) === "bottom" && count > 0) {
    const lit = stripLitAt(count, frame, reducedMotion);
    strip = {
      cells: lit.map((value, i) => ({ paths: prepared.still(i), lit: value })),
    };
  }

  return { paths, strip, crossfade, tipDx, palette, gradient, rotDeg, bg: colors.bg };
}

export interface StripBox {
  x: number;
  y: number;
  size: number;
}

export interface StripLayout {
  /** The largest square left for the figure above the band. */
  figure: StripBox;
  /** One square per cell, centred in the band along the bottom. */
  cells: StripBox[];
}

/** The band's share of the box height, floored at MIN_BAND and capped at MAX_BAND_SHARE. */
const BAND_SHARE = 1 / 7;
const MIN_BAND = 40;
const MAX_BAND_SHARE = 0.3;
/** A cell's height as a share of the band, and the gap between cells as a share of a cell. */
const CELL_SHARE = 0.78;
const CELL_GAP = 0.25;
/** The row never runs wider than this share of the box. */
const ROW_SHARE = 0.96;

/**
 * Where the figure and the strip's cells sit in a `width` by `height` box:
 * the band takes a seventh of the height along the bottom (at least 40
 * logical pixels, never more than three tenths), the figure keeps the
 * largest centred square above it, and the cells share the band in a
 * centred row that shrinks to fit when there are many.
 */
export function stripLayout(width: number, height: number, count: number): StripLayout {
  const band = Math.min(Math.max(MIN_BAND, height * BAND_SHARE), height * MAX_BAND_SHARE);
  const figureArea = height - band;
  const figureSize = Math.max(0, Math.min(width, figureArea));
  const figure = {
    x: (width - figureSize) / 2,
    y: (figureArea - figureSize) / 2,
    size: figureSize,
  };
  if (count <= 0) return { figure, cells: [] };
  const perCell = 1 + CELL_GAP;
  const fitWidth = (width * ROW_SHARE) / (count * perCell - CELL_GAP);
  const size = Math.max(0, Math.min(band * CELL_SHARE, fitWidth));
  const gap = size * CELL_GAP;
  const rowWidth = count * size + (count - 1) * gap;
  const x0 = (width - rowWidth) / 2;
  const y = figureArea + (band - size) / 2;
  const cells = Array.from({ length: count }, (_, i) => ({
    x: x0 + i * (size + gap),
    y,
    size,
  }));
  return { figure, cells };
}

/** An unlit cell's strength; a lit one goes to full. */
const DIM_ALPHA = 0.35;
/** The ring's padding and width as shares of the cell. */
const RING_PAD = 0.06;
const RING_WIDTH = 0.04;

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

  const layout = frame.strip ? stripLayout(width, height, frame.strip.cells.length) : null;
  const size = layout ? layout.figure.size : Math.min(width, height);
  if (size <= 0) return;
  const offsetX = layout ? layout.figure.x : (width - size) / 2;
  const offsetY = layout ? layout.figure.y : (height - size) / 2;
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

  if (frame.strip && layout) drawStrip(ctx, frame, layout, lineWeight, size);
}

/**
 * The band: each sequence's still at its cell's size, dimmed unless lit,
 * with a ring on the lit one. No glow, so an export frame costs about the
 * same with the strip as without.
 */
function drawStrip(
  ctx: CanvasRenderingContext2D,
  frame: ShiftingMandalaFrame,
  layout: StripLayout,
  lineWeight: number,
  figureSize: number
): void {
  const cells = frame.strip?.cells ?? [];
  cells.forEach((cell, i) => {
    const box = layout.cells[i];
    if (!box || box.size <= 0) return;
    ctx.save();
    ctx.globalAlpha = DIM_ALPHA + (1 - DIM_ALPHA) * cell.lit;
    renderMandalaToCanvas(ctx, cell.paths, {
      size: box.size,
      style: "stroke",
      show: "both",
      palette: frame.palette,
      // Lines in a small still read at the figure's weight, not thinner.
      strokeWidth: lineWeight * Math.max(1, figureSize / Math.max(1, box.size) / 3),
      tipDx: MANDALA_STANDARD_TIP_DX,
      gradient: frame.gradient,
      offsetX: box.x,
      offsetY: box.y,
    });
    ctx.restore();
    if (cell.lit <= 0) return;
    const pad = box.size * RING_PAD;
    const ringWidth = Math.max(1.5, box.size * RING_WIDTH);
    ctx.save();
    ctx.globalAlpha = cell.lit;
    ctx.strokeStyle = frame.palette.leftStroke;
    ctx.lineWidth = ringWidth;
    ctx.beginPath();
    const x = box.x - pad;
    const y = box.y - pad;
    const side = box.size + pad * 2;
    const radius = side * 0.12;
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, side, side, radius);
    } else {
      ctx.rect(x, y, side, side);
    }
    ctx.stroke();
    ctx.restore();
  });
}
