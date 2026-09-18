<script lang="ts">
  /**
   * PanelButton - Button component with primary/secondary variants
   */

  import type { Snippet } from "svelte";

  type ButtonVariant = "primary" | "secondary";

  interface Props {
    /** Button variant */
    variant?: ButtonVariant;
    /** Navigation keeps native link behavior with the same panel treatment. */
    href?: string;
    /** Optional domain identity tint across the whole control. */
    accentColor?: string;
    /** Content to render */
    children: Snippet;
    /** Click handler */
    onclick?: (event: MouseEvent) => void;
    /** Disabled state */
    disabled?: boolean;
    /** Button type */
    type?: "button" | "submit" | "reset";
    /** Full width */
    fullWidth?: boolean;
    /** Accessible name when the visible label is shortened responsively. */
    ariaLabel?: string;
    /** Exposes the native button for focus restoration after inline editing. */
    ref?: HTMLButtonElement | null;
    /** Announces that the button's action is in progress. */
    ariaBusy?: boolean;
    /** For a disclosure button: whether the region it controls is open. */
    ariaExpanded?: boolean;
    /** For a disclosure button: the id of the region it opens. */
    ariaControls?: string;
    /** For a button that toggles a mode on and off: whether it is currently on. */
    ariaPressed?: boolean;
    /** Makes this the active surface's Ctrl/Cmd+S target. */
    saveShortcut?: boolean;
  }

  let {
    variant = "secondary",
    href,
    accentColor,
    children,
    onclick,
    disabled = false,
    type = "button",
    fullWidth = false,
    ariaLabel,
    ref = $bindable(null),
    ariaBusy = false,
    ariaExpanded,
    ariaControls,
    ariaPressed,
    saveShortcut = false,
  }: Props = $props();
</script>

{#if href !== undefined}
  <a
    href={disabled ? undefined : href}
    class="panel-btn panel-btn--{variant}"
    class:panel-btn--full-width={fullWidth}
    class:panel-btn--tinted={!!accentColor}
    style:--panel-accent={accentColor}
    aria-label={ariaLabel}
    aria-disabled={disabled || undefined}
    tabindex={disabled ? -1 : undefined}
    onclick={(event) => {
      if (disabled) event.preventDefault();
      else onclick?.(event);
    }}
  >
    {@render children()}
  </a>
{:else}
  <button
    data-save-shortcut={saveShortcut ? "" : undefined}
    bind:this={ref}
    class="panel-btn panel-btn--{variant}"
    class:panel-btn--full-width={fullWidth}
    class:panel-btn--tinted={!!accentColor}
    style:--panel-accent={accentColor}
    {onclick}
    {disabled}
    {type}
    aria-label={ariaLabel}
    aria-busy={ariaBusy}
    aria-expanded={ariaExpanded}
    aria-controls={ariaControls}
    aria-pressed={ariaPressed}
  >
    {@render children()}
  </button>
{/if}

<style>
  .panel-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 8px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    font-family: inherit;
    text-decoration: none;
    cursor: pointer;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
    min-height: var(--min-touch-target);
  }

  .panel-btn:disabled,
  .panel-btn[aria-disabled="true"] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .panel-btn--full-width {
    width: 100%;
  }

  /* Primary variant - uses theme accent */
  .panel-btn--primary {
    background: var(--theme-accent);
    border: 1px solid var(--theme-accent);
    color: var(--theme-text-on-accent, white);
  }

  .panel-btn--primary:hover:not(:disabled) {
    filter: brightness(0.9);
  }

  /* Secondary variant - ghost style */
  .panel-btn--secondary {
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke);
    color: var(--theme-text, white);
  }

  .panel-btn--secondary:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .panel-btn--tinted {
    background: color-mix(
      in srgb,
      var(--panel-accent) 14%,
      var(--theme-card-bg)
    );
    border-color: color-mix(
      in srgb,
      var(--panel-accent) 40%,
      var(--theme-stroke)
    );
    color: var(--theme-text);
  }

  .panel-btn--tinted:hover:not(:disabled):not([aria-disabled="true"]) {
    background: color-mix(
      in srgb,
      var(--panel-accent) 24%,
      var(--theme-card-bg)
    );
    border-color: var(--panel-accent);
  }

  .panel-btn:focus-visible {
    outline: 3px solid var(--panel-accent, var(--theme-accent));
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .panel-btn {
      transition: none;
    }
  }
</style>
