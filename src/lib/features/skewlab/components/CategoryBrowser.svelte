<script lang="ts">
  /**
   * Category Browser - Browse skewed pictographs by category
   *
   * Loads all skewed pictographs and allows filtering by category (1-4).
   * Includes pagination for manageable browsing.
   * Responds to prop type changes (Alt+number, P key).
   *
   * Arrow Editing:
   * - Click a pictograph card to open the editor panel
   * - Editor panel provides WASD arrow adjustment + turns editing
   * - Reuses ArrowAdjustmentPanel and TurnsEditMode from Create module
   */

  import { onMount, onDestroy } from "svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import SkewLabEditorPanel from "./SkewLabEditorPanel.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { letterQueryHandler } from "$lib/shared/pictograph/tka-glyph/services/letter-query-handler";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { selectedArrowState } from "$lib/shared/create/state/selected-arrow-state.svelte";

  // Detect if we're on desktop (for push-over effect)
  let isSideBySide = $state(false);
  let resizeCleanup: (() => void) | null = null;

  // Editor panel state - declare before use in isPanelOpen
  let editorOpen = $state(false);
  let selectedIndex = $state<number>(-1); // Index in filtered list

  onMount(() => {
    const checkLayout = () => {
      isSideBySide = window.innerWidth >= 1024;
    };
    checkLayout();
    window.addEventListener("resize", checkLayout);
    resizeCleanup = () => window.removeEventListener("resize", checkLayout);
  });

  onDestroy(() => {
    resizeCleanup?.();
  });

  // Push content over when panel opens on desktop
  const isPanelOpen = $derived(editorOpen && isSideBySide);

  // State
  let allPictographs: PictographData[] = $state([]);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let selectedCategory = $state<1 | 2 | 3 | 4 | "all">("all");
  let currentPage = $state(0);
  const perPage = 24;

  // Currently selected pictograph for editor
  const selectedPictograph = $derived.by(() => {
    if (selectedIndex < 0 || selectedIndex >= filtered.length) return null;
    return filtered[selectedIndex];
  });

  // Get user's prop types from reactive settings (responds to Alt+number, P key)
  const leftPropType = $derived.by(() => {
    const settings = getSettings();
    return (settings.leftPropType ?? settings.propType ?? PropType.STAFF) as PropType;
  });

  const rightPropType = $derived.by(() => {
    const settings = getSettings();
    return (settings.rightPropType ?? settings.propType ?? PropType.STAFF) as PropType;
  });

  // Filtered and paginated data
  const filtered = $derived(
    selectedCategory === "all"
      ? allPictographs
      : allPictographs.filter((p) => p.category === selectedCategory)
  );

  const totalPages = $derived(Math.ceil(filtered.length / perPage));

  const paginated = $derived(
    filtered.slice(currentPage * perPage, (currentPage + 1) * perPage)
  );

  // Category counts
  const categoryCounts = $derived({
    1: allPictographs.filter((p) => p.category === 1).length,
    2: allPictographs.filter((p) => p.category === 2).length,
    3: allPictographs.filter((p) => p.category === 3).length,
    4: allPictographs.filter((p) => p.category === 4).length,
  });

  // Load data on mount
  onMount(async () => {
    try {
      allPictographs = await letterQueryHandler.getAllPictographVariations(
        GridMode.SKEWED
      );
      isLoading = false;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load pictographs";
      isLoading = false;
    }
  });

  // Cleanup on destroy
  onDestroy(() => {
    selectedArrowState.clearSelection();
  });

  // Handle clicking on a pictograph card - opens editor panel
  function handlePictographCardClick(pictograph: PictographData, indexInPage: number) {
    // Calculate the actual index in the filtered list
    const actualIndex = currentPage * perPage + indexInPage;
    selectedIndex = actualIndex;
    editorOpen = true;
  }

  // Editor panel callbacks
  function handleEditorClose() {
    editorOpen = false;
    selectedIndex = -1;
    selectedArrowState.clearSelection();
  }

  function handleEditorNavigate(direction: "prev" | "next") {
    if (direction === "prev" && selectedIndex > 0) {
      selectedIndex--;
      selectedArrowState.clearSelection();
    } else if (direction === "next" && selectedIndex < filtered.length - 1) {
      selectedIndex++;
      selectedArrowState.clearSelection();
    }
  }

  // Reset page when filter changes
  $effect(() => {
    selectedCategory;
    currentPage = 0;
  });

  function prevPage() {
    if (currentPage > 0) currentPage--;
  }

  function nextPage() {
    if (currentPage < totalPages - 1) currentPage++;
  }

  function formatPosition(p: PictographData): string {
    const start = p.startPlacement?.replace(/^(\w+)(\d+)$/, "$1$2") || "?";
    const end = p.endPlacement?.replace(/^(\w+)(\d+)$/, "$1$2") || "?";
    return `${start} → ${end}`;
  }
</script>

<div class="category-browser" class:panel-open={isPanelOpen}>
  <header class="header">
    <h2>Category Browser</h2>
    <p class="description">
      Browse skewed pictographs by category. {allPictographs.length} total pictographs.
    </p>
    <!-- Hint to click a pictograph -->
    <p class="hint">Click a pictograph to edit its arrows</p>
  </header>

  {#if isLoading}
    <div class="loading">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      Loading pictographs...
    </div>
  {:else if error}
    <div class="error" role="alert">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <p>{error}</p>
      <button class="retry-btn" onclick={() => location.reload()}>
        <i class="fas fa-redo" aria-hidden="true"></i>
        Retry
      </button>
    </div>
  {:else}
    <!-- Category Filter -->
    <nav class="filter-chips">
      <button
        class="chip"
        class:active={selectedCategory === "all"}
        onclick={() => (selectedCategory = "all")}
      >
        All
        <span class="count">{allPictographs.length}</span>
      </button>
      <button
        class="chip cat1"
        class:active={selectedCategory === 1}
        onclick={() => (selectedCategory = 1)}
      >
        Cat 1
        <span class="label">normal→skewed</span>
        <span class="count">{categoryCounts[1]}</span>
      </button>
      <button
        class="chip cat2"
        class:active={selectedCategory === 2}
        onclick={() => (selectedCategory = 2)}
      >
        Cat 2
        <span class="label">both skew→normal</span>
        <span class="count">{categoryCounts[2]}</span>
      </button>
      <button
        class="chip cat3"
        class:active={selectedCategory === 3}
        onclick={() => (selectedCategory = 3)}
        disabled={categoryCounts[3] === 0}
      >
        Cat 3
        <span class="label">skewed→skewed</span>
        <span class="count">{categoryCounts[3]}</span>
      </button>
      <button
        class="chip cat4"
        class:active={selectedCategory === 4}
        onclick={() => (selectedCategory = 4)}
        disabled={categoryCounts[4] === 0}
      >
        Cat 4
        <span class="label">skewed→normal</span>
        <span class="count">{categoryCounts[4]}</span>
      </button>
    </nav>

    <!-- Pagination Controls -->
    <div class="pagination">
      <button
        class="page-btn"
        onclick={prevPage}
        disabled={currentPage === 0}
        aria-label="Previous page"
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="page-info">
        Page {currentPage + 1} of {totalPages}
        <span class="showing">
          (showing {currentPage * perPage + 1}-{Math.min(
            (currentPage + 1) * perPage,
            filtered.length
          )} of {filtered.length})
        </span>
      </span>
      <button
        class="page-btn"
        onclick={nextPage}
        disabled={currentPage >= totalPages - 1}
        aria-label="Next page"
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Pictograph Grid -->
    {#if paginated.length === 0}
      <div class="empty-state">
        <i class="fas fa-layer-group" aria-hidden="true"></i>
        <p>No pictographs in this category</p>
      </div>
    {:else}
    <div class="grid themed-scrollbar">
      {#each paginated as pictograph, indexInPage (pictograph.id)}
        {@const actualIndex = currentPage * perPage + indexInPage}
        {@const isSelected = actualIndex === selectedIndex && editorOpen}
        <div
          class="card"
          class:selected={isSelected}
          role="button"
          tabindex="0"
          onclick={() => handlePictographCardClick(pictograph, indexInPage)}
          onkeydown={(e) => (e.key === "Enter" || e.key === " ") && handlePictographCardClick(pictograph, indexInPage)}
          aria-pressed={isSelected}
          aria-label="Pictograph {pictograph.letter} - click to edit"
        >
          <div class="pictograph-area">
            <PictographContainer
              pictographData={pictograph}
              gridMode={GridMode.SKEWED}
              leftPropTypeOverride={leftPropType}
              rightPropTypeOverride={rightPropType}
            />
          </div>
          <!-- Minimal info bar -->
          <div class="card-info-minimal">
            <span class="letter">{pictograph.letter}</span>
            <span class="position">{formatPosition(pictograph)}</span>
          </div>
        </div>
      {/each}
    </div>
    {/if}

    <!-- Bottom Pagination -->
    {#if totalPages > 1}
      <div class="pagination bottom">
        <button
          class="page-btn"
          onclick={prevPage}
          disabled={currentPage === 0}
        >
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
          Previous
        </button>
        <span class="page-info">
          Page {currentPage + 1} of {totalPages}
        </span>
        <button
          class="page-btn"
          onclick={nextPage}
          disabled={currentPage >= totalPages - 1}
        >
          Next
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
    {/if}
  {/if}
</div>

<!-- Editor Panel -->
<SkewLabEditorPanel
  bind:isOpen={editorOpen}
  pictographData={selectedPictograph ?? null}
  currentIndex={selectedIndex}
  totalCount={filtered.length}
  onClose={handleEditorClose}
  onNavigate={handleEditorNavigate}
/>

<style>
  .category-browser {
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* Push-over effect when drawer opens - matches SkewLabEditorPanel drawer width (40vw, min 450px) */
    --drawer-width: max(40vw, 450px);
    transition: padding-right var(--duration-emphasis, 350ms) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .category-browser.panel-open {
    padding-right: var(--drawer-width);
  }

  .header {
    padding: 1rem 1.5rem;
    flex-shrink: 0;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-text, #fff);
  }

  .description {
    margin: 0.25rem 0 0;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-secondary, #888);
  }

  .hint {
    margin: 0.5rem 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #888);
    font-style: italic;
  }

  .loading,
  .error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--theme-text-secondary, #888);
  }

  .error {
    flex-direction: column;
    color: var(--semantic-error, #ef4444);
  }

  .error p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.625rem 1.25rem;
    min-height: 44px;
    border: 1px solid var(--semantic-error, #ef4444);
    border-radius: 8px;
    background: transparent;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .retry-btn:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
  }

  .retry-btn:focus-visible {
    outline: 2px solid var(--semantic-error, #ef4444);
    outline-offset: 2px;
  }

  .retry-btn:active {
    transform: scale(0.97);
  }

  @media (pointer: coarse) {
    .retry-btn {
      min-height: var(--min-touch-target);
    }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 3rem 2rem;
    color: var(--theme-text-secondary, #888);
  }

  .empty-state i {
    font-size: 2.5rem;
    opacity: 0.4;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }

  .filter-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0 1.5rem 1rem;
    flex-shrink: 0;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    min-height: 44px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 9999px;
    background: transparent;
    color: var(--theme-text-secondary, #888);
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  @media (pointer: coarse) {
    .chip {
      min-height: var(--min-touch-target);
    }
  }

  .chip:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #fff);
  }

  .chip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .chip.active {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-accent, #8b5cf6);
    color: var(--theme-text, #fff);
  }

  /* Category accent colors — scoped to skewlab; no global token exists for these. */
  .chip.cat1 { --skewlab-cat-accent: #60a5fa; } /* blue — normal→skewed */
  .chip.cat2 { --skewlab-cat-accent: #34d399; } /* emerald — both skew→normal */
  .chip.cat3 { --skewlab-cat-accent: #fbbf24; } /* amber — skewed→skewed */
  .chip.cat4 { --skewlab-cat-accent: #f87171; } /* red — skewed→normal */

  .chip.cat1.active,
  .chip.cat2.active,
  .chip.cat3.active,
  .chip.cat4.active {
    border-color: var(--skewlab-cat-accent);
  }

  .chip .label {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.6;
  }

  .chip .count {
    font-size: var(--font-size-compact, 12px);
    padding: 0.125rem 0.375rem;
    border-radius: 9999px;
    background: rgba(255, 255, 255, 0.1);
  }

  .chip:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .chip:active:not(:disabled) {
    transform: scale(0.97);
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 0 1.5rem 1rem;
    flex-shrink: 0;
  }

  .pagination.bottom {
    padding: 1rem 1.5rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .page-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    min-height: 44px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  @media (pointer: coarse) {
    .page-btn {
      min-height: var(--min-touch-target);
      padding: 0.75rem 1rem;
    }
  }

  .page-btn:hover:not(:disabled) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .page-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .page-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .page-info {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-secondary, #888);
  }

  .page-info .showing {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.7;
  }

  .grid {
    flex: 1;
    overflow-y: auto;
    display: grid;
    /* Fixed column size for consistent pictograph sizing */
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    grid-auto-rows: auto;
    align-content: start;
    gap: 0.5rem;
    padding: 0 1rem 1rem;
  }

  .card {
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    cursor: pointer;
    transition:
      border-color var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease,
      transform var(--duration-fast) ease;
  }

  .card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .card:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .card:active {
    transform: scale(0.98);
  }

  /* Selected card (editor panel open for this card) */
  .card.selected {
    border-color: var(--theme-accent, #8b5cf6);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-accent, #8b5cf6) 20%, transparent);
  }

  .pictograph-area {
    /* Pictograph fills the card width, maintains square aspect */
    aspect-ratio: 1;
    width: 100%;
    padding: 0.25rem;
    box-sizing: border-box;
  }

  /* Minimal info bar for arrow adjustment mode */
  .card-info-minimal {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0.5rem;
    background: rgba(0, 0, 0, 0.3);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.05));
    font-size: var(--font-size-compact, 12px);
  }

  .card-info-minimal .letter {
    font-weight: 700;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #fff);
  }

  .card-info-minimal .position {
    color: var(--theme-text-secondary, #888);
    font-size: var(--font-size-compact, 12px);
  }

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .chip,
    .page-btn,
    .retry-btn,
    .card {
      transition: none;
    }

    .chip:active:not(:disabled),
    .page-btn:active:not(:disabled),
    .retry-btn:active,
    .card:active {
      transform: none;
    }

    .loading i {
      animation: none;
    }
  }

  /* Touch device optimization for card tap targets */
  @media (pointer: coarse) {
    .card {
      /* Ensure good touch target size */
      min-height: 120px;
    }
  }
</style>
