<!--
  SaveProgressOverlay.svelte

  Full-screen overlay showing save progress with step indicators,
  granular beat progress, and success animation.

  Supports two modes:
  - compact: Simple "Saving..." with spinner and progress bar
  - detailed (default): Shows all step indicators and beat progress
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  interface SaveStep {
    icon: string;
    label: string;
  }

  interface Props {
    currentStep: number;
    steps: SaveStep[];
    /** Compact mode: shows simple "Saving..." message instead of detailed steps */
    compact?: boolean;
  }

  let {
    currentStep,
    steps,
    compact = true, // Default to compact for simpler UX
  }: Props = $props();

  const isComplete = $derived(currentStep === steps.length + 1);
  const progressPercent = $derived((currentStep / steps.length) * 100);
</script>

<div class="save-progress-overlay">
  <div class="progress-content">
    <!-- Success State -->
    {#if isComplete}
      <div class="success-animation">
        <div class="success-circle">
          <i class="fas fa-check" aria-hidden="true"></i>
        </div>
        <h3>{t("library_ui_saved")}</h3>
        <p>{t("library_ui_your_sequence_is_now_in_your_library")}</p>
      </div>
    {:else if compact}
      <!-- Compact Mode: Simple "Saving..." with progress bar -->
      <div class="compact-progress">
        <div class="compact-spinner">
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        </div>
        <h3>{t("library_ui_saving_to_library")}</h3>
        <div class="progress-bar-container">
          <div
            class="progress-bar-fill"
            style="width: {progressPercent}%"
          ></div>
        </div>
      </div>
    {:else}
      <!-- Detailed Mode: All steps visible -->
      <div class="progress-header">
        <div class="progress-icon-wrapper">
          <div class="progress-icon-ring"></div>
          <i
            class="fas {steps[currentStep - 1]?.icon ||
              'fa-spinner'} progress-icon"
            aria-hidden="true"
          ></i>
        </div>
        <h3>
          {steps[currentStep - 1]?.label || "Preparing..."}
        </h3>
      </div>

      <div class="progress-steps">
        {#each steps as step, i}
          <div
            class="step"
            class:completed={currentStep > i + 1}
            class:active={currentStep === i + 1}
            class:pending={currentStep < i + 1}
          >
            <div class="step-indicator">
              {#if currentStep > i + 1}
                <i class="fas fa-check" aria-hidden="true"></i>
              {:else if currentStep === i + 1}
                <div class="step-pulse"></div>
              {:else}
                <span class="step-number">{i + 1}</span>
              {/if}
            </div>
            <span class="step-label">{step.label}</span>
          </div>
        {/each}
      </div>

      <div class="progress-bar-container">
        <div class="progress-bar-fill" style="width: {progressPercent}%"></div>
      </div>
    {/if}
  </div>
</div>

<style>
  .save-progress-overlay {
    position: absolute;
    inset: 0;
    background: var(--theme-overlay, rgba(0, 0, 0, 0.85));
    backdrop-filter: blur(8px);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn var(--duration-emphasis) ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .progress-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 32px;
    max-width: 300px;
    text-align: center;
  }

  /* Progress Header with Icon */
  .progress-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .progress-icon-wrapper {
    position: relative;
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .progress-icon-ring {
    position: absolute;
    inset: 0;
    border: 3px solid var(--theme-stroke);
    border-top-color: var(--theme-accent-strong, var(--theme-accent-strong));
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .progress-icon {
    font-size: var(--font-size-2xl);
    color: var(--theme-accent-strong, var(--theme-accent-strong));
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.6;
      transform: scale(1);
    }
    50% {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  .progress-header h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
  }

  /* Compact Mode */
  .compact-progress {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
    width: 100%;
  }

  .compact-spinner {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 15%,
      transparent
    );
    border-radius: 50%;
  }

  .compact-spinner i {
    font-size: 28px;
    color: var(--theme-accent-strong, #8b5cf6);
  }

  .compact-progress h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
  }

  /* Progress Steps */
  .progress-steps {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 8px;
    transition: all var(--duration-emphasis) ease;
  }

  .step.completed {
    background: color-mix(
      in srgb,
      var(--semantic-success, #16a34a) 10%,
      transparent
    );
  }

  .step.active {
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #8b5cf6) 15%,
      transparent
    );
  }

  .step.pending {
    opacity: 0.4;
  }

  .step-indicator {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-compact);
    font-weight: 600;
    flex-shrink: 0;
    transition: all var(--duration-emphasis) ease;
  }

  .step.completed .step-indicator {
    background: var(--semantic-success, var(--semantic-success));
    color: white;
  }

  .step.active .step-indicator {
    background: var(--theme-accent-strong, var(--theme-accent-strong));
    color: white;
  }

  .step.pending .step-indicator {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim);
  }

  .step-pulse {
    width: 8px;
    height: 8px;
    background: white;
    border-radius: 50%;
    animation: stepPulse 1s ease-in-out infinite;
  }

  @keyframes stepPulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 1;
    }
    50% {
      transform: scale(1.5);
      opacity: 0.5;
    }
  }

  .step-number {
    font-size: var(--font-size-compact);
  }

  .step-label {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.8));
    transition: color var(--duration-emphasis) ease;
  }

  .step.completed .step-label {
    color: var(--semantic-success, var(--semantic-success));
  }

  .step.active .step-label {
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
    font-weight: 500;
  }

  /* Progress Bar */
  .progress-bar-container {
    width: 100%;
    height: 4px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(
      90deg,
      var(--theme-accent-strong, var(--theme-accent-strong)),
      var(--semantic-success, var(--semantic-success))
    );
    border-radius: 2px;
    transition: width 0.5s ease;
  }

  /* Success Animation */
  .success-animation {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    animation: successBounce 0.5s ease;
  }

  @keyframes successBounce {
    0% {
      transform: scale(0.8);
      opacity: 0;
    }
    50% {
      transform: scale(1.05);
    }
    100% {
      transform: scale(1);
      opacity: 1;
    }
  }

  .success-circle {
    width: 72px;
    height: 72px;
    background: linear-gradient(
      135deg,
      var(--semantic-success, #22c55e),
      color-mix(in srgb, var(--semantic-success, #16a34a) 80%, black)
    );
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 32px
      color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent);
  }

  .success-circle i {
    font-size: var(--font-size-3xl);
    color: white;
    animation: checkPop var(--duration-emphasis) ease var(--duration-normal)
      both;
  }

  @keyframes checkPop {
    0% {
      transform: scale(0);
    }
    50% {
      transform: scale(1.2);
    }
    100% {
      transform: scale(1);
    }
  }

  .success-animation h3 {
    margin: 0;
    font-size: var(--font-size-2xl);
    font-weight: 600;
    color: var(--semantic-success, var(--semantic-success));
  }

  .success-animation p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
  }

  @media (prefers-reduced-motion: reduce) {
    .save-progress-overlay {
      animation: none;
    }

    .progress-icon-ring {
      animation: none;
      border-top-color: var(--theme-accent-strong, var(--theme-accent-strong));
      border-right-color: var(
        --theme-accent-strong,
        var(--theme-accent-strong)
      );
    }

    .progress-icon {
      animation: none;
    }

    .step-pulse {
      animation: none;
    }

    .success-animation {
      animation: none;
    }

    .success-circle i {
      animation: none;
    }
  }
</style>
