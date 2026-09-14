/**
 * Pure SVG color transforms shared by browser and Node renderers.
 *
 * Props are embedded more than once in a pictograph. Class and ID suffixing is
 * therefore part of correctness, not just cleanup: two unscoped `.st0` rules
 * let the later prop's color override the earlier prop.
 */

import type { HandSide } from "./types.js";

export type ThemeMode = "dark" | "light";

export const ACCENT_COLORS_TO_PRESERVE = [
  "#c9ac68",
  "#ffffff",
  "#fff",
] as const;

export const HAND_COLOR_MAP: Record<HandSide, { dark: string; light: string }> =
  {
    left: {
      dark: "#3575E2",
      light: "#3D44B8",
    },
    right: {
      dark: "#ED1C24",
      light: "#DC2626",
    },
  };

/**
 * Props whose artwork is only PARTLY the motion color. Selective mode keeps any
 * fill that is dark (luminance below 0.4) or saturated (above 0.05) and repaints
 * the rest — so a torch keeps its shaft, a sword keeps its gold blade, and the
 * energy pair keeps its neutral hilt and pale core while the blade takes on
 * left or right.
 */
export const SELECTIVE_COLOR_PROP_TYPES = [
  // Juggling club: the body carries left/right motion identity while the rubber
  // knob, wrapped handle, shoulder ring and top keep their authored materials.
  "club",
  // Poi: the head carries left/right motion identity while the rubber knob and
  // the cord stay neutral, the same split the club uses.
  "poi",
  "torch",
  "bigtorch",
  "sword",
  "energy_saber",
  "energy_staff",
  // LED baton: the braided cable and the light inside each cap are neutral gray
  // and take left or right, while the couplers, tubes and cap shells stay clear --
  // which is how the real prop is sold, colored shaft under clear ends.
  "capsule_baton",
  // Fire double staff: the anodized tube and its overgrip are neutral gray and
  // take left or right, while the kevlar wicks and the gold thumb bands stay as
  // authored. Kevlar is never left or right.
  "fire_double_staff",
  "sword-knight",
  "sword-saber",
  "sword-flamberge",
  "sword-khopesh",
  "sword-claymore",
] as const;

export function getMotionColor(
  hand: HandSide,
  mode: ThemeMode = "dark"
): string {
  return HAND_COLOR_MAP[hand]?.[mode] ?? HAND_COLOR_MAP.left[mode];
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace("#", "");
  if (clean.length < 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16) / 255,
    g: parseInt(clean.slice(2, 4), 16) / 255,
    b: parseInt(clean.slice(4, 6), 16) / 255,
  };
}

function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  if (max === 0) return 0;
  const min = Math.min(r, g, b);
  return (max - min) / max;
}

export function shouldPreserveColor(
  color: string,
  selectiveMode?: boolean
): boolean {
  const colorLower = color.toLowerCase();

  if (colorLower === "none" || colorLower === "transparent") return true;

  if (selectiveMode && colorLower.startsWith("#")) {
    const rgb = parseHex(colorLower);
    if (!rgb) return false;
    if (luminance(rgb.r, rgb.g, rgb.b) < 0.4) return true;
    if (saturation(rgb.r, rgb.g, rgb.b) > 0.05) return true;
    return false;
  }

  return ACCENT_COLORS_TO_PRESERVE.some(
    (accent) => accent.toLowerCase() === colorLower
  );
}

export interface SvgColorOptions {
  transformStroke?: boolean;
  removeCenterPoint?: boolean;
  makeClassNamesUnique?: boolean;
  colorSuffix?: string;
  selectiveColorMode?: boolean;
  /** Previously applied hand colors that must change even on material-preserving props. */
  sourceColors?: readonly string[];
}

export function applyColorToSvg(
  svgText: string,
  targetColor: string,
  options: SvgColorOptions = {}
): string {
  const {
    transformStroke = false,
    removeCenterPoint = true,
    makeClassNamesUnique = false,
    colorSuffix = "",
    selectiveColorMode = false,
    sourceColors = [],
  } = options;

  const preserve = (color: string) =>
    !sourceColors.some(
      (source) => source.toLowerCase() === color.toLowerCase()
    ) && shouldPreserveColor(color, selectiveColorMode);

  let coloredSvg = svgText;

  // Physical fan builds mark the frame that carries hand identity. Recoloring
  // the complete artwork again (for custom hand colors) would paint the Kevlar
  // and covers too, while leaving the stroke-built frame in its old color.
  const fanFrame = /<g\b(?=[^>]*\bdata-fan-frame=(?:""|''))[^>]*>/gi;
  const hasFanFrame = /\bdata-fan-frame=(?:""|'')/i.test(svgText);
  if (hasFanFrame) {
    coloredSvg = coloredSvg.replace(fanFrame, (tag) =>
      tag.replace(
        /\b(fill|stroke)=("|')([^"']*)\2/gi,
        (paint, name, quote, value) =>
          value === "none" || value === "transparent"
            ? paint
            : `${name}=${quote}${targetColor}${quote}`
      )
    );
  } else {
    coloredSvg = coloredSvg.replace(
      /fill="(#[0-9A-Fa-f]{3,6}|rgb[a]?\([^)]+\)|[a-z]+)"/gi,
      (match, capturedColor: string) => {
        if (preserve(capturedColor)) {
          return match;
        }
        return `fill="${targetColor}"`;
      }
    );

    coloredSvg = coloredSvg.replace(
      /fill:\s*(#[0-9A-Fa-f]{3,6}|rgb[a]?\([^)]+\)|[a-z]+)/gi,
      (match, capturedColor: string) => {
        if (preserve(capturedColor)) {
          return match;
        }
        return `fill:${targetColor}`;
      }
    );

    if (transformStroke) {
      coloredSvg = coloredSvg.replace(
        /stroke="(#[0-9A-Fa-f]{3,6}|rgb[a]?\([^)]+\)|[a-z]+)"/gi,
        (match, capturedColor: string) => {
          if (preserve(capturedColor)) {
            return match;
          }
          return `stroke="${targetColor}"`;
        }
      );

      coloredSvg = coloredSvg.replace(
        /stroke:\s*(#[0-9A-Fa-f]{3,6}|rgb[a]?\([^)]+\)|[a-z]+)/gi,
        (match, capturedColor: string) => {
          if (preserve(capturedColor)) {
            return match;
          }
          return `stroke:${targetColor}`;
        }
      );
    }
  }

  if (removeCenterPoint) {
    coloredSvg = coloredSvg.replace(
      /<circle[^>]*id="centerPoint"[^>]*\/?>/g,
      ""
    );
  }

  if (makeClassNamesUnique && colorSuffix) {
    coloredSvg = coloredSvg.replace(
      /\.st(\d+)(?:-[\w-]+)?/g,
      `.st$1-${colorSuffix}`
    );
    coloredSvg = coloredSvg.replace(
      /class="([^"]+)"/g,
      (_, classes: string) =>
        `class="${classes.replace(/\bst(\d+)(?:-[\w-]+)?\b/g, `st$1-${colorSuffix}`)}"`
    );
    coloredSvg = coloredSvg.replace(/id="([^"]+)"/g, `id="$1-${colorSuffix}"`);
    coloredSvg = coloredSvg.replace(
      /url\(#([^)]+)\)/g,
      `url(#$1-${colorSuffix})`
    );
  }

  return coloredSvg;
}

export interface MotionSvgColorOptions extends Omit<
  SvgColorOptions,
  "colorSuffix"
> {
  themeMode?: ThemeMode;
}

export function applyMotionColorToSvg(
  svgText: string,
  motionHand: HandSide,
  options: MotionSvgColorOptions = {}
): string {
  const mode = options.themeMode ?? "dark";
  const targetColor = getMotionColor(motionHand, mode);

  return applyColorToSvg(svgText, targetColor, {
    ...options,
    colorSuffix: motionHand,
  });
}
