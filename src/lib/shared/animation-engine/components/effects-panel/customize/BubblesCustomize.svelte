<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { BubblesIntent } from "$lib/shared/effects/domain/effects-config";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "$lib/shared/effects/components/AdvancedControls.svelte";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  const PALETTES: {
    value: BubblesIntent["palette"];
    label: string;
    swatch: string;
  }[] = [
    { value: "soap", label: "Soap", swatch: "#c8e0ff" },
    { value: "champagne", label: "Champagne", swatch: "#f4e8c8" },
    { value: "oil", label: "Oil", swatch: "#c080ff" },
    { value: "acid", label: "Acid", swatch: "#b8ff6f" },
    { value: "spirit", label: "Spirit", swatch: "#c0fff4" },
    { value: "custom", label: "Custom", swatch: "#ffffff" },
  ];

  const TRACKING: { value: BubblesIntent["trackingMode"]; label: string }[] = [
    { value: "left_end", label: "Left" },
    { value: "right_end", label: "Right" },
    { value: "both_ends", label: "Both" },
  ];
</script>

<div class="customize-view">
  <button type="button" class="back-btn" onclick={onBack}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    {t("effect_deep_back_to_presets")}
  </button>

  {#if state}
    <div class="bubbles-controls">
      <!-- Palette chip row -->
      <OptionChipRow
        label="Palette"
        ariaLabel="Bubbles palette"
        value={state.bubbles.palette}
        options={PALETTES}
        onChange={(v) => state.updateEffect("bubbles", { palette: v })}
      />

      {#if state.bubbles.palette === "custom"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_tint")}</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.bubbles.customColor}
                oninput={(e) =>
                  state.updateEffect("bubbles", {
                    customColor: (e.currentTarget as HTMLInputElement).value,
                  })}
              />
            </label>
          </div>
        </div>
      {/if}

      <!-- Tracking chip row -->
      <OptionChipRow
        label="Tracking"
        ariaLabel="Bubbles tracking mode"
        value={state.bubbles.trackingMode}
        options={TRACKING}
        onChange={(v) => state.updateEffect("bubbles", { trackingMode: v })}
      />

      <!-- Ambient emission -->
      <div class="slider-row">
        <label for="bubbles-ambient">{t("effect_deep_drift")}</label>
        <input
          id="bubbles-ambient"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.bubbles.ambientEmission}
          oninput={(e) =>
            state.updateEffect("bubbles", {
              ambientEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.bubbles.ambientEmission * 100)}%</span
        >
      </div>

      <!-- Motion emission -->
      <div class="slider-row">
        <label for="bubbles-motion">{t("effect_deep_motion")}</label>
        <input
          id="bubbles-motion"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.bubbles.motionEmission}
          oninput={(e) =>
            state.updateEffect("bubbles", {
              motionEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.bubbles.motionEmission * 100)}%</span
        >
      </div>

      <!-- Intensity -->
      <div class="slider-row">
        <label for="bubbles-intensity">{t("effect_deep_size")}</label>
        <input
          id="bubbles-intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.bubbles.intensity}
          oninput={(e) =>
            state.updateEffect("bubbles", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.bubbles.intensity * 100)}%</span
        >
      </div>

      <AdvancedControls count={2}>
        <!-- Size jitter -->
        <div class="slider-row">
          <label for="bubbles-jitter">{t("effect_deep_jitter")}</label>
          <input
            id="bubbles-jitter"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.bubbles.sizeJitter}
            oninput={(e) =>
              state.updateEffect("bubbles", {
                sizeJitter: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.bubbles.sizeJitter * 100)}%</span
          >
        </div>

        <!-- Buoyancy -->
        <div class="slider-row">
          <label for="bubbles-buoyancy">{t("effect_deep_rise")}</label>
          <input
            id="bubbles-buoyancy"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.bubbles.buoyancy}
            oninput={(e) =>
              state.updateEffect("bubbles", {
                buoyancy: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.bubbles.buoyancy * 100)}%</span
          >
        </div>
      </AdvancedControls>
    </div>
  {:else}
    <p class="empty">{t("effect_deep_effect_state_unavailable")}</p>
  {/if}
</div>

<style>
  .customize-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    min-height: 44px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: all var(--duration-fast, 100ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .back-btn:hover {
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
    color: var(--theme-text, white);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .back-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .back-btn i {
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .back-btn {
      transition: none;
    }
  }

  .bubbles-controls {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
  }

  .slider-row label {
    min-width: 70px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .slider-row input[type="range"] {
    flex: 1;
    accent-color: var(--theme-accent, #8b5cf6);
  }

  .slider-value {
    min-width: 48px;
    text-align: right;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, white);
  }

  .color-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
  }

  .color-label {
    min-width: 70px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .color-pickers {
    display: flex;
    gap: 8px;
    flex: 1;
    flex-wrap: wrap;
  }

  .color-picker input[type="color"] {
    -webkit-appearance: none;
    appearance: none;
    width: 32px;
    height: 32px;
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 50%;
    background: none;
    cursor: pointer;
    padding: 0;
  }

  .color-picker input[type="color"]::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .color-picker input[type="color"]::-webkit-color-swatch {
    border: none;
    border-radius: 50%;
  }

  .color-picker input[type="color"]::-moz-color-swatch {
    border: none;
    border-radius: 50%;
  }

  .empty {
    opacity: 0.6;
    font-size: var(--font-size-min, 14px);
    padding: 4px 0;
  }
</style>
