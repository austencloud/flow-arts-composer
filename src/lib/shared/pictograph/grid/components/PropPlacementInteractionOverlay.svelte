<script lang="ts">
  import type { GridLocation } from "../domain/enums/grid-enums";
  import type { PlacementGridPoint } from "../services/placement-grid-points";
  import type { PlacementGuideCoordinates } from "../services/prop-placement-view-model";
  import type { PropPlacementAimState } from "../state/prop-placement-aim-state.svelte";
  import type { PropPlacementState } from "../state/prop-placement-state.svelte";
  import { HandSide } from "../../shared/domain/enums/pictograph-enums";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  interface Props {
    placement: PropPlacementState;
    aim: PropPlacementAimState;
    activePoints: PlacementGridPoint[];
    hitTargetRadius: number;
    pulseColor: string;
    leftNoun: string;
    rightNoun: string;
    showGuideLines: boolean;
    guideLineType?: "alpha" | "beta" | "gamma";
    guideCoordinates: PlacementGuideCoordinates | null;
    gammaArc: string;
    /**
     * Each hand's points on its own grid when the hands draw on joined grids.
     * Each target then belongs to one hand: the hand being placed shows its
     * own grid's points, and a finished position shows each prop's point.
     */
    handPoints?: Readonly<Record<HandSide, PlacementGridPoint[]>> | null;
    /** Size of the drawn grid against one grid's: the joined fit scale. */
    pointScale?: number;
  }

  /** A target; `hand` is set when it is one hand's point on joined grids. */
  type PlacementTarget = PlacementGridPoint & { hand?: HandSide };

  let {
    placement,
    aim,
    activePoints,
    hitTargetRadius,
    pulseColor,
    leftNoun,
    rightNoun,
    showGuideLines,
    guideLineType,
    guideCoordinates,
    gammaArc,
    handPoints = null,
    pointScale = 1,
  }: Props = $props();

  const targets = $derived.by((): PlacementTarget[] => {
    if (!handPoints) return activePoints;
    const active = placement.activeHand;
    const hands = active !== null ? [active] : [HandSide.LEFT, HandSide.RIGHT];
    return hands.flatMap((hand) =>
      handPoints[hand]
        .filter((point) => active !== null || isAt(hand, point.location))
        .map((point) => ({ ...point, hand }))
    );
  });
  const dropPoints = $derived(
    handPoints && aim.grabbedLocationColor !== null
      ? handPoints[aim.grabbedLocationColor]
      : activePoints
  );

  function isAt(hand: HandSide, location: GridLocation): boolean {
    return hand === HandSide.LEFT
      ? placement.leftLocation === location
      : placement.rightLocation === location;
  }

  function isLeftAt(target: PlacementTarget): boolean {
    return (
      target.hand !== HandSide.RIGHT &&
      placement.leftLocation === target.location
    );
  }

  function isRightAt(target: PlacementTarget): boolean {
    return (
      target.hand !== HandSide.LEFT &&
      placement.rightLocation === target.location
    );
  }
</script>

<svelte:window
  onpointermove={aim.handlePointerMove}
  onpointerup={aim.handlePointerUp}
  onpointercancel={aim.handlePointerCancel}
  onblur={aim.cancelLocationDrag}
  onkeydown={aim.handleEscape}
/>

<svg
  viewBox="0 0 950 950"
  class="interaction-overlay"
  class:location-grabbed={aim.grabbedLocationColor !== null}
  style:--landing-duration={`${DURATION.dramatic}ms`}
  role="group"
  aria-label="Placement points"
  onpointerdown={aim.handleBoardPointerDown}
  bind:this={aim.overlayElement}
>
  <g class="touch-indicators">
    {#each targets as point (`${point.hand ?? ""}${point.location}`)}
      {#if placement.canPlace && aim.grabbedLocationColor === null}
        <circle
          cx={point.x}
          cy={point.y}
          r={40 * pointScale}
          fill={pulseColor}
          class="point-glow"
        />
        <circle
          cx={point.x}
          cy={point.y}
          r={18 * pointScale}
          fill={pulseColor}
          opacity="0.5"
          class="point-solid"
        />
      {/if}
    {/each}
  </g>

  {#if aim.grabbedLocationColor !== null && aim.locationDragCenter}
    {@const color =
      aim.grabbedLocationColor === HandSide.RIGHT
        ? "var(--prop-red)"
        : "var(--prop-blue)"}
    <g class="location-drag-feedback" aria-hidden="true" style:color>
      {#each dropPoints as point (point.location)}
        <circle
          cx={point.x}
          cy={point.y}
          r={48 * pointScale}
          class="drop-option"
        />
      {/each}
      {#if aim.locationDragColor !== null && aim.locationDragOrigin}
        <circle
          cx={aim.locationDragOrigin.x}
          cy={aim.locationDragOrigin.y}
          r={32 * pointScale}
          class="drag-origin"
        />
      {/if}
      <circle
        cx={aim.locationDragCenter.x}
        cy={aim.locationDragCenter.y}
        r={65 * pointScale}
        class="grab-ring"
      />
      {#if aim.locationTarget}
        <line
          x1={aim.locationDragCenter.x}
          y1={aim.locationDragCenter.y}
          x2={aim.locationTarget.x}
          y2={aim.locationTarget.y}
          class="snap-guide"
        />
        <circle
          cx={aim.locationTarget.x}
          cy={aim.locationTarget.y}
          r={48 * pointScale}
          class="drop-target-contrast"
        />
        <circle
          cx={aim.locationTarget.x}
          cy={aim.locationTarget.y}
          r={48 * pointScale}
          class="drop-target"
        />
        <circle
          cx={aim.locationTarget.x}
          cy={aim.locationTarget.y}
          r={10 * pointScale}
          class="drop-center"
        />
      {/if}
    </g>
  {/if}

  {#if aim.landing}
    {#key aim.landing}
      <circle
        cx={aim.landing.point.x}
        cy={aim.landing.point.y}
        r={54 * pointScale}
        class="drop-landing"
        aria-hidden="true"
        stroke={aim.landing.color === HandSide.RIGHT
          ? "var(--prop-red)"
          : "var(--prop-blue)"}
      />
    {/key}
  {/if}

  {#if aim.highlightColor && aim.dragHand === null && aim.hoverOutline}
    <polygon
      points={aim.hoverOutline}
      fill="none"
      class="aim-outline"
      stroke={aim.highlightStroke}
      aria-hidden="true"
    />
  {:else if aim.highlightCenter && aim.highlightColor}
    <circle
      cx={aim.highlightCenter.x}
      cy={aim.highlightCenter.y}
      r={(aim.isBeta ? 44 : 56) * pointScale}
      fill="none"
      class="aim-halo"
      class:resting={aim.dragHand === null}
      stroke={aim.highlightStroke}
      aria-hidden="true"
    />
  {/if}

  {#if aim.dragPoint && aim.dragHand}
    <g class="aim-ticks" aria-hidden="true">
      {#each aim.aimDirections as direction (direction.orientation)}
        {@const radians = (direction.angle * Math.PI) / 180}
        {@const cos = Math.cos(radians)}
        {@const sin = Math.sin(radians)}
        <line
          x1={aim.dragPoint.x + cos * 72 * pointScale}
          y1={aim.dragPoint.y + sin * 72 * pointScale}
          x2={aim.dragPoint.x + cos * 138 * pointScale}
          y2={aim.dragPoint.y + sin * 138 * pointScale}
          class="aim-tick"
          class:aimed={direction.orientation === aim.dragAim}
          stroke={aim.dragHand === HandSide.RIGHT
            ? "var(--prop-red, #ef4444)"
            : "var(--prop-blue, #3b82f6)"}
        />
      {/each}
    </g>
  {/if}

  <g class="click-targets">
    {#each targets as point (`${point.hand ?? ""}${point.location}`)}
      <circle
        cx={point.x}
        cy={point.y}
        r={hitTargetRadius * pointScale}
        fill="transparent"
        class="click-target"
        class:tappable={aim.isPressable(point.location, point.hand)}
        class:occupied={isLeftAt(point) || isRightAt(point)}
        onpointerdown={(event) =>
          aim.handlePointerDown(event, point.location, point.hand)}
        onpointermove={(event) =>
          aim.updateHover(event, point.location, point.hand)}
        onpointerleave={aim.clearHover}
        onclick={(event) => aim.handleClick(point.location, event, point.hand)}
        onkeydown={(event) =>
          aim.handleKeydown(event, point.location, point.hand)}
        role="button"
        tabindex={aim.isPressable(point.location, point.hand) ? 0 : -1}
        aria-label="{point.label} point{isLeftAt(point)
          ? ` (${leftNoun})`
          : ''}{isRightAt(point) ? ` (${rightNoun})` : ''}"
        aria-disabled={!aim.isPressable(point.location, point.hand)}
      />
    {/each}
  </g>

  {#if showGuideLines && guideLineType && guideCoordinates}
    <g class="guide-lines">
      {#if guideLineType === "alpha"}
        <line
          x1={guideCoordinates.left.x}
          y1={guideCoordinates.left.y}
          x2={guideCoordinates.right.x}
          y2={guideCoordinates.right.y}
          stroke="rgba(0, 0, 0, 0.4)"
          stroke-width="4"
          stroke-dasharray="15 10"
        />
        <circle cx="475" cy="475" r="10" fill="rgba(0, 0, 0, 0.3)" />
      {:else if guideLineType === "beta"}
        {#each [30, 50, 70] as radius, index}
          <circle
            cx={guideCoordinates.left.x}
            cy={guideCoordinates.left.y}
            r={radius}
            fill="none"
            stroke="rgba(0, 0, 0, 0.3)"
            stroke-width="2.5"
            class="beta-ripple"
            style:animation-delay={`${index * 0.3}s`}
          />
        {/each}
      {:else}
        <line
          x1="475"
          y1="475"
          x2={guideCoordinates.left.x}
          y2={guideCoordinates.left.y}
          stroke="rgba(0, 0, 0, 0.25)"
          stroke-width="2.5"
          stroke-dasharray="10 8"
        />
        <line
          x1="475"
          y1="475"
          x2={guideCoordinates.right.x}
          y2={guideCoordinates.right.y}
          stroke="rgba(0, 0, 0, 0.25)"
          stroke-width="2.5"
          stroke-dasharray="10 8"
        />
        <path
          d={gammaArc}
          fill="none"
          stroke="rgba(0, 0, 0, 0.4)"
          stroke-width="4"
        />
        <text
          x="475"
          y="450"
          text-anchor="middle"
          fill="rgba(0, 0, 0, 0.4)"
          font-size="32">90°</text
        >
      {/if}
    </g>
  {/if}
</svg>

<style>
  .interaction-overlay {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .point-glow {
    opacity: 0.15;
    animation: pulse-glow 1.5s ease-in-out infinite;
  }

  .location-drag-feedback {
    pointer-events: none;
  }
  .drop-option {
    fill: none;
    stroke: var(--theme-text);
    stroke-width: 3;
    opacity: 0.3;
  }
  .drag-origin {
    fill: currentColor;
    opacity: 0.18;
  }
  .grab-ring {
    fill: none;
    stroke: currentColor;
    stroke-width: 5;
    opacity: 0.75;
  }
  .snap-guide {
    stroke: currentColor;
    stroke-width: 3;
    opacity: 0.6;
  }
  .drop-target-contrast {
    fill: none;
    stroke: var(--theme-text);
    stroke-width: 12;
  }
  .drop-target {
    fill: color-mix(in srgb, currentColor 16%, transparent);
    stroke: currentColor;
    stroke-width: 7;
  }
  .drop-center {
    fill: currentColor;
  }
  .drop-landing {
    fill: none;
    stroke-width: 10;
    transform-box: fill-box;
    transform-origin: center;
    pointer-events: none;
    animation: landing-ring var(--landing-duration) var(--ease-out) both;
  }
  @keyframes landing-ring {
    from {
      opacity: 0.9;
      scale: 0.9;
    }
    to {
      opacity: 0;
      scale: 1.5;
    }
  }
  .interaction-overlay.location-grabbed .click-target:hover {
    fill: transparent;
  }

  .point-solid {
    transition: opacity 0.15s ease;
  }

  .click-target {
    cursor: default;
    pointer-events: auto;
    touch-action: none;
  }

  .aim-halo {
    stroke-width: 22;
    filter: blur(9px);
    mix-blend-mode: screen;
    animation: halo-pulse 1.2s ease-in-out infinite;
    pointer-events: none;
  }

  .aim-outline {
    stroke-width: 10;
    stroke-linejoin: round;
    filter: blur(5px);
    mix-blend-mode: screen;
    opacity: 0.85;
    pointer-events: none;
  }

  .aim-halo.resting {
    stroke-width: 16;
    opacity: 0.75;
    animation: none;
  }

  .aim-tick {
    stroke-width: 6;
    stroke-linecap: round;
    opacity: 0.22;
    transition:
      opacity 0.12s ease,
      stroke-width 0.12s ease;
  }

  .aim-tick.aimed {
    stroke-width: 12;
    opacity: 0.95;
  }

  .click-target.tappable {
    cursor: pointer;
  }

  .click-target.tappable:hover {
    fill: color-mix(in srgb, var(--theme-text, white) 8%, transparent);
  }

  .click-target:focus-visible {
    outline: none;
    stroke: var(--theme-accent, #60a5fa);
    stroke-width: 4;
    stroke-dasharray: 10 5;
  }

  .beta-ripple {
    animation: ripple-expand 1.5s ease-out infinite;
  }

  @keyframes pulse-glow {
    0%,
    100% {
      opacity: 0.12;
    }

    50% {
      opacity: 0.3;
    }
  }

  @keyframes halo-pulse {
    0%,
    100% {
      opacity: 0.45;
    }

    50% {
      opacity: 0.8;
    }
  }

  @keyframes ripple-expand {
    0% {
      opacity: 0.4;
    }

    100% {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .drop-landing {
      display: none;
      animation: none;
      opacity: 0;
    }
    .point-glow {
      animation: none;
      opacity: 0.2;
    }

    .beta-ripple {
      animation: none;
    }

    .point-solid,
    .aim-tick {
      transition: none;
    }

    .aim-halo {
      animation: none;
      opacity: 0.55;
    }
  }
  :global([data-motion-preference="reduce"]) .drop-landing {
    display: none;
    animation: none;
    opacity: 0;
  }
</style>
