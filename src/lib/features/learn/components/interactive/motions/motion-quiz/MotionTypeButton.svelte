<!--
MotionTypeButton - Answer button for motion type selection
-->
<script lang="ts">
  import type {
    MotionTypeNumber,
    MotionTypeInfo,
  } from "../../../../domain/constants/motion-quiz-data";

  let {
    type,
    isSelected,
    isCorrect,
    showResult,
    disabled,
    onclick,
  }: {
    type: MotionTypeInfo;
    isSelected: boolean;
    isCorrect: boolean;
    showResult: boolean;
    disabled: boolean;
    onclick: () => void;
  } = $props();
</script>

<button
  class="answer-button"
  class:selected={isSelected}
  class:correct={showResult && isCorrect}
  class:incorrect={showResult && isSelected && !isCorrect}
  style="--type-color: {type.color}"
  {onclick}
  {disabled}
  aria-label="Select Type {type.num}: {type.name}"
>
  <span class="type-num">{type.num}</span>
  <span class="type-name">{type.name}</span>
  {#if showResult && isCorrect}
    <i class="fa-solid fa-check result-icon" aria-hidden="true"></i>
  {:else if showResult && isSelected && !isCorrect}
    <i class="fa-solid fa-xmark result-icon" aria-hidden="true"></i>
  {/if}
</button>

<style>
  .answer-button {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem 0.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke);
    border-radius: 10px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard);
    position: relative;
  }

  .answer-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--type-color) 10%, transparent);
    border-color: color-mix(in srgb, var(--type-color) 40%, transparent);
    color: var(--type-color);
  }

  .answer-button:disabled {
    cursor: default;
  }

  .answer-button.selected {
    background: color-mix(in srgb, var(--type-color) 15%, transparent);
    border-color: var(--type-color);
    color: var(--type-color);
  }

  .answer-button.correct {
    background: color-mix(
      in srgb,
      var(--semantic-success, #4ade80) 15%,
      transparent
    );
    border-color: var(--semantic-success, #4ade80);
    color: var(--semantic-success, #4ade80);
  }

  .answer-button.incorrect {
    background: color-mix(
      in srgb,
      var(--semantic-error, #f87171) 15%,
      transparent
    );
    border-color: var(--semantic-error);
    color: var(--semantic-error);
  }

  .type-num {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: currentColor;
    color: black;
    font-size: 0.75rem;
    font-weight: 700;
    border-radius: 6px;
  }

  .type-name {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .result-icon {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.75rem;
  }
</style>
