<!--
  Transparent SVG overlay with clickable circles at grid positions.
  Positioned absolutely over AnimatorCanvas. Uses 950x950 viewBox
  (same coordinate space as GridSvg, GlyphOverlay, and the canvas).

  pointer-events: none on the SVG root so canvas interactions
  (pinch, pan) pass through. pointer-events: auto only on the
  clickable circles themselves.
-->
<script lang="ts">
  import {
    getHitTargets,
    getHitTargetRadius,
  } from "#lib/shared/assemble-lab/services/grid-hit-target-calculator.js";
  import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    HandSide,
    type HandSide as HandSideValue,
    type Orientation,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    aimDirectionsFor,
    orientationFromDrag,
  } from "#lib/shared/pictograph/grid/domain/orientation-from-drag.js";

  interface Props {
    gridMode: GridMode;
    activePhaseHand: HandSideValue | null;
    currentPosition: GridLocation | null;
    disabled: boolean;
    showCenter?: boolean;
    pulseTargets?: boolean;
    keyLabels?: Partial<Record<GridLocation, string>>;
    labelForLocation?: (location: GridLocation, defaultLabel: string) => string;
    onPointClick: (location: GridLocation) => void;
    onPointPreview?: (location: GridLocation | null) => void;
    aimEnabled?: boolean;
    onPointAim?: (location: GridLocation, orientation: Orientation) => void;
    onPointAimPreview?: (
      location: GridLocation,
      orientation: Orientation | null
    ) => void;
    /**
     * Moves each target off the one-grid scene, e.g. onto the active hand's
     * grid when the hands draw on joined grids. Absent leaves targets where
     * the one grid draws its points.
     */
    placeTarget?:
      | ((point: { x: number; y: number }) => {
          x: number;
          y: number;
        })
      | null;
    /** Size of the drawn grid against one grid's; scales the targets. */
    targetScale?: number;
  }

  let {
    gridMode,
    activePhaseHand = null,
    currentPosition = null,
    disabled = false,
    showCenter = false,
    pulseTargets = true,
    keyLabels = {},
    labelForLocation,
    onPointClick,
    onPointPreview,
    aimEnabled = false,
    onPointAim,
    onPointAimPreview,
    placeTarget = null,
    targetScale = 1,
  }: Props = $props();

  const hitRadius = $derived(getHitTargetRadius() * targetScale);

  const hitTargets = $derived.by(() => {
    const targets = getHitTargets(gridMode, showCenter);
    const place = placeTarget;
    return place
      ? targets.map((target) => ({ ...target, ...place(target) }))
      : targets;
  });
  let overlayElement = $state<SVGSVGElement | null>(null);
  let dragLocation = $state<GridLocation | null>(null);
  let dragAim = $state<Orientation | null>(null);
  let dragPointerId: number | null = null;
  let dragOrigin: { x: number; y: number } | null = null;
  let dragTarget: SVGCircleElement | null = null;
  let pointerHandledPress = false;
  const dragPoint = $derived(
    dragLocation === null
      ? null
      : (hitTargets.find((target) => target.location === dragLocation) ?? null)
  );
  const aimDirections = $derived(
    dragLocation === null ? [] : aimDirectionsFor(dragLocation, gridMode)
  );

  function handleClick(location: GridLocation): void {
    if (disabled) return;
    if (pointerHandledPress) {
      pointerHandledPress = false;
      return;
    }
    onPointClick(location);
  }

  function handleKeydown(e: KeyboardEvent, location: GridLocation): void {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick(location);
    }
  }

  function getLabel(location: GridLocation, defaultLabel: string): string {
    if (labelForLocation) return labelForLocation(location, defaultLabel);
    const phase =
      activePhaseHand === HandSide.LEFT
        ? "Left"
        : activePhaseHand === HandSide.RIGHT
          ? "Right"
          : "";
    return `${phase} ${defaultLabel}`.trim();
  }

  function toSvgPoint(event: PointerEvent): { x: number; y: number } | null {
    const matrix = overlayElement?.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse()
    );
    return { x: point.x, y: point.y };
  }

  function handlePointerDown(
    event: PointerEvent,
    location: GridLocation,
    x: number,
    y: number
  ): void {
    if (disabled || !aimEnabled || !onPointAim || dragPointerId !== null)
      return;

    pointerHandledPress = true;
    dragPointerId = event.pointerId;
    dragLocation = location;
    dragOrigin = { x, y };
    dragAim = null;
    dragTarget = event.currentTarget as SVGCircleElement;
    try {
      dragTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic assistive input may not register an active browser pointer.
      // Window-level move/up listeners still preserve the gesture.
    }

    // Placement happens on press so the prop appears under the user's finger.
    // The matching click is suppressed below to avoid creating a first motion.
    onPointClick(location);
    onPointAimPreview?.(location, null);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (event.pointerId !== dragPointerId || dragLocation === null) return;
    const pointer = toSvgPoint(event);
    if (!pointer || !dragOrigin) return;
    const aimed = orientationFromDrag({
      location: dragLocation,
      gridMode,
      dx: pointer.x - dragOrigin.x,
      dy: pointer.y - dragOrigin.y,
    });
    if (!aimed || aimed === dragAim) return;
    dragAim = aimed;
    onPointAimPreview?.(dragLocation, aimed);
  }

  function clearDrag(): void {
    dragPointerId = null;
    dragLocation = null;
    dragOrigin = null;
    dragAim = null;
    dragTarget = null;
  }

  function handlePointerUp(event: PointerEvent): void {
    if (event.pointerId !== dragPointerId) return;
    const location = dragLocation;
    const orientation = dragAim;
    try {
      dragTarget?.releasePointerCapture?.(event.pointerId);
    } catch {
      // The browser may have released capture while the pointer left the page.
    }
    clearDrag();
    if (location !== null && orientation !== null) {
      onPointAim?.(location, orientation);
    }
    if (location !== null) onPointAimPreview?.(location, null);
  }

  function handlePointerCancel(event: PointerEvent): void {
    if (event.pointerId !== dragPointerId) return;
    const location = dragLocation;
    pointerHandledPress = false;
    clearDrag();
    if (location !== null) onPointAimPreview?.(location, null);
  }
</script>

<svelte:window
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerCancel}
/>

<svg
  class="hit-target-overlay"
  class:aim-enabled={aimEnabled}
  viewBox="0 0 950 950"
  xmlns="http://www.w3.org/2000/svg"
  preserveAspectRatio="xMidYMid meet"
  bind:this={overlayElement}
>
  {#if dragPoint}
    <g class="aim-ticks" aria-hidden="true">
      {#each aimDirections as direction (direction.orientation)}
        {@const radians = (direction.angle * Math.PI) / 180}
        {@const cos = Math.cos(radians)}
        {@const sin = Math.sin(radians)}
        <line
          x1={dragPoint.x + cos * 72 * targetScale}
          y1={dragPoint.y + sin * 72 * targetScale}
          x2={dragPoint.x + cos * 138 * targetScale}
          y2={dragPoint.y + sin * 138 * targetScale}
          class:aimed={direction.orientation === dragAim}
          class:phase-blue={activePhaseHand === HandSide.LEFT}
          class:phase-red={activePhaseHand === HandSide.RIGHT}
        />
      {/each}
    </g>
  {/if}

  {#each hitTargets as target (target.location)}
    {#if keyLabels[target.location]}
      <text
        x={target.x}
        y={target.y + 5}
        class="key-label"
        text-anchor="middle"
        dominant-baseline="middle"
        aria-hidden="true">{keyLabels[target.location]}</text
      >
    {/if}
    <circle
      cx={target.x}
      cy={target.y}
      r={hitRadius}
      class="hit-target"
      class:is-selected={currentPosition === target.location}
      class:phase-blue={activePhaseHand === HandSide.LEFT}
      class:phase-red={activePhaseHand === HandSide.RIGHT}
      class:pulse={pulseTargets}
      class:disabled
      class:is-aiming={dragLocation === target.location}
      role="button"
      tabindex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-label={getLabel(target.location, target.label)}
      onclick={() => handleClick(target.location)}
      onkeydown={(e) => handleKeydown(e, target.location)}
      onpointerdown={(event) =>
        handlePointerDown(event, target.location, target.x, target.y)}
      onpointerenter={() => onPointPreview?.(target.location)}
      onpointerleave={() => onPointPreview?.(null)}
      onfocus={() => onPointPreview?.(target.location)}
      onblur={() => onPointPreview?.(null)}
    />
  {/each}
</svg>

<style>
  .hit-target-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10;
    pointer-events: none;
  }

  .hit-target-overlay.aim-enabled .hit-target {
    touch-action: none;
  }

  .aim-ticks {
    pointer-events: none;
  }

  .aim-ticks line {
    stroke: color-mix(in srgb, var(--theme-text, #fff) 48%, transparent);
    stroke-width: 5;
    stroke-linecap: round;
    transition:
      stroke var(--duration-fast, 150ms) ease,
      stroke-width var(--duration-fast, 150ms) ease;
  }

  .aim-ticks line.aimed {
    stroke-width: 9;
  }

  .aim-ticks line.aimed.phase-blue {
    stroke: var(--prop-blue, #2e8bf0);
  }

  .aim-ticks line.aimed.phase-red {
    stroke: var(--prop-red, #ed1c24);
  }

  .hit-target {
    pointer-events: auto;
    fill: rgba(255, 255, 255, 0.04);
    stroke: rgba(255, 255, 255, 0.25);
    stroke-width: 2.5;
    cursor: pointer;
    transition:
      fill 0.14s ease,
      stroke 0.14s ease,
      stroke-width 0.14s ease;
  }

  .hit-target.disabled {
    cursor: not-allowed;
    pointer-events: none;
    opacity: 0.3;
  }

  .hit-target.phase-blue:not(.is-selected):not(.disabled) {
    fill: color-mix(in srgb, var(--prop-blue, #2e8bf0) 8%, transparent);
    stroke: color-mix(in srgb, var(--prop-blue, #2e8bf0) 50%, transparent);
  }

  .hit-target.pulse.phase-blue:not(.is-selected):not(.disabled) {
    animation: pulse-blue 1.8s ease-in-out infinite;
  }

  .hit-target.phase-red:not(.is-selected):not(.disabled) {
    fill: color-mix(in srgb, var(--prop-red, #ed1c24) 8%, transparent);
    stroke: color-mix(in srgb, var(--prop-red, #ed1c24) 50%, transparent);
  }

  .hit-target.pulse.phase-red:not(.is-selected):not(.disabled) {
    animation: pulse-red 1.8s ease-in-out infinite;
  }

  .hit-target.is-selected.phase-blue {
    fill: color-mix(in srgb, var(--prop-blue, #2e8bf0) 22%, transparent);
    stroke: var(--prop-blue, #2e8bf0);
    stroke-width: 3;
    animation: none;
  }

  .hit-target.is-selected.phase-red {
    fill: color-mix(in srgb, var(--prop-red, #ed1c24) 22%, transparent);
    stroke: var(--prop-red, #ed1c24);
    stroke-width: 3;
    animation: none;
  }

  .hit-target.is-aiming {
    stroke-width: 4;
  }

  .hit-target:hover:not(.is-selected):not(.disabled) {
    stroke-width: 3.5;
  }

  .hit-target.phase-blue:hover:not(.is-selected):not(.disabled) {
    fill: color-mix(in srgb, var(--prop-blue, #2e8bf0) 20%, transparent);
    stroke: var(--prop-blue, #2e8bf0);
  }

  .hit-target.phase-red:hover:not(.is-selected):not(.disabled) {
    fill: color-mix(in srgb, var(--prop-red, #ed1c24) 20%, transparent);
    stroke: var(--prop-red, #ed1c24);
  }

  .hit-target:focus-visible {
    outline: none;
    stroke-width: 4;
    stroke: var(--theme-accent, #3b82f6);
  }

  .key-label {
    fill: var(--theme-text, #ffffff);
    font-size: 28px;
    font-weight: 800;
    font-family: var(--font-mono, monospace);
    pointer-events: none;
    user-select: none;
  }

  @keyframes pulse-blue {
    0% {
      fill: color-mix(in srgb, var(--prop-blue, #2e8bf0) 5%, transparent);
      stroke-opacity: 0.4;
      stroke-width: 2;
    }
    50% {
      fill: color-mix(in srgb, var(--prop-blue, #2e8bf0) 18%, transparent);
      stroke-opacity: 0.9;
      stroke-width: 3.5;
    }
    100% {
      fill: color-mix(in srgb, var(--prop-blue, #2e8bf0) 5%, transparent);
      stroke-opacity: 0.4;
      stroke-width: 2;
    }
  }

  @keyframes pulse-red {
    0% {
      fill: color-mix(in srgb, var(--prop-red, #ed1c24) 5%, transparent);
      stroke-opacity: 0.4;
      stroke-width: 2;
    }
    50% {
      fill: color-mix(in srgb, var(--prop-red, #ed1c24) 18%, transparent);
      stroke-opacity: 0.9;
      stroke-width: 3.5;
    }
    100% {
      fill: color-mix(in srgb, var(--prop-red, #ed1c24) 5%, transparent);
      stroke-opacity: 0.4;
      stroke-width: 2;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .hit-target.phase-blue:not(.disabled),
    .hit-target.phase-red:not(.disabled) {
      animation: none;
    }

    .aim-ticks line {
      transition: none;
    }
  }
</style>
