<!-- CatDogToggle.svelte - Chip toggle for CatDog mode (different props per hand) -->
<script lang="ts">
  let {
    catDogMode = false,
    onToggle,
  }: {
    catDogMode: boolean;
    onToggle: () => void;
  } = $props();
</script>

<button
  type="button"
  class="catdog-chip"
  class:active={catDogMode}
  onclick={onToggle}
  role="switch"
  aria-checked={catDogMode}
  aria-label="Cat Dog: different props per hand"
>
  <span class="chip-icons">
    <i class="fas fa-cat" aria-hidden="true"></i>
    <i class="fas fa-dog" aria-hidden="true"></i>
  </span>
  <span class="chip-label">Cat Dog</span>
</button>

<style>
  .catdog-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke);
    border-radius: 100px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm);
    font-weight: 500;
    font-family:
      -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif;
    cursor: pointer;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal),
      color var(--transition-normal),
      box-shadow var(--transition-normal),
      transform var(--transition-fast);
    -webkit-tap-highlight-color: transparent;
    flex-shrink: 0;
    align-self: flex-start;
  }

  .catdog-chip:hover:not(.active) {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .catdog-chip:active {
    transform: scale(0.97);
  }

  .catdog-chip.active {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-text);
    box-shadow:
      0 0 12px color-mix(in srgb, var(--theme-accent) 15%, transparent),
      inset 0 1px 0 var(--theme-stroke);
  }

  .chip-icons {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-sm);
    line-height: 1;
    color: inherit;
  }

  .catdog-chip.active .chip-icons i:first-child {
    color: var(--prop-blue);
  }

  .catdog-chip.active .chip-icons i:last-child {
    color: var(--prop-red);
  }

  .chip-label {
    font-size: inherit;
    font-weight: inherit;
    letter-spacing: -0.2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .catdog-chip {
      transition: none;
    }
  }
</style>
