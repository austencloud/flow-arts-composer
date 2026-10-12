<!--
VTGNextButton - Next question/see results button
-->
<script lang="ts">
  let {
    isLastQuestion,
    onclick,
  }: {
    isLastQuestion: boolean;
    onclick: () => void;
  } = $props();
</script>

<button class="next-button" {onclick}>
  {isLastQuestion ? "See Results" : "Next Question"}
  <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
</button>

<style>
  .next-button {
    align-self: center;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 2rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 25%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 25%, transparent) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent);
    border-radius: 10px;
    color: var(--theme-accent, #22d3ee);
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard);
  }

  .next-button:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 35%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 35%, transparent) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 60%,
      transparent
    );
  }
</style>
