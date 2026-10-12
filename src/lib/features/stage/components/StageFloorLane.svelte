<script lang="ts">
  import type { StageFloorTravelSegment } from "../domain/stage-timeline-projection";

  export type FloorTravelHandle = "move" | "departure" | "arrival";

  interface Props {
    segments: readonly StageFloorTravelSegment[];
    currentBeat: number;
    pixelsPerBeat: number;
    selectedSegmentId?: string | null;
    draggingSegmentId?: string | null;
    interactive?: boolean;
    onSelect?: (segment: StageFloorTravelSegment) => void;
    onPointerStart?: (
      event: PointerEvent,
      segment: StageFloorTravelSegment,
      handle: FloorTravelHandle
    ) => void;
    onKeyAdjust?: (
      event: KeyboardEvent,
      segment: StageFloorTravelSegment,
      handle: FloorTravelHandle
    ) => void;
  }

  let {
    segments,
    currentBeat,
    pixelsPerBeat,
    selectedSegmentId = null,
    draggingSegmentId = null,
    interactive = true,
    onSelect = () => {},
    onPointerStart = () => {},
    onKeyAdjust = () => {},
  }: Props = $props();

  function stepDescription(segment: StageFloorTravelSegment): string {
    if (segment.distanceMeters < 0.01) return "hold position";
    if (segment.requestedStepCount !== null) {
      return segment.resolvedStepCount === null
        ? `${segment.requestedStepCount} steps, outside the supported range`
        : `${segment.requestedStepCount} steps`;
    }
    return segment.resolvedStepCount === null
      ? "automatic steps unavailable at this timing"
      : `${segment.resolvedStepCount} automatic steps`;
  }

  function visibleStepLabel(segment: StageFloorTravelSegment): string {
    if (segment.requestedStepCount !== null) {
      return `${segment.requestedStepCount} steps`;
    }
    return segment.resolvedStepCount === null
      ? "Auto"
      : `${segment.resolvedStepCount} auto steps`;
  }
</script>

<div class="floor-lane">
  <div class="hold-rail" aria-hidden="true"></div>
  {#each segments as segment (segment.id)}
    {@const width = Math.max(
      2,
      (segment.endBeat - segment.startBeat) * pixelsPerBeat
    )}
    {@const active =
      currentBeat >= segment.startBeat && currentBeat < segment.endBeat}
    {@const selected = selectedSegmentId === segment.id}
    {@const dragging = draggingSegmentId === segment.id}
    <div
      class="travel-group"
      class:active
      class:selected
      class:dragging
      class:stationary={segment.distanceMeters < 0.01}
      class:unsupported={segment.distanceMeters >= 0.01 &&
        segment.resolvedStepCount === null}
      style:left="{segment.startBeat * pixelsPerBeat}px"
      style:width="{width}px"
    >
      <button
        type="button"
        class="travel-control floor-travel-control"
        data-keyboard-shortcuts-ignore
        disabled={!interactive}
        aria-pressed={selected}
        aria-label="{segment.label}: depart on count {segment.startBeat}, arrive on count {segment.endBeat}, {stepDescription(
          segment
        )}. Drag to move the trip."
        title="Drag to move this trip"
        onpointerdown={(event) => onPointerStart(event, segment, "move")}
        onkeydown={(event) => onKeyAdjust(event, segment, "move")}
        onclick={(event) => {
          event.stopPropagation();
          onSelect(segment);
        }}
      >
        <span class:visible={width >= 96}>
          {segment.distanceMeters < 0.01
            ? `Hold at ${segment.label}`
            : `${segment.label} · ${Math.max(0, segment.endBeat - segment.startBeat)} counts · ${visibleStepLabel(segment)}`}
        </span>
      </button>

      {#if segment.distanceMeters >= 0.01}
        <button
          type="button"
          role="slider"
          class="travel-handle departure-handle floor-travel-control"
          data-keyboard-shortcuts-ignore
          disabled={!interactive}
          aria-label="Departure for {segment.label}"
          aria-valuemin={segment.minimumStartBeat}
          aria-valuemax={segment.endBeat}
          aria-valuenow={segment.startBeat}
          aria-valuetext="Departs on count {segment.startBeat}"
          title="Drag to change departure"
          onpointerdown={(event) => onPointerStart(event, segment, "departure")}
          onkeydown={(event) => onKeyAdjust(event, segment, "departure")}
          onclick={(event) => {
            event.stopPropagation();
            onSelect(segment);
          }}
        >
          <span aria-hidden="true"></span>
        </button>
        <button
          type="button"
          role="slider"
          class="travel-handle arrival-handle floor-travel-control"
          data-keyboard-shortcuts-ignore
          disabled={!interactive}
          aria-label="Arrival for {segment.label}"
          aria-valuemin={segment.startBeat}
          aria-valuemax={segment.maximumEndBeat}
          aria-valuenow={segment.endBeat}
          aria-valuetext="Arrives on count {segment.endBeat}"
          title="Drag to change arrival"
          onpointerdown={(event) => onPointerStart(event, segment, "arrival")}
          onkeydown={(event) => onKeyAdjust(event, segment, "arrival")}
          onclick={(event) => {
            event.stopPropagation();
            onSelect(segment);
          }}
        >
          <span aria-hidden="true">{segment.setIndex + 1}</span>
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .floor-lane {
    position: absolute;
    inset: 0;
    overflow: hidden;
  }

  .hold-rail {
    position: absolute;
    top: 50%;
    right: 0;
    left: 0;
    height: 2px;
    background: color-mix(in srgb, var(--performer-color) 28%, transparent);
    transform: translateY(-50%);
  }

  .travel-group {
    position: absolute;
    top: 50%;
    z-index: 1;
    height: 2.75rem;
    min-width: 2px;
    transform: translateY(-50%);
    transition:
      left var(--duration-normal) var(--ease-out, var(--ease-standard-out)),
      width var(--duration-normal) var(--ease-out, var(--ease-standard-out)),
      filter var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard);
  }

  .travel-group.dragging {
    transition: none;
  }

  .travel-control {
    position: absolute;
    inset: 0;
    display: flex;
    min-width: 100%;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--performer-color) 68%, white 8%);
    border-radius: 0.75rem;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--performer-color) 22%, #10111a),
      color-mix(in srgb, var(--performer-color) 76%, #10111a)
    );
    color: white;
    cursor: grab;
    touch-action: none;
  }

  .travel-control:active {
    cursor: grabbing;
  }

  .travel-control:focus-visible,
  .travel-handle:focus-visible {
    outline: 3px solid white;
    outline-offset: 2px;
  }

  .travel-group.stationary {
    opacity: 0.36;
  }

  .travel-group.unsupported .travel-control {
    border-style: dashed;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #10111a) 84%,
      var(--performer-color)
    );
  }

  .travel-group.active {
    filter: drop-shadow(0 0 0.45rem var(--performer-color));
  }

  .travel-group.selected {
    z-index: 4;
    filter: drop-shadow(0 0 0.6rem var(--performer-color));
  }

  .travel-control span {
    max-width: calc(100% - 3rem);
    overflow: hidden;
    font-size: max(0.875rem, var(--font-size-min, 0.875rem));
    font-variant-numeric: tabular-nums;
    font-weight: 750;
    opacity: 0;
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px black;
    transition: opacity var(--duration-fast) var(--ease-standard);
    white-space: nowrap;
  }

  .travel-control span.visible {
    opacity: 1;
  }

  .travel-handle {
    position: absolute;
    top: 50%;
    z-index: 5;
    display: grid;
    width: 2.75rem;
    height: 2.75rem;
    min-width: 2.75rem;
    padding: 0;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--performer-color);
    cursor: ew-resize;
    touch-action: none;
    transform: translate(-50%, -50%);
  }

  .departure-handle {
    left: 0;
  }

  .departure-handle span {
    display: block;
    width: 0.42rem;
    height: 1.9rem;
    border: 2px solid white;
    border-radius: 999px;
    background: var(--performer-color);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
  }

  .arrival-handle {
    left: 100%;
  }

  .arrival-handle span {
    display: grid;
    width: 1.9rem;
    height: 1.9rem;
    place-items: center;
    border: 2px solid var(--performer-color);
    border-radius: 999px;
    background: #0d0f17;
    color: var(--performer-color);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    font-weight: 800;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
  }

  @media (prefers-reduced-motion: reduce) {
    .travel-group,
    .travel-control span {
      transition-duration: 0s;
    }
  }
</style>
