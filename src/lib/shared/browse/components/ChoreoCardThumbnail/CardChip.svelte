<!--
CardChip.svelte

The small glass chip that sits over a browse card's artwork. Owns the shell —
touch target, glassmorphic surface, hover/active/focus states, light-mode
variant, reduced-motion — so every chip on a card is literally the same object
rather than a lookalike that drifts.

Positioning belongs to the card, not to the chip: the card lays its chips out
in one bottom-right row so they can never overlap each other.

Consumers: VariationPill (cycle versions), PreviewPlayChip (play the sequence).
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  const {
    label,
    title,
    onActivate,
    pressed,
    children,
  }: {
    /** Screen-reader name. Required — these chips are icon/number only. */
    label: string;
    title?: string;
    onActivate: () => void;
    /** Set for toggle chips; drives aria-pressed and the active styling. */
    pressed?: boolean;
    children: Snippet;
  } = $props();

  // The card itself is a button that opens the viewer. Every chip interaction
  // has to stop short of it or tapping a chip also navigates.
  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    onActivate();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      onActivate();
    }
  }

  function swallow(event: Event) {
    event.stopPropagation();
  }
</script>

<button
  class="card-chip"
  class:pressed
  type="button"
  aria-label={label}
  aria-pressed={pressed}
  {title}
  onclick={handleClick}
  onkeydown={handleKeydown}
  onpointerdown={swallow}
  onpointerup={swallow}
>
  <span class="chip-content">{@render children()}</span>
</button>

<style>
  .card-chip {
    /* var(--min-touch-target) minimum touch target (WCAG AA) */
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);

    /* Visual styling - smaller appearance but large tap target */
    padding: 4px 10px;
    display: flex;
    align-items: center;
    justify-content: center;

    /* Subtle glassmorphic background */
    background: var(--theme-overlay-bg, rgba(0, 0, 0, 0.5));
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));

    /* Text styling */
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.5px;

    /* Interaction */
    cursor: pointer;
    transition:
      transform var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }

  .card-chip:hover {
    background: var(--theme-overlay-bg-hover, rgba(0, 0, 0, 0.7));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    transform: scale(1.05);
  }

  .card-chip:active {
    transform: scale(0.95);
  }

  .card-chip:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .card-chip.pressed {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
    color: #fff;
  }

  .chip-content {
    display: flex;
    align-items: center;
    justify-content: center;
    /* Prevent text selection */
    user-select: none;
    pointer-events: none;
  }

  /* Light mode variant */
  :global(.choreo-card.light-mode) .card-chip {
    background: var(--theme-overlay-bg-light, rgba(255, 255, 255, 0.8));
    border-color: var(--theme-stroke-light, rgba(0, 0, 0, 0.15));
    color: var(--theme-text-light, rgba(0, 0, 0, 0.8));
  }

  :global(.choreo-card.light-mode) .card-chip:hover {
    background: var(--theme-overlay-bg-light-hover, rgba(255, 255, 255, 0.95));
    border-color: var(--theme-stroke-strong-light, rgba(0, 0, 0, 0.25));
  }

  :global(.choreo-card.light-mode) .card-chip.pressed {
    color: #fff;
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .card-chip {
      transition: none;
    }

    .card-chip:hover,
    .card-chip:active {
      transform: none;
    }
  }
</style>
