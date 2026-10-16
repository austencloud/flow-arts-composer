/**
 * Ribbon shape and colour helpers for the Silk thumbnail. They came from the
 * old path-swept 2D renderer, which the cloth renderer replaced; the approved
 * thumbnail still draws its frozen ribbon with them.
 */
import type { SilkPalette } from "#lib/shared/effects/domain/silk-palettes.js";

interface ColorMix {
  propColorMix: number;
  edgeBodyMix: number;
  shadowMix: number;
}

const COLOR_MIXES: Record<SilkPalette["id"], ColorMix> = {
  satin: { propColorMix: 0.82, edgeBodyMix: 0.88, shadowMix: 0.28 },
  velvet: { propColorMix: 0.2, edgeBodyMix: 0.35, shadowMix: 0.54 },
  ethereal: { propColorMix: 0.42, edgeBodyMix: 0.45, shadowMix: 0.3 },
  shadow: { propColorMix: 0.3, edgeBodyMix: 0.5, shadowMix: 0.65 },
  gold_leaf: { propColorMix: 0.14, edgeBodyMix: 0.28, shadowMix: 0.48 },
  ember: { propColorMix: 0.16, edgeBodyMix: 0.32, shadowMix: 0.46 },
  custom: { propColorMix: 0.36, edgeBodyMix: 0.48, shadowMix: 0.45 },
};

/**
 * Silk opens quickly from its free tail, holds a broad middle, then gathers
 * into the prop tip. Both ends stay non-zero so the spline remains stable.
 */
export function resolveSilk2DWidthEnvelope(positionFraction: number): number {
  const p = clamp01(positionFraction);
  const tailTaper = smoothstep(0, 0.14, p);
  const attachmentThroat = 1 - 0.9 * smoothstep(0.84, 1, p);
  return Math.max(0.06, tailTaper * attachmentThroat);
}

/** Distance-based sampling keeps the cloth equally smooth at every frame rate. */
export function resolveSilk2DSampleSpacing(scale: number): number {
  return 4 * Math.max(0.25, scale);
}

/**
 * Motion interpolation can leave tiny frame-to-frame corners in an otherwise
 * smooth path. Three light neighbor passes remove that grit while keeping both
 * the free tail and the prop attachment exactly where they were recorded.
 */
export function smoothSilk2DPath(points: readonly { x: number; y: number }[]): {
  x: number[];
  y: number[];
} {
  let x = points.map((point) => point.x);
  let y = points.map((point) => point.y);
  if (points.length < 3) return { x, y };

  for (let pass = 0; pass < 3; pass++) {
    const nextX = [...x];
    const nextY = [...y];
    for (let index = 1; index < points.length - 1; index++) {
      nextX[index] = x[index]! * 0.56 + (x[index - 1]! + x[index + 1]!) * 0.22;
      nextY[index] = y[index]! * 0.56 + (y[index - 1]! + y[index + 1]!) * 0.22;
    }
    x = nextX;
    y = nextY;
  }

  return { x, y };
}

/** Resolve palette material color while retaining each prop's identity. */
export function resolveSilk2DMaterialColors(
  palette: SilkPalette,
  propColor: string,
  positionFraction: number
): { body: string; edge: string; shadow: string } {
  const profile = COLOR_MIXES[palette.id] ?? COLOR_MIXES.satin;
  const p = clamp01(positionFraction);
  const paletteBody =
    palette.hueShift && palette.bodyAlt
      ? mixColor(palette.body, palette.bodyAlt, p)
      : palette.body;
  const paletteEdge =
    palette.hueShift && palette.edgeAlt
      ? mixColor(palette.edge, palette.edgeAlt, p)
      : palette.edge;
  const body = mixColor(paletteBody, propColor, profile.propColorMix);
  const edge = mixColor(paletteEdge, body, profile.edgeBodyMix);

  return {
    body,
    edge,
    shadow: mixColor(body, "#05050c", profile.shadowMix),
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function colorToRgb(color: string): [number, number, number] {
  if (color.startsWith("rgb")) {
    const channels = color
      .match(/[\d.]+/g)
      ?.slice(0, 3)
      .map(Number);
    if (channels?.length === 3) return channels as [number, number, number];
  }

  const source = color.replace(/^#/, "");
  const normalized =
    source.length === 3
      ? source
          .split("")
          .map((channel) => channel + channel)
          .join("")
      : source.slice(0, 6);
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
}

function mixColor(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = colorToRgb(a);
  const [br, bg, bb] = colorToRgb(b);
  const t = clamp01(amount);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const blue = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${blue})`;
}
