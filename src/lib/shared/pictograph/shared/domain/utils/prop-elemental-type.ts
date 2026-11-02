import {
  derivePropElementName,
  derivePropElementNameForStep,
  type RelationshipSequence,
  type RelationshipStep,
} from "@tka/shape-domain";
import type { ElementalType } from "../enums/pictograph-enums";

/**
 * The prop relationship lives in @tka/shape-domain and names its element as a
 * plain string. Pictograph surfaces type it as ElementalType, whose values are
 * the same six names, so these adapters only narrow the type.
 */

/**
 * A sequence already carries the two turn values needed to classify its prop
 * relationship. This adapter keeps ordinary viewers out of the Shape Matrix's
 * flower-selection model while routing the calculation through the same owner.
 */
export function derivePropElementalType(
  sequence: RelationshipSequence
): ElementalType | null {
  return derivePropElementName(sequence) as ElementalType | null;
}

/**
 * The prop relationship of ONE step, read from its own two motions. This is
 * the entry point for per-pictograph surfaces (viewer cells, card fronts,
 * exports): a start position or a float step has no prop element, so those
 * pictographs draw no prop glyph.
 */
export function derivePropElementalTypeForStep(
  step: RelationshipStep | null | undefined
): ElementalType | null {
  return derivePropElementNameForStep(step) as ElementalType | null;
}
