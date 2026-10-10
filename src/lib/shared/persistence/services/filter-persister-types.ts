import type { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import type { BrowseFilterType } from "../domain/enums/filtering-enums";
import type { BrowseFilterValue } from "../domain/types/filtering-types";

// Simple filter history entry type
export interface FilterHistoryEntry {
  type: BrowseFilterType;
  value: BrowseFilterValue;
  appliedAt: Date;
}

// Simple browse state for persistence
export interface SimpleBrowseState {
  filterType: BrowseFilterType | null;
  filterValue: BrowseFilterValue;
  sortMethod: BrowseSortMethod;
}
