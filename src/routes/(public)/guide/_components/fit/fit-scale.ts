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

/**
 * The search started from a known scale (the last fit's, when a page change
 * keeps the window): content of a similar height lands in a probe or two
 * instead of the bisection's ten, so the next topic is fitted before the
 * route's crossfade takes its picture (2026-11-01; the full search left the
 * body blank for ~250 ms). A scale is good once it fits and fills `fill` of
 * the area. Each guess scales the last probe by the room left, or
 * interpolates between the nearest fitting and overflowing probes, and
 * bisects when a guess leaves that bracket.
 */
export async function fitScaleFromSeedAsync(
  measure: (scale: number) => Promise<FitMeasure>,
  areaHeight: number,
  stale: () => boolean,
  seed: number,
  min = FIT_MIN_SCALE,
  max = FIT_MAX_SCALE,
  fill = 0.97,
  probes = 8
): Promise<FitResult | null> {
  const fitsIn = (m: FitMeasure) =>
    !m.overflowsWidth && m.height <= areaHeight + 0.5;
  // Aim a little under full so the guess lands inside the good band.
  const aim = areaHeight * (1 + fill) * 0.5;
  let lo = min;
  let hi = max;
  let loHeight = -1; // a probe that fits, at lo
  let hiHeight = -1; // a probe that overflows by height alone, at hi
  let loKnown = false;
  let hiKnown = false;
  let s = Math.min(max, Math.max(min, seed));
  for (let n = 0; n < probes; n++) {
    if (stale()) return null;
    const m = await measure(s);
    if (stale()) return null;
    if (fitsIn(m)) {
      if (m.height >= areaHeight * fill || s >= max)
        return { scale: Math.floor(s * 1000) / 1000, fits: true };
      lo = s;
      loHeight = m.height;
      loKnown = true;
    } else {
      if (s <= min) return { scale: min, fits: false };
      hi = s;
      hiHeight = m.overflowsWidth ? -1 : m.height;
      hiKnown = true;
    }
    if (hi - lo < 0.005) break;
    let next: number;
    if (loKnown && hiKnown && loHeight > 0 && hiHeight > loHeight) {
      next = lo + ((aim - loHeight) / (hiHeight - loHeight)) * (hi - lo);
    } else if (m.height > 0 && !m.overflowsWidth) {
      next = s * (aim / m.height);
    } else {
      next = (lo + hi) / 2;
    }
    if (!hiKnown && next >= max) next = max;
    else if (!loKnown && next <= min) next = min;
    else if (!(next > lo && next < hi)) next = (lo + hi) / 2;
    s = next;
  }
  if (stale()) return null;
  if (loKnown) return { scale: Math.floor(lo * 1000) / 1000, fits: true };
  return fitScaleAsync(measure, areaHeight, stale, min, max);
}
