<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * ClipSpeedSection - Speed presets and custom speed control
   */

  interface Props {
    playbackRate: number;
    onUpdateSpeed: (value: number) => void;
  }

  let { playbackRate, onUpdateSpeed }: Props = $props();

  const SPEED_PRESETS = [
    { label: "0.25x", value: 0.25 },
    { label: "0.5x", value: 0.5 },
    { label: "0.75x", value: 0.75 },
    { label: "1x", value: 1 },
    { label: "1.5x", value: 1.5 },
    { label: "2x", value: 2 },
    { label: "4x", value: 4 },
  ];
</script>

<section class="section">
  <div class="section-header">
    <i class="fa-solid fa-gauge" aria-hidden="true"></i>
    <span>{t("compose_ui_speed")}</span>
  </div>

  <div class="speed-presets">
    {#each SPEED_PRESETS as preset}
      <button
        class="preset-btn"
        class:active={playbackRate === preset.value}
        onclick={() => onUpdateSpeed(preset.value)}
      >
        {preset.label}
      </button>
    {/each}
  </div>

  <div class="field">
    <label class="field-label" for="custom-speed-range"
      >{t("compose_ui_custom_speed")}</label
    >
    <div class="input-group">
      <input
        id="custom-speed-range"
        type="range"
        class="range-input"
        min="0.1"
        max="4"
        step="0.05"
        value={playbackRate}
        oninput={(e) =>
          onUpdateSpeed(parseFloat((e.target as HTMLInputElement).value))}
      />
      <input
        type="number"
        class="number-input"
        min="0.1"
        max="4"
        step="0.05"
        value={playbackRate.toFixed(2)}
        aria-label={t("compose_ui_custom_speed_value")}
        onchange={(e) =>
          onUpdateSpeed(parseFloat((e.target as HTMLInputElement).value))}
      />
    </div>
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

  .input-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .number-input {
    width: 60px;
    padding: 6px 8px;
    background: var(--theme-input-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 4px;
    font-size: var(--font-size-compact);
    color: var(--theme-text, var(--theme-text));
    text-align: center;
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
    width: 24px;
    height: 24px;
    background: var(--theme-accent);
    border-radius: 50%;
    cursor: pointer;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .range-input::-moz-range-thumb {
    width: 24px;
    height: 24px;
    background: var(--theme-accent);
    border-radius: 50%;
    cursor: pointer;
    border: none;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .range-input:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 4px;
  }

  .field-label {
    display: block;
    margin-bottom: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-muted, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .speed-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 12px;
  }

  .preset-btn {
    padding: 6px 10px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 4px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-muted, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .preset-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .preset-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .preset-btn.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }
</style>
