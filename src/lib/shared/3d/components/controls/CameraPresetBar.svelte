<script module lang="ts">
  export type CameraPreset = "front" | "top" | "side" | "perspective";
</script>

<script lang="ts">
  /**
   * CameraPresetBar - Camera view preset buttons
   *
   * Quick access to standard viewing angles: 3D, Wall, Floor, Wheel.
   */

  interface Props {
    /** Currently active preset */
    value: CameraPreset;
    /** Whether using custom camera position (orbit controls moved) */
    isCustom?: boolean;
    /** Callback when preset is selected */
    onchange: (preset: CameraPreset) => void;
  }

  let { value, isCustom = false, onchange }: Props = $props();

  const presets: Array<{ value: CameraPreset; label: string }> = [
    { value: "perspective", label: "3D" },
    { value: "front", label: "Wall" },
    { value: "top", label: "Floor" },
    { value: "side", label: "Wheel" },
  ];
</script>

<div class="camera-bar">
  {#each presets as preset}
    <button
      class="preset-btn"
      class:active={value === preset.value && !isCustom}
      onclick={() => onchange(preset.value)}
      aria-label={`Camera preset: ${preset.label}`}
      aria-pressed={value === preset.value && !isCustom}
    >
      {preset.label}
    </button>
  {/each}
</div>

<style>
  .camera-bar {
    display: flex;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 12px;
    padding: 4px;
  }

  .preset-btn {
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    padding: 0 0.75rem;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-fast),
      color var(--duration-fast);
  }

  .preset-btn:hover {
    color: var(--theme-text, white);
    background: var(--theme-card-hover-bg);
  }

  .preset-btn.active {
    color: white;
    background: var(--theme-accent);
  }

  @media (max-width: 600px) {
    .camera-bar {
      padding: 2px;
    }

    .preset-btn {
      /* Touch target uses var(--min-touch-target) for WCAG AA */
      padding: 0 0.5rem;
      font-size: var(--font-size-compact, 0.75rem);
    }
  }
</style>
