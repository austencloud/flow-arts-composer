<!--
  SequencePromptCard.svelte - Entry card for Practice tab when no sequence is saved

  Shows recent sequences for quick selection and a button to browse all sequences.
  Displayed when user has no last-used sequence saved.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { fade, fly } from "svelte/transition";
  import {
    getTrainPracticeState,
    type RecentSequence,
  } from "../../state/train-practice-state.svelte";
  import SequencePickerModal from "#lib/shared/components/sequence-picker/SequencePickerModal.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    onSequenceSelect: (sequence: SequenceData) => void;
  }

  let { onSequenceSelect }: Props = $props();

  const practiceState = getTrainPracticeState();
  let showBrowser = $state(false);
  const hapticService = getHapticFeedback();

  // Get recent sequences from state
  const recentSequences = $derived(practiceState.recentSequences);

  function handleBrowseClick() {
    hapticService?.trigger("selection");
    showBrowser = true;
  }

  function handleCloseBrowser() {
    showBrowser = false;
  }

  function handleSequenceSelect(sequence: SequenceData) {
    hapticService?.trigger("success");
    showBrowser = false;
    onSequenceSelect(sequence);
  }

  function handleRecentSelect(recent: RecentSequence) {
    hapticService?.trigger("selection");
    // For recent sequences, we need to fetch the full sequence data
    // For now, we'll open the browser with the sequence pre-selected
    // TODO: Implement direct load from recent sequence cache
    showBrowser = true;
  }

  function formatTimeAgo(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return t('train_time_just_now');
    if (minutes < 60) return t('train_time_minutes_ago', { count: minutes });
    if (hours < 24) return t('train_time_hours_ago', { count: hours });
    if (days === 1) return t('train_time_yesterday');
    if (days < 7) return t('train_time_days_ago', { count: days });

    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
</script>

<div class="prompt-container" in:fade={{ duration: 200 }}>
  <div class="prompt-card">
    <!-- Icon -->
    <div class="prompt-icon">
      <i class="fas fa-dumbbell" aria-hidden="true"></i>
    </div>

    <!-- Title -->
    <h2 class="prompt-title">{t('train_select_sequence')}</h2>
    <p class="prompt-subtitle">
      {t('train_select_sequence_subtitle')}
    </p>

    <!-- Recent Sequences (if any) -->
    {#if recentSequences.length > 0}
      <div class="recent-section" in:fly={{ y: 10, duration: 200, delay: 100 }}>
        <div class="recent-header">
          <i class="fas fa-history" aria-hidden="true"></i>
          <span>{t('train_recent')}</span>
        </div>
        <div class="recent-grid">
          {#each recentSequences as recent, index (recent.id)}
            <button
              class="recent-card"
              onclick={() => handleRecentSelect(recent)}
              in:fly={{ y: 10, duration: 200, delay: 150 + index * 50 }}
            >
              <div class="recent-name">{recent.word ?? recent.name}</div>
              <div class="recent-meta">
                <span class="step-count">{t('train_step_count', { count: recent.stepCount })}</span>
                <span class="time-ago"
                  >{formatTimeAgo(recent.lastPracticedAt)}</span
                >
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/if}

    <!-- Browse Button -->
    <button
      class="browse-button"
      onclick={handleBrowseClick}
      in:fly={{
        y: 10,
        duration: 200,
        delay: recentSequences.length > 0 ? 300 : 100,
      }}
    >
      <i class="fas fa-folder-open" aria-hidden="true"></i>
      <span>{t('train_browse_all')}</span>
    </button>
  </div>

  <!-- Sequence Picker Modal -->
  <SequencePickerModal
    open={showBrowser}
    onSelect={handleSequenceSelect}
    onClose={handleCloseBrowser}
  />
</div>

<style>
  .prompt-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: clamp(1rem, 4vw, 2rem);
    overflow-y: auto;
  }

  .prompt-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: min(440px, 100%);
    width: 100%;
    gap: clamp(0.75rem, 3vw, 1.25rem);
  }

  .prompt-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: clamp(48px, 14vw, 80px);
    height: clamp(48px, 14vw, 80px);
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 20%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 20%,
        transparent
      )
    );
    border: 2px solid
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 30%,
        transparent
      );
    border-radius: clamp(14px, 4vw, 20px);
    color: var(--semantic-info, var(--semantic-info));
    font-size: clamp(1.5rem, 5vw, 2rem);
  }

  .prompt-title {
    margin: 0;
    font-size: clamp(1.25rem, 4.5vw, 1.75rem);
    font-weight: 700;
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
  }

  .prompt-subtitle {
    margin: 0;
    font-size: clamp(0.875rem, 3vw, 1rem);
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.5;
  }

  /* Recent Sequences Section */
  .recent-section {
    width: 100%;
    margin-top: clamp(0.5rem, 2vw, 1rem);
  }

  .recent-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: clamp(0.5rem, 2vw, 0.75rem);
    font-size: clamp(0.8rem, 2.5vw, 0.9rem);
    font-weight: 600;
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .recent-header i {
    font-size: 0.9em;
    opacity: 0.8;
  }

  .recent-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
    gap: clamp(0.5rem, 2vw, 0.75rem);
  }

  .recent-card {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: clamp(0.25rem, 1vw, 0.375rem);
    min-height: var(--min-touch-target);
    padding: clamp(0.75rem, 3vw, 1rem);
    background: linear-gradient(
      135deg,
      var(--theme-card-hover-bg, var(--theme-card-bg)) 0%,
      var(--theme-card-bg) 100%
    );
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: clamp(0.5rem, 2vw, 0.75rem);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    text-align: left;
  }

  .recent-card:hover {
    border-color: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 50%,
      transparent
    );
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-info, var(--semantic-info)) 15%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent-strong)) 10%,
          transparent
        )
        100%
    );
    transform: translateY(-2px);
  }

  .recent-card:active {
    transform: scale(0.98);
    transition-duration: 50ms;
  }

  .recent-name {
    font-size: clamp(0.875rem, 3vw, 0.9375rem);
    font-weight: 600;
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-meta {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: clamp(0.7rem, 2.5vw, 0.8rem);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .step-count {
    color: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 90%,
      transparent
    );
    font-weight: 500;
  }

  .time-ago::before {
    content: "•";
    margin-right: 0.5rem;
    opacity: 0.4;
  }

  /* Browse Button */
  .browse-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(0.5rem, 2vw, 0.75rem);
    width: 100%;
    min-height: var(--min-touch-target);
    padding: clamp(0.875rem, 3.5vw, 1.125rem) clamp(1rem, 4vw, 1.5rem);
    margin-top: clamp(0.5rem, 2vw, 0.75rem);
    background: linear-gradient(
      135deg,
      var(--semantic-info, var(--semantic-info)),
      var(--theme-accent-strong, var(--theme-accent-strong))
    );
    border: none;
    border-radius: clamp(0.625rem, 2.5vw, 0.875rem);
    color: var(--theme-text, white);
    font-size: clamp(0.9rem, 3vw, 1rem);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .browse-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 40%,
        transparent
      );
  }

  .browse-button:active {
    transform: translateY(0);
    transition-duration: 50ms;
  }

  .browse-button i {
    font-size: 1.1em;
  }

  @media (prefers-reduced-motion: reduce) {
    .recent-card,
    .browse-button {
      transition: none;
    }

    .recent-card:hover,
    .browse-button:hover {
      transform: none;
    }
  }
</style>
