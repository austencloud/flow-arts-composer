<script lang="ts">
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import type { GooIntent } from "$lib/shared/effects/domain/effects-config";
  import OptionChipRow from "../OptionChipRow.svelte";

  interface Props {
    onBack: () => void;
  }

  const { onBack }: Props = $props();
  const state = getEffectsConfigContext();

  const PALETTES: { value: GooIntent["palette"]; label: string; swatch: string }[] = [
    { value: "classic", label: "Classic", swatch: "#3a7fd9" },
    { value: "mercury", label: "Mercury", swatch: "#9a9fa8" },
    { value: "acid", label: "Acid", swatch: "#7fd94a" },
    { value: "blood", label: "Ritual", swatch: "#8a1818" },
    { value: "spirit", label: "Spirit", swatch: "#80ffe8" },
    { value: "custom", label: "Custom", swatch: "#ffffff" },
  ];

  const TRACKING: { value: GooIntent["trackingMode"]; label: string }[] = [
    { value: "left_end", label: "Left" },
    { value: "right_end", label: "Right" },
    { value: "both_ends", label: "Both" },
  ];

  // The 2D goo renderer reads surfaceTension (exposed as Viscosity — how much
  // the liquid congeals), motionEmission (Amount — stream mass), intensity,
  // palette and tracking. Drip rate is derived from viscosity rather than being
  // its own knob: watery liquid sheds drops, thick liquid clings. It ignores
  // ambientEmission and clarity, which only the 3D viewer's goo reads, and
  // spewStyle, which nothing reads.
</script>

<div class="customize-view">
  <button type="button" class="back-btn" onclick={onBack}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    Back to presets
  </button>

  {#if state}
    <div class="goo-controls">
      <OptionChipRow label="Palette" ariaLabel="Goo palette" value={state.goo.palette} options={PALETTES} onChange={(v) => state.updateEffect("goo", { palette: v })} />

      {#if state.goo.palette === "custom"}
        <div class="color-row">
          <span class="color-label">Tint</span>
          <div class="color-pickers">
            <label class="color-picker">
              <input
                type="color"
                value={state.goo.customColor}
                oninput={(e) =>
                  state.updateEffect("goo", {
                    customColor: (e.currentTarget as HTMLInputElement).value,
                  })}
              />
            </label>
          </div>
        </div>
      {/if}

      <OptionChipRow label="Tracking" ariaLabel="Goo tracking mode" value={state.goo.trackingMode} options={TRACKING} onChange={(v) => state.updateEffect("goo", { trackingMode: v })} />

      <!-- Viscosity. Names the MATERIAL rather than a number inside it: low is
           watery and sheds drips, high congeals and hangs together. -->
      <div class="slider-row">
        <label for="goo-viscosity">Viscosity</label>
        <input
          id="goo-viscosity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.goo.surfaceTension}
          oninput={(e) =>
            state.updateEffect("goo", {
              surfaceTension: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value">{Math.round(state.goo.surfaceTension * 100)}%</span>
      </div>

      <!-- Amount -->
      <div class="slider-row">
        <label for="goo-amount">Amount</label>
        <input
          id="goo-amount"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.goo.motionEmission}
          oninput={(e) =>
            state.updateEffect("goo", {
              motionEmission: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value">{Math.round(state.goo.motionEmission * 100)}%</span>
      </div>

      <!-- Intensity -->
      <div class="slider-row">
        <label for="goo-intensity">Intensity</label>
        <input
          id="goo-intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={state.goo.intensity}
          oninput={(e) =>
            state.updateEffect("goo", {
              intensity: +(e.currentTarget as HTMLInputElement).value,
            })}
        />
        <span class="slider-value">{Math.round(state.goo.intensity * 100)}%</span>
      </div>
    </div>
  {:else}
    <p class="empty">Effect state unavailable.</p>
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

  .goo-controls {
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
