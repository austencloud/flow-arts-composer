<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import type { BloomIntent } from "#lib/shared/effects/domain/effects-config.js";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "#lib/shared/effects/components/AdvancedControls.svelte";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  const COLOR_MODES: { value: BloomIntent["colorMode"]; label: string }[] = [
    { value: "solid", label: "Solid" },
    { value: "prop-matched", label: "Prop" },
    { value: "rainbow", label: "Rainbow" },
    { value: "palette", label: "Palette" },
  ];

  const FALLOFFS: { value: BloomIntent["falloff"]; label: string }[] = [
    { value: "smooth", label: "Smooth" },
    { value: "sharp", label: "Sharp" },
  ];

  // Palette row fixed at 5 entries for v1; add/remove deferred.
  function paletteAt(i: number): string {
    if (!state) return "#ffffff";
    return state.bloom.palette[i] ?? "#ffffff";
  }
  function setPaletteAt(i: number, value: string) {
    if (!state) return;
    const next = [...state.bloom.palette];
    while (next.length <= i) next.push("#ffffff");
    next[i] = value;
    state.updateEffect("bloom", { palette: next });
  }
</script>

<div class="customize-view">
  <button type="button" class="back-btn" onclick={onBack}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    {t("effect_deep_back_to_presets")}
  </button>

  {#if state}
    <div class="bloom-controls">
      <OptionChipRow
        label="Color"
        ariaLabel="Bloom color mode"
        value={state.bloom.colorMode}
        options={COLOR_MODES}
        onChange={(v) => state.updateEffect("bloom", { colorMode: v })}
      />

      <OptionChipRow
        label="Falloff"
        ariaLabel="Bloom falloff"
        value={state.bloom.falloff}
        options={FALLOFFS}
        onChange={(v) => state.updateEffect("bloom", { falloff: v })}
      />

      {#if state.bloom.colorMode === "solid"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_tint")}</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.bloom.color}
                oninput={(e) =>
                  state.updateEffect("bloom", {
                    color: (e.currentTarget as HTMLInputElement).value,
                  })}
              />
            </label>
          </div>
        </div>
      {:else if state.bloom.colorMode === "palette"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_palette")}</span>
          <div class="color-pickers">
            {#each Array.from({ length: 5 }, (_, i) => i) as i (i)}
              <label class="color-picker">
                <input
                  type="color"
                  value={paletteAt(i)}
                  oninput={(e) =>
                    setPaletteAt(
                      i,
                      (e.currentTarget as HTMLInputElement).value
                    )}
                />
              </label>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Intensity -->
      <div class="slider-row">
        <label for="bloom-intensity">{t("effect_deep_intensity")}</label>
        <input
          id="bloom-intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.bloom.intensity}
          oninput={(e) =>
            state.updateEffect("bloom", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.bloom.intensity * 100)}%</span
        >
      </div>

      <!-- Radius -->
      <div class="slider-row">
        <label for="bloom-radius">{t("effect_deep_radius")}</label>
        <input
          id="bloom-radius"
          type="range"
          min="8"
          max="200"
          step="2"
          value={state.bloom.radius}
          oninput={(e) =>
            state.updateEffect("bloom", {
              radius: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value">{state.bloom.radius}px</span>
      </div>

      <AdvancedControls count={6}>
        <div class="slider-row">
          <label for="bloom-core">{t("effect_deep_core")}</label>
          <input
            id="bloom-core"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.bloom.coreStrength}
            oninput={(e) =>
              state.updateEffect("bloom", {
                coreStrength: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.bloom.coreStrength * 100)}%</span
          >
        </div>

        <!-- Pulse -->
        <div class="slider-row">
          <label for="bloom-pulse">{t("effect_deep_pulse")}</label>
          <input
            id="bloom-pulse"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.bloom.pulse}
            oninput={(e) =>
              state.updateEffect("bloom", {
                pulse: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.bloom.pulse * 100)}%</span
          >
        </div>

        <!-- Pulse Rate -->
        <div class="slider-row">
          <label for="bloom-pulse-rate">{t("effect_deep_rate")}</label>
          <input
            id="bloom-pulse-rate"
            type="range"
            min="0.25"
            max="4"
            step="0.25"
            value={state.bloom.pulseRate}
            oninput={(e) =>
              state.updateEffect("bloom", {
                pulseRate: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value">{state.bloom.pulseRate}Hz</span>
        </div>

        <!-- Streak (anamorphic motion smear) -->
        <div class="slider-row">
          <label for="bloom-streak">{t("effect_deep_streak")}</label>
          <input
            id="bloom-streak"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.bloom.streak}
            oninput={(e) =>
              state.updateEffect("bloom", {
                streak: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.bloom.streak * 100)}%</span
          >
        </div>

        <!-- Spikes (diffraction star glint) -->
        <div class="slider-row">
          <label for="bloom-spikes">{t("effect_deep_spikes")}</label>
          <input
            id="bloom-spikes"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.bloom.spikes}
            oninput={(e) =>
              state.updateEffect("bloom", {
                spikes: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.bloom.spikes * 100)}%</span
          >
        </div>

        <!-- Afterglow (long-exposure trail persistence) -->
        <div class="slider-row">
          <label for="bloom-afterglow">{t("effect_deep_afterglow")}</label>
          <input
            id="bloom-afterglow"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.bloom.afterglow}
            oninput={(e) =>
              state.updateEffect("bloom", {
                afterglow: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.bloom.afterglow * 100)}%</span
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

  .bloom-controls {
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

  .color-picker {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
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
