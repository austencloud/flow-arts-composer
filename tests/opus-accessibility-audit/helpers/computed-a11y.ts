/**
 * Measurement helpers for the accessibility audit: real `getComputedStyle`
 * values and real `getBoundingClientRect` geometry, taken from a live Chromium
 * page with the app's own theme variables applied.
 *
 * Owned by tests/opus-accessibility-audit.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseColor(value: string): Rgba | null {
  const match = value
    .trim()
    .match(
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.%]+))?\s*\)$/
    );
  if (!match) return null;
  const alphaRaw = match[4];
  const a =
    alphaRaw === undefined
      ? 1
      : alphaRaw.endsWith("%")
        ? Number.parseFloat(alphaRaw) / 100
        : Number.parseFloat(alphaRaw);
  return {
    r: Number.parseFloat(match[1]!),
    g: Number.parseFloat(match[2]!),
    b: Number.parseFloat(match[3]!),
    a: Number.isFinite(a) ? a : 1,
  };
}

/** Source-over composite of `top` onto an already-opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return {
    r: top.r * a + bottom.r * (1 - a),
    g: top.g * a + bottom.g * (1 - a),
    b: top.b * a + bottom.b * (1 - a),
    a: 1,
  };
}

function channelLuminance(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance({ r, g, b }: Rgba): number {
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The colour actually painted behind `el`, resolved by compositing every
 * ancestor's computed `background-color` down to an opaque base.
 *
 * Background *images* (gradients, art) are not sampled — where one is present
 * the caller must say so, because this returns only the colour layer.
 */
export function effectiveBackground(
  el: Element,
  base: Rgba = { r: 255, g: 255, b: 255, a: 1 }
): { color: Rgba; sawBackgroundImage: boolean } {
  // Layers nearest-first: the element's own background, then each ancestor's,
  // stopping at the first opaque one.
  const layers: Rgba[] = [];
  let sawBackgroundImage = false;
  let foundOpaque = false;
  let node: Element | null = el;

  while (node) {
    const style = getComputedStyle(node);
    if (style.backgroundImage && style.backgroundImage !== "none") {
      sawBackgroundImage = true;
    }
    const parsed = parseColor(style.backgroundColor);
    if (parsed && parsed.a > 0) {
      layers.push(parsed);
      if (parsed.a >= 1) {
        foundOpaque = true;
        break;
      }
    }
    node = node.parentElement;
  }

  // Composite from the bottom layer upward.
  let result: Rgba = foundOpaque ? { ...layers.pop()!, a: 1 } : base;
  for (let i = layers.length - 1; i >= 0; i--) {
    result = composite(layers[i]!, result);
  }

  return { color: result, sawBackgroundImage };
}

export interface TextContrastReading {
  ratio: number;
  fontSizePx: number;
  fontWeight: number;
  /** WCAG "large text": >=24px, or >=18.66px when bold. */
  isLargeText: boolean;
  /** The AA floor this text must clear: 3.0 for large text, else 4.5. */
  aaFloor: number;
  foreground: string;
  background: string;
  sawBackgroundImage: boolean;
}

export function readTextContrast(
  el: Element,
  base?: Rgba
): TextContrastReading | null {
  const style = getComputedStyle(el);
  const fg = parseColor(style.color);
  if (!fg) return null;

  const { color: bgColor, sawBackgroundImage } = effectiveBackground(el, base);
  const composited = fg.a < 1 ? composite(fg, bgColor) : fg;

  const fontSizePx = Number.parseFloat(style.fontSize);
  const fontWeight = Number.parseInt(style.fontWeight, 10) || 400;
  const isLargeText =
    fontSizePx >= 24 || (fontWeight >= 700 && fontSizePx >= 18.66);

  return {
    ratio: contrastRatio(composited, bgColor),
    fontSizePx,
    fontWeight,
    isLargeText,
    aaFloor: isLargeText ? 3 : 4.5,
    foreground: style.color,
    background: `rgb(${bgColor.r.toFixed(0)}, ${bgColor.g.toFixed(0)}, ${bgColor.b.toFixed(0)})`,
    sawBackgroundImage,
  };
}

/**
 * The pointer target size of an element, including any padding its own box
 * contributes. Uses the live layout box, not declared CSS.
 */
export function targetSize(el: Element): { width: number; height: number } {
  const rect = el.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}
