<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import type { FrostIntent } from "#lib/shared/effects/domain/effects-config.js";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "#lib/shared/effects/components/AdvancedControls.svelte";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  const PALETTES: {
    value: FrostIntent["palette"];
    label: string;
    swatch: string;
  }[] = [
    { value: "glacial", label: "Glacial", swatch: "#a0d8ff" },
    { value: "breath", label: "Breath", swatch: "#d0e8f0" },
    { value: "black_ice", label: "Black Ice", swatch: "#202830" },
    { value: "aurora", label: "Aurora", swatch: "#60ff80" },
    { value: "diamond", label: "Diamond", swatch: "#e8e8f0" },
    { value: "cursed", label: "Cursed", swatch: "#4020a0" },
    { value: "custom", label: "Custom", swatch: "#ffffff" },
  ];

  const TRACKING: { value: FrostIntent["trackingMode"]; label: string }[] = [
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
    <div class="frost-controls">
      <OptionChipRow
        label="Palette"
        ariaLabel="Frost palette"
        value={state.frost.palette}
        options={PALETTES}
        onChange={(v) => state.updateEffect("frost", { palette: v })}
      />

      {#if state.frost.palette === "custom"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_tint")}</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.frost.customColor}
                oninput={(e) =>
                  state.updateEffect("frost", {
                    customColor: (e.currentTarget as HTMLInputElement).value,
                  })}
              />
            </label>
          </div>
        </div>
      {/if}

      <OptionChipRow
        label="Tracking"
        ariaLabel="Frost tracking mode"
        value={state.frost.trackingMode}
        options={TRACKING}
        onChange={(v) => state.updateEffect("frost", { trackingMode: v })}
      />

      <div class="slider-row">
        <label for="frost-ambient">{t("effect_deep_ambient")}</label>
        <input
          id="frost-ambient"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.frost.ambientEmission}
          oninput={(e) =>
            state.updateEffect("frost", {
              ambientEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.frost.ambientEmission * 100)}%</span
        >
      </div>

      <div class="slider-row">
        <label for="frost-motion">{t("effect_deep_motion")}</label>
        <input
          id="frost-motion"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.frost.motionEmission}
          oninput={(e) =>
            state.updateEffect("frost", {
              motionEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.frost.motionEmission * 100)}%</span
        >
      </div>

      <div class="slider-row">
        <label for="frost-intensity">{t("effect_deep_intensity")}</label>
        <input
          id="frost-intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.frost.intensity}
          oninput={(e) =>
            state.updateEffect("frost", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.frost.intensity * 100)}%</span
        >
      </div>

      <AdvancedControls count={2}>
        <div class="slider-row">
          <label for="frost-crystallinity"
            >{t("effect_deep_snowflake_size")}</label
          >
          <input
            id="frost-crystallinity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.frost.crystallinity}
            oninput={(e) =>
              state.updateEffect("frost", {
                crystallinity: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.frost.crystallinity * 100)}%</span
          >
        </div>

        <div class="slider-row">
          <label for="frost-spread">{t("effect_deep_trail_length")}</label>
          <input
            id="frost-spread"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.frost.spreadRate}
            oninput={(e) =>
              state.updateEffect("frost", {
                spreadRate: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.frost.spreadRate * 100)}%</span
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

  .frost-controls {
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
