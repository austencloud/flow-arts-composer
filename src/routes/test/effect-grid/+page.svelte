<script lang="ts">
  /**
   * The effect grid — all sixteen registry effects at once.
   *
   * Sixteen stations in a 4x4 arrangement, every one running the same sequence
   * with the same overlaid rigs. The only variable across the grid is the
   * effect, which is what makes this a comparison rather than a gallery: you can
   * see which effects read as themselves, which read as each other, and which
   * are still missing a 3D renderer.
   *
   * Cost: each station mounts `centerPlanes` rigs, and each rig is one
   * EffectOrchestrator3D. At six planes that is ninety-six orchestrators, which
   * no machine renders smoothly — hence the Overlay control, defaulting to two
   * (one plane and its mirror), which keeps the layered look affordable.
   */
  import { Canvas, T } from "@threlte/core";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { WebGLRenderer } from "three";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import EffectGridScene from "./EffectGridScene.svelte";
  import EffectGridWarmup from "./EffectGridWarmup.svelte";
  import PerfProbe from "./PerfProbe.svelte";
  import AnimalPresetReview from "../animal-presets/+page.svelte";
  import { EFFECT_CELLS } from "./effect-grid";
  import { BLOOM_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/bloom-presets.js";
  import { GOO_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/goo-presets.js";
  import type { EffectType } from "#lib/shared/effects/domain/effects-config.js";

  /**
   * One shared effects config for the page, persist:false so the harness never
   * writes to Austen's real tka_effects_config.
   *
   * One is enough, and it must NOT carry the per-cell selection: each cell's
   * effect travels down the tipEffectMap prop channel (effectId → CovenStation
   * → EffectOrchestrator3D → EffectsLayer.activeEffects). This context supplies
   * only the per-effect INTENT parameters, which are shared by every cell.
   */
  const effectsConfig = createEffectsConfigState(undefined, { persist: false });
  const requestedBloomPreset = BLOOM_PRESETS.find(
    (preset) => preset.id === page.url.searchParams.get("preset")
  );
  if (requestedBloomPreset?.patch) {
    effectsConfig.applyPreset(
      "bloom",
      requestedBloomPreset.id,
      requestedBloomPreset.patch
    );
  }
  // Reproducible liquid review without changing the viewer's saved settings.
  const requestedGooPreset = GOO_PRESETS.find(
    (preset) => preset.id === page.url.searchParams.get("preset")
  );
  if (requestedGooPreset?.patch) {
    effectsConfig.applyPreset(
      "goo",
      requestedGooPreset.id,
      requestedGooPreset.patch
    );
  }
  const gooStyle = page.url.searchParams.get("gooStyle");
  if (gooStyle === "flow" || gooStyle === "splash" || gooStyle === "mist") {
    effectsConfig.updateEffect("goo", { spewStyle: gooStyle });
  }
  const gooTension = page.url.searchParams.get("gooTension");
  if (gooTension !== null && Number.isFinite(Number(gooTension))) {
    effectsConfig.updateEffect("goo", {
      surfaceTension: Math.max(0, Math.min(1, Number(gooTension))),
    });
  }
  setEffectsConfigContext(effectsConfig);

  let showProps = $state(page.url.searchParams.get("props") === "1");
  let playing = $state(true);
  let showLabels = $state(true);
  const requestedOverlay = Number(page.url.searchParams.get("overlay"));
  let centerPlanes = $state(
    requestedOverlay === 1 || requestedOverlay === 6 ? requestedOverlay : 2
  );
  let viewportWidth = $state(1920);
  let viewportHeight = $state(1080);
  let activationEffect = $state<EffectType>("none");
  let activationPreviewReady = $state(false);
  let previewError = $state("");
  let activationEffectsReady = $state(false);
  let activationShadersReady = $state(false);
  const activationReady = $derived(
    activationPreviewReady && activationEffectsReady && activationShadersReady
  );

  // Portrait canvases need more camera distance to keep the outer grid
  // columns in frame. Landscape and desktop preserve the original shot.
  const portraitDistanceScale = $derived(
    Math.max(1, Math.min(2.5, 1 + (viewportHeight / viewportWidth - 1) * 1.8))
  );
  const cameraPosition = $derived([
    0,
    23 * portraitDistanceScale,
    14 * portraitDistanceScale,
  ] as const);
  const animalPresetMode = $derived(
    page.url.searchParams.get("view") === "animal-presets"
  );
  const activationMode = $derived(
    page.url.searchParams.get("activation") === "1"
  );
  const focusedEffect = $derived(page.url.searchParams.get("focus"));
  const focusedCell = $derived(
    activationMode
      ? (EFFECT_CELLS[0] ?? null)
      : (EFFECT_CELLS.find((cell) => cell.id === focusedEffect) ?? null)
  );
  const sceneCameraPosition: [number, number, number] = $derived(
    focusedCell ? [0, 2.5, 3.2] : [...cameraPosition]
  );
  const sceneCameraTarget = $derived(
    focusedCell ? ([0, 1.25, 0] as const) : ([0, 0.6, 1] as const)
  );
  const sceneFov = $derived(focusedCell ? 38 : 50);

  const boolOptions = [
    { value: true, label: "On" },
    { value: false, label: "Off" },
  ];
  const planeOptions = [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 6, label: "6" },
  ];

  onMount(() => {
    if (focusedEffect !== "goo" && !activationMode) return;
    const target = window as unknown as Record<string, unknown>;
    // Change material/style on the same generated motion for visual comparison.
    target.__gooReviewHarness = {
      setPreset(id: string): boolean {
        const preset = GOO_PRESETS.find((candidate) => candidate.id === id);
        if (!preset?.patch) return false;
        effectsConfig.applyPreset("goo", preset.id, preset.patch);
        return true;
      },
      setStyle(style: string): boolean {
        if (style !== "flow" && style !== "splash" && style !== "mist")
          return false;
        effectsConfig.updateEffect("goo", { spewStyle: style });
        return true;
      },
      getState: () => ({
        ready: activationPreviewReady && activationEffectsReady,
        error: previewError,
      }),
    };
    return () => {
      delete target.__gooReviewHarness;
    };
  });

  onMount(() => {
    if (!activationMode) return;
    const target = window as unknown as Record<string, unknown>;
    target.__effectActivationHarness = {
      effects: EFFECT_CELLS.map((cell) => cell.id),
      setEffect(effect: string): boolean {
        if (
          effect !== "none" &&
          !EFFECT_CELLS.some((cell) => cell.id === effect)
        ) {
          return false;
        }
        activationEffect = effect as EffectType;
        return true;
      },
      getState: () => ({
        effect: activationEffect,
        ready: activationReady,
        performerCount: 8,
      }),
    };
    return () => {
      delete target.__effectActivationHarness;
    };
  });
</script>

<svelte:head><title>Effect grid — all sixteen</title></svelte:head>
<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
/>

{#if animalPresetMode}
  <AnimalPresetReview />
{:else}
  <div class="harness">
    <header>
      <h1>Effect grid</h1>
      <p>
        Every effect in the registry, one per cell, all running the same
        sequence with the same overlaid rigs. The effect is the only thing that
        changes between cells. Orbit to look along the rows.
      </p>
    </header>

    <section class="stage">
      <Canvas
        createRenderer={(canvas) =>
          new WebGLRenderer({
            canvas,
            antialias: true,
            alpha: false,
            powerPreference: "high-performance",
          })}
      >
        <!-- Framed to fill the stage with the 4x4: high enough that the rows read
           as a grid rather than a receding line, close enough that no cell is
           a speck. The grid spans 3 * GRID_SPACING in both axes. -->
        <T.PerspectiveCamera
          makeDefault
          position={sceneCameraPosition}
          fov={sceneFov}
        >
          <OrbitControls
            enableDamping
            target={sceneCameraTarget}
            maxPolarAngle={Math.PI / 2}
          />
        </T.PerspectiveCamera>
        <PerfProbe />
        <EffectGridScene
          showProps={activationMode ? true : showProps}
          {playing}
          {showLabels}
          centerPlanes={activationMode ? 4 : centerPlanes}
          focusEffect={focusedCell?.id ?? null}
          effectOverride={activationMode ? activationEffect : null}
          formationCount={activationMode ? 2 : 1}
          showStageMarker={!focusedCell}
          onPreviewReady={() => (activationPreviewReady = true)}
          onPreviewError={(message) => (previewError = message)}
          onEffectsReadyChange={(ready) => (activationEffectsReady = ready)}
        />
        {#if activationMode}
          <EffectGridWarmup
            armed={activationPreviewReady && activationEffectsReady}
            onReadyChange={(ready) => (activationShadersReady = ready)}
          />
        {/if}
      </Canvas>
    </section>

    {#if previewError}
      <p role="alert">Preview unavailable: {previewError}</p>
    {/if}

    {#if activationMode}
      <output
        hidden
        data-testid="effect-activation-state"
        data-ready={activationReady}
        data-effect={activationEffect}>{activationEffect}</output
      >
    {/if}

    <section class="controls">
      <label class="control">
        <span>Props</span>
        <SegmentedControl
          options={boolOptions}
          value={showProps}
          onchange={(v) => (showProps = v)}
          size="sm"
          ariaLabel="Show props"
        />
      </label>
      <label class="control">
        <span>Playing</span>
        <SegmentedControl
          options={boolOptions}
          value={playing}
          onchange={(v) => (playing = v)}
          size="sm"
          ariaLabel="Playing"
        />
      </label>
      <label class="control">
        <span>Labels</span>
        <SegmentedControl
          options={boolOptions}
          value={showLabels}
          onchange={(v) => (showLabels = v)}
          size="sm"
          ariaLabel="Show labels"
        />
      </label>
      <label class="control">
        <span>Overlay</span>
        <SegmentedControl
          options={planeOptions}
          value={centerPlanes}
          onchange={(v) => (centerPlanes = v)}
          size="sm"
          ariaLabel="Overlaid rigs per station"
        />
      </label>
    </section>

    <ol class="key" aria-label="Grid reading order">
      {#each EFFECT_CELLS as cell (cell.id)}
        <li style:--accent={cell.color}>
          <span class="swatch" aria-hidden="true"></span>{cell.label}
        </li>
      {/each}
    </ol>
  </div>
{/if}

<style>
  /* Local type ramp. The site-wide lockstep ramp in app.css is scoped to
     .mkt-shell / .legal-container, so a test route gets none of it and renders
     as 16px type on a 3840 monitor — the page reads as a phone layout scaled
     up. Everything below is em, so it all grows off this one declaration. */
  .harness {
    display: flex;
    flex-direction: column;
    gap: 1.25em;
    padding: 1.5em;
    min-height: 100svh;
    background: #070a12;
    color: #e8ecf6;
    font-size: clamp(1rem, 0.52rem + 0.42vw, 1.6rem);
  }

  header h1 {
    margin: 0;
    font-size: 1.6em;
    letter-spacing: -0.01em;
  }

  header p {
    margin: 0.35em 0 0;
    color: #9fb0cc;
  }

  .stage {
    position: relative;
    /* Reserved box: the canvas must not resize as the scene loads. The upper
       bound is deliberately huge — a hard rem cap here is what left two thirds
       of a 4K viewport empty under the grid. */
    height: clamp(28rem, 74svh, 120rem);
    border-radius: 0.75em;
    overflow: hidden;
    background: #04060c;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25em;
  }

  .control {
    display: flex;
    align-items: center;
    gap: 0.6em;
    font-size: 0.95em;
    color: #9fb0cc;
  }

  /* Reading order key: same order as the grid fills, left to right, top row
     first, so a cell's position maps to a name without projecting labels. */
  .key {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.45em 1.2em;
    max-width: 52em;
  }

  .key li {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 0.9em;
    color: #8fa0bd;
  }

  .swatch {
    width: 0.6em;
    height: 0.6em;
    border-radius: 50%;
    background: var(--accent);
    flex: 0 0 auto;
  }

  @media (max-width: 900px) {
    .key {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
