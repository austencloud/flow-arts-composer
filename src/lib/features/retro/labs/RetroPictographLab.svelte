<!--
  RetroPictographLab.svelte - Lab tab for iterating on Win95 pixel pictograph rendering.

  Same prev/next navigation as the ASCII lab, but renders to canvas via PixelRenderer.
  Shows the pictograph at multiple display sizes from the same 64×64 source.

  Domain: Retro Win95 Shell
-->
<script lang="ts">
  import { PixelRenderer } from "#lib/features/retro/win95/services/pixel-renderer.js";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { createAsciiLabState } from "./ascii-pictograph-lab-state.svelte";
  import { pictographPreparer } from "#lib/shared/pictograph/shared/services/pictograph-preparer.js";

  const labState = createAsciiLabState();
  const renderer = new PixelRenderer(pictographPreparer);

  const INTERNAL_SIZE = 128;
  const PREVIEW_SIZES = [32, 48, 64, 96, 128, 192];

  let canvasRefs = $state<Record<number, HTMLCanvasElement | undefined>>({});

  $effect(() => {
    labState.loadData();
  });

  $effect(() => {
    const data = labState.pictographData;
    for (const size of PREVIEW_SIZES) {
      const canvas = canvasRefs[size];
      if (!canvas) continue;

      if (data && data.letter) {
        renderer.render(canvas, data, INTERNAL_SIZE);
      } else {
        renderer.renderPlaceholder(canvas, INTERNAL_SIZE);
      }
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") { labState.prev(); e.preventDefault(); }
    if (e.key === "ArrowRight") { labState.next(); e.preventDefault(); }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="retro-picto-lab">
  <div class="lab-controls">
    <div class="nav-bar">
      <button
        class="nav-btn"
        onclick={() => labState.prev()}
        disabled={labState.loading}
        aria-label="Previous pictograph"
      >
        <i class="fas fa-chevron-left" aria-hidden="true"></i>
      </button>

      <span class="nav-label">{labState.label}</span>

      <button
        class="nav-btn"
        onclick={() => labState.next()}
        disabled={labState.loading}
        aria-label="Next pictograph"
      >
        <i class="fas fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>

    <div class="layer-chips">
      <FilterChipBase
        label="Grid"
        icon="fas fa-border-all"
        active={labState.layers.grid}
        mode="toggle"
        chipColor="#6666ff"
        onclick={() => labState.toggleLayer("grid")}
      />
      <FilterChipBase
        label="Hands"
        icon="fas fa-hand-paper"
        active={labState.layers.hands}
        mode="toggle"
        chipColor="#6666ff"
        onclick={() => labState.toggleLayer("hands")}
      />
    </div>
  </div>

  {#if labState.loading}
    <div class="lab-status">Loading pictograph data...</div>
  {:else if labState.error}
    <div class="lab-status lab-error">{labState.error}</div>
  {:else}
    <div class="lab-preview">
      <div class="size-grid">
        {#each PREVIEW_SIZES as size (size)}
          <div class="size-card">
            <div class="canvas-frame" style="width: {size}px; height: {size}px;">
              <canvas
                bind:this={canvasRefs[size]}
                width={INTERNAL_SIZE}
                height={INTERNAL_SIZE}
                class="pixel-canvas"
                style="width: {size}px; height: {size}px;"
                aria-label="Pictograph at {size}px"
              ></canvas>
            </div>
            <span class="size-label">{size}px</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .retro-picto-lab {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 1rem;
    gap: 1rem;
    color: var(--theme-text, #fff);
    overflow-y: auto;
  }

  .lab-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }


  .nav-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    justify-content: center;
  }

  .nav-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  @media (hover: hover) {
    .nav-btn:not(:disabled):hover {
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
      color: var(--theme-text, #fff);
    }
  }

  .nav-btn:not(:disabled):active {
    transform: scale(0.93);
  }

  .nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6666ff);
    outline-offset: 2px;
  }

  .nav-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, #fff);
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
    min-width: 200px;
    text-align: center;
    letter-spacing: 0.5px;
  }


  .layer-chips {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }


  .lab-status {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .lab-error {
    color: var(--semantic-error, #ef4444);
  }


  .lab-preview {
    flex: 1;
    min-height: 0;
  }

  .size-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    align-items: flex-end;
  }

  .size-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .canvas-frame {
    background: #c0c0c0;
    border: 2px inset #c0c0c0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pixel-canvas {
    image-rendering: pixelated;
    image-rendering: crisp-edges;
    display: block;
  }

  .size-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-family: "SF Mono", "Fira Code", "Courier New", monospace;
  }

  @media (prefers-reduced-motion: reduce) {
    .nav-btn {
      transition: none;
    }
  }
</style>
