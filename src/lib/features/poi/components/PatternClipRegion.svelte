<!--
  PatternClipRegion.svelte - one colored block on the pattern timeline.

  Renders a tiny canvas preview of the clip's pattern (a horizontal
  color strip sampled from the middle frame) so you can visually
  distinguish clips at a glance. Click to select, backspace to delete.
-->
<script lang="ts">
  import type { PatternClip } from "../domain/pattern-timeline-types";

  interface Props {
    clip: PatternClip;
    totalSteps: number;
    isSelected: boolean;
    onSelect: (id: string | null) => void;
  }

  const { clip, totalSteps, isSelected, onSelect }: Props = $props();

  let previewCanvas = $state<HTMLCanvasElement | null>(null);

  const leftPercent = $derived(((clip.startStep - 1) / totalSteps) * 100);
  const widthPercent = $derived(
    ((clip.endStep - clip.startStep + 1) / totalSteps) * 100
  );

  // Render a scaled 2D preview of the whole pattern - time runs left
  // to right (frames), LED position runs top to bottom. Reveals each
  // pattern's character at a glance:
  //   - Rainbow sweep → diagonal color bands
  //   - Pulse → periodic bright/dim columns
  //   - Tiled image → repeated tile structure
  //   - Solid → uniform fill
  $effect(() => {
    const canvas = previewCanvas;
    if (!canvas) return;

    const { pattern } = clip;
    const width = 128;
    const height = 32;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d")!;
    const { ledCount, frameCount, frames } = pattern;

    for (let x = 0; x < width; x++) {
      const frameIdx = Math.min(
        frameCount - 1,
        Math.floor((x / width) * frameCount)
      );
      const frame = frames[frameIdx]!;
      for (let y = 0; y < height; y++) {
        const ledIdx = Math.min(
          ledCount - 1,
          Math.floor((y / height) * ledCount)
        );
        const offset = ledIdx * 3;
        const r = frame.colors[offset]!;
        const g = frame.colors[offset + 1]!;
        const b = frame.colors[offset + 2]!;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  });

  function handleClick(e: MouseEvent): void {
    e.stopPropagation();
    onSelect(isSelected ? null : clip.id);
  }
</script>

<button
  type="button"
  class="clip-region"
  class:selected={isSelected}
  style:left="{leftPercent}%"
  style:width="{widthPercent}%"
  onclick={handleClick}
  title={clip.label ?? clip.presetId ?? "clip"}
>
  <canvas bind:this={previewCanvas} class="clip-preview"></canvas>
  <span class="clip-label">{clip.label ?? clip.presetId ?? ""}</span>
</button>

<style>
  .clip-region {
    position: absolute;
    top: 4px;
    bottom: 4px;
    padding: 0;
    border: 1.5px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    background: #0a0a0d;
    cursor: pointer;
    overflow: hidden;
    z-index: 2;
    display: flex;
    flex-direction: column;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
    transition:
      border-color var(--duration-fast),
      box-shadow var(--duration-fast);
  }

  .clip-region:hover {
    border-color: rgba(255, 255, 255, 0.35);
  }

  .clip-region.selected {
    border-color: var(--theme-accent, #3b82f6);
    box-shadow:
      0 0 0 1px var(--theme-accent, #3b82f6),
      0 2px 12px
        color-mix(in srgb, var(--theme-accent, #3b82f6) 30%, transparent);
  }

  .clip-preview {
    flex: 1;
    width: 100%;
    min-height: 0;
    display: block;
    image-rendering: pixelated;
  }

  .clip-label {
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: #fff;
    text-shadow:
      0 0 4px rgba(0, 0, 0, 0.9),
      0 1px 2px rgba(0, 0, 0, 0.9);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: calc(100% - 12px);
    pointer-events: none;
  }
</style>
