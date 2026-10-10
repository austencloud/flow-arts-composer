<script lang="ts">
  import CardSizeToggle from "../card-preview/CardSizeToggle.svelte";
  import CopiesSelect from "./CopiesSelect.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    getPageLayout,
    PAPER_SIZES,
    type CardSizeId,
    type PaperSizeId,
  } from "../../domain/card-sizes";

  interface Props {
    cardSize: CardSizeId;
    totalCards: number;
    isRendering: boolean;
    renderProgress: number;
    renderTotal: number;
    onCardSizeChange: (size: CardSizeId) => void;
    /** Sheet stock for the print layout. Omit both to hide the picker and lay
     *  out on Letter (existing non-releaser callers). */
    paperSize?: PaperSizeId;
    onPaperSizeChange?: (size: PaperSizeId) => void;
    onRerender?: () => void;
    /** Copies per card for the print layout. Omit to hide the control. */
    copies?: number;
    onCopiesChange?: (n: number) => void;
    /** Deck-aware suggested copy counts (minimal empty space). */
    copiesPresets?: number[];
    /** Per-count waste readout for chip badges. */
    copiesAnnotate?: (n: number) => { blanks: number; perfect: boolean } | null;
    /** One-color-per-sheet grouping. Off = normal sequential fill (no blanks
     *  between colors). Omit both to hide the toggle. */
    groupByElement?: boolean;
    onGroupByElementChange?: (on: boolean) => void;
    /** Cluster same-letter cards together (AAABBBCCC). Independent of color —
     *  both on = letters cluster within each color. Omit both to hide. */
    groupByLetter?: boolean;
    onGroupByLetterChange?: (on: boolean) => void;
    /** Open the print dialog. Omit to hide the Print button (Deck Releaser prints via its sidebar). */
    onPrint?: () => void;
  }

  let {
    cardSize,
    totalCards,
    isRendering,
    renderProgress,
    renderTotal,
    onCardSizeChange,
    paperSize,
    onPaperSizeChange,
    onRerender,
    copies,
    onCopiesChange,
    copiesPresets,
    copiesAnnotate,
    groupByElement,
    onGroupByElementChange,
    groupByLetter,
    onGroupByLetterChange,
    onPrint,
  }: Props = $props();

  // The "one card per page" count for the current size and paper (9 poker /
  // 6 tarot on Letter; 25 / 12 on Super B) — marks the primary copies chip.
  const perPage = $derived(
    getPageLayout(cardSize, paperSize ?? "letter").cardsPerPage
  );

  const paperChoices = (
    Object.entries(PAPER_SIZES) as [
      PaperSizeId,
      (typeof PAPER_SIZES)[PaperSizeId],
    ][]
  ).map(([value, spec]) => ({ value, label: spec.shortLabel }));

  const progressText = $derived(
    renderTotal > 0
      ? `Rendering ${renderProgress} / ${renderTotal}...`
      : "Rendering..."
  );
</script>

<div class="toolbar" role="toolbar" aria-label="Print preview controls">
  <div class="toolbar-left">
    <CardSizeToggle selected={cardSize} onchange={onCardSizeChange} />
    {#if paperSize != null && onPaperSizeChange}
      <SegmentedControl
        options={paperChoices}
        value={paperSize}
        onchange={onPaperSizeChange}
        color="accent"
        size="sm"
        semantics="radiogroup"
        ariaLabel="Paper size"
      />
    {/if}
  </div>

  <div class="toolbar-right">
    {#if copies != null && onCopiesChange}
      <span class="copies-label">Copies</span>
      <CopiesSelect
        value={copies}
        onchange={onCopiesChange}
        presets={copiesPresets}
        annotate={copiesAnnotate}
        {perPage}
      />
    {/if}

    {#if groupByElement != null && onGroupByElementChange}
      <FilterChipBase
        mode="toggle"
        size="sm"
        label="Group by color"
        active={groupByElement}
        chipColor="#10b981"
        onclick={() => onGroupByElementChange(!groupByElement)}
      />
    {/if}

    {#if groupByLetter != null && onGroupByLetterChange}
      <FilterChipBase
        mode="toggle"
        size="sm"
        label="Group by letter"
        active={groupByLetter}
        chipColor="#a78bfa"
        onclick={() => onGroupByLetterChange(!groupByLetter)}
      />
    {/if}

    {#if onRerender}
      <button
        class="rerender-btn"
        class:spinning={isRendering}
        onclick={onRerender}
        aria-label={isRendering ? "Restart render" : "Re-render all cards"}
        title={isRendering
          ? "Restart render (cancels current)"
          : "Re-render all cards"}
      >
        <i class="fas fa-sync-alt" aria-hidden="true"></i>
        <span class="rerender-label">
          <span class="rerender-sizer" aria-hidden="true">Re-render cards</span>
          <span class="rerender-live"
            >{isRendering ? "Restart render" : "Re-render cards"}</span
          >
        </span>
      </button>
    {/if}

    {#if isRendering}
      <span class="progress-text" aria-live="polite" aria-atomic="true">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {progressText}
      </span>
    {/if}
  </div>

  {#if onPrint}
    <button
      class="print-btn"
      disabled={isRendering || totalCards === 0}
      onclick={onPrint}
      title={totalCards === 0
        ? "Load a deck first"
        : `Print ${totalCards} cards`}
    >
      <i class="fas fa-print" aria-hidden="true"></i>
      <span>Print This Deck</span>
    </button>
  {/if}
</div>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  /* SegmentedControl's root is width: 100% for full-width rows; in this flex
     row that resolves its flex-basis to the whole container and starves the
     card-size toggle. Content-size it here. Grid with equal 1fr columns sizes
     every segment to the widest label (flex:1 at max-content would split the
     sum and clip the wide one), and equal segments keep the sliding
     indicator's percentage math honest. */
  .toolbar-left > :global(.segmented-control) {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    width: max-content;
    flex: 0 0 auto;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .copies-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    margin-left: 4px;
  }

  .rerender-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: var(--min-touch-target, 44px);
    padding: 7px 11px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 100px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-family: inherit;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  .rerender-btn:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 10%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 30%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .rerender-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .rerender-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .rerender-btn.spinning i {
    animation: spin 1s linear infinite;
  }

  .rerender-label {
    display: inline-grid;
  }

  .rerender-sizer,
  .rerender-live {
    grid-area: 1 / 1;
  }

  .rerender-sizer {
    visibility: hidden;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .progress-text {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
  }

  .print-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 22px;
    min-height: 44px;
    font-size: 15px;
    font-weight: 600;
    font-family: inherit;
    color: #fff;
    background: linear-gradient(135deg, #7c3aed, #6d28d9);
    border: none;
    border-radius: 10px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .print-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    box-shadow: 0 2px 12px rgba(124, 58, 237, 0.3);
  }

  .print-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .print-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  @media (max-width: 767px) {
    .toolbar {
      flex-wrap: wrap;
      row-gap: 8px;
    }

    .print-btn {
      width: 100%;
      justify-content: center;
    }
  }
</style>
