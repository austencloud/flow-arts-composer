<script lang="ts">
  /**
   * ConnectionSharedSequences - Display sequences you both have
   *
   * Shows sequences with matching canonical signatures.
   * Horizontal scroll on mobile, grid on desktop.
   */

  import type { SharedSequenceSummary } from "#lib/shared/community/services/types.js";
  // A LOOP word repeats by construction; the raw field is routinely FΨFΨFΨFΨ
  // where the only correct display is FΨ (simplified-word-display.md).
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";

  interface Props {
    sharedSequences: SharedSequenceSummary[];
    isLoading?: boolean;
    theirName?: string;
  }

  let { sharedSequences, isLoading = false, theirName = "them" }: Props = $props();
</script>

<div class="shared-sequences">
  <div class="section-header">
    <span class="section-title">
      <i class="fas fa-link" aria-hidden="true"></i>
      Shared Sequences
    </span>
    {#if sharedSequences.length > 0}
      <span class="count-badge">{sharedSequences.length}</span>
    {/if}
  </div>

  {#if isLoading}
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>Finding shared sequences...</span>
    </div>
  {:else if sharedSequences.length === 0}
    <div class="empty-state">
      <i class="fas fa-puzzle-piece" aria-hidden="true"></i>
      <p>No shared sequences yet</p>
      <span class="empty-hint">You and {theirName} haven't saved the same sequences</span>
    </div>
  {:else}
    <div class="sequences-scroll">
      {#each sharedSequences as shared}
        <div class="shared-pair">
          <!-- My version -->
          <div class="sequence-card mine">
            <div class="thumbnail-wrapper">
              {#if shared.mySequence.thumbnailUrl}
                <img
                  src={shared.mySequence.thumbnailUrl}
                  alt={shared.mySequence.name}
                  class="thumbnail"
                  loading="lazy"
                />
              {:else}
                <div class="thumbnail-placeholder">
                  <i class="fas fa-image" aria-hidden="true"></i>
                </div>
              {/if}
            </div>
            <div class="sequence-info">
              <span class="sequence-word"
                >{simplifyRepeatedWord(shared.mySequence.word)}</span
              >
              <span class="sequence-owner">Your version</span>
            </div>
          </div>

          <div class="match-indicator">
            <i class="fas fa-equals" aria-hidden="true"></i>
          </div>

          <!-- Their version -->
          <div class="sequence-card theirs">
            <div class="thumbnail-wrapper">
              {#if shared.theirSequence.thumbnailUrl}
                <img
                  src={shared.theirSequence.thumbnailUrl}
                  alt={shared.theirSequence.name}
                  class="thumbnail"
                  loading="lazy"
                />
              {:else}
                <div class="thumbnail-placeholder">
                  <i class="fas fa-image" aria-hidden="true"></i>
                </div>
              {/if}
            </div>
            <div class="sequence-info">
              <span class="sequence-word"
                >{simplifyRepeatedWord(shared.theirSequence.word)}</span
              >
              <span class="sequence-owner">Their version</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .shared-sequences {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .count-badge {
    padding: 2px 8px;
    background: var(--theme-accent);
    color: var(--text-on-accent, white);
    border-radius: 10px;
    font-size: var(--font-size-xs, 11px);
    font-weight: 600;
  }

  .loading-state,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 12px;
    color: var(--theme-text-dim);
    text-align: center;
  }

  .loading-state i,
  .empty-state i {
    font-size: 24px;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
  }

  .empty-hint {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.7;
  }

  .sequences-scroll {
    display: flex;
    gap: 16px;
    overflow-x: auto;
    padding-bottom: 8px;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
  }

  .sequences-scroll::-webkit-scrollbar {
    height: 6px;
  }

  .sequences-scroll::-webkit-scrollbar-track {
    background: var(--scrollbar-track, transparent);
  }

  .sequences-scroll::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2));
    border-radius: 3px;
  }

  .shared-pair {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .sequence-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    min-width: 100px;
  }

  .thumbnail-wrapper {
    width: 80px;
    height: 80px;
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface-inset, rgba(0, 0, 0, 0.2));
  }

  .thumbnail {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim);
    opacity: 0.3;
  }

  .sequence-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .sequence-word {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .sequence-owner {
    font-size: var(--font-size-xs, 11px);
    color: var(--theme-text-dim);
  }

  .match-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    background: var(--theme-accent);
    border-radius: 50%;
    color: var(--text-on-accent, white);
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  /* Desktop layout */
  @media (min-width: 768px) {
    .sequences-scroll {
      flex-wrap: wrap;
      overflow-x: visible;
    }

    .thumbnail-wrapper {
      width: 100px;
      height: 100px;
    }
  }

  /* Tiny screens */
  @media (max-width: 480px) {
    .thumbnail-wrapper {
      width: 60px;
      height: 60px;
    }

    .sequence-card {
      padding: 8px;
      min-width: 76px;
    }
  }
</style>
