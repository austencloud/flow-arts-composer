<script lang="ts">
  /**
   * RenamePanel
   *
   * Focused panel for renaming videos that still have Instagram shortcode names.
   * Also allows optionally linking to a matching sequence.
   */
  import { onDestroy } from "svelte";
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

  // Local editing state
  let editedTitle = $state("");
  let titleSuggestions = $state<MatchedSequence[]>([]);
  let showSuggestions = $state(false);
  let highlightedIndex = $state(-1);
  let hasNavigatedSuggestions = $state(false);
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;

  // Sequence candidates for linking (shown after title is set)
  let sequenceCandidates = $state<MatchedSequence[]>([]);
  let selectedSequence = $state<MatchedSequence | null>(null);
  let candidatesLoading = $state(false);

  // Greek letter substitution
  const GREEK_MAP: Record<string, string> = {
    sig: "Σ", del: "Δ", the: "Θ", ome: "Ω",
    phi: "Φ", psi: "Ψ", lam: "Λ",
    alp: "α", bet: "β", gam: "γ",
  };

  function substituteGreek(text: string): string {
    return text.replace(
      /(sig|del|the|ome|phi|psi|lam|alp|bet|gam)(-?)/gi,
      (_, prefix, dash) => {
        const greek = GREEK_MAP[prefix.toLowerCase()];
        return greek ? greek + (dash || "") : prefix + (dash || "");
      }
    );
  }

  // Initialize/reset when video changes
  $effect(() => {
    const isShortcode = !video.title || video.title === video.shortcode || /^[A-Za-z0-9_-]{8,}$/.test(video.title);
    editedTitle = isShortcode ? "" : (video.title || "");
    titleSuggestions = [];
    showSuggestions = false;
    highlightedIndex = -1;
    hasNavigatedSuggestions = false;
    sequenceCandidates = [];
    selectedSequence = null;
  });

  // Load sequence candidates when title changes (debounced)
  $effect(() => {
    if (editedTitle.length >= 2) {
      loadSequenceCandidates(editedTitle);
    } else {
      sequenceCandidates = [];
      selectedSequence = null;
    }
  });

  async function loadSequenceCandidates(query: string) {
    candidatesLoading = true;
    try {
      const results = await controller.searchSequencesForTitle(query);
      sequenceCandidates = results.slice(0, 6);
      // Auto-select if exact match
      const exactMatch = sequenceCandidates.find(
        s => stripWordNotation(s.word).toUpperCase() === query.toUpperCase()
      );
      if (exactMatch) {
        selectedSequence = exactMatch;
      } else {
        selectedSequence = null;
      }
    } catch (e) {
      sequenceCandidates = [];
    } finally {
      candidatesLoading = false;
    }
  }

  // Debounced search for title suggestions (dropdown)
  async function handleTitleInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    editedTitle = substituteGreek(value);
    highlightedIndex = -1;
    hasNavigatedSuggestions = false;

    if (searchTimeout) clearTimeout(searchTimeout);

    if (editedTitle.length >= 2) {
      searchTimeout = setTimeout(async () => {
        const results = await controller.searchSequencesForTitle(editedTitle);
        titleSuggestions = results.slice(0, 5);
        showSuggestions = titleSuggestions.length > 0;
      }, 200);
    } else {
      titleSuggestions = [];
      showSuggestions = false;
    }
  }

  // Cancel a pending debounced suggestion search if the panel unmounts.
  onDestroy(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }
  });

  function handleTitleKeydown(e: KeyboardEvent) {
    if (showSuggestions && titleSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        hasNavigatedSuggestions = true;
        highlightedIndex = Math.min(highlightedIndex + 1, titleSuggestions.length - 1);
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        hasNavigatedSuggestions = true;
        highlightedIndex = Math.max(highlightedIndex - 1, -1);
        return;
      } else if (e.key === "Enter" && hasNavigatedSuggestions && highlightedIndex >= 0) {
        e.preventDefault();
        const suggestion = titleSuggestions[highlightedIndex];
        if (suggestion) {
          selectTitleSuggestion(suggestion);
        }
        return;
      } else if (e.key === "Escape") {
        e.preventDefault();
        showSuggestions = false;
        return;
      }
    }

    // Enter without navigation = save
    if (e.key === "Enter") {
      e.preventDefault();
      saveAndNext();
    }
  }

  function selectTitleSuggestion(seq: MatchedSequence) {
    editedTitle = seq.word;
    showSuggestions = false;
    titleSuggestions = [];
    highlightedIndex = -1;
    hasNavigatedSuggestions = false;
    // Auto-select this sequence for linking
    selectedSequence = seq;
  }

  function handleTitleBlur() {
    setTimeout(() => {
      showSuggestions = false;
    }, 150);
  }

  function handleTitleFocus() {
    if (titleSuggestions.length > 0) {
      showSuggestions = true;
    }
  }

  function selectCandidate(seq: MatchedSequence) {
    if (selectedSequence?.id === seq.id) {
      selectedSequence = null; // Deselect
    } else {
      selectedSequence = seq;
    }
  }

  async function saveAndNext() {
    if (!editedTitle.trim()) return;

    await controller.updateTitle(editedTitle.trim());

    // Link sequence if selected
    if (selectedSequence) {
      await controller.linkSequence(selectedSequence);
    }

    // Move to next unnamed video
    controller.goNextInRenameMode();
  }

  function skipVideo() {
    controller.goNext();
  }

  const renamingProgress = $derived(controller.renamingProgress);
  const unnamedCount = $derived(controller.unnamedVideos.length);
  const currentIndex = $derived(controller.currentIndex);
  const isLastVideo = $derived(currentIndex >= unnamedCount - 1);
  const hasTitle = $derived(editedTitle.trim().length > 0);

  // Check if a candidate is an exact match
  function isExactMatch(seq: MatchedSequence): boolean {
    return stripWordNotation(seq.word).toUpperCase() === editedTitle.toUpperCase();
  }
</script>

<div class="rename-panel">
  <!-- Video info header -->
  <div class="video-info">
    <span class="shortcode">{video.shortcode}</span>
    <span class="video-date">{formatDate(video.instagramDate)}</span>
  </div>

  <!-- Navigation strip -->
  <div class="nav-strip">
    <button
      class="nav-btn"
      onclick={controller.goPrev}
      disabled={currentIndex === 0}
      aria-label="Previous"
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>
    <span class="nav-position">{currentIndex + 1} of {unnamedCount}</span>
    <button
      class="nav-btn"
      onclick={controller.goNext}
      disabled={isLastVideo}
      aria-label="Next"
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Title input section -->
  <div class="title-section">
    <label class="section-label" for="video-title">
      <i class="fas fa-pen" aria-hidden="true"></i>
      Name
    </label>
    <div class="title-input-wrapper">
      <input
        id="video-title"
        type="text"
        class="title-input"
        placeholder="Enter TKA word..."
        value={editedTitle}
        oninput={handleTitleInput}
        onkeydown={handleTitleKeydown}
        onblur={handleTitleBlur}
        onfocus={handleTitleFocus}
        autocomplete="off"
      />
      {#if showSuggestions && titleSuggestions.length > 0}
        <div class="suggestions-dropdown">
          {#each titleSuggestions as seq, i}
            <button
              class="suggestion-item"
              class:highlighted={i === highlightedIndex}
              onmousedown={() => selectTitleSuggestion(seq)}
            >
              {#if seq.thumbnail}
                <img src={seq.thumbnail} alt="" class="suggestion-thumb" />
              {/if}
              <span class="suggestion-word"><TKAWordGlyph word={seq.word} height={13} /></span>
              {#if seq.ownerName}
                <span class="suggestion-owner">by {seq.ownerName}</span>
              {/if}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Sequence linking section (appears when title is set) -->
  {#if hasTitle && sequenceCandidates.length > 0}
    <div class="link-section">
      <div class="section-label" id="link-sequence-label">
        <i class="fas fa-link" aria-hidden="true"></i>
        Link Sequence
        <span class="optional-badge">optional</span>
      </div>
      <div class="candidates-grid" role="group" aria-labelledby="link-sequence-label">
        {#each sequenceCandidates as seq}
          <button
            class="candidate-card"
            class:selected={selectedSequence?.id === seq.id}
            class:exact={isExactMatch(seq)}
            onclick={() => selectCandidate(seq)}
          >
            {#if seq.thumbnail}
              <img src={seq.thumbnail} alt="" class="candidate-thumb" />
            {:else}
              <div class="candidate-thumb placeholder">
                <i class="fas fa-image" aria-hidden="true"></i>
              </div>
            {/if}
            <span class="candidate-word"><TKAWordGlyph word={seq.word} height={13} /></span>
            {#if selectedSequence?.id === seq.id}
              <div class="selected-check">
                <i class="fas fa-check" aria-hidden="true"></i>
              </div>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  {:else if hasTitle && !candidatesLoading}
    <div class="no-matches">
      <span class="no-matches-text">No matching sequences found</span>
    </div>
  {/if}

  <!-- Actions -->
  <div class="actions">
    <button
      class="action-btn secondary"
      onclick={skipVideo}
      disabled={controller.saving || isLastVideo}
    >
      Skip
    </button>
    {#if unnamedCount === 1 && hasTitle}
      <button
        data-save-shortcut
        class="action-btn primary complete"
        onclick={saveAndNext}
        disabled={controller.saving || !hasTitle}
      >
        Done
        <i class="fas fa-check" aria-hidden="true"></i>
      </button>
    {:else}
      <button
        data-save-shortcut
        class="action-btn primary"
        class:ready={hasTitle}
        onclick={saveAndNext}
        disabled={controller.saving || !hasTitle}
      >
        {selectedSequence ? "Save & Link" : "Save"}
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </button>
    {/if}
  </div>

  <!-- Progress bar -->
  <div class="progress-bar">
    <div
      class="progress-fill"
      style="width: {Math.round((renamingProgress.named / (renamingProgress.named + unnamedCount)) * 100)}%"
    ></div>
  </div>
</div>

<style>
  .rename-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    padding: 4px;
  }

  .video-info {
    text-align: center;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .shortcode {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-family: monospace;
    letter-spacing: 0.5px;
  }

  .video-date {
    display: block;
    font-size: 11px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    margin-top: 2px;
  }

  .nav-strip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }

  .nav-btn {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
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

  .title-section,
  .link-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-label i {
    font-size: 10px;
  }

  .title-section .section-label i {
    color: #f59e0b;
  }

  .link-section .section-label i {
    color: #10b981;
  }

  .optional-badge {
    font-size: var(--font-size-compact, 12px);
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    text-transform: lowercase;
    letter-spacing: normal;
    font-weight: 500;
  }

  .title-input-wrapper {
    position: relative;
  }

  .title-input {
    width: 100%;
    padding: 12px 14px;
    font-size: 16px;
    font-weight: 600;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, white);
    transition: all 0.2s;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .title-input:focus {
    outline: none;
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
  }

  .title-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    text-transform: none;
    letter-spacing: normal;
  }

  .suggestions-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 10px;
    overflow: hidden;
    z-index: 100;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .suggestion-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border: none;
    background: transparent;
    color: var(--theme-text, white);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .suggestion-item:hover,
  .suggestion-item.highlighted {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
  }

  .suggestion-thumb {
    width: 28px;
    height: 28px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .suggestion-word {
    font-weight: 600;
    font-size: 13px;
    flex: 1;
  }

  .suggestion-owner {
    font-size: 11px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  /* Sequence candidates grid */
  .candidates-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .candidate-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 8px 6px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    cursor: pointer;
    transition: all 0.15s;
  }

  .candidate-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
  }

  .candidate-card.exact {
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
  }

  .candidate-card.selected {
    border-color: #10b981;
    background: color-mix(in srgb, #10b981 15%, transparent);
  }

  .candidate-thumb {
    width: 48px;
    height: 48px;
    object-fit: cover;
    border-radius: 6px;
  }

  .candidate-thumb.placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    font-size: 14px;
  }

  .candidate-word {
    font-size: 10px;
    font-weight: 600;
    color: var(--theme-text, white);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .selected-check {
    position: absolute;
    top: 4px;
    right: 4px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #10b981;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
  }

  .no-matches {
    padding: 12px;
    text-align: center;
  }

  .no-matches-text {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .actions {
    display: flex;
    gap: 8px;
    margin-top: auto;
    padding-top: 8px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 16px;
    border-radius: 10px;
    border: none;
    font-size: 13px;
    font-weight: 600;
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
    background: color-mix(in srgb, #f59e0b 20%, transparent);
    color: rgba(245, 158, 11, 0.7);
  }

  .action-btn.primary:hover:not(:disabled) {
    background: color-mix(in srgb, #f59e0b 30%, transparent);
  }

  .action-btn.primary.ready {
    background: linear-gradient(135deg, #f59e0b 0%, #f97316 100%);
    color: white;
  }

  .action-btn.primary.complete {
    background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
    color: white;
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .progress-bar {
    height: 3px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #f59e0b, #f97316);
    transition: width 0.5s ease;
  }
</style>
