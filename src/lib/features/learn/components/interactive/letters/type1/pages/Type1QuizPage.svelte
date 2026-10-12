<!--
Type1QuizPage - Quiz page wrapper for Type 1 letters
Page 5 of 5: Test knowledge with Type1LetterQuiz component
-->
<script lang="ts">
  import Type1LetterQuiz from "../Type1LetterQuiz.svelte";

  interface Props {
    onComplete: () => void;
    onPrevious: () => void;
  }

  let { onComplete, onPrevious }: Props = $props();
</script>

<div class="page quiz-page">
  <h2>Test Your Knowledge</h2>
  <p class="quiz-intro">Identify the motion types for Type 1 letters!</p>

  <Type1LetterQuiz {onComplete} />
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 700px;
    margin: 0 auto;
    width: 100%;
    animation: slideInUp var(--duration-dramatic) var(--ease-standard);
  }

  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  h2 {
    font-size: 1.875rem;
    font-weight: 700;
    color: white;
    margin: 0;
    text-align: center;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #22d3ee) 0%,
      var(--theme-accent, #06b6d4) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .quiz-intro {
    font-size: 1.125rem;
    line-height: 1.7;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    margin: 0;
    text-align: center;
    margin-bottom: 1rem;
  }

  .quiz-page {
    max-width: 700px;
  }

  @media (max-width: 600px) {
    h2 {
      font-size: 1.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page {
      animation: none;
    }
  }
</style>
