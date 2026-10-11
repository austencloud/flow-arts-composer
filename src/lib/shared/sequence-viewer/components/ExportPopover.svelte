<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    getExportOptionsState,
    type VideoFps,
    type VideoResolution,
    type VideoQuality,
  } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import { slide } from "svelte/transition";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "../domain/viewer-control-analytics";

  interface Props {
    onSettingChange?: ViewerControlSink;
  }
  let { onSettingChange }: Props = $props();

  const opts = getExportOptionsState();

  let advancedOpen = $state(false);

  // Spec §6.2 #3 - 3D export option domains.
  const RESOLUTIONS: VideoResolution[] = [720, 1080, 2160, 4320];
  function resLabel(r: VideoResolution): string {
    return r === 2160 ? "4K" : r === 4320 ? "8K" : String(r);
  }
  const QUALITIES: VideoQuality[] = ["standard", "cinema"];
  function qualityLabel(q: VideoQuality): string {
    return q === "cinema" ? "Cinema" : "Standard";
  }
  const FPS_OPTIONS: VideoFps[] = [30, 60, 120];

  function setResolution(value: VideoResolution): void {
    const previous = opts.videoResolution;
    opts.setVideoResolution(value);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_export",
      "resolution",
      previous,
      value
    );
  }

  function setQuality(value: VideoQuality): void {
    const previous = opts.videoQuality;
    opts.setVideoQuality(value);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_export",
      "quality",
      previous,
      value
    );
  }

  function setFps(value: VideoFps): void {
    const previous = opts.videoFps;
    opts.setVideoFps(value);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_export",
      "fps",
      previous,
      value
    );
  }

  function toggleAdvanced(): void {
    const previous = advancedOpen;
    advancedOpen = !advancedOpen;
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_export",
      "advanced_open",
      previous,
      advancedOpen
    );
  }

  function changeLoopCount(delta: number): void {
    const previous = opts.videoLoopCount;
    const value = previous + delta;
    opts.setVideoLoopCount(value);
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_export",
      "loop_count",
      previous,
      value
    );
  }
</script>

<div class="export-content">
  <div class="row">
    <div class="row-label">{t("viewer_detail_resolution")}</div>
    <div class="chips">
      {#each RESOLUTIONS as r (r)}
        <button
          class="chip"
          class:active={opts.videoResolution === r}
          onclick={() => setResolution(r)}
          aria-pressed={opts.videoResolution === r}
        >
          {resLabel(r)}
        </button>
      {/each}
    </div>
  </div>

  <div class="row">
    <div class="row-label">{t("viewer_ui_quality")}</div>
    <div class="chips">
      {#each QUALITIES as q (q)}
        <button
          class="chip"
          class:active={opts.videoQuality === q}
          onclick={() => setQuality(q)}
          aria-pressed={opts.videoQuality === q}
        >
          {qualityLabel(q)}
        </button>
      {/each}
    </div>
  </div>

  <div class="row">
    <div class="row-label">{t("viewer_detail_fps")}</div>
    <div class="chips">
      {#each FPS_OPTIONS as f (f)}
        <button
          class="chip"
          class:active={opts.videoFps === f}
          onclick={() => setFps(f)}
          aria-pressed={opts.videoFps === f}
        >
          {f}
        </button>
      {/each}
    </div>
  </div>

  <button
    class="advanced-toggle"
    onclick={toggleAdvanced}
    aria-expanded={advancedOpen}
  >
    <i class="fas fa-chevron-{advancedOpen ? 'down' : 'right'}"></i>
    {t("viewer_detail_advanced")}
  </button>

  {#if advancedOpen}
    <div class="advanced" transition:slide={{ duration: 180 }}>
      <div class="row">
        <div class="row-label">{t("viewer_detail_loop_count")}</div>
        <div class="stepper">
          <button
            class="step-btn"
            onclick={() => changeLoopCount(-1)}
            aria-label={t("viewer_ui_decrease_loop_count")}
            disabled={opts.videoLoopCount <= 1}
          >
            <i class="fas fa-minus"></i>
          </button>
          <span class="step-value">{opts.videoLoopCount}</span>
          <button
            class="step-btn"
            onclick={() => changeLoopCount(1)}
            aria-label={t("viewer_ui_increase_loop_count")}
            disabled={opts.videoLoopCount >= 10}
          >
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .export-content {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .row-label {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.52);
  }

  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    flex: 1 1 auto;
    min-width: 56px;
    padding: 8px 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 140ms cubic-bezier(0.2, 0, 0.13, 1.5);
  }
  .chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.95);
  }
  .chip.active {
    background: color-mix(in srgb, #4a9eff 22%, transparent);
    border-color: color-mix(in srgb, #4a9eff 55%, transparent);
    color: #cfe4ff;
  }

  .advanced-toggle {
    background: none;
    border: none;
    padding: 4px 0;
    margin-top: 2px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    align-self: flex-start;
  }
  .advanced-toggle:hover {
    color: rgba(255, 255, 255, 0.92);
  }
  .advanced-toggle i {
    font-size: 10px;
    width: 10px;
  }

  .advanced {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .stepper {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 4px;
    align-self: flex-start;
  }
  .step-btn {
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.82);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
  }
  .step-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.08);
  }
  .step-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  .step-value {
    min-width: 24px;
    text-align: center;
    color: rgba(255, 255, 255, 0.95);
    font-size: 13px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
