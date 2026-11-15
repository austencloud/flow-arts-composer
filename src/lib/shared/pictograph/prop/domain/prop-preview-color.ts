import {
  applyColorToSvg,
  getMotionColor,
  SELECTIVE_COLOR_PROP_TYPES,
} from "#lib/shared/utils/svg-color-utils.js";
import type { HandSide } from "../../shared/domain/enums/pictograph-enums";
import { PropType } from "./enums/prop-type";
import { applyTorchContrastPalette, isTorchProp } from "./torch-contrast";

/**
 * The torch's notation tiles (buttons/) carry no part markers, so the shared
 * dark-surface palette cannot find the shaft in them. The pictograph artwork
 * is the same drawing in the same coordinates with the parts marked; tiles
 * fetch that file and frame it with the tile artwork's own viewBox.
 */
const TORCH_TILE_ARTWORK: Record<string, { path: string; viewBox: string }> = {
  "/images/props/buttons/torch.svg": {
    path: "/images/props/pictograph/torch.svg",
    viewBox: "146.5 0 153.5 15.5",
  },
  "/images/props/buttons/bigtorch.svg": {
    path: "/images/props/pictograph/bigtorch.svg",
    viewBox: "0 0 250 25.1",
  },
};

/** Where a preview should fetch its artwork text for a tile `href`. */
export function previewArtworkPath(href: string): string {
  return TORCH_TILE_ARTWORK[href]?.path ?? href;
}

/**
 * Dark-surface torch for a tile: the pictograph palette (light shaft and
 * metal, flame appended), then the grown viewBox trimmed back on the left so
 * the torch is framed as tightly as the tile artwork was, flame included.
 */
function torchTilePreview(svg: string, propType: string): string {
  const frame =
    TORCH_TILE_ARTWORK[
      propType === PropType.BIGTORCH
        ? "/images/props/buttons/bigtorch.svg"
        : "/images/props/buttons/torch.svg"
    ]!;
  const tileBox = svg.replace(
    /(<svg\b[^>]*\bviewBox\s*=\s*["'])[^"']+(["'])/i,
    `$1${frame.viewBox}$2`
  );
  const themed = applyTorchContrastPalette(tileBox, propType, "dark");
  const pad = themed.match(
    /data-torch-contrast-frame="true"\s+transform="translate\(([\d.]+) [\d.]+\)"/
  );
  const box = themed.match(/<svg\b[^>]*\bviewBox\s*=\s*["']([^"']+)["']/i);
  if (!pad?.[1] || !box?.[1]) return themed;
  const [minX, minY, width, height] = box[1]
    .trim()
    .split(/\s+/)
    .map(Number) as [number, number, number, number];
  const trim = Number(pad[1]);
  return themed.replace(
    /(<svg\b[^>]*\bviewBox\s*=\s*["'])[^"']+(["'])/i,
    `$1${minX + trim} ${minY} ${width - trim} ${height}$2`
  );
}

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
  const colored = applyColorToSvg(svg, color, {
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
  // The switcher is always dark, so torches take the dark-surface palette.
  return isTorchProp(propType) ? torchTilePreview(colored, propType) : colored;
}

/** Change a pre-lit capture's (a fan build photo's) chromatic paint while
 * retaining neutral details and shading. Unlike an alpha mask, this never
 * fills a hole or widens an edge. */
export function modelPreviewColorMatrix(
  color: string,
  side: "left" | "right"
): string {
  const rgb = [1, 3, 5].map(
    (start) => parseInt(color.slice(start, start + 2), 16) / 255
  );
  // Palette the pre-lit captures were lit in (#3b82f6 / #ef4444).
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
