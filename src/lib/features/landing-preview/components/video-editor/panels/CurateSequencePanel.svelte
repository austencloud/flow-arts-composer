<script lang="ts">
  /**
   * CurateSequencePanel
   *
   * Left panel for curate mode - sequence/word selection with larger thumbnails.
   */
  import { onDestroy } from "svelte";
  import LinkedSequenceChip from "../../LinkedSequenceChip.svelte";
  import type { VideoEditorController } from "../../../state/video-editor-controller.svelte";
  import type { ShowcaseVideo, MatchedSequence } from "../../../types";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

  interface Props {
    video: ShowcaseVideo;
    controller: VideoEditorController;
  }

  let { video, controller }: Props = $props();

  // Editable title state
  let isEditingTitle = $state(false);
  let editedTitle = $state("");
  let titleInputEl: HTMLInputElement | undefined = $state();

  // Title suggestions state
  let titleSuggestions = $state<MatchedSequence[]>([]);
  let titleSearching = $state(false);
  let showTitleSuggestions = $state(false);
  let highlightedIndex = $state(-1);
  let hasNavigatedSuggestions = $state(false); // Track if user used arrow keys
  let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let suggestionClicked = $state(false);

  // Greek letter substitution map
  const greekMap: Record<string, string> = {
    sig: "Σ", del: "Δ", the: "Θ", ome: "Ω",
    phi: "Φ", psi: "Ψ", lam: "Λ",
    alp: "α", bet: "β", gam: "γ",
  };
  const greekPattern = /(sig|del|the|ome|phi|psi|lam|alp|bet|gam)(-?)/gi;

  function substituteGreekLetters(text: string): string {
    return text.replace(greekPattern, (_, prefix, dash) => {
      const greek = greekMap[prefix.toLowerCase()];
      return greek ? greek + dash : prefix + dash;
    });
  }

  function startEditingTitle() {
    editedTitle = video.title || "";
    isEditingTitle = true;
    titleSuggestions = [];
    showTitleSuggestions = false;
    highlightedIndex = -1;
    hasNavigatedSuggestions = false;
    requestAnimationFrame(() => titleInputEl?.focus());
  }

  async function searchTitleSuggestions(query: string) {
    if (query.length < 2) {
      titleSuggestions = [];
      showTitleSuggestions = false;
      return;
    }

    titleSearching = true;
    try {
      const results = await controller.searchSequencesForTitle(query);
      titleSuggestions = results.slice(0, 5);
      showTitleSuggestions = titleSuggestions.length > 0;
      // Don't auto-highlight - user must arrow-navigate to select
      highlightedIndex = -1;
      hasNavigatedSuggestions = false;
    } finally {
      titleSearching = false;
    }
  }

  function handleTitleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const substituted = substituteGreekLetters(input.value);
    if (substituted !== input.value) {
      input.value = substituted;
    }
    editedTitle = substituted;

    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchTitleSuggestions(substituted);
    }, 200);
  }

  function selectSuggestion(seq: MatchedSequence) {
    suggestionClicked = true;
    editedTitle = seq.word;
    controller.updateTitle(seq.word);
    isEditingTitle = false;
    showTitleSuggestions = false;
    titleSuggestions = [];
    requestAnimationFrame(() => {
      suggestionClicked = false;
    });
  }

  function saveTitle() {
    controller.updateTitle(editedTitle);
    isEditingTitle = false;
    showTitleSuggestions = false;
    titleSuggestions = [];
  }

  function cancelEditTitle() {
    isEditingTitle = false;
    showTitleSuggestions = false;
    titleSuggestions = [];
  }

  function handleTitleKeydown(e: KeyboardEvent) {
    if (showTitleSuggestions && titleSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        hasNavigatedSuggestions = true;
        highlightedIndex = (highlightedIndex + 1) % titleSuggestions.length;
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        hasNavigatedSuggestions = true;
        highlightedIndex = highlightedIndex < 0 ? titleSuggestions.length - 1 : (highlightedIndex - 1 + titleSuggestions.length) % titleSuggestions.length;
        return;
      } else if (e.key === "Enter" && hasNavigatedSuggestions && highlightedIndex >= 0) {
        // Only select suggestion if user explicitly navigated with arrow keys
        e.preventDefault();
        const suggestion = titleSuggestions[highlightedIndex];
        if (suggestion) {
          selectSuggestion(suggestion);
        }
        return;
      }
    }

    if (e.key === "Enter") {
      // Save what was typed (don't pick a suggestion)
      e.preventDefault();
      saveTitle();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEditTitle();
    }
  }

  // Cancel a pending debounced suggestion search if the panel unmounts.
  onDestroy(() => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = null;
    }
  });

  function handleTitleBlur() {
    const titleToSave = editedTitle;
    setTimeout(() => {
      if (suggestionClicked) return;
      controller.updateTitle(titleToSave);
      isEditingTitle = false;
      showTitleSuggestions = false;
      titleSuggestions = [];
    }, 10);
  }

  const matchedSequences = $derived(controller.matchedSequences);
  const linkedSequences = $derived(video.linkedSequences);

  // For inline candidate cards
  const topMatches = $derived(matchedSequences.slice(0, 5));
  const hasExactMatch = $derived(
    topMatches.length > 0 &&
    video.title &&
    stripWordNotation(topMatches[0]?.word ?? "").toUpperCase() === video.title.toUpperCase()
  );
</script>

<div class="sequence-panel">
  <h3 class="panel-title">Sequence</h3>

  <!-- Editable Title -->
  <div class="title-section">
    <span class="field-label">Word</span>
    {#if isEditingTitle}
      <div class="title-edit-wrapper">
        <input
          type="text"
          class="title-input"
          bind:this={titleInputEl}
          value={editedTitle}
          oninput={handleTitleInput}
          onkeydown={handleTitleKeydown}
          onblur={handleTitleBlur}
          placeholder="Enter TKA word..."
        />
        {#if titleSearching}
          <i class="fas fa-spinner fa-spin title-loading" aria-hidden="true"></i>
        {/if}
        {#if showTitleSuggestions && titleSuggestions.length > 0}
          <div class="title-suggestions" role="listbox">
            {#each titleSuggestions as seq, i (seq.id)}
              {@const isExactMatch = stripWordNotation(seq.word).toUpperCase() === editedTitle.toUpperCase()}
              <button
                type="button"
                class="title-suggestion"
                class:highlighted={i === highlightedIndex}
                class:exact={isExactMatch}
                role="option"
                aria-selected={i === highlightedIndex}
                tabindex="-1"
                onmousedown={() => selectSuggestion(seq)}
              >
                {#if seq.thumbnail}
                  <img src={seq.thumbnail} alt="" class="suggestion-thumb" />
                {:else}
                  <div class="suggestion-thumb-placeholder">
                    <i class="fas fa-layer-group" aria-hidden="true"></i>
                  </div>
                {/if}
                <div class="suggestion-info">
                  <span class="suggestion-word"><TKAWordGlyph word={seq.word} height={13} /></span>
                  <span class="suggestion-owner">by {seq.ownerName}</span>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <button type="button" class="title-display" onclick={startEditingTitle} title="Click to edit">
        <span class="title-text">{video.title || "Click to set word"}</span>
        <i class="fas fa-pencil-alt edit-hint" aria-hidden="true"></i>
      </button>
    {/if}
  </div>

  <!-- Linked Sequences (optional) -->
  <div class="link-section">
    <div class="field-header">
      <span class="field-label">Link to Sequence</span>
      <span class="field-hint">optional</span>
    </div>

    {#if linkedSequences.length > 0}
      <div class="linked-sequences">
        {#each linkedSequences as seq (seq.id)}
          <LinkedSequenceChip
            sequence={seq}
            onRemove={() => controller.unlinkSequence(seq.id)}
            disabled={controller.saving}
          />
        {/each}
      </div>
    {:else if topMatches.length > 0}
      <div class="candidate-cards">
        {#each topMatches as seq, i (seq.id)}
          {@const isExact = i === 0 && hasExactMatch}
          <button
            type="button"
            class="candidate-card"
            class:exact={isExact}
            onclick={() => controller.linkSequence(seq)}
            disabled={controller.saving}
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
    {:else if video.title}
      <p class="no-matches">No sequences found for "{video.title}"</p>
    {:else}
      <p class="no-matches">Set a word to see matching sequences</p>
    {/if}
  </div>
</div>

<style>
  .sequence-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .panel-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .title-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .field-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
  }

  .field-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .field-hint {
    font-size: 11px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.25));
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }

  .title-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .title-display:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .title-text {
    font-size: 18px;
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .title-display .edit-hint {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    opacity: 0;
    transition: opacity 0.15s;
  }

  .title-display:hover .edit-hint {
    opacity: 1;
  }

  .title-edit-wrapper {
    position: relative;
  }

  .title-input {
    width: 100%;
    font-size: 18px;
    font-weight: 600;
    color: var(--theme-text, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 2px solid var(--theme-accent, #6366f1);
    border-radius: 10px;
    padding: 12px 16px;
    outline: none;
  }

  .title-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    font-weight: 400;
  }

  .title-loading {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: 14px;
  }

  .title-suggestions {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    overflow: hidden;
    z-index: 100;
    max-height: 320px;
    overflow-y: auto;
  }

  .title-suggestion {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 14px;
    background: transparent;
    border: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    cursor: pointer;
    transition: all 0.1s;
    text-align: left;
  }

  .title-suggestion:last-child {
    border-bottom: none;
  }

  .title-suggestion:hover,
  .title-suggestion.highlighted {
    background: rgba(99, 102, 241, 0.15);
  }

  .title-suggestion.exact {
    /* Exact match uses accent/purple - NOT green (green = already linked) */
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent);
    border-left: 3px solid var(--theme-accent, #6366f1);
  }

  .title-suggestion.exact:hover,
  .title-suggestion.exact.highlighted {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 25%, transparent);
  }

  .suggestion-thumb,
  .suggestion-thumb-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .suggestion-thumb {
    object-fit: cover;
  }

  .suggestion-thumb-placeholder {
    background: rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.4);
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

  /* Link section */
  .link-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .linked-sequences {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .candidate-cards {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .candidate-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .candidate-card:hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.12);
    border-color: rgba(99, 102, 241, 0.4);
  }

  .candidate-card.exact {
    /* Exact match uses accent/purple - NOT green (green = already linked) */
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
  }

  .candidate-card.exact:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 25%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 70%, transparent);
  }

  .candidate-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .candidate-thumb,
  .candidate-thumb-placeholder {
    width: 56px;
    height: 56px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  .candidate-thumb {
    object-fit: cover;
  }

  .candidate-thumb-placeholder {
    background: rgba(255, 255, 255, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.4);
    font-size: 18px;
  }

  .candidate-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .candidate-word {
    font-weight: 600;
    font-size: 15px;
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
    min-width: 26px;
    height: 26px;
    padding: 0 8px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    font-size: 13px;
    font-family: inherit;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    flex-shrink: 0;
  }

  .no-matches {
    margin: 0;
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    text-align: center;
    padding: 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border-radius: 8px;
  }
</style>
