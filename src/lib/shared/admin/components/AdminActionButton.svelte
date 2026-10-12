<script lang="ts">
  /**
   * AdminActionButton
   * Styled action button with variants
   */

  import type { Snippet } from "svelte";
  import type { AdminVariant } from "../types/admin-component-types";

  interface AdminActionButtonProps {
    variant?: AdminVariant;
    icon?: string;
    loading?: boolean;
    disabled?: boolean;
    fullWidth?: boolean;
    class?: string;
    onclick?: () => void;
    saveShortcut?: boolean;
    children: Snippet;
  }

  let {
    variant = "primary",
    icon,
    loading = false,
    disabled = false,
    fullWidth = false,
    class: className = "",
    onclick,
    saveShortcut = false,
    children,
  }: AdminActionButtonProps = $props();
</script>

<button
  data-save-shortcut={saveShortcut ? "" : undefined}
  class="admin-action-btn variant-{variant} {className}"
  class:full-width={fullWidth}
  {onclick}
  disabled={disabled || loading}
>
  {#if loading}
    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
  {:else if icon}
    <i class="fas {icon}" aria-hidden="true"></i>
  {/if}
  <span>{@render children()}</span>
</button>

<style>
  .admin-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 18px;
    border: none;
    border-radius: 10px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard);
    min-height: var(--min-touch-target); /* Touch target */
  }

  @media (min-width: 480px) {
    .admin-action-btn {
      padding: 10px 20px;
      border-radius: 8px;
    }
  }

  .admin-action-btn:active:not(:disabled) {
    transform: scale(0.97);
  }

  .admin-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .admin-action-btn.full-width {
    width: 100%;
  }

  /* Primary variant */
  .variant-primary {
    background: var(--semantic-info);
    color: white;
  }

  @media (hover: hover) {
    .variant-primary:hover:not(:disabled) {
      background: color-mix(in srgb, var(--semantic-info) 85%, black);
    }
  }

  /* Secondary variant */
  .variant-secondary {
    background: var(--theme-card-bg);
    color: var(--theme-text, var(--theme-text));
    border: 1px solid var(--theme-stroke);
  }

  @media (hover: hover) {
    .variant-secondary:hover:not(:disabled) {
      background: var(--theme-card-hover-bg);
    }
  }

  /* Warning variant */
  .variant-warning {
    background: color-mix(in srgb, var(--semantic-warning) 15%, transparent);
    color: var(--semantic-warning);
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning) 30%, transparent);
  }

  @media (hover: hover) {
    .variant-warning:hover:not(:disabled) {
      background: color-mix(in srgb, var(--semantic-warning) 25%, transparent);
    }
  }

  /* Danger variant */
  .variant-danger {
    background: color-mix(in srgb, var(--semantic-error) 15%, transparent);
    color: color-mix(in srgb, var(--semantic-error) 60%, white);
    border: 1px solid color-mix(in srgb, var(--semantic-error) 30%, transparent);
  }

  @media (hover: hover) {
    .variant-danger:hover:not(:disabled) {
      background: color-mix(in srgb, var(--semantic-error) 25%, transparent);
    }
  }

  /* Info variant */
  .variant-info {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    color: var(--theme-accent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 30%, transparent);
  }

  .variant-info:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
  }

  .admin-action-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
</style>
