/**
 * Pure, worker-safe mandala frame logic shared by the export worker.
 *
 * Encapsulates the seamless-loop math (whole rotation turns + whole flow-color
 * cycles) and per-frame SVG synthesis so a Web Worker can render every export
 * frame without touching the DOM. No `document`/`window`/`Image` references —
 * the worker rasterizes the returned SVG string via `createImageBitmap`.
 */

import { calculate as calculateMandalaGeometry } from "./mandala-geometry-calculator";
import { renderMandalaSVG, renderMandalaToCanvas } from "./mandala-renderer";
import { getMandalaPathOptions } from "./mandala-path-options";
import { pairTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";
import { DEFAULT_OVERLAP_CONFIG } from "../domain/mandala-types";
import { mandalaJoinReach, type MandalaHandOffsets } from "./mandala-grid-join";
import type {
  MandalaPalette,
  MandalaPaths,
  MandalaPathShape,
  MandalaHandVisibility,
} from "../domain/mandala-types";
import {
  MANDALA_GRID_RADIUS,
  ENGINE_GRID_RADIUS,
  MANDALA_STANDARD_TIP_DX,
} from "../domain/mandala-constants";

// SVG glow filter stdDeviation (renderMandalaSVG `#glow`). The canvas render
// emulates it with a device-space shadow, so multiply by the render scale.
const GLOW_STDDEV = 3;

// Matches SequenceMandala.ROTATION_REF_PERIOD + controller COLOR_CYCLE_BREATHS
// so exported spin/color rates equal the on-screen rates.
const ROTATION_REF_PERIOD = 5;
const COLOR_CYCLE_BREATHS = 3;

// ── Color helpers (pure) ────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

export function mixColors(a: string, b: string): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(Math.round((ar + br) / 2), Math.round((ag + bg) / 2), Math.round((ab + bb) / 2));
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(
    Math.round(ar + (br - ar) * t),
    Math.round(ag + (bg - ag) * t),
    Math.round(ab + (bb - ab) * t),
  );
}

function sampleGradient(colors: string[], t: number): string {
  const segments = colors.length - 1;
  const scaled = t * segments;
  const idx = Math.min(Math.floor(scaled), segments - 1);
  const frac = scaled - idx;
  return lerpColor(colors[idx]!, colors[idx + 1]!, frac);
}

function breatheEase(t: number): number {
  return Math.pow(Math.sin((t * Math.PI) / 2), 1.6);
}

// ── Frame spec + derived math ───────────────────────────────────────────────

export interface MandalaFrameSpec {
  steps: readonly any[];
  leftPropType?: string;
  rightPropType?: string;
  show?: MandalaHandVisibility;
  pathShape: MandalaPathShape;
  lineWeight: number;
  bgColor: string;
  resolution: number;
  /** Seconds per undulation cycle (BASE_PERIOD / speed). */
  period: number;
  /** Undulation repetitions (1–10). */
  reps: number;
  fps: number;
  /** Max tip dx (controller rangeMax = depth * 2.5). */
  rangeMax: number;
  /** Degrees of spin per ROTATION_REF_PERIOD seconds (0 = no spin). */
  rotation: number;
  /** Resolved flow-mode morph colors, or null in solid mode. */
  morphColors: string[] | null;
  /** Resolved solid pair, or null in flow mode. */
  solidPair: [string, string] | null;
  /**
   * Joined grids: each hand's figure offset (mandala units) onto its own grid,
   * as the on-screen mandala draws it. Absent or null for one grid. Plain
   * numbers, so it crosses the worker boundary as is.
   */
  handOffsets?: MandalaHandOffsets | null;
}

export interface MandalaFrameMath {
  framesPerCycle: number;
  totalFrames: number;
  /** Whole rotation turns across the clip (≥1 when spin enabled). */
  turns: number;
  /** Whole flow-color cycles across the clip (0 in solid mode). */
  colorCycles: number;
}

/**
 * Derive seamless-loop counts. Undulation repeats `reps` identical cycles.
 * Rotation is forced to a whole number of turns (≥1 when spinning) so the clip
 * starts and ends at the same angle. Flow color uses whole cycles likewise.
 */
export function deriveFrameMath(spec: MandalaFrameSpec): MandalaFrameMath {
  const framesPerCycle = Math.max(1, Math.ceil(spec.period * spec.fps));
  const totalFrames = framesPerCycle * spec.reps;

  const turnsRaw = ((spec.period * spec.reps) / ROTATION_REF_PERIOD) * spec.rotation / 360;
  const turns = spec.rotation === 0 ? 0 : Math.max(1, Math.round(turnsRaw));

  const colorCycles = spec.morphColors ? Math.max(1, Math.round(spec.reps / COLOR_CYCLE_BREATHS)) : 0;

  return { framesPerCycle, totalFrames, turns, colorCycles };
}

export interface MandalaFrameOutput {
  svg: string;
  rotDeg: number;
  /**
   * Cache key for solid-color mode: frames within a cycle repeat across reps
   * (only rotation differs, applied post-raster), so the un-rotated bitmap can
   * be cached by this key. Null in flow mode (palette differs every frame).
   */
  cacheKey: number | null;
}

type FrameGradient = { left: [string, string]; right: [string, string]; purple: [string, string] };

export interface MandalaFrameRender {
  paths: MandalaPaths;
  palette: MandalaPalette;
  gradient: FrameGradient | undefined;
  tipDx: number;
  rotDeg: number;
  cacheKey: number | null;
}

/** Geometry for frame `i`. Depends ONLY on the undulation phase
 *  (`i % framesPerCycle`), so it is identical across repetitions in both solid
 *  and flow mode — cache it by cycle index to compute `framesPerCycle` sets
 *  instead of `totalFrames`. */
export interface MandalaFrameGeometry {
  paths: MandalaPaths;
  tipDx: number;
}

/** Per-cycle geometry index → geometry. Pass the same map across all frames of
 *  one export so each undulation phase is computed once. */
export type MandalaGeometryCache = Map<number, MandalaFrameGeometry>;

function computeFrameGeometry(
  spec: MandalaFrameSpec,
  math: MandalaFrameMath,
  i: number,
): MandalaFrameGeometry {
  const cyclePhase = (i % math.framesPerCycle) / math.framesPerCycle;
  const triangle = cyclePhase < 0.5 ? cyclePhase * 2 : 2 - cyclePhase * 2;
  const tipDx = spec.rangeMax * breatheEase(triangle);
  const paths = calculateMandalaGeometry(
    spec.steps as any,
    spec.leftPropType,
    spec.rightPropType,
    getMandalaPathOptions(
      spec.pathShape,
      pairTipEnds(spec.leftPropType, spec.rightPropType),
    ),
    { dx: tipDx, dy: 0 },
  );
  return { paths, tipDx };
}

function computeFrameColor(
  spec: MandalaFrameSpec,
  math: MandalaFrameMath,
  i: number,
): { palette: MandalaPalette; gradient: FrameGradient | undefined } {
  const clipT = i / math.totalFrames;
  let c1: string, c2: string;
  let gradient: FrameGradient | undefined;

  if (spec.morphColors) {
    const cPhase = (clipT * math.colorCycles) % 1;
    c1 = sampleGradient(spec.morphColors, cPhase);
    c2 = sampleGradient(spec.morphColors, (cPhase + 0.4) % 1);
    const c3 = sampleGradient(spec.morphColors, (cPhase + 0.7) % 1);
    const mix = mixColors(c1, c2);
    gradient = { left: [c1, c3], right: [c2, c1], purple: [mix, c3] };
  } else {
    c1 = spec.solidPair![0];
    c2 = spec.solidPair![1];
  }

  const mix = mixColors(c1, c2);
  const palette: MandalaPalette = {
    leftStroke: c1, leftFill: withAlpha(c1, 0.15),
    rightStroke: c2, rightFill: withAlpha(c2, 0.15),
    purpleStroke: mix, purpleFill: withAlpha(mix, 0.2),
  };
  return { palette, gradient };
}

/**
 * Pure per-frame derivation: undulation tipDx, rotation, palette, flow gradient,
 * and the computed geometry for frame `i`. Shared by the SVG path (any DOM
 * consumer) and the canvas path (the export worker — fully off main thread).
 */
export function deriveFrameRender(
  spec: MandalaFrameSpec,
  math: MandalaFrameMath,
  i: number,
): MandalaFrameRender {
  const { paths, tipDx } = computeFrameGeometry(spec, math, i);
  const { palette, gradient } = computeFrameColor(spec, math, i);
  const rotDeg = math.turns * 360 * (i / math.totalFrames);
  // Solid mode: geometry depends only on undulation phase → cache per cycle.
  const cacheKey = spec.morphColors ? null : i % math.framesPerCycle;
  return { paths, palette, gradient, tipDx, rotDeg, cacheKey };
}

/** Reusable mask canvases for {@link renderMandalaToCanvas}'s purple-overlap
 *  pass, so the export hot loop doesn't allocate two full-res OffscreenCanvas
 *  per frame. */
export interface MandalaRenderScratch {
  a: OffscreenCanvas;
  b: OffscreenCanvas;
}

/**
 * Render frame `i` directly onto an OffscreenCanvas context — background, the
 * seamless rotation, and the mandala (Path2D, gradient + glow parity with the
 * on-screen SVG). Runs entirely in the export worker, so SVG rasterization
 * never touches the main thread.
 *
 * @param geoCache  per-cycle geometry cache (compute each undulation phase once)
 * @param scratch   reusable mask canvases (avoid per-frame allocation)
 */
export function renderMandalaFrameToCanvas(
  ctx: OffscreenCanvasRenderingContext2D,
  spec: MandalaFrameSpec,
  math: MandalaFrameMath,
  i: number,
  geoCache?: MandalaGeometryCache,
  scratch?: MandalaRenderScratch,
): void {
  const cycleKey = i % math.framesPerCycle;
  let geo = geoCache?.get(cycleKey);
  if (!geo) {
    geo = computeFrameGeometry(spec, math, i);
    geoCache?.set(cycleKey, geo);
  }
  const { palette, gradient } = computeFrameColor(spec, math, i);
  const rotDeg = math.turns * 360 * (i / math.totalFrames);
  const { paths, tipDx } = geo;
  const size = spec.resolution;

  // The on-screen SVG glow stdDeviation is expressed inside the scaled <g>, so
  // its device-space blur equals stdDeviation × renderScale. Recompute the same
  // scale renderMandalaToCanvas uses so the canvas shadow matches.
  const center = size / 2;
  const effectiveTipDx = Math.max(tipDx, MANDALA_STANDARD_TIP_DX);
  const tipReach = (effectiveTipDx * MANDALA_GRID_RADIUS) / ENGINE_GRID_RADIUS;
  const show = spec.show ?? "both";
  // A joined pair reaches past one figure; the renderer widens its fit by the
  // same amount (only when both hands show), so the glow scale follows.
  const joined = show === "both" ? (spec.handOffsets ?? null) : null;
  const renderScale =
    center / ((MANDALA_GRID_RADIUS + tipReach + mandalaJoinReach(joined)) * 1.05);

  ctx.fillStyle = spec.bgColor;
  ctx.fillRect(0, 0, size, size);

  ctx.save();
  if (rotDeg !== 0) {
    ctx.translate(center, center);
    ctx.rotate((rotDeg * Math.PI) / 180);
    ctx.translate(-center, -center);
  }
  renderMandalaToCanvas(ctx as unknown as CanvasRenderingContext2D, paths, {
    size,
    style: "stroke",
    show,
    palette,
    strokeWidth: spec.lineWeight,
    tipDx,
    gradient,
    ...(joined ? { handOffsets: joined } : {}),
    glow: { blur: GLOW_STDDEV * renderScale, bloomBlur: DEFAULT_OVERLAP_CONFIG.bloomBlur * renderScale },
    offsetX: 0,
    offsetY: 0,
    maskScratch: scratch,
  });
  ctx.restore();
}

/**
 * Render frame `i`'s SVG + rotation. The rotation is returned separately so a
 * caller can apply it as a canvas transform after rasterizing. Retained for any
 * DOM-side SVG consumer; the export worker uses {@link renderMandalaFrameToCanvas}.
 */
export function renderMandalaFrameSVG(
  spec: MandalaFrameSpec,
  math: MandalaFrameMath,
  i: number,
): MandalaFrameOutput {
  const { paths, palette, gradient, tipDx, rotDeg, cacheKey } = deriveFrameRender(spec, math, i);

  const rawSvg = renderMandalaSVG(paths, {
    size: spec.resolution,
    style: "stroke",
    show: spec.show ?? "both",
    palette,
    strokeWidth: spec.lineWeight,
    tipDx,
    gradient,
    ...(spec.handOffsets ? { handOffsets: spec.handOffsets } : {}),
  });

  // renderMandalaSVG emits width/height="100%", which has no intrinsic pixel
  // size — `createImageBitmap` then fails with "source image could not be
  // decoded". Give the frame an explicit px size so it rasterizes.
  const svg = rawSvg.replace(
    'width="100%" height="100%"',
    `width="${spec.resolution}" height="${spec.resolution}"`,
  );

  return { svg, rotDeg, cacheKey };
}
