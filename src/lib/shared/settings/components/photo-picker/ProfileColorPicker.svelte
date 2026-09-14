<!--
  ProfileColorPicker.svelte

  A compact color swatch picker for the user's profile accent color.
  Collapsed by default - shows the current color and a "Change" button.
  Expanding reveals preset swatches plus a custom color swatch that
  opens the native OS color picker.
-->
<script lang="ts">
  interface Props {
    selectedColor: string;
    onColorChange: (color: string) => void;
    saving?: boolean;
  }

  let { selectedColor, onColorChange, saving = false }: Props = $props();

  import { COLOR_PRESETS } from "$lib/shared/ui/color-presets";

  let expanded = $state(false);
  let nativePickerRef: HTMLInputElement | undefined = $state();

  function handlePresetClick(hex: string) {
    onColorChange(hex);
  }

  function openNativePicker() {
    nativePickerRef?.click();
  }

  function handleNativeInput(e: Event) {
    const value = (e.target as HTMLInputElement).value;
    onColorChange(value);
  }
</script>

<div class="profile-color-picker">
  <!-- Collapsed: single row with current color + change button -->
  <button
    class="color-toggle-row"
    onclick={() => (expanded = !expanded)}
    disabled={saving}
  >
    <div
      class="current-color-dot"
      style="background: {selectedColor}"
      aria-hidden="true"
    ></div>
    <div class="toggle-text">
      <span class="toggle-label">Profile Color</span>
      <span class="toggle-desc">Ring color around your avatar</span>
    </div>
    <span class="toggle-action">{expanded ? "Done" : "Change"}</span>
  </button>

  <!-- Expanded: preset grid + custom picker swatch -->
  {#if expanded}
    <div class="color-grid" role="radiogroup" aria-label="Profile color presets">
      {#each COLOR_PRESETS as preset (preset.hex)}
        {@const isSelected =
          preset.hex.toLowerCase() === selectedColor.toLowerCase()}
        <button
          class="color-swatch"
          class:selected={isSelected}
          style="--swatch-color: {preset.hex}"
          onclick={() => handlePresetClick(preset.hex)}
          disabled={saving}
          role="radio"
          aria-checked={isSelected}
          aria-label={preset.name}
          title={preset.name}
        >
          {#if isSelected}
            <i class="fas fa-check" aria-hidden="true"></i>
          {/if}
        </button>
      {/each}

      <!-- Custom color swatch - opens native OS picker -->
      <button
        class="color-swatch custom-swatch"
        style="--swatch-color: {selectedColor}"
        onclick={openNativePicker}
        disabled={saving}
        aria-label="Pick a custom color"
        title="Custom color"
      >
        <i class="fas fa-eyedropper" aria-hidden="true"></i>
      </button>
    </div>

    <!-- Hidden native color input - triggered by the custom swatch -->
    <input
      bind:this={nativePickerRef}
      type="color"
      value={selectedColor}
      oninput={handleNativeInput}
      disabled={saving}
      class="hidden-color-input"
      aria-hidden="true"
      tabindex="-1"
    />
  {/if}
</div>

<style>
  .profile-color-picker {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }

  /* ═══════ Toggle Row (collapsed state) ═══════ */

  .color-toggle-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 10px);
    padding: 8px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-sm, 8px);
    cursor: pointer;
    transition: all 0.15s ease;
    min-height: var(--min-touch-target, 44px);
    width: 100%;
    text-align: left;
  }

  .color-toggle-row:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .color-toggle-row:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .current-color-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.25);
    flex-shrink: 0;
  }

  .toggle-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .toggle-label {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .toggle-desc {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .toggle-action {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-accent, #6366f1);
    flex-shrink: 0;
  }

  /* ═══════ Color Grid ═══════ */

  .color-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 8px;
    padding: 4px 0;
  }

  .color-swatch {
    aspect-ratio: 1;
    width: 100%;
    max-width: 42px;
    border-radius: 50%;
    border: 2px solid transparent;
    background: var(--swatch-color);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      border-color 0.15s ease,
      transform 0.15s ease,
      box-shadow 0.15s ease;
    padding: 0;
    color: white;
    font-size: var(--font-size-compact, 12px);
  }

  .color-swatch:hover:not(:disabled) {
    transform: scale(1.15);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .color-swatch.selected {
    border-color: white;
    box-shadow: 0 0 0 2px var(--swatch-color), 0 0 12px var(--swatch-color);
    transform: scale(1.1);
  }

  .color-swatch:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .color-swatch:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .color-swatch i {
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  }

  /* The custom-color swatch: conic gradient background with eyedropper icon */
  .custom-swatch {
    background: conic-gradient(
      #ef4444, #f97316, #eab308, #22c55e,
      #06b6d4, #3b82f6, #8b5cf6, #ec4899, #ef4444
    ) !important;
    border-color: rgba(255, 255, 255, 0.15);
  }

  .custom-swatch:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.5);
  }

  .custom-swatch i {
    font-size: var(--font-size-compact, 12px);
  }

  /* Hidden native input - only used to trigger the OS picker dialog */
  .hidden-color-input {
    position: absolute;
    width: 0;
    height: 0;
    padding: 0;
    border: none;
    opacity: 0;
    pointer-events: none;
  }

  /* ═══════ Accessibility ═══════ */

  @media (prefers-reduced-motion: reduce) {
    .color-swatch,
    .color-toggle-row {
      transition: none;
    }

    .color-swatch:hover:not(:disabled) {
      transform: none;
    }

    .color-swatch.selected {
      transform: none;
    }
  }
</style>
