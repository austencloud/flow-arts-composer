<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import type { SilkIntent } from "#lib/shared/effects/domain/effects-config.js";
  import { SILK_INTENSITY_MAX } from "#lib/shared/effects/domain/effects-config.js";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "#lib/shared/effects/components/AdvancedControls.svelte";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  const PALETTES: {
    value: SilkIntent["palette"];
    label: string;
    swatch: string;
  }[] = [
    { value: "satin", label: "Satin", swatch: "#c0c0d0" },
    { value: "velvet", label: "Velvet", swatch: "#600018" },
    { value: "ethereal", label: "Ethereal", swatch: "#c080ff" },
    { value: "shadow", label: "Shadow", swatch: "#101020" },
    { value: "gold_leaf", label: "Gold Leaf", swatch: "#ffd700" },
    { value: "ember", label: "Ember", swatch: "#ff6000" },
    { value: "custom", label: "Custom", swatch: "#ffffff" },
  ];

  const TRACKING: { value: SilkIntent["trackingMode"]; label: string }[] = [
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
    <div class="silk-controls">
      <OptionChipRow
        label="Palette"
        ariaLabel="Silk palette"
        value={state.silk.palette}
        options={PALETTES}
        onChange={(v) => state.updateEffect("silk", { palette: v })}
      />

      {#if state.silk.palette === "custom"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_tint")}</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.silk.customColor}
                oninput={(e) =>
                  state.updateEffect("silk", {
                    customColor: (e.currentTarget as HTMLInputElement).value,
                  })}
              />
            </label>
          </div>
        </div>
      {/if}

      <OptionChipRow
        label="Tracking"
        ariaLabel="Silk tracking mode"
        value={state.silk.trackingMode}
        options={TRACKING}
        onChange={(v) => state.updateEffect("silk", { trackingMode: v })}
      />

      <div class="slider-row">
        <label for="silk-intensity">{t("effect_deep_intensity")}</label>
        <input
          id="silk-intensity"
          type="range"
          min="0"
          max={SILK_INTENSITY_MAX}
          step="0.05"
          value={state.silk.intensity}
          oninput={(e) =>
            state.updateEffect("silk", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.silk.intensity * 100)}%</span
        >
      </div>

      <div class="slider-row">
        <label for="silk-width">{t("effect_deep_width")}</label>
        <input
          id="silk-width"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.silk.width}
          oninput={(e) =>
            state.updateEffect("silk", {
              width: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value">{Math.round(state.silk.width * 100)}%</span>
      </div>

      <div class="slider-row">
        <label for="silk-flutter">{t("effect_deep_flutter")}</label>
        <input
          id="silk-flutter"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.silk.flutter}
          oninput={(e) =>
            state.updateEffect("silk", {
              flutter: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value">{Math.round(state.silk.flutter * 100)}%</span
        >
      </div>

      <AdvancedControls count={2}>
        <div class="slider-row">
          <label for="silk-duration">{t("effect_deep_duration")}</label>
          <input
            id="silk-duration"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.silk.duration}
            oninput={(e) =>
              state.updateEffect("silk", {
                duration: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.silk.duration * 100)}%</span
          >
        </div>

        <div class="slider-row">
          <label for="silk-tautness">{t("effect_deep_tautness")}</label>
          <input
            id="silk-tautness"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.silk.tautness}
            oninput={(e) =>
              state.updateEffect("silk", {
                tautness: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.silk.tautness * 100)}%</span
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

  .silk-controls {
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
