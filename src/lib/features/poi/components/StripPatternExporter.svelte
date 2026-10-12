<script lang="ts">
  import { getPoiContext } from "../context/poi-context";

  const poi = getPoiContext();

  function downloadPng(): void {
    const imageData = poi.toImageData();
    if (!imageData) return;

    const canvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = canvas.getContext("2d")!;
    ctx.putImageData(imageData, 0, 0);

    canvas.convertToBlob({ type: "image/png" }).then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${poi.activePattern?.metadata.name ?? "pattern"}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }
</script>

{#if poi.activePattern}
  <button class="export-btn" onclick={downloadPng}>
    <i class="fas fa-download" aria-hidden="true"></i>
    Export PNG
  </button>
{/if}

<style>
  .export-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.15));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255 255 255 / 0.05));
    color: var(--theme-text-primary, #e2e8f0);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    min-height: 44px;
    transition: border-color var(--duration-fast);
  }

  .export-btn:hover {
    border-color: var(--theme-accent, #3b82f6);
  }
</style>
