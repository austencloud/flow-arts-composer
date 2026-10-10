<!--
  CharcoalControlsPanel.svelte

  Charcoal spark controls for the Effects Lab.
  Shows 3 semantic sliders (Intensity, Spread, Glow) by default,
  with an Advanced toggle to access all individual parameters.
-->
<script lang="ts">
  import type { CharcoalSparkParams } from "#lib/shared/animation-engine/domain/types/charcoal-spark-types.js";
  import {
    CHARCOAL_SLIDER_GROUPS,
    charcoalParamsToSemantic,
    semanticToCharcoalParams,
    DEFAULT_CHARCOAL_SEMANTIC,
  } from "#lib/shared/animation-engine/domain/types/charcoal-spark-types.js";

  interface Props {
    params: CharcoalSparkParams;
    onParamChange: (key: keyof CharcoalSparkParams, value: number | boolean) => void;
    onParamsReplace: (params: CharcoalSparkParams) => void;
    onReset: () => void;
  }

  let { params, onParamChange, onParamsReplace, onReset }: Props = $props();

  let advancedOpen = $state(false);

  const semantic = $derived(charcoalParamsToSemantic(params));

  function applySemanticValue(key: "intensity" | "spread" | "glow", value: number): void {
    const updated = { ...semantic, [key]: value };
    onParamsReplace(semanticToCharcoalParams(updated));
  }

  const isDefault = $derived(
    Math.abs(semantic.intensity - DEFAULT_CHARCOAL_SEMANTIC.intensity) < 0.02 &&
    Math.abs(semantic.spread - DEFAULT_CHARCOAL_SEMANTIC.spread) < 0.02 &&
    Math.abs(semantic.glow - DEFAULT_CHARCOAL_SEMANTIC.glow) < 0.02
  );
</script>

<div class="charcoal-controls">
  <div class="header-row">
    <h3>
      <i class="fas fa-meteor" aria-hidden="true"></i>
      Charcoal Sparks
    </h3>
    <button
      class="reset-btn"
      onclick={onReset}
      disabled={isDefault && !advancedOpen}
      type="button"
      aria-label="Reset charcoal parameters to defaults"
    >
      Reset
    </button>
  </div>

  <!-- Semantic sliders -->
  <div class="slider-row">
    <label for="charcoal-intensity">Intensity</label>
    <input
      id="charcoal-intensity"
      type="range"
      min="0"
      max="1"
      step="0.02"
      value={semantic.intensity}
      oninput={(e) => applySemanticValue("intensity", Number(e.currentTarget.value))}
    />
    <span class="slider-value">{Math.round(semantic.intensity * 100)}%</span>
  </div>

  <div class="slider-row">
    <label for="charcoal-spread">Spread</label>
    <input
      id="charcoal-spread"
      type="range"
      min="0"
      max="1"
      step="0.02"
      value={semantic.spread}
      oninput={(e) => applySemanticValue("spread", Number(e.currentTarget.value))}
    />
    <span class="slider-value">{Math.round(semantic.spread * 100)}%</span>
  </div>

  <div class="slider-row">
    <label for="charcoal-glow">Glow</label>
    <input
      id="charcoal-glow"
      type="range"
      min="0"
      max="1"
      step="0.02"
      value={semantic.glow}
      oninput={(e) => applySemanticValue("glow", Number(e.currentTarget.value))}
    />
    <span class="slider-value">{Math.round(semantic.glow * 100)}%</span>
  </div>

  <!-- Advanced toggle -->
  <button
    class="advanced-toggle"
    type="button"
    onclick={() => advancedOpen = !advancedOpen}
    aria-expanded={advancedOpen}
  >
    <i class="fas {advancedOpen ? 'fa-chevron-up' : 'fa-chevron-down'}" aria-hidden="true"></i>
    Advanced
  </button>

  {#if advancedOpen}
    <div class="advanced-section">
      {#each CHARCOAL_SLIDER_GROUPS as group}
        <div class="slider-group">
          <span class="group-label">{group.label}</span>
          {#each group.sliders as slider}
            {@const value = params[slider.key] as number}
            <div class="slider-row">
              <label for="charcoal-{slider.key}">{slider.label}</label>
              <input
                id="charcoal-{slider.key}"
                type="range"
                min={slider.min}
                max={slider.max}
                step={slider.step}
                {value}
                oninput={(e) => onParamChange(slider.key, Number(e.currentTarget.value))}
                aria-label={slider.label}
              />
              <span class="slider-value">
                {slider.format ? slider.format(value) : Math.round(value)}
              </span>
            </div>
          {/each}
        </div>
      {/each}

      <!-- Shrink toggle -->
      <div class="toggle-row">
        <span>Shrink over life</span>
        <button
          class="toggle-btn"
          class:active={params.shrinkOverLife}
          onclick={() => onParamChange("shrinkOverLife", !params.shrinkOverLife)}
          aria-label={params.shrinkOverLife ? "Disable shrink" : "Enable shrink"}
          type="button"
        >
          {params.shrinkOverLife ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .charcoal-controls {
    --charcoal-amber: #f59e0b;
    --charcoal-amber-bright: #fbbf24;
    --charcoal-amber-dim: rgba(245, 158, 11, 0.08);
    --charcoal-amber-border: rgba(245, 158, 11, 0.3);
    --charcoal-amber-border-strong: rgba(245, 158, 11, 0.5);

    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--spacing-md, 16px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--charcoal-amber-dim);
    border-radius: var(--border-radius-lg, 12px);
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--spacing-xs, 4px);
  }

  h3 {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, white);
    display: flex;
    align-items: center;
    gap: var(--spacing-xs, 4px);
  }

  h3 i {
    color: var(--charcoal-amber);
  }

  .reset-btn {
    min-height: var(--min-touch-target);
    padding: 8px 16px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: var(--border-radius-md, 8px);
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .reset-btn:hover:not(:disabled) {
    border-color: var(--charcoal-amber-border);
    color: var(--charcoal-amber);
  }

  .reset-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .reset-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    min-height: var(--min-touch-target);
  }

  .slider-row label {
    min-width: 110px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .slider-row input[type="range"] {
    flex: 1;
    accent-color: var(--charcoal-amber);
  }

  .slider-value {
    min-width: 44px;
    text-align: right;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, white);
  }

  .advanced-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 6px;
    margin-top: 4px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .advanced-toggle:hover {
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
    color: var(--theme-text, white);
  }

  .advanced-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .advanced-section {
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    padding-top: var(--spacing-sm, 8px);
  }

  .slider-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: var(--spacing-sm, 8px);
    padding-top: var(--spacing-sm, 8px);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .slider-group:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: none;
  }

  .group-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin-bottom: 2px;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: var(--spacing-sm, 8px);
    padding-top: var(--spacing-sm, 8px);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .toggle-btn {
    min-height: var(--min-touch-target);
    padding: 8px 16px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 9999px;
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all 150ms ease;
    min-width: var(--min-touch-target);
  }

  .toggle-btn.active {
    background: var(--charcoal-amber-dim);
    border-color: var(--charcoal-amber-border-strong);
    color: var(--charcoal-amber-bright);
  }

  .toggle-btn:hover {
    border-color: color-mix(in srgb, var(--theme-text) 30%, transparent);
  }

  .toggle-btn.active:hover {
    border-color: color-mix(in srgb, var(--charcoal-amber) 70%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .reset-btn,
    .toggle-btn,
    .advanced-toggle {
      transition: none;
    }
  }
</style>
