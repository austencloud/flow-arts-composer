<script lang="ts">
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { prefetch as prefetchSequenceData } from "#lib/shared/sequence-viewer/services/sequence-data-provider.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    createVirtualizer,
    type VirtualItem,
    type SvelteVirtualizer,
  } from "@tanstack/svelte-virtual";
  import type { Readable } from "svelte/store";
  import { onMount, onDestroy, untrack } from "svelte";
  import type { BrowseThumbnailProvider } from "#lib/shared/browse/services/browse-thumbnail-provider.js";
  import ChoreoCardThumbnail from "#lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { isCatDogMode } from "#lib/shared/browse/utils/prop-mode-helpers.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import {
    buildVariationMap,
    variationGroupKey,
  } from "#lib/shared/browse/services/variation-grouper.js";
  import { cellPreWarmer } from "#lib/shared/sequence-viewer/services/cell-pre-warmer.js";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { galleryStepCount } from "#lib/shared/browse/services/gallery-render-input.js";
  import {
    galleryAspectForSteps,
    justifiedCellFlex,
    justifiedTargetHeight,
    packJustifiedRows,
    type JustifiedRow,
  } from "./justified-rows";

  /**
   * Cards with different lengths have different shapes, so rows are justified
   * (justified-rows.ts): every card in a row is drawn at one height and the
   * row fills the width. The rows are packed from data, so the virtualizer
   * knows each row's height before it renders; measured DOM rows still
   * correct it after render.
   */

  export interface VirtualGridApi {
    scrollToSequenceIndex: (index: number) => void;
    subscribeToScroll: (callback: () => void) => () => void;
    getFirstVisibleSequenceIndex: () => number;
  }

  const {
    collectionPropType,
    sequences = [],
    thumbnailService,
    onAction,
    pinchColumnOverride,
    onGridReady,
    handPathMode = false,
    showLeftMotion = true,
    showRightMotion = true,
    addWord,
    addDifficultyLevel,
    allowQR = true,
    collectionContext,
    showLength = false,
    selectedIds,
    selectionMode = false,
    onSelectionStart,
    onSelectionToggle,
    variationSource,
  } = $props<{
    collectionPropType?: PropType | null;
    sequences: SequenceData[];
    thumbnailService: BrowseThumbnailProvider | null;
    onAction?: (
      action: string,
      sequence: SequenceData,
      variations?: SequenceData[]
    ) => void;
    pinchColumnOverride?: number;
    onGridReady?: (api: VirtualGridApi) => void;
    handPathMode?: boolean;
    /** Show blue motion (prop + arrow) in thumbnails. Default: true */
    showLeftMotion?: boolean;
    /** Show red motion (prop + arrow) in thumbnails. Default: true */
    showRightMotion?: boolean;
    addWord?: boolean;
    addDifficultyLevel?: boolean;
    /** Allow a baked-in QR (signed-in only, gated by the showQRCode setting +
     * a spare cell). Default true — the QR is its own shared cache class, so it
     * still loads from static/cloud. Pass false only for tiny/unscannable
     * surfaces. */
    allowQR?: boolean;
    /** When rendering a collection's members: adds "Remove from this collection" to each card's menu */
    collectionContext?: {
      id: string;
      name: string;
      onRemove: (sequenceId: string) => void;
    };
    /** Show each card's step count. */
    showLength?: boolean;
    /** Picker hosts: ids to render with the selected outline. */
    selectedIds?: ReadonlySet<string>;
    selectionMode?: boolean;
    onSelectionStart?: (sequence: SequenceData) => void;
    onSelectionToggle?: (sequence: SequenceData) => void;
    /** Full (un-collapsed) list to build the variation map from. When the host
     * passes a word-deduped `sequences` list, the map MUST come from the full
     * list or every card sees exactly one variation and the collapsed ones
     * become unreachable. */
    variationSource?: SequenceData[];
  }>();

  const compositionManager = getImageCompositionManager();

  const variationMap = $derived.by(() => {
    return buildVariationMap(variationSource ?? sequences);
  });

  function getVariationsForSequence(sequence: SequenceData): SequenceData[] {
    const key = variationGroupKey(sequence);
    if (!key) return [sequence];
    return variationMap.get(key) ?? [sequence];
  }

  const propSettings = $derived({
    leftPropType: settingsService.settings.leftPropType,
    rightPropType: settingsService.settings.rightPropType,
    catDogMode: settingsService.settings.catDogMode,
  });

  const isCatDog = $derived(
    isCatDogMode(
      propSettings.leftPropType,
      propSettings.rightPropType,
      propSettings.catDogMode
    )
  );

  const visibilityManager = getAnimationVisibilityManager();
  let lightMode = $state(!visibilityManager.isDarkMode());

  function handleVisibilityChange() {
    lightMode = !visibilityManager.isDarkMode();
  }

  visibilityManager.registerObserver(handleVisibilityChange);

  onDestroy(() => {
    visibilityManager.unregisterObserver(handleVisibilityChange);
    if (measureRaf !== null) cancelAnimationFrame(measureRaf);
    mountedRows.clear();
    pendingMeasures.clear();
  });

  let scrollElement = $state<HTMLDivElement | null>(null);
  let containerWidth = $state(0);

  let virtualRows = $state<VirtualItem[]>([]);
  let totalHeight = $state(0);

  const columnCount = $derived.by(() => {
    if (containerWidth === 0) return 2;

    if (pinchColumnOverride !== undefined) {
      const maxForWidth =
        containerWidth < 480
          ? 2
          : containerWidth < 800
            ? 3
            : containerWidth < 1200
              ? 4
              : 5;
      return Math.max(2, Math.min(maxForWidth, pinchColumnOverride));
    }

    if (containerWidth >= 1400) return 5;
    if (containerWidth >= 1000) return 4;
    if (containerWidth >= 600) return 3;
    return 2;
  });

  // Each row's side padding and the space between cards are part of the
  // packing maths, so the row draws them from these numbers. The gap keeps
  // the sizes the old container queries gave it.
  const ROW_PADDING_X = 8;
  const cardGap = $derived(
    containerWidth <= 480 ? 8 : containerWidth < 1200 ? 12 : 16
  );

  const layoutFor = (stepCount: number) =>
    compositionManager.getStartPlacementLayoutForStepCount(stepCount);

  /** Each card's shape (width / height), from its length and start placement. */
  const aspects = $derived.by(() => {
    const bySteps = new Map<number, number>();
    return sequences.map((seq: SequenceData) => {
      const steps = galleryStepCount(seq);
      let shape = bySteps.get(steps);
      if (shape === undefined) {
        shape = galleryAspectForSteps(steps, layoutFor);
        bySteps.set(steps, shape);
      }
      return shape;
    });
  });

  // The column count sets the target height: the height a 4-step card had at
  // that count, so a row of 4-step cards looks as it always did.
  const rows = $derived.by((): JustifiedRow[] => {
    const width = Math.max(0, containerWidth - 2 * ROW_PADDING_X);
    if (width === 0) {
      // Not measured yet: plain chunks hold the space for one frame.
      const out: JustifiedRow[] = [];
      for (let i = 0; i < sequences.length; i += columnCount) {
        out.push({
          start: i,
          count: Math.min(columnCount, sequences.length - i),
          height: 200,
          filled: false,
        });
      }
      return out;
    }
    return packJustifiedRows(aspects, {
      width,
      gap: cardGap,
      targetHeight: justifiedTargetHeight(
        width,
        columnCount,
        cardGap,
        galleryAspectForSteps(4, layoutFor)
      ),
    });
  });

  const rowCount = $derived(rows.length);

  // The virtualizer's `gap: 16` option adds spacing between rows separately,
  // so a row's estimate is its packed card height alone.
  function estimateRowHeight(rowIndex: number): number {
    return rows[rowIndex]?.height ?? 200;
  }

  function getRowSequences(rowIndex: number): SequenceData[] {
    const row = rows[rowIndex];
    if (!row) return [];
    return sequences.slice(row.start, row.start + row.count);
  }

  /** The row that holds the card at `index`. */
  function rowIndexForSequence(index: number): number {
    let lo = 0;
    let hi = rows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((rows[mid]?.start ?? 0) <= index) lo = mid;
      else hi = mid - 1;
    }
    return Math.max(0, lo);
  }

  function handleSequenceAction(
    action: string,
    sequence: SequenceData,
    variations?: SequenceData[]
  ) {
    onAction?.(action, sequence, variations);
  }

  function handleSequenceHover(seq: SequenceData) {
    cellPreWarmer.preWarmSequence(seq, "user-visible");
    prefetchSequenceData(seq);
  }

  // Single virtualizer instance - created once, recreated when deps change.
  // Uses per-row estimateSize for accurate initial layout, plus measured DOM
  // rows for pixel-perfect correction after render.
  type VirtualizerInstance = SvelteVirtualizer<HTMLDivElement, Element>;
  type VirtualizerStore = Readable<VirtualizerInstance>;

  let currentVirtualizer: VirtualizerInstance | null = null;
  let virtualizerStore: VirtualizerStore | null = null;
  let storeUnsub: (() => void) | null = null;
  let mountedRows = new Set<HTMLElement>();
  let pendingMeasures = new Set<HTMLElement>();
  let measureRaf: number | null = null;

  function queueRowMeasure(node: HTMLElement) {
    pendingMeasures.add(node);
    measureRaf ??= requestAnimationFrame(flushMeasures);
  }

  function queueMountedRowMeasures() {
    for (const row of mountedRows) queueRowMeasure(row);
  }

  function createAndSubscribe(count: number) {
    // Clean up previous
    storeUnsub?.();

    if (!scrollElement) return;

    virtualizerStore = createVirtualizer({
      count,
      getScrollElement: () => scrollElement,
      estimateSize: estimateRowHeight,
      overscan: 3,
      gap: 16,
    });

    storeUnsub = virtualizerStore.subscribe((v) => {
      currentVirtualizer = v;
      virtualRows = v.getVirtualItems();
      totalHeight = v.getTotalSize();
    });

    // A width or column-count change creates a fresh virtualizer while Svelte
    // may retain the existing row nodes. Register those nodes with the new
    // instance so it does not fall back to stale estimates for retained rows.
    queueMountedRowMeasures();
  }

  // Svelte action: measures each row's actual DOM height after render.
  // TanStack Virtual reads data-index from the element to know which row it is.
  //
  // Measures are BATCHED into one rAF pass: measureElement reads offsetHeight,
  // and calling it per-row while rows are still mounting interleaves reads with
  // writes — a forced full-document layout per row (traced at 1,964ms while the
  // Choreo picker's gallery filled). One batched pass = one layout flush;
  // estimateSize covers the single frame before precise heights land.
  function flushMeasures() {
    measureRaf = null;
    if (!currentVirtualizer) return;
    for (const el of pendingMeasures) {
      if (el.isConnected) currentVirtualizer.measureElement(el);
    }
    pendingMeasures.clear();
  }

  function measureRow(node: HTMLElement) {
    mountedRows.add(node);
    queueRowMeasure(node);

    return {
      destroy() {
        mountedRows.delete(node);
        pendingMeasures.delete(node);
      },
    };
  }

  // Scroll event listeners for the sidebar
  let scrollListeners = new Set<() => void>();
  let scrollIdleTimer: ReturnType<typeof setTimeout> | null = null;

  function handleScrollEvent() {
    // Cancel background pre-warming during active scroll to free main thread
    cellPreWarmer.cancelAll();
    if (preWarmTimer) {
      clearTimeout(preWarmTimer);
      preWarmTimer = null;
    }

    // Restart pre-warming after scroll settles
    if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => {
      scrollIdleTimer = null;
      const rows = virtualRows;
      for (const row of rows) {
        const rowSequences = getRowSequences(row.index);
        for (const seq of rowSequences) {
          cellPreWarmer.preWarmSequence(seq, "background");
        }
      }
    }, 200);

    for (const cb of scrollListeners) cb();
  }

  onMount(() => {
    if (!scrollElement) return;

    createAndSubscribe(rowCount);

    // ResizeObserver for responsive column count — debounced to prevent
    // cascading remeasurements on iOS (address bar show/hide triggers
    // rapid resize events that freeze mobile devices).
    let resizeRaf: number | null = null;
    const resizeObserver = new ResizeObserver((entries) => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        for (const entry of entries) {
          const width = entry.contentRect.width;
          if (width > 0 && Math.abs(width - containerWidth) > 1) {
            containerWidth = width;
            if (currentVirtualizer) {
              currentVirtualizer.measure();
              queueMountedRowMeasures();
            }
          }
        }
      });
    });

    resizeObserver.observe(scrollElement);

    // Initial measurement
    requestAnimationFrame(() => {
      if (scrollElement) {
        const width = scrollElement.getBoundingClientRect().width;
        if (width > 0) {
          containerWidth = width;
        }
      }
    });

    // Listen for scroll events (for sidebar active tracking)
    scrollElement.addEventListener("scroll", handleScrollEvent, {
      passive: true,
    });

    // Expose API for sidebar scroll control
    if (onGridReady) {
      onGridReady({
        scrollToSequenceIndex: (index: number) => {
          const rowIndex = rowIndexForSequence(index);
          if (currentVirtualizer) {
            currentVirtualizer.scrollToIndex(rowIndex, {
              align: "start",
              behavior: "smooth",
            });
          }
        },
        subscribeToScroll: (callback: () => void) => {
          scrollListeners.add(callback);
          return () => scrollListeners.delete(callback);
        },
        getFirstVisibleSequenceIndex: () => {
          const first = virtualRows[0];
          if (!first) return 0;
          return rows[first.index]?.start ?? 0;
        },
      });
    }

    return () => {
      storeUnsub?.();
      resizeObserver.disconnect();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      if (preWarmTimer) clearTimeout(preWarmTimer);
      if (scrollIdleTimer) clearTimeout(scrollIdleTimer);
      scrollElement?.removeEventListener("scroll", handleScrollEvent);
      scrollListeners.clear();
    };
  });

  // Recreate virtualizer when row count, column count, or layout changes
  $effect(() => {
    const count = rowCount;
    const _cols = columnCount;
    const _layout = compositionManager.startPlacementLayout;

    untrack(() => {
      if (scrollElement) {
        createAndSubscribe(count);
      }
    });
  });

  // Same row count, different packing (new results, a resize that keeps the
  // count): the cached heights are stale, so estimate again from the rows.
  let packedSignature = "";
  $effect(() => {
    const signature = rows
      .map((r) => `${r.start}:${r.count}:${r.height.toFixed(1)}`)
      .join("|");
    untrack(() => {
      if (signature === packedSignature) return;
      packedSignature = signature;
      if (!currentVirtualizer) return;
      currentVirtualizer.measure();
      queueMountedRowMeasures();
    });
  });

  // Pre-warm pictograph cells for visible sequences — debounced to avoid
  // firing on every scroll frame. Waits 150ms after scroll settles before
  // queuing background work, preventing mobile freeze from effect thrashing.
  let preWarmTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    const rows = virtualRows;
    if (!rows.length) return;

    untrack(() => {
      if (preWarmTimer) clearTimeout(preWarmTimer);
      preWarmTimer = setTimeout(() => {
        preWarmTimer = null;
        for (const row of rows) {
          const rowSequences = getRowSequences(row.index);
          for (const seq of rowSequences) {
            cellPreWarmer.preWarmSequence(seq, "background");
          }
        }
      }, 150);
    });
  });
</script>

<div
  bind:this={scrollElement}
  class="virtual-scroll-container ph-no-capture themed-scrollbar"
  role="grid"
  aria-rowcount={rowCount}
>
  <div class="virtual-content" style:height="{totalHeight}px">
    {#each virtualRows as virtualRow (virtualRow.key)}
      <div
        class="virtual-row"
        data-index={virtualRow.index}
        use:measureRow
        style:position="absolute"
        style:top="{virtualRow.start}px"
        style:width="100%"
        style:padding-inline="{ROW_PADDING_X}px"
        style:gap="{cardGap}px"
        role="row"
        aria-rowindex={virtualRow.index + 1}
      >
        {#each getRowSequences(virtualRow.index) as sequence, colIndex (sequence.id)}
          {@const seqVariations = getVariationsForSequence(sequence)}
          {@const row = rows[virtualRow.index]}
          <div
            role="gridcell"
            aria-colindex={colIndex + 1}
            style:flex={justifiedCellFlex(
              aspects[(row?.start ?? 0) + colIndex] ?? 1,
              row?.height ?? 0,
              row?.filled ?? false
            )}
          >
            <ChoreoCardThumbnail
              {collectionPropType}
              {sequence}
              variations={seqVariations}
              onPrimaryAction={onAction
                ? (seq) =>
                    handleSequenceAction("view-detail", seq, seqVariations)
                : undefined}
              onHover={handleSequenceHover}
              leftPropType={propSettings.leftPropType}
              rightPropType={propSettings.rightPropType}
              catDogModeEnabled={isCatDog}
              {lightMode}
              {handPathMode}
              {showLeftMotion}
              {showRightMotion}
              {addWord}
              {addDifficultyLevel}
              {allowQR}
              {collectionContext}
              {showLength}
              {selectedIds}
              {selectionMode}
              {onSelectionStart}
              {onSelectionToggle}
            />
          </div>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .virtual-scroll-container {
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-accent) var(--scrollbar-track);
  }

  .virtual-scroll-container::-webkit-scrollbar {
    width: 8px;
  }

  .virtual-scroll-container::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
  }

  .virtual-scroll-container::-webkit-scrollbar-thumb {
    background: var(--scrollbar-accent);
    border-radius: 4px;
  }

  .virtual-content {
    position: relative;
    width: 100%;
  }

  .virtual-row [role="gridcell"]:focus-within {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
    border-radius: 8px;
  }

  /* A justified row: every card one height, each keeping its own shape. The
     padding, the gap and each card's width come inline from the packing. */
  .virtual-row {
    box-sizing: border-box;
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-start;
    align-items: var(--browse-row-align, start);
  }

  .virtual-row [role="gridcell"] {
    min-width: 0;
  }
</style>
