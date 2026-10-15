/**
 * Which props the Codex offers. Five families, the ones a reader is most
 * likely to hold: the whole catalogue made the choice a wall of tiles, and the
 * letters read the same in any prop. A build of one of them (LED Baton, Fire
 * Staff) still opens on its family from a `?prop=` link.
 */
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { getBasePropType } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";

export const CODEX_DEFAULT_PROP = PropType.STAFF;

export const CODEX_PROPS: readonly PropType[] = [
  PropType.STAFF,
  PropType.CLUB,
  PropType.FAN,
  PropType.TRIAD,
  PropType.MINIHOOP,
];

/** The family a `?prop=` value names, if the Codex offers it. */
export function parseCodexProp(value: string | null): PropType | null {
  if (!value) return null;
  const family = getBasePropType(value.toLowerCase() as PropType);
  return CODEX_PROPS.includes(family) ? family : null;
}
