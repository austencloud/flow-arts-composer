<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { InkIntent } from "$lib/shared/effects/domain/effects-config";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "$lib/shared/effects/components/AdvancedControls.svelte";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  // Palette swatches use the palette's pigment color so each chip reads
  // identity at a glance. Watercolor reads blue, neon reads magenta,
  // blood reads dark red, etc. Palette choice also flips emissive /
  // watercolor flags inside the translator - user doesn't see those as
  // separate knobs.
  const PALETTES: {
    value: InkIntent["palette"];
    label: string;
    swatch: string;
  }[] = [
    { value: "india", label: "India", swatch: "#0a0a0a" },
    { value: "sumi", label: "Sumi", swatch: "#404040" },
    { value: "watercolor", label: "Watercolor", swatch: "#4080c0" },
    { value: "neon", label: "Neon", swatch: "#ff2080" },
    { value: "blood", label: "Blood", swatch: "#a84255" },
    { value: "acid", label: "Acid", swatch: "#7fd94a" },
    { value: "custom", label: "Custom", swatch: "#ffffff" },
  ];

  const TRACKING: { value: InkIntent["trackingMode"]; label: string }[] = [
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
    <div class="ink-controls">
      <!-- Palette chip row (7 items) -->
      <OptionChipRow
        label="Palette"
        ariaLabel="Ink palette"
        value={state.ink.palette}
        options={PALETTES}
        onChange={(v) => state.updateEffect("ink", { palette: v })}
      />

      {#if state.ink.palette === "custom"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_tint")}</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.ink.customColor}
                oninput={(e) =>
                  state.updateEffect("ink", {
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
        ariaLabel="Ink tracking mode"
        value={state.ink.trackingMode}
        options={TRACKING}
        onChange={(v) => state.updateEffect("ink", { trackingMode: v })}
      />

      <!-- Ambient emission (hard-capped at 0.3 in renderer) -->
      <div class="slider-row">
        <label for="ink-ambient">{t("effect_deep_ambient")}</label>
        <input
          id="ink-ambient"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.ink.ambientEmission}
          oninput={(e) =>
            state.updateEffect("ink", {
              ambientEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.ink.ambientEmission * 100)}%</span
        >
      </div>

      <!-- Motion emission (dominant) -->
      <div class="slider-row">
        <label for="ink-motion">{t("effect_deep_motion")}</label>
        <input
          id="ink-motion"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.ink.motionEmission}
          oninput={(e) =>
            state.updateEffect("ink", {
              motionEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.ink.motionEmission * 100)}%</span
        >
      </div>

      <!-- Intensity (width + opacity) -->
      <div class="slider-row">
        <label for="ink-intensity">{t("effect_deep_intensity")}</label>
        <input
          id="ink-intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.ink.intensity}
          oninput={(e) =>
            state.updateEffect("ink", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.ink.intensity * 100)}%</span
        >
      </div>

      <AdvancedControls count={2}>
        <!-- Viscosity - wires through now, sprint 2 renders it as strand breakup -->
        <div class="slider-row">
          <label for="ink-viscosity">{t("effect_deep_viscosity")}</label>
          <input
            id="ink-viscosity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.ink.viscosity}
            oninput={(e) =>
              state.updateEffect("ink", {
                viscosity: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.ink.viscosity * 100)}%</span
          >
        </div>

        <!-- Splatter - wires through now, sprint 2 renders it as burst particles -->
        <div class="slider-row">
          <label for="ink-splatter">{t("effect_deep_splatter")}</label>
          <input
            id="ink-splatter"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.ink.splatterIntensity}
            oninput={(e) =>
              state.updateEffect("ink", {
                splatterIntensity: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.ink.splatterIntensity * 100)}%</span
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

  .ink-controls {
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
