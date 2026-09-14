/**
 * createBrowseEngine — Headless Browse State Machine
 *
 * Replaces three separate state files with a single reactive engine:
 * - browse-state-factory.svelte.ts (filtering, sorting, sections, favorites, cache)
 * - grid-zoom-state.svelte.ts (column count, breakpoints)
 * - sequence-source-state.svelte.ts (community/my-library toggle, auth guard)
 *
 * Pure TypeScript + Svelte 5 runes. No DOM, no components.
 * Calls existing singleton services internally.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type {
  BrowseEngine,
  BrowseEngineConfig,
  ActiveFilter,
  SequenceSource,
  PersistedEngineState,
  SectionGroupBy,
} from "./types";

import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import type { BrowseFilterValue } from "$lib/shared/persistence/domain/types/filtering-types";
import { BrowseSortMethod } from "$lib/shared/browse/domain/enums/browse-enums";
import {
  DEFAULT_BROWSE_VIEW_MODE,
  normalizeBrowseViewMode,
  type BrowseViewMode,
} from "$lib/shared/browse/domain/browse-view-mode";
import type {
  SectionConfig,
  SequenceSection,
} from "$lib/shared/browse/domain/models/browse-models";

import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { parseLoopComponents } from "$lib/shared/create/services/loop-type-utils";
import { detectRotationPeriod } from "$lib/shared/create/domain/detect-rotation-period";
import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
import {
  applyFilter as applyBrowseFilter,
  getSequenceMaxTurn,
} from "$lib/shared/browse/services/browse-filter";
import {
  applyFilters as applyMultiFilters,
  getFilteredCount as getMultiFilteredCount,
  OR_STACKING_TYPES,
  CONNECTIVE_STACKING_TYPES,
  type FilterConnective,
} from "$lib/shared/browse/services/multi-filter";
import { sortSequences as browseSortSequences } from "$lib/shared/browse/services/browse-sorter";
import { withLibraryBrowseDate } from "$lib/shared/browse/services/browse-date";
import { organizeSections as organizeBrowseSections } from "$lib/shared/browse/services/browse-section-manager";
import { toggleFavorite as doToggleFavorite } from "$lib/shared/library/services/collection-manager";
import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
import { getSavedSequenceIds } from "$lib/shared/library/services/saved-sequence-ledger";

import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { isPreviewReadOnly } from "$lib/shared/debug/state/user-preview-state.svelte";
import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
import {
  onLibraryMutated,
  onLibrarySequenceAdded,
} from "$lib/shared/library/library-events";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import {
  MIN_COLUMNS as MIN_COLUMNS_DEFAULT,
  getMaxColumnsForWidth,
  getDefaultColumnsForWidth,
  getWidthBucketKey,
  clampColumnsToWidth,
} from "$lib/shared/browse/services/grid-column-breakpoints";

// Helpers

function deduplicateById(sequences: SequenceData[]): SequenceData[] {
  const seen = new Set<string>();
  return sequences.filter((seq) => {
    if (seen.has(seq.id)) return false;
    seen.add(seq.id);
    return true;
  });
}

function sameViewMode(a: BrowseViewMode, b: BrowseViewMode): boolean {
  return (
    a.subject === b.subject &&
    a.granularity === b.granularity &&
    a.hand === b.hand
  );
}

/** Filter labels are presentation copy, not durable user data. Normalize old
 * persisted labels on read so retired wording cannot survive indefinitely in
 * rule chips after the underlying meaning has changed. */
function currentFilterLabel(filter: ActiveFilter): string {
  if (filter.type === BrowseFilterType.PERFORMANCE_AVAILABILITY) {
    if (filter.value === "has-public-performance") {
      return "With a public performance";
    }
    if (filter.value === "no-public-performance") {
      return "Without a public performance";
    }
  }
  if (filter.type === BrowseFilterType.RECENT_PERFORMANCE) {
    return "Recently performed";
  }
  return filter.label;
}

// Persistence

function loadPersisted(key: string | null): PersistedEngineState | null {
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedEngineState;
  } catch {
    return null;
  }
}

function persist(key: string | null, state: PersistedEngineState): void {
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // Ignore storage errors (quota, SSR, etc.)
  }
}

// Factory

export function createBrowseEngine(config: BrowseEngineConfig): BrowseEngine {
  // --- Services (singleton factories) ---
  const loaderService = getBrowseLoader();

  const persisted = loadPersisted(config.persistKey);
  const minColumns = config.minColumns ?? MIN_COLUMNS_DEFAULT;

  const lockedFilters = new Map<string, ActiveFilter>();
  if (config.constraints) {
    for (const c of config.constraints) {
      lockedFilters.set(String(c.type), {
        type: c.type,
        value: c.value,
        label: c.label,
        chipColor: "var(--theme-accent)",
        locked: true,
      });
    }
  }

  // --- Merge persisted user filters with locked filters ---
  function buildInitialFilters(): Map<string, ActiveFilter> {
    const merged = new Map<string, ActiveFilter>(lockedFilters);
    if (persisted?.activeFilters) {
      for (const [key, filter] of persisted.activeFilters) {
        // Don't let persisted user filters overwrite locked constraints
        if (!merged.has(key)) {
          merged.set(key, {
            ...filter,
            label: currentFilterLabel(filter),
            locked: false,
          });
        }
      }
    }
    return merged;
  }

  let isLoading = $state(false);
  let error = $state<string | null>(null);
  // A persisted source the config no longer offers (e.g. the gallery dropped
  // its toggle) would strand the user in a scope they can't leave — sanitize
  // back to the configured initial source.
  const allowedSources = config.sources ?? ["community", "my-library"];
  const restoredSource =
    persisted?.source && allowedSources.includes(persisted.source)
      ? persisted.source
      : undefined;
  let source = $state<SequenceSource>(
    restoredSource ?? config.initialSource ?? "community"
  );
  let allSequences = $state<SequenceData[]>([]);
  let sectionsReady = $state(false);

  let sortMethod = $state<BrowseSortMethod>(
    persisted?.sortMethod ?? config.initialSort ?? BrowseSortMethod.ALPHABETICAL
  );
  let sortDirection = $state<"asc" | "desc">(
    persisted?.sortDirection ?? config.initialSortDirection ?? "asc"
  );

  let activeFilters = $state<Map<string, ActiveFilter>>(buildInitialFilters());

  // Match any / all per connective-bearing category. Stored choices win; a
  // restored session with ≥2 stacked entries of a type and no stored choice
  // predates connectives, where stacking meant "all" — keep its meaning.
  // Otherwise default "any": stacking widens unless the user opts into "all".
  function buildInitialConnectives(): Record<string, FilterConnective> {
    const initial: Record<string, FilterConnective> = {};
    for (const type of CONNECTIVE_STACKING_TYPES) {
      const key = String(type);
      const stored = persisted?.connectives?.[key];
      if (stored === "any" || stored === "all") {
        initial[key] = stored;
        continue;
      }
      let entries = 0;
      for (const [, f] of persisted?.activeFilters ?? []) {
        if (String(f.type) === key) entries++;
      }
      initial[key] = entries >= 2 ? "all" : "any";
    }
    return initial;
  }

  let connectives = $state<Record<string, FilterConnective>>(
    buildInitialConnectives()
  );

  // View mode (compositional browsing)
  let _viewMode = $state<BrowseViewMode>(
    persisted?.viewMode
      ? normalizeBrowseViewMode(persisted.viewMode)
      : { ...DEFAULT_BROWSE_VIEW_MODE }
  );

  // Search state
  let _searchQuery = $state("");

  // Section state
  let _sectionsEnabled = $state(config.sections ?? false);
  // Manual section-grouping override. When null (the default), grouping follows
  // the active sort method so the left section index always reflects the chosen
  // sort. A non-null value pins grouping regardless of sort. `config.defaultSectionGroupBy`
  // seeds the override only when a host explicitly wants to pin a grouping.
  let _sectionGroupByOverride = $state<SectionGroupBy | null>(
    config.defaultSectionGroupBy ?? null
  );

  // Layout state.
  // Density is scoped per width BUCKET (see getWidthBucketKey): a pinch made on
  // a phone stores a phone choice and must never pin a desktop at 2 huge
  // columns. The old global gridZoomLevel/gridColumnsExplicit pair did exactly
  // that and is no longer read — widths without a stored choice auto-adapt to
  // the bucket default (dense on 4K, readable on phones).
  // config.initialColumns pins the count entirely (test harnesses).
  const columnsPinned = config.initialColumns !== undefined;
  // Seed value: pinned count, else last persisted session count, else the min
  // until the first width measurement adapts it.
  let columns = $state<number>(
    config.initialColumns ?? persisted?.columns ?? MIN_COLUMNS_DEFAULT
  );
  let containerWidth = $state(0);
  let isTransitioning = $state(false);
  let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

  // Library cache (per-source + per-user, avoids Firestore round-trip on tab
  // switch without ever carrying one account's rows into another preview).
  let libraryCache: SequenceData[] | null = null;
  let libraryCacheUserId: string | null = null;
  // Every async producer of allSequences shares one revision. Source changes,
  // host-owned pools, and teardown invalidate older work before it can publish.
  let poolLoadRevision = 0;
  let initialized = false;
  let lastEffectiveUserId = authState.effectiveUserId;
  let lastFullAccount = authState.isFullAccount;

  // --- Derived: filtering + sorting pipeline ---

  const searchedPool = $derived.by(() =>
    _searchQuery.trim()
      ? applyBrowseFilter(
          allSequences,
          BrowseFilterType.CONTAINS_LETTERS,
          _searchQuery
        )
      : allSequences
  );

  const filteredAndSorted = $derived.by(() => {
    let result = searchedPool;

    if (activeFilters.size > 0) {
      // applyFilters is generic over `T extends ActiveFilter`, so the engine's
      // richer ActiveFilter (with `locked`) passes structurally — no cast needed.
      result = applyMultiFilters(result, activeFilters, connectives);
    }

    const sorted = browseSortSequences(result, sortMethod);
    if (sortDirection === "desc") {
      sorted.reverse();
    }
    return sorted;
  });

  // --- Derived: sections ---

  // Sort method → section grouping. Keeps the left section index in lockstep
  // with the toolbar sort: sorting by Level buckets into difficulty sections,
  // by Date into date sections, by Length into length sections, A–Z into letters.
  const SORT_TO_SECTION_GROUP: Record<BrowseSortMethod, SectionGroupBy> = {
    [BrowseSortMethod.ALPHABETICAL]: "letter",
    [BrowseSortMethod.DATE_ADDED]: "date",
    [BrowseSortMethod.DIFFICULTY_LEVEL]: "difficulty",
    [BrowseSortMethod.SEQUENCE_LENGTH]: "length",
    [BrowseSortMethod.AUTHOR]: "author",
    [BrowseSortMethod.POPULARITY]: "letter",
    // Curated has no natural section; letter sections keep the index useful,
    // which is what the missing-key fallback below always resolved to anyway.
    [BrowseSortMethod.CURATED]: "letter",
  };

  const effectiveSectionGroupBy = $derived.by((): SectionGroupBy => {
    if (_sectionGroupByOverride) return _sectionGroupByOverride;
    let groupBy = SORT_TO_SECTION_GROUP[sortMethod] ?? "letter";
    // Hands mode has no letter/difficulty semantics — fall back to length.
    if (
      _viewMode.subject === "hands" &&
      (groupBy === "letter" || groupBy === "difficulty")
    ) {
      groupBy = "length";
    }
    return groupBy;
  });

  const sections = $derived.by((): SequenceSection[] => {
    if (!_sectionsEnabled || !sectionsReady) return [];
    const sectionConfig: SectionConfig = {
      groupBy: effectiveSectionGroupBy,
      sortMethod,
      showEmptySections: false,
      expandedSections: new Set<string>(),
    };
    return organizeBrowseSections(filteredAndSorted, sectionConfig);
  });

  // --- Derived: filter metadata ---

  const userFilterCount = $derived.by(() => {
    let count = 0;
    for (const f of activeFilters.values()) {
      if (!f.locked) count++;
    }
    return count;
  });

  const hasActiveFilters = $derived(userFilterCount > 0);

  const allFilterChips = $derived.by(() => {
    // Attach each filter's map key — chips dismiss by key, and loop-component
    // filters use composite keys so several can be active at once.
    return Array.from(activeFilters, ([key, f]) => ({ ...f, key }));
  });

  const availableLengths = $derived.by(() => {
    const lengths = new Set<number>();
    for (const seq of allSequences) {
      const len = seq.sequenceLength ?? seq.steps?.length ?? 0;
      if (len > 0) lengths.add(len);
    }
    return Array.from(lengths).sort((a, b) => a - b);
  });

  const availableMaxTurnIntensities = $derived.by(() => {
    const ceilings = new Set<number>();
    for (const seq of allSequences) {
      const m = getSequenceMaxTurn(seq);
      if (m > 0) ceilings.add(m);
    }
    return Array.from(ceilings).sort((a, b) => a - b);
  });

  const loopTypeCounts = $derived.by(() => {
    const counts: Record<string, number> = {};
    let circularCount = 0;
    const total = allSequences.length;

    // Per-component counters
    let rotatedHalvedCount = 0;
    let rotatedQuarteredCount = 0;
    const componentCounts = new Map<LOOPComponent, number>();

    for (const seq of allSequences) {
      if (seq.isCircular) {
        circularCount++;
        if (seq.loopType) {
          counts[seq.loopType] = (counts[seq.loopType] ?? 0) + 1;
        }
      }

      const comps: readonly LOOPComponent[] = seq.components?.length
        ? seq.components
        : seq.loopType
          ? Array.from(parseLoopComponents(seq.loopType as LOOPType))
          : [];

      for (const comp of comps) {
        componentCounts.set(comp, (componentCounts.get(comp) ?? 0) + 1);
      }
      if (comps.includes(LOOPComponent.ROTATED)) {
        const period =
          seq.period ??
          (seq.steps?.length ? detectRotationPeriod(seq.id, seq.steps) : 2);
        // Match filterByLOOPComponent exactly: halved = period <= 2,
        // quartered = period === 4. Anomalous stored periods (3, 5+)
        // match neither filter, so they must count in neither bucket.
        if (period === 4) {
          rotatedQuarteredCount++;
        } else if (period <= 2) {
          rotatedHalvedCount++;
        }
      }
    }

    counts["_total"] = total;
    counts["_circular"] = circularCount;
    counts["_non_circular"] = total - circularCount;

    // Component counts keyed as "component:<name>"
    counts["component:rotated_halved"] = rotatedHalvedCount;
    counts["component:rotated_quartered"] = rotatedQuarteredCount;
    for (const comp of [
      LOOPComponent.MIRRORED,
      LOOPComponent.FLIPPED,
      LOOPComponent.SWAPPED,
      LOOPComponent.INVERTED,
      LOOPComponent.REWOUND,
    ]) {
      counts[`component:${comp}`] = componentCounts.get(comp) ?? 0;
    }

    return counts;
  });

  // --- Derived: layout ---

  const maxColumns = $derived(getMaxColumnsForWidth(containerWidth));

  // --- Persistence effect ---

  $effect(() => {
    // Read all reactive values to track them
    const _source = source;
    const _sortMethod = sortMethod;
    const _sortDirection = sortDirection;
    const _filters = activeFilters;
    const _connectives = connectives;
    const _columns = columns;
    const viewMode = _viewMode;

    if (!config.persistKey) return;

    // Serialize only non-locked filters
    const userFilters: Array<[string, ActiveFilter]> = [];
    for (const [key, filter] of _filters) {
      if (!filter.locked) {
        userFilters.push([key, filter]);
      }
    }

    persist(config.persistKey, {
      source: _source,
      sortMethod: _sortMethod,
      sortDirection: _sortDirection,
      activeFilters: userFilters,
      connectives: _connectives,
      columns: _columns,
      viewMode,
    });
  });

  // --- Library mutation listeners ---

  const cleanupMutated = $effect.root(() => {
    $effect(() => {
      return onLibraryMutated((sequenceId) => {
        libraryCache = libraryCache?.filter((s) => s.id !== sequenceId) ?? null;
        loaderService.removeFromCache(sequenceId);
        allSequences = allSequences.filter((s) => s.id !== sequenceId);
      });
    });

    $effect(() => {
      return onLibrarySequenceAdded((sequence) => {
        if (source === "my-library") {
          const librarySequence = withLibraryBrowseDate(sequence);
          if (libraryCache) {
            libraryCache = [librarySequence, ...libraryCache];
          }
          allSequences = deduplicateById([librarySequence, ...allSequences]);
        } else {
          // Invalidate cache so next switch fetches fresh data
          libraryCache = null;
        }
      });
    });

    $effect(() => {
      const currentEffectiveUserId = authState.effectiveUserId;
      const currentFullAccount = authState.isFullAccount;
      if (
        currentEffectiveUserId === lastEffectiveUserId &&
        currentFullAccount === lastFullAccount
      )
        return;

      // A preview switch can happen while this engine stays mounted. Empty the
      // previous account immediately, cancel its in-flight request, and load the
      // new account through the same path a fresh Library visit uses.
      lastEffectiveUserId = currentEffectiveUserId;
      lastFullAccount = currentFullAccount;
      libraryCache = null;
      libraryCacheUserId = null;
      if (source === "my-library") {
        // Public community requests are independent of account identity. Only
        // invalidate a request here when replacing the account-owned pool.
        poolLoadRevision += 1;
        allSequences = [];
        sectionsReady = false;
        if (initialized) void loadLibrarySequences();
      }
    });

    // Return root cleanup
    return () => {};
  });

  // --- Internal: load sequences ---

  async function loadCommunitySequences(refresh = false): Promise<void> {
    const requestRevision = ++poolLoadRevision;
    const isCurrentRequest = (): boolean =>
      requestRevision === poolLoadRevision && source === "community";

    try {
      isLoading = true;
      sectionsReady = false;
      error = null;
      const sequences = refresh
        ? await loaderService.refreshFromFirestore()
        : await loaderService.loadSequenceMetadata();
      if (!isCurrentRequest()) return;
      allSequences = deduplicateById(sequences);
      sectionsReady = true;
      appendExtraCommunitySequences(requestRevision);
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error("[BrowseEngine] Failed to load community sequences:", err);
      error = err instanceof Error ? err.message : "Failed to load sequences";
    } finally {
      if (isCurrentRequest()) isLoading = false;
    }
  }

  /** Append host-provided extras (e.g. the canonical T&D alphabet) to the
   * community pool without blocking first paint. Guarded on source so a
   * mid-resolve switch to my-library never pollutes the library view; the
   * next community load re-runs this (the provider caches its result). */
  function appendExtraCommunitySequences(requestRevision: number): void {
    const provider = config.extraCommunitySequences;
    if (!provider) return;
    provider()
      .then((extra) => {
        if (
          requestRevision !== poolLoadRevision ||
          source !== "community" ||
          extra.length === 0
        )
          return;
        allSequences = deduplicateById([...allSequences, ...extra]);
      })
      .catch((err) => {
        if (requestRevision !== poolLoadRevision || source !== "community")
          return;
        console.error("[BrowseEngine] extraCommunitySequences failed:", err);
      });
  }

  async function loadLibrarySequences(): Promise<void> {
    const requestRevision = ++poolLoadRevision;
    const requestedUserId = authState.effectiveUserId;
    const requestedFullAccount = authState.isFullAccount;
    const requestedViewMode = { ..._viewMode };
    const isCurrentRequest = (): boolean =>
      requestRevision === poolLoadRevision &&
      requestedUserId === authState.effectiveUserId &&
      requestedFullAccount === authState.isFullAccount &&
      source === "my-library" &&
      sameViewMode(_viewMode, requestedViewMode);

    if (!requestedUserId) {
      allSequences = [];
      libraryCache = null;
      libraryCacheUserId = null;
      error = null;
      sectionsReady = true;
      isLoading = false;
      return;
    }

    const soloLoader = config.loadSoloLibrarySequences;
    if (requestedViewMode.granularity === "solo" && soloLoader) {
      if (!authState.isFullAccount) {
        error = "Create an account to view saved solo choreography";
        allSequences = [];
        sectionsReady = true;
        isLoading = false;
        return;
      }
      try {
        isLoading = true;
        sectionsReady = false;
        error = null;
        const sequences = (await soloLoader(requestedViewMode)).map(
          withLibraryBrowseDate
        );
        if (!isCurrentRequest()) return;
        allSequences = deduplicateById([...sequences]);
        sectionsReady = true;
      } catch (err) {
        if (!isCurrentRequest()) return;
        console.error("[BrowseEngine] Failed to load solo library:", err);
        error =
          err instanceof Error ? err.message : "Failed to load solo library";
        allSequences = [];
        sectionsReady = false;
      } finally {
        if (isCurrentRequest()) isLoading = false;
      }
      return;
    }

    // Fast path: use cached data
    if (libraryCache && libraryCacheUserId === requestedUserId) {
      allSequences = libraryCache;
      sectionsReady = true;
      isLoading = false;
      return;
    }

    // The device cache survives sign-out and includes other sessions' work.
    // Only ids recorded for this guest are their saves; an empty ledger must
    // never fall back to showing the whole device cache.
    if (!authState.isFullAccount) {
      try {
        isLoading = true;
        sectionsReady = false;
        error = null;
        const savedIds = new Set(getSavedSequenceIds(requestedUserId));
        const rows = savedIds.size
          ? await (
              await import("$lib/shared/persistence/services/dexie-persistence-service")
            ).getAllSequences()
          : [];
        const local = deduplicateById(
          rows
            .filter((sequence) => savedIds.has(sequence.id))
            .map(withLibraryBrowseDate)
        );
        if (!isCurrentRequest()) return;
        allSequences = local;
        libraryCache = local;
        libraryCacheUserId = requestedUserId;
        sectionsReady = true;
      } catch (err) {
        if (!isCurrentRequest()) return;
        console.error("[BrowseEngine] Failed to load local library:", err);
        error = err instanceof Error ? err.message : "Failed to load library";
      } finally {
        if (isCurrentRequest()) isLoading = false;
      }
      return;
    }

    // Auth guard (full-account Firestore path)
    if (!authState.isAuthenticated) {
      error = "Please sign in to view your library";
      allSequences = [];
      sectionsReady = false;
      isLoading = false;
      return;
    }

    const libRepo = getLibraryRepository();
    if (!libRepo) {
      error = "Library service unavailable";
      allSequences = [];
      sectionsReady = false;
      isLoading = false;
      return;
    }

    try {
      isLoading = true;
      sectionsReady = false;
      error = null;
      const sequences = await libRepo.getSequences();
      if (!isCurrentRequest()) return;
      const deduped = deduplicateById(
        (sequences as SequenceData[]).map(withLibraryBrowseDate)
      );
      allSequences = deduped;
      libraryCache = deduped;
      libraryCacheUserId = requestedUserId;
      sectionsReady = true;
    } catch (err) {
      if (!isCurrentRequest()) return;
      console.error("[BrowseEngine] Failed to load library sequences:", err);
      error = err instanceof Error ? err.message : "Failed to load library";
    } finally {
      if (isCurrentRequest()) isLoading = false;
    }
  }

  // --- Layout helpers ---

  function triggerTransition(): void {
    isTransitioning = true;
    if (transitionTimeout) clearTimeout(transitionTimeout);
    transitionTimeout = setTimeout(() => {
      isTransitioning = false;
      transitionTimeout = null;
    }, 200);
  }

  function persistColumns(cols: number): void {
    // A write here always follows a deliberate setColumns. Store the choice
    // under the CURRENT width bucket only — other viewport classes keep
    // auto-adapting to their own defaults.
    const key = getWidthBucketKey(containerWidth);
    const buckets = settingsService.settings.gridZoomByBucket ?? {};
    if (buckets[key] !== cols) {
      settingsService.updateSetting("gridZoomByBucket", {
        ...buckets,
        [key]: cols,
      });
    }
  }

  // --- Public API ---

  const engine: BrowseEngine = {
    // Reactive getters
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get source() {
      return source;
    },
    get allSequences() {
      return allSequences;
    },
    get sequences() {
      return filteredAndSorted;
    },
    get resultCount() {
      return filteredAndSorted.length;
    },
    get sections() {
      return sections;
    },
    get sectionsReady() {
      return sectionsReady;
    },
    get searchQuery() {
      return _searchQuery;
    },
    get sortMethod() {
      return sortMethod;
    },
    get sortDirection() {
      return sortDirection;
    },
    get activeFilters() {
      return activeFilters;
    },
    get allFilterChips() {
      return allFilterChips;
    },
    get userFilterCount() {
      return userFilterCount;
    },
    get hasActiveFilters() {
      return hasActiveFilters;
    },
    get connectives() {
      return connectives;
    },

    // Layout (flat getters). `columns` is the DESIRED density; the render count
    // is it clamped to the current width — desired is never mutated by width.
    get columnCount() {
      return clampColumnsToWidth(columns, containerWidth, minColumns);
    },
    get canZoomIn() {
      // Compare the VISIBLE count (desired may exceed the width's max).
      return (
        clampColumnsToWidth(columns, containerWidth, minColumns) < maxColumns
      );
    },
    get canZoomOut() {
      return (
        clampColumnsToWidth(columns, containerWidth, minColumns) > minColumns
      );
    },
    get isTransitioning() {
      return isTransitioning;
    },

    // Source / section state
    get canSwitchSource() {
      return (
        config.allowSourceToggle !== false && (config.sources?.length ?? 2) > 1
      );
    },
    get sectionsEnabled() {
      return _sectionsEnabled;
    },
    get sectionGroupBy() {
      return effectiveSectionGroupBy;
    },

    get viewMode() {
      return _viewMode;
    },

    get availableLengths() {
      return availableLengths;
    },
    get availableMaxTurnIntensities() {
      return availableMaxTurnIntensities;
    },
    get loopTypeCounts() {
      return loopTypeCounts;
    },

    // --- Initialize / Refresh ---
    async initialize(): Promise<void> {
      initialized = true;
      if (source === "my-library") await loadLibrarySequences();
      else await loadCommunitySequences();
    },

    setPool(sequences: readonly SequenceData[]): void {
      poolLoadRevision += 1;
      const pool =
        source === "my-library"
          ? sequences.map(withLibraryBrowseDate)
          : [...sequences];
      allSequences = deduplicateById(pool);
      // The host owns the list, so there is nothing left to wait for — without
      // this the panel sits on its skeleton forever.
      sectionsReady = true;
      isLoading = false;
      error = null;
    },

    async refresh(): Promise<void> {
      libraryCache = null;
      libraryCacheUserId = null;
      if (source === "my-library") await loadLibrarySequences();
      else await loadCommunitySequences(true);
    },

    // --- Search ---
    setSearch(query: string): void {
      _searchQuery = query;
    },

    // --- Source ---
    async setSource(newSource: SequenceSource): Promise<void> {
      // Auth guard for library
      if (newSource === "my-library" && !authState.isAuthenticated) {
        return;
      }
      // Skip if already showing this source with data loaded
      if (newSource === source && sectionsReady) {
        return;
      }
      source = newSource;
      if (newSource === "my-library") {
        await loadLibrarySequences();
      } else {
        await loadCommunitySequences();
      }
    },

    // --- Sort ---
    setSort(method: BrowseSortMethod, direction: "asc" | "desc"): void {
      sortMethod = method;
      sortDirection = direction;
      // Pipeline recomputes via $derived automatically
    },

    // --- Filters ---
    addFilter(
      type: BrowseFilterType,
      value: BrowseFilterValue,
      label: string,
      chipColor: string
    ): void {
      // Stacking filters get one key PER VALUE: loop components and TnD
      // families stack as requirements (mirrored AND swapped), single-valued
      // categories stack as alternatives (alpha OR beta — multi-filter owns
      // that grouping). Everything else stays one-per-type: re-adding
      // replaces.
      const stacks =
        type === BrowseFilterType.LOOP_TYPE ||
        type === BrowseFilterType.TND_FAMILY ||
        OR_STACKING_TYPES.has(type);
      const key = stacks ? `${type}:${String(value)}` : String(type);
      // Don't overwrite locked constraints. Locked constraints key by bare
      // type, so stacked adds must also respect a locked same-type entry.
      const existing = activeFilters.get(key);
      if (existing?.locked) return;
      if (stacks && activeFilters.get(String(type))?.locked) return;

      const newMap = new Map(activeFilters);
      newMap.set(key, {
        type,
        value,
        label,
        chipColor,
        locked: false,
      });
      activeFilters = newMap;
    },

    removeFilter(typeKey: string): void {
      // Exact key, plus any stacked children under it — so
      // removeFilter("cap_type") clears every "cap_type:<value>" loop
      // filter, while removeFilter("cap_type:component:mirrored") clears
      // just the one.
      const targets = [...activeFilters.keys()].filter(
        (k) =>
          (k === typeKey || k.startsWith(`${typeKey}:`)) &&
          !activeFilters.get(k)?.locked
      );
      if (targets.length === 0) return;

      const newMap = new Map(activeFilters);
      for (const k of targets) newMap.delete(k);
      activeFilters = newMap;
    },

    setConnective(type: BrowseFilterType, connective: FilterConnective): void {
      if (!CONNECTIVE_STACKING_TYPES.has(type)) return;
      const key = String(type);
      if (connectives[key] === connective) return;
      connectives = { ...connectives, [key]: connective };
    },

    clearUserFilters(): void {
      // Keep only locked filters
      const newMap = new Map<string, ActiveFilter>();
      for (const [key, filter] of activeFilters) {
        if (filter.locked) {
          newMap.set(key, filter);
        }
      }
      activeFilters = newMap;
    },

    getFilteredCount(
      candidateType: BrowseFilterType,
      candidateValue: BrowseFilterValue
    ): number {
      // Compose the ACTUAL result pipeline (filters AND search) — counts
      // are previews of results, and ignoring an active search let a
      // count>0 pick land on a zero-result grid.
      return getMultiFilteredCount(
        searchedPool,
        candidateType,
        candidateValue,
        activeFilters,
        connectives
      );
    },

    // --- Favorites ---
    async toggleFavorite(sequenceId: string): Promise<void> {
      if (isPreviewReadOnly()) return;
      try {
        const newStatus = await doToggleFavorite(sequenceId);
        const update = (seq: SequenceData) =>
          seq.id === sequenceId ? { ...seq, isFavorite: newStatus } : seq;

        allSequences = allSequences.map(update);

        // Update library cache too
        if (libraryCache) {
          libraryCache = libraryCache.map(update);
        }
      } catch (err) {
        // No optimistic flip happens before this point — the local
        // state only updates after doToggleFavorite resolves — so there
        // is nothing to revert here, just surface the failure.
        console.error("[BrowseEngine] Failed to toggle favorite:", err);
        toast.error("Couldn't update favorite. Please try again.");
      }
    },

    // --- Layout ---
    setColumns(newColumns: number): void {
      const max = getMaxColumnsForWidth(containerWidth);
      const clamped = Math.max(minColumns, Math.min(max, newColumns));
      if (clamped !== columns) {
        columns = clamped;
        triggerTransition();
        persistColumns(clamped);
      }
    },

    updateContainerWidth(width: number): void {
      if (width <= 0 || width === containerWidth) return;
      containerWidth = width;

      if (columnsPinned) return;

      // Resolve density for THIS width's bucket: the user's stored choice for
      // this viewport class if they made one, else the bucket default (dense
      // on 4K, readable on phones). Never persisted here — only a deliberate
      // setColumns writes, so transient clamps can't masquerade as choices.
      const key = getWidthBucketKey(width);
      const chosen = settingsService.settings.gridZoomByBucket?.[key];
      const target = Math.max(
        minColumns,
        chosen ?? getDefaultColumnsForWidth(width)
      );
      if (target !== columns) {
        columns = target;
      }
    },

    zoomIn(): void {
      // Step from what's VISIBLE (columns clamped to this width), so the first
      // press always changes the grid even if desired > width max.
      engine.setColumns(engine.columnCount + 1);
    },

    zoomOut(): void {
      engine.setColumns(engine.columnCount - 1);
    },

    // --- Sections ---
    setSectionsEnabled(enabled: boolean): void {
      _sectionsEnabled = enabled;
    },

    setSectionGroupBy(groupBy: SectionGroupBy): void {
      // Pin grouping as an explicit override; pass "none" semantics via null is
      // not exposed here, so callers clear by re-selecting the sort-driven group.
      _sectionGroupByOverride = groupBy;
    },

    setViewMode(mode: BrowseViewMode): void {
      // Grouping follows sort + view subject via effectiveSectionGroupBy, so no
      // manual groupBy bookkeeping is needed here anymore.
      const needsReload =
        source === "my-library" &&
        !!config.loadSoloLibrarySequences &&
        (_viewMode.granularity !== mode.granularity ||
          _viewMode.subject !== mode.subject ||
          (_viewMode.granularity === "solo" && _viewMode.hand !== mode.hand));
      _viewMode = mode;
      if (needsReload) {
        void loadLibrarySequences();
      }
    },

    // --- Cache ---
    invalidateLibraryCache(): void {
      libraryCache = null;
      libraryCacheUserId = null;
    },

    // --- Cleanup ---
    destroy(): void {
      poolLoadRevision += 1;
      cleanupMutated();
      if (transitionTimeout) {
        clearTimeout(transitionTimeout);
        transitionTimeout = null;
      }
    },
  };

  return engine;
}
