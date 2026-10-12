<script lang="ts">
  import { getPoiContext } from "../context/poi-context";

  const poi = getPoiContext();

  let dragOver = $state(false);

  function handlePresetSelect(presetId: string): void {
    poi.setActivePresetId(presetId);
    poi.generateFromPreset();
  }

  async function handleFileDrop(e: DragEvent): Promise<void> {
    e.preventDefault();
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file && file.type.startsWith("image/")) {
      await poi.loadFromFile(file);
    }
  }

  async function handleFileInput(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      await poi.loadFromFile(file);
      input.value = ""; // Reset for re-upload of same file
    }
  }
</script>

<div class="pattern-picker">
  <h3 class="section-title">Pattern</h3>

  <!-- Preset Grid -->
  <div class="preset-grid">
    {#each poi.presets as preset}
      <button
        class="preset-card"
        class:active={!poi.hasUploadedImage && poi.activePresetId === preset.id}
        onclick={() => handlePresetSelect(preset.id)}
      >
        <div
          class="preset-preview"
          style:background={preset.previewColor === "rainbow"
            ? "linear-gradient(90deg, red, orange, yellow, green, blue, violet)"
            : preset.previewColor}
        ></div>
        <span class="preset-name">{preset.name}</span>
      </button>
    {/each}
  </div>

  <!-- Image Upload - active state when an image is currently loaded,
       so it's visually obvious that the image (not a preset) is what
       will be painted onto the timeline. -->
  <div
    class="upload-zone"
    class:drag-over={dragOver}
    class:active={poi.hasUploadedImage}
    role="button"
    tabindex="0"
    ondragover={(e) => {
      e.preventDefault();
      dragOver = true;
    }}
    ondragleave={() => {
      dragOver = false;
    }}
    ondrop={handleFileDrop}
  >
    <label class="upload-label">
      <i class="fas fa-image" aria-hidden="true"></i>
      <span>
        {#if poi.hasUploadedImage && poi.activePattern}
          {poi.activePattern.metadata.name || "Image loaded"}
        {:else}
          Drop image or click to upload
        {/if}
      </span>
      <input
        type="file"
        accept="image/png,image/bmp,image/jpeg"
        class="sr-only"
        onchange={handleFileInput}
      />
    </label>
  </div>
</div>

<style>
  .pattern-picker {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .section-title {
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-primary, #e2e8f0);
    margin: 0;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 0.5rem;
  }

  .preset-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
    cursor: pointer;
    transition: border-color var(--duration-fast);
    min-height: 44px;
  }

  .preset-card:hover {
    border-color: var(--theme-accent, #3b82f6);
  }

  .preset-card.active {
    border-color: var(--theme-accent, #3b82f6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 15%,
      transparent
    );
  }

  .preset-preview {
    width: 32px;
    height: 32px;
    border-radius: 50%;
  }

  .preset-name {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, #94a3b8);
  }

  .upload-zone {
    border: 2px dashed var(--theme-stroke, rgba(255 255 255 / 0.15));
    border-radius: 8px;
    padding: 1rem;
    text-align: center;
    transition:
      border-color var(--duration-fast),
      background var(--duration-fast);
    cursor: pointer;
  }

  .upload-zone:hover,
  .upload-zone.drag-over {
    border-color: var(--theme-accent, #3b82f6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 8%,
      transparent
    );
  }

  .upload-zone.active {
    border-color: var(--theme-accent, #3b82f6);
    border-style: solid;
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 15%,
      transparent
    );
  }

  .upload-zone.active .upload-label {
    color: var(--theme-text-primary, #e2e8f0);
    font-weight: 600;
  }

  .upload-label {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    color: var(--theme-text-secondary, #94a3b8);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    border: 0;
  }
</style>
