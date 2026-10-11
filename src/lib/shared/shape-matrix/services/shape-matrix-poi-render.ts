/**
 * Poi trail painter for shape-matrix cells — the light-painting look from
 * the PoiNotation port (C:/poi-notation `draw.ts`): layered translucent
 * strokes under `globalCompositeOperation: "lighter"` for glow (never
 * shadowBlur on paths — ~100x more expensive per that file's perf notes),
 * hue drifting along each trail via a bbox gradient, black stage.
 *
 * Geometry is NOT re-derived: cells stroke the same `MandalaPaths` (real
 * TKA-sequence flower paths) the club-style painter uses, with the same
 * center/scale transform as `renderMandalaToCanvas`, so the poi view stays
 * TKA-canon by construction. Signatures mirror `shape-matrix-render.ts` so
 * the grid can swap painters.
 */

import {
  MANDALA_GRID_RADIUS,
  ENGINE_GRID_RADIUS,
  MANDALA_STANDARD_TIP_DX,
} from "#lib/shared/mandala/domain/mandala-constants.js";
import type {
  MandalaPaths,
  SVGPathData,
} from "#lib/shared/mandala/domain/mandala-types.js";

/** Hue drift per hand: blue trails run cyan→indigo, red run amber→magenta. */
const HAND_STOPS: Record<"left" | "right", [string, string]> = {
  left: ["hsl(187 100% 62%)", "hsl(248 100% 66%)"],
  right: ["hsl(38 100% 60%)", "hsl(322 100% 62%)"],
};

const STAGE_COLOR = "#050508";

/** Glow passes as [widthFactor, alphaFactor] over the core stroke width. */
const PASSES: ReadonlyArray<[number, number]> = [
  [4.0, 0.1],
  [2.0, 0.24],
  [1.0, 0.9],
];

/** Same fit math as the mandala renderer: grid radius + tip reach fills the box. */
function fitScale(sizePx: number, tipDx: number): number {
  const effectiveTipDx = Math.max(tipDx, MANDALA_STANDARD_TIP_DX);
  const tipReach = (effectiveTipDx * MANDALA_GRID_RADIUS) / ENGINE_GRID_RADIUS;
  return sizePx / 2 / ((MANDALA_GRID_RADIUS + tipReach) * 1.05);
}

function pathBBox(d: string): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const nums = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i]!,
      y = nums[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

function strokeTrails(
  ctx: CanvasRenderingContext2D,
  pathData: readonly SVGPathData[],
  stops: [string, string],
  coreWidth: number
): void {
  for (const { d } of pathData) {
    const path = new Path2D(d);
    const b = pathBBox(d);
    const gradient = ctx.createLinearGradient(b.minX, b.minY, b.maxX, b.maxY);
    gradient.addColorStop(0, stops[0]);
    gradient.addColorStop(1, stops[1]);
    ctx.strokeStyle = gradient;
    for (const [widthFactor, alpha] of PASSES) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = coreWidth * widthFactor;
      ctx.stroke(path);
    }
  }
}

function paint(
  paths: MandalaPaths,
  show: "left" | "right" | "both",
  sizePx: number,
  tipDx: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = STAGE_COLOR;
  ctx.fillRect(0, 0, sizePx, sizePx);

  ctx.save();
  ctx.translate(sizePx / 2, sizePx / 2);
  ctx.scale(fitScale(sizePx, tipDx), fitScale(sizePx, tipDx));
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Core width in path space: constant on screen regardless of cell size.
  const coreWidth = 2.2 / fitScale(sizePx, tipDx);
  if (show === "left" || show === "both")
    strokeTrails(ctx, paths.left, HAND_STOPS.left, coreWidth);
  if (show === "right" || show === "both")
    strokeTrails(ctx, paths.right, HAND_STOPS.right, coreWidth);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

/** Poi-trail overlay of one left flower (rows) with one right flower (columns). */
export function renderPoiCell(
  left: MandalaPaths,
  right: MandalaPaths,
  sizePx: number,
  tipDx: number
): string {
  const merged: MandalaPaths = { left: left.left, right: right.right, purple: [] };
  return paint(merged, "both", sizePx, tipDx);
}

/** A single poi-trail axis-header flower. */
export function renderPoiHeader(
  paths: MandalaPaths,
  hand: "left" | "right",
  sizePx: number,
  tipDx: number
): string {
  return paint(paths, hand, sizePx, tipDx);
}
