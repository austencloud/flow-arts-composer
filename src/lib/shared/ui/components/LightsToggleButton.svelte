<!--
  LightsToggleButton.svelte

  Unified toggle button for switching between light/dark visibility modes.
  Used in: Landing page demo, Gallery HUD, Sequence viewer.

  When "on" (lightsOn=true): Shows sun icon - figures are dark on light background
  When "off" (lightsOn=false): Shows moon icon - figures glow on dark background
-->
<script lang="ts">
  interface Props {
    /** Whether lights are on (light mode) */
    lightsOn: boolean;
    /** Callback when toggled */
    onToggle: () => void;
    /** Whether the button is disabled */
    disabled?: boolean;
    /** Size variant */
    size?: "small" | "medium" | "large";
    /** Show text label */
    showLabel?: boolean;
    /** Light mode label */
    lightLabel?: string;
    /** Dark mode label */
    darkLabel?: string;
  }

  let {
    lightsOn,
    onToggle,
    disabled = false,
    size = "medium",
    showLabel = false,
    lightLabel = "Light Mode",
    darkLabel = "Dark Mode",
  }: Props = $props();

  const sizeClasses = {
    small: "size-small",
    medium: "size-medium",
    large: "size-large",
  };
</script>

<button
  class="lights-toggle {sizeClasses[size]}"
  class:lights-on={lightsOn}
  onclick={onToggle}
  {disabled}
  aria-label={lightsOn ? `Switch to dark mode` : `Switch to light mode`}
  title={lightsOn ? darkLabel : lightLabel}
>
  <i class="fas {lightsOn ? 'fa-sun' : 'fa-moon'}" aria-hidden="true"></i>
  {#if showLabel}
    <span class="label">{lightsOn ? lightLabel : darkLabel}</span>
  {/if}
</button>

<style>
  .lights-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: var(--theme-card-bg, rgba(0, 0, 0, 0.6));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 50%;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard);
  }

  /* Has label - pill shape */
  .lights-toggle:has(.label) {
    border-radius: 8px;
    padding: 10px 16px;
  }

  /* Sizes */
  .size-small {
    width: 40px;
    height: 40px;
    font-size: 16px;
  }

  .size-medium {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    font-size: 18px;
  }

  .size-large {
    width: 56px;
    height: 56px;
    font-size: 22px;
  }

  /* With label, sizes affect padding */
  .size-small:has(.label) {
    width: auto;
    height: auto;
    padding: 8px 14px;
    font-size: 14px;
  }

  .size-medium:has(.label) {
    width: auto;
    height: auto;
    padding: 10px 16px;
    font-size: 14px;
  }

  .size-large:has(.label) {
    width: auto;
    height: auto;
    padding: 12px 20px;
    font-size: 16px;
  }

  .label {
    font-weight: 500;
    font-size: inherit;
  }

  /* Hover state */
  .lights-toggle:hover:not(:disabled) {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: var(--theme-text, #ffffff);
    transform: scale(1.05);
  }

  .lights-toggle:active:not(:disabled) {
    transform: scale(0.95);
  }

  /* Lights ON state - warm glow */
  .lights-toggle.lights-on {
    background: rgba(245, 158, 11, 0.15);
    border-color: rgba(245, 158, 11, 0.4);
    color: #f59e0b;
    box-shadow:
      0 0 16px rgba(245, 158, 11, 0.2),
      inset 0 0 12px rgba(245, 158, 11, 0.1);
  }

  .lights-toggle.lights-on:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.25);
    border-color: rgba(245, 158, 11, 0.6);
    box-shadow:
      0 0 24px rgba(245, 158, 11, 0.3),
      inset 0 0 16px rgba(245, 158, 11, 0.15);
  }

  /* Lights OFF state - cool glow */
  .lights-toggle:not(.lights-on) {
    background: rgba(99, 102, 241, 0.15);
    border-color: rgba(99, 102, 241, 0.4);
    color: var(--theme-accent-strong, #818cf8);
    box-shadow:
      0 0 16px rgba(99, 102, 241, 0.2),
      inset 0 0 12px rgba(99, 102, 241, 0.1);
  }

  .lights-toggle:not(.lights-on):hover:not(:disabled) {
    background: rgba(99, 102, 241, 0.25);
    border-color: rgba(99, 102, 241, 0.6);
    box-shadow:
      0 0 24px rgba(99, 102, 241, 0.3),
      inset 0 0 16px rgba(99, 102, 241, 0.15);
  }

  /* Disabled state */
  .lights-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .lights-toggle {
      transition: none;
    }

    .lights-toggle:hover:not(:disabled),
    .lights-toggle:active:not(:disabled) {
      transform: none;
    }
  }
</style>
