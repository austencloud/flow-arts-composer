<!--
  CONCEPT SKELETON — design-reaction scaffold (NOT a shipped lesson).

  Purpose: let Austen react to the "layered illustration" idea for converging the
  written guide into the Concepts module. Shows ONE concept (Hand Placements:
  alpha/beta/gamma) rendered through every available illustration LAYER at once,
  inside a step-through shell, with per-layer toggles.

  Real components wired:
    - LessonGridDisplay  → bare 2D grid (the "spatial" layer)
    - GuidePictograph    → the placement as TKA notation (fed from placements-motions.json)
    - GuideMotionVideo   → baked static-placement loop (the "animation" layer)
  Placeholder:
    - 3D avatar slot     → where the real Viewer3DCanvas + PerformerRig wires in.

  This is throwaway. Once the layering recipe is agreed, it becomes a real
  ConceptExperience under features/learn.
-->
<script lang="ts">
  import LessonGridDisplay from "$lib/shared/pictograph/grid/components/LessonGridDisplay.svelte";
  import GuidePictograph from "../../(public)/guide/level-1/_components/GuidePictograph.svelte";
  import GuideMotionVideo from "../../(public)/guide/level-1/_components/GuideMotionVideo.svelte";
  import placementsData from "../../(public)/guide/level-1/_data/placements-motions.json";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  const pictographs = (placementsData as { pictographs: Record<string, unknown> }).pictographs;
  function pick(id: string) {
    return (pictographs[id] ?? null) as never;
  }

  // ---- the concept, broken into steps ----
  type Step = {
    key: string;
    title: string;
    blurb: string;
    // canonical pictograph variation id + the 4 variations for the "rotate/mirror" row
    primaryId: string;
    variationIds: string[];
    // baked static-loop video id (animation layer), if one exists
    motionId: string | null;
  };

  const steps: Step[] = [
    {
      key: "discover",
      title: "Discover",
      blurb: "Two hands. Where they sit relative to each other names the placement. Drag them on the grid and the name appears — you find alpha/beta/gamma by playing, not by being told.",
      primaryId: "pos-alpha3",
      variationIds: ["pos-alpha1", "pos-alpha2", "pos-alpha3", "pos-alpha4"],
      motionId: null,
    },
    {
      key: "alpha",
      title: "Alpha",
      blurb: "Hands at opposite points — a straight line through the center.",
      primaryId: "pos-alpha3",
      variationIds: ["pos-alpha1", "pos-alpha2", "pos-alpha3", "pos-alpha4"],
      motionId: "t6-static-alpha",
    },
    {
      key: "beta",
      title: "Beta",
      blurb: "Both hands together at the same point.",
      primaryId: "pos-beta1",
      variationIds: ["pos-beta1", "pos-beta2", "pos-beta3", "pos-beta4"],
      motionId: "t6-static-beta",
    },
    {
      key: "gamma",
      title: "Gamma",
      blurb: "Hands on adjacent points — a right angle, an 'L' through the center.",
      primaryId: "pos-gamma1",
      variationIds: ["pos-gamma1", "pos-gamma2", "pos-gamma3", "pos-gamma4"],
      motionId: "t6-static-gamma",
    },
  ];

  let current = $state(0);
  const step = $derived(steps[current]!);

  // ---- layer toggles (react to the layering itself) ----
  let layers = $state({ grid: true, pictograph: true, motion: true, avatar: true });
  const layerDefs = [
    { key: "grid", label: "2D grid" },
    { key: "pictograph", label: "Pictograph" },
    { key: "motion", label: "Animation" },
    { key: "avatar", label: "3D avatar" },
  ] as const;

  function go(n: number) {
    current = Math.max(0, Math.min(steps.length - 1, n));
  }
</script>

<svelte:head><title>Concept Skeleton — Hand Placements</title></svelte:head>

<div class="shell">
  <header class="top">
    <div class="crumb">SKELETON · Hand Placements · concept #2</div>
    <div class="layer-toggles">
      {#each layerDefs as l}
        <button
          class="chip"
          class:on={layers[l.key]}
          aria-pressed={layers[l.key]}
          onclick={() => (layers[l.key] = !layers[l.key])}
        >{l.label}</button>
      {/each}
    </div>
  </header>

  <!-- step dots -->
  <nav class="dots" aria-label="Steps">
    {#each steps as s, i}
      <button class="dot" class:active={i === current} onclick={() => go(i)} aria-label={s.title}>
        <span>{s.title}</span>
      </button>
    {/each}
  </nav>

  <main class="stage">
    <div class="step-head">
      <h1>{step.title}</h1>
      <p class="blurb">{step.blurb}</p>
    </div>

    <div class="layers">
      {#if layers.grid}
        <figure class="panel">
          <figcaption>2D grid <em>· spatial discovery</em></figcaption>
          <div class="panel-body">
            <LessonGridDisplay type="diamond" showLabels size="large" />
          </div>
          <p class="note">Real component. Hand markers + drag-to-discover not wired in this skeleton.</p>
        </figure>
      {/if}

      {#if layers.pictograph}
        <figure class="panel">
          <figcaption>Pictograph <em>· the notation</em></figcaption>
          <div class="panel-body light">
            <GuidePictograph data={pick(step.primaryId)} size="lg" propType={PropType.HAND} showArrows={false} eager />
          </div>
          <div class="variation-row light">
            {#each step.variationIds as vid}
              <GuidePictograph data={pick(vid)} size="sm" propType={PropType.HAND} showArrows={false} eager />
            {/each}
          </div>
          <p class="note">Real PictographRenderer. Bottom row = the 4 rotations/mirrors.</p>
        </figure>
      {/if}

      {#if layers.motion}
        <figure class="panel">
          <figcaption>Animation <em>· over time</em></figcaption>
          <div class="panel-body">
            {#if step.motionId}
              <div class="vid"><GuideMotionVideo id={step.motionId} label={`${step.title} static hold`} /></div>
            {:else}
              <div class="ph">no baked loop for this step</div>
            {/if}
          </div>
          <p class="note">Real baked mp4 (harvested from the guide). Statics here; motions for later concepts.</p>
        </figure>
      {/if}

      {#if layers.avatar}
        <figure class="panel">
          <figcaption>3D avatar <em>· on a body</em></figcaption>
          <div class="panel-body avatar-slot">
            <div class="ph big">
              <span class="ph-icon">🧍</span>
              <span>Viewer3DCanvas slot</span>
              <small>avatar performs this on a 3D grid in front of it</small>
            </div>
          </div>
          <p class="note">Placeholder. Wires the shipped 3D sequence viewer (PerformerRig) pointed at this step.</p>
        </figure>
      {/if}
    </div>
  </main>

  <footer class="nav">
    <button class="navbtn" disabled={current === 0} onclick={() => go(current - 1)}>‹ Back</button>
    <span class="count">{current + 1} / {steps.length}</span>
    <button class="navbtn primary" disabled={current === steps.length - 1} onclick={() => go(current + 1)}>Next ›</button>
  </footer>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    width: 100%;
    background: #0c0c12;
    color: #f0f0f5;
    font-family: system-ui, sans-serif;
  }

  .top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.75rem;
    padding: 0.9rem 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  .crumb { font-size: 0.8rem; letter-spacing: 0.04em; color: #8a8aa0; text-transform: uppercase; }

  .layer-toggles { display: flex; gap: 0.4rem; flex-wrap: wrap; }
  .chip {
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: transparent;
    color: #b8b8c8;
    font-size: 0.82rem;
    cursor: pointer;
    min-height: 36px;
  }
  .chip.on { background: #4ea7e8; border-color: #4ea7e8; color: #06121d; font-weight: 600; }

  .dots { display: flex; gap: 0.5rem; justify-content: center; padding: 1rem; flex-wrap: wrap; }
  .dot {
    padding: 0.45rem 0.9rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: transparent;
    color: #9a9ab0;
    cursor: pointer;
    font-size: 0.85rem;
    min-height: 40px;
  }
  .dot.active { background: rgba(78, 167, 232, 0.16); border-color: #4ea7e8; color: #cfe7fb; font-weight: 600; }

  .stage { flex: 1; max-width: 1500px; width: 100%; margin: 0 auto; padding: 1rem 1.5rem 2rem; }

  .step-head { max-width: 720px; margin: 0 auto 1.5rem; text-align: center; }
  .step-head h1 { font-size: 2.4rem; margin: 0 0 0.5rem; font-style: italic; }
  .blurb { font-size: 1.05rem; line-height: 1.6; color: #c4c4d4; margin: 0; }

  .layers {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.25rem;
    align-items: start;
  }

  .panel {
    margin: 0;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  figcaption { font-size: 0.95rem; font-weight: 600; }
  figcaption em { font-style: normal; font-weight: 400; color: #8a8aa0; }

  .panel-body {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    min-height: 240px;
  }
  .panel-body.light { background: #fafafa; padding: 1rem; }
  .variation-row { display: flex; gap: 0.5rem; justify-content: center; border-radius: 10px; padding: 0.5rem; flex-wrap: wrap; }
  .variation-row.light { background: #fafafa; }

  .vid { width: 240px; max-width: 100%; }

  .ph {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 0.4rem; color: #7a7a90; font-size: 0.9rem; text-align: center;
    border: 1px dashed rgba(255, 255, 255, 0.18); border-radius: 10px; width: 100%; min-height: 220px;
  }
  .ph.big { min-height: 240px; }
  .ph-icon { font-size: 3rem; }
  .ph small { color: #5f5f78; max-width: 200px; }
  .avatar-slot { background: radial-gradient(circle at 50% 30%, rgba(78,167,232,0.08), transparent 70%); }

  .note { font-size: 0.78rem; color: #6f6f88; margin: 0; line-height: 1.4; }

  .nav {
    position: sticky; bottom: 0;
    display: flex; align-items: center; justify-content: center; gap: 1.5rem;
    padding: 1rem; background: rgba(12, 12, 18, 0.92);
    border-top: 1px solid rgba(255, 255, 255, 0.08); backdrop-filter: blur(8px);
  }
  .navbtn {
    padding: 0.6rem 1.4rem; border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.18); background: transparent; color: #d0d0e0;
    font-size: 0.95rem; cursor: pointer; min-height: 44px;
  }
  .navbtn.primary { background: #4ea7e8; border-color: #4ea7e8; color: #06121d; font-weight: 600; }
  .navbtn:disabled { opacity: 0.35; cursor: default; }
  .count { font-size: 0.9rem; color: #8a8aa0; }
</style>
