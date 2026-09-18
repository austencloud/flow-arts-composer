import { PropType } from "./enums/prop-type";
export {
  applyFanFrameColor,
  applyFanPaperContrast,
  FAN_PAPER_CONTRAST,
} from "@tka/render-core";

export const FAN_BUILDS = [
  "pictograph",
  "fire",
  "flat-grip",
  "lotus",
  "day",
  "moon",
  "star",
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
  "star",
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
  if (appearance.build === "star") {
    return `${normalized}__star`;
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
  const star = /^(fan|bigfan)__star$/.exec(normalized);
  if (star) {
    return {
      propType: star[1] as FanRenderKey["propType"],
      build: "star",
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
  if (build === "star") {
    return "/images/props/appearances/fan-star.svg?v=1";
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

export function fanPreviewImage(appearance: FanAppearance): string {
  if (appearance.build === "flat-grip") {
    return previewImage("fan-flat-grip-complete.webp");
  }
  if (appearance.build === "star") {
    return previewImage("fan-star-complete.webp");
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
    {
      id: "star",
      label: "Star Fire",
      image: fanPreviewImage({ ...appearance, build: "star" }),
      // Its 23.5-inch span fills 581px of the same 640px Blender render the
      // Flat Grip uses at 536px, so 536 / 581 keeps the rail widths equal.
      imageScale: 0.92,
      designCredit: {
        originator: "Renegade Juggling",
        sourceUrl: "https://renegadejuggling.com/products/fire-fan-star",
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
