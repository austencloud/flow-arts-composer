<!--
WordStepNavigation - Step navigation dots for letter sequence
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { LetterDefinition } from "../../../../domain/constants/word-visualizer-data";

  let {
    letters,
    currentStepIndex,
    showStepNumber = true,
    compact = false,
    onStepChange,
  }: {
    letters: LetterDefinition[];
    currentStepIndex: number;
    showStepNumber?: boolean;
    compact?: boolean;
    onStepChange: (index: number) => void;
  } = $props();

  const hapticService = getHapticFeedback();

  function goToStep(index: number) {
    hapticService?.trigger("selection");
    onStepChange(index);
  }
</script>

<div class="step-navigation">
  {#each letters as letter, i}
    <button
      class="step-dot"
      class:active={i === currentStepIndex}
      class:compact
      onclick={() => goToStep(i)}
      aria-label="Step {i + 1}: {letter.letter}"
    >
      {#if showStepNumber}
        <span class="step-number">{i + 1}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .step-navigation {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .step-dot {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    border: 2px solid var(--theme-stroke-strong);
    border-radius: 50%;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    color: var(--theme-text-dim);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .step-dot.compact {
    width: 24px;
    height: 24px;
    font-size: var(--font-size-compact, 12px);
  }

  .step-dot:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    transform: scale(1.1);
  }

  .step-dot.active {
    background: color-mix(in srgb, var(--theme-accent, #22d3ee) 25%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #22d3ee) 60%, transparent);
    color: var(--theme-accent, #22d3ee);
  }

  .step-number {
    line-height: 1;
  }
</style>
