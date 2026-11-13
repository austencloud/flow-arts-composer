<!--
  Desktop Browse > Sequences: the one row of filter menus above the grid.

  Left to right: back to the front door, search, Source, Level, Length,
  Mandala, More; then one count, Sort, Props, zoom and Save at the right end.
  A choice shows once: in its own button (Level, Length, Mandala) or as
  More's count. It replaces the toolbar, the scope bar's chip strip and the
  applied-chip band on desktop. Phones and tablets keep their own chrome.

  Composes FilterChipBase, ExpandableSearchBar, SortChoice,
  PropViewingControl, BrowseZoomControl and PanelButton; each menu is a
  GalleryFilterMenu (the gallery drill in a popover) or BrowseSourceMenu.
-->
<script module lang="ts">
  import type { Section as DrillSection } from "./gallery-drill-catalog.svelte";

  export type MenuRequest = {
    menu: "level" | "length" | "more";
    section?: Exclude<DrillSection, "chooser">;
  };
</script>

<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Popover } from "bits-ui";
  import type { BrowseEngine } from "#lib/shared/browse/engine/types.js";
  import type { BrowseScope } from "#lib/shared/browse/navigation/browse-scope.js";
  import { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
  import type { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import ExpandableSearchBar from "#lib/shared/browse/components/ExpandableSearchBar.svelte";
  import PropViewingControl from "#lib/shared/browse/components/PropViewingControl.svelte";
  import BrowseZoomControl from "#lib/shared/browse/components/BrowseZoomControl.svelte";
  import { browseSortOptions } from "#lib/shared/browse/components/browse-sort-options.js";
  import { localizeFilterChip } from "#lib/shared/browse/components/localize-filter-chip.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { withResultsMorph } from "#lib/shared/transitions/results-morph.js";
  import SortChoice from "#lib/features/browse/shared/components/SortChoice.svelte";
  import BrowseSourceMenu from "#lib/features/browse/shared/components/BrowseSourceMenu.svelte";
  import { createBrowseScopeChips } from "#lib/features/browse/shared/state/browse-scope-chips.svelte";
  import GalleryFilterMenu from "./GalleryFilterMenu.svelte";
  import type {
    CollectionOption,
    Section,
  } from "./gallery-drill-catalog.svelte";

  let {
    engine,
    scope,
    collections = [],
    menuRequest = null,
    onBackToStart,
    onSaveSmart,
    onOpenMandala,
  }: {
    engine: BrowseEngine;
    scope: BrowseScope | null;
    collections?: readonly CollectionOption[];
    /** Open one menu as the grid appears: the front door's category tiles.
     * A new object each time, so the same tile twice still opens it. */
    menuRequest?: MenuRequest | null;
    onBackToStart?: () => void;
    onSaveSmart?: () => void;
    onOpenMandala?: () => void;
  } = $props();

  const scopes = createBrowseScopeChips(() => scope);

  let levelOpen = $state(false);
  let lengthOpen = $state(false);
  let moreOpen = $state(false);
  let moreSeed = $state<{ section: Exclude<Section, "chooser"> } | null>(null);

  $effect(() => {
    const request = menuRequest;
    if (!request) return;
    levelOpen = request.menu === "level";
    lengthOpen = request.menu === "length";
    moreSeed =
      request.menu === "more" && request.section
        ? { section: request.section }
        : null;
    moreOpen = request.menu === "more";
  });

  const countPending = $derived(engine.isLoading || engine.isResolvingFilters);
  const countNumber = $derived(
    countPending
      ? "…"
      : `${engine.resultCount.toLocaleString()}${
          engine.isLibraryComplete ? "" : "+"
        }`
  );
  const countWord = $derived(
    countPending
      ? t("browse_audit_counting_matches")
      : t(
          engine.resultCount === 1
            ? "browse_audit_sequence"
            : "browse_audit_sequences"
        )
  );

  const sortOptions = $derived(
    browseSortOptions({ handsMode: engine.viewMode.subject === "hands" })
  );
  function changeSort(method: BrowseSortMethod): void {
    sortOpen = false;
    withResultsMorph(() => engine.setSort(method, engine.sortDirection));
  }
  // Where the row is short of room, Sort folds into one button showing the
  // current order's icon; the same choices open under it.
  let sortOpen = $state(false);
  let sortAnchor = $state<HTMLElement | null>(null);
  const currentSort = $derived(
    sortOptions.find((option) => option.id === engine.sortMethod) ??
      sortOptions[0]
  );
  function ignoreSortTriggerPress(event: Event): void {
    if (event.target instanceof Node && sortAnchor?.contains(event.target)) {
      event.preventDefault();
    }
  }

  const mandalaFilter = $derived(
    [...engine.activeFilters.entries()].find(
      ([, f]) => f.type === BrowseFilterType.MANDALA && !f.locked
    ) ?? null
  );
  const mandalaLabel = $derived(
    mandalaFilter
      ? localizeFilterChip(mandalaFilter[1])
      : t("browse_ui_mandala")
  );

  const hasUserFilters = $derived(
    [...engine.activeFilters.values()].some((f) => !f.locked)
  );
  const showViewingControl = $derived(engine.viewMode.subject !== "hands");
</script>

<div class="menu-row-frame">
  <div
    class="browse-menu-row"
    role="toolbar"
    aria-label={t("browse_ui_filters")}
  >
    <div class="filters">
      {#if onBackToStart}
        <span class="back-slot"
          ><PanelButton
            variant="quiet"
            onclick={onBackToStart}
            ariaLabel={t("site_start_here")}
            title={t("site_start_here")}
          >
            <i class="fas fa-arrow-left" aria-hidden="true"></i>
          </PanelButton></span
        >
      {/if}
      {#if scopes.query}
        <div class="search-slot">
          <ExpandableSearchBar
            name="browse-search"
            value={scopes.query.search}
            placeholder={scopes.placeholder}
            onSearch={scopes.search}
            expansionAnchor="start"
          />
        </div>
      {/if}
      <BrowseSourceMenu {scope} />
      <GalleryFilterMenu {engine} kind="level" bind:open={levelOpen} />
      <GalleryFilterMenu {engine} kind="length" bind:open={lengthOpen} />
      {#if onOpenMandala}
        <span class="mandala-door" class:applied={!!mandalaFilter}>
          <FilterChipBase
            mode="action"
            label={mandalaLabel}
            icon="fas fa-dharmachakra"
            active={!!mandalaFilter}
            chipColor={mandalaFilter?.[1].chipColor}
            onclick={onOpenMandala}
            onremove={mandalaFilter
              ? () =>
                  withResultsMorph(() => engine.removeFilter(mandalaFilter![0]))
              : undefined}
            removeAriaLabel={t("browse_audit_remove_filter", {
              filter: mandalaLabel,
            })}
          />
        </span>
      {/if}
      <GalleryFilterMenu
        {engine}
        kind="more"
        bind:open={moreOpen}
        seedRequest={moreSeed}
        {collections}
      />
    </div>

    <div class="view">
      <span class="result-count" aria-live="polite" aria-atomic="true"
        >{#if countPending}<span class="count-word">{countWord}</span
          >{countNumber}{:else}{countNumber}<span class="count-word"
            >&nbsp;{countWord}</span
          >{/if}</span
      >
      <span class="sort-inline">
        <SortChoice
          options={sortOptions}
          currentMethod={engine.sortMethod}
          onSortChange={changeSort}
        />
      </span>
      <span class="sort-compact" bind:this={sortAnchor}>
        <FilterChipBase
          mode="dropdown"
          popupRole="dialog"
          label={currentSort?.label ?? t("browse_sort_options")}
          icon={`fas ${currentSort?.icon ?? "fa-arrow-down-wide-short"}`}
          expanded={sortOpen}
          ariaLabel={`${t("browse_sort_options")}: ${currentSort?.label ?? ""}`}
          onclick={() => (sortOpen = !sortOpen)}
          ondismiss={() => (sortOpen = false)}
        />
      </span>
      <Popover.Root bind:open={sortOpen}>
        <Popover.Portal>
          <Popover.Content
            customAnchor={sortAnchor}
            preventScroll={false}
            side="bottom"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            class="browse-sort-menu"
            aria-label={t("browse_sort_options")}
            onInteractOutside={ignoreSortTriggerPress}
          >
            <SortChoice
              options={sortOptions}
              currentMethod={engine.sortMethod}
              onSortChange={changeSort}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {#if showViewingControl}
        <PropViewingControl presentation="toolbar" />
      {/if}
      <BrowseZoomControl {engine} />
      {#if onSaveSmart}
        <span class="save-slot">
          <PanelButton
            variant="secondary"
            onclick={onSaveSmart}
            disabled={!hasUserFilters}
            ariaLabel={t("browse_audit_save_filters_smart")}
            title={t("browse_audit_save_filters_smart")}
          >
            <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
            <span class="label">{t("browse_audit_save")}</span>
          </PanelButton>
        </span>
      {/if}
    </div>
  </div>
</div>

<style>
  /* The row's own width decides what keeps its words, not the window's:
     the grid's sidebar and a narrow window both take from it. */
  .menu-row-frame {
    container-type: inline-size;
    container-name: menu-row;
    flex: 0 0 auto;
  }
  .browse-menu-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-height: calc(var(--min-touch-target, 44px) + 1rem);
    padding: 0.5rem clamp(0.75rem, 1.5cqi, 1.75rem);
    border-bottom: 1px solid
      color-mix(in srgb, var(--theme-text, #fff) 10%, transparent);
  }
  .filters,
  .view {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    flex-wrap: nowrap;
  }
  .filters {
    flex: 0 0 auto;
  }
  .view {
    flex: 0 0 auto;
    gap: 0.5rem;
  }
  .search-slot {
    display: flex;
    flex: 0 0 auto;
  }
  .mandala-door {
    display: inline-flex;
    flex: 0 0 auto;
  }
  .result-count {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .browse-menu-row :global(.panel-btn) {
    min-height: var(--min-touch-target, 44px);
    white-space: nowrap;
  }
  .back-slot {
    display: flex;
    flex: 0 0 auto;
  }
  .back-slot :global(.panel-btn) {
    width: var(--min-touch-target, 44px);
    padding: 0;
    justify-content: center;
  }
  .save-slot :global(.panel-btn) {
    gap: 0.4rem;
  }

  .sort-inline {
    display: flex;
  }
  .sort-compact {
    display: none;
  }
  .sort-compact :global(.chip-label) {
    display: none;
  }
  :global(.browse-sort-menu) {
    z-index: var(--z-dropdown, 1000);
    padding: 0.5rem;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 16px);
    background: var(--surface-panel-opaque);
    box-shadow: var(--shadow-lg, 0 18px 48px rgba(0, 0, 0, 0.45));
    outline: none;
    transform-origin: var(--bits-popover-content-transform-origin);
  }
  /* The same entrance as the row's other menus and PropViewingControl. */
  :global(.browse-sort-menu[data-state="open"]) {
    animation: browse-sort-menu-enter var(--duration-fast) var(--ease-out) both;
  }
  @keyframes browse-sort-menu-enter {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    :global(.browse-sort-menu[data-state="open"]) {
      animation: none;
    }
  }
  :global(.browse-sort-menu .sort-choice .sort-name.rest) {
    display: inline;
  }

  /* Words step aside for icons before anything wraps. */
  @container menu-row (max-width: 1399.98px) {
    .sort-inline {
      display: none;
    }
    .sort-compact {
      display: flex;
    }
    .browse-menu-row :global(.viewing-control .prop-label),
    .browse-menu-row :global(.viewing-control .source) {
      display: none;
    }
  }
  @container menu-row (max-width: 1239.98px) {
    .save-slot .label {
      display: none;
    }
    .mandala-door:not(.applied) :global(.chip-label) {
      display: none;
    }
  }
  @container menu-row (max-width: 1099.98px) {
    .count-word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .browse-menu-row :global(.source-anchor .chip-label) {
      display: none;
    }
    .browse-menu-row :global(.menu-anchor .chip-label) {
      max-width: 7rem;
    }
    .browse-menu-row {
      gap: 0.5rem;
    }
    .filters,
    .view {
      gap: 0.3rem;
    }
  }
</style>
