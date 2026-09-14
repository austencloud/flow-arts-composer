<script lang="ts">
  import PropViewingControl from "./PropViewingControl.svelte";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { onMount, onDestroy } from "svelte";
  import { getBrowseThumbnailProvider } from "$lib/shared/browse/get-browse-thumbnail-provider";
  import { PinchZoomGridController } from "$lib/shared/browse/services/pinch-zoom-grid-controller";
  import { getSequenceOverlayState } from "$lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte";
  import { browseScrollState } from "$lib/shared/browse/state/browse-scroll-state.svelte";
  import BrowseThumbnailSkeleton from "$lib/shared/browse/components/BrowseThumbnailSkeleton.svelte";
  import type { BrowseThumbnailProvider } from "$lib/shared/browse/services/browse-thumbnail-provider";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { BrowseEngine } from "../engine/types";
  import BrowseToolbar from "./BrowseToolbar.svelte";
  import BrowseFilterBar from "./BrowseFilterBar.svelte";
  import BrowseSidebar from "./BrowseSidebar.svelte";
  import BrowseGrid from "./BrowseGrid.svelte";
  import type { SectionedGridApi } from "./SectionedVirtualGrid.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SelectionToolbar from "$lib/shared/components/selection/SelectionToolbar.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { withResultsMorph } from "$lib/shared/transitions/results-morph";

  interface Props {
    collectionPropType?: PropType | null;
    engine: BrowseEngine;
    layout: "fullpage" | "compact" | "minimal";
    onSelect?: (sequence: SequenceData, variations?: SequenceData[]) => void;
    showSidebar?: boolean;
    showToolbar?: boolean;
    showFilterBar?: boolean;
    showSourceToggle?: boolean;
    eager?: boolean;
    title?: string;
    /** Leading back pill inside the toolbar (e.g. "← Start here"). */
    onBack?: () => void;
    backLabel?: string;
    /** Hide the toolbar search when the host provides its own entry point. */
    hideToolbarSearch?: boolean;
    /** Hide the toolbar's inline filter chips when the host already owns a
     * complete filter surface (the gallery split pane). Sort/zoom/count stay. */
    hideFilterChips?: boolean;
    /** Picker hosts: ids to render with the selected outline (e.g. sequences
     * already in the collection being built). */
    selectedIds?: ReadonlySet<string>;
    /** Bottom-sheet filter pattern: Filters pill in the toolbar, applied-only
     * chips in the filter bar. The host owns the sheet. */
    onOpenFilters?: () => void;
    /** Instant-tap warm-up: render only the skeleton (no grid/sidebar, so no
     * filtered-set read) for the frame a new filter is applied, so the layout
     * paints immediately and the compute lands behind the skeleton. */
    warming?: boolean;
    /** Passthrough to the filter bar's "Save as Smart Collection" action. */
    onSaveSmart?: () => void;
    /** CTA shown ONLY in a genuine empty-library state (no active filters).
     * Never shown for a filter-zero empty state — that state's fix is
     * "Clear all filters", not a new-content action. */
    emptyAction?: { label: string; onClick: () => void };
    emptyState?: {
      message: string;
      description: string;
      secondaryAction?: {
        label: string;
        description: string;
        onClick: () => void;
      };
    };
    /** Optional personal-library multi-selection controller. The gallery stays
     * generic; the host owns what the primary batch action does. */
    selection?: {
      readonly active: boolean;
      readonly selectedIds: ReadonlySet<string>;
      enter: (sequence?: SequenceData) => void;
      toggle: (sequence: SequenceData) => void;
      selectAll: () => void;
      clear: () => void;
      exit: () => void;
      openPrimaryAction: () => void;
      openDangerAction?: () => void;
    };
    /** Show the toolbar's Select action. A host with its own prominent entry
     * point can hide this without disabling card selection. */
    showSelectionAction?: boolean;
    /** The host renders its own selection toolbar with surface-specific
     * actions (a collection's "Remove from this collection"). Cards still
     * enter and toggle selection; only this panel's toolbar is suppressed,
     * so the two never stack. */
    hideSelectionToolbar?: boolean;
    /** Names the host pool's own order for the sort menu (see setPool). */
    curatedSortLabel?: string;
    /** A detail page can embed the controls directly in its own header rhythm
     * instead of drawing the toolbar as a separate full-width panel. */
    toolbarVariant?: "panel" | "embedded";
    /** Host-visible total used to explain a narrowed or partially loaded pool. */
    resultTotal?: number;
    /** Inside one collection: per-card "remove from this collection". */
    collectionContext?: {
      id: string;
      name: string;
      onRemove: (sequenceId: string) => void;
    };
  }

  let {
    engine,
    layout,
    onSelect,
    showSidebar: sidebarOverride,
    showToolbar: toolbarOverride,
    showFilterBar: filterBarOverride,
    showSourceToggle: sourceToggleOverride,
    eager: eagerOverride,
    title,
    onBack,
    backLabel,
    hideToolbarSearch = false,
    hideFilterChips = false,
    selectedIds,
    onOpenFilters,
    warming = false,
    onSaveSmart,
    emptyAction,
    emptyState,
    selection,
    showSelectionAction = true,
    hideSelectionToolbar = false,
    curatedSortLabel,
    toolbarVariant = "panel",
    resultTotal,
    collectionContext,
    collectionPropType,
  }: Props = $props();

  const showToolbar = $derived(toolbarOverride ?? layout !== "minimal");
  const showFilterBar = $derived(filterBarOverride ?? layout !== "minimal");
  const showSidebar = $derived(sidebarOverride ?? layout === "fullpage");
  const showSourceToggle = $derived(sourceToggleOverride ?? false);
  const isEager = $derived(eagerOverride ?? layout !== "fullpage");
  const disableVirtualization = $derived(layout === "minimal");
  const usesInternalGridScroller = $derived(
    !disableVirtualization &&
      !(engine.sectionsEnabled && engine.sections.length > 0) &&
      engine.sequences.length > 50
  );

  let thumbnailService: BrowseThumbnailProvider | null = $state(null);
  let pinchController: PinchZoomGridController | null = null;
  let contentEl: HTMLElement | null = $state(null);
  let containerEl: HTMLElement | null = $state(null);
  let activeSection = $state<string | undefined>(undefined);
  // Set once the sectioned virtual grid mounts. When present, it owns
  // section-jump + active-section (the DOM-offset scan can't see off-screen,
  // virtualized headers).
  let sectionApi = $state<SectionedGridApi | null>(null);

  let showSkeleton = $state(true);
  let skeletonFading = $state(false);

  const isInitializing = $derived(engine.isLoading);
  // `!warming` short-circuits FIRST so the filtered-set read (which triggers the
  // filter/sort/section compute) is skipped during the instant-tap warm frame.
  const isEmpty = $derived(
    !warming &&
      !isInitializing &&
      !engine.error &&
      engine.sequences.length === 0
  );
  const hasSequences = $derived(
    !warming && !isInitializing && !engine.error && engine.sequences.length > 0
  );

  const emptyMessage = $derived(
    engine.hasActiveFilters
      ? t("browse_no_sequences")
      : engine.source === "my-library"
        ? t("browse_no_sequences_saved")
        : t("browse_no_sequences_found")
  );

  $effect((): void | (() => void) => {
    if (isInitializing || warming) {
      showSkeleton = true;
      skeletonFading = false;
    } else if (showSkeleton) {
      skeletonFading = true;
      const timer = setTimeout(() => {
        showSkeleton = false;
        skeletonFading = false;
      }, 300);
      return () => clearTimeout(timer);
    }
  });

  $effect(() => {
    const el = containerEl;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) engine.updateContainerWidth(w);
      }
    });
    ro.observe(el);
    requestAnimationFrame(() => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) engine.updateContainerWidth(w);
    });
    return () => ro.disconnect();
  });

  const SCROLL_THRESHOLD = 50;
  let cumulativeScrollDelta = 0;

  function handleWheel(ev: WheelEvent) {
    if (!ev.ctrlKey && !ev.metaKey) return;
    ev.preventDefault();
    cumulativeScrollDelta += ev.deltaY;
    if (cumulativeScrollDelta > SCROLL_THRESHOLD) {
      engine.zoomIn();
      cumulativeScrollDelta = 0;
    } else if (cumulativeScrollDelta < -SCROLL_THRESHOLD) {
      engine.zoomOut();
      cumulativeScrollDelta = 0;
    }
  }

  $effect(() => {
    const el = contentEl;
    if (!el || layout === "minimal") return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  });

  function updateActiveSection() {
    // The sectioned virtual grid reports active section via onActiveSectionChange
    // (off-screen headers aren't in the DOM). Only scan the DOM for non-virtual
    // section layouts.
    if (sectionApi) return;
    if (!contentEl || !engine.sections.length) return;
    const scrollTop = contentEl.scrollTop;
    const sections = contentEl.querySelectorAll("[data-section]");
    let current: string | undefined;
    for (const el of sections) {
      const htmlEl = el as HTMLElement;
      if (htmlEl.offsetTop <= scrollTop + 100) current = htmlEl.dataset.section;
    }
    activeSection = current;
  }

  function scrollToSection(sectionTitle: string) {
    // Virtualized: delegate to the grid (target header may be unmounted).
    if (sectionApi) {
      sectionApi.scrollToSectionTitle(sectionTitle);
      return;
    }
    if (!contentEl) return;
    const el = contentEl.querySelector(
      `[data-section="${CSS.escape(sectionTitle)}"]`
    ) as HTMLElement;
    if (!el) return;
    const containerRect = contentEl.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const targetScroll = elRect.top - containerRect.top + contentEl.scrollTop;
    contentEl.scrollTo({ top: targetScroll, behavior: "instant" });
  }

  const overlayState = getSequenceOverlayState();
  let wasOverlayOpen = false;

  $effect(() => {
    if (layout !== "fullpage") return;
    const isOpen = overlayState.isOpen;
    if (wasOverlayOpen && !isOpen && contentEl) {
      const savedScrollY = browseScrollState.lastScrollY;
      if (savedScrollY > 0) {
        requestAnimationFrame(() => contentEl?.scrollTo({ top: savedScrollY }));
      }
    }
    wasOverlayOpen = isOpen;
  });

  function handleScroll() {
    if (!contentEl) return;
    browseScrollState.updateScrollPosition(contentEl.scrollTop);
    updateActiveSection();
  }

  function handleAction(
    action: string,
    sequence: SequenceData,
    variations?: SequenceData[]
  ) {
    if (action === "view-detail" && onSelect) {
      onSelect(sequence, variations);
    }
  }

  onMount(() => {
    thumbnailService = getBrowseThumbnailProvider();

    if (layout === "fullpage" && contentEl) {
      pinchController = new PinchZoomGridController();
      pinchController.setColumnCount(engine.columnCount);
      pinchController.setOnStateChange((state) =>
        engine.setColumns(state.columns)
      );
      pinchController.attach(contentEl);
    }
  });

  onDestroy(() => {
    pinchController?.detach();
    pinchController = null;
  });
</script>

<div
  class="browse-panel"
  class:fullpage={layout === "fullpage"}
  class:compact={layout === "compact"}
  class:minimal={layout === "minimal"}
  bind:this={containerEl}
>
  {#if title}
    <div class="panel-title">
      <h3>{title}</h3>
    </div>
  {/if}

  {#if showToolbar}
    {#if selection?.active && !hideSelectionToolbar}
      <SelectionToolbar
        selectedCount={selection.selectedIds.size}
        totalCount={engine.sequences.length}
        primaryLabel="Collections"
        primaryIcon="fa-folder-plus"
        onPrimaryAction={selection.openPrimaryAction}
        dangerLabel={selection.openDangerAction
          ? "Delete permanently"
          : undefined}
        dangerIcon={selection.openDangerAction ? "fa-trash" : undefined}
        onDangerAction={selection.openDangerAction}
        onSelectAll={selection.selectAll}
        onClearSelection={selection.clear}
        onExitSelection={selection.exit}
      />
    {:else}
      <BrowseToolbar
        {engine}
        {showSourceToggle}
        {onBack}
        {backLabel}
        hideSearch={hideToolbarSearch}
        {onOpenFilters}
        {hideFilterChips}
        onEnterSelection={selection && showSelectionAction
          ? () => selection.enter()
          : undefined}
        {curatedSortLabel}
        variant={toolbarVariant}
        {resultTotal}
      />
    {/if}
  {/if}

  {#if engine.viewMode.subject !== "hands"}
    <PropViewingControl {collectionPropType} />
  {/if}

  {#if showFilterBar}
    <BrowseFilterBar {engine} chipsOnly={!!onOpenFilters} {onSaveSmart} />
  {/if}

  <div
    class="panel-content"
    class:internal-grid-scroll={usesInternalGridScroller}
    bind:this={contentEl}
    onscroll={handleScroll}
  >
    {#if engine.error}
      <div class="error-state" role="alert">
        <p>{engine.error}</p>
        <button onclick={() => engine.refresh()}>Try again</button>
      </div>
    {:else if warming}
      <!-- Instant-tap warm frame: skeleton only. No sidebar/grid → no
           filtered-set read → the layout paints before the compute. -->
      <div class="grid-area">
        <BrowseThumbnailSkeleton count={12} />
      </div>
    {:else if isEmpty}
      <div class="empty-state" role="status">
        <i
          class="fas {engine.hasActiveFilters
            ? 'fa-filter'
            : 'fa-inbox'} empty-icon"
          aria-hidden="true"
        ></i>
        <p class="empty-message">
          {(!engine.hasActiveFilters && emptyState?.message) || emptyMessage}
        </p>
        {#if !engine.hasActiveFilters && emptyState}
          <p class="empty-description">{emptyState.description}</p>
        {/if}
        {#if engine.hasActiveFilters}
          <button
            class="clear-filters-btn"
            onclick={() => withResultsMorph(() => engine.clearUserFilters())}
          >
            <i class="fas fa-times" aria-hidden="true"></i>
            Clear all filters
          </button>
        {:else if emptyAction}
          <!-- Genuine empty library (no filters): host-supplied CTA rendered as
               a real button, never a bare link (clickables-look-like-buttons). -->
          <PanelButton variant="primary" onclick={emptyAction.onClick}>
            {emptyAction.label}
          </PanelButton>
        {/if}
        {#if !engine.hasActiveFilters && emptyState?.secondaryAction}
          <p class="empty-description">
            {emptyState.secondaryAction.description}
          </p>
          <PanelButton
            variant="secondary"
            onclick={emptyState.secondaryAction.onClick}
          >
            {emptyState.secondaryAction.label}
          </PanelButton>
        {/if}
      </div>
    {:else}
      <div
        class="grid-with-sidebar"
        class:internal-grid-scroll={usesInternalGridScroller}
      >
        {#if showSidebar}
          <BrowseSidebar
            {engine}
            {activeSection}
            onScrollToSection={scrollToSection}
          />
        {/if}
        {#if hasSequences}
          <div class="grid-area">
            <BrowseGrid
              {engine}
              {thumbnailService}
              onAction={onSelect ? handleAction : undefined}
              {disableVirtualization}
              eager={isEager}
              selectedIds={selection?.selectedIds ?? selectedIds}
              selectionMode={selection?.active ?? false}
              onSelectionStart={selection
                ? (sequence) => selection.enter(sequence)
                : undefined}
              onSelectionToggle={selection
                ? (sequence) => selection.toggle(sequence)
                : undefined}
              scrollElement={contentEl}
              {collectionContext}
              {collectionPropType}
              onSectionGridReady={(api) => (sectionApi = api)}
              onActiveSectionChange={(title) => (activeSection = title)}
            />
          </div>
        {/if}
      </div>
      {#if showSkeleton}
        <div class="skeleton-overlay" class:fading={skeletonFading}>
          <BrowseThumbnailSkeleton count={12} />
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .browse-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    container-type: inline-size;
    container-name: gallery;
  }

  .panel-title {
    padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .panel-title h3 {
    margin: 0;
    font-size: var(--font-size-base, 16px);
    color: var(--theme-text, white);
  }

  .panel-content {
    position: relative;
    flex: 1;
    overflow-y: auto;
    container-type: inline-size;
    touch-action: pan-y;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .panel-content.internal-grid-scroll {
    overflow: hidden;
  }

  .panel-content::-webkit-scrollbar {
    width: 6px;
  }
  .panel-content::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }
  .panel-content::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 3px;
  }

  .grid-with-sidebar {
    display: flex;
    align-items: flex-start;
    gap: 0;
  }

  .grid-with-sidebar.internal-grid-scroll {
    height: 100%;
    min-height: 0;
  }

  .grid-with-sidebar.internal-grid-scroll .grid-area {
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
  }

  .grid-area {
    flex: 1;
    min-width: 0;
    padding: var(--spacing-lg);
  }

  .browse-panel.minimal .grid-area {
    padding: var(--spacing-sm);
  }

  /* Narrow containers: cards get the width, not the gutters. */
  @container gallery (max-width: 640px) {
    .grid-area {
      padding: var(--spacing-sm, 8px);
    }
  }

  .skeleton-overlay {
    position: absolute;
    inset: 0;
    padding: var(--spacing-lg);
    background: inherit;
    z-index: 1;
    opacity: 1;
    transition: opacity 300ms ease-out;
  }

  .skeleton-overlay.fading {
    opacity: 0;
    pointer-events: none;
  }

  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    gap: var(--spacing-md);
    color: var(--semantic-error);
  }

  .error-state p {
    margin: 0;
    text-align: center;
  }

  .error-state button {
    padding: var(--spacing-sm) var(--spacing-md);
    background: color-mix(in srgb, var(--semantic-error) 20%, transparent);
    border: 1px solid var(--semantic-error);
    border-radius: 6px;
    color: var(--semantic-error);
    cursor: pointer;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-xl, 24px);
    min-height: 200px;
    color: var(--theme-text-dim);
  }

  .empty-icon {
    font-size: 2rem;
    opacity: 0.5;
    margin-bottom: var(--spacing-sm, 8px);
  }
  .empty-message {
    margin: 0;
    font-size: var(--font-size-base, 16px);
    color: var(--theme-text, #ffffff);
    font-weight: 500;
    text-align: center;
    max-width: 38rem;
  }

  .empty-description {
    margin: 0;
    max-width: 32rem;
    text-align: center;
    font-size: var(--font-size-sm, 14px);
    line-height: 1.5;
  }

  .clear-filters-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs, 4px);
    margin-top: var(--spacing-sm, 8px);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 12px);
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 15%,
      transparent
    );
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    font: inherit;
  }

  @media (prefers-reduced-motion: reduce) {
    .skeleton-overlay,
    .clear-filters-btn {
      transition: none;
    }
  }
</style>
