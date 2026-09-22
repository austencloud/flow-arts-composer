<script lang="ts">
  /**
   * CuratePanel
   *
   * Info panel content for curate mode - bulk curation with navigation.
   */
  import { onDestroy } from "svelte";
  import CategoryField from "../fields/CategoryField.svelte";
  import PerformerField from "../fields/PerformerField.svelte";
  import SequenceLinkField from "../fields/SequenceLinkField.svelte";
  import type { VideoEditorController } from "../../../state/video-editor-controller.svelte";
  import type { ShowcaseVideo, MatchedSequence } from "../../../types";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { stripWordNotation } from "$lib/shared/foundation/utils/word-notation";

  interface Props {
    video: ShowcaseVideo;
    controller: VideoEditorController;
    formatDate: (date: Date | null) => string;
  }

  let { video, controller, formatDate }: Props = $props();

  const hasCategory = $derived(!!video.category);
  const hasPerformers = $derived(video.performers.length > 0);
  const isComplete = $derived(hasCategory && hasPerformers);
  const uncuratedCount = $derived(controller.uncuratedVideos.length);
  const currentIndex = $derived(controller.currentIndex);
  const progressPercent = $derived(
    Math.round((controller.curationProgress.done / controller.stats.total) * 100)
  );

  // Editable title state
  let isEditingTitle = $state(false);
  let editedTitle = $state("");
  let titleInputEl: HTMLInputElement | undefined = $state();

  // Title suggestions state
  let titleSuggestions = $state<MatchedSequence[]>([]);
  let titleSearching = $state(false);
  let showTitleSuggestions = $state(false);
  let highlightedIndex = $state(-1);
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
      titleSuggestions = results.slice(0, 5); // Top 5 suggestions
      showTitleSuggestions = titleSuggestions.length > 0;
      highlightedIndex = titleSuggestions.length > 0 ? 0 : -1;
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

    // Debounced search for suggestions
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchTitleSuggestions(substituted);
    }, 200);
  }

  function selectSuggestion(seq: MatchedSequence) {
    suggestionClicked = true;

    // Update title to match the sequence word (but don't link the specific sequence)
    // Linking to specific sequences happens in a separate phase
    editedTitle = seq.word;
    controller.updateTitle(seq.word);

    // Close editor
    isEditingTitle = false;
    showTitleSuggestions = false;
    titleSuggestions = [];

    // Reset flag after a tick
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
        highlightedIndex = (highlightedIndex + 1) % titleSuggestions.length;
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        highlightedIndex = highlightedIndex <= 0 ? titleSuggestions.length - 1 : highlightedIndex - 1;
        return;
      } else if (e.key === "Enter" && highlightedIndex >= 0) {
        e.preventDefault();
        const suggestion = titleSuggestions[highlightedIndex];
        if (suggestion) {
          selectSuggestion(suggestion);
        }
        return;
      }
    }

    if (e.key === "Enter") {
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
    // Capture the current edited title immediately before any async operations
    const titleToSave = editedTitle;

    // Small delay to let suggestion click handler run first
    setTimeout(() => {
      // If a suggestion was clicked, it already handled saving
      if (suggestionClicked) {
        return;
      }
      // Save the captured title (even if isEditingTitle changed)
      controller.updateTitle(titleToSave);
      isEditingTitle = false;
      showTitleSuggestions = false;
      titleSuggestions = [];
    }, 10);
  }
</script>

<div class="curate-panel">
  <!-- Video identity -->
  <div class="video-identity">
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
                <i class="fas fa-link suggestion-link-icon" aria-hidden="true"></i>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {:else}
      <button type="button" class="video-word-btn" onclick={startEditingTitle} title="Click to edit">
        {video.title || video.shortcode}
        <i class="fas fa-pencil-alt edit-hint" aria-hidden="true"></i>
      </button>
    {/if}
    <span class="video-date">{formatDate(video.instagramDate)}</span>
  </div>

  <!-- Navigation -->
  <div class="nav-strip">
    <button
      class="nav-btn"
      onclick={controller.goPrev}
      disabled={currentIndex === 0}
      aria-label="Previous"
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>
    <span class="nav-position">{currentIndex + 1} of {uncuratedCount}</span>
    <button
      class="nav-btn"
      onclick={controller.goNext}
      disabled={currentIndex >= uncuratedCount - 1}
      aria-label="Next"
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Category -->
  <CategoryField
    categories={controller.categories}
    selectedCategory={video.category}
    showAddForm={controller.showAddCategory}
    newLabel={controller.newCategoryLabel}
    newColor={controller.newCategoryColor}
    disabled={controller.saving}
    onSelect={controller.setCategory}
    onToggleAddForm={controller.toggleAddCategoryForm}
    onAdd={controller.addCategory}
    onUpdateLabel={controller.updateCategoryLabel}
    onUpdateColor={controller.updateCategoryColor}
  />

  <!-- Performers -->
  <PerformerField
    quickPerformers={controller.quickPerformers}
    performerKeys={controller.performerKeys}
    showAddForm={controller.showAddPerformer}
    disabled={controller.saving}
    isSelected={controller.isPerformerSelected}
    {hasPerformers}
    onToggle={controller.togglePerformer}
    onAdd={controller.addQuickPerformer}
    onRemove={controller.removeQuickPerformer}
    onToggleAddForm={controller.toggleAddPerformerForm}
  />

  <!-- Linked Sequences -->
  <SequenceLinkField
    linkedSequences={video.linkedSequences}
    matchedSequences={controller.matchedSequences}
    searchQuery={controller.sequenceSearchQuery}
    searching={controller.sequenceSearching}
    maxLinks={controller.maxLinks}
    canAddMore={controller.canAddMoreLinks}
    showSection={controller.showLinkingSection}
    {hasCategory}
    disabled={controller.saving}
    onSearch={controller.searchSequences}
    onLink={controller.linkSequence}
    onUnlink={controller.unlinkSequence}
  />

  <!-- Actions -->
  <div class="actions">
    <button
      class="action-btn secondary"
      onclick={controller.excludeVideo}
      disabled={controller.saving}
    >
      <i class="fas fa-ban" aria-hidden="true"></i>
      Exclude
    </button>
    <button
      class="action-btn secondary"
      onclick={controller.skip}
      disabled={controller.saving}
    >
      Skip
    </button>
    <button
      class="action-btn primary"
      class:complete={isComplete}
      onclick={controller.goNext}
      disabled={currentIndex >= uncuratedCount - 1}
    >
      Next
      <i class="fas fa-arrow-right" aria-hidden="true"></i>
    </button>
  </div>
</div>

<!-- Progress bar (outside scrollable area) -->
<div class="progress-bar">
  <div class="progress-fill" style="width: {progressPercent}%"></div>
</div>

<style>
  .curate-panel {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .video-identity {
    text-align: center;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .video-word-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 24px;
    font-weight: 700;
    color: var(--theme-text, white);
    letter-spacing: -0.5px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 8px;
    transition: all 0.15s;
  }

  .video-word-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
  }

  .video-word-btn .edit-hint {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    opacity: 0;
    transition: opacity 0.15s;
  }

  .video-word-btn:hover .edit-hint {
    opacity: 1;
  }

  .title-input {
    width: 100%;
    max-width: 260px;
    font-size: 24px;
    font-weight: 700;
    color: var(--theme-text, white);
    letter-spacing: -0.5px;
    text-align: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 2px solid var(--theme-accent, #6366f1);
    border-radius: 8px;
    padding: 6px 12px;
    outline: none;
  }

  .title-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    font-weight: 400;
  }

  .title-edit-wrapper {
    position: relative;
    display: inline-block;
    width: 100%;
    max-width: 280px;
  }

  .title-loading {
    position: absolute;
    right: 12px;
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
    max-height: 260px;
    overflow-y: auto;
  }

  .title-suggestion {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
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
    background: color-mix(in srgb, var(--semantic-success, #10b981) 12%, transparent);
    border-left: 3px solid var(--semantic-success, #10b981);
  }

  .title-suggestion.exact:hover,
  .title-suggestion.exact.highlighted {
    background: color-mix(in srgb, var(--semantic-success, #10b981) 20%, transparent);
  }

  .suggestion-thumb,
  .suggestion-thumb-placeholder {
    width: 36px;
    height: 36px;
    border-radius: 6px;
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
    font-size: 12px;
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
    font-size: 14px;
    color: var(--theme-text, white);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .suggestion-owner {
    font-size: 11px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .suggestion-link-icon {
    color: var(--theme-accent, #6366f1);
    font-size: 12px;
    flex-shrink: 0;
    opacity: 0.6;
  }

  .title-suggestion:hover .suggestion-link-icon,
  .title-suggestion.highlighted .suggestion-link-icon {
    opacity: 1;
  }

  .video-date {
    display: block;
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    margin-top: 4px;
  }

  .nav-strip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 20px;
  }

  .nav-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    transition: all 0.2s;
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .nav-btn:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .nav-position {
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: auto;
    padding-top: 16px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 12px 16px;
    border-radius: 10px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .action-btn.secondary {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .action-btn.secondary:hover:not(:disabled) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, rgba(255, 255, 255, 0.7));
  }

  .action-btn.primary {
    flex: 1;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent);
    color: var(--theme-accent-light, #a5b4fc);
  }

  .action-btn.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
  }

  .action-btn.primary.complete {
    background: linear-gradient(135deg, var(--theme-accent, #6366f1) 0%, #8b5cf6 100%);
    color: white;
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, var(--semantic-success, #10b981), #06b6d4);
    transition: width 0.5s ease;
  }
</style>
