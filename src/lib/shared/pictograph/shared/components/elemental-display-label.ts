import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import { ElementalType } from "../domain/enums/pictograph-enums";

const ELEMENT_LABEL_KEYS: Readonly<Record<ElementalType, TranslationKey>> = {
  [ElementalType.WATER]: "viewer_final_element_water",
  [ElementalType.FIRE]: "viewer_final_element_fire",
  [ElementalType.EARTH]: "viewer_final_element_earth",
  [ElementalType.AIR]: "viewer_final_element_air",
  [ElementalType.SUN]: "viewer_final_element_sun",
  [ElementalType.MOON]: "viewer_final_element_moon",
};

export function elementalDisplayLabel(elementalType: ElementalType): string {
  return t(ELEMENT_LABEL_KEYS[elementalType]);
}
