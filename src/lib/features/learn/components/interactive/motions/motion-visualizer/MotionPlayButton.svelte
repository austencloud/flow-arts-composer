<!--
MotionPlayButton - Play/replay button for motion animation
-->
<script lang="ts">
  let {
    animating,
    hasCompleted,
    onclick,
  }: {
    animating: boolean;
    hasCompleted: boolean;
    onclick: () => void;
  } = $props();
</script>

<button
  class="play-button"
  {onclick}
  disabled={animating}
  aria-label={animating
    ? "Playing animation"
    : hasCompleted
      ? "Replay animation"
      : "Play animation"}
>
  {#if animating}
    <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
    Playing...
  {:else if hasCompleted}
    <i class="fa-solid fa-redo" aria-hidden="true"></i>
    Replay
  {:else}
    <i class="fa-solid fa-play" aria-hidden="true"></i>
    Play Motion
  {/if}
</button>

<style>
  .play-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 20%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 20%, transparent) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent);
    border-radius: 10px;
    color: var(--theme-accent, #22d3ee);
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard);
    min-width: 140px;
  }

  .play-button:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 60%,
      transparent
    );
  }

  .play-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
</style>
