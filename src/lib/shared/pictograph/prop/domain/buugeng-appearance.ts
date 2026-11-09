import { PropType } from "./enums/prop-type";

/**
 * The cut of a buugeng's blade. Classic is the notation glyph; the others are
 * the real cuts drawn by scripts/generate-buugeng-variants.cjs: a plain
 * crescent, punched holes, fire wicks and filigree. A style is a look,
 * like a fan build or the triangle grip: renderer-only, never PropType,
 * notation, choreography, sequence codecs or URLs. Chirality and Big size
 * apply to every style unchanged.
 */
export const BUUGENG_STYLES = [
  "classic",
  "crescent",
  "perforated",
  "fire",
  "filigree",
] as const;
export type BuugengStyle = (typeof BUUGENG_STYLES)[number];

export const DEFAULT_BUUGENG_STYLE: BuugengStyle = "classic";

/**
 * Invented cuts the picker offered before 2026-11-07. Austen replaced them
 * with the real ones; a saved choice keeps a styled blade.
 */
const RETIRED_BUUGENG_STYLES: Readonly<Record<string, BuugengStyle>> = {
  lune: "crescent",
  talon: "crescent",
  spike: "crescent",
  fang: "crescent",
};

export function normalizeBuugengStyle(value: unknown): BuugengStyle {
  if (typeof value !== "string") return DEFAULT_BUUGENG_STYLE;
  if ((BUUGENG_STYLES as readonly string[]).includes(value)) {
    return value as BuugengStyle;
  }
  return RETIRED_BUUGENG_STYLES[value] ?? DEFAULT_BUUGENG_STYLE;
}

/** The two props whose artwork takes a style. Trigeng has its own shape. */
const STYLED_BUUGENG_TYPES: ReadonlySet<string> = new Set([
  PropType.BUUGENG,
  PropType.BIGBUUGENG,
]);

export function isStyledBuugengPropType(
  propType: string | null | undefined
): boolean {
  return STYLED_BUUGENG_TYPES.has(propType?.toLowerCase() ?? "");
}

/**
 * The style a render of these props is cached under: the style only when a
 * buugeng is drawn in a non-classic style. Every other case returns undefined,
 * so classic cells and every other prop keep the cache keys (local and cloud)
 * they had before buugeng styles existed.
 */
export function renderedBuugengStyle(
  style: BuugengStyle | null | undefined,
  propTypes: readonly (string | null | undefined)[]
): Exclude<BuugengStyle, "classic"> | undefined {
  const normalized = normalizeBuugengStyle(style);
  if (normalized === "classic") return undefined;
  return propTypes.some(isStyledBuugengPropType) ? normalized : undefined;
}

/**
 * Renderer-only identity for the texture cache: `buugeng__crescent`,
 * `bigbuugeng__fire`. Classic and every other prop keep the plain type.
 */
export function resolveBuugengRenderKey(
  propType: string,
  style: BuugengStyle
): string {
  const normalized = propType.toLowerCase();
  if (!isStyledBuugengPropType(normalized) || style === "classic") {
    return normalized;
  }
  return `${normalized}__${style}`;
}

export interface BuugengRenderKey {
  propType: "buugeng" | "bigbuugeng";
  style: Exclude<BuugengStyle, "classic">;
}

export function parseBuugengRenderKey(value: string): BuugengRenderKey | null {
  const [head, style, ...rest] = value.toLowerCase().split("__");
  if (rest.length > 0 || !head || !style) return null;
  if (!isStyledBuugengPropType(head)) return null;
  const normalized = normalizeBuugengStyle(style);
  if (normalized === "classic" || normalized !== style) return null;
  return {
    propType: head as BuugengRenderKey["propType"],
    style: normalized,
  };
}

/** The artwork folders that hold plain buugeng art, each at its own size. */
export type BuugengArtworkFamily = "pictograph" | "animated" | "buttons";

/**
 * The fitted sprite for a style, in the same folder and frame as the plain
 * art: same viewBox, hand point on the viewBox centre, same reach. Null for
 * classic, which draws the plain file.
 */
export function buugengAppearanceArtwork(
  propType: string,
  style: BuugengStyle,
  family: BuugengArtworkFamily = "pictograph"
): string | null {
  const normalized = propType.toLowerCase();
  if (!isStyledBuugengPropType(normalized) || style === "classic") return null;
  return `/images/props/${family}/${normalized}-${style}.svg?v=3`;
}

export interface BuugengStyleOption {
  id: BuugengStyle;
  label: string;
}

export const BUUGENG_STYLE_OPTIONS: readonly BuugengStyleOption[] = [
  { id: "classic", label: "Classic" },
  { id: "crescent", label: "Crescent" },
  { id: "perforated", label: "Perforated" },
  { id: "fire", label: "Fire" },
  { id: "filigree", label: "Filigree" },
];
