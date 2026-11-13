<script lang="ts">
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { collectionPropSettings } from "#lib/shared/library/domain/collection-prop.js";
  import { onDestroy } from "svelte";
  import ChoreoCardThumbnail from "#lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte";
  import VirtualizedSequenceGrid, {
    type VirtualGridApi,
  } from "#lib/shared/browse/components/VirtualizedSequenceGrid.svelte";
  import SectionedVirtualGrid, {
    type SectionedGridApi,
  } from "#lib/shared/browse/components/SectionedVirtualGrid.svelte";
  import type { BrowseThumbnailProvider } from "#lib/shared/browse/services/browse-thumbnail-provider.js";
  import {
    buildVariationMap,
    variationGroupKey,
  } from "#lib/shared/browse/services/variation-grouper.js";
  import { prefetch as prefetchSequenceData } from "#lib/shared/sequence-viewer/services/sequence-data-provider.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { isCatDogMode } from "#lib/shared/browse/utils/prop-mode-helpers.js";
  import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { galleryStepCount } from "#lib/shared/browse/services/gallery-render-input.js";
  import type { BrowseEngine } from "../engine/types";
  import {
    galleryAspectForSteps,
    justifiedCellFlex,
    justifiedTargetHeight,
    packJustifiedRows,
  } from "./justified-rows";

  interface Props {
    collectionPropType?: PropType | null;
    engine: BrowseEngine;
    thumbnailService: BrowseThumbnailProvider | null;
    onAction?: (
      action: string,
      sequence: SequenceData,
      variations?: SequenceData[]
    ) => void;
    disableVirtualization?: boolean;
    eager?: boolean;
    onGridReady?: (api: VirtualGridApi) => void;
    /** Picker hosts: ids to render with the selected outline. */
    selectedIds?: ReadonlySet<string>;
    /** Personal-library batch selection. Long-press starts it; taps toggle
     * cards once active. */
    selectionMode?: boolean;
    onSelectionStart?: (sequence: SequenceData) => void;
    onSelectionToggle?: (sequence: SequenceData) => void;
    /** Shared external scroll element for the sectioned virtual grid
     * (BrowsePanel's `.panel-content`). */
    scrollElement?: HTMLElement | null;
    /** Sectioned virtual grid: imperative API for the sidebar's section jump. */
    onSectionGridReady?: (api: SectionedGridApi) => void;
    /** Sectioned virtual grid: reports the section at the top of the viewport. */
    onActiveSectionChange?: (title: string | undefined) => void;
    /** Show each card's step count. The grid turns it off itself when the
     * sections already say the length. */
    showLength?: boolean;
    /** Inside one collection: gives each card a "remove from this collection"
     * action. Omit everywhere else. */
    collectionContext?: {
      id: string;
      name: string;
      onRemove: (sequenceId: string) => void;
    };
  }

  const {
    engine,
    thumbnailService,
    onAction,
    disableVirtualization = false,
    eager = false,
    onGridReady,
    selectedIds,
    selectionMode = false,
    onSelectionStart,
    onSelectionToggle,
    scrollElement = null,
    onSectionGridReady,
    onActiveSectionChange,
    collectionContext,
    collectionPropType,
    showLength: showLengthProp = true,
  }: Props = $props();

  // The length goes on each card unless the grid is grouped by length, or one
  // applied length already says it for every card.
  const showLength = $derived(
    showLengthProp &&
      engine.sectionGroupBy !== "length" &&
      ![...engine.activeFilters.values()].some(
        (f) => String(f.type) === "length"
      )
  );

  // Derived state from engine — sections take priority over virtualization
  const useVirtualization = $derived(
    !disableVirtualization &&
      !(engine.sectionsEnabled && engine.sections.length > 0) &&
      engine.sequences.length > 50
  );

  const variationMap = $derived.by(() => {
    return buildVariationMap(engine.sequences as SequenceData[]);
  });

  function getVariationsForSequence(sequence: SequenceData): SequenceData[] {
    const key = variationGroupKey(sequence);
    if (!key) return [sequence];
    return variationMap.get(key) ?? [sequence];
  }

  // One card per WORD — the variation pill + crossfade exist to cycle a word's
  // variations inside a single card (legacy counted "number of words" and drew
  // one thumbnail box per word). Rendering every variation as its own card
  // filled sections with near-identical duplicates. Keyed by the SIMPLIFIED
  // word (the label) so raw-word variants sharing a label collapse too.
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

  // The sectioned layout (level banners, letter subsections, word-collapsed
  // rows) is virtualized in SectionedVirtualGrid — the flat/small fallback
  // below still uses dedupeByWord + getVariationsForSequence.

  // The flat fallback lays its cards out in justified rows too, so a short
  // list of mixed lengths has no holes either (justified-rows.ts).
  const FLAT_GAP = 8;
  const compositionManager = getImageCompositionManager();
  let flatWidth = $state(0);
  const flatCards = $derived(dedupeByWord(engine.sequences as SequenceData[]));
  const flatRows = $derived.by(() => {
    if (!(flatWidth > 0)) return null;
    const layoutFor = (stepCount: number) =>
      compositionManager.getStartPlacementLayoutForStepCount(stepCount);
    const aspects = flatCards.map((seq) =>
      galleryAspectForSteps(galleryStepCount(seq), layoutFor)
    );
    const rows = packJustifiedRows(aspects, {
      width: flatWidth,
      gap: FLAT_GAP,
      targetHeight: justifiedTargetHeight(
        flatWidth,
        engine.columnCount,
        FLAT_GAP,
        galleryAspectForSteps(4, layoutFor)
      ),
    });
    return rows.map((row) => ({
      ...row,
      cards: flatCards.slice(row.start, row.start + row.count),
      aspects: aspects.slice(row.start, row.start + row.count),
    }));
  });

  const handPathMode = $derived(engine.viewMode.subject === "hands");
  const isSoloMode = $derived(engine.viewMode.granularity === "solo");

  // Motion visibility: combined shows both; solo shows the selected hand.
  const showLeftMotion = $derived(
    engine.viewMode.granularity === "combined" ||
      engine.viewMode.hand === "left"
  );
  const showRightMotion = $derived(
    engine.viewMode.granularity === "combined" ||
      engine.viewMode.hand === "right"
  );

  // Word/difficulty only meaningful with both props visible
  const addWord = $derived(!handPathMode && !isSoloMode);
  const addDifficultyLevel = $derived(!handPathMode && !isSoloMode);

  // Prop settings
  const propSettings = $derived(
    collectionPropSettings(
      {
        leftPropType: settingsService.settings.leftPropType,
        rightPropType: settingsService.settings.rightPropType,
        catDogMode: settingsService.settings.catDogMode,
      },
      settingsService.settings.propViewingMode === "as-saved"
        ? collectionPropType
        : null
    )
  );

  const isCatDog = $derived(
    isCatDogMode(
      propSettings.leftPropType,
      propSettings.rightPropType,
      propSettings.catDogMode
    )
  );

  // Light mode tracking via observer pattern
  const visibilityManager = getAnimationVisibilityManager();
  let lightMode = $state(!visibilityManager.isDarkMode());

  function handleVisibilityChange() {
    lightMode = !visibilityManager.isDarkMode();
  }

  visibilityManager.registerObserver(handleVisibilityChange);

  onDestroy(() => {
    visibilityManager.unregisterObserver(handleVisibilityChange);
  });

  // Hover prefetch
  function handleSequenceHover(seq: SequenceData) {
    prefetchSequenceData(seq);
  }

  function handleSequenceAction(
    action: string,
    sequence: SequenceData,
    variations?: SequenceData[]
  ) {
    onAction?.(action, sequence, variations);
  }
</script>

{#if useVirtualization}
  <!-- Virtualized: large flat list with 50+ items -->
  <VirtualizedSequenceGrid
    {collectionPropType}
    sequences={dedupeByWord(engine.sequences as SequenceData[])}
    variationSource={engine.sequences as SequenceData[]}
    {thumbnailService}
    {onAction}
    pinchColumnOverride={engine.columnCount}
    {onGridReady}
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
    {showLength}
  />
{:else if engine.sectionsEnabled && engine.sections.length > 0}
  <!-- Sectioned: virtualized (level banners + letter headers + word rows) -->
  <SectionedVirtualGrid
    {collectionPropType}
    {engine}
    {thumbnailService}
    {scrollElement}
    {onAction}
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
    {showLength}
    onGridReady={onSectionGridReady}
    {onActiveSectionChange}
  />
{:else if engine.sequences.length > 0}
  <!-- Flat: small list, justified rows (plain columns for the one frame
       before its width is known) -->
  <div class="flat-grid" bind:clientWidth={flatWidth}>
    {#if flatRows}
      {#each flatRows as row (row.start)}
        <div
          class="sequences-grid grid-view justified"
          style:gap="{FLAT_GAP}px"
        >
          {#each row.cards as sequence, i (sequence.id)}
            <div
              class="justified-cell"
              style:flex={justifiedCellFlex(
                row.aspects[i] ?? 1,
                row.height,
                row.filled
              )}
            >
              {@render flatCard(sequence)}
            </div>
          {/each}
        </div>
      {/each}
    {:else}
      <div
        class="sequences-grid grid-view"
        style:grid-template-columns="repeat({engine.columnCount}, 1fr)"
      >
        {#each flatCards as sequence (sequence.id)}
          {@render flatCard(sequence)}
        {/each}
      </div>
    {/if}
  </div>
{/if}

{#snippet flatCard(sequence: SequenceData)}
  {@const seqVariations = getVariationsForSequence(sequence)}
  <ChoreoCardThumbnail
    {collectionPropType}
    {sequence}
    variations={seqVariations}
    onPrimaryAction={onAction
      ? (seq) => handleSequenceAction("view-detail", seq, seqVariations)
      : undefined}
    onHover={handleSequenceHover}
    leftPropType={propSettings.leftPropType}
    rightPropType={propSettings.rightPropType}
    catDogModeEnabled={isCatDog}
    {lightMode}
    {eager}
    {handPathMode}
    {showLeftMotion}
    {showRightMotion}
    {selectedIds}
    {selectionMode}
    {onSelectionStart}
    {onSelectionToggle}
    {collectionContext}
    {showLength}
  />
{/snippet}

<style>
  /* Flat/small fallback grid only — the sectioned layout's styles live in
     SectionedVirtualGrid. */
  .flat-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }

  .sequences-grid.grid-view {
    display: grid;
    gap: 8px;
    align-items: var(--browse-row-align, start);
  }

  /* A justified row: every card one height, each keeping its own shape; each
     card's width comes inline from the packing. */
  .sequences-grid.grid-view.justified {
    display: flex;
    flex-wrap: nowrap;
    justify-content: flex-start;
  }

  .justified-cell {
    min-width: 0;
  }
</style>
