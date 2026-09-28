<!-- DurationResizeHandle - Draggable right-edge handle for duration resize -->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { formatNumber } from "$lib/shared/i18n/i18n-formatters";
  import { onDestroy } from "svelte";
  import {
    MIN_DURATION,
    MAX_DURATION,
    DURATION_STEP_FINE,
    DURATION_STEP_COARSE,
  } from "../../../services/step-operations/duration-handler";

  interface Props {
    currentDuration: number;
    onDragStart: () => void;
    onDrag: (pixelDelta: number) => void;
    onDragEnd: () => void;
    onStepAdjust: (newDuration: number) => void;
  }

  let { currentDuration, onDragStart, onDrag, onDragEnd, onStepAdjust }: Props =
    $props();

  let isDragging = $state(false);
  let startX = $state(0);

  function handlePointerDown(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();

    isDragging = true;
    startX = e.clientX;

    onDragStart();

    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging) return;

    const delta = e.clientX - startX;
    onDrag(delta);
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isDragging) return;

    isDragging = false;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    onDragEnd();
  }

  function handleKeyDown(e: KeyboardEvent) {
    let newDuration: number | null = null;

    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? DURATION_STEP_COARSE : DURATION_STEP_FINE;
      newDuration = Math.min(MAX_DURATION, currentDuration + step);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? DURATION_STEP_COARSE : DURATION_STEP_FINE;
      newDuration = Math.max(MIN_DURATION, currentDuration - step);
    } else if (e.key === "Home") {
      e.preventDefault();
      newDuration = MIN_DURATION;
    } else if (e.key === "End") {
      e.preventDefault();
      newDuration = MAX_DURATION;
    }

    if (newDuration !== null && newDuration !== currentDuration) {
      onStepAdjust(newDuration);
    }
  }

  onDestroy(() => {
    isDragging = false;
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="duration-resize-handle"
  class:dragging={isDragging}
  onpointerdown={handlePointerDown}
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
  onkeydown={handleKeyDown}
  role="separator"
  aria-orientation="vertical"
  aria-roledescription={t("create_resize_handle_role")}
  aria-label={t(
    currentDuration === 1
      ? "create_resize_duration_one"
      : "create_resize_duration",
    { count: formatNumber(currentDuration) }
  )}
  aria-valuenow={currentDuration}
  aria-valuemin={MIN_DURATION}
  aria-valuemax={MAX_DURATION}
  tabindex={0}
>
  <div class="handle-grip">
    <span class="grip-dot"></span>
    <span class="grip-dot"></span>
    <span class="grip-dot"></span>
  </div>
  <div class="duration-chip" aria-hidden="true">
    {currentDuration}&times;
  </div>
</div>

<style>
  .duration-resize-handle {
    position: absolute;
    right: -3px;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: col-resize;
    touch-action: none;
    user-select: none;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Expand hit area to 48px for WCAG AAA touch target */
  .duration-resize-handle::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: -21px;
    right: -21px;
  }

  /* Visible grip: a pill with dots reads as draggable, where the old 2px
     hairline read as a border. Rendered only on the selected step, so the
     stronger presence never clutters the resting grid. */
  .handle-grip {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    width: 8px;
    height: 44%;
    min-height: 24px;
    max-height: 44px;
    border-radius: 4px;
    background: color-mix(
      in srgb,
      var(--theme-accent, rgba(139, 92, 246, 0.8)) 55%,
      transparent
    );
    transition:
      background 0.15s ease,
      transform 0.15s ease;
  }

  .grip-dot {
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.85);
  }

  .duration-resize-handle:hover .handle-grip,
  .duration-resize-handle:focus-visible .handle-grip {
    background: var(--theme-accent, rgba(139, 92, 246, 0.8));
  }

  .duration-resize-handle.dragging .handle-grip {
    background: var(--theme-accent, rgba(139, 92, 246, 0.9));
    transform: scaleY(1.15);
  }

  /* Live duration value while interacting. Absolutely positioned above the
     grip so it never reflows the timeline (no-layout-shift). */
  .duration-chip {
    position: absolute;
    bottom: calc(50% + 30px);
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .duration-resize-handle:hover .duration-chip,
  .duration-resize-handle:focus-visible .duration-chip,
  .duration-resize-handle.dragging .duration-chip {
    opacity: 1;
  }

  .duration-resize-handle:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: 2px;
    border-radius: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .handle-grip,
    .duration-chip {
      transition: none;
    }
  }
</style>
