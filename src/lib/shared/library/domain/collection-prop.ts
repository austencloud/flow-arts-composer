import type { ActivePropSettings } from "$lib/shared/foundation/services/recorded-prop-intent";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export function parseCollectionProp(value: unknown): PropType | null {
  return typeof value === "string" &&
    Object.values(PropType).includes(value as PropType)
    ? (value as PropType)
    : null;
}

// Collection presentation never writes back to the visitor's preferences.
export function collectionPropSettings<T extends ActivePropSettings>(
  settings: T,
  propType: PropType | null | undefined
): T {
  return propType == null
    ? settings
    : {
        ...settings,
        leftPropType: propType,
        rightPropType: propType,
        catDogMode: false,
      };
}
