<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";
  import type {
    CameraStateSnapshot,
    FormationPreset,
  } from "@austencloud/scene-3d";
  import { onDestroy, onMount } from "svelte";
  import InlineAnimationPlayer from "#lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte";
  import type { TipEffectMap } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
  import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import Viewer3DCanvas from "#lib/shared/3d/components/Viewer3DCanvas.svelte";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import {
    SmokeVolumeRenderer3D,
    type SmokeVolumeRendererDiagnostic3D,
  } from "#lib/shared/3d/effects/smoke/smoke-volume-renderer-3d.js";
  import { createScene3DRenderState } from "#lib/shared/3d/scene-features/state/scene-3d-render-state.svelte.js";
  import { setScene3DRenderContext } from "#lib/shared/3d/scene-features/state/scene-3d-render-context.js";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { SMOKE_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/smoke-presets.js";
  import { orientationCycleExtender } from "#lib/features/create/generate/circular/services/orientation-cycle-extender.js";
  import { getGenerationOrchestrator } from "#lib/features/create/generate/shared/get-generation-orchestrator.js";
  import type { GeneratedSequenceInfo } from "#lib/features/landing/domain/models/spinner-models.js";
  import { InfiniteSequenceGenerator } from "#lib/features/landing/services/infinite-sequence-generator.js";
  import { SpinnerMetricsRepository } from "#lib/features/landing/services/spinner-metrics-repository.js";
  import { isEffectPreviewLoop } from "#lib/shared/effects/domain/effect-preview-loop-policy.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";

  const ENVIRONMENTS = [
    { id: BackgroundType.COSMIC, label: "Black stage" },
    { id: BackgroundType.FOREST, label: "Forest" },
    { id: BackgroundType.OCEAN, label: "Bright ocean" },
  ] as const;
  const PERFORMER_COUNTS = [1, 4, 8] as const;
  const SMOKE_TIP_EFFECT_MAP: TipEffectMap = {
    "*": { effect: "smoke" },
  };
  const referenceVisibility = new AnimationVisibilityStateManager({
    ephemeral: true,
  });
  referenceVisibility.setDarkMode(true);

  const requestedEnvironment =
    typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("environment");
  const backgroundType =
    ENVIRONMENTS.find(
      (environment) => String(environment.id) === requestedEnvironment
    )?.id ?? BackgroundType.COSMIC;

  const REVIEW_CAMERA: CameraStateSnapshot = {
    position: { x: 0, y: 1.35, z: -5.4 },
    rotation: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 1.25, z: 0 },
    fov: 48,
    timestamp: 0,
  };

  const viewer = createViewer3DState({
    renderMode: "3d",
    backgroundType,
    camera: REVIEW_CAMERA,
    performers: [],
    selectedPerformerIndex: null,
    activeFormation: "line",
    defaultProp: "staff",
    visiblePlanes: [],
    effectToggles: { smoke: true },
    sceneFeatures: {
      environment: true,
      stage: true,
      audience: false,
      campfire: false,
      tent: false,
    },
  });
  viewer.hideAllPlanes();
  setViewer3DContext(viewer);

  const effectsConfig = createEffectsConfigState(undefined, { persist: false });
  effectsConfig.setActiveEffect("smoke");
  setEffectsConfigContext(effectsConfig);
  setScene3DRenderContext(createScene3DRenderState());

  let preview = $state<GeneratedSequenceInfo | null>(null);
  let loading = $state(true);
  let error = $state("");
  let playing = $state(true);
  let bpm = $state(72);
  let currentStep = $state(0);
  let activePresetId = $state(SMOKE_PRESETS[0]?.id ?? "smoke-classic");
  let performerCount = $state<1 | 4 | 8>(1);
  let stageReady = $state(false);
  let diagnostic = $state<SmokeVolumeRendererDiagnostic3D | null>(null);
  let generator: InfiniteSequenceGenerator | null = null;
  let generationToken = 0;
  let animationFrame = 0;
  let stopDiagnostics: (() => void) | null = null;
  let lastDiagnosticAt = 0;

  const sequence = $derived(preview?.sequence ?? null);
  const loopLabel = $derived(
    preview
      ? `${preview.sequence.steps.length} counts · ${String(preview.settings.loopType).replaceAll("_", " ")}`
      : "Production 16-count generator"
  );

  function configurePerformers(
    nextCount: 1 | 4 | 8,
    nextSequence: NonNullable<typeof sequence>
  ): void {
    const manager = viewer.performerManager;
    manager.ensurePerformerCount(nextCount);
    while (manager.performers.length > nextCount) manager.removePerformer();
    for (const performer of manager.performers) {
      performer.loadSequence(nextSequence);
      performer.setEffect("smoke");
    }
    viewer.applyFormationFromUI("line" as FormationPreset);
  }

  function applyPreset(nextPresetId: string): void {
    const preset = SMOKE_PRESETS.find(
      (candidate) => candidate.id === nextPresetId
    );
    if (!preset) return;
    activePresetId = preset.id;
    effectsConfig.applyPreset("smoke", preset.id, preset.patch);
    effectsConfig.setActiveEffect("smoke");
    for (const performer of viewer.performerManager.performers) {
      performer.setEffect("smoke");
    }
  }

  function frameStage(): void {
    if (!stageReady) return;
    const viewportWidth =
      typeof window === "undefined" ? 1600 : window.innerWidth;
    const viewportHeight =
      typeof window === "undefined" ? 900 : window.innerHeight;
    const aspect = viewportWidth / Math.max(1, viewportHeight);
    const baseDistance =
      performerCount === 8 ? 16 : performerCount === 4 ? 10.5 : 4.1;
    const narrowMultiplier = aspect < 0.7 ? 1.35 : aspect < 1 ? 1.16 : 1;
    const lowViewportMultiplier = viewportHeight < 520 ? 1.18 : 1;
    const height = performerCount === 8 ? 2.1 : 1.35;
    viewer.snapCameraTo(
      {
        x: 0,
        y: height,
        z: -baseDistance * narrowMultiplier * lowViewportMultiplier,
      },
      { x: 0, y: 1.25, z: 0 },
      undefined,
      false
    );
  }

  function handleSceneReady(ready: boolean): void {
    stageReady = ready;
    frameStage();
  }

  function setPerformerCount(nextCount: 1 | 4 | 8): void {
    performerCount = nextCount;
    if (sequence) configurePerformers(nextCount, sequence);
    frameStage();
  }

  async function generateLoop(): Promise<void> {
    const token = ++generationToken;
    loading = true;
    error = "";
    generator ??= new InfiniteSequenceGenerator(
      getGenerationOrchestrator(),
      new SpinnerMetricsRepository(),
      orientationCycleExtender
    );
    try {
      const next = await generator.generateInitial();
      if (!next || !isEffectPreviewLoop(next.sequence))
        throw new Error(
          "The generated sequence did not meet the seamless LOOP contract."
        );
      if (token !== generationToken) return;
      preview = next;
      currentStep = 0;
      viewer.enter3D(next.sequence);
      viewer.hideAllPlanes();
      configurePerformers(performerCount, next.sequence);
      applyPreset(activePresetId);
    } catch (cause: unknown) {
      if (token !== generationToken) return;
      error =
        cause instanceof Error ? cause.message : "LOOP generation failed.";
    } finally {
      if (token === generationToken) loading = false;
    }
  }

  onMount(() => {
    stopDiagnostics = SmokeVolumeRenderer3D.observeDiagnostics((snapshot) => {
      const now = performance.now();
      if (now - lastDiagnosticAt < 180) return;
      lastDiagnosticAt = now;
      diagnostic = snapshot;
    });
    void generateLoop();

    let previous = performance.now();
    const tick = (now: number) => {
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;
      if (playing && sequence) currentStep += delta * (bpm / 60);
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
  });

  onDestroy(() => {
    generationToken += 1;
    stopDiagnostics?.();
    if (animationFrame) cancelAnimationFrame(animationFrame);
    if (typeof window !== "undefined") viewer.dispose();
  });
</script>

<svelte:window onresize={frameStage} />

<svelte:head>
  <title>3D Smoke volume review</title>
  <meta
    name="description"
    content="Production 3D smoke volume review across presets, environments, and performer counts."
  />
</svelte:head>

<main class="review-shell">
  <section class="stage" aria-label="Live 3D Smoke volume review">
    {#if sequence}
      <Viewer3DCanvas
        sequenceData={sequence}
        {currentStep}
        isPlaying={playing}
        {bpm}
        leftPropType="staff"
        rightPropType="staff"
        hideOverlays
        hideSceneMarkers
        onSceneReadyChange={handleSceneReady}
      />

      <aside
        class="reference-2d"
        aria-label="Synchronized production 2D smoke reference"
      >
        <div class="reference-heading">
          <span>2D truth</span>
          <strong>Same LOOP · same preset</strong>
        </div>
        <div class="reference-canvas">
          <InlineAnimationPlayer
            {sequence}
            autoPlay
            playbackAllowed={playing}
            resumeWhenPlaybackAllowed
            showControls={false}
            chrome="minimal"
            fill
            showWordHeader={false}
            externalBpm={bpm}
            leftPropType="staff"
            rightPropType="staff"
            tipEffectMap={SMOKE_TIP_EFFECT_MAP}
            effectsConfigState={effectsConfig}
            gridVisible={false}
            backgroundAlpha={0}
            hideTkaGlyph
            hideStepNumbers
            disableContextMenu
            beatIndicators={false}
            interactive={false}
            visibilityManagerOverride={referenceVisibility}
          />
        </div>
      </aside>
    {/if}

    <div class="vignette" aria-hidden="true"></div>
    <header class="hero-copy">
      <p class="eyebrow">
        <span class:ready={stageReady}></span>Volumetric rebuild
      </p>
      <h1>Smoke that occupies the room.</h1>
      <p>{loopLabel}</p>
    </header>

    <aside class="telemetry" aria-label="Smoke renderer telemetry">
      <div>
        <span>Bricks</span><strong>{diagnostic?.activeBricks ?? 0}</strong>
      </div>
      <div>
        <span>Sources</span><strong>{diagnostic?.sourceCount ?? 0}</strong>
      </div>
      <div>
        <span>Ray steps</span><strong>{diagnostic?.raySteps ?? 0}</strong>
      </div>
      <div>
        <span>Density</span>
        <strong>{diagnostic ? diagnostic.densitySum.toFixed(1) : "—"}</strong>
      </div>
      <div>
        <span>Flow</span>
        <strong
          >{diagnostic
            ? `${Math.sqrt(diagnostic.velocityEnergy).toFixed(2)} m/s`
            : "—"}</strong
        >
      </div>
      <div>
        <span>Wake</span>
        <strong
          >{diagnostic
            ? `${diagnostic.wakeDistance.toFixed(2)} m`
            : "—"}</strong
        >
      </div>
      <div>
        <span>CPU sim</span>
        <strong
          >{diagnostic
            ? `${diagnostic.simulationCpuMs.toFixed(1)} ms`
            : "—"}</strong
        >
      </div>
    </aside>

    {#if !sequence && loading}
      <div class="status-card" role="status">
        <span class="loader" aria-hidden="true"></span>
        <strong>Generating the performance</strong>
        <span>Building a production 16-count LOOP.</span>
      </div>
    {:else if !sequence && error}
      <div class="status-card" role="alert">
        <strong>Couldn’t generate the LOOP</strong>
        <span>{error}</span>
        <button type="button" onclick={() => void generateLoop()}
          >Try again</button
        >
      </div>
    {/if}

    <aside class="control-deck" aria-label="Smoke comparison controls">
      <div class="control-group preset-group">
        <span class="group-label">Material</span>
        <div class="chip-row six-up">
          {#each SMOKE_PRESETS as preset (preset.id)}
            <button
              type="button"
              class:active={activePresetId === preset.id}
              style:--swatch={preset.previewColor}
              aria-pressed={activePresetId === preset.id}
              onclick={() => applyPreset(preset.id)}
            >
              <span class="swatch" aria-hidden="true"></span>{preset.name}
            </button>
          {/each}
        </div>
      </div>

      <div class="control-grid">
        <div class="control-group">
          <span class="group-label">Scene</span>
          <div class="chip-row">
            {#each ENVIRONMENTS as environment (environment.id)}
              <a
                class="scene-link"
                class:active={backgroundType === environment.id}
                aria-current={backgroundType === environment.id
                  ? "page"
                  : undefined}
                href={`?environment=${encodeURIComponent(String(environment.id))}`}
                data-sveltekit-reload>{environment.label}</a
              >
            {/each}
          </div>
        </div>

        <div class="control-group">
          <span class="group-label">Load</span>
          <div class="chip-row">
            {#each PERFORMER_COUNTS as count}
              <button
                type="button"
                class:active={performerCount === count}
                aria-pressed={performerCount === count}
                onclick={() => setPerformerCount(count)}
                >{count} {count === 1 ? "performer" : "performers"}</button
              >
            {/each}
          </div>
        </div>

        <div class="transport">
          <button
            type="button"
            aria-label={playing ? "Pause Smoke review" : "Play Smoke review"}
            aria-pressed={!playing}
            onclick={() => (playing = !playing)}
            >{playing ? "Pause" : "Play"}</button
          >
          <label for="smoke-review-bpm">Tempo</label>
          <input
            id="smoke-review-bpm"
            type="range"
            min="40"
            max="120"
            bind:value={bpm}
          />
          <output for="smoke-review-bpm">{bpm} BPM</output>
          <button
            type="button"
            disabled={loading}
            onclick={() => void generateLoop()}
          >
            {loading ? "Generating…" : "New LOOP"}
          </button>
        </div>
      </div>
    </aside>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #020307;
  }

  .review-shell {
    --panel: color-mix(in srgb, #070a12 82%, transparent);
    --stroke: rgba(255, 255, 255, 0.14);
    width: 100%;
    height: 100svh;
    color: #f8fafc;
    font-family: var(--font-family-body, Inter, system-ui, sans-serif);
    container-type: inline-size;
  }

  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .stage :global(.viewer-3d-canvas),
  .stage :global(canvas) {
    width: 100% !important;
    height: 100% !important;
  }

  .vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(
        180deg,
        rgba(0, 0, 0, 0.58),
        transparent 24%,
        transparent 64%,
        rgba(0, 0, 0, 0.76)
      ),
      radial-gradient(
        circle at 50% 46%,
        transparent 28%,
        rgba(0, 0, 0, 0.44) 100%
      );
  }

  .hero-copy {
    position: absolute;
    top: clamp(1rem, 2.2vw, 3rem);
    left: clamp(1rem, 2.8vw, 4rem);
    z-index: 3;
    max-width: min(54rem, 70vw);
    text-shadow: 0 0.25rem 1.6rem rgba(0, 0, 0, 0.78);
  }

  .eyebrow {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin: 0 0 0.65rem;
    color: #cbd5e1;
    font-size: clamp(0.78rem, 0.7rem + 0.15vw, 1rem);
    font-weight: 750;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  .eyebrow span {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: #64748b;
  }

  .eyebrow span.ready {
    background: #a78bfa;
    box-shadow: 0 0 1rem #a78bfa;
  }

  h1 {
    margin: 0;
    font-size: clamp(2.2rem, 1.4rem + 2.8vw, 6rem);
    letter-spacing: -0.055em;
    line-height: 0.96;
  }

  .hero-copy > p:last-child {
    margin: 0.7rem 0 0;
    color: #b9c2d0;
    font-size: clamp(0.88rem, 0.8rem + 0.18vw, 1.1rem);
    text-transform: capitalize;
  }

  .telemetry {
    position: absolute;
    top: clamp(1rem, 2.2vw, 3rem);
    right: clamp(1rem, 2.8vw, 4rem);
    z-index: 4;
    display: grid;
    grid-template-columns: repeat(7, auto);
    gap: 1rem;
    padding: 0.8rem 1rem;
    border: 1px solid var(--stroke);
    border-radius: 0.9rem;
    background: var(--panel);
    backdrop-filter: blur(1.25rem);
  }

  .reference-2d {
    position: absolute;
    top: clamp(8rem, 19vh, 12rem);
    right: clamp(1rem, 2.8vw, 4rem);
    z-index: 4;
    display: grid;
    width: clamp(15rem, 24vw, 24rem);
    aspect-ratio: 4 / 3;
    overflow: hidden;
    border: 1px solid var(--stroke);
    border-radius: 1rem;
    background: color-mix(in srgb, #070a12 72%, transparent);
    box-shadow: 0 1.2rem 4rem rgba(0, 0, 0, 0.38);
    backdrop-filter: blur(1rem);
  }

  .reference-heading {
    position: absolute;
    inset: 0.7rem 0.8rem auto;
    z-index: 2;
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    pointer-events: none;
    text-shadow: 0 0.15rem 0.8rem #000;
  }

  .reference-heading span,
  .reference-heading strong {
    font-size: 0.7rem;
    font-weight: 760;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .reference-heading span {
    color: #c4b5fd;
  }

  .reference-heading strong {
    color: #cbd5e1;
  }

  .reference-canvas,
  .reference-canvas :global(.animator-canvas),
  .reference-canvas :global(.canvas-wrapper) {
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .telemetry div {
    display: grid;
    gap: 0.1rem;
  }

  .telemetry span,
  .group-label {
    color: #94a3b8;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .telemetry strong {
    font-size: 0.9rem;
    font-variant-numeric: tabular-nums;
  }

  .control-deck {
    position: absolute;
    right: clamp(0.65rem, 2vw, 2.5rem);
    bottom: clamp(0.65rem, 2vw, 2.5rem);
    left: clamp(0.65rem, 2vw, 2.5rem);
    z-index: 5;
    display: grid;
    gap: 0.9rem;
    padding: clamp(0.8rem, 1.2vw, 1.2rem);
    border: 1px solid var(--stroke);
    border-radius: 1.15rem;
    background: var(--panel);
    box-shadow: 0 1.4rem 5rem rgba(0, 0, 0, 0.52);
    backdrop-filter: blur(1.5rem) saturate(125%);
  }

  .control-group {
    display: grid;
    gap: 0.5rem;
  }

  .control-grid {
    display: grid;
    grid-template-columns: auto auto minmax(22rem, 1fr);
    align-items: end;
    gap: 1rem;
    padding-top: 0.8rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .chip-row,
  .transport {
    display: flex;
    align-items: center;
    gap: 0.45rem;
  }

  .six-up {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  button,
  .scene-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.7rem;
    padding: 0.55rem 0.82rem;
    border: 1px solid var(--stroke);
    border-radius: 0.7rem;
    color: inherit;
    background: rgba(255, 255, 255, 0.045);
    font: inherit;
    font-size: 0.82rem;
    font-weight: 680;
    cursor: pointer;
    text-align: center;
    text-decoration: none;
  }

  button.active,
  .scene-link.active {
    border-color: color-mix(in srgb, var(--swatch, #a78bfa) 72%, white 10%);
    background: color-mix(
      in srgb,
      var(--swatch, #7c3aed) 20%,
      rgba(255, 255, 255, 0.05)
    );
    box-shadow: inset 0 0 1.4rem
      color-mix(in srgb, var(--swatch, #7c3aed) 12%, transparent);
  }

  .swatch {
    display: inline-block;
    width: 0.55rem;
    height: 0.55rem;
    margin-right: 0.45rem;
    border-radius: 50%;
    background: var(--swatch);
    box-shadow: 0 0 0.7rem var(--swatch);
    vertical-align: 0.02rem;
  }

  .transport {
    display: grid;
    grid-template-columns: auto auto minmax(8rem, 1fr) auto auto;
  }

  .transport label,
  .transport output {
    font-size: 0.8rem;
    font-weight: 700;
  }

  .transport output {
    color: #c4b5fd;
    font-variant-numeric: tabular-nums;
  }

  input[type="range"] {
    width: 100%;
    accent-color: #8b5cf6;
  }

  .status-card {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 6;
    display: grid;
    justify-items: center;
    gap: 0.7rem;
    width: min(22rem, calc(100vw - 2rem));
    padding: 1.5rem;
    transform: translate(-50%, -50%);
    border: 1px solid var(--stroke);
    border-radius: 1rem;
    background: var(--panel);
    text-align: center;
    backdrop-filter: blur(1.4rem);
  }

  .loader {
    width: 2rem;
    height: 2rem;
    border: 0.18rem solid rgba(255, 255, 255, 0.14);
    border-top-color: #a78bfa;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  button:focus-visible,
  .scene-link:focus-visible,
  input:focus-visible {
    outline: 0.18rem solid white;
    outline-offset: 0.18rem;
  }

  @container (max-width: 70rem) {
    .telemetry {
      grid-template-columns: repeat(2, auto);
    }

    .reference-2d {
      top: 8rem;
      width: clamp(13rem, 28vw, 18rem);
    }

    .six-up {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .control-grid {
      grid-template-columns: 1fr 1fr;
    }

    .transport {
      grid-column: 1 / -1;
    }
  }

  @container (max-width: 42rem) {
    .hero-copy {
      max-width: calc(100vw - 2rem);
    }

    .telemetry {
      top: auto;
      right: 0.7rem;
      bottom: 23rem;
      padding: 0.55rem 0.7rem;
    }

    .reference-2d {
      top: 7.2rem;
      right: 0.7rem;
      width: min(42vw, 15rem);
    }

    .reference-heading strong {
      display: none;
    }

    .control-grid {
      grid-template-columns: 1fr;
    }

    .transport {
      grid-column: auto;
      grid-template-columns: auto 1fr auto;
    }

    .transport label,
    .transport input {
      grid-column: 1 / -1;
    }

    .six-up {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 31rem) {
    .telemetry {
      display: none;
    }

    .reference-2d {
      top: 6.6rem;
      width: 9rem;
      border-radius: 0.7rem;
    }

    .reference-heading {
      inset: 0.4rem 0.5rem auto;
    }

    .hero-copy {
      top: 0.8rem;
      left: 0.8rem;
    }

    h1 {
      font-size: clamp(1.9rem, 9vw, 2.5rem);
    }

    .hero-copy > p:last-child {
      margin-top: 0.45rem;
      font-size: 0.78rem;
    }

    .control-deck {
      right: 0.4rem;
      bottom: 0.4rem;
      left: 0.4rem;
      gap: 0.5rem;
      padding: 0.55rem;
    }

    .control-group {
      min-width: 0;
      gap: 0.3rem;
    }

    .control-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.5rem;
      padding-top: 0.5rem;
    }

    .chip-row {
      min-width: 0;
      overflow-x: auto;
      overscroll-behavior-inline: contain;
      scrollbar-width: none;
    }

    .chip-row::-webkit-scrollbar {
      display: none;
    }

    .chip-row > :global(*) {
      flex: 0 0 auto;
    }

    .six-up {
      grid-template-columns: repeat(6, minmax(7.75rem, 1fr));
    }

    .transport {
      grid-column: 1 / -1;
      grid-template-columns: auto auto minmax(5rem, 1fr) auto auto;
    }

    .transport label,
    .transport input {
      grid-column: auto;
    }

    button,
    .scene-link {
      min-height: 2.35rem;
      padding: 0.4rem 0.65rem;
      font-size: 0.76rem;
    }
  }

  @media (max-height: 32rem) and (min-width: 50rem) {
    .hero-copy {
      top: 0.6rem;
      left: 0.8rem;
    }

    h1 {
      font-size: 2rem;
    }

    .hero-copy > p:last-child {
      display: none;
    }

    .telemetry {
      top: 0.6rem;
      right: 0.8rem;
      padding: 0.5rem 0.65rem;
    }

    .reference-2d {
      top: 4.25rem;
      right: 9.8rem;
      width: 10rem;
      border-radius: 0.7rem;
    }

    .reference-heading {
      inset: 0.4rem 0.5rem auto;
    }

    .reference-heading strong {
      display: none;
    }

    .control-deck {
      right: 0.5rem;
      bottom: 0.35rem;
      left: 0.5rem;
      grid-template-columns: minmax(20rem, 0.9fr) minmax(0, 1.4fr);
      gap: 0.6rem;
      padding: 0.45rem;
    }

    .control-grid {
      grid-template-columns: auto auto minmax(15rem, 1fr);
      gap: 0.55rem;
      padding-top: 0;
      border-top: 0;
    }

    .six-up {
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 0.25rem;
    }

    .group-label {
      font-size: 0.62rem;
    }

    button {
      min-height: 2rem;
      padding: 0.28rem 0.42rem;
      font-size: 0.7rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loader {
      animation: none;
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
