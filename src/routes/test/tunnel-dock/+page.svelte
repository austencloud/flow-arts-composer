<!--
  Tunnel dock harness: the real TunnelArtSettings in its phone layout over a
  live tunnel controller, framed at the Fold's inner and cover screens and the
  phone tiers. The stage is a placeholder; the dock, its Formation tray and the
  Colors/Performers drills are the live components. Real components in a test
  page, per visualization-routing.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import TunnelArtSettings from "#lib/shared/sequence-viewer/components/art-settings/TunnelArtSettings.svelte";
  import { TunnelViewController } from "#lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte.js";
  import { generationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  type Device = { id: string; label: string; w: number; h: number };
  const DEVICES: Device[] = [
    { id: "fold-inner", label: "Fold inner", w: 707, h: 772 },
    { id: "fold-cover", label: "Fold cover", w: 412, h: 915 },
    { id: "se", label: "iPhone SE", w: 375, h: 667 },
    { id: "landscape", label: "Landscape", w: 960, h: 412 },
  ];
  let deviceId = $state(
    new URLSearchParams(location.search).get("device") ?? "fold-inner"
  );
  const device = $derived(
    DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0]!
  );

  let base = $state<SequenceData | null>(null);
  let status = $state("generating sample sequence…");
  onMount(async () => {
    try {
      base = await generationOrchestrator.generateSequence({
        length: 8,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF,
        difficulty: DifficultyLevel.INTERMEDIATE,
        constraintPreset: "smooth",
      });
      status = `${base.steps.length}-step sample`;
    } catch (e) {
      status = String(e instanceof Error ? e.message : e);
    }
  });

  const controller = new TunnelViewController({
    getSequence: () => base,
    persistViewState: false,
  });
  let bpm = $state(60);
  let isPlaying = $state(false);
</script>

<div class="page">
  <header class="harness">
    <div class="title">Tunnel dock · {status}</div>
    <div class="seg">
      {#each DEVICES as d (d.id)}
        <button
          class:active={deviceId === d.id}
          onclick={() => (deviceId = d.id)}>{d.label}</button
        >
      {/each}
    </div>
  </header>

  <div class="phone" style:width="{device.w}px" style:height="{device.h}px">
    <div class="viewer">
      <div class="hero"><span class="hero-tag">tunnel stage</span></div>
      <TunnelArtSettings
        {controller}
        layout="bottom"
        bottomStartsOpen
        onExport={() => {}}
        showExport
        onSaveTunnel={() => {}}
        {bpm}
        playbackMode="continuous"
        {isPlaying}
        onBpmChange={(v) => (bpm = v)}
        onPlaybackModeChange={() => {}}
        onPlaybackToggle={() => (isPlaying = !isPlaying)}
        leftPropType={String(PropType.STAFF)}
        onPropChange={() => {}}
        exporting={false}
        reduceMotion={false}
        sequence={base ?? undefined}
      />
    </div>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #07070f;
    color: #e2e8f0;
  }
  .harness {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
  }
  .title {
    font-size: 0.85rem;
    font-weight: 600;
    opacity: 0.7;
  }
  .seg {
    display: flex;
    gap: 4px;
  }
  .seg button {
    min-height: 32px;
    padding: 0 10px;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: transparent;
    color: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .seg button.active {
    background: rgba(139, 92, 246, 0.3);
  }
  .phone {
    flex: 0 0 auto;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 12px;
    background: #0b0b14;
  }
  .viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .hero {
    flex: 1 1 auto;
    min-height: 0;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 50% 60%, #1b1733, #0b0b14 70%);
  }
  .hero-tag {
    font-size: 11px;
    opacity: 0.4;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }
</style>
