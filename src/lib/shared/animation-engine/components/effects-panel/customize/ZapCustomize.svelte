<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import OptionChipRow from "../OptionChipRow.svelte";
  import AdvancedControls from "#lib/shared/effects/components/AdvancedControls.svelte";
  import type { ZapIntent } from "#lib/shared/effects/domain/effects-config.js";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  const STYLES: { value: ZapIntent["style"]; label: string; icon: string }[] = [
    { value: "branching", label: "Storm", icon: "fa-bolt" },
    { value: "plasma", label: "Plasma", icon: "fa-fire-flame-simple" },
    { value: "web", label: "Web", icon: "fa-diagram-project" },
  ];
</script>

<div class="customize-view">
  <button type="button" class="back-btn" onclick={onBack}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    {t("effect_deep_back_to_presets")}
  </button>

  {#if state}
    <div class="zap-controls">
      <!-- Style (chip row) -->
      <OptionChipRow
        label="Style"
        ariaLabel="Zap style"
        value={state.zap.style}
        options={STYLES}
        onChange={(v) => state.updateEffect("zap", { style: v })}
      />

      <!-- Intensity -->
      <div class="slider-row">
        <label for="zap-intensity">{t("effect_deep_intensity")}</label>
        <input
          id="zap-intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.zap.intensity}
          oninput={(e) =>
            state.updateEffect("zap", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value"
          >{Math.round(state.zap.intensity * 100)}%</span
        >
      </div>

      <!-- Frequency -->
      <div class="slider-row">
        <label for="zap-frequency">{t("effect_deep_frequency")}</label>
        <input
          id="zap-frequency"
          type="range"
          min="1"
          max="30"
          step="1"
          value={state.zap.frequency}
          oninput={(e) =>
            state.updateEffect("zap", {
              frequency: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value">{state.zap.frequency}/s</span>
      </div>

      <!-- Per-hand color pickers -->
      <div class="color-row">
        <span class="color-label">{t("effect_deep_colors")}</span>
        <div class="color-pickers">
          <label class="color-picker">
            <input
              type="color"
              value={state.zap.leftColor}
              oninput={(e) =>
                state.updateEffect("zap", {
                  leftColor: (e.currentTarget as HTMLInputElement).value,
                })}
            />
            <span class="color-hand blue">{t("effect_deep_left")}</span>
          </label>
          <label class="color-picker">
            <input
              type="color"
              value={state.zap.rightColor}
              oninput={(e) =>
                state.updateEffect("zap", {
                  rightColor: (e.currentTarget as HTMLInputElement).value,
                })}
            />
            <span class="color-hand red">{t("effect_deep_right")}</span>
          </label>
        </div>
      </div>

      <AdvancedControls count={5}>
        <!-- Branching (Storm style only) -->
        {#if state.zap.style === "branching"}
          <div class="slider-row">
            <label for="zap-branching">{t("effect_deep_branching")}</label>
            <input
              id="zap-branching"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={state.zap.branching}
              oninput={(e) =>
                state.updateEffect("zap", {
                  branching: +(e.currentTarget as HTMLInputElement).value,
                })}
            />
            <span class="slider-value"
              >{Math.round(state.zap.branching * 100)}%</span
            >
          </div>
        {/if}

        <!-- Wobble (Plasma style only) -->
        {#if state.zap.style === "plasma"}
          <div class="slider-row">
            <label for="zap-wobble-rate">{t("effect_deep_wobble_rate")}</label>
            <input
              id="zap-wobble-rate"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={state.zap.wobbleRate}
              oninput={(e) =>
                state.updateEffect("zap", {
                  wobbleRate: +(e.currentTarget as HTMLInputElement).value,
                })}
            />
            <span class="slider-value"
              >{Math.round(state.zap.wobbleRate * 100)}%</span
            >
          </div>
          <div class="slider-row">
            <label for="zap-wobble-amount"
              >{t("effect_deep_wobble_amount")}</label
            >
            <input
              id="zap-wobble-amount"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={state.zap.wobbleAmount}
              oninput={(e) =>
                state.updateEffect("zap", {
                  wobbleAmount: +(e.currentTarget as HTMLInputElement).value,
                })}
            />
            <span class="slider-value"
              >{Math.round(state.zap.wobbleAmount * 100)}%</span
            >
          </div>
        {/if}

        <!-- Glow -->
        <div class="slider-row">
          <label for="zap-glow">{t("effect_deep_glow")}</label>
          <input
            id="zap-glow"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.zap.glow}
            oninput={(e) =>
              state.updateEffect("zap", {
                glow: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value">{Math.round(state.zap.glow * 100)}%</span>
        </div>

        <!-- Jitter -->
        <div class="slider-row">
          <label for="zap-jitter">{t("effect_deep_jitter")}</label>
          <input
            id="zap-jitter"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.zap.jitter}
            oninput={(e) =>
              state.updateEffect("zap", {
                jitter: +(e.currentTarget as HTMLInputElement).value,
              })}
          />
          <span class="slider-value">{Math.round(state.zap.jitter * 100)}%</span
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

  /* Layout */
  .zap-controls {
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
    gap: 12px;
    flex: 1;
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

  .color-hand {
    font-size: var(--font-size-compact, 12px);
  }

  .color-hand.blue {
    color: var(--prop-blue, #3b82f6);
  }

  .color-hand.red {
    color: var(--prop-red, #ef4444);
  }

  .empty {
    opacity: 0.6;
    font-size: var(--font-size-min, 14px);
    padding: 4px 0;
  }
</style>
