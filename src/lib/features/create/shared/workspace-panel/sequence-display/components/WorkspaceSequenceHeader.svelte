<script lang="ts">
  import type { SequenceState } from "../../../state/sequence-state-orchestrator.svelte";
  import type { LetterSource } from "#lib/shared/create/domain/spell-models.js";
  import { loopDetector } from "#lib/features/create/generate/circular/services/loop-detector.js";
  import WordLabel from "./WordLabel.svelte";
  import SequenceMetadataRail from "./SequenceMetadataRail.svelte";

  let {
    sequenceState,
    word,
    letterSources = null,
    activeStepNumber = null,
    showTitle = true,
    quietBadges = false,
    onHeightChange,
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
    /** Reports the header's height, which the workspace split budgets for. */
    onHeightChange?: (height: number) => void;
  } = $props();

  let headerHeight = $state(0);
  $effect(() => {
    if (headerHeight > 0) onHeightChange?.(headerHeight);
  });

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

{#snippet metadataRail()}
  <SequenceMetadataRail
    {sequence}
    loopType={loop?.loopType ?? null}
    period={loop?.period ?? null}
    presentation="corners"
  />
{/snippet}

<!-- This header belongs to the sequence, so it survives card/player swaps.
     The title rides a PanelGroup compositor edge (data-panel-flip): when the
     workspace takes its end width at once, it travels to its new centre. -->
<div
  class="workspace-sequence-header"
  bind:offsetHeight={headerHeight}
  class:strip={!showTitle}
  class:quiet-badges={quietBadges}
>
  {#if showTitle}
    <!-- The badges' row sits under the title, or on a phone beside it in the
         title row (see .title-center below). -->
    <div class="title-row">
      <div class="title-center">
        <div class="word-label-slot" data-panel-flip="sequence-title">
          {@render wordLabel()}
        </div>
        {@render metadataRail()}
      </div>
    </div>
  {:else}
    {@render metadataRail()}
    <div class="word-label-slot strip-word" data-panel-flip="sequence-title">
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
    /* The title, then the badges' 20px row 4px under it. */
    grid-template-rows: minmax(var(--min-touch-target, 44px), auto) 20px;
    align-items: center;
    column-gap: var(--settings-spacing-sm, 8px);
    row-gap: 4px;
  }

  /* Wide: no box of its own; the word takes the middle column and the badges
     span the row beneath, corner to corner. */
  .title-center {
    display: contents;
  }

  .title-center > .word-label-slot {
    grid-row: 1;
  }

  .title-center > :global(.metadata-rail) {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  /* On a phone the badges' own row cost 24px of the step pictures' height.
     There the level badge stands left of the word and the LOOP strip right
     of it, in the middle column between Undo/Redo and Save, and the header
     is one 48px row (8px top padding and the 40px title row on Construct's
     phone tier). 476px of header content is a workspace about 500px wide,
     where Save already folds to its icon. */
  @container (max-width: 476px) {
    .title-row {
      grid-template-rows: minmax(var(--min-touch-target, 44px), auto);
      row-gap: 0;
    }

    .title-center {
      grid-column: 2;
      grid-row: 1;
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    /* A definite share of the row: the word's own size queries need it. */
    .title-center > .word-label-slot {
      flex: 1 1 0;
      width: auto;
    }

    /* The badges become this row's items, one each side of the word. Their
       slots keep the room they reserve while hidden, so the level badge
       arriving moves nothing. */
    .title-center > :global(.metadata-rail) {
      display: contents;
    }

    .title-center :global(.difficulty-slot) {
      order: -1;
    }

    .title-center :global(.loop-slot) {
      order: 1;
    }

    /* A box drawn as contents takes no filter, so quiet badges grey here. */
    .quiet-badges .title-center :global(.difficulty-slot.visible),
    .quiet-badges .title-center :global(.loop-slot.visible) {
      filter: grayscale(1);
      opacity: 0.82;
    }
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
