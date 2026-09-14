<!--
  One performer in the Hand Tunnel rail.

  Shows the performer's two hand paths as mini glyphs in the same hues the
  canvas draws them, the six TnD buttons with their elemental icons, and the
  four placement controls: rotate a quarter turn, mirror (east/west, hands
  swap), flip (north/south), and phase (which beat of the loop the performer
  is on at beat 0, Ryan's "take two extra steps" move).
-->
<script lang="ts">
  import PathMiniViz from "$lib/features/hand-paths/hand-path-explorer/components/PathMiniViz.svelte";
  import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";
  import {
    TND_FAMILY_ID,
    TND_ORDER,
    type Performer,
    type Segment,
    type Tnd,
  } from "$lib/features/lab/hand-tunnel/domain/hand-tunnel-types";
  import type { HandPathCycle } from "$lib/features/lab/hand-tunnel/services/build-hand-tunnel-sequence";

  interface Props {
    performer: Performer;
    cycle: HandPathCycle;
    leftColor: string;
    rightColor: string;
    selected: boolean;
    positionLabel: string;
    canRemove: boolean;
    onSelect: () => void;
    onChange: (patch: Partial<Segment>) => void;
    onRemove: () => void;
  }

  const {
    performer,
    cycle,
    leftColor,
    rightColor,
    selected,
    positionLabel,
    canRemove,
    onSelect,
    onChange,
    onRemove,
  }: Props = $props();

  const segment = $derived(performer.segments[0]!);

  function pickTnd(tnd: Tnd) {
    onChange({ tnd });
  }

  function rotate() {
    onChange({ rotation: ((segment.rotation + 1) % 4) as Segment["rotation"] });
  }

  function phase(delta: number) {
    onChange({
      phase: ((((segment.phase + delta) % 4) + 4) % 4) as Segment["phase"],
    });
  }
</script>

<div
  class="card"
  class:selected
  role="group"
  aria-label={`Performer ${performer.label}`}
>
  <button
    class="head"
    onclick={onSelect}
    aria-pressed={selected}
    title={selected ? "Show everyone" : "Spotlight this performer"}
  >
    <span class="swatches" aria-hidden="true">
      <span class="swatch" style:background={leftColor}></span>
      <span class="swatch" style:background={rightColor}></span>
    </span>
    <span class="label">{performer.label}</span>
    <span class="pos">{positionLabel}</span>
  </button>

  <div class="paths" aria-hidden="true">
    <PathMiniViz locations={cycle.left} color={leftColor} dotRadius={4} />
    <PathMiniViz locations={cycle.right} color={rightColor} dotRadius={4} />
  </div>

  <div class="tnd" role="radiogroup" aria-label="Timing and direction">
    {#each TND_ORDER as tnd (tnd)}
      {@const element = TND_BY_FAMILY[TND_FAMILY_ID[tnd]]}
      <button
        class="tnd-btn"
        class:active={segment.tnd === tnd}
        role="radio"
        aria-checked={segment.tnd === tnd}
        style:--accent={element?.accentColor ?? "#888"}
        onclick={() => pickTnd(tnd)}
        title={element?.name ?? tnd}
      >
        {#if element}
          <img src={element.iconPath} alt="" width="18" height="18" />
        {/if}
        <span>{tnd.toUpperCase()}</span>
      </button>
    {/each}
  </div>

  <div class="placement">
    <button onclick={rotate} title="Rotate a quarter turn clockwise">
      Rotate {segment.rotation * 90}°
    </button>
    <button
      class:active={segment.mirror}
      aria-pressed={segment.mirror}
      onclick={() => onChange({ mirror: !segment.mirror })}
      title="Swap east and west; hands swap with them"
    >
      Mirror
    </button>
    <button
      class:active={segment.flip}
      aria-pressed={segment.flip}
      onclick={() => onChange({ flip: !segment.flip })}
      title="Swap north and south; hands stay"
    >
      Flip
    </button>
    <span class="phase">
      <button onclick={() => phase(-1)} title="Start one beat earlier">−</button
      >
      <span class="phase-val">phase {segment.phase}</span>
      <button onclick={() => phase(1)} title="Start one beat later">+</button>
    </span>
    {#if canRemove}
      <button
        class="remove"
        onclick={onRemove}
        aria-label={`Remove performer ${performer.label}`}
      >
        Remove
      </button>
    {/if}
  </div>
</div>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255 255 255 / 0.1));
    background: var(--theme-panel-bg, rgba(255 255 255 / 0.03));
  }
  .card.selected {
    border-color: rgba(255 255 255 / 0.45);
    background: rgba(255 255 255 / 0.07);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 4px 6px;
    background: none;
    border: 0;
    color: inherit;
    cursor: pointer;
    text-align: left;
    font: inherit;
  }
  .swatches {
    display: flex;
    gap: 3px;
  }
  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .label {
    font-weight: 600;
    font-size: 1rem;
  }
  .pos {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    opacity: 0.7;
  }

  .paths {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }
  .paths :global(svg) {
    width: 100%;
    height: auto;
    background: rgba(0 0 0 / 0.35);
    border-radius: 8px;
  }

  .tnd {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }
  .tnd-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 4px;
    border-radius: 8px;
    border: 1px solid rgba(255 255 255 / 0.12);
    background: rgba(255 255 255 / 0.05);
    color: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .tnd-btn img {
    object-fit: contain;
  }
  .tnd-btn.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 28%, transparent);
  }

  .placement {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
  }
  .placement button {
    padding: 5px 8px;
    border-radius: 8px;
    border: 1px solid rgba(255 255 255 / 0.12);
    background: rgba(255 255 255 / 0.05);
    color: inherit;
    font-size: 0.72rem;
    cursor: pointer;
  }
  .placement button.active {
    background: rgba(255 255 255 / 0.22);
    border-color: rgba(255 255 255 / 0.4);
  }
  .phase {
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .phase-val {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    padding: 0 4px;
    opacity: 0.8;
  }
  .remove {
    margin-left: auto;
    opacity: 0.6;
  }
  .remove:hover {
    opacity: 1;
  }
</style>
