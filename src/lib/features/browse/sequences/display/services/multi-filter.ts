/**
 * Multi-Filter Implementation
 *
 * Composes the existing BrowseFilter to apply multiple filters
 * with AND logic. Each filter type narrows the result set.
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import type { BrowseFilterValue } from "#lib/shared/persistence/domain/types/filtering-types.js";
import type { ActiveFilter } from "../../../shared/domain/models/multi-filter-models";
import type { BrowseFilter } from "#lib/features/browse/sequences/display/services/browse-filter.js";
export class MultiFilter {
  constructor(private readonly browseFilter: BrowseFilter) {}

  applyFilters(
    sequences: SequenceData[],
    filters: Map<string, ActiveFilter>
  ): SequenceData[] {
    let result = sequences;

    for (const filter of filters.values()) {
      result = this.browseFilter.applyFilter(
        result,
        filter.type,
        filter.value
      );
    }

    return result;
  }

  getFilteredCount(
    sequences: SequenceData[],
    candidateType: BrowseFilterType,
    candidateValue: BrowseFilterValue,
    otherFilters: Map<string, ActiveFilter>
  ): number {
    // First apply all other filters (excluding the candidate type)
    let filtered = sequences;

    for (const [key, filter] of otherFilters) {
      if (key === candidateType) continue;
      filtered = this.browseFilter.applyFilter(
        filtered,
        filter.type,
        filter.value
      );
    }

    // Then apply the candidate filter
    filtered = this.browseFilter.applyFilter(
      filtered,
      candidateType,
      candidateValue
    );

    return filtered.length;
  }
}
