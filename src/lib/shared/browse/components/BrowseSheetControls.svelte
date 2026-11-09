<!--
  The grid's controls, for the top of the Filters sheet on a phone or tablet:
  sort, zoom, prop viewing, Select, then what is applied (with Clear all and
  Save as Smart Collection). There the Browse header holds only search and the
  Filters pill, so these live one tap away instead of in bands over the grid.
-->
<script lang="ts">
  import type { BrowseEngine } from "../engine/types";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { withResultsMorph } from "#lib/shared/transitions/results-morph.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import SortChoice from "#lib/features/browse/shared/components/SortChoice.svelte";
  import FilterChipBase from "./filter-chips/FilterChipBase.svelte";
  import BrowseFilterBar from "./BrowseFilterBar.svelte";
  import BrowseZoomControl from "./BrowseZoomControl.svelte";
  import PropViewingControl from "./PropViewingControl.svelte";
  import { browseSortOptions } from "./browse-sort-options";

  let {
    engine,
    curatedSortLabel,
    collectionPropType,
    onSaveSmart,
    onEnterSelection,
  }: {
    engine: BrowseEngine;
    curatedSortLabel?: string | undefined;
    collectionPropType?: PropType | null | undefined;
    onSaveSmart?: (() => void) | undefined;
    onEnterSelection?: (() => void) | undefined;
  } = $props();

  const handsMode = $derived(engine.viewMode.subject === "hands");
  const sortOptions = $derived(
    browseSortOptions({ handsMode, curatedLabel: curatedSortLabel })
  );
  const hasApplied = $derived(
    engine.hasActiveFilters || !!engine.searchQuery.trim()
  );
</script>

<div class="sheet-controls">
  <div class="control-row">
    <SortChoice
      options={sortOptions}
      currentMethod={engine.sortMethod}
      onSortChange={(method: BrowseSortMethod) =>
        withResultsMorph(() => engine.setSort(method, engine.sortDirection))}
    />
    <BrowseZoomControl {engine} />
  </div>
  {#if !handsMode || onEnterSelection}
    <div class="control-row">
      {#if !handsMode}
        <PropViewingControl {collectionPropType} presentation="toolbar" />
      {/if}
      {#if onEnterSelection}
        <FilterChipBase
          label={t("browse_ui_select")}
          icon="fas fa-circle-check"
          mode="action"
          size="sm"
          onclick={onEnterSelection}
        />
      {/if}
    </div>
  {/if}
  {#if hasApplied}
    <div class="applied" transition:growFade={{ duration: DURATION.normal }}>
      <BrowseFilterBar {engine} chipsOnly {onSaveSmart} />
    </div>
  {/if}
</div>

<style>
  .sheet-controls {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--theme-stroke);
    container-type: inline-size;
  }

  .control-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  /* Room for every order's name. A phone names only the selected one. */
  @container (min-width: 560px) {
    .sheet-controls :global(.sort-name.rest) {
      display: inline;
    }
  }
</style>
