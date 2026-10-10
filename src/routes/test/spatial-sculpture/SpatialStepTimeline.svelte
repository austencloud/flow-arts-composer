<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import {
    PLANE_LABELS,
    type LayoutMode,
    type SpatialBeat,
  } from "./spatial-sculpture-model";

  interface Props {
    beats: SpatialBeat[];
    activeBeatIndex: number;
    layoutMode: LayoutMode;
    playing: boolean;
    onbeatselect: (index: number) => void;
    onplaytoggle: () => void;
    onprevious: () => void;
    onnext: () => void;
    onaddbeat: () => void;
  }

  let {
    beats,
    activeBeatIndex,
    layoutMode,
    playing,
    onbeatselect,
    onplaytoggle,
    onprevious,
    onnext,
    onaddbeat,
  }: Props = $props();
</script>

<section
  class="timeline-shell"
  data-layout={layoutMode}
  aria-label="Spatial beat timeline"
>
  <header class="timeline-header">
    <div class="timeline-title">
      <span class="eyebrow">Loop path</span>
      <strong>{beats.length} beats</strong>
    </div>

    <div class="timeline-actions">
      <div class="transport" aria-label="Playback controls">
        <button type="button" aria-label="Previous beat" onclick={onprevious}>
          <i class="fas fa-step-backward" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="play-button"
          aria-label={playing ? "Pause sculpture" : "Play sculpture"}
          aria-pressed={playing}
          onclick={onplaytoggle}
        >
          <i class="fas {playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"
          ></i>
        </button>
        <button type="button" aria-label="Next beat" onclick={onnext}>
          <i class="fas fa-step-forward" aria-hidden="true"></i>
        </button>
      </div>

      <PanelButton variant="primary" onclick={onaddbeat}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        <span>Add beat</span>
      </PanelButton>
    </div>
  </header>

  <div class="timeline-scroll">
    <div class="beat-row">
      <div class="start-card" aria-label="Loop start">
        <i class="fas fa-flag-checkered" aria-hidden="true"></i>
        <span>Start</span>
      </div>

      {#each beats as beat, index (beat.id)}
        <button
          type="button"
          class="beat-card"
          class:active={index === activeBeatIndex}
          aria-label={`Edit beat ${index + 1}, ${PLANE_LABELS[beat.plane]} plane`}
          aria-pressed={index === activeBeatIndex}
          onclick={() => onbeatselect(index)}
        >
          <span class="beat-topline">
            <span class="beat-number">{index + 1}</span>
            <span class="plane-badge" data-plane={beat.plane}>
              {PLANE_LABELS[beat.plane]}
            </span>
          </span>

          <span class="motion-row blue">
            <span class="motion-dot" aria-hidden="true"></span>
            <span class="motion-line" aria-hidden="true"></span>
            <span class="motion-location"
              >{beat.leftLocation.toUpperCase()}</span
            >
            <span class="motion-orientation">{beat.leftOrientation}</span>
          </span>

          <span class="motion-row red">
            <span class="motion-dot" aria-hidden="true"></span>
            <span class="motion-line" aria-hidden="true"></span>
            <span class="motion-location">{beat.rightLocation.toUpperCase()}</span
            >
            <span class="motion-orientation">{beat.rightOrientation}</span>
          </span>

          <span class="turn-value">{beat.turns} turn</span>
        </button>
      {/each}
    </div>
  </div>
</section>

<style>
  .timeline-shell {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    min-width: 0;
    min-height: 0;
    padding: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-lg, 18px);
    background: var(--theme-panel-bg, #11111b);
    container: timeline / inline-size;
  }

  .timeline-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .timeline-title {
    display: grid;
    gap: 1px;
    min-width: 8ch;
  }

  .timeline-title strong {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-variant-numeric: tabular-nums;
  }

  .eyebrow {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    letter-spacing: 0.065em;
    text-transform: uppercase;
  }

  .timeline-actions,
  .transport {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .transport button {
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--settings-radius-sm, 10px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  .transport button:hover,
  .transport button:focus-visible {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, #fff);
  }

  .transport button:focus-visible,
  .beat-card:focus-visible {
    outline: 2px solid var(--theme-accent, #8b6cff);
    outline-offset: 2px;
  }

  .transport .play-button {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 62%,
      transparent
    );
    color: var(--theme-accent-strong, #a88bff);
  }

  .timeline-scroll {
    min-width: 0;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 2px 2px 7px;
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      transparent;
  }

  .beat-row {
    display: flex;
    align-items: stretch;
    gap: 8px;
    width: max-content;
    min-height: 100%;
  }

  .start-card,
  .beat-card {
    flex: 0 0 auto;
    min-height: 96px;
    border-radius: var(--settings-radius-md, 12px);
  }

  .start-card {
    display: grid;
    place-items: center;
    align-content: center;
    gap: 7px;
    width: 72px;
    border: 1px dashed var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.56));
    font-size: var(--font-size-compact, 12px);
  }

  .beat-card {
    position: relative;
    display: grid;
    grid-template-rows: auto auto auto auto;
    gap: 6px;
    width: 118px;
    padding: 9px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
    color: var(--theme-text, #fff);
    cursor: pointer;
    text-align: left;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      box-shadow var(--duration-fast, 150ms) ease;
  }

  .beat-card::before {
    content: "";
    position: absolute;
    top: 50%;
    right: -9px;
    width: 9px;
    height: 1px;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
  }

  .beat-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.075));
  }

  .beat-card.active {
    border-color: var(--theme-accent, #8b6cff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 13%,
      var(--theme-card-bg, #191925)
    );
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--theme-accent, #8b6cff) 28%, transparent);
  }

  .beat-topline,
  .motion-row {
    display: flex;
    align-items: center;
  }

  .beat-topline {
    justify-content: space-between;
    gap: 7px;
  }

  .beat-number {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 18%,
      transparent
    );
    font-size: var(--font-size-compact, 12px);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  .plane-badge {
    min-width: 5.5ch;
    padding: 3px 6px;
    border-radius: 999px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    text-align: center;
  }

  .plane-badge[data-plane="wall"] {
    background: rgba(168, 85, 247, 0.16);
    color: #cf9cff;
  }

  .plane-badge[data-plane="wheel"] {
    background: rgba(56, 169, 255, 0.16);
    color: #7ec8ff;
  }

  .plane-badge[data-plane="floor"] {
    background: rgba(53, 211, 153, 0.16);
    color: #72e7ba;
  }

  .motion-row {
    gap: 5px;
    min-width: 0;
    font-size: var(--font-size-compact, 12px);
  }

  .motion-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: currentColor;
  }

  .motion-line {
    width: 18px;
    height: 2px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.62;
  }

  .motion-location {
    min-width: 2.5ch;
    color: var(--theme-text, #fff);
    font-weight: 700;
  }

  .motion-orientation {
    margin-left: auto;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
  }

  .motion-row.blue {
    color: var(--prop-blue, #38a9ff);
  }

  .motion-row.red {
    color: var(--prop-red, #ff516a);
  }

  .turn-value {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .timeline-shell[data-layout="studio"] .beat-card {
    width: 150px;
    min-height: 124px;
    padding: 12px;
    gap: 9px;
  }

  .timeline-shell[data-layout="studio"] .start-card {
    width: 88px;
    min-height: 124px;
  }

  @container timeline (max-width: 620px) {
    .timeline-header {
      align-items: flex-start;
    }

    .timeline-actions {
      align-items: stretch;
    }

    .timeline-actions :global(.panel-btn) {
      padding-inline: 12px;
    }
  }

  @container timeline (max-width: 470px) {
    .timeline-header {
      display: grid;
      grid-template-columns: 1fr;
    }

    .timeline-actions {
      justify-content: space-between;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .transport button,
    .beat-card {
      transition: none;
    }
  }
</style>
