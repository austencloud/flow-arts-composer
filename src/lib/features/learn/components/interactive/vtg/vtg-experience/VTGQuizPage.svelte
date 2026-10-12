<!--
VTGQuizPage - Quiz page wrapper for VTG concept experience
-->
<script lang="ts">
  import VTGQuiz from "../VTGQuiz.svelte";

  let { onComplete }: { onComplete: () => void } = $props();
</script>

<div class="page quiz-page">
  <h2>Test Your Knowledge</h2>
  <p>Identify the VTG modes by watching the animations!</p>

  <VTGQuiz {onComplete} />
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

  p {
    font-size: 1.125rem;
    line-height: 1.7;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    margin: 0;
    text-align: center;
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
