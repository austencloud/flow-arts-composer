<script lang="ts">
  /**
   * LinkPanel
   *
   * Info panel content for link mode - focused sequence matching workflow.
   */
  import type { VideoEditorController } from "../../../state/video-editor-controller.svelte";
  import type { ShowcaseVideo, MatchedSequence } from "../../../types";
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";

  interface Props {
    video: ShowcaseVideo;
    controller: VideoEditorController;
    formatDate: (date: Date | null) => string;
  }

  let { video, controller, formatDate }: Props = $props();

  const unlinkableCount = $derived(controller.unlinkableVideos.length);
  const currentIndex = $derived(controller.currentIndex);
  const matchedSequences = $derived(controller.matchedSequences);
  const selectedSequence = $derived(controller.selectedSequenceForLink);
  const searching = $derived(controller.sequenceSearching);
  const progressPercent = $derived(
    Math.round((controller.linkingProgress.linked / controller.stats.withWord) * 100)
  );
</script>

<div class="link-panel">
  <!-- Video identity -->
  <div class="video-identity">
    <span class="video-word">{video.title || video.shortcode}</span>
    <span class="video-date">{formatDate(video.instagramDate)}</span>
    {#if video.performers.length > 0}
      <span class="performer-tag">
        <i class="fas fa-user" aria-hidden="true"></i>
        {video.performers.map(p => p.displayName).join(', ')}
      </span>
    {/if}
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
    <span class="nav-position">{currentIndex + 1} of {unlinkableCount}</span>
    <button
      class="nav-btn"
      onclick={controller.goNext}
      disabled={currentIndex >= unlinkableCount - 1}
      aria-label="Next"
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Sequence matches -->
  <div class="sequences-section">
    <div class="section-header">
      <span class="section-label">Matching Sequences</span>
      {#if searching}
        <ProgressRing percent={-1} size={24} strokeWidth={2} />
      {/if}
    </div>

    {#if searching}
      <div class="sequences-loading">
        <ProgressRing percent={-1} size={32} strokeWidth={3} />
        <span>Searching for "{video.title}"...</span>
      </div>
    {:else if matchedSequences.length === 0}
      <div class="sequences-empty">
        <i class="fas fa-search" aria-hidden="true"></i>
        <span>No sequences found matching "{video.title}"</span>
        <p>The sequence may not exist yet, or use a different word.</p>
      </div>
    {:else}
      <div class="sequences-list">
        {#each matchedSequences as seq, i (seq.id)}
          <button
            class="sequence-card"
            class:selected={selectedSequence?.id === seq.id}
            onclick={() => controller.selectSequenceForLink(seq)}
          >
            <span class="key-hint">{i + 1}</span>
            <div class="sequence-thumbnail">
              {#if seq.thumbnail}
                <img src={seq.thumbnail} alt={seq.word} />
              {:else}
                <div class="no-thumbnail">
                  <i class="fas fa-image" aria-hidden="true"></i>
                </div>
              {/if}
            </div>
            <div class="sequence-info">
              <span class="sequence-word"><TKAWordGlyph word={seq.word} height={13} /></span>
              <span class="sequence-name">{seq.name}</span>
              <span class="sequence-owner">
                <i class="fas fa-user" aria-hidden="true"></i>
                {seq.ownerName}
                {#if seq.isPublic}
                  <span class="public-badge">Public</span>
                {/if}
              </span>
            </div>
            {#if selectedSequence?.id === seq.id}
              <div class="selected-check">
                <i class="fas fa-check" aria-hidden="true"></i>
              </div>
            {/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <!-- Actions -->
  <div class="actions">
    {#if selectedSequence}
      <div class="link-confirm">
        <span class="confirm-text">
          Link to <strong>{selectedSequence.word}</strong> by {selectedSequence.ownerName}?
        </span>
      </div>
    {/if}
    <div class="action-buttons">
      <button
        class="action-btn secondary"
        onclick={controller.skip}
        disabled={controller.saving}
      >
        <span class="key-hint">X</span>
        Skip
      </button>
      {#if selectedSequence}
        <button
          class="action-btn primary"
          onclick={controller.confirmLink}
          disabled={controller.saving}
        >
          <span class="key-hint">Enter</span>
          Confirm Link
        </button>
      {:else if matchedSequences.length > 0}
        <span class="select-prompt">Select a sequence above (1-{matchedSequences.length})</span>
      {/if}
    </div>
  </div>
</div>

<!-- Progress bar (outside scrollable area) -->
<div class="progress-bar">
  <div class="progress-fill" style="width: {progressPercent}%"></div>
</div>

<style>
  .link-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
  }

  .video-identity {
    text-align: center;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .video-word {
    display: block;
    font-size: 20px;
    font-weight: 700;
    color: #06b6d4;
    font-family: monospace;
  }

  .video-date {
    display: block;
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    margin-top: 4px;
  }

  .performer-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent);
    border-radius: 4px;
    font-size: 12px;
    color: var(--theme-accent-light, #a5b4fc);
  }

  .performer-tag i {
    font-size: 11px;
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
  }

  .nav-btn:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .nav-position {
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .sequences-section {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.35));
  }

  .sequences-loading,
  .sequences-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-align: center;
  }

  .sequences-empty i {
    font-size: 32px;
    opacity: 0.5;
  }

  .sequences-empty p {
    font-size: 13px;
    opacity: 0.7;
    margin: 0;
  }

  .sequences-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sequence-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.5));
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;
  }

  .sequence-card:hover {
    border-color: var(--semantic-success, #10b981);
    background: color-mix(in srgb, var(--semantic-success, #10b981) 5%, transparent);
  }

  .sequence-card.selected {
    border-color: var(--semantic-success, #10b981);
    background: color-mix(in srgb, var(--semantic-success, #10b981) 10%, transparent);
  }

  .sequence-card .key-hint {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    font-family: monospace;
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    flex-shrink: 0;
  }

  .sequence-card.selected .key-hint {
    background: var(--semantic-success, #10b981);
    color: white;
  }

  .sequence-thumbnail {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    flex-shrink: 0;
  }

  .sequence-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .no-thumbnail {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: 16px;
  }

  .sequence-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .sequence-word {
    font-size: 14px;
    font-weight: 700;
    font-family: monospace;
    color: var(--theme-text, white);
  }

  .sequence-name {
    font-size: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sequence-owner {
    font-size: 11px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .sequence-owner i {
    font-size: 10px;
  }

  .public-badge {
    padding: 2px 6px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--semantic-success, #10b981) 20%, transparent);
    color: var(--semantic-success, #10b981);
    font-size: 10px;
    font-weight: 600;
  }

  .selected-check {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--semantic-success, #10b981);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .link-confirm {
    text-align: center;
  }

  .confirm-text {
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .confirm-text strong {
    color: var(--semantic-success, #10b981);
    font-family: monospace;
  }

  .action-buttons {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn.secondary {
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .action-btn.secondary:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 50%, transparent);
    color: var(--semantic-error, #ef4444);
  }

  .action-btn.primary {
    background: var(--semantic-success, #10b981);
    color: white;
  }

  .action-btn.primary:hover:not(:disabled) {
    background: #059669;
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn .key-hint {
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.2);
    font-family: monospace;
    font-size: 11px;
  }

  .action-btn.secondary .key-hint {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
  }

  .select-prompt {
    font-size: 13px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
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
    transition: width 0.3s ease;
  }

</style>
