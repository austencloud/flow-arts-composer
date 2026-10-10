<script lang="ts">
  import { Canvas } from "@threlte/core";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import MuseumKitStagesScene, { type Stage } from "./MuseumKitStagesScene.svelte";

  let stage = $state<Stage>("asis");

  const STAGES: { value: Stage; label: string }[] = [
    { value: "asis", label: "1 · As-is (the bug)" },
    { value: "sealed", label: "2 · Seal shell" },
    { value: "merged", label: "3 · Merge runs" },
    { value: "kit", label: "4 · Kit + baked light" },
  ];

  const CAPTIONS: Record<Stage, { title: string; what: string; why: string }> = {
    asis: {
      title: "What ships today",
      what: "The perimeter is a 1-tile-thick row of separate 0.5m wall slabs. Every doorway and exhibit tile is floor, not wall — so it's a full-height gap straight to the sky. The floor is thin per-tile slabs with a 2cm seam over a void. Lighting is the real ambient-only value, so walls read black.",
      why: "This is your screenshot, reproduced. Nothing here is a rendering-quality problem AI got better at — it's structural. The geometry is derived as boxes at runtime, and the derivation leaves holes.",
    },
    sealed: {
      title: "Seal the shell (geometry only)",
      what: "Same primitive boxes, but the gaps are filled, a ceiling caps the room, the walls get real thickness, and the floor becomes one solid plane. A little light is added just so you can see solid geometry.",
      why: "Proves the holes and see-through floor are a derivation choice, not a hard limit. This is roughly as far as 'just fix the procedural system' gets you — solid, but still flat boxes. Not the AAA bar.",
    },
    merged: {
      title: "Merge wall runs",
      what: "Instead of one slab per 0.5m tile, each straight stretch becomes one merged wall piece, junctions get distinct corner posts, and the doorway is framed by a header. This is exactly what the new wall-run-resolver emits.",
      why: "Fewer, aligned pieces = no micro-seams, far fewer draw calls, and a grid the kit GLBs can drop onto. The layout data and collision are untouched — only the geometry step changed.",
    },
    kit: {
      title: "Kit + baked lighting (representative)",
      what: "The merged runs are dressed as kit pieces — baseboard, cornice, framed door — under baked-feel lighting so surfaces show form instead of black. NOTE: this is a stand-in built from primitives. The real version loads a Blender-authored CC0 modular GLB with baked AO.",
      why: "Baked lighting is the decisive call: it fixes black walls with zero runtime light cost (no 12-wing light budget blowout). This stand-in shows the target — paneled surfaces, warm even light — that the GLB kit delivers.",
    },
  };

  const cap = $derived(CAPTIONS[stage]);
</script>

<div class="page">
  <header>
    <h1>Museum — modular kit stages</h1>
    <p>
      One institutional-wing room, morphed through the four stages of the
      redesign. Step the control left to right. Drag to orbit, scroll to zoom —
      fly through the doorway gap in stage 1 to see straight to the sky.
    </p>
  </header>

  <div class="switcher">
    <SegmentedControl
      options={STAGES}
      value={stage}
      onchange={(v) => (stage = v)}
      color="accent"
    />
  </div>

  <div class="stage-wrap">
    <div class="stage">
      <Canvas>
        <MuseumKitStagesScene {stage} />
      </Canvas>
    </div>
    <aside class="caption">
      <span class="kicker">{stage === "kit" ? "Representative" : "Live"}</span>
      <h2>{cap.title}</h2>
      <h3>What changed</h3>
      <p>{cap.what}</p>
      <h3>Why it matters</h3>
      <p>{cap.why}</p>
    </aside>
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    background: #07080c;
    color: #e8e8ee;
    display: flex;
    flex-direction: column;
    padding: 16px 20px;
    gap: 12px;
    font-family: system-ui, sans-serif;
  }

  header h1 {
    margin: 0 0 4px;
    font-size: 1.3rem;
  }

  header p {
    margin: 0;
    color: #8a8fa3;
    font-size: 0.85rem;
    max-width: 80ch;
  }

  .switcher {
    max-width: 640px;
    /* SegmentedControl reads --theme-* / --prop-* tokens */
    --theme-card-bg: #0d0f16;
    --theme-stroke: #1d2030;
    --theme-text: #e8e8ee;
    --theme-text-dim: #8a8fa3;
    --theme-text-on-accent: #fff;
    --theme-accent: #5a78c8;
    --min-touch-target: 40px;
    --duration-normal: 0.18s;
    --duration-fast: 0.1s;
  }

  .stage-wrap {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 340px;
    gap: 14px;
    min-height: 520px;
  }

  .stage {
    position: relative;
    border: 1px solid #1d2030;
    border-radius: 10px;
    overflow: hidden;
    /* sky gradient backs the transparent canvas */
    background: linear-gradient(#0a1726 0%, #1d3a5f 70%, #2c4f7a 100%);
  }

  .caption {
    background: #0d0f16;
    border: 1px solid #1d2030;
    border-radius: 10px;
    padding: 16px 18px;
    overflow-y: auto;
  }

  .caption .kicker {
    display: inline-block;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #7f8aa8;
    border: 1px solid #2a2f44;
    border-radius: 999px;
    padding: 2px 8px;
    margin-bottom: 8px;
  }

  .caption h2 {
    margin: 0 0 12px;
    font-size: 1.05rem;
  }

  .caption h3 {
    margin: 14px 0 4px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9aa0b8;
  }

  .caption p {
    margin: 0;
    font-size: 0.85rem;
    line-height: 1.5;
    color: #c4c9da;
  }

  @media (max-width: 860px) {
    .stage-wrap {
      grid-template-columns: 1fr;
    }
  }
</style>
