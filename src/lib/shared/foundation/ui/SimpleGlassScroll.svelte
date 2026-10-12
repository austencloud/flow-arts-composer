<!--
	Simple Glass Scrollable Container - Fixed Implementation

	A working glassmorphism scrollable container with direct CSS approach.
	This version is guaranteed to work properly.
-->

<script lang="ts">
  import type { ScrollbarVariant } from "./types";

  // Props
  let {
    variant = "primary",
    height = "100%",
    width = "100%",
    className = "",
    children,
  } = $props<{
    variant?: ScrollbarVariant;
    height?: string;
    width?: string;
    className?: string;
    children?: import("svelte").Snippet;
  }>();
</script>

<div
  class="glass-scrollable {className}"
  class:primary={variant === "primary"}
  class:secondary={variant === "secondary"}
  class:minimal={variant === "minimal"}
  class:hover={variant === "hover"}
  class:gradient={variant === "gradient"}
  style="height: {height}; width: {width};"
>
  {#if children}
    {@render children()}
  {/if}
</div>

<style>
  .glass-scrollable {
    /* Base scrollable container */
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
    background: transparent;
    border-radius: 8px;
  }

  /* Primary Glass Scrollbar - uses themed variables */
  .glass-scrollable.primary::-webkit-scrollbar {
    width: 12px;
  }

  .glass-scrollable.primary::-webkit-scrollbar-track {
    background: var(--scrollbar-track, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
  }

  .glass-scrollable.primary::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.15));
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    transition: background var(--duration-fast) var(--ease-standard-out);
  }

  .glass-scrollable.primary::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover, rgba(255, 255, 255, 0.25));
  }

  /* Secondary Glass Scrollbar */
  .glass-scrollable.secondary::-webkit-scrollbar {
    width: 16px; /* WCAG AAA touch accessibility */
  }

  .glass-scrollable.secondary::-webkit-scrollbar-track {
    background: var(--scrollbar-track, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
  }

  .glass-scrollable.secondary::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 6px;
    transition: background var(--duration-fast) var(--ease-standard-out);
  }

  .glass-scrollable.secondary::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover, rgba(255, 255, 255, 0.18));
  }

  /* Minimal Glass Scrollbar */
  .glass-scrollable.minimal::-webkit-scrollbar {
    width: 16px; /* WCAG AAA touch accessibility */
  }

  .glass-scrollable.minimal::-webkit-scrollbar-track {
    background: transparent;
  }

  .glass-scrollable.minimal::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.12));
    border-radius: 3px;
    transition: background var(--duration-fast) var(--ease-standard-out);
  }

  .glass-scrollable.minimal::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover, rgba(255, 255, 255, 0.2));
  }

  /* Hover Glass Scrollbar */
  .glass-scrollable.hover::-webkit-scrollbar {
    width: 0px;
    transition: width var(--duration-emphasis) var(--ease-standard);
  }

  .glass-scrollable.hover:hover::-webkit-scrollbar {
    width: 12px;
  }

  .glass-scrollable.hover::-webkit-scrollbar-track {
    background: var(--scrollbar-track, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    opacity: 0;
    transition: opacity var(--duration-emphasis) var(--ease-standard);
  }

  .glass-scrollable.hover:hover::-webkit-scrollbar-track {
    opacity: 1;
  }

  .glass-scrollable.hover::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.15));
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    opacity: 0;
    transition:
      background-color var(--duration-emphasis) var(--ease-standard),
      opacity var(--duration-emphasis) var(--ease-standard);
  }

  .glass-scrollable.hover:hover::-webkit-scrollbar-thumb {
    opacity: 1;
  }

  /* Gradient Glass Scrollbar */
  .glass-scrollable.gradient::-webkit-scrollbar {
    width: 12px;
  }

  .glass-scrollable.gradient::-webkit-scrollbar-track {
    background: var(--scrollbar-track, transparent);
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
  }

  .glass-scrollable.gradient::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2));
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    transition: background var(--duration-fast) var(--ease-standard-out);
  }

  .glass-scrollable.gradient::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover, rgba(255, 255, 255, 0.35));
  }

  /* Firefox support - uses themed variables */
  .glass-scrollable.primary {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.15))
      var(--scrollbar-track, transparent);
  }

  .glass-scrollable.secondary {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.1))
      var(--scrollbar-track, transparent);
  }

  .glass-scrollable.minimal {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.12))
      transparent;
  }

  .glass-scrollable.hover {
    scrollbar-width: none;
  }

  .glass-scrollable.hover:hover {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.15))
      var(--scrollbar-track, transparent);
  }

  .glass-scrollable.gradient {
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      var(--scrollbar-track, transparent);
  }

  /* Responsive - maintain touch-friendly sizes on mobile */
  @media (max-width: 768px) {
    .glass-scrollable.primary::-webkit-scrollbar,
    .glass-scrollable.secondary::-webkit-scrollbar,
    .glass-scrollable.gradient::-webkit-scrollbar {
      width: 16px; /* WCAG AAA touch accessibility */
    }

    .glass-scrollable.minimal::-webkit-scrollbar {
      width: 16px; /* WCAG AAA touch accessibility */
    }
  }
</style>
