<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    left: Snippet;
    right: Snippet;
  }

  let { left, right }: Props = $props();

  const STORAGE_KEY = "museum-split-ratio";
  const MIN_RATIO = 0.25;
  const MAX_RATIO = 0.75;

  let ratio = $state(loadRatio());
  let isDragging = $state(false);
  let isSwapped = $state(false);
  let containerEl: HTMLElement | undefined = $state();

  function loadRatio(): number {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = parseFloat(stored);
        if (!isNaN(parsed) && parsed >= MIN_RATIO && parsed <= MAX_RATIO)
          return parsed;
      }
    } catch {
      // localStorage unavailable
    }
    return 0.5;
  }

  function saveRatio(value: number) {
    try {
      localStorage.setItem(STORAGE_KEY, value.toFixed(3));
    } catch {
      // localStorage unavailable
    }
  }

  function handlePointerDown(e: PointerEvent) {
    isDragging = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging || !containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    // When panels are swapped, the divider's DOM position still represents the
    // left pane width, but the content inside is reversed. We invert the raw
    // fraction so `ratio` always means "left-content panel fraction" - dragging
    // right always makes the left-content panel larger, never triggers a swap.
    const rawFraction = x / rect.width;
    const newRatio = Math.max(
      MIN_RATIO,
      Math.min(MAX_RATIO, isSwapped ? 1 - rawFraction : rawFraction)
    );
    ratio = newRatio;
  }

  function handlePointerUp() {
    if (isDragging) {
      isDragging = false;
      saveRatio(ratio);
    }
  }

  function handleSwap() {
    isSwapped = !isSwapped;
  }

  let leftPercent = $derived(`${(isSwapped ? 1 - ratio : ratio) * 100}%`);
  let rightPercent = $derived(`${(isSwapped ? ratio : 1 - ratio) * 100}%`);
</script>

<div
  class="split-screen"
  bind:this={containerEl}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  class:dragging={isDragging}
  role="presentation"
>
  <div class="split-pane left" style="width: {leftPercent}">
    {#if isSwapped}
      {@render right()}
    {:else}
      {@render left()}
    {/if}
  </div>

  <div
    class="divider"
    role="separator"
    aria-orientation="vertical"
    onpointerdown={handlePointerDown}
  >
    <div class="divider-handle">
      <div class="divider-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
    <button
      class="swap-button"
      onclick={handleSwap}
      title="Swap panels"
      aria-label="Swap left and right panels"
    >
      <i class="fas fa-arrows-left-right" aria-hidden="true"></i>
    </button>
  </div>

  <div class="split-pane right" style="width: {rightPercent}">
    {#if isSwapped}
      {@render left()}
    {:else}
      {@render right()}
    {/if}
  </div>
</div>

<style>
  .split-screen {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .split-screen.dragging {
    cursor: col-resize;
    user-select: none;
  }

  .split-pane {
    overflow: hidden;
    min-width: 0;
    height: 100%;
  }

  .divider {
    flex-shrink: 0;
    width: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    cursor: col-resize;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    transition: background var(--duration-fast);
    position: relative;
  }

  .divider:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .divider-handle {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .divider-dots {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .divider-dots span {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--theme-text-muted, rgba(255, 255, 255, 0.3));
  }

  .swap-button {
    position: absolute;
    bottom: 12px;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    transition:
      background var(--duration-fast),
      color var(--duration-fast),
      border-color var(--duration-fast);
    padding: 0;
  }

  .swap-button:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #fff);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  @media (max-width: 767px) {
    .split-screen {
      flex-direction: column;
    }

    .split-pane {
      width: 100% !important;
      height: 50%;
    }

    .divider {
      width: 100%;
      height: 12px;
      flex-direction: row;
      cursor: row-resize;
      border-left: none;
      border-right: none;
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
      border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    }

    .divider-dots {
      flex-direction: row;
    }

    .swap-button {
      position: static;
    }
  }
</style>
