/**
 * How large a guide screen draws its figures so the screen fills its area
 * without overflowing it (2026-10-24 guide fit pass, the /codex rule: the page
 * never scrolls, and the thing being looked at takes the space it has).
 *
 * The scale is a CSS custom property, `--fit`, that only figure sizes read
 * (pictograph cards, sequence showcases, galleries). Prose and controls keep
 * their type roles at every size (.claude/rules/4k-native-layout.md:
 * pictographs scale with their container, the UI around them does not).
 *
 * A larger scale makes the content taller, so "fits" flips once from true to
 * false as the scale grows; a bisection finds the edge.
 */

export interface FitMeasure {
  /** Drawn height of the content at this scale, in CSS pixels. */
  height: number;
  /** True when the content is wider than its area at this scale. */
  overflowsWidth: boolean;
}

export interface FitResult {
  scale: number;
  /** False when even the smallest scale overflows: the area pans instead. */
  fits: boolean;
}

/** Figures never shrink below this share of their designed size. */
export const FIT_MIN_SCALE = 0.45;
/** Figures grow up to this multiple on a large screen. */
export const FIT_MAX_SCALE = 4;

export function fitScale(
  measure: (scale: number) => FitMeasure,
  areaHeight: number,
  min = FIT_MIN_SCALE,
  max = FIT_MAX_SCALE,
  iterations = 10
): FitResult {
  const fits = (s: number) => {
    const m = measure(s);
    return !m.overflowsWidth && m.height <= areaHeight + 0.5;
  };
  if (fits(max)) return { scale: max, fits: true };
  if (!fits(min)) return { scale: min, fits: false };
  let lo = min;
  let hi = max;
  for (let n = 0; n < iterations; n++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) lo = mid;
    else hi = mid;
  }
  return { scale: Math.floor(lo * 1000) / 1000, fits: true };
}

/**
 * The same search for content that lays out asynchronously (a step strip
 * picks its columns from its measured width a frame later): `measure`
 * resolves once the content has settled at that scale. Returns null when
 * `stale()` turns true mid-search, so a newer fit wins.
 */
export async function fitScaleAsync(
  measure: (scale: number) => Promise<FitMeasure>,
  areaHeight: number,
  stale: () => boolean,
  min = FIT_MIN_SCALE,
  max = FIT_MAX_SCALE,
  iterations = 8
): Promise<FitResult | null> {
  const fits = async (s: number) => {
    const m = await measure(s);
    return !m.overflowsWidth && m.height <= areaHeight + 0.5;
  };
  if (await fits(max)) return stale() ? null : { scale: max, fits: true };
  if (stale()) return null;
  if (!(await fits(min))) return stale() ? null : { scale: min, fits: false };
  let lo = min;
  let hi = max;
  for (let n = 0; n < iterations; n++) {
    if (stale()) return null;
    const mid = (lo + hi) / 2;
    if (await fits(mid)) lo = mid;
    else hi = mid;
  }
  return stale() ? null : { scale: Math.floor(lo * 1000) / 1000, fits: true };
}
