<!--
  Tunnel Primitives — sweep gallery.

  Renders the REAL kaleidoscope (buildTunnelLayers + copyModulators +
  AnimatorCanvas + the shared prop sampler) for a matrix of primitive configs,
  side by side on one shared playhead. This is the study rig: run any sequence
  through the gamut and see how each primitive (fold / mirror / flip / invert /
  echo / stagger / speed) and their combinations read at real prop density.

  Not feature code — a visual judge. One generated sample sequence, no persisted
  state, NO prop-count cap (the live dock caps; the gamut here does not). Per the
  project's visualization-routing rule: real components in a test page.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import LookCell from "./LookCell.svelte";
  import { DEFAULT_CONFIG, speedFill, type TunnelConfig } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
  import { generationOrchestrator } from "#lib/shared/create/services/generation-orchestrator.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  const cfg = (over: Partial<TunnelConfig>): TunnelConfig => ({ ...DEFAULT_CONFIG, ...over });

  // The sweep: one axis at a time, then a few combinations, so each primitive's
  // contribution is legible against its neighbors.
  const SWEEP: { label: string; config: TunnelConfig }[] = [
    { label: "Fold 1", config: cfg({ fold: 1 }) },
    { label: "Fold 2", config: cfg({ fold: 2 }) },
    { label: "Fold 4", config: cfg({ fold: 4 }) },
    { label: "Fold 8", config: cfg({ fold: 8 }) },
    { label: "Fold 4 · Mirror", config: cfg({ fold: 4, mirror: true }) },
    { label: "Fold 4 · Flip", config: cfg({ fold: 4, flip: true }) },
    { label: "Fold 2 · Mirror · Flip", config: cfg({ fold: 2, mirror: true, flip: true }) },
    { label: "Fold 4 · Invert", config: cfg({ fold: 4, invert: true }) },
    { label: "Fold 4 · Echo", config: cfg({ fold: 4, echo: true }) },
    { label: "Fold 4 · Stagger 1", config: cfg({ fold: 4, staggerSteps: 1 }) },
    { label: "Fold 4 · Stagger 2", config: cfg({ fold: 4, staggerSteps: 2 }) },
    { label: "Fold 4 · Alternating", config: cfg({ fold: 4, speedOverrides: speedFill("alternating", 4) }) },
    { label: "Fold 4 · Accelerando", config: cfg({ fold: 4, speedOverrides: speedFill("accelerando", 4) }) },
    { label: "Fold 8 · Mirror", config: cfg({ fold: 8, mirror: true }) },
    { label: "Fold 4 · Mirror · Stagger 1", config: cfg({ fold: 4, mirror: true, staggerSteps: 1 }) },
    { label: "Fold 8 · Stagger 1 · Alternating", config: cfg({ fold: 8, staggerSteps: 1, speedOverrides: speedFill("alternating", 8) }) },
  ];

  let base = $state<SequenceData | null>(null);
  let status = $state("generating sample sequence…");
  let errorMsg = $state<string | null>(null);

  // Shared playhead (1-indexed fractional, matching the tunnel controller).
  let step = $state(1);
  let speed = $state(0.4); // beats/sec
  let spectrum = $state(true);
  let grid = $state(false);

  // Double staves are TKA's canonical prop — judge the configs on them.
  const propChoices: { type: PropType; label: string }[] = [
    { type: PropType.STAFF, label: "Staff" },
    { type: PropType.SWORD, label: "Sword" },
    { type: PropType.BUUGENG, label: "Buugeng" },
    { type: PropType.DOUBLESTAR, label: "Doublestar" },
  ];
  let propType = $state<PropType>(PropType.STAFF);
  const propTypeStr = $derived(String(propType));

  async function generate() {
    status = "generating sample sequence…";
    errorMsg = null;
    base = null;
    try {
      const seq = await generationOrchestrator.generateSequence({
        length: 8,
        gridMode: GridMode.DIAMOND,
        propType: PropType.STAFF, // generation prop is irrelevant; render prop is separate
        difficulty: DifficultyLevel.INTERMEDIATE,
        constraintPreset: "smooth",
      });
      base = seq;
      status = `${SWEEP.length} configs · ${seq.steps.length}-step sample`;
    } catch (e) {
      errorMsg = String(e instanceof Error ? (e.stack ?? e.message) : e);
      status = "error";
    }
  }

  onMount(generate);

  onMount(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const n = base?.steps?.length ?? 0;
      if (n > 0) step = ((step - 1 + dt * speed) % n) + 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="page">
  <header>
    <h1>Tunnel Primitives — sweep</h1>
    <p class="sub">{status}</p>
  </header>

  <div class="controls">
    <div class="group">
      <span class="lbl">Prop</span>
      {#each propChoices as c (c.type)}
        <button class:active={propType === c.type} onclick={() => (propType = c.type)}>{c.label}</button>
      {/each}
    </div>
    <div class="group">
      <span class="lbl">Speed</span>
      <input type="range" min="0.1" max="1.5" step="0.1" bind:value={speed} />
      <span class="val">{speed.toFixed(1)}</span>
    </div>
    <div class="group">
      <button class:active={spectrum} onclick={() => (spectrum = !spectrum)}>Spectrum</button>
      <button class:active={grid} onclick={() => (grid = !grid)}>Grid</button>
      <button onclick={() => void generate()}>Regenerate</button>
    </div>
  </div>

  {#if base}
    <div class="gallery">
      {#each SWEEP as entry (entry.label)}
        <LookCell {base} config={entry.config} label={entry.label} {step} propType={propTypeStr} {spectrum} {grid} />
      {/each}
    </div>
  {:else if !errorMsg}
    <div class="placeholder">{status}</div>
  {/if}

  {#if errorMsg}
    <pre class="err">{errorMsg}</pre>
  {/if}
</div>

<style>
  .page {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 20px;
    background: radial-gradient(circle at 50% 25%, #14141f 0%, #0a0a0f 70%);
    color: #e8e8f0;
    font-family: system-ui, sans-serif;
  }
  header {
    text-align: center;
  }
  h1 {
    margin: 0;
    font-size: 1.4rem;
  }
  .sub {
    margin: 4px 0 0;
    opacity: 0.6;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 18px;
    justify-content: center;
    align-items: center;
  }
  .group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .lbl {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    opacity: 0.5;
  }
  .val {
    font-variant-numeric: tabular-nums;
    width: 2.2ch;
    opacity: 0.7;
  }

  button {
    background: rgba(255 255 255 / 0.06);
    border: 1px solid rgba(255 255 255 / 0.12);
    color: inherit;
    padding: 7px 12px;
    border-radius: 9px;
    font-size: 0.82rem;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  button:hover {
    background: rgba(255 255 255 / 0.12);
  }
  button.active {
    background: linear-gradient(135deg, #6d5ef0, #b14ddb);
    border-color: transparent;
    color: #fff;
  }

  .gallery {
    width: 100%;
    max-width: 1400px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 22px;
  }
  .placeholder {
    opacity: 0.5;
    font-size: 0.9rem;
    padding: 60px;
  }
  .err {
    max-width: 900px;
    white-space: pre-wrap;
    background: rgba(220 60 60 / 0.12);
    border: 1px solid rgba(220 60 60 / 0.4);
    color: #ffb4b4;
    padding: 12px;
    border-radius: 10px;
    font-size: 0.72rem;
  }
</style>
