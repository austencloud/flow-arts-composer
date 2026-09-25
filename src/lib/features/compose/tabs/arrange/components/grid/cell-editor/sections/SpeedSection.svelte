<!--
  SpeedSection.svelte

  Speed multiplier control: large numeric display, range slider,
  and 5 preset buttons. Values range from 0.25x to 2.0x.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  let {
    currentSpeed,
    onSetSpeed,
  }: {
    currentSpeed: number;
    onSetSpeed: (speed: number) => void;
  } = $props();

  const presets = [0.25, 0.5, 1.0, 1.5, 2.0];

  function handleSlider(e: Event) {
    const value = parseFloat((e.target as HTMLInputElement).value);
    onSetSpeed(value);
  }
</script>

<div class="speed-section">
  <div class="speed-display">{currentSpeed.toFixed(2)}x</div>

  <input
    type="range"
    class="speed-slider"
    min="0.25"
    max="2.0"
    step="0.25"
    value={currentSpeed}
    oninput={handleSlider}
    aria-label={t("compose_ui_speed_multiplier")}
  />

  <div class="preset-row">
    {#each presets as preset}
      <button
        class="preset-btn"
        class:active={currentSpeed === preset}
        onclick={() => onSetSpeed(preset)}
      >
        {preset}x
      </button>
    {/each}
  </div>
</div>

<style>
  .speed-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: slideDown 180ms ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .speed-display {
    text-align: center;
    font-size: 22px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, white);
  }

  .speed-slider {
    width: 100%;
    accent-color: var(--theme-accent, #60a5fa);
    cursor: pointer;
    height: 6px;
  }

  .preset-row {
    display: flex;
    gap: 6px;
  }

  .preset-btn {
    flex: 1;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 6px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .preset-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
  }

  .preset-btn.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #60a5fa) 12%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #60a5fa) 30%,
      transparent
    );
    color: var(--theme-accent, #60a5fa);
  }

  @media (prefers-reduced-motion: reduce) {
    .speed-section {
      animation: none;
    }

    .preset-btn {
      transition: none;
    }
  }
</style>
