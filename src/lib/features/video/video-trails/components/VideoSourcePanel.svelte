<script lang="ts">
  import { getVideoTrailsContext } from "../context/video-trails-context";

  const { state: trailsState } = getVideoTrailsContext();

  let isDragOver = $state(false);
  let fileInput: HTMLInputElement;

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith("video/")) {
      trailsState.loadVideo(file);
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) trailsState.loadVideo(file);
  }
</script>

<div
  class="source-panel"
  class:drag-over={isDragOver}
  role="button"
  tabindex="0"
  ondragover={(e) => {
    e.preventDefault();
    isDragOver = true;
  }}
  ondragleave={() => {
    isDragOver = false;
  }}
  ondrop={handleDrop}
  onclick={() => fileInput?.click()}
  onkeydown={(e) => {
    if (e.key === "Enter" || e.key === " ") fileInput?.click();
  }}
>
  {#if trailsState.source}
    <div class="source-info">
      <i class="fas fa-film" aria-hidden="true"></i>
      <span class="file-name"
        >{trailsState.source.originalFileName ?? "Video loaded"}</span
      >
      {#if trailsState.source.duration > 0}
        <span class="duration">{trailsState.source.duration.toFixed(1)}s</span>
      {/if}
    </div>
  {:else}
    <div class="drop-prompt">
      <i class="fas fa-cloud-arrow-up" aria-hidden="true"></i>
      <span>Drop a video file or click to browse</span>
      <span class="hint">MP4, WebM, MOV</span>
    </div>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept="video/*"
    class="hidden-input"
    onchange={handleFileSelect}
  />
</div>

<style>
  .source-panel {
    border: 2px dashed var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    cursor: pointer;
    transition:
      border-color var(--duration-fast),
      background var(--duration-fast);
  }

  .source-panel:hover,
  .source-panel.drag-over {
    border-color: var(--theme-accent, #f43f5e);
    background: rgba(244, 63, 94, 0.05);
  }

  .drop-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .drop-prompt i {
    font-size: 32px;
    color: var(--theme-accent, #f43f5e);
    opacity: 0.6;
  }

  .hint {
    font-size: var(--font-size-compact, 12px);
    opacity: 0.5;
  }

  .source-info {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: center;
    color: var(--theme-text, #ffffff);
  }

  .file-name {
    font-weight: 500;
  }

  .duration {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
  }

  .hidden-input {
    display: none;
  }
</style>
