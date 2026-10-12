<script lang="ts">
  /**
   * ActionButton - Primary action button with gradient styling
   *
   * Used for prominent actions like "Spawn UFO", "Regenerate", etc.
   * Consistent 48px touch target, gradient background.
   *
   * @example
   * <ActionButton
   *   label="Spawn UFO"
   *   icon="fa-satellite"
   *   color="default"
   *   fullWidth
   *   onclick={handleSpawn}
   * />
   */

  type ColorPreset = "default" | "cyan" | "fuse" | "theme";

  interface Props {
    label: string;
    icon?: string;
    color?: ColorPreset;
    fullWidth?: boolean;
    disabled?: boolean;
    /** Keeps an unavailable action discoverable in the keyboard order. */
    ariaDisabled?: boolean;
    ariaDescribedBy?: string;
    busy?: boolean;
    busyLabel?: string;
    onclick: () => void;
  }

  let {
    label,
    icon,
    color = "default",
    fullWidth = false,
    disabled = false,
    ariaDisabled = false,
    ariaDescribedBy,
    busy = false,
    busyLabel = label,
    onclick,
  }: Props = $props();

  function handleClick(): void {
    if (disabled || ariaDisabled || busy) return;
    onclick();
  }
</script>

<button
  class="action-button"
  class:full-width={fullWidth}
  data-color={color}
  {disabled}
  aria-disabled={ariaDisabled || busy || undefined}
  aria-describedby={ariaDescribedBy}
  aria-busy={busy || undefined}
  onclick={handleClick}
  type="button"
>
  {#if icon}
    <i class="fas {icon}" aria-hidden="true"></i>
  {/if}
  <span>{busy ? busyLabel : label}</span>
</button>

<style>
  .action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 24px;
    min-height: var(--min-touch-target);
    background: var(--action-gradient);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 20px;
    color: var(--action-text, #ffffff);
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard);
    box-shadow: var(--action-shadow);
    -webkit-tap-highlight-color: transparent;
  }

  .action-button.full-width {
    width: 100%;
  }

  .action-button i {
    font-size: 0.85rem;
  }

  /* Disabled state */
  .action-button:disabled,
  .action-button[aria-disabled="true"],
  .action-button[aria-busy="true"] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Hover - ONLY on devices that support hover (not touch) */
  @media (hover: hover) {
    .action-button:hover:not(:disabled):not([aria-disabled="true"]):not(
        [aria-busy="true"]
      ) {
      transform: translateY(-1px);
      box-shadow: var(--action-shadow-hover);
    }
  }

  .action-button:active:not(:disabled):not([aria-disabled="true"]):not(
      [aria-busy="true"]
    ) {
    transform: scale(0.98);
  }

  /* Focus visible for keyboard navigation */
  .action-button:focus-visible {
    outline: 2px solid var(--action-focus);
    outline-offset: 2px;
  }

  /* Color: Default (Purple) */
  .action-button[data-color="default"] {
    --action-gradient: linear-gradient(135deg, #6366f1, #8b5cf6);
    --action-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
    --action-shadow-hover: 0 6px 16px rgba(99, 102, 241, 0.4);
    --action-focus: #6366f1;
  }

  /* Color: Cyan (Ocean) */
  .action-button[data-color="cyan"] {
    --action-gradient: linear-gradient(135deg, #06b6d4, #22d3ee);
    --action-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);
    --action-shadow-hover: 0 6px 16px rgba(6, 182, 212, 0.4);
    --action-focus: #06b6d4;
  }

  /* Color: Fuse (Orange with a dark foreground that clears AAA contrast) */
  .action-button[data-color="fuse"] {
    --action-gradient: linear-gradient(135deg, #f59e0b, #fb923c 50%, #f47d20);
    --action-text: #0b0b0f;
    --action-shadow: 0 4px 12px rgba(234, 88, 12, 0.28);
    --action-shadow-hover: 0 6px 16px rgba(234, 88, 12, 0.38);
    --action-focus: var(--theme-text, #0b0b0f);
  }

  /* Color: Current app theme */
  .action-button[data-color="theme"] {
    --action-gradient: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 86%, white),
      var(--theme-accent, #8b5cf6)
    );
    --action-text: var(--theme-text-on-accent, #ffffff);
    --action-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 28%, transparent);
    --action-shadow-hover: 0 7px 18px
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 38%, transparent);
    --action-focus: color-mix(in srgb, var(--theme-accent, #8b5cf6) 55%, white);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .action-button {
      transition: none;
    }
    .action-button:hover:not(:disabled),
    .action-button:active:not(:disabled) {
      transform: none;
    }
  }
</style>
