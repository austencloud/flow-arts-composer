<!--
VTGAnswerButton - Single answer button with state styling
-->
<script lang="ts">
  import type { VTGMode } from "../../../../domain/constants/vtg-quiz-data";

  let {
    mode,
    name,
    color,
    isSelected,
    isCorrect,
    showResult,
    onclick,
    disabled = false,
  }: {
    mode: VTGMode;
    name: string;
    color: string;
    isSelected: boolean;
    isCorrect: boolean;
    showResult: boolean;
    onclick: () => void;
    disabled?: boolean;
  } = $props();

  const showIncorrect = $derived(showResult && isSelected && !isCorrect);
  const showCorrectMark = $derived(showResult && isCorrect);
</script>

<button
  class="answer-button"
  class:selected={isSelected}
  class:correct={showResult && isCorrect}
  class:incorrect={showIncorrect}
  style="--type-color: {color}"
  {onclick}
  {disabled}
  aria-label="Select {name} ({mode})"
>
  <span class="mode-code">{mode}</span>
  <span class="mode-name">{name}</span>
  {#if showCorrectMark}
    <i class="fa-solid fa-check result-icon" aria-hidden="true"></i>
  {:else if showIncorrect}
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
    background: color-mix(in srgb, var(--semantic-error) 15%, transparent);
    border-color: var(--semantic-error);
    color: var(--semantic-error);
  }

  .mode-code {
    font-family: monospace;
    font-size: 0.875rem;
    font-weight: 800;
  }

  .mode-name {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    opacity: 0.8;
  }

  .result-icon {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.75rem;
  }
</style>
