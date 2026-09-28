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
  }: {
    sequenceState: SequenceState;
    word: string;
    letterSources?: LetterSource[] | null;
    activeStepNumber?: number | null;
    /** False when the word lives in the compact bottom rail. The badges then
        float over the picture area's top corners instead of taking a row. */
    showTitle?: boolean;
  } = $props();

  const sequence = $derived(sequenceState.currentSequence);
  const loop = $derived(
    sequence && sequence.steps.length >= 2
      ? loopDetector.detectLOOPType(sequence)
      : null
  );
</script>

<!-- This header belongs to the sequence, so it survives card/player swaps. -->
<div class="workspace-sequence-header" class:badges-only={!showTitle}>
  {#if showTitle}
    <div class="title-row">
      <div class="word-label-slot">
        <WordLabel
          {word}
          scrollMode={false}
          {letterSources}
          {activeStepNumber}
          historyTransitionEpoch={sequenceState.animationState
            .historyTransitionEpoch}
          historyWordChanged={sequenceState.animationState.historyTransition
            ?.wordChanged ?? false}
        />
      </div>
    </div>
  {/if}
  <SequenceMetadataRail
    {sequence}
    loopType={loop?.loopType ?? null}
    period={loop?.period ?? null}
    presentation="corners"
  />
</div>

<style>
  .workspace-sequence-header {
    container-type: inline-size;
    flex: 0 0 auto;
    padding: 8px 12px 0;
  }

  .workspace-sequence-header.badges-only {
    position: absolute;
    top: 6px;
    left: 8px;
    right: 8px;
    z-index: 2;
    padding: 0;
    pointer-events: none;
  }

  .workspace-sequence-header.badges-only :global(.visible) {
    pointer-events: auto;
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

  @container (min-width: 744px) {
    .title-row {
      --workspace-leading-actions-width: 192px;
    }
  }

  @container (max-width: 376px) {
    .word-label-slot :global(.word-label.has-word) {
      padding-inline: 0.5rem;
      font-size: 1rem;
    }
  }
</style>
