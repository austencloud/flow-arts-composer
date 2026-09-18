/**
 * Smart Collection filter-spec serialization.
 *
 * Bridges the headless BrowseEngine and the Firestore-safe SmartFilterSpec.
 * The engine holds filters as an in-memory Map<string, ActiveFilter>; a
 * SmartFilterSpec stores them as an array of plain objects (Firestore forbids
 * arrays-of-arrays, so the engine's [key, ActiveFilter] tuple form can't be
 * persisted directly).
 */

import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import type { BrowseSortMethod } from "$lib/shared/browse/domain/enums/browse-enums";
import { applyFilter } from "$lib/shared/browse/services/browse-filter";
import {
  applyFilters,
  CONNECTIVE_STACKING_TYPES,
  type FilterConnective,
} from "$lib/shared/browse/services/multi-filter";
import {
  legacyAliasesFor,
  resolvePersistedFilterType,
} from "$lib/shared/browse/services/legacy-filter-type-aliases";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type {
  BrowseEngine,
  ActiveFilter,
} from "$lib/shared/browse/engine/types";
import type {
  SmartFilterSpec,
  StoredSmartFilter,
} from "$lib/shared/library/domain/models/collection";

/**
 * Serialize the engine's current NON-locked filters, source, and sort into a
 * Firestore-safe SmartFilterSpec.
 */
export function buildFilterSpecFromEngine(
  engine: BrowseEngine
): SmartFilterSpec {
  const filters: StoredSmartFilter[] = [];
  for (const [key, f] of engine.activeFilters) {
    if (f.locked) continue;
    filters.push({
      key,
      type: String(f.type),
      value: f.value,
      label: f.label,
      chipColor: f.chipColor,
    });
  }
  const spec: SmartFilterSpec = {
    source: engine.source,
    filters,
    sortMethod: String(engine.sortMethod),
    sortDirection: engine.sortDirection,
  };
  const searchQuery = engine.searchQuery.trim();
  if (searchQuery) spec.searchQuery = searchQuery;
  const connectives = { ...engine.connectives };
  if (Object.keys(connectives).length > 0) {
    spec.connectives = connectives as Record<string, FilterConnective>;
  }
  return spec;
}

/**
 * Resolve a spec's connective per connective-bearing category. Stored choices
 * win. Specs saved before connectives existed get the meaning they had when
 * saved: two or more stacked LOOP/TnD entries were requirements ("all");
 * otherwise the current default ("any" — with ≤1 entries the two readings are
 * identical, so new-default is safe).
 */
export function resolveSpecConnectives(
  spec: SmartFilterSpec
): Record<string, FilterConnective> {
  const resolved: Record<string, FilterConnective> = {};
  for (const type of CONNECTIVE_STACKING_TYPES) {
    const key = String(type);
    // A spec saved before the type was renamed may have its connective
    // choice keyed by the old stored type string instead of the current one.
    const stored =
      spec.connectives?.[key] ??
      legacyAliasesFor(type)
        .map((legacyKey) => spec.connectives?.[legacyKey])
        .find((value) => value === "any" || value === "all");
    if (stored === "any" || stored === "all") {
      resolved[key] = stored;
      continue;
    }
    const entries = spec.filters.filter(
      (f) => resolvePersistedFilterType(f.type) === type
    ).length;
    resolved[key] = entries >= 2 ? "all" : "any";
  }
  return resolved;
}

/**
 * Replay a saved spec onto a fresh engine. Uses addFilter so composite loop /
 * TnD keys (which STACK) are reconstructed exactly, then applies the sort.
 * Call after creating the engine; the derived pipeline applies the filters
 * once the pool loads via initialize().
 */
export function applySpecToEngine(
  engine: BrowseEngine,
  spec: SmartFilterSpec
): void {
  for (const f of spec.filters) {
    // A spec saved before a FilterType value was renamed (e.g. "startPosition"
    // -> STARTING_PLACEMENT) still stores the old string; resolve it onto the
    // current enum value and drop anything that no longer maps to a filter
    // the engine understands, rather than passing a dead type through.
    const type = resolvePersistedFilterType(f.type);
    if (!type) continue;
    engine.addFilter(type, f.value, f.label, f.chipColor);
  }
  const connectives = resolveSpecConnectives(spec);
  for (const [type, connective] of Object.entries(connectives)) {
    engine.setConnective(type as BrowseFilterType, connective);
  }
  engine.setSearch(spec.searchQuery ?? "");
  engine.setSort(spec.sortMethod as BrowseSortMethod, spec.sortDirection);
}

/**
 * Pure derivation for tests and non-engine callers: filter a pool by a spec.
 * (The live detail view uses an engine; this mirrors its filter result.)
 */
export function deriveSpecMembers(
  pool: SequenceData[],
  spec: SmartFilterSpec
): SequenceData[] {
  const map = new Map<string, ActiveFilter>();
  for (const f of spec.filters) {
    const type = resolvePersistedFilterType(f.type);
    if (!type) continue;
    map.set(f.key, {
      type,
      value: f.value,
      label: f.label,
      chipColor: f.chipColor,
      locked: false,
    });
  }
  const filtered = applyFilters(pool, map, resolveSpecConnectives(spec));
  return spec.searchQuery?.trim()
    ? applyFilter(
        filtered,
        BrowseFilterType.CONTAINS_LETTERS,
        spec.searchQuery.trim()
      )
    : filtered;
}
