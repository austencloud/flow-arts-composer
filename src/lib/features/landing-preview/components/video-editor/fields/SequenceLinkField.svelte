<script lang="ts">
  /**
   * SequenceLinkField
   *
   * Inline sequence linking UI - no dropdowns, just tappable cards.
   * Auto-links exact matches, shows candidates for selection otherwise.
   */
  import LinkedSequenceChip from "../../LinkedSequenceChip.svelte";
  import type { MatchedSequence, LinkedSequence } from "../../../types";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

  interface Props {
    linkedSequences: LinkedSequence[];
    matchedSequences: MatchedSequence[];
    searchQuery: string;
    searching: boolean;
    maxLinks: number;
    canAddMore: boolean;
    showSection: boolean;
    hasCategory: boolean;
    disabled?: boolean;
    onSearch: (query: string) => void;
    onLink: (sequence: MatchedSequence) => void;
    onUnlink: (sequenceId: string) => void;
  }

  let {
    linkedSequences,
    matchedSequences,
    searchQuery,
    searching,
    maxLinks,
    canAddMore,
    showSection,
    hasCategory,
    disabled = false,
    onSearch,
    onLink,
    onUnlink,
  }: Props = $props();

  // Show suggestion preview when we have matches but no category selected yet
  const hasSuggestion = $derived(
    !hasCategory && matchedSequences.length > 0 && linkedSequences.length === 0
  );
  const bestMatch = $derived(matchedSequences[0]);

  // For inline selection, show top 3 matches max
  const topMatches = $derived(matchedSequences.slice(0, 3));

  // Is the best match an exact match with the video title?
  const hasExactMatch = $derived(
    bestMatch && searchQuery && stripWordNotation(bestMatch.word).toUpperCase() === searchQuery.toUpperCase()
  );

  let showManualSearch = $state(false);
  let manualQuery = $state("");

  function handleManualSearch() {
    if (manualQuery.trim()) {
      onSearch(manualQuery.trim());
    }
  }

  function openManualSearch() {
    showManualSearch = true;
    manualQuery = "";
  }

  function closeManualSearch() {
    showManualSearch = false;
    manualQuery = "";
  }
</script>

<!-- Show suggested match even before category selection -->
{#if hasSuggestion && bestMatch}
  <div class="field">
    <div class="field-header">
      <span class="field-label">Suggested Sequence</span>
      {#if matchedSequences.length > 1}
        <span class="field-hint">+{matchedSequences.length - 1} more</span>
      {/if}
    </div>
    <div class="suggestion-preview">
      <div class="suggestion-content">
        {#if bestMatch.thumbnail}
          <img src={bestMatch.thumbnail} alt="" class="suggestion-thumb" />
        {:else}
          <div class="suggestion-thumb-placeholder">
            <i class="fas fa-layer-group" aria-hidden="true"></i>
          </div>
        {/if}
        <div class="suggestion-info">
          <span class="suggestion-word">{bestMatch.word}</span>
          <span class="suggestion-owner">by {bestMatch.ownerName}</span>
        </div>
        <i class="fas fa-link suggestion-icon" aria-hidden="true"></i>
      </div>
      <p class="suggestion-hint">Select a category to link this sequence</p>
    </div>
  </div>
<!-- Don't show the redundant "select category" hint when we already have a suggestion -->
{:else if !hasCategory && !hasSuggestion}
  <div class="field">
    <p class="field-hint-block">
      Select a category to link sequences
    </p>
  </div>
{/if}

{#if showSection}
  <div class="field sequence-field">
    <div class="field-header">
      <span class="field-label">Sequence</span>
      {#if maxLinks === 1}
        <span class="field-hint">1 max</span>
      {/if}
    </div>

    <!-- Already linked sequences -->
    {#if linkedSequences.length > 0}
      <div class="linked-sequences">
        {#each linkedSequences as seq (seq.id)}
          <LinkedSequenceChip
            sequence={seq}
            onRemove={() => onUnlink(seq.id)}
            {disabled}
          />
        {/each}
      </div>
    {/if}

    <!-- Inline candidate cards (no dropdown) -->
    {#if canAddMore && !showManualSearch}
      {#if searching}
        <div class="searching-indicator">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>Searching...</span>
        </div>
      {:else if topMatches.length > 0}
        <div class="candidate-cards">
          {#each topMatches as seq, i (seq.id)}
            <button
              type="button"
              class="candidate-card"
              class:exact={i === 0 && hasExactMatch}
              onclick={() => onLink(seq)}
              {disabled}
            >
              {#if seq.thumbnail}
                <img src={seq.thumbnail} alt="" class="candidate-thumb" />
              {:else}
                <div class="candidate-thumb-placeholder">
                  <i class="fas fa-layer-group" aria-hidden="true"></i>
                </div>
              {/if}
              <div class="candidate-info">
                <span class="candidate-word"><TKAWordGlyph word={seq.word} height={13} /></span>
                <span class="candidate-owner">by {seq.ownerName}</span>
              </div>
              <kbd class="candidate-key">{i + 1}</kbd>
            </button>
          {/each}
        </div>
        <button type="button" class="search-different-btn" onclick={openManualSearch}>
          <i class="fas fa-search" aria-hidden="true"></i>
          Search different
        </button>
      {:else}
        <p class="no-matches-hint">No matching sequence found</p>
        <button type="button" class="search-different-btn" onclick={openManualSearch}>
          <i class="fas fa-search" aria-hidden="true"></i>
          Search manually
        </button>
      {/if}
    {/if}

    <!-- Manual search mode -->
    {#if showManualSearch}
      <div class="manual-search">
        <div class="manual-search-input-row">
          <input
            type="text"
            class="manual-search-input"
            bind:value={manualQuery}
            placeholder="Type sequence word..."
            onkeydown={(e) => e.key === "Enter" && handleManualSearch()}
            {disabled}
          />
          <button type="button" class="manual-search-go" onclick={handleManualSearch} {disabled} aria-label="Search sequence">
            <i class="fas fa-search" aria-hidden="true"></i>
          </button>
          <button type="button" class="manual-search-cancel" onclick={closeManualSearch} aria-label="Cancel search">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    {/if}
  </div>
{:else if hasCategory}
  <div class="field">
    <p class="field-hint-block">
      Linking not available for this category
    </p>
  </div>
{/if}

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .field-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
  }

  .field-hint {
    font-size: 11px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.25));
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  .field-hint-block {
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    margin: 0;
    text-align: center;
    padding: 12px 0;
  }

  .linked-sequences {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* Suggestion preview (before category selection) - neutral/pending style */
  .suggestion-preview {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
    border-radius: 10px;
    padding: 12px;
  }

  .suggestion-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .suggestion-thumb,
  .suggestion-thumb-placeholder {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .suggestion-thumb {
    object-fit: cover;
  }

  .suggestion-thumb-placeholder {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: 16px;
  }

  .suggestion-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .suggestion-word {
    font-weight: 600;
    font-size: 15px;
    color: var(--theme-text, white);
  }

  .suggestion-owner {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .suggestion-icon {
    color: var(--theme-accent, #6366f1);
    font-size: 16px;
    flex-shrink: 0;
  }

  .suggestion-hint {
    margin: 8px 0 0 0;
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    text-align: center;
  }

  /* Inline candidate cards */
  .candidate-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .candidate-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .candidate-card:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 12%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
  }

  .candidate-card.exact {
    background: color-mix(in srgb, var(--semantic-success, #10b981) 10%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success, #10b981) 40%, transparent);
  }

  .candidate-card.exact:hover:not(:disabled) {
    background: color-mix(in srgb, var(--semantic-success, #10b981) 18%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success, #10b981) 60%, transparent);
  }

  .candidate-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .candidate-thumb,
  .candidate-thumb-placeholder {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .candidate-thumb {
    object-fit: cover;
  }

  .candidate-thumb-placeholder {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: 14px;
  }

  .candidate-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .candidate-word {
    font-weight: 600;
    font-size: 14px;
    color: var(--theme-text, white);
  }

  .candidate-owner {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .candidate-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    font-size: 12px;
    font-family: inherit;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    flex-shrink: 0;
  }

  /* Search different button */
  .search-different-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    margin-top: 8px;
    background: transparent;
    border: 1px dashed var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
    width: 100%;
  }

  .search-different-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: var(--theme-text, rgba(255, 255, 255, 0.7));
  }

  .no-matches-hint {
    margin: 0;
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    text-align: center;
    padding: 8px 0;
  }

  .searching-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 16px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: 13px;
  }

  /* Manual search mode */
  .manual-search {
    margin-top: 4px;
  }

  .manual-search-input-row {
    display: flex;
    gap: 6px;
  }

  .manual-search-input {
    flex: 1;
    height: 38px;
    padding: 0 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: 14px;
  }

  .manual-search-input:focus {
    outline: none;
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
  }

  .manual-search-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .manual-search-go,
  .manual-search-cancel {
    width: 38px;
    height: 38px;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    transition: all 0.15s;
  }

  .manual-search-go {
    background: var(--theme-accent, #6366f1);
    color: white;
  }

  .manual-search-go:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 80%, white);
  }

  .manual-search-cancel {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .manual-search-cancel:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, white);
  }
</style>
