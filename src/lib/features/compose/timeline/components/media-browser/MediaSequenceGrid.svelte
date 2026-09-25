<!--
  MediaSequenceGrid.svelte - Grid display of sequences with infinite scroll
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import MediaSequenceCard from "./MediaSequenceCard.svelte";

  interface Props {
    sequences: SequenceData[];
    isLoading: boolean;
    error: string | null;
    hasMore: boolean;
    hasActiveFilter: boolean;
    loadingSequenceId: string | null;
    getThumbnailUrl: (seq: SequenceData) => string | undefined;
    onSequenceClick: (seq: SequenceData) => void;
    onDragStart: (e: DragEvent, seq: SequenceData) => void;
    onLoadMore: () => void;
    onRetry: () => void;
    onClearFilters: () => void;
  }

  let {
    sequences,
    isLoading,
    error,
    hasMore,
    hasActiveFilter,
    loadingSequenceId,
    getThumbnailUrl,
    onSequenceClick,
    onDragStart,
    onLoadMore,
    onRetry,
    onClearFilters,
  }: Props = $props();

  function handleScroll(e: Event) {
    const target = e.target as HTMLElement;
    const scrolledToBottom =
      target.scrollHeight - target.scrollTop <= target.clientHeight + 200;
    if (scrolledToBottom && hasMore && !isLoading) {
      onLoadMore();
    }
  }
</script>

<div class="sequence-list" onscroll={handleScroll}>
  {#if isLoading && sequences.length === 0}
    <div class="state-message">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
      <span>Loading sequences...</span>
    </div>
  {:else if error}
    <div class="state-message error">
      <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
      <span>{error}</span>
      <button onclick={onRetry}>{t("action_retry")}</button>
    </div>
  {:else if sequences.length === 0}
    <div class="state-message">
      <i class="fas fa-search" aria-hidden="true"></i>
      <span>{t("browse_no_sequences_found")}</span>
      {#if hasActiveFilter}
        <button onclick={onClearFilters}>Clear filters</button>
      {/if}
    </div>
  {:else}
    {#each sequences as sequence (sequence.id)}
      <MediaSequenceCard
        {sequence}
        coverUrl={getThumbnailUrl(sequence)}
        isLoading={loadingSequenceId === sequence.id}
        disabled={!!loadingSequenceId}
        onclick={() => onSequenceClick(sequence)}
        ondragstart={(e) => onDragStart(e, sequence)}
      />
    {/each}

    {#if hasMore}
      <div class="load-more-indicator">
        <ProgressRing percent={-1} size={24} strokeWidth={2} />
        <span>Scroll for more...</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .sequence-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    align-content: start;
  }

  /* Custom scrollbar */
  .sequence-list::-webkit-scrollbar {
    width: 12px;
  }

  .sequence-list::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-left: 1px solid var(--theme-stroke);
  }

  .sequence-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border: 3px solid var(--scrollbar-track);
    border-radius: 6px;
    transition: all var(--duration-normal) ease;
  }

  .sequence-list::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-accent-hover);
    border-color: var(--scrollbar-track);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .sequence-list::-webkit-scrollbar-thumb:active {
    background: var(--scrollbar-accent);
  }

  /* Firefox scrollbar */
  .sequence-list {
    scrollbar-width: auto;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  /* State messages */
  .state-message {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 48px 24px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min);
  }

  .state-message i {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
    color: var(--theme-accent);
  }

  .state-message button {
    padding: 8px 16px;
    border-radius: 12px;
    border: 1px solid var(--theme-accent);
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    color: var(--theme-accent);
    cursor: pointer;
    font-size: var(--font-size-compact);
    font-weight: 500;
    transition: all var(--duration-normal) ease;
  }

  .state-message button:hover {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    border-color: var(--theme-accent);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--theme-accent) 30%, transparent);
    transform: translateY(-1px);
  }

  .load-more-indicator {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
  }
</style>
