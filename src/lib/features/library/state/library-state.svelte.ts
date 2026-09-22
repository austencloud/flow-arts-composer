/**
 * Library State Management
 *
 * Reactive state for the Library module using Svelte 5 runes.
 * Integrates with LibraryRepository for Firestore operations.
 */

import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import {
  userPreviewState,
  type PreviewSequence,
} from "$lib/shared/debug/state/user-preview-state.svelte";
import { toast } from "$lib/shared/toast/state/toast-state.svelte";
import type { LibraryQueryOptions, LibraryStats } from "../services/types";
import type {
  LibrarySequence,
  SequenceVisibility,
} from "$lib/shared/library/domain/models/library-sequence";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { compareKineticLetters, extractBaseLetter } from "$lib/shared/browse/utils/kinetic-alphabet-sort";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
import type { LibraryRepository } from "$lib/shared/library/services/library-repository";

export type LibraryViewSection =
  | "sequences"
  | "collections"
  | "acts"
  | "favorites"
  | "videos";
export type LibrarySortField =
  | "updatedAt"
  | "createdAt"
  | "name"
  | "word"
  | "viewCount"
  | "forkCount"
  | "starCount";
export type LibrarySortDirection = "asc" | "desc";

interface LibraryFilters {
  searchQuery: string;
  source: "created" | "forked" | "all";
  collectionId: string | null;
  tagIds: string[];
  sortBy: LibrarySortField;
  sortDirection: LibrarySortDirection;
}

interface LibraryStateData {
  // Navigation
  activeSection: LibraryViewSection;

  // Sequences list
  sequences: LibrarySequence[];
  isLoading: boolean;
  error: string | null;

  // Selection (for batch operations)
  selectedIds: Set<string>;
  isSelectMode: boolean;

  // Filters
  filters: LibraryFilters;

  // Stats
  stats: LibraryStats | null;

  // Detail view
  viewingSequenceId: string | null;

  // Subscription cleanup
  unsubscribe: (() => void) | null;
}

class LibraryStateManager {
  private state = $state<LibraryStateData>(this.getInitialState());
  private readonly STORAGE_KEY = "tka-library-state";


  private loadPersistedState(): Partial<LibraryStateData> | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return null;

      const parsed = JSON.parse(stored);
      return {
        activeSection: parsed.activeSection || "sequences",
        filters: parsed.filters || undefined,
      };
    } catch (error) {
      console.warn("[LibraryState] Failed to load persisted state:", error);
      return null;
    }
  }

  private persistState(): void {
    try {
      const stateToPersist = {
        activeSection: this.state.activeSection,
        filters: this.state.filters,
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stateToPersist));
    } catch (error) {
      console.warn("[LibraryState] Failed to persist state:", error);
    }
  }


  private getInitialState(): LibraryStateData {
    // Preserve state across HMR reloads (not full page refresh)
    if (import.meta.hot?.data.libraryState) {
      return import.meta.hot.data.libraryState;
    }

    // Load persisted state from localStorage
    const persisted = this.loadPersistedState();

    return {
      activeSection: persisted?.activeSection || "sequences",
      sequences: [],
      isLoading: false,
      error: null,
      selectedIds: new Set(),
      isSelectMode: false,
      filters: persisted?.filters || {
        searchQuery: "",
        source: "all",
        collectionId: null,
        tagIds: [],
        sortBy: "updatedAt",
        sortDirection: "desc",
      },
      stats: null,
      viewingSequenceId: null,
      unsubscribe: null,
    };
  }


  get activeSection() {
    return this.state.activeSection;
  }

  get sequences(): LibrarySequence[] {
    // In preview mode, show the previewed user's sequences
    if (this.isPreviewMode && userPreviewState.data.sequences.length > 0) {
      return this.convertPreviewSequences(userPreviewState.data.sequences);
    }
    return this.state.sequences;
  }

  /**
   * Convert preview sequences to LibrarySequence format
   * Note: Some fields are stubbed since preview data is limited
   */
  private convertPreviewSequences(
    previewSeqs: PreviewSequence[]
  ): LibrarySequence[] {
    const ownerId = userPreviewState.data.profile?.uid || "";

    return previewSeqs.map(
      (seq) =>
        ({
          // SequenceData base fields (required)
          id: seq.id,
          name: seq.name || "Untitled",
          word: seq.word || "",
          steps: [],
          thumbnails: seq.thumbnailUrl ? [seq.thumbnailUrl] : [],
          isFavorite: false,
          isCircular: false,
          tags: [],
          metadata: {},

          // LibrarySequence ownership fields
          ownerId,
          source: "created" as const,

          // Visibility
          visibility: (seq.isPublic
            ? "public"
            : "private") as SequenceVisibility,

          // Organization
          collectionIds: [] as readonly string[],
          tagIds: [] as readonly string[],
          sequenceTags: [],

          // Engagement metrics
          forkCount: 0,
          viewCount: 0,
          starCount: seq.favoriteCount || 0,

          // Timestamps
          createdAt: seq.createdAt ? new Date(seq.createdAt) : new Date(),
          updatedAt: seq.createdAt ? new Date(seq.createdAt) : new Date(),
        }) as LibrarySequence
    );
  }

  get isLoading() {
    return this.state.isLoading;
  }

  get error() {
    return this.state.error;
  }

  get selectedIds() {
    return this.state.selectedIds;
  }

  get isSelectMode() {
    return this.state.isSelectMode;
  }

  get filters() {
    return this.state.filters;
  }

  get stats() {
    return this.state.stats;
  }

  get viewingSequenceId() {
    return this.state.viewingSequenceId;
  }

  get hasSequences() {
    return this.state.sequences.length > 0;
  }

  get selectedCount() {
    return this.state.selectedIds.size;
  }

  get isAuthenticated() {
    return !!authState.effectiveUserId;
  }

  // Derived: filtered sequences
  get filteredSequences(): LibrarySequence[] {
    let result = [...this.state.sequences];
    const filters = this.state.filters;

    // Filter by search query (client-side full-text)
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      result = result.filter(
        (seq) =>
          seq.name.toLowerCase().includes(query) ||
          seq.word.toLowerCase().includes(query) ||
          seq.displayName?.toLowerCase().includes(query)
      );
    }

    // Filter by source
    if (filters.source !== "all") {
      result = result.filter((seq) => seq.source === filters.source);
    }

    if (filters.collectionId) {
      result = result.filter((seq) =>
        seq.collectionIds.includes(filters.collectionId!)
      );
    }

    // Filter by tags (OR logic - sequences with ANY selected tag)
    if (filters.tagIds.length > 0) {
      result = result.filter((seq) => {
        // Check both legacy tagIds and new sequenceTags
        const seqTagIds = new Set([
          ...seq.tagIds,
          ...seq.sequenceTags.map((st) => st.tagId),
        ]);
        return filters.tagIds.some((tagId) => seqTagIds.has(tagId));
      });
    }

    result.sort((a, b) => {
      // Special handling for "word" sort - use kinetic alphabet order
      if (filters.sortBy === "word") {
        // Skew braces mark a span, not a letter: sort by the letters inside.
        const aWord = stripWordNotation(a.word ?? "");
        const bWord = stripWordNotation(b.word ?? "");

        const letterA = extractBaseLetter(aWord);
        const letterB = extractBaseLetter(bWord);

        let comparison = compareKineticLetters(letterA, letterB);
        if (comparison === 0) {
          // Same letter, sort by word length then alphabetically
          const lengthDiff = aWord.length - bWord.length;
          comparison = lengthDiff !== 0 ? lengthDiff : aWord.localeCompare(bWord);
        }

        return filters.sortDirection === "asc" ? comparison : -comparison;
      }

      // Standard sorting for other fields
      let aVal: string | number;
      let bVal: string | number;

      switch (filters.sortBy) {
        case "name":
          aVal = a.name ?? "";
          bVal = b.name ?? "";
          break;
        case "createdAt":
          aVal = a.createdAt.getTime() ?? 0;
          bVal = b.createdAt.getTime() ?? 0;
          break;
        case "viewCount":
          aVal = a.viewCount ?? 0;
          bVal = b.viewCount ?? 0;
          break;
        case "forkCount":
          aVal = a.forkCount ?? 0;
          bVal = b.forkCount ?? 0;
          break;
        case "starCount":
          aVal = a.starCount ?? 0;
          bVal = b.starCount ?? 0;
          break;
        case "updatedAt":
        default:
          aVal = a.updatedAt.getTime() ?? 0;
          bVal = b.updatedAt.getTime() ?? 0;
          break;
      }

      if (typeof aVal === "string") {
        const bStr = typeof bVal === "string" ? bVal : String(bVal);
        return filters.sortDirection === "asc"
          ? aVal.localeCompare(bStr)
          : bStr.localeCompare(aVal);
      }

      const bNum = typeof bVal === "number" ? bVal : Number(bVal);
      return filters.sortDirection === "asc" ? aVal - bNum : bNum - aVal;
    });

    return result;
  }

  // Derived: favorites only
  get favorites(): LibrarySequence[] {
    return this.state.sequences.filter((seq) => seq.isFavorite);
  }

  // ============================================================
  // NAVIGATION
  // ============================================================

  setActiveSection(section: LibraryViewSection) {
    this.state.activeSection = section;
    this.state.viewingSequenceId = null;
    this.persistState();
  }

  viewSequence(sequenceId: string) {
    this.state.viewingSequenceId = sequenceId;
  }

  closeSequenceDetail() {
    this.state.viewingSequenceId = null;
  }

  // ============================================================
  // DATA LOADING
  // ============================================================

  async initialize() {
    if (!this.isAuthenticated) {
      this.state.sequences = [];
      return;
    }

    await this.loadSequences();
    await this.loadStats();
    this.subscribeToLibrary();
  }

  async loadSequences(options?: LibraryQueryOptions) {
    const service = this.getService();
    if (!service) return;

    this.state.isLoading = true;
    this.state.error = null;

    try {
      const sequences = await service.getSequences(options);
      this.state.sequences = sequences;
    } catch (error) {
      console.error("📚 [LibraryState] Failed to load sequences:", error);
      this.state.error =
        error instanceof Error ? error.message : "Failed to load sequences";
    } finally {
      this.state.isLoading = false;
    }
  }

  async loadStats() {
    const service = this.getService();
    if (!service) return;

    try {
      this.state.stats = await service.getLibraryStats();
    } catch (error) {
      console.error("📚 [LibraryState] Failed to load stats:", error);
    }
  }

  subscribeToLibrary() {
    // Clean up existing subscription
    if (this.state.unsubscribe) {
      this.state.unsubscribe();
    }

    const service = this.getService();
    if (!service) return;

    try {
      this.state.unsubscribe = service.subscribeToLibrary((sequences) => {
        this.state.sequences = sequences;
      });
    } catch (error) {
      console.error("📚 [LibraryState] Failed to subscribe:", error);
    }
  }

  dispose() {
    if (this.state.unsubscribe) {
      this.state.unsubscribe();
      this.state.unsubscribe = null;
    }
  }

  // ============================================================
  // CRUD OPERATIONS
  // ============================================================

  /**
   * Check if we're in preview mode (read-only)
   */
  get isPreviewMode(): boolean {
    return userPreviewState.isActive;
  }

  async saveSequence(sequence: SequenceData): Promise<LibrarySequence | null> {
    // Block writes in preview mode
    if (this.isPreviewMode) {
      toast.warning("Cannot save sequences in preview mode");
      return null;
    }

    const service = this.getService();
    if (!service) return null;

    try {
      const saved = await service.saveSequence(sequence);
      return saved;
    } catch (error) {
      console.error("📚 [LibraryState] Failed to save sequence:", error);
      this.state.error =
        error instanceof Error ? error.message : "Failed to save sequence";
      return null;
    }
  }

  async deleteSequence(sequenceId: string): Promise<boolean> {
    // Block writes in preview mode
    if (this.isPreviewMode) {
      toast.warning("Cannot delete sequences in preview mode");
      return false;
    }

    const service = this.getService();
    if (!service) return false;

    try {
      await service.deleteSequence(sequenceId);
      return true;
    } catch (error) {
      console.error("📚 [LibraryState] Failed to delete sequence:", error);
      this.state.error =
        error instanceof Error ? error.message : "Failed to delete sequence";
      return false;
    }
  }

  async toggleFavorite(sequenceId: string): Promise<boolean> {
    if (this.isPreviewMode) {
      toast.warning("Cannot modify favorites in preview mode");
      return false;
    }

    const service = this.getService();
    if (!service) return false;

    try {
      const isFavorite = await service.toggleFavorite(sequenceId);
      return isFavorite;
    } catch (error) {
      console.error("📚 [LibraryState] Failed to toggle favorite:", error);
      return false;
    }
  }

  async updateNotes(sequenceId: string, notes: string): Promise<boolean> {
    if (this.isPreviewMode) {
      toast.warning("Cannot update notes in preview mode");
      return false;
    }

    const service = this.getService();
    if (!service) return false;

    try {
      await service.updateSequence(sequenceId, { notes });
      return true;
    } catch (error) {
      console.error("📚 [LibraryState] Failed to update notes:", error);
      return false;
    }
  }

  async updateTags(sequenceId: string, tagIds: string[]): Promise<boolean> {
    if (this.isPreviewMode) {
      toast.warning("Cannot update tags in preview mode");
      return false;
    }

    const service = this.getService();
    if (!service) return false;

    try {
      await service.updateSequence(sequenceId, { tagIds });
      return true;
    } catch (error) {
      console.error("📚 [LibraryState] Failed to update tags:", error);
      return false;
    }
  }

  async setVisibility(sequenceId: string, visibility: SequenceVisibility): Promise<boolean> {
    if (this.isPreviewMode) {
      toast.warning("Cannot change visibility in preview mode");
      return false;
    }

    const service = this.getService();
    if (!service) return false;

    try {
      await service.setVisibility(sequenceId, visibility);
      return true;
    } catch (error) {
      console.error("📚 [LibraryState] Failed to set visibility:", error);
      return false;
    }
  }

  // ============================================================
  // SELECTION
  // ============================================================

  enterSelectMode() {
    this.state.isSelectMode = true;
  }

  exitSelectMode() {
    this.state.isSelectMode = false;
    this.state.selectedIds.clear();
  }

  toggleSelection(sequenceId: string) {
    if (this.state.selectedIds.has(sequenceId)) {
      this.state.selectedIds.delete(sequenceId);
    } else {
      this.state.selectedIds.add(sequenceId);
    }
    // Trigger reactivity
    this.state.selectedIds = new Set(this.state.selectedIds);
  }

  selectAll() {
    this.state.selectedIds = new Set(this.filteredSequences.map((s) => s.id));
  }

  clearSelection() {
    this.state.selectedIds.clear();
    this.state.selectedIds = new Set();
  }

  isSelected(sequenceId: string): boolean {
    return this.state.selectedIds.has(sequenceId);
  }

  // ============================================================
  // BATCH OPERATIONS
  // ============================================================

  async deleteSelected(): Promise<boolean> {
    if (this.isPreviewMode) {
      toast.warning("Cannot delete sequences in preview mode");
      return false;
    }

    const service = this.getService();
    if (!service || this.state.selectedIds.size === 0) return false;

    try {
      await service.deleteSequences(Array.from(this.state.selectedIds));
      this.clearSelection();
      this.exitSelectMode();
      return true;
    } catch (error) {
      console.error("📚 [LibraryState] Failed to delete selected:", error);
      return false;
    }
  }

  // ============================================================
  // FILTERS
  // ============================================================

  setSearchQuery(query: string) {
    this.state.filters.searchQuery = query;
    this.persistState();
  }

  setSourceFilter(source: "created" | "forked" | "all") {
    this.state.filters.source = source;
    this.persistState();
  }

  setCollectionFilter(collectionId: string | null) {
    this.state.filters.collectionId = collectionId;
    this.persistState();
  }

  setTagFilter(tagIds: string[]) {
    this.state.filters.tagIds = tagIds;
    this.persistState();
  }

  toggleTagFilter(tagId: string) {
    const current = this.state.filters.tagIds;
    if (current.includes(tagId)) {
      this.state.filters.tagIds = current.filter((id) => id !== tagId);
    } else {
      this.state.filters.tagIds = [...current, tagId];
    }
    this.persistState();
  }

  clearTagFilter() {
    this.state.filters.tagIds = [];
    this.persistState();
  }

  setSortBy(field: LibrarySortField) {
    this.state.filters.sortBy = field;
    this.persistState();
  }

  setSortDirection(direction: LibrarySortDirection) {
    this.state.filters.sortDirection = direction;
    this.persistState();
  }

  toggleSortDirection() {
    this.state.filters.sortDirection =
      this.state.filters.sortDirection === "asc" ? "desc" : "asc";
    this.persistState();
  }

  resetFilters() {
    this.state.filters = {
      searchQuery: "",
      source: "all",
      collectionId: null,
      tagIds: [],
      sortBy: "updatedAt",
      sortDirection: "desc",
    };
    this.persistState();
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private getService(): LibraryRepository | null {
    const service = getLibraryRepository();
    if (!service) {
      console.warn("📚 [LibraryState] LibraryRepository not available");
    }
    return service;
  }

  getSequenceById(sequenceId: string): LibrarySequence | undefined {
    return this.state.sequences.find((s) => s.id === sequenceId);
  }

  /**
   * Find sequences by word (TKA name)
   * Used for duplicate detection before saving.
   * Simplifies repeated patterns before comparing so "AAA" matches "A".
   */
  findSequencesByWord(word: string): LibrarySequence[] {
    if (!word) return [];
    const canonical = simplifyRepeatedWord(word).toLowerCase().trim();
    return this.state.sequences.filter((s) => {
      if (!s.word) return false;
      const storedCanonical = simplifyRepeatedWord(s.word).toLowerCase().trim();
      return storedCanonical === canonical;
    });
  }

  /**
   * Check if a sequence with the same word already exists
   * Returns the existing sequences if found
   */
  checkForDuplicate(word: string): {
    hasDuplicate: boolean;
    existingSequences: LibrarySequence[];
  } {
    const existing = this.findSequencesByWord(word);
    return {
      hasDuplicate: existing.length > 0,
      existingSequences: existing,
    };
  }

  /**
   * Check if a sequence with identical motion content already exists.
   * Compares against the contentHash stored on each library sequence.
   * Returns the first matching sequence if found.
   */
  findByContentHash(hash: string): LibrarySequence | undefined {
    if (!hash) return undefined;
    return this.state.sequences.find((s) => s.contentHash === hash);
  }

  reset() {
    this.dispose();
    this.state = {
      activeSection: "sequences",
      sequences: [],
      isLoading: false,
      error: null,
      selectedIds: new Set(),
      isSelectMode: false,
      filters: {
        searchQuery: "",
        source: "all",
        collectionId: null,
        tagIds: [],
        sortBy: "updatedAt",
        sortDirection: "desc",
      },
      stats: null,
      viewingSequenceId: null,
      unsubscribe: null,
    };
  }
}

// Export singleton instance
export const libraryState = new LibraryStateManager();

// HMR: Save state before hot reload
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    // Store current state for next reload
    import.meta.hot!.data.libraryState = {
      activeSection: libraryState.activeSection,
      sequences: libraryState.sequences,
      isLoading: libraryState.isLoading,
      error: libraryState.error,
      selectedIds: libraryState.selectedIds,
      isSelectMode: libraryState.isSelectMode,
      filters: libraryState.filters,
      stats: libraryState.stats,
      viewingSequenceId: libraryState.viewingSequenceId,
      unsubscribe: libraryState["state"].unsubscribe, // Access private state
    };
  });
}
