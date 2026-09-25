<!--
  GalleryPaneLeft — the split pane's filter column, and the height budget that
  divides it between its two zones.

  The column is one height budget. The catalog keeps its natural rows and the
  active editor fits its bounded rows into the exact space beside the results.
  A row maximum is only a ceiling; `pane-height-budget.ts` publishes both zone
  sizes and the fitted row size.

  Split out of GalleryDrill.svelte 2026-08-05 (Task 9).
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { Snippet } from "svelte";
  import CategoryRail from "./CategoryRail.svelte";
  import { heightBudget } from "./pane-height-budget";
  import type {
    CategoryEntry,
    GalleryCatalog,
    Section,
  } from "./gallery-drill-catalog.svelte";

  interface Props {
    catalog: GalleryCatalog;
    section: Section;
    /** Active rules per category key — renders the tiles' count dots. */
    ruleCounts?: Readonly<Record<string, number>>;
    /** Entered via "Show all": no value editor, the catalog owns the column. */
    idle: boolean;
    onSelectCategory: (entry: CategoryEntry) => void;
    /** The active value editor (a Crossfade over the workspace screens). */
    editor: Snippet;
    width?: number;
  }

  let {
    catalog,
    section,
    ruleCounts,
    idle,
    onSelectCategory,
    editor,
    width = $bindable(0),
  }: Props = $props();
</script>

<div
  class="pane-left"
  class:idle
  bind:clientWidth={width}
  use:heightBudget={`${section}:${idle}`}
>
  <CategoryRail
    {catalog}
    {section}
    layout="catalog"
    {ruleCounts}
    morph
    fill={idle}
    onselect={onSelectCategory}
  />
  {#if idle}
    <p class="pane-idle">
      {t("browse_ui_pick_a_category_above_to_narrow_it_down")}
    </p>
  {:else}
    <div class="drill-editor-stage">{@render editor()}</div>
  {/if}
</div>

<style>
  .pane-left {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-width: 0;
    min-height: 0;
    /* The value editors query `drill`; naming the column re-points every one
       of those queries at THIS box, so a 420px column composes its cards the
       way a 420px screen does instead of trying to run the 3-across desktop
       monument layout inside it. */
    container-type: inline-size;
    container-name: drill;
  }

  /* ── The budget ──────────────────────────────────────────────────────
     The action publishes two border-box sizes whose sum plus the gap equals
     the pane. The browser no longer has to resolve competing flex weights. */
  .drill-editor-stage {
    position: relative;
    display: flex;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 0;
    flex: 0 0 var(--editor-size, 100%);
    flex-direction: column;
    overflow: hidden;
  }
  .pane-left :global(.desktop-filter-catalog.catalog-layout) {
    box-sizing: border-box;
    flex: 0 0 var(--catalog-size, auto);
  }

  /* ONE surface for the whole workspace — the results pane declares the same
     token family in GalleryDrill, so the three zones read as one system. */
  .pane-left :global(.desktop-filter-catalog.catalog-layout),
  .drill-editor-stage {
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 1.1rem;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #11131a) 72%,
      transparent
    );
  }

  /* No category open: the catalog IS the column, so it takes all of it. */
  .pane-left.idle :global(.desktop-filter-catalog.catalog-layout) {
    flex: 1 1 0;
  }
  .pane-idle {
    flex: 0 0 auto;
    margin: 0;
    padding: 0.25rem 0.5rem;
    color: var(--theme-text-muted, #9aa6b8);
    font-size: 0.9rem;
    text-align: center;
  }
</style>
