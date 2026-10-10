<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import type { PulseIntent } from "#lib/shared/effects/domain/effects-config.js";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "#lib/shared/effects/components/AdvancedControls.svelte";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  const TRIGGERS: { value: PulseIntent["trigger"]; label: string }[] = [
    { value: "beat", label: "Beat" },
    { value: "velocity", label: "Velocity" },
    { value: "continuous", label: "Continuous" },
  ];

  const STYLES: { value: PulseIntent["style"]; label: string }[] = [
    { value: "stroke", label: "Stroke" },
    { value: "glow", label: "Glow" },
  ];

  const PALETTES: {
    value: PulseIntent["palette"];
    label: string;
    swatch: string;
  }[] = [
    { value: "sonar", label: "Sonar", swatch: "#38bdf8" },
    { value: "ripple", label: "Ripple", swatch: "#93c5fd" },
    { value: "aurora", label: "Aurora", swatch: "#a855f7" },
    { value: "neon", label: "Neon", swatch: "#f0abfc" },
    { value: "ember", label: "Ember", swatch: "#ff6000" },
    { value: "void", label: "Void", swatch: "#404060" },
    { value: "custom", label: "Custom", swatch: "#ffffff" },
  ];

  const COLOR_MODES: { value: PulseIntent["colorMode"]; label: string }[] = [
    { value: "solid", label: "Solid" },
    { value: "prop-matched", label: "Prop" },
    { value: "rainbow", label: "Rainbow" },
    { value: "palette", label: "Palette" },
  ];

  const TRACKING: { value: PulseIntent["trackingMode"]; label: string }[] = [
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
    <div class="pulse-controls">
      <OptionChipRow
        label="Trigger"
        ariaLabel="Pulse trigger mode"
        value={state.pulse.trigger}
        options={TRIGGERS}
        onChange={(v) => state.updateEffect("pulse", { trigger: v })}
      />

      <OptionChipRow
        label="Palette"
        ariaLabel="Pulse palette"
        value={state.pulse.palette}
        options={PALETTES}
        onChange={(v) => state.updateEffect("pulse", { palette: v })}
      />

      <!-- Conditional color picker -->
      {#if state.pulse.palette === "custom" || state.pulse.colorMode === "solid"}
        <div class="color-row">
          <span class="color-label">{t("effect_deep_tint")}</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.pulse.palette === "custom"
                  ? state.pulse.customColor
                  : state.pulse.color}
                oninput={(e) => {
                  const val = (e.currentTarget as HTMLInputElement).value;
                  if (state.pulse.palette === "custom") {
                    state.updateEffect("pulse", { customColor: val });
                  } else {
                    state.updateEffect("pulse", { color: val });
                  }
                }}
              />
            </label>
          </div>
        </div>
      {/if}

      <OptionChipRow
        label="Color"
        ariaLabel="Pulse color mode"
        value={state.pulse.colorMode}
        options={COLOR_MODES}
        onChange={(v) => state.updateEffect("pulse", { colorMode: v })}
      />

      <OptionChipRow
        label="Tracking"
        ariaLabel="Pulse tracking mode"
        value={state.pulse.trackingMode}
        options={TRACKING}
        onChange={(v) => state.updateEffect("pulse", { trackingMode: v })}
      />

      <!-- Conditional sliders based on trigger -->
      {#if state.pulse.trigger === "beat"}
        <div class="slider-row">
          <label for="pulse-beat-interval"
            >{t("effect_deep_beat_interval")}</label
          >
          <input
            id="pulse-beat-interval"
            type="range"
            min="1"
            max="8"
            step="1"
            value={state.pulse.beatInterval}
            oninput={(e) =>
              state.updateEffect("pulse", {
                beatInterval: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value">{state.pulse.beatInterval}</span>
        </div>
      {/if}

      {#if state.pulse.trigger === "velocity"}
        <div class="slider-row">
          <label for="pulse-velocity-threshold"
            >{t("effect_deep_vel_threshold")}</label
          >
          <input
            id="pulse-velocity-threshold"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.pulse.velocityThreshold}
            oninput={(e) =>
              state.updateEffect("pulse", {
                velocityThreshold: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.pulse.velocityThreshold * 100)}%</span
          >
        </div>
      {/if}

      <!-- Always-visible sliders -->
      <div class="slider-row">
        <label for="pulse-intensity">{t("effect_deep_intensity")}</label>
        <input
          id="pulse-intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.pulse.intensity}
          oninput={(e) =>
            state.updateEffect("pulse", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.pulse.intensity * 100)}%</span
        >
      </div>

      <div class="slider-row">
        <label for="pulse-reach">{t("effect_deep_reach")}</label>
        <input
          id="pulse-reach"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.pulse.reach}
          oninput={(e) =>
            state.updateEffect("pulse", {
              reach: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value">{Math.round(state.pulse.reach * 100)}%</span>
      </div>

      <AdvancedControls count={8}>
        <OptionChipRow
          label="Style"
          ariaLabel="Pulse style"
          value={state.pulse.style}
          options={STYLES}
          onChange={(v) => state.updateEffect("pulse", { style: v })}
        />

        <div class="slider-row">
          <label for="pulse-lifetime">{t("effect_deep_lifetime")}</label>
          <input
            id="pulse-lifetime"
            type="range"
            min="0.2"
            max="3.0"
            step="0.1"
            value={state.pulse.lifetime}
            oninput={(e) =>
              state.updateEffect("pulse", {
                lifetime: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value">{state.pulse.lifetime.toFixed(1)}s</span>
        </div>

        <div class="slider-row">
          <label for="pulse-thickness">{t("effect_deep_thickness")}</label>
          <input
            id="pulse-thickness"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.pulse.thickness}
            oninput={(e) =>
              state.updateEffect("pulse", {
                thickness: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.pulse.thickness * 100)}%</span
          >
        </div>

        <div class="slider-row">
          <label for="pulse-velocity-scale"
            >{t("effect_deep_velocity_size")}</label
          >
          <input
            id="pulse-velocity-scale"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.pulse.velocityScale}
            oninput={(e) =>
              state.updateEffect("pulse", {
                velocityScale: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.pulse.velocityScale * 100)}%</span
          >
        </div>

        <div class="slider-row">
          <label for="pulse-asymmetry">{t("effect_deep_asymmetry")}</label>
          <input
            id="pulse-asymmetry"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.pulse.asymmetry}
            oninput={(e) =>
              state.updateEffect("pulse", {
                asymmetry: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.pulse.asymmetry * 100)}%</span
          >
        </div>

        <div class="slider-row">
          <label for="pulse-chromatic">{t("effect_deep_chromatic")}</label>
          <input
            id="pulse-chromatic"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.pulse.chromatic}
            oninput={(e) =>
              state.updateEffect("pulse", {
                chromatic: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.pulse.chromatic * 100)}%</span
          >
        </div>

        <div class="slider-row">
          <label for="pulse-flash">{t("effect_deep_flash")}</label>
          <input
            id="pulse-flash"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.pulse.flash}
            oninput={(e) =>
              state.updateEffect("pulse", {
                flash: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.pulse.flash * 100)}%</span
          >
        </div>

        <div class="slider-row">
          <label for="pulse-harmonics">{t("effect_deep_harmonics")}</label>
          <input
            id="pulse-harmonics"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.pulse.harmonics}
            oninput={(e) =>
              state.updateEffect("pulse", {
                harmonics: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value"
            >{Math.round(state.pulse.harmonics * 100)}%</span
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

  .pulse-controls {
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
