import type { HandColorPair } from "@tka/render-composition";
import {
  SavedHandColorsSchema,
  type CollectedMandala,
} from "./mandala-collection-types";

/**
 * The edit that gives a saved mandala new colors, or with `null` returns it to
 * the one fixed look. Case is folded here because colors are part of what a
 * revision digests: #AABBCC and #aabbcc draw the same picture and must not make
 * two versions of it. A value a later load would throw away is refused now.
 */
export function mandalaColorsPatch(
  colors: HandColorPair | null
): Pick<CollectedMandala, "colors"> {
  if (!colors) return { colors: undefined };
  const { left, right } = SavedHandColorsSchema.parse(colors);
  return { colors: { left: left.toLowerCase(), right: right.toLowerCase() } };
}

export function sameMandalaColors(
  a: HandColorPair | null | undefined,
  b: HandColorPair | null | undefined
): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.left.toLowerCase() === b.left.toLowerCase() &&
    a.right.toLowerCase() === b.right.toLowerCase()
  );
}
