<script lang="ts">
  import { onDestroy } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import { isCardLayoutAutomatic } from "$lib/shared/share/services/card-render-options";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { getViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";

  let {
    sequence,
    displayedBeatNumber,
    cardRenderOptions = null,
    handLabeling = null,
    qrSequence = sequence,
  }: {
    sequence: SequenceData;
    displayedBeatNumber: number;
    cardRenderOptions?: Partial<SequenceExportOptions> | null;
    handLabeling?: HandLabeling | null;
    /** The source behind a labeled `sequence`; what a scan of the card opens. */
    qrSequence?: SequenceData;
  } = $props();

  const highlightedStepIndex = $derived(
    displayedBeatNumber < 1 ? -1 : displayedBeatNumber - 1
  );

  // The composition manager publishes through observers rather than runes, so
  // reading it inside a derived subscribes to nothing without this counter.
  const compositionManager = getImageCompositionManager();
  let compositionVersion = $state(0);
  function onCardSettingsChanged(): void {
    compositionVersion++;
  }
  compositionManager.registerObserver(onCardSettingsChanged);
  onDestroy(() => compositionManager.unregisterObserver(onCardSettingsChanged));

  /**
   * A slot is a different frame from the Card pane, so on Auto the card gets to
   * measure this one. Pinned columns are a deliberate choice and still carry.
   */
  const automatic = $derived.by(() => {
    void compositionVersion;
    return isCardLayoutAutomatic(sequence.steps?.length ?? 0);
  });

  const columnCount = $derived(
    automatic ? null : (cardRenderOptions?.columnCount ?? null)
  );
  const startPositionLayoutOverride = $derived(
    automatic ? null : (cardRenderOptions?.startPositionLayout ?? null)
  );
  const shared = getViewerStudioSurfaces();
  const owner = {};
  function cardDestination(node: HTMLElement) {
    return {
      destroy: shared?.requestCard(owner, node, () => ({
        sequence,
        handLabeling,
        qrSequence,
        highlightedStepIndex,
        options: cardRenderOptions,
        automatic,
      })),
    };
  }
</script>

<div class="choreo-layer" use:cardDestination data-studio-card-destination>
  {#if !shared?.ownsCard(owner)}
    <ChoreoCard
      {sequence}
      {handLabeling}
      {qrSequence}
      {highlightedStepIndex}
      showHighlight
      darkMode={cardRenderOptions?.visibilityOverrides?.darkMode ?? true}
      showWord={cardRenderOptions?.addWord ?? true}
      showStepNumbers={cardRenderOptions?.addStepNumbers ?? true}
      showDifficultyLevel={cardRenderOptions?.addDifficultyLevel ?? true}
      includeStartPosition={cardRenderOptions?.includeStartPosition ?? true}
      showNotes={cardRenderOptions?.showNotes ?? false}
      showLoopGlyph={cardRenderOptions?.showLoopGlyph ?? true}
      showQRCode={cardRenderOptions?.visibilityOverrides?.showQRCode ?? false}
      showMandala={cardRenderOptions?.visibilityOverrides?.showMandala ?? false}
      handPathMode={cardRenderOptions?.visibilityOverrides?.handPathMode ??
        false}
      leftPropType={cardRenderOptions?.leftPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
      rightPropType={cardRenderOptions?.rightPropTypeOverride ??
        cardRenderOptions?.propTypeOverride}
      {columnCount}
      {startPositionLayoutOverride}
      forceContain
      fitWidth
    />
  {/if}
</div>

<style>
  .choreo-layer {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #08080c;
  }
</style>
