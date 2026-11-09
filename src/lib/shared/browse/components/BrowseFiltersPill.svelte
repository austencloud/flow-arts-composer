<!--
  The Filters pill: what opens a grid's Filters sheet, and how many sequences
  are behind the current filters. The count lives in the pill because a bare
  number at the toolbar's edge read as noise (Austen, 2026-07-02). Badge =
  active filter count, number = results.

  `label` is the toolbar's "482 sequences". The Browse header has the title
  beside it, so it uses `label="filters"`: "Filters 482", the number alone on a
  phone too narrow for the word.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { BrowseEngine } from "../engine/types";

  let {
    engine,
    onOpen,
    label = "count",
  }: {
    engine: BrowseEngine;
    onOpen: () => void;
    label?: "count" | "filters";
  } = $props();

  const activeUserFilterCount = $derived(
    engine.allFilterChips.filter((c) => !c.locked).length
  );
  const results = $derived(
    engine.resultCount === 1
      ? t("browse_audit_one_sequence", { count: engine.resultCount })
      : t("browse_audit_many_sequences", { count: engine.resultCount })
  );
</script>

<button
  type="button"
  class="filters-pill"
  class:header={label === "filters"}
  onclick={onOpen}
  aria-label={!engine.isLibraryComplete
    ? `At least ${engine.resultCount} sequences loaded. More may be available.`
    : activeUserFilterCount > 0
      ? t("browse_audit_filters_with_active", {
          results,
          active: activeUserFilterCount,
        })
      : t("browse_audit_filters_with_results", { results })}
>
  <i class="fas fa-sliders" aria-hidden="true"></i>
  {#if label === "filters"}
    <span class="filters-word">{t("browse_ui_filters")}</span>
  {/if}
  <span class="filters-pill-count">
    {engine.resultCount}{engine.isLibraryComplete ? "" : "+"}{#if label === "count"}<span
        class="result-count-word"
        >&nbsp;{engine.resultCount === 1
          ? t("browse_audit_sequence")
          : t("browse_audit_sequences")}</span
      >{/if}
  </span>
  {#if activeUserFilterCount > 0}
    <span class="filters-badge">{activeUserFilterCount}</span>
  {/if}
</button>
<span class="sr-only" aria-live="polite" aria-atomic="true">
  {engine.isLibraryComplete
    ? results
    : `At least ${engine.resultCount} sequences loaded`}
</span>

<style>
  .filters-pill {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 12px;
    min-height: var(--min-touch-target, 48px);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--border-radius-md, 10px);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  .filters-pill:hover {
    color: var(--theme-text);
    border-color: color-mix(
      in srgb,
      var(--theme-stroke) 80%,
      var(--theme-text)
    );
  }

  .filters-pill:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .filters-pill.header {
    min-height: 44px;
    height: 44px;
    box-sizing: border-box;
  }

  .filters-word {
    color: var(--theme-text);
    font-weight: 700;
  }

  .filters-pill-count {
    color: var(--theme-text);
    font-weight: 700;
    /* Changing number must not jitter the pill width (no-layout-shift). */
    font-variant-numeric: tabular-nums;
  }

  .header .filters-pill-count {
    color: var(--theme-text-dim);
    /* Room for the catalog's four digits and the "still loading" plus, so the
       pill holds its size while the count climbs. */
    min-width: 5ch;
    text-align: end;
  }

  .filters-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--theme-accent);
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 520px) {
    .result-count-word {
      display: none;
    }

    .filters-word {
      display: none;
    }
  }

  /* A phone held sideways keeps the number only. */
  @media (max-height: 480px) and (min-width: 700px) {
    .result-count-word {
      display: none;
    }
  }
</style>
