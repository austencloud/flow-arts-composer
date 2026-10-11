/**
 * Browse Engine Types
 *
 * Headless browse engine interfaces. The engine manages filtering, sorting,
 * sectioning, source switching, favorites, and grid layout for any
 * sequence-browsing surface (gallery tab, modal picker, card designer).
 *
 * Key design decisions:
 * - Constraints are locked filters (`locked: true` on ActiveFilter)
 * - All filtering is a reactive `$derived` pipeline
 * - Engine calls existing singleton services internally
 * - `persistKey` controls localStorage persistence (null = ephemeral)
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import type { BrowseFilterValue } from "#lib/shared/persistence/domain/types/filtering-types.js";
import type { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import type { SequenceSection } from "#lib/shared/browse/domain/models/browse-models.js";
import type { BrowseViewMode } from "#lib/shared/browse/domain/browse-view-mode.js";
import type { FilterConnective } from "#lib/shared/browse/services/multi-filter.js";

// Sequence Source

/** Where the engine loads sequences from. */
export type SequenceSource = "community" | "my-library";

// Active Filter (engine-owned, includes `locked`)

/**
 * A single active filter. Engine's own type — extends the existing
 * multi-filter `ActiveFilter` with a `locked` flag.
 *
 * Locked filters represent constraints set by the host (e.g. a modal
 * picker that only shows length-4 sequences). They cannot be removed
 * by the user and are not shown as dismissible chips.
 */
export interface ActiveFilter {
  type: BrowseFilterType;
  value: BrowseFilterValue;
  /** Human-readable label for chip display (e.g. "Level 2", "Favorites"). */
  label: string;
  /** CSS color for chip accent — a CSS variable reference or hex value. */
  chipColor: string;
  /** When true, this filter was set by the host and cannot be removed by the user. */
  locked: boolean;
}

// Section Grouping

/** How sequences are grouped into sections. */
export type SectionGroupBy =
  | keyof SequenceData
  | "letter"
  | "length"
  | "difficulty"
  | "date"
  | "tnd-family"
  | "none";

// Persisted State

/** Shape written to / read from localStorage under `persistKey`. */
export interface PersistedEngineState {
  source: SequenceSource;
  sortMethod: BrowseSortMethod;
  sortDirection: "asc" | "desc";
  /** Serialized Map<string, ActiveFilter> entries (non-locked only). */
  activeFilters: Array<[string, ActiveFilter]>;
  /**
   * Match any / all choices for connective-bearing categories, keyed by
   * BrowseFilterType string value. Absent in state persisted before
   * connectives existed — restored sessions with ≥2 stacked entries of a
   * type keep their old "all" meaning (see buildInitialConnectives).
   */
  connectives?: Record<string, FilterConnective>;
  columns: number;
  viewMode?: BrowseViewMode;
}

// Config

/**
 * Configuration passed to `createBrowseEngine()`.
 *
 * Hosts provide this to customize the engine for their surface.
 * Sensible defaults are applied for every optional field.
 */
export interface BrowseEngineConfig {
  /** Use the shared paged account loader for the Saved sequences shelf. */
  progressiveLibrary?: boolean;
  /**
   * localStorage key prefix for persisting engine state.
   * `null` = ephemeral (modal pickers that shouldn't remember state).
   */
  persistKey: string | null;

  /** Initial source. Defaults to "community". */
  initialSource?: SequenceSource;

  /** Initial sort method. Defaults to ALPHABETICAL. */
  initialSort?: BrowseSortMethod;

  /** Initial sort direction. Defaults to "asc". */
  initialSortDirection?: "asc" | "desc";

  /**
   * Locked filters — constraints the host imposes that the user cannot remove.
   * Example: a modal picker that only shows sequences of length 4.
   */
  constraints?: Array<{
    type: BrowseFilterType;
    value: BrowseFilterValue;
    label: string;
  }>;

  /** Pins the column count and skips width auto-adaptation. Test harnesses only. */
  initialColumns?: number;

  /** Minimum grid columns. Defaults to 2. */
  minColumns?: number;

  /** Whether the source toggle (community / my-library) is available. */
  allowSourceToggle?: boolean;

  /** Enable section grouping. Defaults to false. */
  sections?: boolean;

  /** Default section grouping strategy. Defaults to "letter". */
  defaultSectionGroupBy?: SectionGroupBy;

  /** Which sources are available. Defaults to both community and my-library. */
  sources?: SequenceSource[];

  /**
   * Extra sequences appended to the COMMUNITY pool once resolved (e.g. the
   * canonical T&D alphabet — generated, not saved, so the loader can't know
   * them). Appended asynchronously after the loader's results so first paint
   * never waits on it; deduplicated by id against the loaded pool.
   */
  extraCommunitySequences?: () => Promise<readonly SequenceData[]>;

  /**
   * Optional artifact loader for My Library's solo prop/hand-path modes.
   * Hosts that omit it keep the historical behavior of projecting one hand
   * from full sequences.
   */
  loadSoloLibrarySequences?: (
    viewMode: BrowseViewMode
  ) => Promise<readonly SequenceData[]>;
}

// Engine

/**
 * The headless browse engine returned by `createBrowseEngine()`.
 *
 * All state properties are reactive (Svelte 5 `$state` / `$derived`).
 * Methods mutate state; the reactive pipeline propagates changes.
 */
export interface BrowseEngine {
  // --- Reactive state (read-only from consumers) ---

  /** True while loading sequences from Firestore / library. */
  readonly isLoading: boolean;
  /** The first library page is visible while remaining pages arrive. */
  readonly isLoadingMore: boolean;
  readonly loadMoreError: string | null;
  /** Whether every sequence in the current source has arrived. */
  readonly isLibraryComplete: boolean;
  /** Error message from the last failed operation, or null. */
  readonly error: string | null;
  /** Current sequence source. */
  readonly source: SequenceSource;

  /** All sequences from the current source (unfiltered). */
  readonly allSequences: readonly SequenceData[];
  /** Sequences after filtering + sorting. */
  readonly sequences: readonly SequenceData[];
  /** Number of filtered sequences (convenience for `sequences.length`). */
  readonly resultCount: number;
  /** Sequences organized into titled sections. */
  readonly sections: readonly SequenceSection[];
  /** True once the first load + section organization is complete. */
  readonly sectionsReady: boolean;

  /** Current search text. */
  readonly searchQuery: string;

  /** Current sort method. */
  readonly sortMethod: BrowseSortMethod;
  /** Current sort direction. */
  readonly sortDirection: "asc" | "desc";

  /** All active filters (user-set + locked constraints). */
  readonly activeFilters: ReadonlyMap<string, ActiveFilter>;
  /** All filter chips (locked + user), for chip bar rendering. Each carries
   * its map key — the handle for removeFilter. One-per-type filters key as
   * String(type); stackable loop-component filters key as `${type}:${value}`,
   * so several can coexist (a sequence can be mirrored AND swapped). */
  readonly allFilterChips: readonly (ActiveFilter & { key: string })[];
  /** Number of active user-set (non-locked) filters. */
  readonly userFilterCount: number;
  /** True if any user-set (non-locked) filters are active. */
  readonly hasActiveFilters: boolean;
  /** Match any / all choices for connective-bearing categories (LOOPs, T&D),
   * keyed by BrowseFilterType string value. Default "any" — stacking widens
   * unless the user opts into "all". */
  readonly connectives: Readonly<Record<string, FilterConnective>>;

  // --- Layout (flat getters) ---

  /** Current number of grid columns. */
  readonly columnCount: number;
  /** True when zoom-in (more columns) is available. */
  readonly canZoomIn: boolean;
  /** True when zoom-out (fewer columns) is available. */
  readonly canZoomOut: boolean;
  /** True for ~200ms after column change (CSS transition hint). */
  readonly isTransitioning: boolean;

  // --- Source / section state ---

  /** True when the source toggle is available. */
  readonly canSwitchSource: boolean;
  /** Whether section grouping is enabled. */
  readonly sectionsEnabled: boolean;
  /** Current section grouping strategy. */
  readonly sectionGroupBy: SectionGroupBy;

  // --- View mode (compositional browsing) ---

  /** Current view mode (props/hands × combined/solo). */
  readonly viewMode: BrowseViewMode;

  // --- Available filter metadata (for building filter UIs) ---

  /** Distinct sequence lengths present in allSequences. */
  readonly availableLengths: readonly number[];
  /** Distinct turn-intensity CEILINGS present in allSequences (each > 0),
   * ascending — the pool-derived options for the Max Turn Intensity filter. */
  readonly availableMaxTurnIntensities: readonly number[];
  /** LOOP type counts: { loopType: count, _total, _circular, _non_circular }. */
  readonly loopTypeCounts: Readonly<Record<string, number>>;

  /** Load initial data for current source. Call on mount. */
  initialize(): Promise<void>;

  /**
   * Supply the pool directly instead of loading one, for a surface that
   * already owns its list — a collection's members, batch-read by id, which
   * can include sequences no browsable pool contains. Such a host calls this
   * instead of `initialize()`, and calls it again whenever its list changes.
   * Everything downstream (search, sort, filters, sections) is unchanged.
   */
  setPool(sequences: readonly SequenceData[]): void;

  /** Force reload (invalidates cache). For retry buttons. */
  refresh(): Promise<void>;

  /** Set the search query text. Filters pipeline reactively. */
  setSearch(query: string): void;

  /** Switch source (community / my-library). Loads data. */
  setSource(source: SequenceSource): Promise<void>;

  /** Change sort method and direction. Recomputes pipeline. */
  setSort(method: BrowseSortMethod, direction: "asc" | "desc"): void;

  /**
   * Add or replace a user filter. Locked filters cannot be overwritten
   * by this method. LOOP_TYPE filters STACK (keyed `${type}:${value}`) —
   * adding a second loop component ANDs with the first instead of replacing.
   */
  addFilter(
    type: BrowseFilterType,
    value: BrowseFilterValue,
    label: string,
    chipColor: string
  ): void;

  /** Remove a user filter by map key. Locked filters are ignored. Prefix
   * aware: removeFilter("cap_type") clears every stacked "cap_type:<value>"
   * loop filter; a full composite key clears just that one. */
  removeFilter(typeKey: string): void;

  /** Clear all user-set filters. Locked filters remain. */
  clearUserFilters(): void;

  /** Set the Match any / all connective for a connective-bearing category
   * (LOOP_TYPE, TND_FAMILY). No-op for other types. */
  setConnective(type: BrowseFilterType, connective: FilterConnective): void;

  /**
   * Contextual count: how many sequences would match if a candidate
   * filter were added, given other active filters.
   */
  getFilteredCount(
    candidateType: BrowseFilterType,
    candidateValue: BrowseFilterValue
  ): number;

  /** Toggle favorite status for a sequence. Updates local state. */
  toggleFavorite(sequenceId: string): Promise<void>;

  /** Set grid column count (clamped to min/max). */
  setColumns(columns: number): void;

  /** Update container width (from ResizeObserver). Re-clamps columns. */
  updateContainerWidth(width: number): void;

  /** Zoom in (more columns, smaller cards). */
  zoomIn(): void;

  /** Zoom out (fewer columns, larger cards). */
  zoomOut(): void;

  /** Enable or disable section grouping. */
  setSectionsEnabled(enabled: boolean): void;

  setSectionGroupBy(groupBy: SectionGroupBy): void;

  /** Set the browse view mode (props/hands × combined/solo). */
  setViewMode(mode: BrowseViewMode): void;

  /** Invalidate library cache (e.g. when impersonated user changes). */
  invalidateLibraryCache(): void;

  /** Clean up effects and event listeners. */
  destroy(): void;
}
