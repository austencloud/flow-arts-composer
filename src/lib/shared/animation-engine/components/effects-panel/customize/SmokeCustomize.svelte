<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { SmokeIntent } from "$lib/shared/effects/domain/effects-config";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "$lib/shared/effects/components/AdvancedControls.svelte";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  // Palette swatches mirror the palette registry's core color so the
  // chip reads identity at a glance. No lifetime slider: lifetime is
  // palette-owned (genie is short, fog is long - that's what makes them
  // those things). Spec §"Intent shape".
  const PALETTES: {
    value: SmokeIntent["palette"];
    label: string;
    swatch: string;
  }[] = [
    { value: "incense", label: "Incense", swatch: "#d8d8d8" },
    { value: "fog", label: "Fog", swatch: "#c0c0c8" },
    { value: "genie", label: "Genie", swatch: "#a060ff" },
    { value: "cursed", label: "Cursed", swatch: "#202020" },
    { value: "spirit", label: "Spirit", swatch: "#80c8ff" },
    { value: "campfire", label: "Fire smoke", swatch: "#dc6b24" },
    { value: "custom", label: "Custom", swatch: "#ffffff" },
  ];

  const TRACKING: { value: SmokeIntent["trackingMode"]; label: string }[] = [
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
    <div class="smoke-controls">
      <!-- Palette chip row (7 items) -->
      <OptionChipRow
        label="Palette"
        ariaLabel="Smoke palette"
        value={state.smoke.palette}
        options={PALETTES}
        onChange={(v) => state.updateEffect("smoke", { palette: v })}
      />

      {#if state.smoke.palette === "custom"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_tint")}</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.smoke.customColor}
                oninput={(e) =>
                  state.updateEffect("smoke", {
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
        ariaLabel="Smoke tracking mode"
        value={state.smoke.trackingMode}
        options={TRACKING}
        onChange={(v) => state.updateEffect("smoke", { trackingMode: v })}
      />

      <!-- Ambient emission -->
      <div class="slider-row">
        <label for="smoke-ambient">{t("effect_deep_ambient")}</label>
        <input
          id="smoke-ambient"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.smoke.ambientEmission}
          oninput={(e) =>
            state.updateEffect("smoke", {
              ambientEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.smoke.ambientEmission * 100)}%</span
        >
      </div>

      <!-- Motion emission -->
      <div class="slider-row">
        <label for="smoke-motion">{t("effect_deep_motion")}</label>
        <input
          id="smoke-motion"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.smoke.motionEmission}
          oninput={(e) =>
            state.updateEffect("smoke", {
              motionEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.smoke.motionEmission * 100)}%</span
        >
      </div>

      <!-- Intensity (size + opacity) -->
      <div class="slider-row">
        <label for="smoke-intensity">{t("effect_deep_intensity")}</label>
        <input
          id="smoke-intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.smoke.intensity}
          oninput={(e) =>
            state.updateEffect("smoke", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.smoke.intensity * 100)}%</span
        >
      </div>

      <AdvancedControls count={2}>
        <!-- Curl strength (multiplier on palette.curlBias) -->
        <div class="slider-row">
          <label for="smoke-curl">{t("effect_deep_curl")}</label>
          <input
            id="smoke-curl"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.smoke.curlStrength}
            oninput={(e) =>
              state.updateEffect("smoke", {
                curlStrength: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.smoke.curlStrength * 100)}%</span
          >
        </div>

        <!-- Rise speed (multiplier on palette.riseBias) -->
        <div class="slider-row">
          <label for="smoke-rise">{t("effect_deep_rise")}</label>
          <input
            id="smoke-rise"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.smoke.riseSpeed}
            oninput={(e) =>
              state.updateEffect("smoke", {
                riseSpeed: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.smoke.riseSpeed * 100)}%</span
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

  .smoke-controls {
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
