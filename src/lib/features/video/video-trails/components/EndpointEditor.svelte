<script lang="ts">
  import { getVideoTrailsContext } from "../context/video-trails-context";
  import type { DetectedEndpoint } from "../domain/types";

  type ToolMode = "select" | "place" | "occlude" | "guided";

  interface GuidedStep {
    propIndex: 0 | 1;
    tipIndex: number;
    label: string;
    color: string;
  }

  interface Props {
    videoElement: HTMLVideoElement | null;
    width: number;
    height: number;
    toolMode: ToolMode;
    selectedIdx: number;
    onSelectEndpoint: (idx: number) => void;
    guidedStep?: GuidedStep | null;
    onGuidedPlacement?: (x: number, y: number) => void;
    redrawTick?: number;
  }

  const {
    videoElement,
    width,
    height,
    toolMode,
    selectedIdx,
    onSelectEndpoint,
    guidedStep = null,
    onGuidedPlacement,
    redrawTick = 0,
  }: Props = $props();
  const { state: trailsState } = getVideoTrailsContext();

  const PROP_COLORS = ["#4a90d9", "#d94a4a"] as const;
  const ENDPOINT_RADIUS = 10;
  const HIT_RADIUS = 16;

  let canvasEl: HTMLCanvasElement | undefined = $state();

  // Drag state
  let dragging = $state(false);
  let dragIdx = $state(-1);
  let dragPos = $state<{ x: number; y: number } | null>(null);

  // Placement popover state
  let placementPopover = $state<{
    x: number;
    y: number;
    canvasX: number;
    canvasY: number;
  } | null>(null);

  // Redraw whenever frame, endpoints, drag, or selection changes
  $effect(() => {
    const _frame = trailsState.currentFrame;
    const _endpoints = trailsState.currentEndpoints;
    const _drag = dragPos;
    const _sel = selectedIdx;
    const _w = width;
    const _h = height;
    const _video = videoElement;
    const _mode = toolMode;
    const _tick = redrawTick;

    draw();
  });

  function draw(): void {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    // Draw video frame as background
    if (videoElement && videoElement.readyState >= 2) {
      ctx.drawImage(videoElement, 0, 0, width, height);
    } else {
      ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
      ctx.fillRect(0, 0, width, height);
    }

    // Draw each endpoint
    const endpoints = trailsState.currentEndpoints;
    for (let i = 0; i < endpoints.length; i++) {
      const ep = endpoints[i]!;
      const x = dragging && dragIdx === i && dragPos ? dragPos.x : ep.x;
      const y = dragging && dragIdx === i && dragPos ? dragPos.y : ep.y;
      const isSelected = i === selectedIdx;

      drawEndpoint(ctx, x, y, ep, isSelected);
    }

    // Guided mode: show prompt for which endpoint to place
    if (toolMode === "guided" && guidedStep) {
      ctx.save();
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, height - 40, width, 40);
      ctx.fillStyle = guidedStep.color;
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(
        `Click to place: ${guidedStep.label}`,
        width / 2,
        height - 20
      );
      ctx.restore();
    }
  }

  function drawEndpoint(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    ep: DetectedEndpoint,
    isSelected: boolean
  ): void {
    const color = PROP_COLORS[ep.propIndex];
    const radius = ENDPOINT_RADIUS;

    // Check if this endpoint is occluded
    const frameCorrectionList =
      trailsState.corrections[trailsState.currentFrame] ?? [];
    const correction = frameCorrectionList.find(
      (c) => c.propIndex === ep.propIndex && c.tipIndex === ep.tipIndex
    );
    const isOccluded = correction?.status === "occluded";

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);

    if (isOccluded) {
      // Occluded: dashed outline
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = color + "80";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (ep.confidence > 0.8) {
      ctx.fillStyle = color;
      ctx.fill();
    } else if (ep.confidence > 0.4) {
      ctx.fillStyle = color + "80";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Selected ring
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Corrected indicator (small checkmark-colored ring)
    if (correction?.status === "corrected") {
      ctx.beginPath();
      ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Tip index label
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(ep.tipIndex), x, y);
  }

  function findEndpointAtPosition(px: number, py: number): number {
    const endpoints = trailsState.currentEndpoints;
    for (let i = endpoints.length - 1; i >= 0; i--) {
      const ep = endpoints[i]!;
      const dx = px - ep.x;
      const dy = py - ep.y;
      if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) return i;
    }
    return -1;
  }

  function canvasCoords(e: PointerEvent): { x: number; y: number } {
    if (!canvasEl) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  }

  function screenCoordsFromCanvas(
    canvasX: number,
    canvasY: number
  ): { x: number; y: number } {
    if (!canvasEl) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: rect.left + (canvasX / width) * rect.width,
      y: rect.top + (canvasY / height) * rect.height,
    };
  }

  function handlePointerDown(e: PointerEvent): void {
    // Close any open placement popover on new interactions
    placementPopover = null;

    const pos = canvasCoords(e);

    if (toolMode === "select") {
      const idx = findEndpointAtPosition(pos.x, pos.y);
      if (idx >= 0) {
        onSelectEndpoint(idx);
        dragging = true;
        dragIdx = idx;
        dragPos = pos;
        canvasEl?.setPointerCapture(e.pointerId);
      } else {
        onSelectEndpoint(-1);
      }
    } else if (toolMode === "guided" && guidedStep && onGuidedPlacement) {
      // Guided mode: click directly places the current guided endpoint
      onGuidedPlacement(pos.x, pos.y);
    } else if (toolMode === "place") {
      // Manual placement: show popover to pick prop/tip
      const screenPos = screenCoordsFromCanvas(pos.x, pos.y);
      placementPopover = {
        x: screenPos.x,
        y: screenPos.y,
        canvasX: pos.x,
        canvasY: pos.y,
      };
    } else if (toolMode === "occlude") {
      const idx = findEndpointAtPosition(pos.x, pos.y);
      if (idx >= 0) {
        const ep = trailsState.currentEndpoints[idx];
        if (ep) {
          trailsState.markOccluded(
            trailsState.currentFrame,
            ep.propIndex,
            ep.tipIndex
          );
        }
      }
    }
  }

  function handlePointerMove(e: PointerEvent): void {
    if (!dragging) return;
    dragPos = canvasCoords(e);
  }

  function handlePointerUp(e: PointerEvent): void {
    if (!dragging || dragIdx < 0 || !dragPos) {
      dragging = false;
      dragIdx = -1;
      dragPos = null;
      return;
    }

    const ep = trailsState.currentEndpoints[dragIdx];
    if (ep) {
      trailsState.correctEndpoint(trailsState.currentFrame, {
        propIndex: ep.propIndex,
        tipIndex: ep.tipIndex,
        detected: { x: ep.x, y: ep.y, confidence: ep.confidence },
        corrected: { x: dragPos.x, y: dragPos.y },
        status: "corrected",
      });
    }

    canvasEl?.releasePointerCapture(e.pointerId);
    dragging = false;
    dragIdx = -1;
    dragPos = null;
  }

  function handlePlacementSelect(propIndex: 0 | 1, tipIndex: number): void {
    if (!placementPopover) return;
    trailsState.correctEndpoint(trailsState.currentFrame, {
      propIndex,
      tipIndex,
      detected: null,
      corrected: { x: placementPopover.canvasX, y: placementPopover.canvasY },
      status: "corrected",
    });
    placementPopover = null;
  }

  function handleKeydown(e: KeyboardEvent): void {
    // Escape closes placement popover
    if (e.key === "Escape") {
      placementPopover = null;
      return;
    }

    const endpoints = trailsState.currentEndpoints;
    if (endpoints.length === 0) return;

    if (e.key === "Tab") {
      e.preventDefault();
      if (endpoints.length > 0) {
        onSelectEndpoint((selectedIdx + 1) % endpoints.length);
      }
      return;
    }

    if (selectedIdx < 0 || selectedIdx >= endpoints.length) return;
    const ep = endpoints[selectedIdx]!;
    const nudge = e.shiftKey ? 5 : 1;

    if (
      e.key === "ArrowLeft" ||
      e.key === "ArrowRight" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown"
    ) {
      e.preventDefault();
      let dx = 0;
      let dy = 0;
      if (e.key === "ArrowLeft") dx = -nudge;
      if (e.key === "ArrowRight") dx = nudge;
      if (e.key === "ArrowUp") dy = -nudge;
      if (e.key === "ArrowDown") dy = nudge;

      trailsState.correctEndpoint(trailsState.currentFrame, {
        propIndex: ep.propIndex,
        tipIndex: ep.tipIndex,
        detected: { x: ep.x, y: ep.y, confidence: ep.confidence },
        corrected: { x: ep.x + dx, y: ep.y + dy },
        status: "corrected",
      });
      return;
    }

    if (e.key === "o" || e.key === "O") {
      e.preventDefault();
      trailsState.markOccluded(
        trailsState.currentFrame,
        ep.propIndex,
        ep.tipIndex
      );
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      trailsState.correctEndpoint(trailsState.currentFrame, {
        propIndex: ep.propIndex,
        tipIndex: ep.tipIndex,
        detected: { x: ep.x, y: ep.y, confidence: ep.confidence },
        corrected: null,
        status: "accepted",
      });
      if (trailsState.currentFrame < trailsState.totalFrames - 1) {
        trailsState.setCurrentFrame(trailsState.currentFrame + 1);
      }
    }
  }

  let cursorClass = $derived(
    toolMode === "guided"
      ? "cursor-crosshair"
      : toolMode === "place"
        ? "cursor-crosshair"
        : toolMode === "occlude"
          ? "cursor-occlude"
          : ""
  );
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
<div class="endpoint-editor-wrapper">
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="endpoint-editor"
    onkeydown={handleKeydown}
    tabindex="0"
    role="application"
    aria-label="Endpoint editor canvas. Tab to cycle endpoints, arrows to nudge, O to mark occluded, Enter to accept."
  >
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <canvas
      bind:this={canvasEl}
      {width}
      {height}
      class={cursorClass}
      onpointerdown={handlePointerDown}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
    ></canvas>

    <!-- Placement popover -->
    {#if placementPopover}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="placement-backdrop"
        onclick={() => (placementPopover = null)}
        onkeydown={(e) => e.key === "Escape" && (placementPopover = null)}
      ></div>
      <div
        class="placement-popover"
        style="left: {placementPopover.x}px; top: {placementPopover.y}px;"
      >
        <div class="popover-title">Place endpoint</div>
        <button
          class="popover-option blue"
          onclick={() => handlePlacementSelect(0, 0)}
        >
          <span class="pop-dot" style="background: #4a90d9"></span>
          Left tip 0
        </button>
        <button
          class="popover-option blue"
          onclick={() => handlePlacementSelect(0, 1)}
        >
          <span class="pop-dot" style="background: #4a90d9"></span>
          Left tip 1
        </button>
        <button
          class="popover-option red"
          onclick={() => handlePlacementSelect(1, 0)}
        >
          <span class="pop-dot" style="background: #d94a4a"></span>
          Right tip 0
        </button>
        <button
          class="popover-option red"
          onclick={() => handlePlacementSelect(1, 1)}
        >
          <span class="pop-dot" style="background: #d94a4a"></span>
          Right tip 1
        </button>
      </div>
    {/if}
  </div>
</div>

<style>
  .endpoint-editor-wrapper {
    display: contents;
  }
  .endpoint-editor {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .endpoint-editor:focus-visible {
    outline: 2px solid var(--theme-accent, #f43f5e);
    outline-offset: 2px;
    border-radius: 4px;
  }

  canvas {
    display: block;
    border-radius: 6px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    pointer-events: auto;
    touch-action: none;
    max-width: 100%;
    height: auto;
    flex: 1;
    min-height: 0;
    object-fit: contain;
  }

  canvas.cursor-crosshair {
    cursor: crosshair;
  }

  canvas.cursor-occlude {
    cursor: not-allowed;
  }

  /* Placement popover */
  .placement-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .placement-popover {
    position: fixed;
    z-index: 100;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    min-width: 140px;
    transform: translate(-50%, 8px);
  }

  .popover-title {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    padding: 2px 6px 4px;
    font-weight: 600;
  }

  .popover-option {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    text-align: left;
    transition: background var(--duration-instant);
  }

  .popover-option:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .pop-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
  }
</style>
