<script lang="ts">
  /**
   * First Fire coal-room look-dev harness.
   *
   * Art direction only. Nothing here is Gate 3 evidence and nothing here is
   * registered to a graybox camera - it exists so the coal vocabulary can be
   * chosen before it is committed to the Cinder Court.
   */
  import { browser } from "$app/env";
  import { Canvas } from "@threlte/core";
  import { AgXToneMapping } from "three";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FirstFireCoalLookdev from "./FirstFireCoalLookdev.svelte";
  import { LOOKDEV_STATIONS, type LookdevStationId } from "./lookdev-stations";

  type View = LookdevStationId | "lineup";

  const initialView = browser
    ? ((new URLSearchParams(window.location.search).get("view") ?? "lineup") as View)
    : "lineup";

  let view = $state<View>(initialView);
  let showScaleFigure = $state(true);
  let wallTreatment = $state<"shader" | "lumps">("lumps");
  let bounce = $state(0.32);

  const wallOptions = [
    { value: "shader" as const, label: "Crust shader" },
    { value: "lumps" as const, label: "Coal lumps" },
  ];

  const options = [
    { value: "lineup" as View, label: "Lineup" },
    ...LOOKDEV_STATIONS.map((station) => ({
      value: station.id as View,
      label: station.label,
    })),
  ];

  const activeStation = $derived(
    view === "lineup" ? null : LOOKDEV_STATIONS.find((s) => s.id === view)!
  );
</script>

<svelte:head>
  <title>First Fire · coal look-dev</title>
</svelte:head>

<div class="stage">
  <Canvas toneMapping={AgXToneMapping} toneMappingExposure={1}>
    <FirstFireCoalLookdev station={view} {showScaleFigure} {wallTreatment} {bounce} />
  </Canvas>

  <div class="hud hud--top">
    <p class="eyebrow">First Fire · coal room art direction</p>
    <SegmentedControl
      {options}
      value={view}
      onchange={(next) => (view = next)}
      size="sm"
      ariaLabel="Look-dev station"
    />
    <div class="knobs">
      <button
        class="toggle"
        type="button"
        aria-pressed={showScaleFigure}
        onclick={() => (showScaleFigure = !showScaleFigure)}
      >
        <span class="toggle-dot" class:on={showScaleFigure}></span>
        1.75 m figure
      </button>

      <SegmentedControl
        options={wallOptions}
        value={wallTreatment}
        onchange={(next) => (wallTreatment = next)}
        size="sm"
        ariaLabel="Coal wall treatment"
      />

      <label class="slider">
        Coal bounce
        <input
          type="range"
          min="0"
          max="0.6"
          step="0.01"
          bind:value={bounce}
          aria-label="Coal bounce light"
        />
        <span class="slider-value">{bounce.toFixed(2)}</span>
      </label>
    </div>
  </div>

  <div class="hud hud--bottom">
    {#if activeStation}
      <p class="question">{activeStation.question}</p>
      <p class="provenance">{activeStation.provenance}</p>
    {:else}
      <p class="question">
        Five coal studies at body scale. Same basalt, same iron, same lumps:
        every photon is still thrown by something burning.
      </p>
      <p class="provenance">
        Drag to orbit. Pick a station to stand in front of it.
      </p>
    {/if}
  </div>
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    background: #050303;
  }

  .hud {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
    padding: 0.85rem 1.15rem;
    border-radius: 0.85rem;
    background: rgb(12 6 4 / 0.82);
    border: 1px solid rgb(120 62 34 / 0.4);
    backdrop-filter: blur(10px);
    /* Never full-bleed: a control row this short must size to its labels. */
    width: max-content;
    max-width: min(56rem, 92vw);
    pointer-events: auto;
  }

  .hud--top {
    top: 1rem;
  }

  .hud--bottom {
    bottom: 1rem;
    text-align: center;
  }

  .eyebrow {
    margin: 0;
    font-size: 0.7rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #c08a63;
  }

  .question {
    margin: 0;
    font-size: 0.95rem;
    color: #fff3dc;
    max-width: 48rem;
  }

  .provenance {
    margin: 0;
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    color: #9c7a66;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0 0.9rem;
    border-radius: 0.6rem;
    border: 1px solid rgb(120 62 34 / 0.5);
    background: rgb(24 12 8 / 0.9);
    color: #e6c3a8;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .toggle-dot {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    border: 1px solid #7a4527;
    background: transparent;
  }

  .toggle-dot.on {
    background: #ff7a33;
    border-color: #ff7a33;
  }

  .knobs {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: center;
  }

  .slider {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 44px;
    padding: 0 0.9rem;
    border-radius: 0.6rem;
    border: 1px solid rgb(120 62 34 / 0.5);
    background: rgb(24 12 8 / 0.9);
    color: #e6c3a8;
    font-size: 0.8rem;
  }

  .slider input {
    width: 8rem;
    accent-color: #ff7a33;
  }

  .slider-value {
    font-family: ui-monospace, monospace;
    font-size: 0.72rem;
    color: #c08a63;
    /* Reserve the widest value so changing it never shoves the row. */
    min-width: 2.6ch;
    font-variant-numeric: tabular-nums;
  }
</style>
