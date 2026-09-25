import { t } from "$lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "$lib/shared/i18n/i18n-types";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export function localizedPropName(propType: PropType): string {
  return t(`settings_prop_name_${propType}` as TranslationKey);
}
