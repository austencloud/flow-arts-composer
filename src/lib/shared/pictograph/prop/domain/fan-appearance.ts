import { PropType } from "./enums/prop-type";
import type { ThemeMode } from "../../../utils/svg-color-utils";

export const FAN_BUILDS = [
  "pictograph",
  "fire",
  "flat-grip",
  "lotus",
  "day",
  "moon",
] as const;
export type FanBuild = (typeof FAN_BUILDS)[number];

export const FAN_FRAME_COLORS = ["black", "white"] as const;
export type FanFrameColor = (typeof FAN_FRAME_COLORS)[number];

export const FAN_COVERS = ["bare", "covered"] as const;
export type FanCover = (typeof FAN_COVERS)[number];

export interface FanAppearance {
  build: FanBuild;
  frameColor: FanFrameColor;
  cover: FanCover;
}

export interface PropBuildPreviewOption<T extends string> {
  id: T;
  label: string;
  image: string;
  imageScale?: number;
  designCredit?: {
    originator: string;
    sourceUrl: string;
  };
}

export const COMPACT_FAN_LOOKS = [
  "pictograph",
  "fire",
  "lotus",
  "flat-grip",
  "day",
  "moon",
  "covered-fire",
] as const;
export type CompactFanLook = (typeof COMPACT_FAN_LOOKS)[number];

/**
 * New users see the measured DoodleGrip Fire build so the 2D canvas matches the
 * realistic 3D fan out of the box; Pictograph stays one tap away in the picker.
 */
export const DEFAULT_FAN_APPEARANCE: FanAppearance = {
  build: "fire",
  frameColor: "black",
  cover: "bare",
};

function includes<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function normalizeFanAppearance(
  value: Partial<FanAppearance> | null | undefined
): FanAppearance {
  return {
    build: includes(FAN_BUILDS, value?.build)
      ? value.build
      : DEFAULT_FAN_APPEARANCE.build,
    frameColor: includes(FAN_FRAME_COLORS, value?.frameColor)
      ? value.frameColor
      : DEFAULT_FAN_APPEARANCE.frameColor,
    cover: includes(FAN_COVERS, value?.cover)
      ? value.cover
      : DEFAULT_FAN_APPEARANCE.cover,
  };
}

export function fanAppearanceSignature(value: FanAppearance): string {
  return `${value.build}:${value.frameColor}:${value.cover}`;
}

export function isFanPropType(propType: string | null | undefined): boolean {
  const normalized = propType?.toLowerCase();
  return normalized === PropType.FAN || normalized === PropType.BIGFAN;
}

/**
 * Renderer-only identity. These keys never enter PropType, saved choreography,
 * or URL prop parameters; they only let the existing texture cache distinguish
 * visual builds of the same notation prop.
 */
export function resolveFanRenderKey(
  propType: string,
  appearance: FanAppearance
): string {
  const normalized = propType.toLowerCase();
  if (!isFanPropType(normalized) || appearance.build === "pictograph") {
    return normalized;
  }
  if (appearance.build === "fire") {
    return `${normalized}__fire_${appearance.cover}`;
  }
  if (appearance.build === "day") {
    return `${normalized}__day_${appearance.frameColor}_${appearance.cover}`;
  }
  if (appearance.build === "moon") {
    return `${normalized}__moon`;
  }
  if (appearance.build === "flat-grip") {
    return `${normalized}__flat-grip`;
  }
  return `${normalized}__lotus`;
}

export interface FanRenderKey {
  propType: "fan" | "bigfan";
  build: Exclude<FanBuild, "pictograph">;
  frameColor: FanFrameColor;
  cover: FanCover;
}

export function parseFanRenderKey(value: string): FanRenderKey | null {
  const normalized = value.toLowerCase();
  const flatGrip = /^(fan|bigfan)__flat-grip$/.exec(normalized);
  if (flatGrip) {
    return {
      propType: flatGrip[1] as FanRenderKey["propType"],
      build: "flat-grip",
      frameColor: DEFAULT_FAN_APPEARANCE.frameColor,
      cover: DEFAULT_FAN_APPEARANCE.cover,
    };
  }
  const lotus = /^(fan|bigfan)__lotus$/.exec(normalized);
  if (lotus) {
    return {
      propType: lotus[1] as FanRenderKey["propType"],
      build: "lotus",
      frameColor: DEFAULT_FAN_APPEARANCE.frameColor,
      cover: DEFAULT_FAN_APPEARANCE.cover,
    };
  }

  const fire = /^(fan|bigfan)__fire_(bare|covered)$/.exec(normalized);
  if (fire) {
    return {
      propType: fire[1] as FanRenderKey["propType"],
      build: "fire",
      frameColor: DEFAULT_FAN_APPEARANCE.frameColor,
      cover: fire[2] as FanCover,
    };
  }

  const moon = /^(fan|bigfan)__moon$/.exec(normalized);
  if (moon) {
    return {
      propType: moon[1] as FanRenderKey["propType"],
      build: "moon",
      frameColor: DEFAULT_FAN_APPEARANCE.frameColor,
      cover: DEFAULT_FAN_APPEARANCE.cover,
    };
  }

  const day = /^(fan|bigfan)__day_(black|white)_(bare|covered)$/.exec(
    normalized
  );
  if (!day) return null;
  return {
    propType: day[1] as FanRenderKey["propType"],
    build: "day",
    frameColor: day[2] as FanFrameColor,
    cover: day[3] as FanCover,
  };
}

export function fanAppearanceArtwork(
  build: FanBuild,
  cover: FanCover = "bare"
): string | null {
  if (build === "pictograph") return null;
  if (build === "flat-grip") {
    return "/images/props/appearances/fan-flat-grip.svg?v=1";
  }
  if (build === "fire") {
    const file = cover === "covered" ? "fan-fire-covered.svg" : "fan-fire.svg";
    return `/images/props/appearances/${file}?v=2`;
  }
  if (build === "moon") {
    return "/images/props/appearances/fan-moon.svg?v=1";
  }
  if (build === "day") {
    // Generated by scripts/build-doodlegrip-day-appearance.mjs from the same
    // cut-sheet contours as the 3D plate. The plate takes the hand color on
    // the canvas; the black or white frame choice only shows in 3D.
    const file = cover === "covered" ? "fan-day-covered.svg" : "fan-day.svg";
    return `/images/props/appearances/${file}?v=3`;
  }
  return "/images/props/appearances/fan-lotus.svg?v=7";
}

const PREVIEW_ROOT = "/images/props/build-previews";

function previewImage(file: string): string {
  return `${PREVIEW_ROOT}/${file}`;
}

/** Rendered preview of a complete fan build, for tiles and pickers. */
/**
 * Scale the regular measured build around its hand pivot into Big Fan's box
 * (the pictograph bigfan.svg is the 260x207 fan scaled by 600/325 with the
 * same offset), so a build swap keeps every placement rule intact.
 */
export function scaleFanAppearanceForBigFan(svg: string): string {
  const body = svg.replace(/^\s*<svg\b[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 566.9"><g transform="translate(60 92.3731) scale(1.8461538)">${body}</g></svg>`;
}

/**
 * Physical fan artwork owns its material colors. Only the marked frame group
 * follows the motion color: its stroke for the rod-built fire and lotus fans,
 * and its fill for the solid DoodleGrip Day plate. Kevlar wicks and fitted
 * covers stay physical. Regex only: the composition worker has no DOM.
 */
export function applyFanFrameColor(svg: string, color: string): string {
  return svg.replace(
    /<g\b(?=[^>]*\bdata-fan-frame=(?:""|''))[^>]*>/i,
    (tag) => {
      const filled = tag.replace(
        /\bfill=(?:"(?!none")[^"]*"|'(?!none')[^']*')/i,
        `fill="${color}"`
      );
      if (/\bstroke=(?:"[^"]*"|'[^']*')/i.test(filled)) {
        return filled.replace(
          /\bstroke=(?:"[^"]*"|'[^']*')/i,
          `stroke="${color}"`
        );
      }
      return filled.replace(/>$/, ` stroke="${color}">`);
    }
  );
}

/**
 * The rod-built fans (fire, flat-grip, lotus) were tuned on a dark pictograph,
 * where the pale kevlar wicks anchor the silhouette and the frame can stay a
 * hairline. On a light pictograph, the choreo sheet and its PDF, those wicks
 * vanish into the paper and only a faint web of frame is left. This is the
 * light palette: wicks take a printable kevlar gold under a dark wrap, and the
 * frame's strokes grow together so the fan still reads at sheet-cell scale.
 * Dark artwork passes through untouched.
 */
export const FAN_PAPER_CONTRAST = {
  wickFill: "#d9b25a",
  wickStroke: "#4a2f14",
  wickStrokeWidth: 2.2,
  /** Width for a frame that authored none (the SVG default of 1). */
  frameHairlineWidth: 2.4,
  /** Multiplies every authored frame width so rails stay heavier than spines. */
  frameStrokeScale: 1.6,
} as const;

const WICK_GROUP_PATTERN =
  /<g\b(?=[^>]*\bdata-(?:fire-wick|fan-wicks)=(?:"[^"]*"|'[^']*'))[^>]*>/gi;
const FRAME_GROUP_PATTERN = /<g\b(?=[^>]*\bdata-fan-frame=(?:""|''))[^>]*>/i;

function setAttribute(tag: string, name: string, value: string): string {
  const attribute = new RegExp(`\\b${name}=(?:"[^"]*"|'[^']*')`, "i");
  if (attribute.test(tag)) {
    return tag.replace(attribute, `${name}="${value}"`);
  }
  return tag.replace(/\s*\/?>$/, (end) => ` ${name}="${value}"${end.trim()}`);
}

function scaleStrokeWidth(
  tag: string,
  scale: number,
  fallback: number
): string {
  const authored = tag.match(/\bstroke-width=(?:"([^"]*)"|'([^']*)')/i);
  const width = authored ? parseFloat(authored[1] ?? authored[2] ?? "") : NaN;
  const scaled = Number.isFinite(width) ? width * scale : fallback;
  return setAttribute(tag, "stroke-width", formatWidth(scaled));
}

function formatWidth(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** Index just past the `</g>` that closes the group opened at `openIndex`. */
function groupEnd(svg: string, openIndex: number): number {
  const token = /<g\b|<\/g\s*>/gi;
  token.lastIndex = openIndex;
  let depth = 0;
  for (let match = token.exec(svg); match; match = token.exec(svg)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return svg.length;
}

export function applyFanPaperContrast(
  svg: string,
  themeMode: ThemeMode
): string {
  if (themeMode !== "light") return svg;
  const {
    wickFill,
    wickStroke,
    wickStrokeWidth,
    frameHairlineWidth,
    frameStrokeScale,
  } = FAN_PAPER_CONTRAST;

  const withWicks = svg.replace(WICK_GROUP_PATTERN, (tag) =>
    setAttribute(
      setAttribute(setAttribute(tag, "fill", wickFill), "stroke", wickStroke),
      "stroke-width",
      formatWidth(wickStrokeWidth)
    )
  );

  const frameOpen = withWicks.match(FRAME_GROUP_PATTERN);
  if (frameOpen?.index === undefined) return withWicks;
  // Only a stroke-drawn frame needs weight; the solid Day plate already reads.
  if (!/\bfill=(?:"none"|'none')/i.test(frameOpen[0])) return withWicks;

  const start = frameOpen.index;
  const end = groupEnd(withWicks, start);
  const group = withWicks.slice(start, end);
  const openTag = scaleStrokeWidth(
    frameOpen[0],
    frameStrokeScale,
    frameHairlineWidth
  );
  // Parts without a width inherit the group's; parts that set one scale with it.
  const body = group
    .slice(frameOpen[0].length)
    .replace(
      /<(?:path|ellipse|circle|line|polyline|polygon|rect)\b[^>]*>/gi,
      (tag) =>
        /\bstroke-width=/i.test(tag)
          ? scaleStrokeWidth(tag, frameStrokeScale, frameHairlineWidth)
          : tag
    );
  return withWicks.slice(0, start) + openTag + body + withWicks.slice(end);
}

export function fanPreviewImage(appearance: FanAppearance): string {
  if (appearance.build === "flat-grip") {
    return previewImage("fan-flat-grip-complete.webp");
  }
  if (appearance.build === "pictograph") {
    return previewImage("fan-pictograph-front.webp");
  }
  if (appearance.build === "fire") {
    return previewImage(`fan-fire-${appearance.cover}-complete.webp`);
  }
  if (appearance.build === "lotus") {
    return `${previewImage("fan-lotus-bare-complete.webp")}?v=6`;
  }
  if (appearance.build === "moon") {
    return previewImage("fan-moon-complete.webp");
  }
  return previewImage(
    `fan-day-${appearance.frameColor}-${appearance.cover}-complete.webp`
  );
}

export function fanBuildPreviewOptions(
  appearance: FanAppearance
): readonly PropBuildPreviewOption<FanBuild>[] {
  return [
    {
      id: "pictograph",
      label: "Pictograph",
      image: fanPreviewImage({ ...appearance, build: "pictograph" }),
      imageScale: 1.76,
    },
    {
      id: "fire",
      label: "DoodleGrip Fire",
      image: fanPreviewImage({ ...appearance, build: "fire" }),
      // Its 279px outer width sits inside the same 640px render as the Flat
      // Grip's 536px width. Scaling its complete image 536 / 279 keeps the
      // artwork equal in the tall rail without distorting it.
      imageScale: 1.92,
      designCredit: {
        originator: "Doodle",
        sourceUrl: "https://forgedfans.com/products/doodlegrip-fire-fans",
      },
    },
    {
      id: "lotus",
      label: "Lotus Fire",
      image: fanPreviewImage({ ...appearance, build: "lotus" }),
      // Its 296px outer width needs the same treatment: 536 / 296, uniformly.
      imageScale: 1.81,
      designCredit: {
        originator: "Home of Poi",
        sourceUrl:
          "https://www.homeofpoi.com/en/shop/listItems/Medium-Lotus-Fire-Fans",
      },
    },
    {
      id: "flat-grip",
      label: "Flat Grip Fire",
      image: fanPreviewImage({ ...appearance, build: "flat-grip" }),
      imageScale: 1,
      designCredit: {
        originator: "Forged Creations",
        sourceUrl: "https://forgedfans.com/products/flat-grip-fire-fans",
      },
    },
    {
      id: "day",
      label: "DoodleGrip Day",
      image: fanPreviewImage({ ...appearance, build: "day" }),
      imageScale: 2.02,
      designCredit: {
        originator: "Doodle",
        sourceUrl: "https://flowtoys.com/products/doodlegrip-practice-fans",
      },
    },
    {
      id: "moon",
      label: "Moon LED",
      image: fanPreviewImage({ ...appearance, build: "moon" }),
      imageScale: 1.54,
      designCredit: {
        originator: "Lighttoys",
        sourceUrl: "https://www.lighttoys.cz/product/moon-fans-ft/",
      },
    },
  ];
}

/**
 * The compact 2D Fan Look rail makes one visual decision at a time. Covers
 * remain a full appearance modifier for 3D and settings, while its existing
 * DoodleGrip Fire covered rendering is an honest, direct visual choice here.
 */
export function compactFanLookPreviewOptions(
  appearance: FanAppearance
): readonly PropBuildPreviewOption<CompactFanLook>[] {
  return [
    ...fanBuildPreviewOptions({ ...appearance, cover: "bare" }),
    {
      id: "covered-fire",
      label: "Covered Fan",
      image: fanPreviewImage({
        ...appearance,
        build: "fire",
        cover: "covered",
      }),
      imageScale: 1.91,
    },
  ];
}

export function fanFramePreviewOptions(
  appearance: FanAppearance
): readonly PropBuildPreviewOption<FanFrameColor>[] {
  return FAN_FRAME_COLORS.map((frameColor) => ({
    id: frameColor,
    label: frameColor === "black" ? "Black" : "White",
    image: fanPreviewImage({ ...appearance, build: "day", frameColor }),
  }));
}

export function fanCoverPreviewOptions(
  appearance: FanAppearance
): readonly PropBuildPreviewOption<FanCover>[] {
  const build = appearance.build === "day" ? "day" : "fire";
  return FAN_COVERS.map((cover) => ({
    id: cover,
    label: cover === "bare" ? "Bare" : "Covered",
    image: fanPreviewImage({ ...appearance, build, cover }),
  }));
}
