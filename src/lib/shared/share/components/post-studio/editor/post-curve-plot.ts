/**
 * Pure coordinate mapping for PostCurveEditor's SVG bezier plot.
 *
 * An easing control point's x sits in [0, 1] and its y in [yMin, yMax] (see
 * POST_EASING_Y_MIN/MAX) - a bigger range than x because overshoot curves
 * dip below 0 or rise above 1. The plot draws both over the same square of
 * pixels, and SVG y grows downward while the plot draws y increasing upward,
 * so the two axes need different (if related) formulas. Pixel-to-data
 * conversions clamp to the data range, so a drag past the plot's edge still
 * lands on a valid control point instead of an out-of-range value.
 */
export interface CurvePlotGeometry {
  /** Padding in plot pixels between the SVG's edge and the data square. */
  padPx: number;
  /** Side length in plot pixels of the square the data range fills. */
  plotPx: number;
  yMin: number;
  yMax: number;
}

export function dataToPlotX(x: number, geometry: CurvePlotGeometry): number {
  return geometry.padPx + x * geometry.plotPx;
}

export function dataToPlotY(y: number, geometry: CurvePlotGeometry): number {
  const { padPx, plotPx, yMin, yMax } = geometry;
  return padPx + ((yMax - y) / (yMax - yMin)) * plotPx;
}

export function plotToDataX(px: number, geometry: CurvePlotGeometry): number {
  const raw = (px - geometry.padPx) / geometry.plotPx;
  return Math.min(1, Math.max(0, raw));
}

export function plotToDataY(py: number, geometry: CurvePlotGeometry): number {
  const { padPx, plotPx, yMin, yMax } = geometry;
  const raw = yMax - ((py - padPx) / plotPx) * (yMax - yMin);
  return Math.min(yMax, Math.max(yMin, raw));
}
