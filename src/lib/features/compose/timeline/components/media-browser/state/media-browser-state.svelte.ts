/**
 * media-browser-state.svelte.ts
 * Centralized state management for the MediaBrowserPanel
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PublicSequencesLoader } from "$lib/shared/browse/services/public-sequences-loader";
import type { BrowseThumbnailProvider } from "$lib/shared/browse/services/browse-thumbnail-provider";
import { applyFilter as applyBrowseFilter } from "$lib/shared/browse/services/browse-filter";
import { sortSequences as browseSortSequences } from "$lib/shared/browse/services/browse-sorter";
import type { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
import type { BrowseFilterValue } from "$lib/shared/persistence/domain/types/filtering-types";
import type { DifficultyLevel } from "$lib/shared/domain/models/sequence-parameters";
import { BrowseSortMethod } from "$lib/shared/browse/domain/enums/browse-enums";
import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
import { getBrowseThumbnailProvider } from "$lib/shared/browse/get-browse-thumbnail-provider";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

const BATCH_SIZE = 24;

export interface MediaFilter {
  type: string;
  value: BrowseFilterValue;
}

export function createMediaBrowserState() {
  // Services
  let loaderService = $state<PublicSequencesLoader | null>(null);
  let thumbnailService = $state<BrowseThumbnailProvider | null>(null);
  let servicesReady = $state(false);

  // Core state
  let allSequences = $state<SequenceData[]>([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let searchQuery = $state("");
  let loadingSequenceId = $state<string | null>(null);

  // Pagination
  let displayedCount = $state(BATCH_SIZE);

  let currentFilter = $state<MediaFilter>({ type: "all", value: null });

  let currentSortMethod = $state<BrowseSortMethod>(
    BrowseSortMethod.ALPHABETICAL
  );
  let sortDirection = $state<"asc" | "desc">("asc");

  // UI state
  let showFilters = $state(false);
  let showLetterSheet = $state(false);

  // Derived filter values
  const currentLevel = $derived(
    currentFilter.type === "difficulty"
      ? (currentFilter.value as DifficultyLevel)
      : null
  );
  const currentLength = $derived(
    currentFilter.type === "length" ? (currentFilter.value as number) : null
  );
  const currentLetter = $derived(
    currentFilter.type === "startingLetter"
      ? (currentFilter.value as string)
      : null
  );
  const isFavoritesActive = $derived(currentFilter.type === "favorites");
  const hasActiveFilter = $derived(
    currentFilter.type !== "all" || searchQuery.trim() !== ""
  );

  // Filtered and sorted sequences
  const allFilteredSequences = $derived.by(() => {
    let filtered = allSequences;

    if (currentFilter.type !== "all") {
      filtered = applyBrowseFilter(
        allSequences,
        currentFilter.type as BrowseFilterType,
        currentFilter.value
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (seq) =>
          stripWordNotation(seq.word).toLowerCase().includes(query) ||
          seq.name?.toLowerCase().includes(query) ||
          seq.author?.toLowerCase().includes(query)
      );
    }

    filtered = browseSortSequences(filtered, currentSortMethod);
    if (sortDirection === "desc") {
      filtered = [...filtered].reverse();
    }

    return filtered;
  });

  const filteredSequences = $derived(
    allFilteredSequences.slice(0, displayedCount)
  );
  const hasMore = $derived(displayedCount < allFilteredSequences.length);

  function initializeServices(): boolean {
    try {
      loaderService = getBrowseLoader();
      thumbnailService = getBrowseThumbnailProvider();
      servicesReady = !!(loaderService && thumbnailService);
      return servicesReady;
    } catch (err) {
      console.error("MediaBrowserState: Failed to init services:", err);
      error = "Failed to initialize";
      return false;
    }
  }

  // Load sequences
  async function loadSequences(): Promise<void> {
    if (!loaderService) {
      error = "Loader service not available";
      isLoading = false;
      return;
    }

    try {
      isLoading = true;
      error = null;
      const loaded = await loaderService.loadSequenceMetadata();
      allSequences = loaded;
    } catch (err) {
      console.error("MediaBrowserState: Failed to load:", err);
      error = err instanceof Error ? err.message : "Failed to load";
    } finally {
      isLoading = false;
    }
  }

  // Load full sequence data
  async function loadFullSequence(
    sequence: SequenceData
  ): Promise<SequenceData | null> {
    if (!loaderService) return null;

    try {
      const fullSequence = await loaderService.loadFullSequenceData(
        sequence.word || sequence.id
      );
      return fullSequence;
    } catch (err) {
      console.error("MediaBrowserState: Failed to load full sequence:", err);
      return null;
    }
  }

  function getThumbnailUrl(sequence: SequenceData): string | undefined {
    if (!thumbnailService) return undefined;
    const first = sequence.thumbnails?.[0];
    if (!first) return undefined;
    try {
      return thumbnailService.getThumbnailUrl(sequence.id, first);
    } catch {
      return undefined;
    }
  }

  // Filter handlers
  function setLevelFilter(level: DifficultyLevel | null): void {
    currentFilter =
      level === null
        ? { type: "all", value: null }
        : { type: "difficulty", value: level };
    resetPagination();
  }

  function setFavoritesFilter(active: boolean): void {
    currentFilter = active
      ? { type: "favorites", value: null }
      : { type: "all", value: null };
    resetPagination();
  }

  function setLengthFilter(length: number | null): void {
    currentFilter =
      length === null
        ? { type: "all", value: null }
        : { type: "length", value: length };
    resetPagination();
  }

  function setLetterFilter(letter: string | null): void {
    currentFilter =
      letter === null
        ? { type: "all", value: null }
        : { type: "startingLetter", value: letter };
    showLetterSheet = false;
    resetPagination();
  }

  function setSearchQuery(query: string): void {
    searchQuery = query;
    resetPagination();
  }

  // Sort handler
  function setSortMethod(method: BrowseSortMethod): void {
    if (currentSortMethod === method) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      currentSortMethod = method;
      sortDirection = "asc";
    }
    resetPagination();
  }

  function clearFilters(): void {
    currentFilter = { type: "all", value: null };
    searchQuery = "";
    resetPagination();
  }

  // Pagination
  function resetPagination(): void {
    displayedCount = BATCH_SIZE;
  }

  function loadMore(): void {
    if (hasMore) {
      displayedCount = Math.min(
        displayedCount + BATCH_SIZE,
        allFilteredSequences.length
      );
    }
  }

  // Loading state management
  function setLoadingSequence(id: string | null): void {
    loadingSequenceId = id;
  }

  return {
    // Getters (reactive)
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get searchQuery() {
      return searchQuery;
    },
    get loadingSequenceId() {
      return loadingSequenceId;
    },
    get servicesReady() {
      return servicesReady;
    },
    get showFilters() {
      return showFilters;
    },
    get showLetterSheet() {
      return showLetterSheet;
    },
    get currentSortMethod() {
      return currentSortMethod;
    },
    get sortDirection() {
      return sortDirection;
    },
    get currentLevel() {
      return currentLevel;
    },
    get currentLength() {
      return currentLength;
    },
    get currentLetter() {
      return currentLetter;
    },
    get isFavoritesActive() {
      return isFavoritesActive;
    },
    get hasActiveFilter() {
      return hasActiveFilter;
    },
    get filteredSequences() {
      return filteredSequences;
    },
    get allFilteredSequences() {
      return allFilteredSequences;
    },
    get hasMore() {
      return hasMore;
    },

    // Setters
    set showFilters(value: boolean) {
      showFilters = value;
    },
    set showLetterSheet(value: boolean) {
      showLetterSheet = value;
    },

    // Actions
    initializeServices,
    loadSequences,
    loadFullSequence,
    getThumbnailUrl,
    setLevelFilter,
    setFavoritesFilter,
    setLengthFilter,
    setLetterFilter,
    setSearchQuery,
    setSortMethod,
    clearFilters,
    loadMore,
    setLoadingSequence,
  };
}

export type MediaBrowserState = ReturnType<typeof createMediaBrowserState>;
