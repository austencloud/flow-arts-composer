<!--
QuizPrompt - Displays the target placement type the user must build.
Large Greek symbol with placement name and color accent.
-->
<script lang="ts">
  import {
    PLACEMENT_TYPE_INFO,
    type PlacementType,
  } from "../../../../domain/constants/placement-quiz-data";

  interface Props {
    targetType: PlacementType;
  }

  let { targetType }: Props = $props();

  const TYPE_COLORS: Record<PlacementType, string> = {
    alpha: "#22d3ee",
    beta: "#f59e0b",
    gamma: "#a78bfa",
  };

  const info = $derived(PLACEMENT_TYPE_INFO[targetType]);
  const color = $derived(TYPE_COLORS[targetType]);
</script>

<div class="quiz-prompt" style="--prompt-color: {color};">
  <span class="prompt-label">Build a</span>
  <div class="prompt-target">
    <span class="prompt-symbol">{info.symbol}</span>
    <span class="prompt-name">{info.label}</span>
  </div>
  <span class="prompt-label">placement</span>
</div>

<style>
  .quiz-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 1rem;
    text-align: center;
  }

  .prompt-label {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, rgba(255, 255, 255, 0.7));
    font-weight: 500;
  }

  .prompt-target {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
  }

  .prompt-symbol {
    font-size: 3rem;
    line-height: 1;
    color: var(--prompt-color);
    font-weight: 700;
    text-shadow: 0 0 20px color-mix(in srgb, var(--prompt-color) 40%, transparent);
  }

  .prompt-name {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--prompt-color);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  @media (prefers-reduced-motion: reduce) {
    .prompt-symbol {
      text-shadow: none;
    }
  }
</style>
