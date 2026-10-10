import type { MandalaPaths, MandalaPalette } from "#lib/shared/mandala/domain/mandala-types.js";
import { renderMandalaSVG } from "#lib/shared/mandala/services/mandala-renderer.js";
import type { StickerBackground, StickerUnit, StickerVariant } from "../domain/sticker-types";
import {
  STICKER_ART_DIAMETER_PX,
  STICKER_ART_RADIUS_PX,
  STICKER_BLEED_PX,
  STICKER_TILE_SIZE_PX,
} from "../domain/sticker-constants";

const LIGHT_MODE_PALETTE: MandalaPalette = {
  leftStroke: "#1e40af",
  leftFill: "transparent",
  rightStroke: "#991b1b",
  rightFill: "transparent",
  purpleStroke: "#6b21a8",
  purpleFill: "transparent",
};

/**
 * Stroke width at 3" standalone. Wider than the card-back default (2.5) because the
 * sticker is ~6x larger than its card-back equivalent.
 */
const STICKER_STROKE_WIDTH = 6;

export function renderStickerUnitSVG(unit: StickerUnit, mandalaPaths: MandalaPaths): string {
  const mandalaSvg = renderMandalaSVG(mandalaPaths, {
    size: STICKER_ART_DIAMETER_PX,
    style: "stroke",
    show: toMandalaShow(unit.variant),
    strokeWidth: STICKER_STROKE_WIDTH,
    palette: LIGHT_MODE_PALETTE,
  });

  const mandalaInner = extractSvgInner(mandalaSvg);
  const bg = renderBackground(unit.background);

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STICKER_TILE_SIZE_PX} ${STICKER_TILE_SIZE_PX}" width="${STICKER_TILE_SIZE_PX}" height="${STICKER_TILE_SIZE_PX}">`,
    bg.defs,
    `  <g transform="translate(${STICKER_BLEED_PX}, ${STICKER_BLEED_PX})">`,
    bg.body,
    mandalaInner,
    `  </g>`,
    `</svg>`,
  ].join("\n");
}

function toMandalaShow(variant: StickerVariant): "left" | "right" | "both" {
  return variant === "full" ? "both" : variant;
}

interface BackgroundParts {
  defs: string;
  body: string;
}

function renderBackground(background: StickerBackground): BackgroundParts {
  const cx = STICKER_ART_RADIUS_PX;
  const cy = STICKER_ART_RADIUS_PX;
  const r = STICKER_ART_RADIUS_PX;

  if (background === "transparent") {
    return { defs: "", body: "" };
  }

  if (background === "white") {
    return {
      defs: "",
      body: `    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff"/>`,
    };
  }

  const gradientId = `sticker-bg-gradient-${Math.random().toString(36).slice(2, 8)}`;
  return {
    defs: [
      `  <defs>`,
      `    <radialGradient id="${gradientId}" cx="50%" cy="50%" r="50%">`,
      `      <stop offset="0%" stop-color="#fefcf7" stop-opacity="1"/>`,
      `      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.85"/>`,
      `    </radialGradient>`,
      `  </defs>`,
    ].join("\n"),
    body: `    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${gradientId})"/>`,
  };
}

/**
 * Extract the contents of the outer <svg>...</svg> wrapper.
 */
function extractSvgInner(svg: string): string {
  const openEnd = svg.indexOf(">", svg.indexOf("<svg"));
  const closeStart = svg.lastIndexOf("</svg>");
  if (openEnd === -1 || closeStart === -1) return "";
  return svg.substring(openEnd + 1, closeStart);
}
