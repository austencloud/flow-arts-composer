<script lang="ts">
  import { getVideoTrailsContext } from "../context/video-trails-context";
  import type { ExportConfig } from "../domain/types";
  import { shareOrDownloadBlob } from "#lib/shared/foundation/services/file-downloader.js";
  import { shareTarget, saveActionLabel } from "#lib/shared/mobile/share-action.svelte.js";

  const { state: trailsState } = getVideoTrailsContext();

  let format = $state<"mp4" | "webm">("webm");
  let resolution = $state<"720p" | "1080p" | "original">("1080p");
  let formatDropdownOpen = $state(false);
  let resolutionDropdownOpen = $state(false);

  interface Props {
    onExport: (config: ExportConfig) => void;
  }

  let { onExport }: Props = $props();

  const formatOptions: { value: "mp4" | "webm"; label: string }[] = [
    { value: "webm", label: "WebM" },
    { value: "mp4", label: "MP4" },
  ];

  const resolutionOptions: { value: "720p" | "1080p" | "original"; label: string }[] = [
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
    { value: "original", label: "Original" },
  ];

  const formatLabel = $derived(formatOptions.find((o) => o.value === format)?.label ?? format);
  const resolutionLabel = $derived(resolutionOptions.find((o) => o.value === resolution)?.label ?? resolution);

  function getResolution(): { width: number; height: number } {
    if (resolution === "720p") return { width: 1280, height: 720 };
    if (resolution === "1080p") return { width: 1920, height: 1080 };
    return trailsState.source?.resolution ?? { width: 1920, height: 1080 };
  }

  function handleExport() {
    onExport({
      format,
      resolution: getResolution(),
      fps: trailsState.source?.fps ?? 30,
      bitrate: resolution === "1080p" ? 8_000_000 : 4_000_000,
    });
  }

  async function handleDownload() {
    if (trailsState.exportState.phase !== "complete" || !trailsState.exportState.blob) return;
    // Device-gated: native share sheet on mobile, download on desktop.
    await shareOrDownloadBlob(
      trailsState.exportState.blob,
      `video-trails-export.${format}`,
      { title: "Video Trails" },
    );
  }

  function selectFormat(value: "mp4" | "webm") {
    format = value;
    formatDropdownOpen = false;
  }

  function selectResolution(value: "720p" | "1080p" | "original") {
    resolution = value;
    resolutionDropdownOpen = false;
  }
</script>

<div class="export-panel">
  <h3 class="panel-title">Export</h3>

  <div class="export-options">
    <div class="select-row">
      <span class="select-label">Format</span>
      <div class="custom-select">
        <button class="select-trigger" onclick={() => { formatDropdownOpen = !formatDropdownOpen; resolutionDropdownOpen = false; }}>
          <span>{formatLabel}</span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        {#if formatDropdownOpen}
          <div class="select-dropdown">
            {#each formatOptions as option}
              <button
                class="select-option"
                class:selected={option.value === format}
                onclick={() => selectFormat(option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="select-row">
      <span class="select-label">Resolution</span>
      <div class="custom-select">
        <button class="select-trigger" onclick={() => { resolutionDropdownOpen = !resolutionDropdownOpen; formatDropdownOpen = false; }}>
          <span>{resolutionLabel}</span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        {#if resolutionDropdownOpen}
          <div class="select-dropdown">
            {#each resolutionOptions as option}
              <button
                class="select-option"
                class:selected={option.value === resolution}
                onclick={() => selectResolution(option.value)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>

  {#if trailsState.exportState.phase === "idle" || trailsState.exportState.phase === "complete" || trailsState.exportState.phase === "error"}
    <button class="export-btn" onclick={handleExport} disabled={!trailsState.source}>
      <i class="fas fa-download" aria-hidden="true"></i>
      Download Animation
    </button>
  {:else}
    <div class="progress-section">
      <div class="progress-bar">
        <div class="progress-fill" style="width: {(trailsState.exportState.progress ?? 0) * 100}%"></div>
      </div>
      <span class="progress-label">{trailsState.exportState.phase}... {Math.round((trailsState.exportState.progress ?? 0) * 100)}%</span>
    </div>
  {/if}

  {#if trailsState.exportState.phase === "complete"}
    <button class="download-btn" onclick={handleDownload}>
      <i class="fas {shareTarget.isMobile ? 'fa-share-nodes' : 'fa-file-video'}" aria-hidden="true"></i>
      {saveActionLabel()}
    </button>
  {/if}

  {#if trailsState.exportState.phase === "error"}
    <p class="error-text">{trailsState.exportState.error}</p>
  {/if}
</div>

<style>
  .export-panel {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .panel-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    margin: 0;
  }

  .export-options {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }


  .select-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .select-label { min-width: 70px; }

  .custom-select {
    position: relative;
    flex: 1;
  }

  .select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
  }

  .select-trigger:hover {
    border-color: var(--theme-accent, #f43f5e);
  }

  .select-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 6px;
    overflow: hidden;
    z-index: 10;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .select-option {
    display: block;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    text-align: left;
    cursor: pointer;
  }

  .select-option:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
  }

  .select-option.selected {
    color: var(--theme-accent, #f43f5e);
  }


  .export-btn,
  .download-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px;
    border: none;
    border-radius: 6px;
    background: var(--theme-accent, #f43f5e);
    color: white;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
  }

  .export-btn:disabled { opacity: 0.4; cursor: not-allowed; }

  .download-btn { background: var(--semantic-success, #22c55e); }

  .progress-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .progress-bar {
    height: 4px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 2px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent, #f43f5e);
    transition: width 0.2s;
  }

  .progress-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: capitalize;
  }

  .error-text {
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-error, #ef4444);
    margin: 0;
  }
</style>
