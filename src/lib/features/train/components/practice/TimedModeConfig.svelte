<!--
  TimedModeConfig.svelte - Timed Mode Settings

  Configuration panel for timed practice mode.
-->
<script lang="ts">
  import type { TimedConfig } from "../../state/train-practice-state.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    config: TimedConfig;
    onUpdate: (config: Partial<TimedConfig>) => void;
  }

  let { config, onUpdate }: Props = $props();
</script>

<div class="config-panel">
  <h3>{t('train_timed_config_title')}</h3>
  <p class="description">{t('train_timed_config_desc')}</p>

  <div class="setting-group">
    <label for="bpm">
      {t('train_timed_tempo')}
      <span class="hint">{t('train_timed_bpm_value', { bpm: config.bpm })}</span>
    </label>
    <input
      id="bpm"
      type="range"
      min="40"
      max="180"
      step="5"
      value={config.bpm}
      oninput={(e) => onUpdate({ bpm: parseInt(e.currentTarget.value) })}
    />
    <div class="range-labels">
      <span>{t('train_timed_slower')}</span>
      <span>{t('train_timed_faster')}</span>
    </div>
  </div>

  <div class="setting-group">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={config.strictTiming}
        onchange={(e) => onUpdate({ strictTiming: e.currentTarget.checked })}
      />
      <span>{t('train_timed_strict')}</span>
    </label>
    <p class="hint">{t('train_timed_strict_hint')}</p>
  </div>

  <div class="setting-group">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={config.showTimingFeedback}
        onchange={(e) =>
          onUpdate({ showTimingFeedback: e.currentTarget.checked })}
      />
      <span>{t('train_timed_feedback')}</span>
    </label>
    <p class="hint">{t('train_timed_feedback_hint')}</p>
  </div>
</div>

<style>
  .config-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    color: var(--theme-text);
  }

  h3 {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .description {
    margin: 0;
    font-size: 0.875rem;
    opacity: 0.7;
  }

  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  label {
    font-size: 0.875rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hint {
    font-size: 0.75rem;
    opacity: 0.6;
    font-weight: 400;
  }

  input[type="range"] {
    width: 100%;
    height: var(--min-touch-target);
    background: transparent;
    outline: none;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }

  /* Track styling */
  input[type="range"]::-webkit-slider-runnable-track {
    height: 0.5rem;
    background: var(--theme-stroke);
    border-radius: 0.25rem;
  }

  input[type="range"]::-moz-range-track {
    height: 0.5rem;
    background: var(--theme-stroke);
    border-radius: 0.25rem;
  }

  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 28px;
    height: 28px;
    background: var(--semantic-info, var(--semantic-info));
    border-radius: 50%;
    cursor: pointer;
    margin-top: -10px;
  }

  input[type="range"]::-moz-range-thumb {
    width: 28px;
    height: 28px;
    background: var(--semantic-info, var(--semantic-info));
    border-radius: 50%;
    cursor: pointer;
    border: none;
  }

  .range-labels {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    opacity: 0.6;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    min-height: var(--min-touch-target);
    padding: 0.5rem 0;
  }

  input[type="checkbox"] {
    width: 24px;
    height: 24px;
    cursor: pointer;
    flex-shrink: 0;
  }
</style>
