/**
 * Shape Matrix still renderers. Every image here is painted by the animation
 * canvas's own guide painter (`renderMandalaGuideImage`), in the animation
 * canvas's own hand colors and stroke, so a tile, a header, and the detail
 * hero's floor are the mandala the animator draws — not a lookalike.
 */
import type {
  MandalaHandVisibility,
  MandalaPaths,
} from "$lib/shared/mandala/domain/mandala-types";
import { DEFAULT_MANDALA_OVERLAY_CONFIG } from "$lib/shared/mandala/domain/mandala-overlay-types";
import {
  mandalaGuideScale,
  renderMandalaGuideImage,
  type MandalaGuideFit,
  type MandalaGuideImageDependencies,
} from "$lib/shared/mandala/services/mandala-guide-image";
import { computeEngineAlignedMandalaScale } from "$lib/shared/mandala/services/mandala-path-preparer";
import { HERO_TRAIL_PRESET } from "$lib/shared/landing/data/hero-trail-preset";

/**
 * The hand colors every Shape Matrix still uses — the same preset the detail
 * animator plays with, so the still and the live guide share ink by data.
 */
export const SHAPE_MATRIX_GUIDE_COLORS = {
  left: HERO_TRAIL_PRESET.leftColor,
  right: HERO_TRAIL_PRESET.rightColor,
} as const;

/** The two user-selected inks applied to a matrix still. */
export interface ShapeMatrixGuideColors {
  left: string;
  right: string;
}

/** Stroke width in CSS pixels; the live overlay's default. */
export const SHAPE_MATRIX_GUIDE_STROKE_WIDTH =
  DEFAULT_MANDALA_OVERLAY_CONFIG.strokeWidth;

export interface ShapeMatrixPaintOptions {
  /** Device pixels per CSS pixel; defaults to the window's. */
  dpr?: number;
  deps?: MandalaGuideImageDependencies;
  /**
   * An embedding surface's chosen hand colors. Omit this for intentionally
   * curated artwork, which retains the Matrix's hero palette.
   */
  colors?: ShapeMatrixGuideColors;
}

function paint(
  paths: MandalaPaths,
  show: MandalaHandVisibility,
  sizePx: number,
  tipDx: number,
  fit: MandalaGuideFit,
  options: ShapeMatrixPaintOptions = {}
): string {
  const colors = options.colors ?? SHAPE_MATRIX_GUIDE_COLORS;
  return renderMandalaGuideImage(
    paths,
    {
      size: sizePx,
      dpr: options.dpr,
      show,
      leftColor: colors.left,
      rightColor: colors.right,
      strokeWidth: SHAPE_MATRIX_GUIDE_STROKE_WIDTH,
      fit,
      tipDx,
    },
    options.deps
  );
}

/**
 * Overlay one left-hand flower (rows) with one right-hand flower (columns).
 * Painted at extent fit: the drawing fills the tile. The detail hero shows
 * this same extent-fit picture in a box sized by `engineExtentBoxRatio`, so
 * the shared-element morph between them is a uniform scale and translate of
 * one picture, never a crossfade between two fits.
 */
export function renderCell(
  left: MandalaPaths,
  right: MandalaPaths,
  sizePx: number,
  tipDx: number,
  options?: ShapeMatrixPaintOptions
): string {
  const merged: MandalaPaths = {
    left: left.left,
    right: right.right,
    purple: [],
  };
  return renderExtentFit(merged, sizePx, tipDx, options);
}

/** A single axis-header flower, filling its box like the cells. */
export function renderHeader(
  paths: MandalaPaths,
  hand: "left" | "right",
  sizePx: number,
  tipDx: number,
  options?: ShapeMatrixPaintOptions
): string {
  return paint(paths, hand, sizePx, tipDx, "extent", options);
}

/** Both hands filling a square of `sizePx`: the tile's fit. */
export function renderExtentFit(
  paths: MandalaPaths,
  sizePx: number,
  tipDx: number,
  options?: ShapeMatrixPaintOptions
): string {
  return paint(paths, "both", sizePx, tipDx, "extent", options);
}

/**
 * The side of the extent-fit box that holds exactly the drawing the engine
 * paints in a square, as a fraction of that square. Both fits are linear in
 * their box, so the ratio is a property of the paths alone. The detail hero
 * sizes its still to `square * ratio` and paints it at extent fit: the same
 * pixels the live canvas draws in the full square, and the same picture a
 * matrix tile shows.
 */
export function engineExtentBoxRatio(
  paths: MandalaPaths,
  tipDx: number
): number {
  const extentScale = mandalaGuideScale(paths, {
    size: 1,
    fit: "extent",
    show: "both",
    tipDx,
  });
  return computeEngineAlignedMandalaScale(1) / extentScale;
}

/**
 * Both hands at the animation engine's alignment for a square of `sizePx`:
 * stacked over an AnimatorCanvas of the same square, the strokes sit exactly
 * where the live guide paints them.
 */
export function renderEngineAligned(
  paths: MandalaPaths,
  sizePx: number,
  options?: ShapeMatrixPaintOptions
): string {
  return paint(paths, "both", sizePx, 0, "engine", options);
}
