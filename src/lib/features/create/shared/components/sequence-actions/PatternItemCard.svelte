<!--
  PatternItemCard.svelte

  Shared card component for displaying patterns in pattern drawers.
  Used by DurationPatternDrawer, TurnPatternDrawer, and potentially others.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { Snippet } from "svelte";

  interface Props {
    name: string;
    description?: string;
    /** Step count display (for user patterns) */
    stepCount?: number;
    /** Whether this card is disabled */
    disabled?: boolean;
    /** Disable reason for tooltip */
    disabledReason?: string;
    /** Glass color for template styling (sets --glass-color CSS var) */
    glassColor?: string;
    /** Whether this is a template (affects styling) */
    isTemplate?: boolean;
    /** Whether this card is currently selected */
    selected?: boolean;
    /** Optional variant class name for styling (e.g., "accent", "simple") */
    variant?: string;
    onclick: () => void;
    /** Optional actions slot content */
    actions?: Snippet;
  }

  let {
    name,
    description,
    stepCount,
    disabled = false,
    disabledReason,
    glassColor,
    isTemplate = false,
    selected = false,
    variant,
    onclick,
    actions,
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (!disabled && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onclick();
    }
  }
</script>

<div
  class="pattern-item {variant ? `variant-${variant}` : ''}"
  class:template={isTemplate}
  class:selected
  class:disabled
  style={glassColor ? `--glass-color: ${glassColor}` : ""}
  onclick={() => !disabled && onclick()}
  role="button"
  tabindex={disabled ? -1 : 0}
  onkeydown={handleKeydown}
  title={disabled && disabledReason ? disabledReason : undefined}
>
  <div class="pattern-info">
    <span class="pattern-name">{name}</span>
    {#if description}
      <span class="pattern-desc">{description}</span>
    {/if}
    {#if stepCount !== undefined}
      <span class="pattern-steps">{t(stepCount === 1 ? "create_deep_step_count_one" : "create_deep_step_count_many", { count: stepCount })}</span>
    {/if}
  </div>
  {#if actions}
    {@render actions()}
  {/if}
</div>

<style>
  .pattern-item {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    position: relative;
    padding: 12px;
    min-height: 60px;
    background: var(--theme-card-bg);
    border-radius: 8px;
    border: 1px solid var(--theme-stroke);
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    user-select: none;
  }

  .pattern-item:hover:not(.disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: rgba(249, 115, 22, 0.4);
  }

  .pattern-item:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .pattern-item.selected {
    border-color: var(--glass-color, var(--theme-accent));
    background: color-mix(
      in srgb,
      var(--glass-color, var(--theme-accent)) 18%,
      transparent
    );
    box-shadow: 0 0 8px
      color-mix(
        in srgb,
        var(--glass-color, var(--theme-accent)) 25%,
        transparent
      );
  }

  .pattern-item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pattern-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }

  .pattern-name {
    font-weight: 500;
    font-size: 0.9rem;
    line-height: 1.3;
    color: var(--theme-text, #ffffff);
  }

  .pattern-steps,
  .pattern-desc {
    font-size: 0.75rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    line-height: 1.4;
  }

  /* Template glass effect styling */
  .pattern-item.template {
    background: color-mix(in srgb, var(--glass-color, #fff) 8%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--glass-color, #fff) 20%, transparent);
  }

  .pattern-item.template:hover {
    background: color-mix(in srgb, var(--glass-color, #fff) 15%, transparent);
    border-color: color-mix(in srgb, var(--glass-color, #fff) 40%, transparent);
  }

  /* Mobile compact mode - parent applies .mobile-compact class to grid */
  :global(.mobile-compact) .pattern-item {
    padding: 10px;
    min-height: 44px;
  }

  :global(.mobile-compact) .pattern-name {
    font-size: 0.8rem;
  }

  :global(.mobile-compact) .pattern-desc {
    display: none;
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .pattern-item {
      transition: none;
    }
  }
</style>
