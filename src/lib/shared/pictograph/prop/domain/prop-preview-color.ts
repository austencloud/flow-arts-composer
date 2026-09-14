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
