<!--
  GridRenderer.svelte

  2x2 grid renderer with cells for sequences.
  Each cell can contain a sequence with a specific rotation offset.
-->
<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import CanvasControls from "../components/CanvasControls.svelte";

  type GridIndex = 0 | 1 | 2 | 3;

  let {
    gridSequences = [],
    gridRotationOffsets = [0, 90, 180, 270],
    isPlaying = false,
    speed = 1.0,
    shouldLoop = false,
    playbackMode = "continuous",
    stepPlaybackPauseMs = 300,
    stepPlaybackStepSize = 1,
    onSelectCell,
    onRemoveCell,
    onOpenSettings,
  }: {
    gridSequences?: (SequenceData | null)[];
    gridRotationOffsets?: number[];
    isPlaying?: boolean;
    speed?: number;
    shouldLoop?: boolean;
    playbackMode?: import("$lib/shared/animation-engine/state/animation-panel-state.svelte").PlaybackMode;
    stepPlaybackPauseMs?: number;
    stepPlaybackStepSize?: import("$lib/shared/animation-engine/state/animation-panel-state.svelte").StepPlaybackStepSize;
    onSelectCell: (index: GridIndex) => void;
    onRemoveCell: (index: GridIndex) => void;
    onOpenSettings: (canvasId: string) => void;
  } = $props();

  const gridPlacements = [
    {
      index: 0 as const,
      label: "Top-Left",
      shortLabel: "TL",
      rotation: 0,
      color: "var(--accent-pink, #ec4899)",
    },
    {
      index: 1 as const,
      label: "Top-Right",
      shortLabel: "TR",
      rotation: 90,
      color: "var(--theme-accent-strong)",
    },
    {
      index: 2 as const,
      label: "Bottom-Left",
      shortLabel: "BL",
      rotation: 180,
      color: "var(--feature-view, #06b6d4)",
    },
    {
      index: 3 as const,
      label: "Bottom-Right",
      shortLabel: "BR",
      rotation: 270,
      color: "var(--semantic-success)",
    },
  ];
</script>

<div class="grid-renderer">
  <CanvasControls canvasId="grid" {onOpenSettings} />

  <div class="grid-canvas">
    {#each gridPlacements as pos}
      {@const sequence = gridSequences[pos.index]}
      {@const rotation = gridRotationOffsets[pos.index]}

      <div
        class="grid-cell"
        class:filled={sequence}
        style="--cell-color: {pos.color}"
      >
        {#if sequence}
          <!-- Filled Cell -->
          <div class="cell-header">
            <div class="rotation-badge">
              <i class="fas fa-rotate" aria-hidden="true"></i>
              {rotation}°
            </div>
            <button
              class="remove-btn"
              onclick={(e) => {
                e.stopPropagation();
                onRemoveCell(pos.index);
              }}
              aria-label="Remove sequence"
            >
              <i class="fas fa-times" aria-hidden="true"></i>
            </button>
          </div>

          <div class="cell-content">
            <div
              class="sequence-visual"
              style="transform: rotate({rotation}deg);"
            >
              <i class="fas fa-person-walking" aria-hidden="true"></i>
            </div>
            <div class="sequence-name">{sequence.word || "Untitled"}</div>
            <div class="sequence-steps">
              {sequence.steps?.length ?? 0} steps
            </div>
          </div>

          <button
            class="change-cell-btn"
            onclick={() => onSelectCell(pos.index)}
          >
            <i class="fas fa-exchange-alt" aria-hidden="true"></i>
            Change
          </button>
        {:else}
          <!-- Empty Cell -->
          <button
            class="empty-cell-btn"
            onclick={() => onSelectCell(pos.index)}
          >
            <div class="empty-icon">
              <i class="fas fa-plus" aria-hidden="true"></i>
            </div>
            <div class="empty-label">{pos.label}</div>
            <div class="empty-rotation">{pos.rotation}° rotation</div>
          </button>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .grid-renderer {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background-primary, #1a1a1a);
    overflow: hidden;
  }

  .grid-canvas {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    gap: 12px;
    padding: 1rem;
    background: linear-gradient(
      135deg,
      rgba(15, 20, 30, 0.5) 0%,
      rgba(10, 15, 25, 0.5) 100%
    );
    overflow: hidden;
    width: 100%;
    height: 100%;
  }

  .grid-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    background: var(--theme-panel-bg);
    border: 2px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 16px;
    overflow: hidden;
    transition: all var(--duration-normal) ease;
  }

  .grid-cell:hover {
    border-color: var(--cell-color, rgba(255, 255, 255, 0.2));
    box-shadow: 0 0 20px rgba(255, 255, 255, 0.05);
  }

  .grid-cell.filled {
    border-color: var(--cell-color, rgba(255, 255, 255, 0.2));
  }

  /* Filled Cell */
  .cell-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: var(--theme-panel-bg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .rotation-badge {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.6rem;
    background: color-mix(in srgb, var(--cell-color) 25%, transparent);
    border: 1px solid
      var(
        --cell-color,
        color-mix(in srgb, var(--theme-accent-strong) 40%, transparent)
      );
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--cell-color);
  }

  .remove-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: 6px;
    color: var(--semantic-error);
    cursor: pointer;
    opacity: 0;
    transition: all var(--duration-normal) ease;
    position: relative;
  }

  .remove-btn::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
  }

  .grid-cell:hover .remove-btn {
    opacity: 1;
  }

  .remove-btn:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 60%, transparent);
  }

  .cell-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1rem;
  }

  .sequence-visual {
    font-size: 3.5rem;
    opacity: 0.25;
    color: var(--cell-color);
    transition: transform var(--duration-emphasis) ease;
  }

  .sequence-name {
    font-size: 1rem;
    font-weight: 600;
    text-align: center;
  }

  .sequence-steps {
    font-size: 0.8rem;
    opacity: 0.5;
  }

  .change-cell-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.6rem;
    background: var(--theme-card-bg);
    border: none;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    color: var(--theme-text-dim);
    font-size: 0.85rem;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .change-cell-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: white;
  }

  /* Empty Cell */
  .empty-cell-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    background: transparent;
    border: none;
    color: rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .empty-cell-btn:hover {
    color: var(--cell-color, rgba(255, 255, 255, 0.8));
  }

  .empty-icon {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    border: 2px dashed var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 50%;
    font-size: 1.5rem;
    transition: all var(--duration-normal) ease;
  }

  .empty-cell-btn:hover .empty-icon {
    background: color-mix(in srgb, var(--cell-color) 15%, transparent);
    border-color: var(--cell-color);
    border-style: solid;
    color: var(--cell-color);
  }

  .empty-label {
    font-size: 0.95rem;
    font-weight: 500;
  }

  .empty-rotation {
    font-size: 0.8rem;
    opacity: 0.5;
  }

  @media (max-width: 768px) {
    .sequence-visual {
      font-size: 2.5rem;
    }
  }

  @media (max-width: 480px) {
    .grid-canvas {
      gap: 8px;
      padding: 0.75rem;
    }
  }
</style>
