<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";
  import type { CameraStateSnapshot } from "@austencloud/scene-3d";
  import { onDestroy, onMount } from "svelte";
  import type { WebGLRenderer } from "three";

  import Viewer3DCanvas from "#lib/shared/3d/components/Viewer3DCanvas.svelte";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import type { EnvironmentTransitionObservation } from "#lib/shared/3d/environments/domain/environment-transition.js";
  import { getPerformerStageBounds } from "#lib/shared/3d/environments/domain/performer-stage-bounds.js";
  import { sceneAudioState } from "#lib/shared/3d/state/scene-audio-state.svelte.js";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import demoJson from "#lib/shared/landing/data/demo-sequence.json";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
  import { page } from "$app/state";
  import CloudbreakAssetCatalog from "../celestial-asset-catalog/+page.svelte";

  interface RendererSample {
    fps: number;
    drawCalls: number;
    triangles: number;
    geometries: number;
    textures: number;
    programs: number;
  }

  interface Gate5Probe {
    backgroundType: BackgroundType;
    performerCount: number;
    sceneReady: boolean;
    transition: EnvironmentTransitionObservation<BackgroundType>;
    stage: ReturnType<typeof getPerformerStageBounds>;
    audio: {
      visible: boolean;
      unlocked: boolean;
      playing: boolean;
      muted: boolean;
      volume: number;
    };
    renderer: RendererSample;
  }

  const sequence = demoJson as unknown as SequenceData;
  const heroCamera: CameraStateSnapshot = {
    position: { x: 11, y: 7.8, z: 30 },
    rotation: { x: 0, y: 0, z: 0 },
    target: { x: 0, y: 0.8, z: -5 },
    fov: 50,
    timestamp: 0,
  };
  const viewer = createViewer3DState({
    renderMode: "3d",
    camera: heroCamera,
    sceneFeatures: {
      environment: true,
      stage: true,
      audience: false,
      campfire: true,
      tent: true,
    },
  });
  setViewer3DContext(viewer);

  const environmentOptions = [
    { type: BackgroundType.AUTUMN, label: "Autumn" },
    { type: BackgroundType.CELESTIAL, label: "Cloudbreak" },
    { type: BackgroundType.VOID, label: "Void" },
    { type: BackgroundType.OCEAN, label: "Ocean" },
  ] as const;
  const performerOptions = [1, 4, 8] as const;
  const desktopHeroCamera = {
    position: { x: 11, y: 7.8, z: 30 },
    target: { x: 0, y: 0.8, z: -5 },
  } as const;
  const portraitHeroCamera = {
    position: { x: 8, y: 9.5, z: 45 },
    target: { x: 0, y: 1, z: -5 },
  } as const;
  const landscapePhoneHeroCamera = {
    position: { x: 10, y: 7.2, z: 29 },
    target: { x: 0, y: 0.7, z: -5 },
  } as const;

  let mounted = $state(false);
  let sceneReady = $state(false);
  let viewportWidth = $state(1920);
  let viewportHeight = $state(1080);
  let renderer = $state<WebGLRenderer | null>(null);
  let rendererSample = $state<RendererSample>({
    fps: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
    programs: 0,
  });
  const initialBackgroundType =
    settingsService.settings.backgroundType ?? BackgroundType.CELESTIAL;
  let transition = $state<EnvironmentTransitionObservation<BackgroundType>>({
    requestedKey: initialBackgroundType,
    mountedKey: initialBackgroundType,
    phase: "idle",
    settled: false,
  });
  let raf = 0;
  let frames = 0;
  let sampleStartedAt = 0;

  const backgroundType = $derived(
    settingsService.settings.backgroundType ?? initialBackgroundType
  );
  const catalogMode = $derived(page.url.searchParams.get("view") === "assets");
  const performerCount = $derived(viewer.performerManager.performers.length);
  const stageBounds = $derived(
    getPerformerStageBounds(
      viewer.performerManager.performers.map((performer) => performer.position)
    )
  );
  const audioVisible = $derived(
    backgroundType === BackgroundType.CELESTIAL ||
      backgroundType === BackgroundType.OCEAN
  );
  const hideControls = $derived(page.url.searchParams.has("clean"));

  function publishProbe(): void {
    if (typeof window === "undefined") return;
    (
      window as typeof window & { __celestialGate5?: Gate5Probe }
    ).__celestialGate5 = {
      backgroundType,
      performerCount,
      sceneReady,
      transition: { ...transition },
      stage: { ...stageBounds },
      audio: {
        visible: audioVisible,
        unlocked: sceneAudioState.audioUnlocked,
        playing: sceneAudioState.playing,
        muted: sceneAudioState.muted,
        volume: sceneAudioState.masterVolume,
      },
      renderer: { ...rendererSample },
    };
  }

  function handleRendererReady(nextRenderer: WebGLRenderer | null): void {
    renderer = nextRenderer;
    publishProbe();
  }

  function handleTransitionChange(
    observation: EnvironmentTransitionObservation<BackgroundType>
  ): void {
    transition = observation;
    publishProbe();
  }

  function applyReviewCamera(): void {
    if (!sceneReady) return;
    const camera =
      viewportHeight <= 500
        ? landscapePhoneHeroCamera
        : viewportWidth / Math.max(1, viewportHeight) <= 0.8
          ? portraitHeroCamera
          : desktopHeroCamera;
    viewer.snapCameraTo(camera.position, camera.target, undefined, false);
  }

  async function selectEnvironment(type: BackgroundType): Promise<void> {
    await settingsService.updateSetting("backgroundType", type);
    publishProbe();
  }

  function setPerformerCount(target: (typeof performerOptions)[number]): void {
    while (viewer.performerManager.performers.length < target) {
      viewer.spawnPerformerFromUI();
    }
    while (viewer.performerManager.performers.length > target) {
      viewer.removePerformerFromUI();
    }
    publishProbe();
  }

  function sampleRenderer(now: number): void {
    frames += 1;
    if (sampleStartedAt === 0) sampleStartedAt = now;
    const elapsed = now - sampleStartedAt;
    if (renderer && elapsed >= 500) {
      const info = renderer.info;
      rendererSample = {
        fps: Math.round((frames * 1000) / elapsed),
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
      };
      frames = 0;
      sampleStartedAt = now;
      publishProbe();
    }
    raf = requestAnimationFrame(sampleRenderer);
  }

  onMount(async () => {
    if (catalogMode) return;
    viewer.enter3D(sequence);
    mounted = true;

    const requestedBackground = page.url.searchParams
      .get("background")
      ?.toLowerCase();
    const matchingEnvironment = environmentOptions.find(
      ({ type }) => type === requestedBackground
    );
    if (matchingEnvironment) {
      await selectEnvironment(matchingEnvironment.type);
    }

    const requestedPerformerCount = Number(
      page.url.searchParams.get("performers")
    );
    if (performerOptions.includes(requestedPerformerCount as 1 | 4 | 8)) {
      setPerformerCount(requestedPerformerCount as 1 | 4 | 8);
    }

    raf = requestAnimationFrame(sampleRenderer);
    publishProbe();
  });

  $effect(() => {
    void backgroundType;
    void performerCount;
    void sceneReady;
    void transition;
    void stageBounds;
    void audioVisible;
    void sceneAudioState.audioUnlocked;
    void sceneAudioState.playing;
    void sceneAudioState.muted;
    void sceneAudioState.masterVolume;
    publishProbe();
  });

  $effect(() => {
    void viewportWidth;
    void viewportHeight;
    void sceneReady;
    applyReviewCamera();
  });

  onDestroy(() => {
    cancelAnimationFrame(raf);
    viewer.dispose();
    if (typeof window !== "undefined") {
      delete (window as typeof window & { __celestialGate5?: Gate5Probe })
        .__celestialGate5;
    }
  });
</script>

<svelte:window
  bind:innerWidth={viewportWidth}
  bind:innerHeight={viewportHeight}
/>

<svelte:head>
  <title
    >{catalogMode
      ? "Olive Cloudbreak asset bench"
      : "Olive Cloudbreak Gate 5 integration"}</title
  >
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#if catalogMode}
  <CloudbreakAssetCatalog />
{:else}
  <main
    class="gate-five"
    data-background={backgroundType}
    data-mounted-background={transition.mountedKey ?? "none"}
    data-transition-phase={transition.phase}
    data-transition-settled={transition.settled}
    data-performer-count={performerCount}
    data-scene-ready={sceneReady}
    data-audio-visible={audioVisible}
    data-renderer-fps={rendererSample.fps}
    data-renderer-draw-calls={rendererSample.drawCalls}
    data-renderer-triangles={rendererSample.triangles}
    data-renderer-geometries={rendererSample.geometries}
    data-renderer-textures={rendererSample.textures}
    data-renderer-programs={rendererSample.programs}
  >
    <section
      class="viewer-stage"
      aria-label="Olive Cloudbreak production viewer"
    >
      {#if mounted}
        <Viewer3DCanvas
          sequenceData={sequence}
          currentStep={0}
          isPlaying={false}
          bpm={60}
          leftPropType="staff"
          rightPropType="staff"
          onSceneReadyChange={(ready) => {
            sceneReady = ready;
            applyReviewCamera();
          }}
          onRendererReady={handleRendererReady}
          onEnvironmentTransitionChange={handleTransitionChange}
        />
      {/if}
    </section>

    <div class="status-card" aria-live="polite">
      <span class="gate-label">Gate 5</span>
      <strong
        >{environmentOptions.find(({ type }) => type === backgroundType)
          ?.label ?? backgroundType}</strong
      >
      <span
        >{performerCount}
        {performerCount === 1 ? "performer" : "performers"}</span
      >
      <span class:ready={transition.settled}>
        {transition.settled ? "Integrated" : transition.phase}
      </span>
    </div>

    {#if !hideControls}
      <aside class="review-panel" aria-label="Gate 5 review controls">
        <div class="review-heading">
          <span>Integration review</span>
          <output
            >{rendererSample.fps} FPS · {rendererSample.geometries}
            geometries</output
          >
        </div>

        <div class="control-section">
          <span class="control-label">Environment</span>
          <div
            class="option-grid environments"
            role="group"
            aria-label="Environment"
          >
            {#each environmentOptions as option}
              <button
                type="button"
                class:active={backgroundType === option.type}
                aria-pressed={backgroundType === option.type}
                onclick={() => void selectEnvironment(option.type)}
              >
                {option.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="control-section performer-section">
          <span class="control-label">Performers</span>
          <div
            class="option-grid performers"
            role="group"
            aria-label="Performer count"
          >
            {#each performerOptions as count}
              <button
                type="button"
                class:active={performerCount === count}
                aria-pressed={performerCount === count}
                onclick={() => setPerformerCount(count)}
              >
                {count === 1 ? "Solo" : count}
              </button>
            {/each}
          </div>
        </div>
      </aside>
    {/if}
  </main>
{/if}

<style>
  :global(body) {
    overflow: hidden;
    background: #111827;
  }

  .gate-five {
    --gate-panel-bg: rgb(17 26 39 / 0.9);
    --gate-panel-stroke: rgb(232 241 247 / 0.24);
    --gate-text: #f6f1e8;
    --gate-text-dim: #c5cfda;
    --gate-active: #f1dfb8;
    --gate-active-text: #263247;

    position: fixed;
    inset: 0;
    overflow: hidden;
    color: var(--gate-text);
    font-family: Inter, system-ui, sans-serif;
  }

  .viewer-stage {
    position: absolute;
    inset: 0;
  }

  .status-card,
  .review-panel {
    position: fixed;
    z-index: 60;
    border: 1px solid var(--gate-panel-stroke);
    background: var(--gate-panel-bg);
    box-shadow: 0 1rem 3rem rgb(5 10 18 / 0.26);
  }

  .status-card {
    top: auto;
    bottom: 4.9rem;
    left: 1rem;
    display: flex;
    align-items: center;
    gap: 0.65rem;
    min-height: 2.75rem;
    padding: 0.55rem 0.8rem;
    border-radius: 999px;
    font-size: max(14px, 0.875rem);
  }

  .status-card span {
    color: var(--gate-text-dim);
  }

  .status-card .gate-label {
    color: #f1cd84;
    font-weight: 760;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .status-card .ready {
    color: #b8efc5;
  }

  .review-panel {
    top: 1rem;
    right: 1rem;
    display: grid;
    gap: 0.7rem;
    width: min(38rem, calc(100vw - 2rem));
    padding: 0.75rem;
    border-radius: 1rem;
  }

  .review-heading,
  .control-section {
    display: flex;
    align-items: center;
    gap: 0.65rem;
  }

  .review-heading {
    justify-content: space-between;
    min-height: 1.5rem;
    font-size: max(14px, 0.875rem);
    font-weight: 680;
  }

  .review-heading output {
    color: var(--gate-text-dim);
    font-variant-numeric: tabular-nums;
    font-weight: 520;
  }

  .control-label {
    flex: 0 0 6.5rem;
    color: var(--gate-text-dim);
    font-size: max(12px, 0.75rem);
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .option-grid {
    display: grid;
    flex: 1 1 auto;
    gap: 0.35rem;
    min-width: 0;
  }

  .environments {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .performers {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  button {
    min-width: 0;
    min-height: 2.75rem;
    padding: 0.55rem 0.7rem;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 0.7rem;
    color: var(--gate-text);
    background: rgb(255 255 255 / 0.06);
    font:
      650 max(14px, 0.875rem) / 1 system-ui,
      sans-serif;
    cursor: pointer;
  }

  button:hover {
    border-color: rgb(255 255 255 / 0.3);
    background: rgb(255 255 255 / 0.12);
  }

  button:focus-visible {
    outline: 2px solid #fff1c8;
    outline-offset: 2px;
  }

  button.active {
    border-color: var(--gate-active);
    color: var(--gate-active-text);
    background: var(--gate-active);
  }

  @media (max-width: 70rem) {
    .status-card {
      right: 0.75rem;
      left: 0.75rem;
      justify-content: center;
      width: fit-content;
      max-width: calc(100vw - 1.5rem);
      margin-inline: auto;
    }

    .review-panel {
      top: 0.75rem;
      right: 0.75rem;
      width: min(38rem, calc(100vw - 1.5rem));
    }
  }

  @media (max-width: 36rem) {
    .review-panel {
      left: 0.75rem;
      gap: 0.55rem;
      padding: 0.6rem;
    }

    .review-heading {
      padding-inline: 0.15rem;
    }

    .control-section {
      align-items: stretch;
      flex-direction: column;
      gap: 0.3rem;
    }

    .control-label {
      flex-basis: auto;
    }

    .environments {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .status-card {
      gap: 0.45rem;
      padding-inline: 0.65rem;
    }

    .status-card strong,
    .status-card span:nth-of-type(2) {
      display: none;
    }
  }

  @media (max-height: 31rem) and (min-width: 40rem) {
    .review-panel {
      grid-template-columns: auto minmax(22rem, 1fr) minmax(14rem, 0.55fr);
      align-items: center;
      width: min(68rem, calc(100vw - 1.5rem));
    }

    .review-heading {
      align-items: flex-start;
      flex-direction: column;
      justify-content: center;
    }

    .control-section {
      gap: 0.45rem;
    }

    .control-label {
      flex-basis: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }
  }
</style>
