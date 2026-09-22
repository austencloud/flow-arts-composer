<script lang="ts">
  import "../customize-accent.css";
  import type { Snippet } from "svelte";
  import { quintOut } from "svelte/easing";
  import { scale } from "svelte/transition";

  let {
    title,
    titleId,
    closeLabel,
    onClose,
    actions,
    entrance = "scale",
    children,
  }: {
    title: string;
    titleId?: string;
    closeLabel: string;
    onClose: () => void;
    actions?: Snippet;
    /** How the panel arrives. `scale` is the card-overlay entrance: the panel
     *  covers a card that is already there, so it needs its own motion. `none`
     *  is for hosts whose container is what animates — a grid track opening, a
     *  sheet sliding in. Scaling inside one of those is two motions of
     *  different lengths and easings fighting over the same panel, which reads
     *  as a stutter rather than as two things happening. */
    entrance?: "scale" | "none";
    children: Snippet;
  } = $props();
</script>

<div
  class="generation-settings-overlay customize-accent-scope"
  transition:scale={{
    start: entrance === "none" ? 1 : 0.95,
    duration: entrance === "none" ? 0 : 250,
    easing: quintOut,
  }}
>
  <div class="overlay-header">
    <h3 class="overlay-title" id={titleId}>{title}</h3>
    {#if actions}
      {@render actions()}
    {/if}
    <button class="close-button" onclick={onClose} aria-label={closeLabel}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>

  {@render children()}
</div>

<style>
  .generation-settings-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    overflow: hidden;
    background-color: var(--customize-surface-solid);
    background-image:
      var(--customize-surface-gradient), var(--customize-surface-wash-layer);
    border: 2px solid
      color-mix(in srgb, var(--customize-accent) 40%, transparent);
    border-radius: 16px;
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.4),
      0 0 24px color-mix(in srgb, var(--customize-accent) 20%, transparent);
  }

  /* The band is as tall as the close button, and the button is sized for a
     thumb. On a mouse that was 48px of panel height under one word, on top of
     the 16px of panel padding above it and the 8px column gap below. The
     margin was a fourth separator between the two. */
  .overlay-header {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    gap: 8px;
  }

  .overlay-title {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--theme-text, white);
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
    letter-spacing: 0.3px;
  }

  .close-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: max(var(--min-touch-target, 44px), 44px);
    height: max(var(--min-touch-target, 44px), 44px);
    min-width: 44px;
    min-height: 44px;
    flex-shrink: 0;
    padding: 8px;
    color: var(--theme-text, white);
    cursor: pointer;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 8px;
    transition:
      background var(--duration-normal) ease,
      border-color var(--duration-normal) ease;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
  }

  .close-button svg {
    width: 20px;
    height: 20px;
  }

  /* A mouse does not need the thumb target, and every pixel this band does not
     take is one the panel's own content gets. 34px is still well past the 24px
     minimum for a pointer-driven control; coarse pointers keep the full 44. */
  @media (pointer: fine) {
    .close-button {
      width: 34px;
      height: 34px;
      min-width: 34px;
      min-height: 34px;
      padding: 6px;
    }

    .close-button svg {
      width: 18px;
      height: 18px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .close-button {
      transition: none;
    }
  }
</style>
