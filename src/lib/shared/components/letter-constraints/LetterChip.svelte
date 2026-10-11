<!--
LetterChip.svelte - Letter selection chip with 50px touch target
Supports include (green) and exclude (red) modes
-->
<script lang="ts">
  import type { Letter } from "#lib/shared/foundation/domain/models/letter.js";

  let {
    letter,
    isSelected = false,
    mode = "include",
    onClick,
  } = $props<{
    letter: Letter;
    isSelected?: boolean;
    mode?: "include" | "exclude";
    onClick: () => void;
  }>();
</script>

<button
  class="letter-chip"
  class:selected={isSelected}
  class:include={mode === "include"}
  class:exclude={mode === "exclude"}
  onclick={onClick}
  aria-pressed={isSelected}
>
  {letter}
</button>

<style>
  .letter-chip {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;

    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 12px;

    color: white;
    font-size: var(--font-size-lg);
    font-weight: 700;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;

    cursor: pointer;
    transition: all var(--duration-fast) ease;

    touch-action: manipulation;
  }

  .letter-chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    transform: scale(1.05);
  }

  .letter-chip:active {
    transform: scale(0.95);
  }

  /* Include mode (green) */
  .letter-chip.include.selected {
    background: rgba(34, 197, 94, 0.35);
    border-color: var(--semantic-success);
    color: #4ade80;
    box-shadow: 0 0 12px rgba(34, 197, 94, 0.4);
  }

  /* Exclude mode (red) */
  .letter-chip.exclude.selected {
    background: rgba(239, 68, 68, 0.35);
    border-color: var(--semantic-error);
    color: var(--semantic-error);
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.4);
  }

  /* High contrast mode */
  @media (prefers-contrast: high) {
    .letter-chip {
      border-width: 2px;
    }

    .letter-chip.selected {
      border-width: 3px;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .letter-chip {
      transition: none;
    }

    .letter-chip:hover,
    .letter-chip:active {
      transform: none;
    }
  }
</style>
