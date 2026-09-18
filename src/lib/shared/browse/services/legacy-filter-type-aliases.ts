/**
 * Legacy BrowseFilterType alias table, shared by every reader of a persisted
 * filter type string (localStorage-backed browse engine state, Firestore
 * SmartFilterSpec documents). Extracted from create-browse-engine.svelte.ts
 * so both readers stay on one table instead of drifting.
 */

import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";

/** Every value BrowseFilterType currently defines, for validating a
 * persisted entry's stored type string. */
const CURRENT_FILTER_TYPE_VALUES = new Set<string>(
  Object.values(BrowseFilterType)
);

/** Filter type strings persisted before a FilterType enum value was renamed,
 * mapped to today's value. STARTING_PLACEMENT/END_PLACEMENT used to be
 * "startPosition"/"endPosition" (the domain concept "position" was renamed
 * to "placement" with no migration). Extend this table — don't replace an
 * entry — the next time a filter type's persisted value changes. */
export const LEGACY_FILTER_TYPE_ALIASES: Readonly<
  Record<string, BrowseFilterType>
> = {
  startPosition: BrowseFilterType.STARTING_PLACEMENT,
  endPosition: BrowseFilterType.END_PLACEMENT,
};

/** Resolves a persisted filter's stored type string to its current
 * FilterType, following the legacy alias table above. Returns null when the
 * type is neither a current value nor a known legacy alias — such an entry
 * no longer maps to anything `applyFilter` understands and must be dropped,
 * not kept around as a chip that silently filters nothing. */
export function resolvePersistedFilterType(
  storedType: string
): BrowseFilterType | null {
  const alias = LEGACY_FILTER_TYPE_ALIASES[storedType];
  if (alias) return alias;
  return CURRENT_FILTER_TYPE_VALUES.has(storedType)
    ? (storedType as BrowseFilterType)
    : null;
}

/** Every legacy stored type string that resolves to `type`, for callers that
 * need to look a current type up by its old persisted spellings (e.g.
 * resolving a connective choice saved under the pre-rename key). */
export function legacyAliasesFor(type: BrowseFilterType): string[] {
  return Object.entries(LEGACY_FILTER_TYPE_ALIASES)
    .filter(([, current]) => current === type)
    .map(([legacy]) => legacy);
}
