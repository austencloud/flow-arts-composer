<!--
	CompositionBrowseTab.svelte

	Tab orchestrator for the composition browse experience.
	Wires together: filter bar, grid, empty state, detail view, and delete confirmation.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import { getCompositionBrowseState } from "./state/composition-browse-state.svelte";
  import type {
    CompositionBrowseItem,
    CompositionFilter,
    CompositionSortMethod,
    SortDirection,
  } from "./state/composition-browse-state.svelte";
  import { getComposeModuleState } from "../../shared/state/compose-module-state.svelte";
  import { arrangeGridState } from "../arrange/state/arrange-grid-state.svelte";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import CompositionFilterBar from "./components/CompositionFilterBar.svelte";
  import CompositionGrid from "./components/CompositionGrid.svelte";
  import CompositionViewerDrawer from "./components/CompositionViewerDrawer.svelte";

  const browseState = getCompositionBrowseState();
  const composeState = getComposeModuleState();

  // Delete confirmation
  let deleteDialogOpen = $state(false);
  let pendingDeleteId = $state<string | null>(null);
  let pendingDeleteName = $state("");

  onMount(() => {
    browseState.loadCompositions();
  });

  // Filter handlers
  function handleFilterChange(filter: CompositionFilter) {
    browseState.setFilter(filter);
  }

  function handleSortChange(
    method: CompositionSortMethod,
    direction: SortDirection
  ) {
    browseState.setSort(method, direction);
  }

  // Grid handlers
  function handleExpand(item: CompositionBrowseItem) {
    browseState.expandComposition(item);
  }

  function handleToggleFavorite(id: string) {
    browseState.toggleFavorite(id);
  }

  // Detail handlers
  function handlePlay() {
    composeState.openPlayback("browse");
  }

  async function handleEdit(id?: string) {
    const compositionId = id ?? browseState.expandedComposition?.id;
    if (!compositionId) return;

    try {
      const loaded = await arrangeGridState.loadComposition(compositionId);
      if (!loaded) {
        showToast({
          message: "Composition not found",
          type: "error",
          duration: 3000,
        });
        return;
      }
      navigationState.setActiveTab("arrange");
      composeState.setCurrentTab("arrange");
      browseState.collapseDetail();
    } catch (err) {
      console.error("Failed to load composition:", err);
      showToast({
        message: "Failed to load composition",
        type: "error",
        duration: 4000,
      });
    }
  }

  function handleDetailFavorite() {
    if (browseState.expandedComposition) {
      browseState.toggleFavorite(browseState.expandedComposition.id);
    }
  }

  async function handleDuplicate() {
    if (!browseState.expandedComposition) return;
    const newId = await browseState.duplicateComposition(
      browseState.expandedComposition.id
    );
    if (newId) {
      showToast({
        message: "Composition duplicated",
        type: "success",
        duration: 3000,
      });
    }
  }

  function handleDeleteRequest() {
    if (!browseState.expandedComposition) return;
    pendingDeleteId = browseState.expandedComposition.id;
    pendingDeleteName = browseState.expandedComposition.name || "Untitled";
    deleteDialogOpen = true;
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    await browseState.deleteComposition(pendingDeleteId);
    showToast({
      message: "Composition deleted",
      type: "success",
      duration: 3000,
    });
    pendingDeleteId = null;
    deleteDialogOpen = false;
  }

  function cancelDelete() {
    pendingDeleteId = null;
    deleteDialogOpen = false;
  }

  function handleClose() {
    browseState.collapseDetail();
  }

  // Retry on error
  function handleRetry() {
    browseState.clearError();
    browseState.loadCompositions();
  }

  function handleGridPlay(id: string) {
    // Find the composition, expand it, then play
    const item = browseState.filteredCompositions.find((c) => c.id === id);
    if (item) {
      composeState.openPlayback("browse");
    }
  }
</script>

<div class="browse-tab" style="container-type: inline-size">
  <!-- Error state -->
  {#if browseState.error}
    <div class="error-state">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <p>{browseState.error}</p>
      <button type="button" class="retry-btn" onclick={handleRetry}>
        <i class="fas fa-redo" aria-hidden="true"></i>
        Try again
      </button>
    </div>
  {:else if !browseState.isLoading && browseState.compositions.length === 0}
    <!-- Empty state -->
    <div class="empty-state">
      <i class="fas fa-layer-group empty-icon" aria-hidden="true"></i>
      <p class="empty-title">{t("browse_ui_no_compositions_yet")}</p>
      <p class="empty-hint">
        {t("browse_ui_save_a_composition_from_the_arrange_tab_to_see_it_here")}
      </p>
      <button
        type="button"
        class="go-arrange-btn"
        onclick={() => {
          navigationState.setActiveTab("arrange");
          composeState.setCurrentTab("arrange");
        }}
      >
        Go to Arrange
      </button>
    </div>
  {:else}
    <!-- Filter bar (only when compositions exist) -->
    {#if browseState.compositions.length > 0}
      <CompositionFilterBar
        filter={browseState.currentFilter}
        sortMethod={browseState.sortMethod}
        sortDirection={browseState.sortDirection}
        onFilterChange={handleFilterChange}
        onSortChange={handleSortChange}
      />
    {/if}

    <!-- Scrollable content -->
    <div class="content-area">
      {#if browseState.isLoading}
        <CompositionGrid
          compositions={[]}
          isLoading={true}
          onExpand={handleExpand}
          onToggleFavorite={handleToggleFavorite}
        />
      {:else if browseState.filteredCompositions.length === 0 && browseState.hasActiveFilters}
        <!-- Filtered empty -->
        <div class="filtered-empty">
          <p>{t("browse_ui_no_compositions_match_your_filters")}</p>
          <button
            type="button"
            class="clear-filters-btn"
            onclick={() => browseState.clearFilters()}
          >
            Clear filters
          </button>
        </div>
      {:else}
        <CompositionGrid
          compositions={browseState.filteredCompositions}
          onExpand={handleExpand}
          onToggleFavorite={handleToggleFavorite}
          onPlay={handleGridPlay}
          onEdit={handleEdit}
        />
      {/if}
    </div>
  {/if}

  <!-- Composition viewer drawer -->
  <CompositionViewerDrawer
    composition={browseState.expandedComposition}
    isOpen={browseState.viewMode === "detail" &&
      browseState.expandedComposition != null}
    onClose={handleClose}
    onPlay={handlePlay}
    onEdit={() => handleEdit()}
    onFavorite={handleDetailFavorite}
    onDuplicate={handleDuplicate}
    onDelete={handleDeleteRequest}
  />

  <!-- Delete confirmation -->
  <ConfirmDialog
    bind:isOpen={deleteDialogOpen}
    title={t("browse_ui_delete_composition")}
    message="&quot;{pendingDeleteName}&quot; will be permanently deleted. This can't be undone."
    confirmText="Delete"
    cancelText="Keep"
    onConfirm={confirmDelete}
    onCancel={cancelDelete}
    variant="danger"
  />
</div>

<style>
  .browse-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    position: relative;
  }

  .content-area {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px 16px;
    min-height: 0;
  }

  /* Error state */
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    text-align: center;
    padding: 24px;
  }

  .error-state i {
    font-size: 32px;
    color: var(--semantic-warning, #f59e0b);
  }

  .error-state p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    min-height: var(--min-touch-target);
  }

  .retry-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .retry-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Filtered empty */
  .filtered-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 24px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .filtered-empty p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
  }

  .clear-filters-btn {
    padding: 8px 16px;
    background: transparent;
    border: 1px solid var(--theme-accent, #6366f1);
    border-radius: 8px;
    color: var(--theme-accent, #6366f1);
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    min-height: var(--min-touch-target);
  }

  .clear-filters-btn:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 10%,
      transparent
    );
  }

  .clear-filters-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 100%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    text-align: center;
    padding: 24px;
  }

  .empty-icon {
    font-size: 40px;
    opacity: 0.3;
  }

  .empty-title {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, #fff);
  }

  .empty-hint {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .go-arrange-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 20px;
    margin-top: 8px;
    background: var(--theme-accent, #6366f1);
    border: none;
    border-radius: 8px;
    color: #fff;
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    min-height: var(--min-touch-target);
    transition: opacity 0.15s ease;
  }

  .go-arrange-btn:hover {
    opacity: 0.85;
  }

  .go-arrange-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }
</style>
