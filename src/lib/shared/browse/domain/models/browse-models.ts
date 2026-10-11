import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";

/**
 * Essential Browse Models - Keep It Simple!
 *
 * Only the models actually needed for basic browse functionality.
 * No over-engineering, no complex state management.
 */

export interface BrowseSection {
  id: string;
  title: string;
  count: number;
  sequences: SequenceData[];
  isExpanded: boolean;
  sortOrder: number;
}

// Essential types that are still needed by other modules
export interface SectionConfig {
  groupBy:
    | keyof SequenceData
    | "letter"
    | "length"
    | "difficulty"
    | "date"
    | "tnd-family"
    | "none";
  sortMethod: BrowseSortMethod;
  showEmptySections: boolean;
  expandedSections?: Set<string>;
  sortOrder?: "asc" | "desc";
  showCounts?: boolean;
}

export interface SequenceSection {
  id: string;
  title: string;
  count: number;
  sequences: SequenceData[];
  isExpanded: boolean;
  sortOrder: number;
  /** Numeric difficulty level (1–3) when grouped by difficulty. Drives the
   *  level→letter hierarchy in the grid banner and the section-index sidebar. */
  level?: number;
  /** Short label for the section within its parent group (e.g. the letter
   *  "A" under a level). Lets the grid/sidebar avoid parsing the title. */
  groupLabel?: string;
}

// Simple display state for components that need it
export interface BrowseDisplayState {
  currentView: "filter_selection" | "sequence_browser";
  selectedSequence: SequenceData | null;
  isSequenceDetailOpen: boolean;
}

export interface BrowseLoadingState {
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string | null;
}

// Factory functions
export function createDefaultDisplayState(): BrowseDisplayState {
  return {
    currentView: "filter_selection",
    selectedSequence: null,
    isSequenceDetailOpen: false,
  };
}

export function createDefaultLoadingState(): BrowseLoadingState {
  return {
    isLoading: false,
    hasError: false,
    errorMessage: null,
  };
}

// Simple state for persistence (if needed)
export interface CompleteBrowseState {
  lastUpdated: Date;
  version: number;
}
