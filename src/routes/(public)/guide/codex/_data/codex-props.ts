/**
 * Which props the Codex can draw, and how its picker groups them.
 *
 * The app's curated picker (PROP_PICKER_SECTIONS) owns the order, the groups
 * and which builds are public; this file folds it into families the way the
 * app's PropGrid does, so a build listed under "Big" stays with its family and
 * the picker offers one tile per family. Bare hands are left out: a codex of
 * empty hands has nothing to show.
 */
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  PROP_PICKER_SECTIONS,
  getBasePropType,
  isPropActive,
} from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import type { PropChoiceSection } from "#lib/shared/pictograph/prop/components/PropChoiceRow.svelte";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";

export const CODEX_DEFAULT_PROP = PropType.STAFF;

const PICKABLE = new Set<PropType>(
  PROP_PICKER_SECTIONS.flatMap((section) => section.props).filter(
    (prop) => prop !== PropType.HAND && isPropActive(prop)
  )
);

/** Base props per picker section, in the picker's order; empty sections drop. */
const CODEX_FAMILY_SECTIONS = (() => {
  const seen = new Set<PropType>();
  return PROP_PICKER_SECTIONS.map((section) => ({
    key: section.label.toLowerCase(),
    props: section.props.filter((prop) => {
      if (!PICKABLE.has(prop) || getBasePropType(prop) !== prop) return false;
      if (seen.has(prop)) return false;
      seen.add(prop);
      return true;
    }),
  })).filter((section) => section.props.length > 0);
})();

/** The picker's groups, named in the reader's language. */
export function codexPropSections(): PropChoiceSection[] {
  return CODEX_FAMILY_SECTIONS.map((section) => ({
    label: t(`settings_prop_section_${section.key}` as TranslationKey),
    props: section.props,
  }));
}

/** The family a `?prop=` value names, if the Codex offers it. A build (LED
 *  Baton, Fire Staff) opens on its family, which draws the same letters. */
export function parseCodexProp(value: string | null): PropType | null {
  if (!value) return null;
  const prop = value.toLowerCase() as PropType;
  return PICKABLE.has(prop) ? getBasePropType(prop) : null;
}
