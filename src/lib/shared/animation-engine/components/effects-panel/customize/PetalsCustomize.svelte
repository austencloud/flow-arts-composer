<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { PetalsIntent } from "$lib/shared/effects/domain/effects-config";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "$lib/shared/effects/components/AdvancedControls.svelte";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  const PALETTES: {
    value: PetalsIntent["palette"];
    label: string;
    swatch: string;
  }[] = [
    { value: "blossom", label: "Blossom", swatch: "#ffc0d8" },
    { value: "autumn", label: "Autumn", swatch: "#d84820" },
    { value: "jungle", label: "Jungle", swatch: "#408840" },
    { value: "ash", label: "Ash", swatch: "#484848" },
    { value: "gold", label: "Gold", swatch: "#ffd060" },
    { value: "custom", label: "Custom", swatch: "#ffffff" },
  ];

  const TRACKING: { value: PetalsIntent["trackingMode"]; label: string }[] = [
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
    <div class="petals-controls">
      <OptionChipRow
        label="Palette"
        ariaLabel="Petals palette"
        value={state.petals.palette}
        options={PALETTES}
        onChange={(v) => state.updateEffect("petals", { palette: v })}
      />

      {#if state.petals.palette === "custom"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_tint")}</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.petals.customColor}
                oninput={(e) =>
                  state.updateEffect("petals", {
                    customColor: (e.currentTarget as HTMLInputElement).value,
                  })}
              />
            </label>
          </div>
        </div>
      {/if}

      <OptionChipRow
        label="Tracking"
        ariaLabel="Petals tracking mode"
        value={state.petals.trackingMode}
        options={TRACKING}
        onChange={(v) => state.updateEffect("petals", { trackingMode: v })}
      />

      <!-- Ambient emission -->
      <div class="slider-row">
        <label for="petals-ambient">{t("effect_deep_drift")}</label>
        <input
          id="petals-ambient"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.petals.ambientEmission}
          oninput={(e) =>
            state.updateEffect("petals", {
              ambientEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.petals.ambientEmission * 100)}%</span
        >
      </div>

      <!-- Motion emission -->
      <div class="slider-row">
        <label for="petals-motion">{t("effect_deep_motion")}</label>
        <input
          id="petals-motion"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.petals.motionEmission}
          oninput={(e) =>
            state.updateEffect("petals", {
              motionEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.petals.motionEmission * 100)}%</span
        >
      </div>

      <!-- Intensity (size) -->
      <div class="slider-row">
        <label for="petals-intensity">{t("effect_deep_size")}</label>
        <input
          id="petals-intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.petals.intensity}
          oninput={(e) =>
            state.updateEffect("petals", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.petals.intensity * 100)}%</span
        >
      </div>

      <AdvancedControls count={3}>
        <!-- Carry: how much of the prop's velocity a petal inherits -->
        <div class="slider-row">
          <label for="petals-carry">{t("effect_deep_carry")}</label>
          <input
            id="petals-carry"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.petals.carry}
            oninput={(e) =>
              state.updateEffect("petals", {
                carry: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.petals.carry * 100)}%</span
          >
        </div>

        <!-- Streak: how long the inherited motion lingers -->
        <div class="slider-row">
          <label for="petals-streak">{t("effect_deep_streak")}</label>
          <input
            id="petals-streak"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.petals.streakLength}
            oninput={(e) =>
              state.updateEffect("petals", {
                streakLength: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.petals.streakLength * 100)}%</span
          >
        </div>

        <!-- Fall speed -->
        <div class="slider-row">
          <label for="petals-fall">{t("effect_deep_fall")}</label>
          <input
            id="petals-fall"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.petals.fallSpeed}
            oninput={(e) =>
              state.updateEffect("petals", {
                fallSpeed: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.petals.fallSpeed * 100)}%</span
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

  .petals-controls {
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
