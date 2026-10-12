/**
 * Small color helpers shared by the Canvas2D effect renderers. Renderers that
 * build gradients every frame keep colors as RGB triples and format them once
 * per stop instead of re-parsing CSS strings.
 */

export type Rgb = [number, number, number];

export const WHITE: Rgb = [255, 255, 255];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** `rgba(r, g, b, a)` with the alpha clamped to [0, 1]. */
export function rgba(c: Rgb, alpha: number): string {
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${clamp01(alpha)})`;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Hue in turns (0..1), saturation and lightness in 0..1. */
export function hslToRgb(
  hue: number,
  saturation: number,
  lightness: number
): Rgb {
  const h = (((hue % 1) + 1) % 1) * 6;
  const sat = clamp01(saturation);
  const l = clamp01(lightness);
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 1
      ? [c, x, 0]
      : h < 2
        ? [x, c, 0]
        : h < 3
          ? [0, c, x]
          : h < 4
            ? [0, x, c]
            : h < 5
              ? [x, 0, c]
              : [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** Parse #rgb, #rrggbb, #rrggbbaa, rgb()/rgba() and hsl()/hsla(); anything else is white. */
export function parseCssRgb(color: string): Rgb {
  const s = color.trim();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) {
      h = h
        .slice(0, 3)
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const n = parseInt(h.slice(0, 6), 16);
    if (h.length >= 6 && Number.isFinite(n))
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    return [...WHITE];
  }
  const nums = s.match(/-?\d*\.?\d+/g)?.map(Number) ?? [];
  if (s.startsWith("rgb") && nums.length >= 3) {
    return [nums[0]!, nums[1]!, nums[2]!].map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
    ) as Rgb;
  }
  if (s.startsWith("hsl") && nums.length >= 3) {
    return hslToRgb(nums[0]! / 360, nums[1]! / 100, nums[2]! / 100);
  }
  return [...WHITE];
}
