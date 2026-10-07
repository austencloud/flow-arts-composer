<!--
  ArenaMatchupPanel.svelte - One side of a matchup

  Displays an auto-playing animation with sequence metadata.
  Clickable to cast a vote for this entry.
  Dispatches based on ArenaEntry.kind (sequence today, composition later).
-->
<script lang="ts">
  import type { ArenaEntry, ArenaRating } from "../../domain/models/arena-models";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropLook } from "$lib/shared/pictograph/prop/domain/prop-look";
  import InlineAnimationPlayer from "$lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";

  let {
    entry,
    rating,
    data,
    side,
    voteResult,
    disabled = false,
    onvote,
    propType = null,
    propLook,
    bpm = null,
  }: {
    entry: ArenaEntry;
    rating: ArenaRating;
    data: SequenceData;
    side: "left" | "right";
    voteResult: "left" | "right" | null;
    disabled: boolean;
    onvote: () => void;
    propType?: string | null;
    propLook?: PropLook;
    bpm?: number | null;
  } = $props();

  const isWinner = $derived(voteResult === side);
  const isLoser = $derived(voteResult !== null && voteResult !== side);

  function handleClick() {
    if (disabled || voteResult !== null) return;
    onvote();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }
</script>

<div
  class="matchup-panel"
  class:winner={isWinner}
  class:loser={isLoser}
  class:disabled
  role="button"
  tabindex={disabled ? -1 : 0}
  aria-label={t('arena_battle_vote_for', { word: entry.word })}
  aria-disabled={disabled}
  onclick={handleClick}
  onkeydown={handleKeydown}
>
  <div class="animation-container">
    {#if entry.kind === "sequence"}
      <InlineAnimationPlayer sequence={data} autoPlay={true} showControls={false} leftPropType={propType} rightPropType={propType} {propLook} externalBpm={bpm} />
    {/if}
  </div>

  <div class="sequence-meta">
    <span class="word-label">{entry.word}</span>
    {#if entry.ownerDisplayName}
      <span class="author-label">{t('arena_by_creator', { name: entry.ownerDisplayName })}</span>
    {/if}
    <span class="step-count">{t('arena_label_beats', { count: data.steps?.length || data.sequenceLength || 0 })}</span>
  </div>
</div>

<style>
  .matchup-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 0.2s ease, opacity 0.3s ease, transform 0.3s ease;
    min-height: 200px;
  }

  .matchup-panel:hover:not(.disabled):not(.loser) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .matchup-panel:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .matchup-panel.winner {
    border-color: var(--theme-accent, #6366f1);
    transform: scale(1.02);
  }

  .matchup-panel.loser {
    opacity: 0.4;
    cursor: default;
  }

  .matchup-panel.disabled {
    cursor: default;
    pointer-events: none;
  }

  .animation-container {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  .sequence-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    flex-wrap: wrap;
  }

  .word-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    letter-spacing: 1px;
  }

  .author-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .step-count {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin-left: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .matchup-panel {
      transition: opacity 0.1s ease;
    }

    .matchup-panel.winner {
      transform: none;
    }
  }
</style>
