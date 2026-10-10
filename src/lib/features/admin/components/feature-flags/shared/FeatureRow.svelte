<script lang="ts">
  /**
   * FeatureRow
   * A single feature row with icon, name, and controls
   * Used in both global settings and user overrides
   */

  import type { FeatureFlagConfig } from "#lib/shared/auth/domain/models/feature-flag.js";
  import { getFeatureIconAndColor } from "./feature-utils";
  import PermissionBadge from "./PermissionBadge.svelte";

  interface Props {
    flag: FeatureFlagConfig;
    hasAccess?: boolean;
    accessReason?: string;
    indent?: boolean;
    selected?: boolean;
    onclick?: () => void;
    children?: import("svelte").Snippet;
  }

  let {
    flag,
    hasAccess,
    accessReason,
    indent = false,
    selected = false,
    onclick,
    children,
  }: Props = $props();

  const style = $derived(getFeatureIconAndColor(flag.id));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  class="feature-row"
  class:indent
  class:selected
  class:clickable={!!onclick}
  class:disabled={!flag.enabled}
  role={onclick ? "button" : undefined}
  tabindex={onclick ? 0 : undefined}
  onclick={onclick}
  onkeydown={(e) => e.key === "Enter" && onclick?.()}
>
  <div class="feature-icon" style="background: {style.color}18; color: {style.color}">
    <i class="fas {style.icon}" aria-hidden="true"></i>
  </div>

  <div class="feature-info">
    <span class="feature-name">{flag.name}</span>
    <span class="feature-description">{flag.description}</span>
  </div>

  {#if hasAccess !== undefined}
    <PermissionBadge {hasAccess} reason={accessReason} size="sm" />
  {/if}

  {#if children}
    <div class="feature-controls">
      {@render children()}
    </div>
  {/if}

  {#if !flag.enabled}
    <span class="disabled-indicator" title="Globally disabled">
      <i class="fas fa-power-off" aria-hidden="true"></i>
    </span>
  {/if}
</div>

<style>
  .feature-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 10px;
    border: 1px solid transparent;
    transition: all var(--duration-fast) ease;
  }

  .feature-row.indent {
    margin-left: 24px;
    background: rgba(255, 255, 255, 0.02);
  }

  .feature-row.clickable {
    cursor: pointer;
  }

  .feature-row.clickable:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .feature-row.selected {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
  }

  .feature-row.disabled {
    opacity: 0.6;
  }

  .feature-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    font-size: var(--font-size-sm, 14px);
    flex-shrink: 0;
  }

  .feature-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .feature-name {
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    color: var(--theme-text, #ffffff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .feature-description {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .feature-controls {
    flex-shrink: 0;
  }

  .disabled-indicator {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: rgba(239, 68, 68, 0.12);
    color: #f87171;
    font-size: 11px;
    flex-shrink: 0;
  }

  /* Responsive - stack on small screens */
  @media (max-width: 500px) {
    .feature-row {
      flex-wrap: wrap;
      gap: 10px;
    }

    .feature-info {
      flex-basis: calc(100% - 60px);
    }

    .feature-controls {
      flex-basis: 100%;
      margin-left: 48px;
    }
  }
</style>
