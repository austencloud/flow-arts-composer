/**
 * Which props the Codex can draw, and how its picker groups them.
 *
 * The app's curated picker (PROP_PICKER_SECTIONS) owns the order and which
 * builds are public; this file only folds it into families the way the app's
 * PropGrid does, so a build listed under "Big" stays with its family. Bare
 * hands are left out: a codex of empty hands has nothing to show.
 */
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  PROP_PICKER_SECTIONS,
  getAllVariations,
  getBasePropType,
  isPropActive,
} from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";

export const CODEX_DEFAULT_PROP = PropType.STAFF;

const PICKABLE = new Set<PropType>(
  PROP_PICKER_SECTIONS.flatMap((section) => section.props).filter(
    (prop) => prop !== PropType.HAND && isPropActive(prop)
  )
);

/** Base props per picker section, in the picker's order; empty sections drop. */
export const CODEX_PROP_FAMILIES: readonly (readonly PropType[])[] = (() => {
  const seen = new Set<PropType>();
  return PROP_PICKER_SECTIONS.map((section) =>
    section.props.filter((prop) => {
      if (!PICKABLE.has(prop) || getBasePropType(prop) !== prop) return false;
      if (seen.has(prop)) return false;
      seen.add(prop);
      return true;
    })
  ).filter((bases) => bases.length > 0);
})();

/** A family's public builds, base first. */
export function codexPropBuilds(family: PropType): PropType[] {
  return getAllVariations(family).filter((prop) => PICKABLE.has(prop));
}

/** The prop a `?prop=` value names, if the Codex offers it. */
export function parseCodexProp(value: string | null): PropType | null {
  if (!value) return null;
  const prop = value.toLowerCase() as PropType;
  return PICKABLE.has(prop) ? prop : null;
}
