// OKLCH, the color space where equal steps look like equal steps: l is
// perceived lightness from 0 to 1, c is colorfulness, h is the hue angle. The
// preset generator (scripts/generate-color-presets.mjs) and the prop color
// dice both build their sRGB colors here. Node runs this file directly for the
// generator, so it keeps to plain TypeScript with no $lib imports.
// Björn Ottosson's Oklab matrices: https://bottosson.github.io/posts/oklab/

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

function oklchToLinearSrgb(
  l: number,
  c: number,
  hueDegrees: number
): [number, number, number] {
  const h = (hueDegrees * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const long = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const medium = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const short = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short,
  ];
}

function inGamut(rgb: readonly number[]): boolean {
  return rgb.every((channel) => channel >= -1e-6 && channel <= 1 + 1e-6);
}

function toGammaByte(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  const gamma =
    clamped <= 0.0031308
      ? 12.92 * clamped
      : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(gamma * 255);
}

function toLinear(byte: number): number {
  const gamma = byte / 255;
  return gamma <= 0.04045 ? gamma / 12.92 : ((gamma + 0.055) / 1.055) ** 2.4;
}

/** The most chroma sRGB can show at this lightness and hue, in 0.002 steps. */
export function maxChroma(l: number, hue: number): number {
  let chroma = 0;
  while (chroma < 0.4 && inGamut(oklchToLinearSrgb(l, chroma + 0.002, hue)))
    chroma += 0.002;
  return chroma;
}

/** Walks chroma down until the color fits sRGB; hue and lightness stay put. */
export function oklchToHex(l: number, c: number, hue: number): string {
  // Achromatic special case: at c=0, hue is meaningless and floating-point
  // matrix roundoff can nudge a channel a hair past 0 or 1. Route l=1/l=0
  // straight to pure white/black so the neutral row's endpoints are exact.
  if (c === 0) {
    if (l >= 1) return "#ffffff";
    if (l <= 0) return "#000000";
  }
  let chroma = c;
  let rgb = oklchToLinearSrgb(l, chroma, hue);
  while (!inGamut(rgb) && chroma > 0) {
    chroma = Math.max(0, chroma - 0.002);
    rgb = oklchToLinearSrgb(l, chroma, hue);
  }
  return linearSrgbToHex(rgb);
}

/** Light-linear sRGB channels, 0 to 1, the space color mixing happens in. */
export function hexToLinearSrgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((at) =>
    toLinear(parseInt(value.slice(at, at + 2), 16))
  ) as [number, number, number];
}

/** Clamps each light-linear channel into 0 to 1 and rounds to a hex color. */
export function linearSrgbToHex(rgb: readonly number[]): string {
  return `#${rgb.map((channel) => toGammaByte(channel).toString(16).padStart(2, "0")).join("")}`;
}

export function hexToOklch(hex: string): Oklch {
  const [r, g, b] = hexToLinearSrgb(hex);
  const long = Math.cbrt(
    0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  );
  const medium = Math.cbrt(
    0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  );
  const short = Math.cbrt(
    0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  );
  const a = 1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short;
  const bAxis =
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short;
  return {
    l: 0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
    c: Math.hypot(a, bAxis),
    h: ((Math.atan2(bAxis, a) * 180) / Math.PI + 360) % 360,
  };
}

/** Straight-line distance in Oklab; about 0.02 is the smallest visible step. */
export function oklabDistance(x: Oklch, y: Oklch): number {
  const toAb = ({ c, h }: Oklch) => {
    const radians = (h * Math.PI) / 180;
    return [c * Math.cos(radians), c * Math.sin(radians)];
  };
  const [xa, xb] = toAb(x);
  const [ya, yb] = toAb(y);
  return Math.hypot(x.l - y.l, xa! - ya!, xb! - yb!);
}
