<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "#lib/shared/effects/components/AdvancedControls.svelte";
  import type { SparklesIntent } from "#lib/shared/effects/domain/effects-config.js";

  const MODES: {
    value: SparklesIntent["mode"];
    label: string;
    icon: string;
  }[] = [
    { value: "burst", label: "Burst", icon: "fa-bolt" },
    { value: "stream", label: "Stream", icon: "fa-water" },
    { value: "trail", label: "Trail", icon: "fa-route" },
  ];

  const COLOR_MODES: { value: SparklesIntent["colorMode"]; label: string }[] = [
    { value: "solid", label: "Solid" },
    { value: "rainbow", label: "Rainbow" },
    { value: "palette", label: "Palette" },
  ];

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  // Palette swatch row is fixed at 5 entries for v1; add/remove deferred per spec.
  function paletteAt(i: number): string {
    if (!state) return "#ffffff";
    return state.sparkles.palette[i] ?? "#ffffff";
  }
  function setPaletteAt(i: number, value: string) {
    if (!state) return;
    const next = [...state.sparkles.palette];
    while (next.length <= i) next.push("#ffffff");
    next[i] = value;
    state.updateEffect("sparkles", { palette: next });
  }
</script>

<div class="customize-view">
  <button type="button" class="back-btn" onclick={onBack}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    {t("effect_deep_back_to_presets")}
  </button>

  {#if state}
    <div class="sparkles-controls">
      <OptionChipRow
        label="Mode"
        ariaLabel="Sparkle mode"
        value={state.sparkles.mode}
        options={MODES}
        onChange={(v) => state.updateEffect("sparkles", { mode: v })}
      />

      <OptionChipRow
        label="Color"
        ariaLabel="Sparkle color mode"
        value={state.sparkles.colorMode}
        options={COLOR_MODES}
        onChange={(v) => state.updateEffect("sparkles", { colorMode: v })}
      />

      {#if state.sparkles.colorMode === "solid"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_tint")}</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.sparkles.color}
                oninput={(e) =>
                  state.updateEffect("sparkles", {
                    color: (e.currentTarget as HTMLInputElement).value,
                  })}
              />
            </label>
          </div>
        </div>
      {:else if state.sparkles.colorMode === "palette"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_palette")}</span>
          <div class="color-pickers">
            {#each [0, 1, 2, 3, 4] as i (i)}
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

      <!-- Rate -->
      <div class="slider-row">
        <label for="sparkles-rate">{t("effect_deep_rate")}</label>
        <input
          id="sparkles-rate"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.sparkles.rate}
          oninput={(e) =>
            state.updateEffect("sparkles", {
              rate: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.sparkles.rate * 100)}%</span
        >
      </div>

      <!-- Size -->
      <div class="slider-row">
        <label for="sparkles-size">{t("effect_deep_size")}</label>
        <input
          id="sparkles-size"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.sparkles.size}
          oninput={(e) =>
            state.updateEffect("sparkles", {
              size: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.sparkles.size * 100)}%</span
        >
      </div>

      <AdvancedControls count={3}>
        <!-- Lifetime -->
        <div class="slider-row">
          <label for="sparkles-lifetime">{t("effect_deep_lifetime")}</label>
          <input
            id="sparkles-lifetime"
            type="range"
            min="0.1"
            max="3"
            step="0.1"
            value={state.sparkles.lifetime}
            oninput={(e) =>
              state.updateEffect("sparkles", {
                lifetime: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value">{state.sparkles.lifetime.toFixed(1)}s</span
          >
        </div>

        <!-- Spread -->
        <div class="slider-row">
          <label for="sparkles-spread">{t("effect_deep_spread")}</label>
          <input
            id="sparkles-spread"
            type="range"
            min="0"
            max="30"
            step="1"
            value={state.sparkles.spread}
            oninput={(e) =>
              state.updateEffect("sparkles", {
                spread: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value">{state.sparkles.spread}px</span>
        </div>

        <!-- Gravity -->
        <div class="slider-row">
          <label for="sparkles-gravity">{t("effect_deep_gravity")}</label>
          <input
            id="sparkles-gravity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.sparkles.gravity}
            oninput={(e) =>
              state.updateEffect("sparkles", {
                gravity: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.sparkles.gravity * 100)}%</span
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

  .sparkles-controls {
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
    min-width: 40px;
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
