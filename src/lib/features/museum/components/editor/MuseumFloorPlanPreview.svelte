<script lang="ts">
  import type {
    MuseumGrid,
    FurnitureDefinition,
  } from "../../domain/museum-grid-types";
  import type {
    MuseumFloorPlanLayer,
    MuseumFloorPlanPoint,
    MuseumFloorPlanZone,
  } from "../../domain/museum-floor-plan-types";
  import { parseTileKey } from "../../domain/museum-grid-types";
  import MuseumTileRenderer from "../game/MuseumTileRenderer.svelte";
  import "../museum-theme.css";

  interface Props {
    grid: MuseumGrid;
    zones: MuseumFloorPlanZone[];
    circulation: MuseumFloorPlanPoint[];
    layer?: MuseumFloorPlanLayer;
    ariaLabel?: string;
    caption?: string;
  }

  let {
    grid,
    zones,
    circulation,
    layer = "program",
    ariaLabel = "Entrance lobby floor plan",
    caption = "One square is half a metre. Gold numbers identify the seven program zones. The pale line shows the intended visitor route from the south doors to the cave threshold.",
  }: Props = $props();

  const furnitureIcons: Record<FurnitureDefinition["role"], string> = {
    bench: "fa-chair",
    pedestal: "fa-cube",
    bookshelf: "fa-book",
    lamp: "fa-lightbulb",
    plant: "fa-leaf",
    desk: "fa-desktop",
    "desk-chair": "fa-chair",
    trashcan: "fa-trash-can",
    "coat-rack": "fa-shirt",
    rug: "fa-border-all",
    scaffolding: "fa-person-digging",
    sign: "fa-sign-hanging",
  };

  let tileEntries = $derived.by(() => {
    return Array.from(grid.tiles, ([key, tile]) => ({
      key,
      tile,
      ...parseTileKey(key),
    }));
  });

  let planStyle = $derived(
    `--grid-columns: ${grid.width}; --grid-rows: ${grid.height}; aspect-ratio: ${grid.width} / ${grid.height};`
  );

  let tileGridStyle = $derived(
    `grid-template-columns: repeat(${grid.width}, minmax(0, 1fr)); grid-template-rows: repeat(${grid.height}, minmax(0, 1fr));`
  );

  let circulationPoints = $derived(
    circulation.map((point) => `${point.x},${point.y}`).join(" ")
  );

  function zoneStyle(zone: MuseumFloorPlanZone): string {
    return [
      `left: ${(zone.x / grid.width) * 100}%`,
      `top: ${(zone.y / grid.height) * 100}%`,
      `width: ${(zone.width / grid.width) * 100}%`,
      `height: ${(zone.height / grid.height) * 100}%`,
    ].join("; ");
  }

  function pointStyle(point: { x: number; y: number }): string {
    return `left: ${(point.x / grid.width) * 100}%; top: ${(point.y / grid.height) * 100}%;`;
  }
</script>

<figure
  class="floor-plan museum-gold-scope"
  class:program-layer={layer === "program"}
  aria-label={ariaLabel}
>
  <div class="plan-grid" style={planStyle}>
    <div class="tile-grid" style={tileGridStyle} aria-hidden="true">
      {#each tileEntries as entry (entry.key)}
        <div
          class="tile-cell"
          style={`grid-column: ${entry.x + 1}; grid-row: ${entry.y + 1};`}
        >
          <MuseumTileRenderer tile={entry.tile} />
        </div>
      {/each}
    </div>

    {#if layer === "program"}
      <svg
        class="circulation"
        viewBox={`0 0 ${grid.width} ${grid.height}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <marker
            id="circulation-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        <polyline
          points={circulationPoints}
          marker-end="url(#circulation-arrow)"
        />
      </svg>

      {#each zones as zone (zone.id)}
        <div
          class="program-zone zone-{zone.tone}"
          style={zoneStyle(zone)}
          aria-label={`${zone.number}. ${zone.title}: ${zone.description}`}
        >
          <span class="zone-number">{zone.number}</span>
          <span class="zone-title">{zone.title}</span>
        </div>
      {/each}
    {/if}

    {#each grid.furniture as item (item.id)}
      <div
        class="furniture-marker"
        style={pointStyle({ x: item.tileX + 0.5, y: item.tileY + 0.5 })}
        title={item.role}
        aria-label={`Furniture: ${item.role}`}
      >
        <i class="fa-solid {furnitureIcons[item.role]}" aria-hidden="true"></i>
      </div>
    {/each}

    <div
      class="spawn-marker"
      style={pointStyle({ x: grid.spawn.x + 0.5, y: grid.spawn.y + 0.5 })}
      aria-label="Visitor spawn point"
      title="Visitor spawn"
    >
      <i class="fa-solid fa-arrow-up" aria-hidden="true"></i>
    </div>

    <div class="north-marker" aria-hidden="true">
      <span>N</span>
      <i class="fa-solid fa-arrow-up"></i>
    </div>
  </div>
  <figcaption>{caption}</figcaption>
</figure>

<style>
  .floor-plan {
    --plan-paper: #0c0b0a;
    --plan-line: rgba(234, 221, 190, 0.18);
    --plan-path: rgba(245, 225, 172, 0.9);
    margin: 0;
    inline-size: 100%;
    container: museum-plan / inline-size;
  }

  .plan-grid {
    position: relative;
    inline-size: 100%;
    overflow: hidden;
    background:
      linear-gradient(
        to right,
        rgba(255, 255, 255, 0.018) 1px,
        transparent 1px
      ),
      linear-gradient(
        to bottom,
        rgba(255, 255, 255, 0.018) 1px,
        transparent 1px
      ),
      radial-gradient(
        circle at 50% 35%,
        rgba(200, 180, 140, 0.07),
        transparent 52%
      ),
      var(--plan-paper);
    border: 1px solid var(--museum-gold-25);
    border-radius: clamp(0.5rem, 1.2cqi, 1rem);
    box-shadow:
      0 1.5rem 5rem rgba(0, 0, 0, 0.42),
      inset 0 0 0 1px rgba(255, 255, 255, 0.025);
    isolation: isolate;
  }

  /* Its own rule: in one rule with the var() shorthand above, replays lose that shorthand. */
  .plan-grid {
    background-size:
      calc(100% / var(--grid-columns)) calc(100% / var(--grid-rows)),
      calc(100% / var(--grid-columns)) calc(100% / var(--grid-rows)),
      auto,
      auto;
  }

  .tile-grid {
    position: absolute;
    inset: 0;
    display: grid;
    contain: strict;
  }

  .tile-cell {
    min-inline-size: 0;
    min-block-size: 0;
  }

  .circulation {
    position: absolute;
    inset: 0;
    z-index: 2;
    inline-size: 100%;
    block-size: 100%;
    pointer-events: none;
    overflow: visible;
  }

  .circulation polyline {
    fill: none;
    stroke: var(--plan-path);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-dasharray: 5 4;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 4px rgba(245, 225, 172, 0.28));
  }

  .circulation marker path {
    fill: var(--plan-path);
  }

  .program-zone {
    position: absolute;
    z-index: 3;
    display: flex;
    align-items: flex-start;
    gap: clamp(0.2rem, 0.55cqi, 0.45rem);
    min-inline-size: 0;
    padding: clamp(0.16rem, 0.55cqi, 0.45rem);
    border: 1px solid var(--zone-line);
    background: var(--zone-fill);
    box-shadow: inset 0 0 1.5rem rgba(0, 0, 0, 0.2);
    pointer-events: none;
    container: plan-zone / inline-size;
  }

  .zone-arrival {
    --zone-fill: rgba(128, 157, 172, 0.18);
    --zone-line: rgba(164, 203, 221, 0.58);
  }

  .zone-anchor {
    --zone-fill: rgba(202, 160, 75, 0.2);
    --zone-line: rgba(242, 204, 124, 0.72);
  }

  .zone-social {
    --zone-fill: rgba(121, 154, 113, 0.2);
    --zone-line: rgba(168, 207, 157, 0.65);
  }

  .zone-service {
    --zone-fill: rgba(111, 132, 164, 0.22);
    --zone-line: rgba(159, 183, 220, 0.66);
  }

  .zone-exhibit {
    --zone-fill: rgba(117, 96, 158, 0.24);
    --zone-line: rgba(181, 153, 229, 0.7);
  }

  .zone-retail {
    --zone-fill: rgba(166, 105, 92, 0.22);
    --zone-line: rgba(224, 154, 137, 0.68);
  }

  .zone-threshold {
    --zone-fill: rgba(92, 75, 58, 0.34);
    --zone-line: rgba(198, 154, 105, 0.72);
  }

  .zone-number {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    inline-size: clamp(0.85rem, 2.4cqi, 1.55rem);
    aspect-ratio: 1;
    border-radius: 50%;
    background: #e8d6aa;
    color: #15120d;
    font-size: clamp(0.52rem, 1.35cqi, 0.78rem);
    font-weight: 800;
    line-height: 1;
    box-shadow: 0 0.15rem 0.5rem rgba(0, 0, 0, 0.35);
  }

  .zone-title {
    overflow: hidden;
    color: rgba(255, 250, 238, 0.96);
    font-size: clamp(0.5rem, 1.4cqi, 0.82rem);
    font-weight: 680;
    line-height: 1.15;
    text-wrap: balance;
  }

  .furniture-marker,
  .spawn-marker {
    position: absolute;
    z-index: 4;
    display: grid;
    place-items: center;
    transform: translate(-50%, -50%);
    border-radius: 50%;
  }

  .furniture-marker {
    inline-size: clamp(0.42rem, 1.8cqi, 1rem);
    aspect-ratio: 1;
    border: 1px solid rgba(245, 230, 192, 0.7);
    background: rgba(20, 17, 12, 0.9);
    color: #ead8ac;
    font-size: clamp(0.25rem, 0.8cqi, 0.52rem);
  }

  .spawn-marker {
    inline-size: clamp(0.72rem, 2.6cqi, 1.4rem);
    aspect-ratio: 1;
    border: 1px solid rgba(181, 225, 238, 0.86);
    background: #17313a;
    color: #c6edf7;
    font-size: clamp(0.38rem, 1cqi, 0.66rem);
    box-shadow: 0 0 0 0.18rem rgba(126, 202, 222, 0.12);
  }

  .north-marker {
    position: absolute;
    inset-block-start: clamp(0.4rem, 1.5cqi, 1rem);
    inset-inline-start: clamp(0.4rem, 1.5cqi, 1rem);
    z-index: 5;
    display: grid;
    place-items: center;
    color: rgba(247, 232, 196, 0.86);
    font-size: clamp(0.48rem, 1.25cqi, 0.78rem);
    font-weight: 800;
    line-height: 1;
    text-shadow: 0 0.1rem 0.4rem #000;
  }

  .north-marker i {
    margin-block-start: 0.2rem;
    font-size: 0.8em;
  }

  figcaption {
    margin-block-start: 0.65rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.45;
  }

  @container museum-plan (width < 34rem) {
    .program-layer .tile-grid {
      display: none;
    }

    .zone-title {
      display: none;
    }

    .program-zone {
      border-width: 0.5px;
    }

    figcaption {
      font-size: 0.68rem;
    }
  }

  @container plan-zone (width < 5.5rem) {
    .zone-title {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.floor-plan .tile-torch .tile-icon) {
      animation: none;
    }
  }
</style>
