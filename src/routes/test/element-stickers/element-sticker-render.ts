/**
 * Themed elemental sticker renderer.
 *
 * Produces a single 960px square SVG tile (3" art + 0.1" bleed at 300 DPI) for
 * one of the six TnD elements. The same SVG string is used for the on-screen
 * sheet preview (inline `{@html}`) and for PDF export (rasterized via
 * `rasterizeSvgToPng` -> `embedPng`), so what you see is exactly what prints.
 *
 * Mirrors the sticker-lab pipeline architecture (`sticker-unit-renderer.ts`),
 * but draws a raster elemental glyph centered on a themed disc instead of a
 * mandala path set.
 */

import type { TnDElement } from "#lib/features/choreo-card/domain/tnd-element.js";
import {
  STICKER_ART_RADIUS_PX,
  STICKER_BLEED_PX,
  STICKER_TILE_SIZE_PX,
} from "#lib/features/sticker-lab/domain/sticker-constants.js";

export type StickerBgStyle = "white" | "tint" | "gradient";
export type StickerRingColor = "accent" | "dark";

export interface ElementStickerOptions {
  /** Disc fill treatment behind the glyph. */
  bgStyle: StickerBgStyle;
  /** 0–1 strength of the element-color tint (tint/gradient edge alpha). */
  tintStrength: number;
  /** Draw a colored ring just inside the cut line. */
  ring: boolean;
  /** Ring stroke width in art-pixels (300 DPI). */
  ringWidth: number;
  /** Which element color the ring uses. */
  ringColor: StickerRingColor;
  /** Glyph size as a fraction of the art diameter (0–1). */
  iconScale: number;
  /** Render the element name across the bottom of the disc. */
  showLabel: boolean;
  /** Add a thin deep-complement hairline just inside the main ring (double-ring look). */
  innerHairline?: boolean;
}

export const DEFAULT_STICKER_OPTIONS: ElementStickerOptions = {
  bgStyle: "gradient",
  tintStrength: 0.35,
  ring: true,
  ringWidth: 26,
  ringColor: "accent",
  iconScale: 0.62,
  showLabel: false,
};

/**
 * Per-element optical-size nudge. Some glyph PNGs carry transparent padding
 * (the sun's rays) so they read smaller than the others at the same box;
 * a multiplier evens out the perceived weight.
 */
const ICON_SIZE_ADJUST: Readonly<Record<string, number>> = {
  sun: 1.2,
};

/** Intrinsic pixel dimensions of each element glyph PNG (for contain-fit math). */
const ICON_INTRINSIC: Readonly<Record<string, { w: number; h: number }>> = {
  water: { w: 604, h: 887 },
  earth: { w: 633, h: 991 },
  sun: { w: 1254, h: 1254 },
  fire: { w: 728, h: 1048 },
  air: { w: 1036, h: 737 },
  moon: { w: 846, h: 923 },
};

/**
 * Build the themed elemental sticker SVG. `iconDataUrl` must be a base64 data
 * URL — external `href`s don't load when the SVG is rasterized through an
 * `<img>` element, so the glyph is inlined.
 */
export function renderElementStickerSVG(
  element: TnDElement,
  iconDataUrl: string,
  opts: ElementStickerOptions = DEFAULT_STICKER_OPTIONS,
  /**
   * Base64 data URL of the Gelasio 700 woff2. An `<img>`-rasterized SVG can't
   * see document/system fonts, so the label font is embedded as a data-URI
   * `@font-face`. Omit it and the label falls back to the serif stack.
   */
  labelFontDataUrl?: string
): string {
  // Work in tile coordinates (0..960). The art disc is centered with bleed.
  const cx = STICKER_BLEED_PX + STICKER_ART_RADIUS_PX; // 480
  const cy = cx;
  const artR = STICKER_ART_RADIUS_PX; // 450
  // Background fills out to the bleed edge so the printed disc bleeds past the cut.
  const bleedR = STICKER_BLEED_PX + STICKER_ART_RADIUS_PX; // 480

  const intrinsic = ICON_INTRINSIC[element.element] ?? { w: 1, h: 1 };
  const sizeAdjust = ICON_SIZE_ADJUST[element.element] ?? 1;
  const box = artR * 2 * Math.max(0.1, Math.min(1, opts.iconScale)) * sizeAdjust;
  const fit = Math.min(box / intrinsic.w, box / intrinsic.h);
  const iconW = intrinsic.w * fit;
  const iconH = intrinsic.h * fit;
  // Bias the glyph upward when the two-line label is shown so it has room.
  const iconCY = opts.showLabel ? cy - artR * 0.18 : cy;
  const iconX = cx - iconW / 2;
  const iconY = iconCY - iconH / 2;

  const gradId = `el-grad-${element.element}`;
  const clipId = `el-clip-${element.element}`;
  const tint = clamp01(opts.tintStrength);

  const defs: string[] = [];
  defs.push(`<clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${bleedR}"/></clipPath>`);
  if (opts.showLabel && labelFontDataUrl) {
    defs.push(
      `<style>@font-face{font-family:'Gelasio';font-style:normal;font-weight:700;` +
        `src:url(${labelFontDataUrl}) format('woff2');}</style>`
    );
  }
  if (opts.bgStyle === "gradient") {
    defs.push(
      `<radialGradient id="${gradId}" cx="50%" cy="50%" r="50%">` +
        `<stop offset="0%" stop-color="#ffffff" stop-opacity="1"/>` +
        `<stop offset="62%" stop-color="#ffffff" stop-opacity="1"/>` +
        `<stop offset="100%" stop-color="${element.accentColor}" stop-opacity="${tint.toFixed(3)}"/>` +
        `</radialGradient>`
    );
  }

  const body: string[] = [];
  // Base disc fill.
  if (opts.bgStyle === "white") {
    body.push(`<circle cx="${cx}" cy="${cy}" r="${bleedR}" fill="#ffffff"/>`);
  } else if (opts.bgStyle === "tint") {
    body.push(`<circle cx="${cx}" cy="${cy}" r="${bleedR}" fill="#ffffff"/>`);
    body.push(
      `<circle cx="${cx}" cy="${cy}" r="${bleedR}" fill="${element.accentColor}" fill-opacity="${tint.toFixed(3)}"/>`
    );
  } else {
    body.push(`<circle cx="${cx}" cy="${cy}" r="${bleedR}" fill="url(#${gradId})"/>`);
  }

  // Glyph (clipped to the disc so nothing pokes past the bleed).
  body.push(`<g clip-path="url(#${clipId})">`);
  body.push(
    `<image href="${iconDataUrl}" x="${iconX.toFixed(1)}" y="${iconY.toFixed(1)}" ` +
      `width="${iconW.toFixed(1)}" height="${iconH.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`
  );
  body.push(`</g>`);

  // Optional two-line TnD label: timing on top, direction on bottom.
  // Both lines share one size and a tight, even line gap.
  if (opts.showLabel) {
    const labelColor = element.darkComplement;
    const { timing, direction } = splitTnDName(element.name);
    const serif = `font-family="'Gelasio',Georgia,'Times New Roman',serif"`;
    const labelSize = 78;
    const line1Y = cy + artR * 0.52;
    const line2Y = line1Y + labelSize * 1.06;
    body.push(
      `<text x="${cx}" y="${line1Y.toFixed(1)}" text-anchor="middle" ` +
        `${serif} font-weight="700" font-size="${labelSize}" letter-spacing="0.5" fill="${labelColor}">` +
        `${escapeXml(timing)}</text>`
    );
    body.push(
      `<text x="${cx}" y="${line2Y.toFixed(1)}" text-anchor="middle" ` +
        `${serif} font-weight="700" font-size="${labelSize}" letter-spacing="0.5" fill="${labelColor}">` +
        `${escapeXml(direction)}</text>`
    );
  }

  // Ring just inside the cut line (drawn last so it sits above the tint + glyph edge).
  if (opts.ring && opts.ringWidth > 0) {
    const strokeColor = opts.ringColor === "dark" ? element.darkComplement : element.accentColor;
    const ringR = artR - opts.ringWidth / 2 - 2;
    body.push(
      `<circle cx="${cx}" cy="${cy}" r="${ringR}" fill="none" ` +
        `stroke="${strokeColor}" stroke-width="${opts.ringWidth}"/>`
    );
    if (opts.innerHairline) {
      const hairR = ringR - opts.ringWidth / 2 - 10;
      const hairColor = opts.ringColor === "dark" ? element.accentColor : element.darkComplement;
      body.push(
        `<circle cx="${cx}" cy="${cy}" r="${hairR}" fill="none" ` +
          `stroke="${hairColor}" stroke-width="5"/>`
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${STICKER_TILE_SIZE_PX} ${STICKER_TILE_SIZE_PX}" width="${STICKER_TILE_SIZE_PX}" height="${STICKER_TILE_SIZE_PX}">`,
    `  <defs>${defs.join("")}</defs>`,
    `  ${body.join("\n  ")}`,
    `</svg>`,
  ].join("\n");
}

/**
 * Split a canonical TnD family name ("Split-Same", "Tog-Opp", "Quarter-Opp")
 * into its timing and direction halves. Short tokens are kept verbatim
 * (Tog, Opp) per the plate design.
 */
function splitTnDName(name: string): { timing: string; direction: string } {
  const [timing = name, direction = ""] = name.split("-");
  return { timing, direction };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function escapeXml(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;"));
}
