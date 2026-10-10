<!--
  MediaBrowserPanel.svelte - Inline media browser for timeline

  Orchestrator component that composes smaller UI pieces.
  Uses the existing Browse filter/sort system for consistency.
-->
<script module lang="ts">
  export type MediaImportType = "animation" | "image" | "recording";
</script>

<script lang="ts">
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { onMount } from "svelte";
  import { createMediaBrowserState } from "./state/media-browser-state.svelte";
  import MediaSearchBar from "./MediaSearchBar.svelte";
  import MediaSortRow from "./MediaSortRow.svelte";
  import MediaFilterPanel from "./MediaFilterPanel.svelte";
  import MediaSequenceGrid from "./MediaSequenceGrid.svelte";
  import LetterPickerSheet from "./LetterPickerSheet.svelte";

  interface Props {
    onLoadToSource?: (sequence: SequenceData) => void;
    onImport?: (sequence: SequenceData, mediaType: MediaImportType) => void;
  }

  let { onLoadToSource, onImport }: Props = $props();

  const state = createMediaBrowserState();

  // Handle sequence click - load to source monitor
  async function handleSequenceClick(sequence: SequenceData) {
    if (!onLoadToSource || state.loadingSequenceId) return;

    state.setLoadingSequence(sequence.id);

    try {
      const fullSequence = await state.loadFullSequence(sequence);
      if (fullSequence) {
        onLoadToSource(fullSequence);
      } else {
        onLoadToSource(sequence);
      }
    } catch {
      onLoadToSource(sequence);
    } finally {
      state.setLoadingSequence(null);
    }
  }

  // Handle drag start for timeline integration
  function handleDragStart(e: DragEvent, sequence: SequenceData) {
    if (!e.dataTransfer) return;

    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ ...sequence, _needsFullLoad: true })
    );

    const img = (e.target as HTMLElement).querySelector("img");
    if (img) {
      e.dataTransfer.setDragImage(img, 40, 40);
    }
  }

  onMount(async () => {
    const ready = await state.initializeServices();
    if (ready) {
      state.loadSequences();
    }
  });
</script>

<div class="media-browser-panel">
  <!-- Header -->
  <div class="panel-header">
    <i class="fas fa-photo-film header-icon" aria-hidden="true"></i>
    <span class="header-title">Media</span>
    <span class="sequence-count">
      {state.filteredSequences.length}
      {#if state.hasMore}
        <span class="count-total">/ {state.allFilteredSequences.length}</span>
      {/if}
    </span>
  </div>

  <!-- Search -->
  <MediaSearchBar
    searchQuery={state.searchQuery}
    isFavoritesActive={state.isFavoritesActive}
    onSearchChange={(q) => state.setSearchQuery(q)}
    onFavoritesToggle={(active) => state.setFavoritesFilter(active)}
  />

  <!-- Sort Row -->
  <MediaSortRow
    currentSortMethod={state.currentSortMethod}
    sortDirection={state.sortDirection}
    showFilters={state.showFilters}
    onSortChange={(method) => state.setSortMethod(method)}
    onToggleFilters={() => (state.showFilters = !state.showFilters)}
  />

  <!-- Advanced Filters -->
  {#if state.showFilters}
    <MediaFilterPanel
      currentLevel={state.currentLevel}
      currentLength={state.currentLength}
      currentLetter={state.currentLetter}
      hasActiveFilter={state.hasActiveFilter}
      onLevelChange={(level) => state.setLevelFilter(level)}
      onLengthChange={(length) => state.setLengthFilter(length)}
      onOpenLetterPicker={() => (state.showLetterSheet = true)}
      onClearFilters={() => state.clearFilters()}
    />
  {/if}

  <!-- Letter Picker Sheet -->
  {#if state.showLetterSheet}
    <LetterPickerSheet
      currentLetter={state.currentLetter}
      onSelect={(letter) => state.setLetterFilter(letter)}
      onClose={() => (state.showLetterSheet = false)}
    />
  {/if}

  <!-- Sequence Grid -->
  <MediaSequenceGrid
    sequences={state.filteredSequences}
    isLoading={state.isLoading}
    error={state.error}
    hasMore={state.hasMore}
    hasActiveFilter={state.hasActiveFilter}
    loadingSequenceId={state.loadingSequenceId}
    getThumbnailUrl={(seq) => state.getThumbnailUrl(seq)}
    onSequenceClick={handleSequenceClick}
    onDragStart={handleDragStart}
    onLoadMore={() => state.loadMore()}
    onRetry={() => state.loadSequences()}
    onClearFilters={() => state.clearFilters()}
  />
</div>

<style>
  .media-browser-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg);
    border-left: 1px solid var(--theme-stroke);
    position: relative;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: var(--theme-card-bg);
    border-bottom: 1px solid var(--theme-stroke);
    flex-shrink: 0;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  .header-icon {
    font-size: var(--font-size-sm);
    color: var(--theme-accent);
    filter: drop-shadow(
      0 0 6px color-mix(in srgb, var(--theme-accent) 40%, transparent)
    );
  }

  .header-title {
    font-size: var(--font-size-min);
    font-weight: 600;
    color: var(--theme-text);
    letter-spacing: 0.2px;
  }

  .sequence-count {
    margin-left: auto;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
    background: var(--theme-card-hover-bg);
    padding: 3px 8px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
    font-weight: 500;
  }

  .count-total {
    opacity: 0.5;
    margin-left: 2px;
  }
</style>
