import {
  applyColorToSvg,
  getMotionColor,
  SELECTIVE_COLOR_PROP_TYPES,
} from "$lib/shared/utils/svg-color-utils";
import type { HandSide } from "../../shared/domain/enums/pictograph-enums";

/**
 * Repaint artwork that propSvgLoader has already colored with the default hand
 * color so it shows the user's chosen color instead. The motion stays left or
 * right semantically; only the display paint changes. Class and id suffixes
 * are keyed on the color so two hands can share one host SVG.
 */
export function applyHandColorOverride(
  svg: string,
  hand: HandSide,
  propType: string,
  color: string
): string {
  if (isModelSprite(svg)) return applyModelSpriteColor(svg, color);
  return applyColorToSvg(svg, color, {
    makeClassNamesUnique: true,
    colorSuffix: color.replace(/[^a-z0-9]/gi, ""),
    sourceColors: [getMotionColor(hand, "dark"), getMotionColor(hand, "light")],
    selectiveColorMode: (
      SELECTIVE_COLOR_PROP_TYPES as readonly string[]
    ).includes(propType.toLowerCase()),
  });
}

/** Recolor the body without erasing white strings, grips, covers or cutouts. */
export function colorPropPreview(
  svg: string,
  propType: string,
  color: string
): string {
  return applyColorToSvg(svg, color, {
    transformStroke: true,
    selectiveColorMode: (
      SELECTIVE_COLOR_PROP_TYPES as readonly string[]
    ).includes(propType.toLowerCase()),
    sourceColors: [
      "#2e3192",
      "#2e3191",
      "#3d44b8",
      "#3575e2",
      "#ed1c24",
      "#dc2626",
    ],
  });
}

/** Change a captured model's chromatic paint while retaining neutral details
 * and shading. Unlike an alpha mask, this never fills a hole or widens an edge. */
export function modelPreviewColorMatrix(
  color: string,
  side: "left" | "right"
): string {
  const rgb = [1, 3, 5].map(
    (start) => parseInt(color.slice(start, start + 2), 16) / 255
  );
  // Palette used by the shipped model captures (#3b82f6 / #ef4444).
  // Neutral pixels have zero chroma, so their original details pass through.
  const source = (side === "left" ? [59, 130, 246] : [239, 68, 68]).map(
    (v) => v / 255
  );
  const span =
    side === "left" ? source[2]! - source[0]! : source[0]! - source[1]!;
  const chroma = (side === "left" ? [-1, 0, 1] : [1, -1, 0]).map(
    (v) => v / span
  );
  return [
    ...rgb.flatMap((value, row) => [
      ...chroma.map(
        (weight, col) => (row === col ? 1 : 0) + (value - source[row]!) * weight
      ),
      0,
      0,
    ]),
    0,
    0,
    0,
    1,
    0,
  ].join(" ");
}

const MODEL_SPRITE_TAG = /<svg\b(?=[^>]*\bdata-prop-look="model")[^>]*>/i;
const MODEL_TINT_DEFS = /<defs data-model-tint="">[\s\S]*?<\/defs>/;
// Later id rewrites may suffix the filter id, so only its side prefix is fixed.
const MODEL_TINT_BODY =
  /<g data-model-tint-body="" filter="url\(#model-tint-(left|right)-[^)]*\)">/;

/** A model capture, whole or as the inner markup the prop loader passes on. */
export function isModelSprite(svg: string): boolean {
  return MODEL_SPRITE_TAG.test(svg) || MODEL_TINT_BODY.test(svg);
}

/**
 * Paint a captured model sprite in a hand color. The capture is a raster, so
 * the fill rewrite every other prop uses finds nothing to change; this wraps
 * the capture in the same chroma matrix the picker previews use. The capture
 * file says which palette it was lit in. A second call replaces the first
 * tint instead of stacking on it, because the matrix is only correct against
 * the original capture colors; a tinted capture is recognized by its tint
 * even after the loader strips the outer tag. Any other SVG passes through
 * unchanged.
 */
export function applyModelSpriteColor(svg: string, color: string): string {
  const hex = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : null;
  if (!hex) return svg;
  const tinted = MODEL_TINT_BODY.exec(svg);
  const open = MODEL_SPRITE_TAG.exec(svg);
  if (!tinted && !open) return svg;
  const side = tinted
    ? (tinted[1] as "left" | "right")
    : /\bdata-motion-color="red"/i.test(open![0])
      ? "right"
      : "left";
  const id = `model-tint-${side}-${hex.slice(1)}`;
  const defs =
    `<defs data-model-tint=""><filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">` +
    `<feColorMatrix type="matrix" values="${modelPreviewColorMatrix(hex, side)}"/>` +
    `</filter></defs>`;
  const body = `<g data-model-tint-body="" filter="url(#${id})">`;
  if (tinted && MODEL_TINT_DEFS.test(svg)) {
    return svg.replace(MODEL_TINT_DEFS, defs).replace(MODEL_TINT_BODY, body);
  }
  if (!open) return svg;
  const start = open.index + open[0].length;
  const end = svg.lastIndexOf("</svg>");
  if (end < start) return svg;
  return `${svg.slice(0, start)}${defs}${body}${svg.slice(start, end)}</g>${svg.slice(end)}`;
}
