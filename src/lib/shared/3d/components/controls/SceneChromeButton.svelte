<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    icon: string;
    label: string;
    active?: boolean;
    tooltipSide?: "left" | "bottom";
  }

  let {
    icon,
    label,
    active = false,
    tooltipSide = "left",
    type = "button",
    title,
    class: className,
    ...buttonProps
  }: Props = $props();
</script>

<button
  {...buttonProps}
  {type}
  class="scene-chrome-button {className ?? ''}"
  class:active
  data-tooltip={label}
  data-tooltip-side={tooltipSide}
  aria-label={label}
  title={title ?? label}
>
  <i class="fas {icon}" aria-hidden="true"></i>
</button>

<style>
  .scene-chrome-button {
    position: relative;
    box-sizing: border-box;
    display: grid;
    width: 3rem;
    min-width: var(--min-touch-target, 44px);
    height: 3rem;
    min-height: var(--min-touch-target, 44px);
    place-items: center;
    padding: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-panel-bg, #0c0e16);
    box-shadow:
      0 0.25rem 1rem rgba(0, 0, 0, 0.36),
      inset 0 1px 0 rgba(255, 255, 255, 0.035);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }

  .scene-chrome-button:hover,
  .scene-chrome-button:focus-visible {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #fff);
  }

  .scene-chrome-button:active:not(:disabled) {
    transform: scale(0.94);
  }

  .scene-chrome-button:focus-visible {
    outline: 2px solid var(--theme-accent, #4a9eff);
    outline-offset: 2px;
  }

  .scene-chrome-button.active {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 58%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 18%,
      var(--theme-card-bg, #121520)
    );
    color: color-mix(in srgb, var(--theme-accent, #4a9eff) 70%, #fff);
  }

  .scene-chrome-button:disabled {
    cursor: wait;
    opacity: 0.58;
  }

  .scene-chrome-button i {
    font-size: 1rem;
  }

  .scene-chrome-button:hover::after,
  .scene-chrome-button:focus-visible::after {
    content: attr(data-tooltip);
    position: absolute;
    z-index: 50;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.5rem;
    background: var(--theme-panel-bg, #0c0e16);
    box-shadow: 0 0.375rem 1.5rem rgba(0, 0, 0, 0.45);
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
    line-height: 1.2;
    white-space: nowrap;
    pointer-events: none;
  }

  .scene-chrome-button[data-tooltip-side="left"]:hover::after,
  .scene-chrome-button[data-tooltip-side="left"]:focus-visible::after {
    top: 50%;
    right: calc(100% + 0.625rem);
    transform: translateY(-50%);
  }

  .scene-chrome-button[data-tooltip-side="bottom"]:hover::after,
  .scene-chrome-button[data-tooltip-side="bottom"]:focus-visible::after {
    top: calc(100% + 0.625rem);
    right: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .scene-chrome-button {
      transition: none;
    }

    .scene-chrome-button:active:not(:disabled) {
      transform: none;
    }
  }
</style>
