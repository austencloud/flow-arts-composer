<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  /**
   * ClipAppearanceSection - Color, rotation, and opacity controls
   */

  interface Props {
    color: string;
    rotation: number;
    opacity: number;
    onUpdateColor: (color: string) => void;
    onUpdateRotation: (degrees: number) => void;
    onUpdateOpacity: (value: number) => void;
  }

  let {
    color,
    rotation,
    opacity,
    onUpdateColor,
    onUpdateRotation,
    onUpdateOpacity,
  }: Props = $props();

  const COLOR_PRESETS = [
    "#4a9eff", // Blue
    "#ff6b6b", // Red
    "#51cf66", // Green
    "#ffd43b", // Yellow
    "#cc5de8", // Purple
    "#ff922b", // Orange
    "#20c997", // Teal
    "#f06595", // Pink
  ];
</script>

<section class="section">
  <div class="section-header">
    <i class="fa-solid fa-palette" aria-hidden="true"></i>
    <span>Appearance</span>
  </div>

  <div class="field">
    <span class="field-label">{t("compose_ui_clip_color")}</span>
    <div class="color-presets">
      {#each COLOR_PRESETS as presetColor}
        <button
          class="color-swatch"
          class:active={color === presetColor}
          style="background: {presetColor}"
          onclick={() => onUpdateColor(presetColor)}
          aria-label="Set color to {presetColor}"
        ></button>
      {/each}
    </div>
  </div>

  <div class="field">
    <label class="field-label" for="clip-rotation">Rotation ({rotation}°)</label
    >
    <input
      id="clip-rotation"
      type="range"
      class="range-input"
      min="0"
      max="360"
      step="15"
      value={rotation}
      oninput={(e) =>
        onUpdateRotation(parseInt((e.target as HTMLInputElement).value))}
    />
  </div>

  <div class="field">
    <label class="field-label" for="clip-opacity"
      >Opacity ({Math.round(opacity * 100)}%)</label
    >
    <input
      id="clip-opacity"
      type="range"
      class="range-input"
      min="0"
      max="1"
      step="0.05"
      value={opacity}
      oninput={(e) =>
        onUpdateOpacity(parseFloat((e.target as HTMLInputElement).value))}
    />
  </div>
</section>

<style>
  .section {
    margin-bottom: 20px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--theme-stroke);
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-header i {
    font-size: var(--font-size-compact);
    opacity: 0.6;
  }

  .field {
    margin-bottom: 12px;
  }

  .range-input {
    flex: 1;
    height: 4px;
    appearance: none;
    background: var(--theme-stroke);
    border-radius: 2px;
  }

  .range-input::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    background: var(--theme-accent);
    border-radius: 50%;
    cursor: pointer;
  }

  .field-label {
    display: block;
    margin-bottom: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-muted, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .color-presets {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .color-swatch {
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    border-radius: 6px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .color-swatch:hover {
    transform: scale(1.1);
  }

  .color-swatch.active {
    border-color: white;
    box-shadow: 0 0 0 2px var(--theme-accent);
  }
</style>
