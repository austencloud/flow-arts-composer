<script lang="ts">
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import type { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import SpatialInspector from "./SpatialInspector.svelte";
  import SpatialSculptureScene from "./SpatialSculptureScene.svelte";
  import SpatialStepTimeline from "./SpatialStepTimeline.svelte";
  import {
    LAYOUT_OPTIONS,
    LOCATION_ORDER,
    PRIMARY_PLANES,
    freshSpatialBeats,
    type BeatOrientation,
    type BeatTurns,
    type LayoutMode,
    type PrimaryPlane,
    type PropSide,
    type SculptureMotionMode,
    type SculpturePreset,
    type SpatialBeat,
  } from "./spatial-sculpture-model";

  let beats = $state<SpatialBeat[]>(freshSpatialBeats());
  let activeBeatIndex = $state(2);
  let activeHand = $state<PropSide>("left");
  let preset = $state<SculpturePreset>("acolyte");
  let layoutMode = $state<LayoutMode>("viewport");
  let motionMode = $state<SculptureMotionMode>("trace");
  let undulationDepth = $state(34);
  let undulationPeriod = $state(5);
  let showGrid = $state(true);
  let showNodes = $state(true);
  let showTrails = $state(true);
  let playing = $state(true);
  let nextBeatNumber = 9;

  const activeBeat = $derived(beats[activeBeatIndex] ?? null);

  function updateActiveBeat(update: (beat: SpatialBeat) => SpatialBeat): void {
    beats = beats.map((beat, index) =>
      index === activeBeatIndex ? update(beat) : beat
    );
  }

  function setPlane(plane: PrimaryPlane): void {
    updateActiveBeat((beat) => ({ ...beat, plane }));
  }

  function setOrientation(orientation: BeatOrientation): void {
    updateActiveBeat((beat) =>
      activeHand === "left"
        ? { ...beat, leftOrientation: orientation }
        : { ...beat, rightOrientation: orientation }
    );
  }

  function setTurns(turns: BeatTurns): void {
    updateActiveBeat((beat) => ({ ...beat, turns }));
  }

  function setLocation(location: GridLocation): void {
    updateActiveBeat((beat) =>
      activeHand === "left"
        ? { ...beat, leftLocation: location }
        : { ...beat, rightLocation: location }
    );
  }

  function selectBeat(index: number): void {
    playing = false;
    activeBeatIndex = Math.max(0, Math.min(index, beats.length - 1));
  }

  function followPlayhead(index: number): void {
    activeBeatIndex = Math.max(0, Math.min(index, beats.length - 1));
  }

  function selectPreviousBeat(): void {
    if (beats.length === 0) return;
    playing = false;
    activeBeatIndex = (activeBeatIndex - 1 + beats.length) % beats.length;
  }

  function selectNextBeat(): void {
    if (beats.length === 0) return;
    playing = false;
    activeBeatIndex = (activeBeatIndex + 1) % beats.length;
  }

  function addBeat(): void {
    const last = beats.at(-1);
    const plane = PRIMARY_PLANES[beats.length % PRIMARY_PLANES.length]!;
    const leftIndex = last
      ? Math.max(0, LOCATION_ORDER.indexOf(last.leftLocation))
      : 0;
    const rightIndex = last
      ? Math.max(0, LOCATION_ORDER.indexOf(last.rightLocation))
      : 4;

    const nextBeat: SpatialBeat = {
      id: `beat-${nextBeatNumber}`,
      plane,
      leftLocation: LOCATION_ORDER[(leftIndex + 1) % LOCATION_ORDER.length]!,
      rightLocation: LOCATION_ORDER[(rightIndex + 3) % LOCATION_ORDER.length]!,
      leftOrientation: last?.leftOrientation === "in" ? "out" : "in",
      rightOrientation: last?.rightOrientation === "in" ? "out" : "in",
      turns: "0",
    };

    nextBeatNumber += 1;
    beats = [...beats, nextBeat];
    activeBeatIndex = beats.length - 1;
    playing = false;
  }

  function removeActiveBeat(): void {
    if (beats.length <= 2) return;
    beats = beats.filter((_, index) => index !== activeBeatIndex);
    activeBeatIndex = Math.min(activeBeatIndex, beats.length - 1);
    playing = false;
  }

  function resetMockup(): void {
    beats = freshSpatialBeats();
    activeBeatIndex = 2;
    activeHand = "left";
    preset = "acolyte";
    motionMode = "trace";
    undulationDepth = 34;
    undulationPeriod = 5;
    showGrid = true;
    showNodes = true;
    showTrails = true;
    playing = true;
    nextBeatNumber = 9;
  }
</script>

<svelte:head>
  <title>Spatial Assemble Component Mockup</title>
</svelte:head>

<div class="mockup-page">
  <header class="topbar">
    <div class="product-heading">
      <span class="product-mark" aria-hidden="true">
        <i class="fas fa-cubes-stacked"></i>
      </span>
      <div class="heading-copy">
        <span class="breadcrumb">Assemble · Spatial</span>
        <div class="title-line">
          <h1>Motion Sculpture</h1>
          <span class="prototype-badge">Layout prototype</span>
        </div>
        <p>Build one loop across three planes, then watch the props draw it.</p>
      </div>
    </div>

    <div class="topbar-actions">
      <div class="layout-picker" aria-label="Mockup density">
        <SegmentedControl
          options={LAYOUT_OPTIONS}
          value={layoutMode}
          onchange={(value) => (layoutMode = value)}
          color="accent"
          size="sm"
        />
      </div>
      <PanelButton variant="secondary" onclick={resetMockup}>
        <i class="fas fa-arrow-rotate-left" aria-hidden="true"></i>
        <span>Reset</span>
      </PanelButton>
    </div>
  </header>

  <main class="workspace" data-layout={layoutMode}>
    <section class="viewport-panel" aria-label="Orbitable sculpture viewport">
      <SpatialSculptureScene
        {beats}
        {activeBeatIndex}
        {activeHand}
        {preset}
        {showGrid}
        {showNodes}
        {showTrails}
        {playing}
        {motionMode}
        {undulationDepth}
        {undulationPeriod}
        onbeatselect={selectBeat}
        onplayheadbeat={followPlayhead}
        onlocationselect={setLocation}
      />
    </section>

    <aside class="inspector-panel" aria-label="Selected beat inspector">
      <div class="panel-heading">
        <div>
          <span class="panel-eyebrow">Inspector</span>
          <h2>Shape this beat</h2>
        </div>
        <i class="fas fa-sliders" aria-hidden="true"></i>
      </div>

      {#if activeBeat}
        <SpatialInspector
          beat={activeBeat}
          beatIndex={activeBeatIndex}
          beatCount={beats.length}
          {activeHand}
          {preset}
          {motionMode}
          {undulationDepth}
          {undulationPeriod}
          {showGrid}
          {showNodes}
          {showTrails}
          onhandchange={(side) => (activeHand = side)}
          onplanechange={setPlane}
          onorientationchange={setOrientation}
          onturnchange={setTurns}
          onpresetchange={(value) => (preset = value)}
          onmotionmodechange={(value) => (motionMode = value)}
          onundulationdepthchange={(value) => (undulationDepth = value)}
          onundulationperiodchange={(value) => (undulationPeriod = value)}
          ontogglegrid={() => (showGrid = !showGrid)}
          ontogglenodes={() => (showNodes = !showNodes)}
          ontoggletrails={() => (showTrails = !showTrails)}
          onremovebeat={removeActiveBeat}
        />
      {/if}
    </aside>

    <div class="timeline-seat">
      <SpatialStepTimeline
        {beats}
        {activeBeatIndex}
        {layoutMode}
        {playing}
        onbeatselect={selectBeat}
        onplaytoggle={() => (playing = !playing)}
        onprevious={selectPreviousBeat}
        onnext={selectNextBeat}
        onaddbeat={addBeat}
      />
    </div>
  </main>
</div>

<style>
  .mockup-page {
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    width: 100%;
    height: 100dvh;
    min-height: 720px;
    padding: clamp(12px, 1.4vw, 22px);
    overflow: hidden;
    background:
      radial-gradient(
        circle at 22% 8%,
        rgba(71, 58, 150, 0.23),
        transparent 34%
      ),
      radial-gradient(
        circle at 82% 88%,
        rgba(22, 91, 124, 0.17),
        transparent 33%
      ),
      var(--theme-background, #080810);
    color: var(--theme-text, #fff);
    font-family:
      Inter,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    container: mockup / inline-size;
  }

  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-lg, 18px);
    background: var(--theme-panel-bg, rgba(17, 17, 28, 0.96));
  }

  .product-heading,
  .title-line,
  .topbar-actions {
    display: flex;
    align-items: center;
  }

  .product-heading {
    gap: 12px;
    min-width: 0;
  }

  .product-mark {
    display: grid;
    place-items: center;
    width: 46px;
    height: 46px;
    flex: 0 0 auto;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b6cff) 52%, transparent);
    border-radius: 14px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 16%,
      transparent
    );
    color: var(--theme-accent-strong, #ad95ff);
    font-size: 19px;
  }

  .heading-copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .breadcrumb,
  .panel-eyebrow {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  .title-line {
    gap: 9px;
  }

  h1,
  h2,
  p {
    margin: 0;
  }

  h1 {
    color: var(--theme-text, #fff);
    font-size: clamp(1.15rem, 1.7cqw, 1.55rem);
    line-height: 1.12;
  }

  .heading-copy p {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.63));
    font-size: var(--font-size-compact, 12px);
  }

  .prototype-badge {
    min-width: 12ch;
    padding: 4px 7px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    text-align: center;
  }

  .topbar-actions {
    gap: 9px;
    flex: 0 0 auto;
  }

  .layout-picker {
    width: 250px;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(306px, 330px);
    grid-template-rows: minmax(420px, 1fr) 158px;
    gap: 12px;
    min-width: 0;
    min-height: 0;
  }

  .workspace[data-layout="studio"] {
    grid-template-rows: minmax(380px, 1fr) 246px;
  }

  .viewport-panel,
  .inspector-panel,
  .timeline-seat {
    min-width: 0;
    min-height: 0;
  }

  .viewport-panel {
    grid-column: 1;
    grid-row: 1;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-lg, 18px);
    background: var(--theme-card-bg, #0b0b14);
    box-shadow: 0 24px 72px rgba(0, 0, 0, 0.32);
    overflow: hidden;
    container: viewport / inline-size;
  }

  .inspector-panel {
    grid-column: 2;
    grid-row: 1 / span 2;
    overflow-y: auto;
    padding: 13px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-lg, 18px);
    background: var(--theme-panel-bg, #11111b);
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      transparent;
    container: inspector / inline-size;
  }

  .panel-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 52px;
    margin-bottom: 10px;
    padding: 0 3px;
  }

  .panel-heading h2 {
    margin-top: 2px;
    color: var(--theme-text, #fff);
    font-size: 1rem;
  }

  .panel-heading > i {
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-radius: 13px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
  }

  .timeline-seat {
    grid-column: 1;
    grid-row: 2;
  }

  @container mockup (max-width: 980px) {
    .mockup-page {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }

    .workspace,
    .workspace[data-layout="studio"] {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(480px, 64dvh) auto auto;
    }

    .viewport-panel {
      grid-column: 1;
      grid-row: 1;
    }

    .timeline-seat {
      grid-column: 1;
      grid-row: 2;
      min-height: 176px;
    }

    .inspector-panel {
      grid-column: 1;
      grid-row: 3;
      max-height: none;
      overflow: visible;
    }
  }

  @container mockup (max-width: 700px) {
    .topbar {
      align-items: stretch;
      flex-direction: column;
    }

    .topbar-actions {
      justify-content: space-between;
    }

    .layout-picker {
      width: min(270px, 100%);
    }

    .prototype-badge {
      display: none;
    }
  }

  @container mockup (max-width: 480px) {
    .mockup-page {
      padding: 8px;
    }

    .product-mark {
      display: none;
    }

    .heading-copy p {
      max-width: 32ch;
    }

    .topbar-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .layout-picker {
      width: 100%;
    }

    .workspace,
    .workspace[data-layout="studio"] {
      grid-template-rows: minmax(440px, 66dvh) auto auto;
    }
  }
</style>
