<!--
Type1LetterDisplay - Shows the current letter being quizzed
-->
<script lang="ts">
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";

  let { letter }: { letter: Letter } = $props();
</script>

<div class="letter-display">
  <span class="quiz-letter">{letter}</span>
</div>

<style>
  .letter-display {
    padding: 0.75rem 2rem;
    background: color-mix(in srgb, var(--theme-accent, #22d3ee) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent);
    border-radius: 12px;
  }

  .quiz-letter {
    font-size: 2.5rem;
    font-weight: 800;
    color: var(--theme-accent, #22d3ee);
  }

  @media (max-width: 500px) {
    .quiz-letter {
      font-size: 2rem;
    }
  }
</style>
