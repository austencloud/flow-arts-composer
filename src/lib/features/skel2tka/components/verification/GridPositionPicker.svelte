<!--
  GridPositionPicker - Visual compass rose for correcting hand positions

  Shows 8 cardinal/intercardinal positions + center in a circular layout.
  User clicks the correct position to override what the pipeline detected.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

  let {
    selected,
    hand,
    onSelect,
  }: {
    selected: GridLocation | null;
    hand: "left" | "right";
    onSelect: (location: GridLocation) => void;
  } = $props();

  const handColor = $derived(hand === "left" ? "var(--prop-blue, #3b82f6)" : "var(--prop-red, #ef4444)");

  interface GridButton {
    location: GridLocation;
    label: string;
    x: number;
    y: number;
  }

  // Positions arranged in a compass rose (0-100 coordinate space)
  const buttons: GridButton[] = [
    { location: "n" as GridLocation, label: "N", x: 50, y: 8 },
    { location: "ne" as GridLocation, label: "NE", x: 80, y: 20 },
    { location: "e" as GridLocation, label: "E", x: 92, y: 50 },
    { location: "se" as GridLocation, label: "SE", x: 80, y: 80 },
    { location: "s" as GridLocation, label: "S", x: 50, y: 92 },
    { location: "sw" as GridLocation, label: "SW", x: 20, y: 80 },
    { location: "w" as GridLocation, label: "W", x: 8, y: 50 },
    { location: "nw" as GridLocation, label: "NW", x: 20, y: 20 },
    { location: "c" as GridLocation, label: "C", x: 50, y: 50 },
  ];
</script>

<div class="grid-picker" role="radiogroup" aria-label={t('skel2tka_hand_position_picker', { hand })}>
  <div class="compass-rose">
    {#each buttons as btn}
      <button
        class="position-btn"
        class:selected={selected === btn.location}
        style="
          left: {btn.x}%;
          top: {btn.y}%;
          {selected === btn.location ? `border-color: ${handColor}; box-shadow: 0 0 8px color-mix(in srgb, ${handColor} 25%, transparent);` : ''}
        "
        onclick={() => onSelect(btn.location)}
        role="radio"
        aria-checked={selected === btn.location}
        aria-label={t('skel2tka_grid_position', { position: btn.label })}
      >
        {btn.label}
      </button>
    {/each}

    <!-- Crosshair lines -->
    <svg class="crosshairs" viewBox="0 0 100 100" aria-hidden="true">
      <line x1="50" y1="5" x2="50" y2="95" stroke="rgba(255,255,255,0.08)" stroke-width="0.5" />
      <line x1="5" y1="50" x2="95" y2="50" stroke="rgba(255,255,255,0.08)" stroke-width="0.5" />
      <line x1="18" y1="18" x2="82" y2="82" stroke="rgba(255,255,255,0.06)" stroke-width="0.5" />
      <line x1="82" y1="18" x2="18" y2="82" stroke="rgba(255,255,255,0.06)" stroke-width="0.5" />
    </svg>
  </div>
</div>

<style>
  .grid-picker {
    width: 140px;
    height: 140px;
    flex-shrink: 0;
  }

  .compass-rose {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .crosshairs {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .position-btn {
    position: absolute;
    transform: translate(-50%, -50%);
    width: 28px;
    height: 28px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #ffffff);
    font-size: 10px;
    font-weight: 600;
    font-family: monospace;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.15s, background 0.15s;
    z-index: 1;
  }

  /* Invisible hit-area overlay so the tap target meets the 44px floor
     without growing the visible 28px glyph. */
  .position-btn::before {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-radius: 50%;
  }

  .position-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.3);
  }

  .position-btn.selected {
    background: rgba(255, 255, 255, 0.15);
    font-weight: 700;
  }
</style>
