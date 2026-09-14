<script lang="ts">
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { prefetch as prefetchSequenceData } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    createVirtualizer,
    type VirtualItem,
    type SvelteVirtualizer,
  } from "@tanstack/svelte-virtual";
  import type { Readable } from "svelte/store";
  import { onMount, onDestroy, untrack } from "svelte";
  import type { BrowseThumbnailProvider } from "$lib/shared/browse/services/browse-thumbnail-provider";
  import ChoreoCardThumbnail from "$lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { isCatDogMode } from "$lib/shared/browse/utils/prop-mode-helpers";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import {
    buildVariationMap,
    variationGroupKey,
  } from "$lib/shared/browse/services/variation-grouper";
  import { calculateGalleryAspectRatio } from "$lib/shared/render/services/layout-calculator";
  import { cellPreWarmer } from "$lib/shared/sequence-viewer/services/cell-pre-warmer";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";

  /**
   * The virtualizer needs to know each row's height before it renders.
   * The old code sampled ONE sequence and assumed all rows were the same height.
   * Cards with different beat counts have different aspect ratios, so that
   * caused overlap. Now we estimate per-row using the tallest card in the row,
   * then correct with measured DOM rows after they render.
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

  const rowCount = $derived(Math.ceil(sequences.length / columnCount));

  // Per-row height estimation: use the tallest card in each row.
  // This is the key fix for the overlap bug - the old code used a single
  // sample which broke when rows had mixed beat counts.
  // Row height = tallest card in the row. The virtualizer's `gap: 16` option
  // adds spacing between rows separately, so we don't add it here.
  function estimateRowHeight(rowIndex: number): number {
    if (containerWidth === 0) return 200;
    const colGap = 16;
    const cardWidth =
      (containerWidth - (columnCount - 1) * colGap) / columnCount;

    const startIdx = rowIndex * columnCount;
    const endIdx = Math.min(startIdx + columnCount, sequences.length);
    let maxSteps = 4;
    for (let i = startIdx; i < endIdx; i++) {
      const seq = sequences[i];
      const steps = seq?.steps?.length || seq?.sequenceLength || 4;
      if (steps > maxSteps) maxSteps = steps;
    }

    const aspectRatio = calculateGalleryAspectRatio(
      maxSteps,
      compositionManager.startPositionLayout
    );
    return cardWidth / aspectRatio;
  }

  function getRowSequences(rowIndex: number): SequenceData[] {
    const startIndex = rowIndex * columnCount;
    const endIndex = Math.min(startIndex + columnCount, sequences.length);
    return sequences.slice(startIndex, endIndex);
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
          const rowIndex = Math.floor(index / columnCount);
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
          return first.index * columnCount;
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
    const _layout = compositionManager.startPositionLayout;

    untrack(() => {
      if (scrollElement) {
        createAndSubscribe(count);
      }
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
        style:display="grid"
        style:grid-template-columns="repeat({columnCount}, 1fr)"
        style:align-items="start"
        style:gap="var(--spacing-lg, 16px)"
        role="row"
        aria-rowindex={virtualRow.index + 1}
      >
        {#each getRowSequences(virtualRow.index) as sequence, colIndex (sequence.id)}
          {@const seqVariations = getVariationsForSequence(sequence)}
          <div role="gridcell" aria-colindex={colIndex + 1}>
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

  .virtual-row {
    padding: 0 var(--spacing-sm, 4px);
    box-sizing: border-box;
  }

  @container (max-width: 480px) {
    .virtual-row {
      gap: 8px !important;
    }
  }

  @container (min-width: 481px) and (max-width: 1199px) {
    .virtual-row {
      gap: var(--spacing-md, 12px) !important;
    }
  }
</style>
