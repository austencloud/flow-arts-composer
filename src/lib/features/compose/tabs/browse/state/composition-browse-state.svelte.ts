/**
 * Composition Browse State
 *
 * State management for browsing saved compositions.
 * Replaces the old browse-state.svelte.ts with composition-centric naming
 * and new capabilities: expand-in-place detail, pinning, adaptive grid.
 */

import type { AnimationMode } from "../../../shared/domain/animation-mode";
import type {
  CellConfig,
  Composition,
  GridLayout,
} from "#lib/shared/animation-engine/domain/compose-types.js";
import { compositionSyncer } from "../../../services/composition-syncer";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

// Types

export interface CompositionBrowseItem {
  id: string;
  name: string;
  mode: AnimationMode;
  layout: GridLayout;
  cells: CellConfig[];
  cellCount: number;
  sequenceCount: number;
  thumbnailUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  creator: string;
  isFavorite: boolean;
  isPinned: boolean;
}

export interface CompositionFilter {
  mode?: AnimationMode;
  favorites?: boolean;
  isPinned?: boolean;
  searchQuery?: string;
}

export type CompositionSortMethod = "date" | "name" | "cellCount";
export type SortDirection = "asc" | "desc";
export type BrowseViewMode = "grid" | "detail";

// Conversion

function inferModeFromComposition(composition: Composition): AnimationMode {
  const { rows, cols } = composition.layout;
  const totalCells = rows * cols;

  if (rows === 1 && cols === 2) {
    const hasMirror = composition.cells.some((c) => c.isMirrored);
    if (hasMirror) return "mirror";
    return "side-by-side";
  }

  if (totalCells === 1) {
    const hasTunnel = composition.cells.some((c) => c.type === "tunnel");
    if (hasTunnel) return "tunnel";
    return "single";
  }

  const hasTunnelCells = composition.cells.some((c) => c.type === "tunnel");
  if (hasTunnelCells) return "tunnel";

  return "grid";
}

function compositionToBrowseItem(
  composition: Composition
): CompositionBrowseItem {
  const allSequences = composition.cells.flatMap((c) => c.sequences);

  return {
    id: composition.id,
    name: composition.name,
    mode: inferModeFromComposition(composition),
    layout: composition.layout,
    cells: composition.cells,
    cellCount: composition.layout.rows * composition.layout.cols,
    sequenceCount: allSequences.length,
    thumbnailUrl: composition.thumbnailUrl,
    createdAt: composition.createdAt,
    updatedAt: composition.updatedAt,
    creator: composition.creator,
    isFavorite: composition.isFavorite,
    isPinned: false,
  };
}

// State Factory

export function createCompositionBrowseState() {
  // Core data
  let compositions = $state<CompositionBrowseItem[]>([]);
  let currentFilter = $state<CompositionFilter>({});
  let sortMethod = $state<CompositionSortMethod>("date");
  let sortDirection = $state<SortDirection>("desc");
  let isLoading = $state(false);
  let error = $state<string | null>(null);

  // Detail view state
  let viewMode = $state<BrowseViewMode>("grid");
  let expandedComposition = $state<CompositionBrowseItem | null>(null);

  // Derived: filtered + sorted compositions
  const filteredCompositions = $derived.by(() => {
    let result = [...compositions];

    // Search filter
    if (currentFilter.searchQuery?.trim()) {
      const query = currentFilter.searchQuery.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(query) ||
          c.creator.toLowerCase().includes(query)
      );
    }

    // Mode filter
    if (currentFilter.mode) {
      result = result.filter((c) => c.mode === currentFilter.mode);
    }

    // Favorites filter
    if (currentFilter.favorites) {
      result = result.filter((c) => c.isFavorite);
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortMethod) {
        case "date":
          comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
          break;
        case "name":
          comparison = a.name.localeCompare(b.name);
          break;
        case "cellCount":
          comparison = a.cellCount - b.cellCount;
          break;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  });

  const hasActiveFilters = $derived(
    !!currentFilter.mode ||
      !!currentFilter.favorites ||
      !!currentFilter.searchQuery?.trim()
  );

  // Methods
  async function loadCompositions(): Promise<void> {
    try {
      isLoading = true;
      error = null;

      // Uses syncer: merges cloud data on first load if authenticated
      const raw = await compositionSyncer.getCompositions();

      compositions = raw.map(compositionToBrowseItem);
    } catch (err) {
      console.error("Failed to load compositions:", err);
      error =
        err instanceof Error ? err.message : "Failed to load compositions";
    } finally {
      isLoading = false;
    }
  }

  function setFilter(filter: CompositionFilter): void {
    currentFilter = filter;
  }

  function clearFilters(): void {
    currentFilter = {};
  }

  function setSort(
    method: CompositionSortMethod,
    direction: SortDirection
  ): void {
    sortMethod = method;
    sortDirection = direction;
  }

  async function toggleFavorite(compositionId: string): Promise<void> {
    try {
      const newStatus = await compositionSyncer.toggleFavorite(compositionId);
      const item = compositions.find((c) => c.id === compositionId);
      if (item) {
        item.isFavorite = newStatus;
        compositions = [...compositions];
      }
      // Update expanded item if it's the one toggled
      if (expandedComposition?.id === compositionId) {
        expandedComposition = { ...expandedComposition, isFavorite: newStatus };
      }
    } catch (err) {
      console.error("Failed to toggle favorite:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to toggle favorite"
      );
    }
  }

  function pinComposition(id: string): void {
    const item = compositions.find((c) => c.id === id);
    if (item) {
      item.isPinned = true;
      compositions = [...compositions];
    }
  }

  function unpinComposition(id: string): void {
    const item = compositions.find((c) => c.id === id);
    if (item) {
      item.isPinned = false;
      compositions = [...compositions];
    }
  }

  async function deleteComposition(compositionId: string): Promise<void> {
    try {
      await compositionSyncer.deleteComposition(compositionId);
      compositions = compositions.filter((c) => c.id !== compositionId);
      if (expandedComposition?.id === compositionId) {
        collapseDetail();
      }
    } catch (err) {
      console.error("Failed to delete composition:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to delete composition"
      );
    }
  }

  async function duplicateComposition(
    compositionId: string
  ): Promise<string | null> {
    try {
      const original = await compositionSyncer.getComposition(compositionId);
      if (!original) return null;

      const now = new Date();
      const copy: Composition = {
        ...original,
        id: crypto.randomUUID(),
        name: `${original.name} (copy)`,
        createdAt: now,
        updatedAt: now,
        isFavorite: false,
      };

      await compositionSyncer.saveComposition(copy);
      const browseItem = compositionToBrowseItem(copy);
      compositions = [browseItem, ...compositions];
      return copy.id;
    } catch (err) {
      console.error("Failed to duplicate composition:", err);
      toast.error(
        err instanceof Error ? err.message : "Failed to duplicate composition"
      );
      return null;
    }
  }

  // Detail view
  function expandComposition(item: CompositionBrowseItem): void {
    expandedComposition = item;
    viewMode = "detail";
  }

  function collapseDetail(): void {
    viewMode = "grid";
    // Keep expandedComposition briefly for drawer close animation, then clear
    setTimeout(() => {
      expandedComposition = null;
    }, 400);
  }

  function clearError(): void {
    error = null;
  }

  return {
    // State (getters)
    get compositions() {
      return compositions;
    },
    get filteredCompositions() {
      return filteredCompositions;
    },
    get currentFilter() {
      return currentFilter;
    },
    get sortMethod() {
      return sortMethod;
    },
    get sortDirection() {
      return sortDirection;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get hasActiveFilters() {
      return hasActiveFilters;
    },
    get viewMode() {
      return viewMode;
    },
    get expandedComposition() {
      return expandedComposition;
    },

    // Methods
    loadCompositions,
    setFilter,
    clearFilters,
    setSort,
    toggleFavorite,
    pinComposition,
    unpinComposition,
    deleteComposition,
    duplicateComposition,
    expandComposition,
    collapseDetail,
    clearError,
  };
}

// Singleton
let instance: ReturnType<typeof createCompositionBrowseState> | null = null;

export function getCompositionBrowseState() {
  if (!instance) {
    instance = createCompositionBrowseState();
  }
  return instance;
}
