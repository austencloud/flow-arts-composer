<!--
  SectionedVirtualGrid — windowed rendering for the SECTIONED gallery.

  The gallery always runs with sections enabled, so the old sectioned path in
  BrowseGrid rendered a ChoreoCardThumbnail for every word across every section
  with NO virtualization (BrowseGrid's `useVirtualization` excludes the
  sectioned case). Tapping a big filter (e.g. Level 1/2) mounted 150–250 cards
  synchronously and froze the tap.

  This virtualizes the sectioned layout by flattening sections into a typed item
  stream — banner (Level N) / header (letter) / row (≤columnCount cards) — and
  windowing it with @tanstack/svelte-virtual (the same lib the flat
  VirtualizedSequenceGrid uses).

  Integration decision: it does NOT own a scroll container. It virtualizes
  against an EXTERNAL scroll element (BrowsePanel's `.panel-content`, passed in),
  so there stays exactly ONE scroller — required because the section sidebar is
  position:sticky inside it, and scroll-restore / toolbar-hide / the skeleton
  overlay are all already wired to it. TanStack `scrollMargin` accounts for the
  list's offset below the toolbar/filter bar.
-->
<script lang="ts">
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { onMount, onDestroy, untrack } from "svelte";
  import {
    createVirtualizer,
    type VirtualItem,
    type SvelteVirtualizer,
  } from "@tanstack/svelte-virtual";
  import type { Readable } from "svelte/store";
  import ChoreoCardThumbnail from "$lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte";
  import SectionHeader from "$lib/shared/browse/components/SectionHeader.svelte";
  import DifficultyBadge from "$lib/shared/components/DifficultyBadge.svelte";
  import type { SequenceSection } from "$lib/shared/browse/domain/models/browse-models";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { BrowseThumbnailProvider } from "$lib/shared/browse/services/browse-thumbnail-provider";
  import type { BrowseEngine } from "../engine/types";
  import {
    buildVariationMap,
    variationGroupKey,
  } from "$lib/shared/browse/services/variation-grouper";
  import { calculateGalleryAspectRatio } from "$lib/shared/render/services/layout-calculator";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { isCatDogMode } from "$lib/shared/browse/utils/prop-mode-helpers";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { cellPreWarmer } from "$lib/shared/sequence-viewer/services/cell-pre-warmer";
  import { prefetch as prefetchSequenceData } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import { registerResultsLayoutStabilizer } from "$lib/shared/transitions/results-morph";
  import {
    createSectionedGridMeasurementSignature,
    getSectionedGridItemKey,
    getSectionedGridRowMaxSteps,
  } from "./sectioned-grid-measurements";

  export interface SectionedGridApi {
    /** Scroll the section whose header carries `title` to the top of the view. */
    scrollToSectionTitle: (title: string) => void;
  }

  interface Props {
    collectionPropType?: PropType | null;
    engine: BrowseEngine;
    thumbnailService: BrowseThumbnailProvider | null;
    /** The single external scroll container (BrowsePanel's `.panel-content`). */
    scrollElement: HTMLElement | null;
    onAction?: (
      action: string,
      sequence: SequenceData,
      variations?: SequenceData[]
    ) => void;
    eager?: boolean;
    handPathMode?: boolean;
    showLeftMotion?: boolean;
    showRightMotion?: boolean;
    addWord?: boolean;
    addDifficultyLevel?: boolean;
    selectedIds?: ReadonlySet<string>;
    selectionMode?: boolean;
    onSelectionStart?: (sequence: SequenceData) => void;
    onSelectionToggle?: (sequence: SequenceData) => void;
    /** Inside one collection: per-card "remove from this collection". */
    collectionContext?: {
      id: string;
      name: string;
      onRemove: (sequenceId: string) => void;
    };
    /** Imperative API for the sidebar's section jump. */
    onGridReady?: (api: SectionedGridApi) => void;
    /** Reports the section title at the top of the viewport (sidebar highlight). */
    onActiveSectionChange?: (title: string | undefined) => void;
  }

  const {
    collectionPropType,
    engine,
    thumbnailService,
    scrollElement,
    onAction,
    eager = false,
    handPathMode = false,
    showLeftMotion = true,
    showRightMotion = true,
    addWord = true,
    addDifficultyLevel = true,
    selectedIds,
    selectionMode = false,
    onSelectionStart,
    onSelectionToggle,
    collectionContext,
    onGridReady,
    onActiveSectionChange,
  }: Props = $props();

  const compositionManager = getImageCompositionManager();

  // ── Card render context (mirrors VirtualizedSequenceGrid) ──────────────
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

  // ── Variation grouping (map from the FULL filtered set) ────────────────
  const variationMap = $derived.by(() =>
    buildVariationMap(engine.sequences as SequenceData[])
  );
  function getVariationsForSequence(sequence: SequenceData): SequenceData[] {
    const key = variationGroupKey(sequence);
    if (!key) return [sequence];
    return variationMap.get(key) ?? [sequence];
  }

  // One card per WORD — collapse a word's variations to a single card (the pill
  // cycles the rest). Keyed by the simplified word (variationGroupKey).
  function dedupeByWord(seqs: SequenceData[]): SequenceData[] {
    const seen = new Set<string>();
    const out: SequenceData[] = [];
    for (const seq of seqs) {
      const key = variationGroupKey(seq) ?? seq.id;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(seq);
    }
    return out;
  }

  /** Strip the "Level N · " prefix so a level section's header shows just the letter. */
  function letterTitle(title: string): string {
    return title.replace(/^Level\s+\d+\s+·\s+/u, "");
  }

  // ── Flatten sections into a typed, windowable item stream ──────────────
  type Item =
    | {
        type: "banner";
        key: string;
        sectionTitle: string;
        level: number;
        levelTotal: number;
      }
    | {
        type: "header";
        key: string;
        sectionTitle: string;
        /** Stable across result-set changes — unlike `sectionTitle`, which
         *  embeds the sequence count. Drives the view-transition name so a
         *  section that merely gains sequences MOVES instead of exiting and
         *  re-entering as a different section. */
        sectionId: string;
        label: string;
        count: number;
        hideSteps: boolean;
        isLevel: boolean;
      }
    | {
        type: "row";
        key: string;
        sectionTitle: string;
        sequences: SequenceData[];
        isLevel: boolean;
      };

  const stepsRedundant = $derived(engine.activeFilters.has("length"));

  const flat = $derived.by(() => {
    const secs = engine.sections as SequenceSection[];
    const cols = engine.columnCount;
    const isLevel =
      secs.length > 0 && secs.every((s) => typeof s.level === "number");

    const totals = new Map<number, number>();
    if (isLevel)
      for (const s of secs)
        totals.set(s.level!, (totals.get(s.level!) ?? 0) + s.count);

    const items: Item[] = [];
    const headerIndexByTitle = new Map<string, number>();
    let prevLevel: number | undefined;

    for (const s of secs) {
      const showBanner = isLevel && s.level !== prevLevel;
      if (showBanner) {
        items.push({
          type: "banner",
          key: `b-${s.level}`,
          sectionTitle: s.title,
          level: s.level ?? 0,
          levelTotal: totals.get(s.level!) ?? 0,
        });
      }
      prevLevel = s.level;

      const display = dedupeByWord(s.sequences as SequenceData[]);

      headerIndexByTitle.set(s.title, items.length);
      items.push({
        type: "header",
        key: `h-${s.id}`,
        sectionTitle: s.title,
        sectionId: s.id,
        label: isLevel ? letterTitle(s.title) : s.title,
        count: display.length,
        hideSteps: stepsRedundant,
        isLevel,
      });

      for (let i = 0; i < display.length; i += cols) {
        items.push({
          type: "row",
          key: `r-${s.id}-${i}`,
          sectionTitle: s.title,
          sequences: display.slice(i, i + cols),
          isLevel,
        });
      }
    }

    return { items, headerIndexByTitle, isLevel };
  });

  // ── Virtualizer wiring ─────────────────────────────────────────────────
  let listEl = $state<HTMLDivElement | null>(null);
  let listWidth = $state(0);
  let scrollMargin = $state(0);

  let virtualItems = $state<VirtualItem[]>([]);
  let totalHeight = $state(0);

  const BANNER_H = 64;
  const HEADER_H = 44;
  const ROW_SPACING = 8;

  function estimateItemSize(index: number): number {
    const it = flat.items[index];
    if (!it) return HEADER_H;
    if (it.type === "banner") return BANNER_H;
    if (it.type === "header") return HEADER_H;
    // row
    const cols = engine.columnCount;
    // Never estimate from a made-up width: a 360px guess on a 4K container
    // under-estimated every row ~4x, so first paint scattered rows into wrong
    // slots (visible as a hole between rows until measurement caught up). The
    // scroller's width is always real and available before the list's own
    // ResizeObserver fires.
    const width =
      listWidth > 0 ? listWidth : (scrollElement?.clientWidth ?? 360);
    const gap = 8;
    const cardWidth = (width - (cols - 1) * gap) / cols;
    const maxSteps = getSectionedGridRowMaxSteps(it.sequences);
    const aspect = calculateGalleryAspectRatio(
      maxSteps,
      compositionManager.startPositionLayout
    );
    return cardWidth / aspect + ROW_SPACING;
  }

  type VirtualizerInstance = SvelteVirtualizer<HTMLElement, Element>;
  type VirtualizerStore = Readable<VirtualizerInstance>;
  let currentVirtualizer: VirtualizerInstance | null = null;
  let virtualizerStore: VirtualizerStore | null = null;
  let storeUnsub: (() => void) | null = null;
  let lastActive: string | undefined;
  let activeScrollElement: HTMLElement | null = null;
  let activeMeasurementSignature = "";
  let remeasureRaf: number | null = null;
  let unregisterMorphStabilizer: (() => void) | null = null;

  function measureScrollMargin(): number {
    if (!listEl || !scrollElement) return 0;
    const listRect = listEl.getBoundingClientRect();
    const scRect = scrollElement.getBoundingClientRect();
    return Math.max(0, listRect.top - scRect.top + scrollElement.scrollTop);
  }

  function reportActive(v: VirtualizerInstance) {
    const off = v.scrollOffset ?? 0;
    const vis = v.getVirtualItems();
    let active: string | undefined;
    for (const vi of vis) {
      if (vi.start + vi.size > off + 4) {
        active = flat.items[vi.index]?.sectionTitle;
        break;
      }
    }
    if (active !== lastActive) {
      lastActive = active;
      onActiveSectionChange?.(active);
    }
  }

  let createSignature = "";

  function getVirtualItemKey(index: number): string | number {
    return getSectionedGridItemKey(flat.items, index);
  }

  function createAndSubscribe(measurementSignature: string): boolean {
    if (!scrollElement) return false;
    // Recreate only when the virtualizer's shape or scroll owner changes.
    // Equal-count data replacements reset measurements in the pre-effect below;
    // width changes use the list ResizeObserver. Recreating for either one would
    // discard the cache without guaranteeing that every retained node remounts.
    const sig = `${flat.items.length}|${engine.columnCount}`;
    if (
      sig === createSignature &&
      currentVirtualizer &&
      activeScrollElement === scrollElement
    ) {
      return false;
    }
    createSignature = sig;
    activeScrollElement = scrollElement;
    activeMeasurementSignature = measurementSignature;

    // Seed the row width SYNCHRONOUSLY before the first estimates. The rAF
    // seed below (onMount) lands a frame after the virtualizer has already
    // positioned every row from a zero-width fallback — that one bad frame is
    // the "hole" between rows on wide screens.
    if (listEl) {
      const w = listEl.getBoundingClientRect().width;
      if (w > 0 && Math.abs(w - listWidth) > 1) listWidth = w;
    }

    // Refresh the (stable) list offset within the scroller before creating.
    scrollMargin = measureScrollMargin();

    storeUnsub?.();

    virtualizerStore = createVirtualizer({
      count: flat.items.length,
      getScrollElement: () => scrollElement,
      getItemKey: getVirtualItemKey,
      estimateSize: estimateItemSize,
      overscan: 4,
      scrollMargin,
    });

    storeUnsub = virtualizerStore.subscribe((v) => {
      currentVirtualizer = v;
      virtualItems = v.getVirtualItems();
      totalHeight = v.getTotalSize();
      reportActive(v);
    });

    // A fresh virtualizer starts from estimates. The already-mounted item nodes
    // won't re-run the `use:measureItem` action, so feed their real heights back
    // in — otherwise stale estimates leave gaps between sections.
    queueMountedRemeasure();
    return true;
  }

  function queueMountedRemeasure() {
    if (remeasureRaf !== null) return;
    remeasureRaf = requestAnimationFrame(() => {
      remeasureRaf = null;
      remeasureMounted();
    });
  }

  function remeasureMounted() {
    if (!currentVirtualizer || !listEl) return;
    // Svelte actions do not have React's null-ref callback. Clear TanStack's
    // disconnected element entries before registering the data-keyed nodes that
    // replaced them during this filter update.
    currentVirtualizer.measureElement(null);
    for (const node of listEl.querySelectorAll<HTMLElement>(".v-item")) {
      currentVirtualizer.measureElement(node);
    }
  }

  function stabilizeMorphLayout() {
    if (remeasureRaf !== null) {
      cancelAnimationFrame(remeasureRaf);
      remeasureRaf = null;
    }
    remeasureMounted();
  }

  function resetMeasurementsForCurrentWidth() {
    currentVirtualizer?.measure();
    queueMountedRemeasure();
  }

  function measureItem(node: HTMLElement) {
    currentVirtualizer?.measureElement(node);
    // Card thumbnails can settle to a different height after mount (aspect
    // finalization / async cells); keep the measured size in sync.
    const ro = new ResizeObserver(() =>
      currentVirtualizer?.measureElement(node)
    );
    ro.observe(node);
    return { destroy: () => ro.disconnect() };
  }

  onMount(() => {
    scrollMargin = measureScrollMargin();
    createAndSubscribe(
      createSectionedGridMeasurementSignature(
        flat.items,
        engine.columnCount,
        compositionManager.startPositionLayout
      )
    );

    if (onGridReady) {
      onGridReady({
        scrollToSectionTitle: (title: string) => {
          const idx = flat.headerIndexByTitle.get(title);
          if (idx == null || !currentVirtualizer) return;
          // Variable-size virtualization: the first jump uses estimates for the
          // still-unmeasured sections above the target, so it lands short. Each
          // jump measures more en route; re-jump a couple frames to converge on
          // the exact position. Instant (not smooth) so each correction is crisp.
          const jump = () =>
            currentVirtualizer?.scrollToIndex(idx, { align: "start" });
          jump();
          requestAnimationFrame(() => {
            jump();
            requestAnimationFrame(() => jump());
          });
        },
      });
    }

    let resizeRaf: number | null = null;
    const ro = new ResizeObserver((entries) => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = null;
        let widthChanged = false;
        for (const entry of entries) {
          const w = entry.contentRect.width;
          if (w > 0 && Math.abs(w - listWidth) > 1) {
            listWidth = w;
            widthChanged = true;
          }
        }
        // A width change invalidates every cached height. Leaving the
        // virtualizer at estimates here is what made the C section fall back on
        // top of A one frame after an otherwise-correct filter transition.
        if (widthChanged) resetMeasurementsForCurrentWidth();
      });
    });
    if (listEl) ro.observe(listEl);

    // Settle the initial width once, then let measurement/RO take over.
    requestAnimationFrame(() => {
      if (listEl) {
        const w = listEl.getBoundingClientRect().width;
        if (w > 0 && Math.abs(w - listWidth) > 1) {
          listWidth = w;
          resetMeasurementsForCurrentWidth();
        }
      }
    });

    return () => {
      ro.disconnect();
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
    };
  });

  onDestroy(() => {
    storeUnsub?.();
    unregisterMorphStabilizer?.();
    if (remeasureRaf !== null) cancelAnimationFrame(remeasureRaf);
    visibilityManager.unregisterObserver(handleVisibilityChange);
  });

  // Filtering can replace a short row with a taller one while leaving the item
  // count unchanged. Reset those cached sizes before Svelte paints the new row,
  // so the View Transition snapshots the final section positions rather than a
  // frame where the following header still owns the old row's offset.
  $effect.pre(() => {
    const measurementSignature = createSectionedGridMeasurementSignature(
      flat.items,
      engine.columnCount,
      compositionManager.startPositionLayout
    );
    const sc = scrollElement;
    untrack(() => {
      if (!sc) return;
      if (createAndSubscribe(measurementSignature)) return;
      if (measurementSignature === activeMeasurementSignature) return;

      activeMeasurementSignature = measurementSignature;
      currentVirtualizer?.measure();
      queueMountedRemeasure();
    });
  });

  // Pre-warm pictograph cells for visible rows (debounced), matching the flat grid.
  let preWarmTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const rows = virtualItems;
    if (!rows.length) return;
    untrack(() => {
      if (preWarmTimer) clearTimeout(preWarmTimer);
      preWarmTimer = setTimeout(() => {
        preWarmTimer = null;
        for (const vi of rows) {
          const it = flat.items[vi.index];
          if (it?.type !== "row") continue;
          for (const seq of it.sequences)
            cellPreWarmer.preWarmSequence(seq, "background");
        }
      }, 150);
    });
  });
  onDestroy(() => {
    if (preWarmTimer) clearTimeout(preWarmTimer);
  });

  // ── Structural view-transition names ───────────────────────────────────
  // Cards were the ONLY named elements in the results grid, so section headers
  // and level banners belonged to the `root` snapshot — whose animation the app
  // disables globally (`shared/transitions/view-transitions.css`). Measured
  // 2026-08-05: on a Level 3 → +Level 2 change, `.header-wrap`, `.level-banner`
  // and `.sectioned-virtual` all reported `view-transition-name: none`, so every
  // piece of structure SNAPPED while the cards animated. When the section set
  // changes — which it does on almost every filter change — that snap is most of
  // what the eye sees. Naming them lets them move, fade and arrive instead.
  //
  // Named ONLY inside the gallery's live results pane, matched by the same
  // ancestor `results-motion.css` uses to assign the `view-transition-class`.
  // Deciding it here from the DOM rather than plumbing a prop through
  // BrowsePanel → BrowseGrid keeps the class and the name inseparable: they
  // cannot end up scoped differently. Every other host (grid tab, filter sheet,
  // add-sequences sheet, collection builder) keeps unnamed structure, so the
  // card → /sequence/[id] route morph is untouched.
  let namesStructure = $state(false);
  onMount(() => {
    namesStructure = !!listEl?.closest(".pane-results-body");
    if (namesStructure) {
      unregisterMorphStabilizer =
        registerResultsLayoutStabilizer(stabilizeMorphLayout);
    }
  });

  // Names must be unique document-wide. A per-instance prefix guarantees that
  // without a claim registry: no two elements inside ONE grid share a section
  // title, and two mounted grids can never collide.
  const gridId = `g${Math.random().toString(36).slice(2, 8)}`;

  /** Section ids carry spaces, `·` and TKA glyphs; a view-transition-name must
   *  be a custom-ident. The `bsec-<gid>-` prefix also guarantees it never
   *  starts with a digit.
   *
   *  Keyed on the section ID, never the title: titles embed the sequence count
   *  ("A (4 STEPS) (1 SEQUENCES)"), so a title-keyed name made every section
   *  whose count moved look like a DIFFERENT section — it exited and a
   *  stranger entered in its place. Caught by reading the frame series. */
  function sectionName(id: string): string | undefined {
    if (!namesStructure) return undefined;
    return `bsec-${gridId}-${id.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
  }

  function bannerName(level: number): string | undefined {
    if (!namesStructure) return undefined;
    return `blvl-${gridId}-${level}`;
  }

  function handleAction(
    action: string,
    sequence: SequenceData,
    variations?: SequenceData[]
  ) {
    onAction?.(action, sequence, variations);
  }
  function handleHover(seq: SequenceData) {
    cellPreWarmer.preWarmSequence(seq, "user-visible");
    prefetchSequenceData(seq);
  }
</script>

<div
  bind:this={listEl}
  class="sectioned-virtual"
  style:height="{totalHeight}px"
  style:position="relative"
  style:width="100%"
>
  {#each virtualItems as vi (vi.key)}
    {@const it = flat.items[vi.index]}
    {#if it}
      <div
        class="v-item"
        data-index={vi.index}
        data-section={it.type === "header" ? it.sectionTitle : undefined}
        use:measureItem
        style:position="absolute"
        style:top="0"
        style:left="0"
        style:width="100%"
        style:transform="translateY({vi.start - scrollMargin}px)"
      >
        {#if it.type === "banner"}
          <div
            class="level-banner"
            style:view-transition-name={bannerName(it.level)}
          >
            <DifficultyBadge level={it.level} size="34px" />
            <span class="level-banner-title">Level {it.level}</span>
            <span class="level-banner-count">{it.levelTotal}</span>
            <div class="level-banner-divider"></div>
          </div>
        {:else if it.type === "header"}
          <div
            class="header-wrap"
            class:under-level={it.isLevel}
            style:view-transition-name={sectionName(it.sectionId)}
          >
            <SectionHeader
              title={it.label}
              count={it.count}
              hideSteps={it.hideSteps}
            />
          </div>
        {:else}
          <div
            class="sequences-grid grid-view"
            class:under-level={it.isLevel}
            class:is-transitioning={engine.isTransitioning}
            style:grid-template-columns="repeat({engine.columnCount}, 1fr)"
          >
            {#each it.sequences as sequence (sequence.id)}
              {@const seqVariations = getVariationsForSequence(sequence)}
              <ChoreoCardThumbnail
                {collectionPropType}
                {sequence}
                variations={seqVariations}
                onPrimaryAction={onAction
                  ? (seq) => handleAction("view-detail", seq, seqVariations)
                  : undefined}
                onHover={handleHover}
                leftPropType={propSettings.leftPropType}
                rightPropType={propSettings.rightPropType}
                catDogModeEnabled={isCatDog}
                {lightMode}
                {eager}
                {handPathMode}
                {showLeftMotion}
                {showRightMotion}
                {addWord}
                {addDifficultyLevel}
                {selectedIds}
                {selectionMode}
                {onSelectionStart}
                {onSelectionToggle}
                {collectionContext}
              />
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  {/each}
</div>

<style>
  .sectioned-virtual {
    /* Absolute item positioning; the container reserves total height so the
       shared scroll element (`.panel-content`) can scroll the full range. */
    width: 100%;
  }

  .v-item {
    box-sizing: border-box;
  }

  /* Letter subsections sit slightly indented beneath their level banner. */
  .header-wrap.under-level,
  .sequences-grid.under-level {
    padding-left: var(--spacing-sm, 8px);
  }

  .level-banner {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-md, 14px) 0 var(--spacing-xs, 4px);
  }
  .level-banner-title {
    font-size: var(--font-size-lg, 20px);
    font-weight: 800;
    color: var(--theme-text, #fff);
    letter-spacing: 0.01em;
    white-space: nowrap;
  }
  .level-banner-count {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 10px;
    border-radius: 12px;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
  .level-banner-divider {
    flex: 1;
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(
      to right,
      var(--theme-stroke, rgba(255, 255, 255, 0.12)) 0%,
      transparent 100%
    );
    min-width: 40px;
  }

  .header-wrap {
    padding-bottom: 2px;
  }

  .sequences-grid.grid-view {
    display: grid;
    gap: var(--spacing-sm, 8px);
    align-items: start;
    padding-bottom: var(--spacing-sm, 8px);
  }
  .sequences-grid.grid-view.is-transitioning {
    transition: gap 200ms ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    .sequences-grid.grid-view.is-transitioning {
      transition: none !important;
    }
  }
</style>
