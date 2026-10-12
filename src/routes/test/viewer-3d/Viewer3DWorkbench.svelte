<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";
  import {
    Plane,
    userProportionsState,
    type CameraStateSnapshot,
  } from "@austencloud/scene-3d";
  import midflank from "#lib/shared/3d/environments/domain/models/scene-configs/ember-midflank-r5.json";
  import { SCENE_FEATURES } from "#lib/shared/3d/scene-features/domain/scene-feature-registry.js";
  import { goto } from "$app/navigation";
  import { onDestroy, onMount } from "svelte";
  import type { Material, Object3D, Scene, WebGLRenderer } from "three";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { readReviewEffect } from "./effect-review.js";

  import Viewer3DFullscreen from "#lib/shared/3d/components/Viewer3DFullscreen.svelte";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import {
    readCameraUrlPose,
    setCameraUrlPose,
  } from "#lib/shared/3d/domain/camera-url-pose.js";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { createPlaybackState } from "#lib/shared/3d/state/playback-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import demoSequenceJson from "#lib/shared/landing/data/demo-sequence.json";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE } from "#lib/shared/3d/domain/viewer-formation-facing.js";
  import { parseGridJoinToken } from "#lib/shared/foundation/domain/models/grid-join-token.js";

  const WORKBENCH_SCENES = new Set<string>([
    BackgroundType.FOREST,
    BackgroundType.AUTUMN,
    BackgroundType.COSMIC,
    BackgroundType.WINTER,
    BackgroundType.OCEAN,
    BackgroundType.EMBER,
    BackgroundType.BLOSSOM,
    BackgroundType.PRIDE,
    BackgroundType.CELESTIAL,
    BackgroundType.VOID,
  ]);
  const STREAMED_SCENE_FEATURES = ["environment"] as const;
  const reviewEffect =
    typeof window !== "undefined"
      ? readReviewEffect(new URLSearchParams(window.location.search))
      : undefined;
  const reviewEffects = reviewEffect
    ? createEffectsConfigState(undefined, { persist: false })
    : undefined;
  if (reviewEffect) reviewEffects?.setActiveEffect(reviewEffect);
  const workerReview =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("renderer") === "worker";
  const pasteProbeEnabled =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("pasteProbe") === "1";

  type ProbeHandles = { scene: Scene; renderer: WebGLRenderer };
  type ProbeWindow = Window & { __sceneHandles?: ProbeHandles };
  let probeRoot: HTMLDivElement;
  let probeReady = $state<boolean | null>(null);
  let probeLines = $state<string[]>([]);
  let probeRunning = $state(false);
  let canUndoProbePaste = $state(false);
  let canRedoProbePaste = $state(false);
  let probeTimer: ReturnType<typeof setTimeout> | undefined;
  let probeSampleTimer: ReturnType<typeof setTimeout> | undefined;
  let probeStart = 0;
  let lastProbeState = "";
  const objectIds = new WeakMap<object, number>();
  let nextObjectId = 1;

  function objectId(value: object | null | undefined): number | null {
    if (!value) return null;
    let id = objectIds.get(value);
    if (!id) {
      id = nextObjectId++;
      objectIds.set(value, id);
    }
    return id;
  }

  function materialVisible(object: Object3D): boolean {
    const material = (object as Object3D & { material?: Material | Material[] })
      .material;
    if (!material) return true;
    return (Array.isArray(material) ? material : [material]).some(
      (item) => item.visible
    );
  }

  function probeSnapshot(): string {
    const host = probeRoot?.querySelector<HTMLElement>(".viewer-3d-canvas");
    const canvas = host?.querySelector<HTMLCanvasElement>("canvas");
    const publishedHandles = (window as ProbeWindow).__sceneHandles;
    const handles =
      publishedHandles?.renderer.domElement === canvas
        ? publishedHandles
        : undefined;
    const scene = handles?.scene;
    let meshes = 0;
    let visibleMeshes = 0;
    if (scene) {
      scene.traverse((object) => {
        if (!(object as Object3D & { isMesh?: boolean }).isMesh) return;
        meshes++;
        let visible = materialVisible(object);
        for (
          let parent: Object3D | null = object;
          parent;
          parent = parent.parent
        ) {
          if (!parent.visible) visible = false;
        }
        if (visible) visibleMeshes++;
      });
    }
    const canvasStyle = canvas ? getComputedStyle(canvas) : null;
    return JSON.stringify({
      performers: viewer.performerManager.performers.length,
      selected: viewer.selectedPerformerIndex,
      background: viewer.seededBackgroundType,
      backend: host?.dataset.rendererBackend ?? null,
      ready: probeReady,
      handles: handles ? "current" : publishedHandles ? "stale" : "missing",
      scene: objectId(scene),
      children: scene?.children.length ?? null,
      meshes,
      visibleMeshes,
      sceneBackground: scene?.background?.constructor.name ?? null,
      sceneEnvironment: scene?.environment?.constructor.name ?? null,
      fog: scene?.fog?.constructor.name ?? null,
      canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
      canvasDisplay: canvasStyle?.display ?? null,
      canvasOpacity: canvasStyle?.opacity ?? null,
    });
  }

  function recordProbe(label: string, force = false): void {
    const state = probeSnapshot();
    if (!force && state === lastProbeState) return;
    lastProbeState = state;
    const handles = (window as ProbeWindow).__sceneHandles;
    const render = handles
      ? ` frame=${handles.renderer.info.render.frame} calls=${handles.renderer.info.render.calls}`
      : "";
    const line = `${Math.round(performance.now() - probeStart)}ms ${label}${render} ${state}`;
    probeLines = [...probeLines.slice(-119), line];
    console.info("[paste-probe]", line);
  }

  function stopProbe(): void {
    if (probeTimer) clearTimeout(probeTimer);
    if (probeSampleTimer) clearTimeout(probeSampleTimer);
    probeRunning = false;
  }

  function beginProbe(label: string, action: () => boolean): void {
    stopProbe();
    probeStart = performance.now();
    lastProbeState = "";
    probeLines = [];
    recordProbe("before", true);
    const succeeded = action();
    recordProbe(`${label}=${succeeded}`, true);
    probeRunning = true;
    let lastHeartbeat = probeStart;
    function sample(): void {
      const now = performance.now();
      if (now - lastHeartbeat >= 500) {
        recordProbe("heartbeat", true);
        lastHeartbeat = now;
      } else {
        recordProbe("change");
      }
      if (now - probeStart < 4000) probeSampleTimer = setTimeout(sample, 100);
      else {
        recordProbe("end", true);
        probeRunning = false;
      }
    }
    probeSampleTimer = setTimeout(sample, 100);
    probeTimer = setTimeout(() => {
      if (!probeRunning) return;
      recordProbe("wall-clock-end", true);
      stopProbe();
    }, 4500);
  }

  function pasteForProbe(): void {
    beginProbe("copy-paste", () => {
      const copied = viewer.copySelectedPerformer();
      const pasted = copied && viewer.pasteSelectedPerformer();
      canUndoProbePaste = pasted;
      canRedoProbePaste = false;
      return pasted;
    });
  }

  function undoProbePaste(): void {
    if (!canUndoProbePaste) return;
    beginProbe("undo", () => {
      const undone = Boolean(viewer.undo());
      if (undone) {
        canUndoProbePaste = false;
        canRedoProbePaste = true;
      }
      return undone;
    });
  }

  function redoProbePaste(): void {
    if (!canRedoProbePaste) return;
    beginProbe("redo", () => {
      const redone = Boolean(viewer.redo());
      if (redone) {
        canRedoProbePaste = false;
        canUndoProbePaste = true;
      }
      return redone;
    });
  }

  function requestedScene(): BackgroundType {
    if (typeof window === "undefined") return BackgroundType.BLOSSOM;
    const requested = new URLSearchParams(window.location.search).get("scene");
    return requested && WORKBENCH_SCENES.has(requested)
      ? (requested as BackgroundType)
      : BackgroundType.BLOSSOM;
  }

  function requestedCamera(): CameraStateSnapshot | null {
    if (typeof window === "undefined") return null;
    const pose = readCameraUrlPose(
      new URLSearchParams(window.location.search),
      48
    );
    if (!pose) {
      // A seeded workbench must not inherit the user's camera from a different
      // environment. null lets the shared opening-camera policy frame it.
      if (requestedScene() !== BackgroundType.EMBER) return null;
      const camera = midflank.reviewCameras[0];
      return {
        position: {
          x: camera.positionWorldXYZ[0],
          y: camera.positionWorldXYZ[1] + userProportionsState.groundY,
          z: camera.positionWorldXYZ[2],
        },
        target: {
          x: camera.targetWorldXYZ[0],
          y: camera.targetWorldXYZ[1] + userProportionsState.groundY,
          z: camera.targetWorldXYZ[2],
        },
        rotation: { x: 0, y: 0, z: 0 },
        fov: 50,
        timestamp: 0,
      };
    }
    return {
      ...pose,
      rotation: { x: 0, y: 0, z: 0 },
      timestamp: 0,
    };
  }

  function requestedPerformers() {
    if (requestedScene() !== BackgroundType.EMBER) return [];
    // Ember deliberately looks down the opposite stage axis. The shared
    // formation owner keeps that exception scoped to this environment.
    return [
      {
        position: { x: 0, z: 0 },
        facingAngle: EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE,
        customLeftPlane: Plane.WALL,
        customRightPlane: Plane.WALL,
      },
    ];
  }

  const requestedJoin =
    typeof window !== "undefined"
      ? parseGridJoinToken(
          new URLSearchParams(window.location.search).get("join") ?? ""
        )
      : undefined;
  const sequence = {
    ...demoSequenceJson,
    ...(requestedJoin ? { conjoined: requestedJoin } : {}),
  } as unknown as SequenceData;
  const viewer = createViewer3DState({
    renderMode: "3d",
    backgroundType: requestedScene(),
    camera: requestedCamera(),
    performers: requestedPerformers(),
    selectedPerformerIndex: 0,
    activeFormation: "line",
    defaultProp: PropType.STAFF,
    visiblePlanes: requestedJoin && !workerReview ? [Plane.WALL] : [],
    effectToggles: {},
    sceneFeatures: workerReview
      ? Object.fromEntries(
          SCENE_FEATURES.map((feature) => [feature.key, feature.defaultEnabled])
        )
      : {
          environment: true,
          stage: true,
          audience: false,
          campfire: false,
          tent: false,
        },
  });
  viewer.enter3D(sequence);
  // The review config supplies effect parameters; the scene reads the
  // performer's assignment to decide which effect to emit from the prop.
  if (reviewEffect) {
    viewer
      .scopedPerformers()[0]
      ?.setEffect(reviewEffect, { recordUndo: false });
  }
  if (!requestedJoin || workerReview) viewer.hideAllPlanes();
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("perf") === "1"
  ) {
    viewer.togglePerf();
  }
  setViewer3DContext(viewer);

  let currentStepBase = $state(0);
  let bpm = $state(60);
  const playback = createPlaybackState({
    persistenceKey: "tka-viewer-3d-workbench-playback",
    onCycleComplete: () => {
      const stepCount = Math.max(1, sequence.steps.length);
      currentStepBase = (currentStepBase + 1) % stepCount;
      return true;
    },
  });
  const currentStep = $derived(currentStepBase + playback.progress);

  onMount(() => {
    if (reviewEffect) {
      // Persisted isPlaying does not itself schedule an animation frame.
      playback.pause();
      playback.play();
    }
    if (!pasteProbeEnabled) return;
    const onProbeEvent = (event: Event) => {
      if (probeRunning)
        recordProbe((event as CustomEvent<string>).detail, true);
    };
    window.addEventListener("tka:paste-probe", onProbeEvent);
    return () => window.removeEventListener("tka:paste-probe", onProbeEvent);
  });

  $effect(() => {
    playback.speed = bpm / 60;
  });

  $effect(() => {
    const scene = viewer.seededBackgroundType;
    if (!scene || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("scene") === scene) return;
    url.searchParams.set("scene", scene);
    goto(url, { shallow: true, replace: true });
  });

  $effect(() => {
    const camera = viewer.cameraSnapshot;
    if (!camera || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    setCameraUrlPose(url, camera, 3);
    goto(url, { shallow: true, replace: true });
  });

  onDestroy(() => {
    stopProbe();
    playback.destroy();
    viewer.dispose();
  });
</script>

<div class="workbench" data-viewer-3d-workbench bind:this={probeRoot}>
  <Viewer3DFullscreen
    effectsConfig={reviewEffects}
    sequenceData={sequence}
    {currentStep}
    isPlaying={playback.isPlaying}
    {bpm}
    word={null}
    leftPropType="staff"
    rightPropType="staff"
    initialRevealMode={workerReview ? "gated" : "streaming"}
    cameraFov={requestedCamera()?.fov}
    initialRevealDeferredFeatures={STREAMED_SCENE_FEATURES}
    onSceneReadyChange={pasteProbeEnabled
      ? (ready) => (probeReady = ready)
      : undefined}
    onClose={() => history.back()}
    onPlaybackToggle={playback.togglePlay}
    onBpmChange={(nextBpm) => (bpm = nextBpm)}
    onProgressBarSeek={(targetStep) => {
      currentStepBase = targetStep;
      playback.setProgress(0);
    }}
  />
  {#if pasteProbeEnabled}
    <div class="paste-probe" data-paste-probe>
      <div class="paste-probe-actions">
        <button onclick={pasteForProbe} disabled={probeRunning}
          >Copy + paste selected</button
        >
        <button
          onclick={undoProbePaste}
          disabled={probeRunning || !canUndoProbePaste}>Undo probe paste</button
        >
        <button
          onclick={redoProbePaste}
          disabled={probeRunning || !canRedoProbePaste}>Redo probe paste</button
        >
        <span>{probeRunning ? "Capturing 4 seconds…" : "Ready"}</span>
      </div>
      <pre data-paste-probe-trace>{probeLines.join("\n")}</pre>
    </div>
  {/if}
</div>

<style>
  .workbench {
    position: fixed;
    inset: 0;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-panel-bg, #0a0a14);
  }
  .paste-probe {
    position: absolute;
    z-index: 1000;
    bottom: 5rem;
    left: 0.5rem;
    width: min(52rem, calc(100vw - 1rem));
    max-height: 38vh;
    padding: 0.5rem;
    overflow: auto;
    background: rgb(0 0 0 / 88%);
    color: white;
    font: 11px/1.4 monospace;
  }
  .paste-probe-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .paste-probe button {
    padding: 0.35rem 0.5rem;
  }
  .paste-probe pre {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
</style>
