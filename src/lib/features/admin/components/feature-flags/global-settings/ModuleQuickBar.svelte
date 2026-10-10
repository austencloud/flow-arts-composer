<script lang="ts">
  /**
   * ModuleQuickBar
   * Horizontal scrollable bar of module toggle chips for quick enable/disable
   */

  import type { FeatureFlagConfig } from "#lib/shared/auth/domain/models/feature-flag.js";
  import { getFeatureIconAndColor } from "../shared/feature-utils";

  interface Props {
    modules: FeatureFlagConfig[];
    savingFlags: Set<string>;
    onToggle: (module: FeatureFlagConfig) => void;
  }

  let { modules, savingFlags, onToggle }: Props = $props();
</script>

<div class="quick-bar">
  <span class="quick-bar-label">Quick Toggle:</span>
  <div class="chips-scroll">
    {#each modules as module}
      {@const style = getFeatureIconAndColor(module.id)}
      {@const isSaving = savingFlags.has(module.id)}
      <button
        type="button"
        class="module-chip"
        class:enabled={module.enabled}
        class:disabled={!module.enabled}
        style="--chip-color: {style.color}"
        disabled={isSaving}
        onclick={() => onToggle(module)}
        title={module.enabled ? `Disable ${module.name}` : `Enable ${module.name}`}
        aria-pressed={module.enabled}
        aria-label="{module.name}: {module.enabled ? 'enabled' : 'disabled'}"
      >
        {#if isSaving}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          <i class="fas {style.icon}" aria-hidden="true"></i>
        {/if}
        <span class="chip-label">{module.name.replace(/ Module$/, '')}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .quick-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  @media (min-width: 600px) {
    .quick-bar {
      padding: 14px 24px;
    }
  }

  .quick-bar-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    white-space: nowrap;
    flex-shrink: 0;
  }

  .chips-scroll {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 0;
  }

  .module-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    min-height: var(--min-touch-target, 48px);
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 24px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    white-space: nowrap;
  }

  .module-chip i {
    font-size: 11px;
  }

  .module-chip:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.12));
  }

  .module-chip.enabled {
    background: color-mix(in srgb, var(--chip-color) 15%, transparent);
    border-color: color-mix(in srgb, var(--chip-color) 40%, transparent);
    color: var(--chip-color);
  }

  .module-chip.enabled:hover:not(:disabled) {
    background: color-mix(in srgb, var(--chip-color) 22%, transparent);
    border-color: color-mix(in srgb, var(--chip-color) 55%, transparent);
  }

  .module-chip.disabled {
    opacity: 0.6;
  }

  .module-chip:disabled {
    cursor: not-allowed;
  }

  /* Chip labels do not need truncation - chips wrap to next line */

  @media (max-width: 500px) {
    .quick-bar-label {
      display: none;
    }
  }
</style>
