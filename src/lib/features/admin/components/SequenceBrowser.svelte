<script lang="ts">
  /**
   * Sequence Browser
   *
   * Browse and select user sequences for challenges
   */

  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

  // Props
  let {
    sequences,
    selectedSequence,
    onSequenceSelect,
  }: {
    sequences: SequenceData[];
    selectedSequence: SequenceData | null;
    onSequenceSelect: (sequence: SequenceData) => void;
  } = $props();

  // State
  let searchQuery = $state("");

  // Filtered sequences
  const filteredSequences = $derived.by(() => {
    if (!searchQuery) return sequences;

    const query = searchQuery.toLowerCase();
    return sequences.filter(
      (seq) =>
        seq.name.toLowerCase().includes(query) ||
        stripWordNotation(seq.word).toLowerCase().includes(query)
    );
  });
</script>

<div class="sequence-browser">
  <div class="browser-header">
    <div class="search-box">
      <i class="fas fa-search" aria-hidden="true"></i>
      <input
        type="text"
        placeholder="Search sequences..."
        bind:value={searchQuery}
      />
    </div>
    <div class="sequence-count">
      {filteredSequences.length} sequence{filteredSequences.length !== 1
        ? "s"
        : ""}
    </div>
  </div>

  <div class="sequence-list">
    {#if filteredSequences.length === 0}
      <div class="empty-state">
        <i class="fas fa-inbox" aria-hidden="true"></i>
        <p>No sequences found</p>
        {#if searchQuery}
          <button class="clear-search" onclick={() => (searchQuery = "")}>
            Clear search
          </button>
        {/if}
      </div>
    {:else}
      {#each filteredSequences as sequence (sequence.id)}
        <button
          class="sequence-list-item"
          class:selected={selectedSequence?.id === sequence.id}
          onclick={() => onSequenceSelect(sequence)}
        >
          <div class="sequence-header">
            <h4 class="sequence-name">{sequence.name}</h4>
            {#if selectedSequence?.id === sequence.id}
              <i class="fas fa-check-circle selected-icon" aria-hidden="true"
              ></i>
            {/if}
          </div>

          {#if sequence.word}
            <p class="sequence-description">Word: {sequence.word}</p>
          {/if}

          <div class="sequence-meta">
            <span class="meta-item">
              <i class="fas fa-layer-group" aria-hidden="true"></i>
              {sequence.steps?.length || 0} steps
            </span>
            {#if sequence.dateAdded}
              <span class="meta-item">
                <i class="fas fa-clock" aria-hidden="true"></i>
                {new Date(sequence.dateAdded).toLocaleDateString()}
              </span>
            {/if}
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .sequence-browser {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .browser-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .search-box {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    padding: 0.75rem 1rem;
  }

  .search-box i {
    opacity: 0.5;
  }

  .search-box input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-color, #ffffff);
    font-size: 1rem;
  }

  .search-box input::placeholder {
    color: rgba(255, 255, 255, 0.75); /* WCAG AAA */
  }

  .sequence-count {
    font-size: 0.9rem;
    opacity: 0.6;
    white-space: nowrap;
  }

  .sequence-list {
    max-height: 400px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.5rem;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem;
    gap: 1rem;
    opacity: 0.5;
  }

  .empty-state i {
    font-size: 3rem;
  }

  .empty-state p {
    margin: 0;
    font-size: 1.1rem;
  }

  .clear-search {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 0.5rem 1rem;
    color: var(--text-color, #ffffff);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .clear-search:hover {
    background: rgba(255, 255, 255, 0.15);
  }

  .sequence-list-item {
    background: var(--theme-card-bg);
    border: 2px solid var(--theme-stroke);
    border-radius: 8px;
    padding: 1rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    text-align: left;
    color: var(--text-color, #ffffff);
  }

  .sequence-list-item:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.75); /* WCAG AAA */
    transform: translateX(4px);
  }

  .sequence-list-item.selected {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
  }

  .sequence-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .sequence-name {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .selected-icon {
    color: #4ade80;
    font-size: 1.3rem;
  }

  .sequence-description {
    margin: 0 0 0.75rem 0;
    font-size: 0.9rem;
    opacity: 0.8;
    line-height: 1.4;
  }

  .sequence-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    opacity: 0.6;
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* Scrollbar styling */
  .sequence-list::-webkit-scrollbar {
    width: 8px;
  }

  .sequence-list::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: 4px;
  }

  .sequence-list::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
  }

  .sequence-list::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  /* Mobile responsive */
  @media (max-width: 768px) {
    .browser-header {
      flex-direction: column;
      align-items: stretch;
    }

    .sequence-list {
      max-height: 300px;
    }

    .sequence-list-item {
      padding: 0.75rem;
    }
  }
</style>
