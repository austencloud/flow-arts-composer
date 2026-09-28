<script lang="ts">
  import type { SequenceState } from "../../../state/sequence-state-orchestrator.svelte";
  import type { LetterSource } from "$lib/shared/create/domain/spell-models";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import WordLabel from "./WordLabel.svelte";
  import SequenceMetadataRail from "./SequenceMetadataRail.svelte";

  let {
    sequenceState,
    word,
    letterSources = null,
    activeStepNumber = null,
    showTitle = true,
    quietBadges = false,
  }: {
    sequenceState: SequenceState;
    word: string;
    letterSources?: LetterSource[] | null;
    activeStepNumber?: number | null;
    /** False folds the word into one thin strip between the corner badges,
        giving the height of a full title row back to the pictures. */
    showTitle?: boolean;
    /** Gray corner badges, so the colored pictures stay the focal point. */
    quietBadges?: boolean;
  } = $props();

  const sequence = $derived(sequenceState.currentSequence);
  const loop = $derived(
    sequence && sequence.steps.length >= 2
      ? loopDetector.detectLOOPType(sequence)
      : null
  );
</script>

{#snippet wordLabel()}
  <WordLabel
    {word}
    scrollMode={false}
    {letterSources}
    {activeStepNumber}
    historyTransitionEpoch={sequenceState.animationState.historyTransitionEpoch}
    historyWordChanged={sequenceState.animationState.historyTransition
      ?.wordChanged ?? false}
  />
{/snippet}

<!-- This header belongs to the sequence, so it survives card/player swaps. -->
<div
  class="workspace-sequence-header"
  class:strip={!showTitle}
  class:quiet-badges={quietBadges}
>
  {#if showTitle}
    <div class="title-row">
      <div class="word-label-slot">
        {@render wordLabel()}
      </div>
    </div>
  {/if}
  <SequenceMetadataRail
    {sequence}
    loopType={loop?.loopType ?? null}
    period={loop?.period ?? null}
    presentation="corners"
  />
  {#if !showTitle}
    <div class="word-label-slot strip-word">
      {@render wordLabel()}
    </div>
  {/if}
</div>

<style>
  .workspace-sequence-header {
    container-type: inline-size;
    flex: 0 0 auto;
    padding: 8px 12px 0;
  }

  /* One thin row: badges in the corners, the word centered between them.
     Both share a single grid cell so the word centers on the full width. */
  .workspace-sequence-header.strip {
    --strip-side-reserve: 72px;
    display: grid;
    grid-template: "strip" 30px / minmax(0, 1fr);
    align-items: center;
    padding: 4px 10px 0;
  }

  .workspace-sequence-header.strip :global(.metadata-rail) {
    grid-area: strip;
  }

  .workspace-sequence-header.quiet-badges :global(.metadata-rail) {
    filter: grayscale(1);
    opacity: 0.82;
  }

  .title-row {
    display: grid;
    grid-template-columns:
      var(--workspace-leading-actions-width, 92px)
      minmax(0, 1fr)
      var(--workspace-leading-actions-width, 92px);
    align-items: center;
    gap: var(--settings-spacing-sm, 8px);
    min-height: var(--min-touch-target, 44px);
    margin-bottom: 4px;
  }

  .word-label-slot {
    grid-column: 2;
    justify-self: center;
    width: min(100%, 20rem);
    min-width: 0;
    overflow: hidden;
  }

  .word-label-slot.strip-word {
    grid-area: strip;
    width: min(100% - 2 * var(--strip-side-reserve), 16rem);
  }

  /* A plain word, not a chip: the chevron alone says it opens a menu. */
  .strip-word :global(.word-label.has-word) {
    min-height: 30px;
    padding: 0 0.6rem;
    border-color: transparent;
    background: transparent;
    font-size: 1.1rem;
  }

  @container (min-width: 744px) {
    .title-row {
      --workspace-leading-actions-width: 192px;
    }
  }

  @container (max-width: 376px) {
    .title-row .word-label-slot :global(.word-label.has-word) {
      padding-inline: 0.5rem;
      font-size: 1rem;
    }
  }
</style>
