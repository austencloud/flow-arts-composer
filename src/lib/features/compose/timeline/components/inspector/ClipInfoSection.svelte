<script lang="ts">
  /**
   * ClipInfoSection - Displays clip metadata and label input
   */

  import type { TimelineClip } from "#lib/shared/animation-engine/domain/timeline-types.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    clip: TimelineClip;
    effectiveDuration: number;
    onUpdateLabel: (label: string) => void;
  }

  let { clip, effectiveDuration, onUpdateLabel }: Props = $props();

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(2);
    return `${mins}:${secs.padStart(5, "0")}`;
  }
</script>

<section class="section">
  <div class="section-header">
    <i class="fa-solid fa-info-circle" aria-hidden="true"></i>
    <span>{t("clip_info")}</span>
  </div>

  <div class="info-row">
    <span class="info-label">{t("clip_sequence")}</span>
    <span class="info-value">{clip.sequence.name || t("clip_unnamed")}</span>
  </div>

  <div class="info-row">
    <span class="info-label">{t("clip_beats")}</span>
    <span class="info-value">{clip.sequence.steps.length}</span>
  </div>

  <div class="info-row">
    <span class="info-label">{t("clip_duration")}</span>
    <span class="info-value">{formatTime(clip.duration)}</span>
  </div>

  <div class="info-row">
    <span class="info-label">{t("clip_effective")}</span>
    <span class="info-value">{formatTime(effectiveDuration)}</span>
  </div>

  <div class="field">
    <label class="field-label" for="clip-label">{t("clip_label")}</label>
    <input
      id="clip-label"
      type="text"
      class="text-input"
      placeholder={t("clip_label_placeholder")}
      value={clip.label ?? ""}
      onchange={(e) => onUpdateLabel((e.target as HTMLInputElement).value)}
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

  .field-label {
    display: block;
    margin-bottom: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-muted, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .text-input {
    width: 100%;
    padding: 8px 10px;
    background: var(--theme-input-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text, var(--theme-text));
  }

  .text-input:focus {
    outline: none;
    border-color: var(--theme-accent);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: var(--font-size-compact);
  }

  .info-label {
    color: var(--theme-text-muted, var(--theme-text-dim));
  }

  .info-value {
    color: var(--theme-text);
    font-weight: 500;
  }
</style>
