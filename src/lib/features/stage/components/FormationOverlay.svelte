<script lang="ts">
  import { onDestroy } from "svelte";
  import { getStageChoreographyContext } from "../context/stage-choreography-context";
  import type { StageEditMode } from "../state/stage-edit-mode.svelte";
  import type { Formation } from "../domain/stage-types";
  import { resolveActiveFormationIndex } from "../domain/active-formation";

  interface Props {
    editMode: StageEditMode;
  }

  let { editMode }: Props = $props();

  const stageState = getStageChoreographyContext();
  const choreography = $derived(stageState.choreography);

  let containerEl: HTMLDivElement | null = $state(null);
  let svgWidth = $state(800);
  let svgHeight = $state(600);

  // Just enough room for the AUDIENCE and BACKSTAGE labels outside the boundary.
  // Everything left over goes to the chart, because a letterboxed chart in a
  // wide-and-short pane already gives up its side rail.
  // Room for the AUDIENCE and BACKSTAGE labels outside the boundary at their
  // largest (edgeLabelSize caps at 20). Everything left over goes to the chart,
  // because a letterboxed chart in a wide-and-short pane already gives up its
  // side rail.
  const margin = 36;

  // One scale for both axes. A chart stretched to its container reports a metre
  // upstage as a different distance than a metre sideways, which is the one
  // thing a drill chart exists to get right — so the stage is letterboxed in
  // whatever box it is given.
  const pxPerMetre = $derived(
    Math.max(
      1,
      Math.min(
        (svgWidth - margin * 2) / Math.max(choreography.stageWidth, 0.001),
        (svgHeight - margin * 2) / Math.max(choreography.stageDepth, 0.001)
      )
    )
  );

  // Enough rail to hold the caption without squeezing it into two words a line.
  const captionInGutter = $derived(originX >= 190);

  const chartWidth = $derived(pxPerMetre * choreography.stageWidth);
  const chartHeight = $derived(pxPerMetre * choreography.stageDepth);
  const originX = $derived((svgWidth - chartWidth) / 2);
  const originY = $derived((svgHeight - chartHeight) / 2);

  $effect(() => {
    if (!containerEl) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]!;
      svgWidth = entry.contentRect.width;
      svgHeight = entry.contentRect.height;
    });
    observer.observe(containerEl);
    return () => observer.disconnect();
  });

  function stageToSvgX(x: number): number {
    return originX + x * pxPerMetre;
  }

  function stageToSvgZ(z: number): number {
    return originY + z * pxPerMetre;
  }

  function svgToStageX(svgX: number): number {
    return (svgX - originX) / pxPerMetre;
  }

  function svgToStageZ(svgZ: number): number {
    return (svgZ - originY) / pxPerMetre;
  }

  const activeIndex = $derived(
    resolveActiveFormationIndex(
      choreography.formations,
      editMode.selectedFormationId,
      stageState.currentBeat
    )
  );

  const activeFormation = $derived.by((): Formation | undefined =>
    activeIndex >= 0 ? choreography.formations[activeIndex] : undefined
  );

  const previousFormation = $derived.by((): Formation | undefined =>
    activeIndex > 0 ? choreography.formations[activeIndex - 1] : undefined
  );

  function formationName(index: number): string {
    return choreography.formations[index]?.label ?? `Set ${index + 1}`;
  }

  let draggingPerformerId: string | null = $state(null);

  function handleSpotPointerDown(e: PointerEvent, performerId: string) {
    const formation = activeFormation;
    if (!formation) return;
    e.preventDefault();
    (e.currentTarget as SVGElement).setPointerCapture(e.pointerId);
    draggingPerformerId = performerId;
    editMode.isDragging = true;
    editMode.selectSpot(formation.id, performerId);
    stageState.beginDrag();
  }

  function handlePointerMove(e: PointerEvent) {
    if (!draggingPerformerId) return;
    // Every mutation replaces the formations array, so the id is the only thing
    // safe to hold across a drag; re-find the set on each move.
    const formation = activeFormation;
    if (!formation) return;
    const svg = containerEl?.querySelector("svg");
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    stageState.updateSpotPosition(
      formation.id,
      draggingPerformerId,
      svgToStageX(e.clientX - rect.left),
      svgToStageZ(e.clientY - rect.top)
    );
  }

  function handlePointerUp() {
    stageState.endDrag();
    draggingPerformerId = null;
    editMode.isDragging = false;
  }

  onDestroy(() => {
    if (draggingPerformerId) handlePointerUp();
  });

  // Keyboard equivalent of dragging: nudge the selected spot a quarter metre.
  const NUDGE_METRES = 0.25;

  function handleSpotKeydown(e: KeyboardEvent, performerId: string) {
    const formation = activeFormation;
    const spot = formation?.spots[performerId];
    if (!formation || !spot) return;
    let dx = 0;
    let dz = 0;
    if (e.key === "ArrowLeft") dx = -NUDGE_METRES;
    else if (e.key === "ArrowRight") dx = NUDGE_METRES;
    else if (e.key === "ArrowUp") dz = -NUDGE_METRES;
    else if (e.key === "ArrowDown") dz = NUDGE_METRES;
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      editMode.selectSpot(formation.id, performerId);
      return;
    } else return;
    e.preventDefault();
    stageState.beginDrag();
    stageState.updateSpotPosition(
      formation.id,
      performerId,
      spot.x + dx,
      spot.z + dz
    );
    stageState.endDrag();
  }

  // A performer occupies about the same footprint whatever the chart's scale, so
  // the chips are sized in metres. On a short pane the chart gets small enough
  // that a 44px chip would swallow two metres of stage and the cast would pile
  // into one blob, so the DRAWN chip is allowed to shrink...
  const spotRadius = $derived(Math.max(9, Math.min(pxPerMetre * 0.34, 44)));
  // ...while the hit area keeps the 44px touch target regardless. Same split as
  // the timeline's transition handle: what you grab is bigger than what you see.
  const hitRadius = $derived(Math.max(22, spotRadius));
  const ghostRadius = $derived(spotRadius * 0.82);
  // Below this a letter inside the chip is smaller than the 10px floor, so it
  // moves out beside the dot instead of being crushed inside it.
  const labelFitsInside = $derived(spotRadius >= 13);
  const spotFontSize = $derived(
    Math.max(10, Math.round(spotRadius * (labelFitsInside ? 0.68 : 1.1)))
  );
  const edgeLabelSize = $derived(Math.max(11, Math.min(pxPerMetre * 0.13, 20)));
  // Stop the arrow at the chip edges so it reads as travel between two spots
  // rather than a line buried under them.
  const ARROW_CLEARANCE = 4;
  // Below this the arrowhead is the whole arrow, which reads as a smudge rather
  // than as travel. The ghost ring alone already says "they barely moved".
  // The arrowhead is drawn in stroke-widths, so a fixed stroke on a small chart
  // gives a head with no shaft behind it. Both scale together, and the minimum
  // shaft is measured against the head rather than in absolute pixels.
  const arrowStroke = $derived(Math.max(1, Math.min(pxPerMetre * 0.03, 2.5)));
  const MIN_ARROW_SHAFT = $derived(arrowStroke * 8);

  function travelArrow(
    from: { x: number; z: number },
    to: { x: number; z: number }
  ): { x1: number; y1: number; x2: number; y2: number } | null {
    const x1 = stageToSvgX(from.x);
    const y1 = stageToSvgZ(from.z);
    const x2 = stageToSvgX(to.x);
    const y2 = stageToSvgZ(to.z);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const head = ghostRadius + ARROW_CLEARANCE;
    const tail = spotRadius + ARROW_CLEARANCE;
    if (length <= head + tail + MIN_ARROW_SHAFT) return null;
    const ux = dx / length;
    const uy = dy / length;
    return {
      x1: x1 + ux * head,
      y1: y1 + uy * head,
      x2: x2 - ux * tail,
      y2: y2 - uy * tail,
    };
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="formation-overlay"
  bind:this={containerEl}
  role="region"
  aria-label="Drill chart"
  onpointermove={handlePointerMove}
  onpointerup={handlePointerUp}
  onpointercancel={handlePointerUp}
>
  <svg
    width={svgWidth}
    height={svgHeight}
    xmlns="http://www.w3.org/2000/svg"
    role="application"
    aria-label="Drill chart for {activeIndex >= 0
      ? formationName(activeIndex)
      : 'the stage'}"
  >
    <defs>
      {#each choreography.performers as performer}
        <marker
          id="arrow-{performer.id}"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={performer.color} />
        </marker>
      {/each}
    </defs>

    <!-- Stage boundary double ring -->
    <rect
      x={originX}
      y={originY}
      width={chartWidth}
      height={chartHeight}
      fill="none"
      stroke="rgba(255, 255, 255, 0.15)"
      stroke-width="2"
      rx="8"
    />
    <rect
      x={originX - 4}
      y={originY - 4}
      width={chartWidth + 8}
      height={chartHeight + 8}
      fill="none"
      stroke="rgba(255, 255, 255, 0.06)"
      stroke-width="1"
      rx="10"
    />

    <!-- Dot grid at 1m intervals -->
    {#each Array.from({ length: Math.floor(choreography.stageWidth) + 1 }, (_, i) => i) as x}
      {#each Array.from({ length: Math.floor(choreography.stageDepth) + 1 }, (_, i) => i) as z}
        <circle
          cx={stageToSvgX(x)}
          cy={stageToSvgZ(z)}
          r="1.5"
          fill="rgba(255, 255, 255, 0.22)"
        />
      {/each}
    {/each}

    <!-- Center crosshair -->
    <line
      x1={stageToSvgX(choreography.stageWidth / 2)}
      y1={originY}
      x2={stageToSvgX(choreography.stageWidth / 2)}
      y2={originY + chartHeight}
      stroke="rgba(255, 255, 255, 0.06)"
      stroke-width="1"
      stroke-dasharray="4 4"
    />
    <line
      x1={originX}
      y1={stageToSvgZ(choreography.stageDepth / 2)}
      x2={originX + chartWidth}
      y2={stageToSvgZ(choreography.stageDepth / 2)}
      stroke="rgba(255, 255, 255, 0.06)"
      stroke-width="1"
      stroke-dasharray="4 4"
    />

    {#if activeFormation}
      <!-- Where the cast came from, and the walk that gets them here. -->
      {#if previousFormation}
        {#each choreography.performers as performer}
          {@const from = previousFormation.spots[performer.id]}
          {@const to = activeFormation.spots[performer.id]}
          {#if from}
            <circle
              cx={stageToSvgX(from.x)}
              cy={stageToSvgZ(from.z)}
              r={ghostRadius}
              fill={performer.color}
              fill-opacity="0.12"
              stroke={performer.color}
              stroke-opacity="0.55"
              stroke-width="1.5"
              stroke-dasharray="3 3"
            />
            {#if to}
              {@const arrow = travelArrow(from, to)}
              {#if arrow}
                <line
                  x1={arrow.x1}
                  y1={arrow.y1}
                  x2={arrow.x2}
                  y2={arrow.y2}
                  stroke={performer.color}
                  stroke-opacity="0.65"
                  stroke-width={arrowStroke}
                  stroke-dasharray={to.walkStyle === "crab"
                    ? `${arrowStroke * 3} ${arrowStroke * 2}`
                    : "none"}
                  marker-end="url(#arrow-{performer.id})"
                />
              {/if}
            {/if}
          {/if}
        {/each}
      {/if}

      <!-- The set itself: one chip per performer, dragged to their spot. -->
      {#each choreography.performers as performer}
        {@const spot = activeFormation.spots[performer.id]}
        {#if spot}
          {@const selected =
            editMode.selectedFormationId === activeFormation.id &&
            editMode.selectedPerformerId === performer.id}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <g
            onpointerdown={(e) => handleSpotPointerDown(e, performer.id)}
            onkeydown={(e) => handleSpotKeydown(e, performer.id)}
            style="cursor: {draggingPerformerId === performer.id
              ? 'grabbing'
              : 'grab'}; touch-action: none;"
            role="button"
            tabindex="0"
            data-keyboard-shortcuts-ignore
            aria-label="{performer.label} in {formationName(
              activeIndex
            )} at {spot.x.toFixed(1)} by {spot.z.toFixed(
              1
            )} metres. Arrow keys nudge."
          >
            <circle
              cx={stageToSvgX(spot.x)}
              cy={stageToSvgZ(spot.z)}
              r={hitRadius}
              fill="transparent"
            />
            <circle
              cx={stageToSvgX(spot.x)}
              cy={stageToSvgZ(spot.z)}
              r={spotRadius}
              fill={performer.color}
              fill-opacity="0.85"
              stroke={selected ? "white" : performer.color}
              stroke-width={selected ? 3 : 2}
              pointer-events="none"
            />
            <text
              x={labelFitsInside
                ? stageToSvgX(spot.x)
                : stageToSvgX(spot.x) + spotRadius + 4}
              y={stageToSvgZ(spot.z) + spotFontSize * 0.35}
              text-anchor={labelFitsInside ? "middle" : "start"}
              fill="white"
              font-size={spotFontSize}
              font-weight="700"
              pointer-events="none">{performer.label}</text
            >
          </g>
        {/if}
      {/each}
    {/if}

    <!-- Labels -->
    <text
      x={svgWidth / 2}
      y={originY - 12}
      text-anchor="middle"
      fill="rgba(255, 255, 255, 0.35)"
      font-size={edgeLabelSize}
      font-weight="600"
      letter-spacing="1">AUDIENCE</text
    >
    <text
      x={svgWidth / 2}
      y={originY + chartHeight + edgeLabelSize + 8}
      text-anchor="middle"
      fill="rgba(255, 255, 255, 0.35)"
      font-size={edgeLabelSize}
      font-weight="600"
      letter-spacing="1">BACKSTAGE</text
    >
  </svg>

  {#if activeFormation}
    <!-- An isotropic chart leaves side rail in a wide pane. When that rail is
         wide enough to hold the caption, the caption lives there: the rail stops
         being dead space and the chart stops carrying a box over its top-left
         corner, which on a short pane landed right on top of the cast. -->
    <div
      class="chart-caption"
      class:in-gutter={captionInGutter}
      style={captionInGutter
        ? `right: calc(100% - ${originX - 14}px); top: ${originY}px; max-width: ${originX - 28}px`
        : `left: ${originX + 12}px; top: ${originY + 12}px; max-width: ${chartWidth - 24}px`}
    >
      <span class="chart-set">{formationName(activeIndex)}</span>
      <span class="chart-detail">
        {#if previousFormation}
          {activeFormation.transitionBeats} counts from {formationName(
            activeIndex - 1
          )}
        {:else}
          Opening set
        {/if}
      </span>
    </div>
  {/if}
</div>

<style>
  .formation-overlay {
    position: absolute;
    inset: 0;
    pointer-events: all;
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  /* Which set you are looking at, and what it cost to get here. Pinned to the
     chart's own top-left corner rather than the pane's, so it reads as this
     chart's title instead of a chip floating in the letterbox. */
  .chart-caption {
    position: absolute;
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.35rem 0.6rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.5rem;
    background: rgba(10, 12, 20, 0.72);
    pointer-events: none;
  }

  /* In the rail it is a block, right-aligned against the chart's edge, so it
     reads as this chart's label rather than as something adrift beside it. */
  .chart-caption.in-gutter {
    flex-direction: column;
    align-items: flex-end;
    gap: 0.15rem;
    border-color: transparent;
    background: transparent;
    text-align: right;
  }

  .chart-set {
    color: var(--theme-text, white);
    font-size: 0.85rem;
    font-weight: 750;
  }

  .chart-detail {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    svg * {
      transition: none !important;
    }
  }
</style>
