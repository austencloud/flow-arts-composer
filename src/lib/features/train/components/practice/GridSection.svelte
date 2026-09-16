<!--
  GridSection.svelte - Beat Grid visualization wrapper for Practice tab

  Displays the StepGrid component with proper aspect ratio and empty state.
  Used as one of the visualization panels in the Practice view.
-->
<script lang="ts">
  import StepGrid from "$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  interface Props {
    sequence: SequenceData | null;
    currentStepIndex?: number;
    onStepSelect?: (stepIndex: number) => void;
    onBrowseSequences?: () => void;
  }

  let {
    sequence = null,
    currentStepIndex = 0,
    onStepSelect,
    onBrowseSequences,
  }: Props = $props();

  // Handle beat click from StepGrid - converts from 1-indexed beat number to 0-indexed
  function handleStepClick(stepNumber: number) {
    // StepGrid uses 1-indexed beat numbers, convert to 0-indexed for state
    const stepIndex = stepNumber - 1;
    onStepSelect?.(stepIndex);
  }

  // Handle start position click - use -1 to represent start position
  function handleStartClick() {
    onStepSelect?.(-1);
  }
</script>

<div class="grid-section">
  {#if sequence}
    <StepGrid
      steps={sequence.steps}
      startPlacement={sequence.startPlacement}
      practiceStepNumber={currentStepIndex + 1}
      onStepClick={handleStepClick}
      onStartClick={handleStartClick}
    />
  {:else}
    <div class="empty-state">
      <div class="empty-icon">
        <i class="fas fa-th" aria-hidden="true"></i>
      </div>
      <p class="empty-text">{t('train_no_sequence_selected')}</p>
      {#if onBrowseSequences}
        <button class="browse-btn" onclick={onBrowseSequences}>
          <i class="fas fa-folder-open" aria-hidden="true"></i>
          {t('train_browse')}
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .grid-section {
    position: relative;
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: transparent;
    border-radius: 12px;
    overflow: hidden;
    align-self: center;
  }

  .empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.5rem;
    text-align: center;
    background: var(--theme-card-bg);
    border: 1px dashed var(--theme-stroke-strong, var(--theme-stroke-strong));
    border-radius: 12px;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 15%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 15%,
        transparent
      )
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 25%,
        transparent
      );
    border-radius: 12px;
    color: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 80%,
      transparent
    );
    font-size: 1.25rem;
  }

  .empty-text {
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .browse-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 40px;
    padding: 0.5rem 1rem;
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
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 30%,
        transparent
      );
    border-radius: 8px;
    color: color-mix(in srgb, var(--semantic-info) 90%, white);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .browse-btn:hover {
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 30%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 30%,
        transparent
      )
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 50%,
      transparent
    );
    transform: translateY(-1px);
  }
</style>
