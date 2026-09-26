/**
 * Pure coordinate mapping for PostCurveEditor's SVG bezier plot.
 *
 * An easing control point's x sits in [0, 1] and its y in [yMin, yMax] - a
 * bigger range than x because overshoot curves dip below 0 or rise above 1.
 * One data unit is the same number of pixels on both axes, so the square a
 * curve crosses from (0, 0) to (1, 1) draws as a true square, with the
 * overshoot room above and below it, and a curve's shape on screen matches
 * the motion it makes. SVG y grows downward while the plot draws y increasing
 * upward, so the two axes need different (if related) formulas. Pixel-to-data
 * conversions clamp to the data range, so a drag past the plot's edge still
 * lands on a valid control point instead of an out-of-range value.
 */
export interface CurvePlotGeometry {
  /** Padding in plot pixels between the SVG's edge and the data range. */
  padPx: number;
  /** Plot pixels per data unit, the same on both axes. */
  unitPx: number;
  yMin: number;
  yMax: number;
}

/**
 * The y range the curve editor shows and edits: every common easing, back
 * curves included - the usual easeInOutBack, cubic-bezier(0.68, -0.6, 0.32,
 * 1.6), reaches exactly -0.6 and 1.6. The model's POST_EASING_Y_MIN/MAX is
 * wider because it only bounds what a saved project may hold; plotting all
 * of it would leave the 0-to-1 square a third of a mostly empty plot.
 */
export const CURVE_EDITOR_Y_MIN = -0.6;
export const CURVE_EDITOR_Y_MAX = 1.6;

export function plotWidth(geometry: CurvePlotGeometry): number {
  return 2 * geometry.padPx + geometry.unitPx;
}

export function plotHeight(geometry: CurvePlotGeometry): number {
  const { padPx, unitPx, yMin, yMax } = geometry;
  return 2 * padPx + (yMax - yMin) * unitPx;
}

export function dataToPlotX(x: number, geometry: CurvePlotGeometry): number {
  return geometry.padPx + x * geometry.unitPx;
}

export function dataToPlotY(y: number, geometry: CurvePlotGeometry): number {
  const { padPx, unitPx, yMax } = geometry;
  return padPx + (yMax - y) * unitPx;
}

export function plotToDataX(px: number, geometry: CurvePlotGeometry): number {
  const raw = (px - geometry.padPx) / geometry.unitPx;
  return Math.min(1, Math.max(0, raw));
}

export function plotToDataY(py: number, geometry: CurvePlotGeometry): number {
  const { padPx, unitPx, yMin, yMax } = geometry;
  const raw = yMax - (py - padPx) / unitPx;
  return Math.min(yMax, Math.max(yMin, raw));
}
