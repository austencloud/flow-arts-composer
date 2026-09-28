<!--
QuizLetterButton - Answer button for quiz
-->
<script lang="ts">
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte";
  let {
    letter,
    state,
    disabled,
    onclick,
  }: {
    letter: string;
    state: "default" | "correct" | "incorrect" | "dimmed";
    disabled: boolean;
    onclick: () => void;
  } = $props();
</script>

<button
  class="answer-btn"
  class:correct={state === "correct"}
  class:incorrect={state === "incorrect"}
  class:dimmed={state === "dimmed"}
  {onclick}
  {disabled}
  aria-label={tDynamic("learn_controls_answer_letter", { letter })}
>
  <span class="letter-container">
    <span class="letter">{letter}</span>
  </span>
  {#if state === "correct"}
    <span class="result-icon correct-icon">✓</span>
  {:else if state === "incorrect"}
    <span class="result-icon incorrect-icon">✗</span>
  {/if}
</button>

<style>
  .answer-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    padding: 0.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 14px;
    cursor: pointer;
    transition: all var(--duration-normal) cubic-bezier(0.16, 1, 0.3, 1);
  }

  .answer-btn:hover:not(:disabled) {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    transform: translateY(-3px);
    box-shadow: 0 8px 24px
      color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  .answer-btn:active:not(:disabled) {
    transform: translateY(-1px) scale(0.98);
  }

  .letter-container {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .letter {
    font-size: 1.875rem;
    font-weight: 800;
    color: var(--theme-text, #ffffff);
    font-family: Georgia, serif;
    text-shadow: 0 2px 8px color-mix(in srgb, var(--theme-panel-bg) 60%, transparent);
  }

  .answer-btn.correct {
    background: color-mix(in srgb, var(--semantic-success) 20%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success) 60%, transparent);
    animation: correctPulse 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes correctPulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--semantic-success) 40%, transparent);
    }
    50% {
      transform: scale(1.04);
      box-shadow: 0 0 0 10px transparent;
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 transparent;
    }
  }

  .answer-btn.incorrect {
    background: color-mix(in srgb, var(--semantic-error) 20%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error) 60%, transparent);
    animation: incorrectShake var(--duration-dramatic) ease-out;
  }

  @keyframes incorrectShake {
    0%,
    100% {
      transform: translateX(0);
    }
    20%,
    60% {
      transform: translateX(-5px);
    }
    40%,
    80% {
      transform: translateX(5px);
    }
  }

  .answer-btn.dimmed {
    opacity: 0.35;
    cursor: default;
  }

  .answer-btn:disabled {
    cursor: default;
  }

  .result-icon {
    position: absolute;
    top: 6px;
    right: 6px;
    font-size: 0.9rem;
    font-weight: bold;
    animation: iconPop var(--duration-emphasis) cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  @keyframes iconPop {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .correct-icon {
    color: var(--semantic-success);
  }

  .incorrect-icon {
    color: var(--semantic-error);
  }

  @media (min-width: 600px) {
    .answer-btn {
      border-radius: 16px;
    }

    .letter {
      font-size: 2.25rem;
    }
  }

  @media (min-width: 900px) {
    .answer-btn {
      border-radius: 18px;
    }

    .letter {
      font-size: 2.75rem;
    }
  }

  @media (min-width: 1200px) {
    .letter {
      font-size: 3.25rem;
    }
  }

  @media (min-width: 1920px) {
    .answer-btn {
      padding: 0.875rem;
      border-radius: 20px;
    }

    .letter {
      font-size: 3.75rem;
    }

    .result-icon {
      font-size: 1.125rem;
    }
  }

  @media (min-width: 2560px) {
    .answer-btn {
      padding: 1.125rem;
      border-radius: 22px;
    }

    .letter {
      font-size: 4.5rem;
    }

    .result-icon {
      font-size: 1.25rem;
      top: 10px;
      right: 10px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .answer-btn.correct,
    .answer-btn.incorrect,
    .result-icon {
      animation: none;
    }

    .answer-btn {
      transition:
        background 0.15s ease,
        border-color 0.15s ease;
    }
  }
</style>
