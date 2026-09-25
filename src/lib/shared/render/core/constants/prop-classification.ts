import type { GridMode } from "../types.js";

const VIEWBOX_SIZE = 950;

const BIG_UNILATERAL_PROPS = [
  "bighoop", "bigfan", "bigtriad", "bigtorch", "bigcontactball",
] as const;

const SMALL_UNILATERAL_PROPS = [
  "fan", "club", "classic_club", "minihoop", "triangle", "triad", "ukulele",
  "triquetra", "triquetra2", "chicken", "torch", "contactball", "poi",
] as const;

const BUUGENG_FAMILY = [
  "buugeng", "bigbuugeng", "trigeng",
] as const;

const STRICT_PLACED = [
  "bighoop", "doublestar", "bigbuugeng", "bigdoublestar", "triquetra",
] as const;

export function isUnilateralProp(propType: string): boolean {
  const t = propType.toLowerCase();
  if (t === "hand") return false;
  return (BIG_UNILATERAL_PROPS as readonly string[]).includes(t)
      || (SMALL_UNILATERAL_PROPS as readonly string[]).includes(t);
}

export function isBuugengFamilyProp(propType: string): boolean {
  return (BUUGENG_FAMILY as readonly string[]).includes(propType.toLowerCase());
}

export function isStrictPlacedProp(propType: string): boolean {
  return (STRICT_PLACED as readonly string[]).includes(propType.toLowerCase());
}

export function pictographRequiresStrictHandpoints(
  leftPropType: string,
  rightPropType: string
): boolean {
  return isStrictPlacedProp(leftPropType) && isStrictPlacedProp(rightPropType);
}

/**
 * Get the beta offset size for a prop type.
 * Box mode applies diagonal compensation (÷√2).
 */
export function getBetaOffsetSize(propType: string, gridMode?: GridMode): number {
  const t = propType.toLowerCase();
  let base: number;

  if (t === "club" || t === "classic_club" || t === "eightrings") {
    base = VIEWBOX_SIZE / 60;       
  } else if (t === "doublestar") {
    base = VIEWBOX_SIZE / 50;       
  } else {
    base = VIEWBOX_SIZE / 45;       
  }

  return gridMode === "box" ? base / Math.sqrt(2) : base;
}
