import { PropType } from "./enums/prop-type";
import type { PropTileCrop } from "./prop-look";
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
  "sense",
] as const;
export type FanBuild = (typeof FAN_BUILDS)[number];

/**
 * A look modelled on a maker's product is offered once its maker has approved
 * it. Turning one back on is a one-line change to this list.
 */
export const APPROVED_FAN_BUILDS: readonly FanBuild[] = ["pictograph", "sense"];

/**
 * Preview servers set VITE_MAKER_PREVIEW=1 to offer every build again, for
 * recording a clip. It is off unless set, in dev and in production alike.
 */
const MAKER_PREVIEW = import.meta.env.VITE_MAKER_PREVIEW === "1";

/** The builds offered right now. Pure functions take this as a parameter. */
export const AVAILABLE_FAN_BUILDS: readonly FanBuild[] = MAKER_PREVIEW
  ? FAN_BUILDS
  : APPROVED_FAN_BUILDS;

export function isFanBuildAvailable(
  build: unknown,
  available: readonly FanBuild[] = AVAILABLE_FAN_BUILDS
): build is FanBuild {
  return typeof build === "string" && available.includes(build as FanBuild);
}

/** Fire when it is offered, otherwise the app's own Pictograph drawing. */
export function defaultFanBuild(
  available: readonly FanBuild[] = AVAILABLE_FAN_BUILDS
): FanBuild {
  return available.includes("fire") ? "fire" : "pictograph";
}

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
  /** The painted window of a grip-centred capture; see PropTileCrop. */
  crop?: PropTileCrop;
  /**
   * A look modelled on a maker's product, shown until its maker has approved
   * it. It stays in the list so people can see it is coming, but it can never
   * be chosen.
   */
  waitingOnMaker?: boolean;
  designCredit?: {
    originator: string;
    /** Absent until the originator names a product page. */
    sourceUrl?: string;
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
  "sense",
  "covered-fire",
] as const;
export type CompactFanLook = (typeof COMPACT_FAN_LOOKS)[number];

/**
 * New users see the measured DoodleGrip Fire build when it is offered, so the
 * 2D canvas matches the realistic 3D fan out of the box. Until then the app's
 * own Pictograph drawing is the default.
 */
export const DEFAULT_FAN_APPEARANCE: FanAppearance = {
  build: defaultFanBuild(),
  frameColor: "black",
  cover: "bare",
};

function includes<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return typeof value === "string" && values.includes(value as T);
}

/**
 * A stored build that is not offered reads as the default. Nothing is written
 * back, so the stored choice returns if its look is offered later.
 */
export function normalizeFanAppearance(
  value: Partial<FanAppearance> | null | undefined,
  available: readonly FanBuild[] = AVAILABLE_FAN_BUILDS
): FanAppearance {
  return {
    build:
      includes(FAN_BUILDS, value?.build) &&
      isFanBuildAvailable(value.build, available)
        ? value.build
        : defaultFanBuild(available),
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
  if (appearance.build === "sense") {
    return `${normalized}__sense`;
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
  const sense = /^(fan|bigfan)__sense$/.exec(normalized);
  if (sense) {
    return {
      propType: sense[1] as FanRenderKey["propType"],
      build: "sense",
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
  if (build === "sense") {
    return "/images/props/appearances/fan-sense.svg?v=1";
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
  if (appearance.build === "sense") {
    return previewImage("fan-sense-complete.webp");
  }
  if (appearance.build === "pictograph") {
    return previewImage("fan-pictograph-front.webp");
  }
  if (appearance.build === "fire") {
    return `${previewImage(`fan-fire-${appearance.cover}-complete.webp`)}?v=2`;
  }
  if (appearance.build === "lotus") {
    return `${previewImage("fan-lotus-bare-complete.webp")}?v=6`;
  }
  if (appearance.build === "moon") {
    return previewImage("fan-moon-complete.webp");
  }
  return `${previewImage(
    `fan-day-${appearance.frameColor}-${appearance.cover}-complete.webp`
  )}?v=2`;
}

/**
 * Marks each look available or waiting, then lists the available ones first.
 * Each group keeps its own order.
 */
function approvedFirst<T extends string>(
  options: readonly PropBuildPreviewOption<T>[],
  isWaiting: (id: T) => boolean
): readonly PropBuildPreviewOption<T>[] {
  const marked = options.map((option) => ({
    ...option,
    waitingOnMaker: isWaiting(option.id),
  }));
  return [
    ...marked.filter((option) => !option.waitingOnMaker),
    ...marked.filter((option) => option.waitingOnMaker),
  ];
}

/** Every look, the approved ones first and the waiting ones after. */
export function fanBuildPreviewOptions(
  appearance: FanAppearance,
  available: readonly FanBuild[] = AVAILABLE_FAN_BUILDS
): readonly PropBuildPreviewOption<FanBuild>[] {
  return approvedFirst(
    allFanBuildPreviewOptions(appearance),
    (id) => !available.includes(id)
  );
}

function allFanBuildPreviewOptions(
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
    {
      id: "sense",
      label: "Sense Fan",
      image: fanPreviewImage({ ...appearance, build: "sense" }),
      // Its 468mm span fills 535px of the same 640px render, matching the
      // Flat Grip's 536px, so it needs no scaling.
      imageScale: 1,
      // Flow DNA has not named a product page yet; the credit stays text.
      designCredit: { originator: "Flow DNA" },
    },
  ];
}

/**
 * The compact 2D Fan Look rail makes one visual decision at a time. Covers
 * remain a full appearance modifier for 3D and settings, while its existing
 * DoodleGrip Fire covered rendering is an honest, direct visual choice here.
 */
export function compactFanLookPreviewOptions(
  appearance: FanAppearance,
  available: readonly FanBuild[] = AVAILABLE_FAN_BUILDS
): readonly PropBuildPreviewOption<CompactFanLook>[] {
  const options: readonly PropBuildPreviewOption<CompactFanLook>[] = [
    ...allFanBuildPreviewOptions({ ...appearance, cover: "bare" }),
    {
      id: "covered-fire" as const,
      label: "Covered Fan",
      image: fanPreviewImage({
        ...appearance,
        build: "fire",
        cover: "covered",
      }),
      imageScale: 1.91,
    },
  ];
  // The covered fan is the Fire build with its cover on, so it waits with it.
  return approvedFirst(
    options,
    (id) => !available.includes(id === "covered-fire" ? "fire" : id)
  );
}

/**
 * What choosing a look writes, or null when the look is waiting on its maker.
 * Every picker writes through these two, so a waiting look never becomes the
 * active one, whatever the tile or key that asked for it.
 */
export function chooseFanBuild(
  appearance: FanAppearance,
  build: FanBuild,
  available: readonly FanBuild[] = AVAILABLE_FAN_BUILDS
): FanAppearance | null {
  return isFanBuildAvailable(build, available)
    ? { ...appearance, build }
    : null;
}

export function chooseCompactFanLook(
  appearance: FanAppearance,
  look: CompactFanLook,
  available: readonly FanBuild[] = AVAILABLE_FAN_BUILDS
): FanAppearance | null {
  const build = look === "covered-fire" ? "fire" : look;
  if (!isFanBuildAvailable(build, available)) return null;
  return {
    ...appearance,
    build,
    cover: look === "covered-fire" ? "covered" : "bare",
  };
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
