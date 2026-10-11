<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";
  import type { CameraStateSnapshot } from "@austencloud/scene-3d";
  import { onDestroy, onMount } from "svelte";

  import Viewer3DCanvas from "#lib/shared/3d/components/Viewer3DCanvas.svelte";
  import {
    CharcoalRenderer3D,
    type CharcoalRenderer3DSpatialDebugSnapshot,
  } from "#lib/shared/3d/effects/charcoal/charcoal-renderer-3d.js";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { createScene3DRenderState } from "#lib/shared/3d/scene-features/state/scene-3d-render-state.svelte.js";
  import { setScene3DRenderContext } from "#lib/shared/3d/scene-features/state/scene-3d-render-context.js";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { CHARCOAL_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/charcoal-presets.js";
  import { orientationCycleExtender } from "#lib/features/create/generate/circular/services/orientation-cycle-extender.js";
  import { getGenerationOrchestrator } from "#lib/features/create/generate/shared/get-generation-orchestrator.js";
  import type { GeneratedSequenceInfo } from "#lib/features/landing/domain/models/spinner-models.js";
  import { InfiniteSequenceGenerator } from "#lib/features/landing/services/infinite-sequence-generator.js";
  import { SpinnerMetricsRepository } from "#lib/features/landing/services/spinner-metrics-repository.js";
  import { isEffectPreviewLoop } from "#lib/shared/effects/domain/effect-preview-loop-policy.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";

  const SHOWCASE_CAMERA: CameraStateSnapshot = {
    position: { x: 0, y: 0.15, z: -3.75 },
    rotation: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: -0.3, z: 0.25 },
    fov: 50,
    timestamp: 0,
  };

  const viewer = createViewer3DState({
    renderMode: "3d",
    // Cosmic has a dark, grid-free performance deck at the avatar's real
    // ground height. It preserves the silhouette without the Void scene's cyan
    // platform or the fallback ground disc intersecting the performer.
    backgroundType: BackgroundType.COSMIC,
    camera: SHOWCASE_CAMERA,
    performers: [],
    selectedPerformerIndex: null,
    activeFormation: "line",
    defaultProp: "staff",
    visiblePlanes: [],
    effectToggles: { charcoal: true },
    sceneFeatures: {
      environment: true,
      stage: false,
      audience: false,
      campfire: false,
      tent: false,
    },
  });
  viewer.hideAllPlanes();
  setViewer3DContext(viewer);

  const effectsConfig = createEffectsConfigState(undefined, { persist: false });
  effectsConfig.setActiveEffect("charcoal");
  setEffectsConfigContext(effectsConfig);
  setScene3DRenderContext(createScene3DRenderState());

  const REVIEW_PRESET_IDS = [
    "charcoal-steel-wool",
    "charcoal-forge-cinder",
    "charcoal-cinder-fan",
    "charcoal-banked-ember",
  ] as const;
  const reviewPresets = CHARCOAL_PRESETS.filter((preset) =>
    REVIEW_PRESET_IDS.some((id) => id === preset.id)
  );
  const defaultPreset = reviewPresets[0] ?? CHARCOAL_PRESETS[0];
  let activePresetId = $state(defaultPreset?.id ?? "");
  let preview = $state<GeneratedSequenceInfo | null>(null);
  let loading = $state(true);
  let error = $state("");
  let playing = $state(true);
  let bpm = $state(72);
  let currentStep = $state(0);
  let sceneReady = $state(false);
  let viewportWidth = $state(1600);
  let viewportHeight = $state(900);
  let generator: InfiniteSequenceGenerator | null = null;
  let generationToken = 0;
  let raf = 0;
  let stopCoalDiagnostics: (() => void) | null = null;

  type CapturedCoalDiagnosticFrame = CharcoalRenderer3DSpatialDebugSnapshot & {
    sequenceStep: number;
    capturedAt: number;
  };

  interface CoalDiagnosticWindow extends Window {
    __coal3DDiagnostics?: CapturedCoalDiagnosticFrame[];
  }

  const sequence = $derived(preview?.sequence ?? null);
  const countLabel = $derived(
    preview ? `${preview.sequence.steps.length} counts` : "Generating LOOP"
  );
  const loopLabel = $derived(
    preview
      ? String(preview.settings.loopType).replaceAll("_", " ")
      : "Production generator"
  );

  function applyReviewCamera(): void {
    if (!sceneReady) return;
    const aspect = viewportWidth / Math.max(1, viewportHeight);
    const distance =
      viewportHeight <= 500
        ? 4
        : aspect <= 0.55
          ? 6.6
          : aspect <= 0.8
            ? 5
            : 3.75;
    viewer.snapCameraTo(
      { x: 0, y: viewportHeight <= 500 ? 0.05 : 0.15, z: -distance },
      { x: 0, y: -0.3, z: 0.25 },
      undefined,
      false
    );
  }

  function handleSceneReady(ready: boolean): void {
    sceneReady = ready;
    applyReviewCamera();
  }

  $effect(() => {
    void viewportWidth;
    void viewportHeight;
    applyReviewCamera();
  });

  function applyPreset(presetId: string): void {
    const preset = CHARCOAL_PRESETS.find(
      (candidate) => candidate.id === presetId
    );
    if (!preset) return;
    activePresetId = preset.id;
    effectsConfig.applyPreset("charcoal", preset.id, preset.patch);
    effectsConfig.setActiveEffect("charcoal");
    for (const performer of viewer.performerManager.performers) {
      performer.setEffect("charcoal");
    }
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
      if (!next || !isEffectPreviewLoop(next.sequence)) {
        throw new Error(
          "The generated sequence did not meet the seamless LOOP contract."
        );
      }
      if (token !== generationToken) return;

      preview = next;
      currentStep = 0;
      viewer.enter3D(next.sequence);
      viewer.hideAllPlanes();
      for (const performer of viewer.performerManager.performers) {
        performer.setEffect("charcoal");
      }
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
    const diagnosticFrames: CapturedCoalDiagnosticFrame[] = [];
    (window as CoalDiagnosticWindow).__coal3DDiagnostics = diagnosticFrames;
    stopCoalDiagnostics = CharcoalRenderer3D.observeDiagnostics((snapshot) => {
      diagnosticFrames.push({
        ...snapshot,
        sequenceStep: currentStep,
        capturedAt: performance.now(),
      });
      if (diagnosticFrames.length > 600) diagnosticFrames.shift();
    });

    applyPreset(activePresetId);
    void generateLoop();

    let last = performance.now();
    const tick = (now: number) => {
      const deltaSeconds = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (playing && sequence) {
        currentStep += deltaSeconds * (bpm / 60);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });

  onDestroy(() => {
    stopCoalDiagnostics?.();
    stopCoalDiagnostics = null;
    generationToken += 1;
    if (typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(raf);
    if (typeof window !== "undefined") viewer.dispose();
  });
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
/>

<svelte:head>
  <title>3D Coal motion showcase</title>
  <meta
    name="description"
    content="A production 3D Coal effect running on a generated seamless LOOP."
  />
</svelte:head>

<main class="showcase-shell">
  <section class="stage" aria-label="Live 3D Coal effect showcase">
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
    {/if}

    <div class="stage-vignette" aria-hidden="true"></div>

    <header class="hero-copy">
      <p class="eyebrow">
        <span class="live-dot" class:ready={sceneReady}></span>3D effect review
      </p>
      <h1>Coal in motion</h1>
      <p class="lede">Real avatar. Real staff path. Fresh seamless LOOP.</p>
    </header>

    <div class="sequence-readout" aria-live="polite">
      <span>{countLabel}</span>
      <strong>{loopLabel}</strong>
    </div>

    {#if !sequence && loading}
      <div class="status-card" role="status">
        <span class="loader" aria-hidden="true"></span>
        <strong>Generating the performance</strong>
        <span>Building a production 16-count LOOP.</span>
      </div>
    {:else if !sequence && error}
      <div class="status-card error-card" role="alert">
        <strong>Couldn’t generate the LOOP</strong>
        <span>{error}</span>
        <button type="button" onclick={() => void generateLoop()}
          >Try again</button
        >
      </div>
    {/if}

    <aside class="control-deck" aria-label="Showcase controls">
      <div class="transport-row">
        <button
          type="button"
          class="transport"
          aria-label={playing ? "Pause Coal showcase" : "Play Coal showcase"}
          aria-pressed={!playing}
          onclick={() => (playing = !playing)}
        >
          <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
        </button>

        <div class="tempo-control">
          <label for="coal-showcase-bpm">Tempo</label>
          <input
            id="coal-showcase-bpm"
            type="range"
            min="40"
            max="120"
            step="1"
            bind:value={bpm}
          />
          <output for="coal-showcase-bpm">{bpm} BPM</output>
        </div>

        <button
          type="button"
          class="new-loop"
          disabled={loading}
          onclick={() => void generateLoop()}
        >
          {loading ? "Generating…" : "New LOOP"}
        </button>
      </div>

      <div class="preset-row">
        <span class="preset-label">Motion profile</span>
        <div class="preset-list" aria-label="Coal motion profiles">
          {#each reviewPresets as preset (preset.id)}
            <button
              type="button"
              class="preset-chip"
              class:active={preset.id === activePresetId}
              style:--swatch={preset.previewColor}
              aria-pressed={preset.id === activePresetId}
              onclick={() => applyPreset(preset.id)}
            >
              <span class="swatch" aria-hidden="true"></span>
              {preset.name}
            </button>
          {/each}
        </div>
      </div>
    </aside>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: #020306;
  }

  .showcase-shell {
    --coal-panel: rgba(9, 11, 18, 0.78);
    --coal-stroke: rgba(255, 255, 255, 0.13);
    --coal-text: #f8f7f4;
    --coal-muted: #a9adb8;
    width: 100%;
    height: 100svh;
    color: var(--coal-text);
    background:
      radial-gradient(
        circle at 50% 45%,
        rgba(103, 35, 24, 0.16),
        transparent 38%
      ),
      #020306;
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

  .stage-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(
        180deg,
        rgba(0, 0, 0, 0.52),
        transparent 25%,
        transparent 68%,
        rgba(0, 0, 0, 0.72)
      ),
      radial-gradient(
        circle at 50% 48%,
        transparent 28%,
        rgba(0, 0, 0, 0.34) 76%,
        rgba(0, 0, 0, 0.7)
      );
  }

  .hero-copy {
    position: absolute;
    top: clamp(1rem, 2.5vw, 3rem);
    left: clamp(1rem, 3vw, 4rem);
    z-index: 2;
    max-width: min(32rem, 72vw);
    text-shadow: 0 2px 18px rgba(0, 0, 0, 0.8);
  }

  .eyebrow {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    margin: 0 0 0.65rem;
    color: #c6c8cf;
    font-size: clamp(0.875rem, 0.78rem + 0.15vw, 1rem);
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .live-dot {
    width: 0.55rem;
    height: 0.55rem;
    border-radius: 50%;
    background: #71717a;
    box-shadow: 0 0 0 0.25rem rgba(113, 113, 122, 0.16);
  }

  .live-dot.ready {
    background: #fb704d;
    box-shadow:
      0 0 0 0.25rem rgba(251, 112, 77, 0.16),
      0 0 1.25rem rgba(251, 112, 77, 0.72);
  }

  h1 {
    margin: 0;
    font-family: var(--font-family-display, Inter, system-ui, sans-serif);
    font-size: clamp(2.4rem, 1.45rem + 3.4vw, 6.5rem);
    font-weight: 750;
    letter-spacing: -0.055em;
    line-height: 0.94;
  }

  .lede {
    margin: 0.8rem 0 0;
    color: var(--coal-muted);
    font-size: clamp(0.95rem, 0.84rem + 0.3vw, 1.25rem);
    line-height: 1.45;
  }

  .sequence-readout {
    position: absolute;
    top: clamp(1rem, 2.5vw, 3rem);
    right: clamp(1rem, 3vw, 4rem);
    z-index: 2;
    display: grid;
    justify-items: end;
    gap: 0.2rem;
    padding: 0.75rem 0.95rem;
    border: 1px solid var(--coal-stroke);
    border-radius: 0.85rem;
    background: rgba(4, 5, 8, 0.62);
    box-shadow: 0 0.8rem 2.5rem rgba(0, 0, 0, 0.28);
    backdrop-filter: blur(18px);
  }

  .sequence-readout span {
    color: var(--coal-muted);
    font-size: clamp(0.75rem, 0.7rem + 0.12vw, 0.875rem);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .sequence-readout strong {
    max-width: 18rem;
    overflow: hidden;
    font-size: clamp(0.875rem, 0.8rem + 0.2vw, 1.05rem);
    text-overflow: ellipsis;
    text-transform: capitalize;
    white-space: nowrap;
  }

  .status-card {
    position: absolute;
    left: 50%;
    top: 50%;
    z-index: 3;
    display: grid;
    justify-items: center;
    gap: 0.7rem;
    min-width: min(22rem, calc(100vw - 2rem));
    padding: 1.5rem;
    transform: translate(-50%, -50%);
    border: 1px solid var(--coal-stroke);
    border-radius: 1rem;
    background: var(--coal-panel);
    text-align: center;
    backdrop-filter: blur(18px);
  }

  .status-card strong {
    font-size: 1.05rem;
  }

  .status-card span {
    color: var(--coal-muted);
    font-size: 0.875rem;
  }

  .loader {
    width: 2rem;
    height: 2rem;
    border: 0.18rem solid rgba(255, 255, 255, 0.15);
    border-top-color: #fb704d;
    border-radius: 50%;
    animation: spin 0.85s linear infinite;
  }

  .error-card button,
  .new-loop,
  .transport,
  .preset-chip {
    min-height: 2.75rem;
    border: 1px solid var(--coal-stroke);
    color: var(--coal-text);
    font: inherit;
    cursor: pointer;
  }

  .error-card button,
  .new-loop {
    padding: 0.65rem 1rem;
    border-radius: 0.7rem;
    background: rgba(255, 255, 255, 0.09);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .control-deck {
    position: absolute;
    right: clamp(0.75rem, 2.5vw, 3rem);
    bottom: clamp(0.75rem, 2.5vw, 2.5rem);
    left: clamp(0.75rem, 2.5vw, 3rem);
    z-index: 4;
    display: grid;
    gap: 0.9rem;
    padding: clamp(0.8rem, 1.5vw, 1.2rem);
    border: 1px solid var(--coal-stroke);
    border-radius: 1.1rem;
    background: var(--coal-panel);
    box-shadow: 0 1.5rem 5rem rgba(0, 0, 0, 0.48);
    backdrop-filter: blur(22px) saturate(125%);
  }

  .transport-row {
    display: grid;
    grid-template-columns: auto minmax(14rem, 1fr) auto;
    align-items: center;
    gap: 1rem;
  }

  .transport {
    width: 3.25rem;
    min-width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    background: linear-gradient(145deg, #ff7c55, #c93e25);
    box-shadow: 0 0.7rem 2.25rem rgba(220, 67, 37, 0.3);
    font-size: 1rem;
    font-weight: 800;
  }

  .tempo-control {
    display: grid;
    grid-template-columns: auto minmax(7rem, 1fr) auto;
    align-items: center;
    gap: 0.75rem;
  }

  .tempo-control label,
  .tempo-control output,
  .preset-label {
    font-size: 0.875rem;
    font-weight: 700;
  }

  .tempo-control output {
    min-width: 4.6rem;
    color: #ffab94;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  input[type="range"] {
    width: 100%;
    accent-color: #f26743;
    cursor: pointer;
  }

  .new-loop:disabled {
    cursor: wait;
    opacity: 0.55;
  }

  .preset-row {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 1rem;
    padding-top: 0.9rem;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .preset-label {
    color: var(--coal-muted);
    white-space: nowrap;
  }

  .preset-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.55rem;
  }

  .preset-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    padding: 0.55rem 0.75rem;
    border-radius: 0.7rem;
    background: rgba(255, 255, 255, 0.035);
    font-size: 0.8125rem;
    font-weight: 650;
  }

  .preset-chip.active {
    border-color: color-mix(in srgb, var(--swatch) 74%, white 8%);
    background: color-mix(
      in srgb,
      var(--swatch) 18%,
      rgba(255, 255, 255, 0.04)
    );
    box-shadow: inset 0 0 1.35rem
      color-mix(in srgb, var(--swatch) 10%, transparent);
  }

  .swatch {
    width: 0.6rem;
    height: 0.6rem;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--swatch);
    box-shadow: 0 0 0.75rem var(--swatch);
  }

  @media (hover: hover) {
    .error-card button:hover,
    .new-loop:hover:not(:disabled),
    .preset-chip:hover {
      border-color: rgba(255, 255, 255, 0.28);
      background-color: rgba(255, 255, 255, 0.1);
    }

    .transport:hover {
      filter: brightness(1.1);
    }
  }

  button:focus-visible,
  input:focus-visible {
    outline: 0.18rem solid #ffffff;
    outline-offset: 0.18rem;
  }

  @container (max-width: 50rem) {
    .sequence-readout {
      top: 1rem;
      right: 1rem;
      bottom: auto;
    }

    .control-deck {
      gap: 0.75rem;
    }

    .transport-row {
      grid-template-columns: auto 1fr;
    }

    .new-loop {
      grid-column: 1 / -1;
    }

    .preset-row {
      grid-template-columns: 1fr;
      gap: 0.6rem;
    }

    .preset-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 31rem) {
    .showcase-shell {
      min-height: 38rem;
    }

    .hero-copy {
      max-width: calc(100vw - 2rem);
    }

    .lede {
      max-width: 14rem;
    }

    .sequence-readout {
      top: auto;
      bottom: 22rem;
      max-width: 9rem;
    }

    .control-deck {
      padding: 0.75rem;
    }

    .transport-row {
      gap: 0.7rem;
    }

    .tempo-control {
      grid-template-columns: 1fr auto;
      gap: 0.35rem 0.6rem;
    }

    .tempo-control input {
      grid-column: 1 / -1;
      grid-row: 2;
    }

    .preset-chip {
      justify-content: flex-start;
      min-width: 0;
      padding-inline: 0.65rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }

  @media (max-height: 32rem) and (min-width: 50rem) {
    .hero-copy {
      top: 0.75rem;
      left: 1rem;
    }

    h1 {
      font-size: clamp(2.5rem, 7vw, 3.75rem);
    }

    .eyebrow {
      margin-bottom: 0.35rem;
    }

    .lede {
      margin-top: 0.4rem;
      font-size: 0.875rem;
    }

    .sequence-readout {
      top: 0.75rem;
      right: 1rem;
      padding: 0.55rem 0.7rem;
    }

    .control-deck {
      right: 0.75rem;
      bottom: 0.5rem;
      left: 0.75rem;
      gap: 0.45rem;
      padding: 0.55rem 0.7rem;
      border-radius: 0.85rem;
    }

    .transport-row {
      gap: 0.65rem;
    }

    .transport {
      width: 2.75rem;
      min-width: 2.75rem;
      height: 2.75rem;
    }

    .preset-row {
      gap: 0.65rem;
      padding-top: 0.45rem;
    }

    .preset-chip {
      min-height: 2.25rem;
      padding-block: 0.35rem;
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
