import type { PropCategory } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export type PropMotionDiscipline = "spinner" | "contact";

const CONTACT_PROP_TYPES: ReadonlySet<string> = new Set([
  PropType.CONTACTBALL,
  PropType.BIGCONTACTBALL,
  PropType.DOUBLECONTACTBALL,
  PropType.BIGDOUBLECONTACTBALL,
]);

/**
 * The prop registry answers what artwork and sequence encoding a prop has.
 * This owner answers which physical viewer can represent its movement.
 */
export function resolvePropMotionDiscipline(
  propType: PropType | string | null | undefined
): PropMotionDiscipline {
  return propType != null && CONTACT_PROP_TYPES.has(String(propType))
    ? "contact"
    : "spinner";
}

export function isSpinnerViewerProp(
  propType: PropType | string | null | undefined
): boolean {
  return resolvePropMotionDiscipline(propType) === "spinner";
}

export function sceneNeedsContactViewer(
  leftPropType: PropType | string | null | undefined,
  rightPropType: PropType | string | null | undefined
): boolean {
  return (
    resolvePropMotionDiscipline(leftPropType) === "contact" ||
    resolvePropMotionDiscipline(rightPropType) === "contact"
  );
}

export function filterSpinnerPropCategories(
  categories: ReadonlyMap<PropCategory, readonly PropType[]>
): Map<PropCategory, PropType[]> {
  return new Map(
    [...categories].map(([category, propTypes]) => [
      category,
      propTypes.filter(isSpinnerViewerProp),
    ])
  );
}
