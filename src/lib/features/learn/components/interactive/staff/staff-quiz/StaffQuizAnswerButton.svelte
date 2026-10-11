<!--
StaffQuizAnswerButton - Single answer option button
-->
<script lang="ts">
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import type { AnswerInfo } from "../../../../domain/constants/staff-quiz-questions";

  let {
    option,
    info,
    isSelected,
    showCorrect,
    showIncorrect,
    revealCorrect,
    answerState,
    disabled,
    onSelect,
  }: {
    option: string;
    info: AnswerInfo;
    isSelected: boolean;
    showCorrect: boolean;
    showIncorrect: boolean;
    revealCorrect: boolean;
    answerState: "idle" | "correct" | "incorrect";
    disabled: boolean;
    onSelect: () => void;
  } = $props();

  const label = $derived(
    tDynamic(
      `learn_staff_answer_${option
        .toLowerCase()
        .replaceAll(/[^a-z]+/g, "_")
        .replace(/^_|_$/g, "")}`
    )
  );
</script>

<button
  class="answer-btn"
  class:selected={isSelected}
  class:correct={showCorrect || revealCorrect}
  class:incorrect={showIncorrect}
  style="--type-color: {info.color}"
  onclick={onSelect}
  {disabled}
  aria-label={tDynamic("learn_staff_select_answer", { answer: label })}
>
  <i class="fa-solid {info.icon}" aria-hidden="true"></i>
  <span>{label}</span>
  {#if answerState !== "idle" && isSelected}
    <span class="result-icon">{answerState === "correct" ? "✓" : "✗"}</span>
  {:else if revealCorrect}
    <span class="result-icon correct">✓</span>
  {/if}
</button>

<style>
  .answer-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 0.75rem;
    min-height: 80px;
    background: var(--theme-card-bg);
    border: 2px solid var(--theme-stroke-strong);
    border-radius: 12px;
    color: white;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    position: relative;
  }

  .answer-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--type-color) 15%, transparent);
    border-color: color-mix(in srgb, var(--type-color) 50%, transparent);
    transform: translateY(-2px);
  }

  .answer-btn:disabled {
    cursor: default;
  }

  .answer-btn i {
    font-size: 1.25rem;
    color: var(--type-color);
  }

  .answer-btn span {
    text-align: center;
    line-height: 1.2;
  }

  .answer-btn.correct {
    background: color-mix(in srgb, var(--type-color) 20%, transparent);
    border-color: var(--type-color);
    animation: correctPulse 0.5s ease;
  }

  @keyframes correctPulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.03);
    }
    100% {
      transform: scale(1);
    }
  }

  .answer-btn.incorrect {
    background: color-mix(in srgb, var(--semantic-error) 20%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error) 60%, transparent);
    animation: shake var(--duration-dramatic) ease;
  }

  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-4px);
    }
    75% {
      transform: translateX(4px);
    }
  }

  .result-icon {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    font-size: 1rem;
    font-weight: 700;
    color: var(--semantic-error);
  }

  .result-icon.correct,
  .answer-btn.correct .result-icon {
    color: var(--type-color);
  }

  @media (max-width: 500px) {
    .answer-btn {
      flex-direction: row;
      justify-content: center;
      gap: 0.75rem;
      min-height: var(--min-touch-target);
      padding: 0.875rem 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .answer-btn {
      animation: none;
      transition: none;
    }
  }
</style>
