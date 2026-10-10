<!--
  StepModeConfig.svelte - Step-by-Step Mode Settings

  Configuration panel for step-by-step practice mode.
-->
<script lang="ts">
  import type { StepConfig } from "../../state/train-practice-state.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    config: StepConfig;
    onUpdate: (config: Partial<StepConfig>) => void;
  }

  let { config, onUpdate }: Props = $props();
</script>

<div class="config-panel">
  <h3>{t('train_step_config_title')}</h3>
  <p class="description">
    {t('train_step_config_desc')}
  </p>

  <div class="setting-group">
    <label class="checkbox-label">
      <input
        type="checkbox"
        checked={config.voiceCues}
        onchange={(e) => onUpdate({ voiceCues: e.currentTarget.checked })}
      />
      <span>{t('train_step_voice_cues')}</span>
    </label>
    <p class="hint">{t('train_step_voice_cues_hint')}</p>
  </div>

  <div class="setting-group">
    <label for="voiceKeyword">{t('train_step_voice_keyword')}</label>
    <input
      id="voiceKeyword"
      type="text"
      value={config.voiceKeyword}
      oninput={(e) => onUpdate({ voiceKeyword: e.currentTarget.value })}
      placeholder="next"
    />
    <p class="hint">{t('train_step_voice_keyword_hint')}</p>
  </div>

  <div class="setting-group">
    <label for="confirmation">{t('train_step_advance_method')}</label>
    <select
      id="confirmation"
      value={config.requiredConfirmation}
      onchange={(e) =>
        onUpdate({
          requiredConfirmation: e.currentTarget.value as
            | "tap"
            | "voice"
            | "both",
        })}
    >
      <option value="tap">{t('train_step_advance_tap')}</option>
      <option value="voice">{t('train_step_advance_voice')}</option>
      <option value="both">{t('train_step_advance_both')}</option>
    </select>
    <p class="hint">{t('train_step_advance_hint')}</p>
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
  }

  .hint {
    font-size: 0.75rem;
    opacity: 0.6;
    margin: 0;
  }

  input[type="text"],
  select {
    min-height: var(--min-touch-target);
    padding: 0.75rem;
    background: var(--theme-stroke);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 0.5rem;
    color: var(--theme-text);
    font-size: 0.875rem;
  }

  input[type="text"]:focus,
  select:focus {
    outline: none;
    border-color: var(--semantic-info, var(--semantic-info));
    background: var(--theme-card-hover-bg);
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
