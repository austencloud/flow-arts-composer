<!--
Type1Feedback - Shows feedback after answer
-->
<script lang="ts">
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";
  import type { PatternInfo } from "../../../../../domain/constants/type1-letter-questions";

  let {
    answerState,
    letter,
    correctInfo,
  }: {
    answerState: "correct" | "incorrect";
    letter: Letter;
    correctInfo: PatternInfo;
  } = $props();
</script>

<div
  class="feedback"
  class:correct={answerState === "correct"}
  class:incorrect={answerState === "incorrect"}
>
  {#if answerState === "correct"}
    <span>
      Correct! <strong>{letter}</strong> is
      <strong style="color: {correctInfo.color}">{correctInfo.label}</strong>
    </span>
  {:else}
    <span>
      Not quite! <strong>{letter}</strong> is
      <strong style="color: {correctInfo.color}">{correctInfo.label}</strong>
    </span>
  {/if}
</div>

<style>
  .feedback {
    padding: 0.875rem 1.25rem;
    border-radius: 10px;
    font-size: 0.9375rem;
    text-align: center;
    animation: slideUp var(--duration-emphasis) ease;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .feedback.correct {
    background: color-mix(in srgb, var(--theme-accent, #22d3ee) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent);
    color: var(--theme-accent, #22d3ee);
  }

  .feedback.incorrect {
    background: color-mix(in srgb, var(--semantic-warning, #fb923c) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-warning, #fb923c) 30%, transparent);
    color: var(--semantic-warning, #fb923c);
  }

  @media (prefers-reduced-motion: reduce) {
    .feedback {
      animation: none;
    }
  }
</style>
