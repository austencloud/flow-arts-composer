<script lang="ts">
  /**
   * QuickPresets
   * Quick action buttons for common permission bundles
   */

  import type { FeatureId } from "#lib/shared/auth/domain/models/feature-flag.js";
  import type { OverrideState } from "../shared/feature-utils";
  import { QUICK_PRESETS } from "../shared/feature-utils";

  interface Props {
    onPresetApply: (featureIds: FeatureId[], state: OverrideState) => void;
  }

  let { onPresetApply }: Props = $props();

  let hoveredPreset = $state<string | null>(null);
</script>

<div class="quick-presets">
  <div class="presets-header">
    <h4>
      <i class="fas fa-bolt" aria-hidden="true"></i>
      Quick Actions
    </h4>
  </div>

  <div class="presets-grid">
    {#each QUICK_PRESETS as preset}
      <button
        type="button"
        class="preset-button"
        style="--preset-color: {preset.color}"
        onmouseenter={() => (hoveredPreset = preset.id)}
        onmouseleave={() => (hoveredPreset = null)}
        onclick={() => onPresetApply(preset.features as FeatureId[], "grant")}
      >
        <div class="preset-icon">
          <i class="fas {preset.icon}" aria-hidden="true"></i>
        </div>
        <div class="preset-info">
          <span class="preset-name">{preset.name}</span>
          <span class="preset-description">{preset.description}</span>
        </div>
      </button>
    {/each}

    <!-- Clear all button -->
    <button
      type="button"
      class="preset-button clear-button"
      onclick={() => onPresetApply([], "inherit")}
    >
      <div class="preset-icon">
        <i class="fas fa-eraser" aria-hidden="true"></i>
      </div>
      <div class="preset-info">
        <span class="preset-name">Clear All</span>
        <span class="preset-description">Reset to role defaults</span>
      </div>
    </button>
  </div>
</div>

<style>
  .quick-presets {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    overflow: hidden;
  }

  .presets-header {
    padding: 12px 14px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .presets-header h4 {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .presets-header h4 i {
    color: #f59e0b;
  }

  .presets-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 8px;
    padding: 12px;
  }

  .preset-button {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1.5px solid transparent;
    border-radius: 10px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.5));
    cursor: pointer;
    text-align: left;
    transition: all var(--duration-fast) ease;
  }

  .preset-button:hover {
    background: color-mix(in srgb, var(--preset-color, #6b7280) 10%, transparent);
    border-color: color-mix(in srgb, var(--preset-color, #6b7280) 30%, transparent);
  }

  .preset-button:active {
    transform: scale(0.98);
  }

  .preset-button.clear-button {
    --preset-color: #6b7280;
  }

  .preset-icon {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: color-mix(in srgb, var(--preset-color, #6b7280) 15%, transparent);
    color: var(--preset-color, #6b7280);
    font-size: 14px;
    flex-shrink: 0;
  }

  .preset-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .preset-name {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .preset-description {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    line-height: 1.3;
  }

  /* Responsive - 2 columns minimum */
  @media (max-width: 400px) {
    .presets-grid {
      grid-template-columns: repeat(2, 1fr);
    }

    .preset-button {
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
    }
  }
</style>
