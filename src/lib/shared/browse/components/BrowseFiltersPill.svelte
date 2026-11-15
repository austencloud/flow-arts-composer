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
    pending = false,
    pendingCount = null,
  }: {
    engine: BrowseEngine;
    onOpen: () => void;
    label?: "count" | "filters";
    /** The host's grid has not answered yet, whatever the engine says. */
    pending?: boolean;
    /** What the host already knows the answer will be (a collection's size).
     * Shown while pending, so the number on the first frame is the one that
     * stays. Unknown shows no number until the grid answers. */
    pendingCount?: number | null;
  } = $props();

  const activeUserFilterCount = $derived(
    engine.allFilterChips.filter((c) => !c.locked).length
  );
  // While the pool loads or a filter is still working out its answer, the
  // count is not an answer yet: an ellipsis holds its place instead of "0".
  const engineCounting = $derived(
    pending || engine.isLoading || engine.isResolvingFilters
  );
  // A known size only stands for the answer when nothing narrows it.
  const knownCount = $derived(
    engineCounting &&
      pendingCount !== null &&
      !engine.searchQuery &&
      activeUserFilterCount === 0
      ? pendingCount
      : null
  );
  const countPending = $derived(engineCounting && knownCount === null);
  const resultCount = $derived(knownCount ?? engine.resultCount);
  const libraryComplete = $derived(
    knownCount !== null || engine.isLibraryComplete
  );
  const results = $derived(
    countPending
      ? t("browse_audit_counting_matches")
      : resultCount === 1
        ? t("browse_audit_one_sequence", { count: resultCount })
        : t("browse_audit_many_sequences", { count: resultCount })
  );
</script>

<button
  type="button"
  class="filters-pill"
  class:header={label === "filters"}
  onclick={onOpen}
  aria-label={!libraryComplete
    ? `At least ${resultCount} sequences loaded. More may be available.`
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
    <span class="count-number">{countPending ? "…" : resultCount}</span
    >{libraryComplete || countPending ? "" : "+"}{#if label === "count"}<span
        class="result-count-word"
        >&nbsp;{resultCount === 1 && !countPending
          ? t("browse_audit_sequence")
          : t("browse_audit_sequences")}</span
      >{/if}
  </span>
  {#if activeUserFilterCount > 0}
    <span class="filters-badge">{activeUserFilterCount}</span>
  {/if}
</button>
<span class="sr-only" aria-live="polite" aria-atomic="true">
  {libraryComplete || countPending
    ? results
    : `At least ${resultCount} sequences loaded`}
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

  /* Two digits wide, so the ellipsis shown while counting and a short count
     take the same room. */
  .count-number {
    display: inline-block;
    min-width: 2ch;
    text-align: end;
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
