<!--
  StepVisualization.svelte - Current Step Display

  Shows the current step from the sequence during training.
  Displays pictograph visualization and step information.
-->
<script lang="ts">
  import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    step: StepData | null;
    stepNumber: number;
    totalSteps: number;
    showDetails?: boolean;
  }

  let {
    step = null,
    stepNumber = 0,
    totalSteps = 0,
    showDetails = true,
  }: Props = $props();

  // Get step info for display
  const hasStep = $derived(step !== null);
  const isBlank = $derived(step?.isBlank ?? false);
</script>

<div class="step-visualization">
  <!-- Step counter -->
  <div class="step-header">
    <span class="step-counter">{t('train_step_counter', { step: stepNumber, total: totalSteps })}</span>
  </div>

  <!-- Pictograph visualization -->
  <div class="pictograph-container">
    {#if hasStep && !isBlank}
      <PictographContainer pictographData={step} />
    {:else if isBlank}
      <div class="blank-step">
        <span>{t('train_blank_step')}</span>
      </div>
    {:else}
      <div class="no-step">
        <span>{t('train_no_step_data')}</span>
      </div>
    {/if}
  </div>

  <!-- Step details (optional) -->
  {#if showDetails && step}
    <div class="step-details">
      {#if step.leftReversal || step.rightReversal}
        <div class="reversals">
          {#if step.leftReversal}
            <span class="reversal blue">{t('train_blue_reversal')}</span>
          {/if}
          {#if step.rightReversal}
            <span class="reversal red">{t('train_red_reversal')}</span>
          {/if}
        </div>
      {/if}

      {#if step.motions}
        <div class="positions">
          {#if step.motions.left}
            <div class="position-info">
              <span class="label blue">{t('train_blue_label')}</span>
              <span class="location">{step.motions.left.endLocation}</span>
            </div>
          {/if}
          {#if step.motions.right}
            <div class="position-info">
              <span class="label red">{t('train_red_label')}</span>
              <span class="location">{step.motions.right.endLocation}</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .step-visualization {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
  }

  .step-header {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .step-counter {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-text, white);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .pictograph-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 200px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 8px;
    padding: 1rem;
  }

  .blank-step,
  .no-step {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: 1rem;
  }

  .step-details {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: 0.875rem;
  }

  .reversals {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .reversal {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .reversal.blue {
    background: color-mix(
      in srgb,
      var(--prop-blue, var(--semantic-info)) 20%,
      transparent
    );
    color: var(--prop-blue, var(--semantic-info));
    border: 1px solid
      color-mix(
        in srgb,
        var(--prop-blue, var(--semantic-info)) 30%,
        transparent
      );
  }

  .reversal.red {
    background: color-mix(
      in srgb,
      var(--prop-red, var(--semantic-error)) 20%,
      transparent
    );
    color: var(--prop-red, var(--semantic-error));
    border: 1px solid
      color-mix(
        in srgb,
        var(--prop-red, var(--semantic-error)) 30%,
        transparent
      );
  }

  .positions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .position-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .label {
    font-weight: 600;
    min-width: var(--min-touch-target);
  }

  .label.blue {
    color: var(--prop-blue, var(--semantic-info));
  }

  .label.red {
    color: var(--prop-red, var(--semantic-error));
  }

  .location {
    font-family: monospace;
    color: color-mix(in srgb, var(--theme-text, white) 90%, transparent);
  }
</style>
