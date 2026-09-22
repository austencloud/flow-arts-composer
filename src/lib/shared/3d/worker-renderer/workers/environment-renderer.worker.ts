import {
  ACESFilmicToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";
import type {
  WorkerCameraSnapshot,
  WorkerEffectQualityTier,
  WorkerEnvironmentKey,
  WorkerRendererBootMetrics,
  WorkerRendererInMessage,
  WorkerRendererOutMessage,
  WorkerPerformerSnapshot,
  WorkerSceneEffectsSnapshot,
  WorkerViewport,
} from "../domain/worker-renderer-protocol";
import {
  clampWorkerViewport,
  resolveWorkerRenderQuality,
  WORKER_PREPARATION_VIEWPORT,
} from "../domain/worker-renderer-protocol";
import { createOceanPrototypeWorld } from "../worlds/ocean-prototype-world";
import { createRainbowPrototypeWorld } from "../worlds/rainbow-prototype-world";
import { createVoidPrototypeWorld } from "../worlds/void-prototype-world";
import { createWinterPrototypeWorld } from "../worlds/winter-prototype-world";
import { createCelestialPrototypeWorld } from "../worlds/celestial-prototype-world";
import { createCosmicPrototypeWorld } from "../worlds/cosmic-prototype-world";
import { createForestPrototypeWorld } from "../worlds/forest-prototype-world";
import { createBlossomPrototypeWorld } from "../worlds/blossom-prototype-world";
import { createAutumnPrototypeWorld } from "../worlds/autumn-prototype-world";
import { createEmberPrototypeWorld } from "../worlds/ember-prototype-world";
import type {
  WorkerEnvironmentWorld,
  WorkerWorldFactory,
} from "../worlds/worker-environment-world";
import { WorkerPerformerStage } from "../worlds/worker-performer";
import {
  primeWorkerRenderer,
  warmWorkerRenderer,
} from "../services/worker-renderer-warmup";
import {
  createViewerBaseLightingGroup,
  resolveViewerBaseLighting,
} from "../../rendering/viewer-lighting-rig";
import {
  ScenePostProcessingPipeline,
  type ScenePostProcessingPipelineConfig,
} from "../../effects/post-processing/scene-post-processing-pipeline";
import { SceneEffectsManager3D } from "../../effects/scene-effects/scene-effects-manager-3d";
import { WorkerImperativeEffects3D } from "../effects/worker-imperative-effects-3d";
import type {
  SceneEffectRigFrame3D,
  SceneEffectTipSource3D,
} from "../../effects/scene-effects/scene-effect-source-3d";
import { mergeWorkerSceneEffects } from "../effects/merge-worker-scene-effects";
import {
  createWorkerProgressReporter,
  type WorkerProgressReporter,
} from "../services/worker-progress-reporter";
import { WorkerRetainedSceneCache } from "../services/worker-retained-scene-cache";
import {
  estimateWorkerRuntimeBytes,
  retainedSceneBudgetBytes,
} from "../services/worker-runtime-memory-estimate";
import {
  clearWorkerSceneAssets,
  prefetchWorkerSceneAssets,
  selectWorkerSceneAssets,
} from "../services/worker-scene-assets";

const scope = self as unknown as DedicatedWorkerGlobalScope;

const WORLD_FACTORIES: Readonly<
  Record<WorkerEnvironmentKey, WorkerWorldFactory>
> = {
  ocean: createOceanPrototypeWorld,
  rainbow: createRainbowPrototypeWorld,
  void: createVoidPrototypeWorld,
  winter: createWinterPrototypeWorld,
  celestial: createCelestialPrototypeWorld,
  cosmic: createCosmicPrototypeWorld,
  forest: createForestPrototypeWorld,
  blossom: createBlossomPrototypeWorld,
  autumn: createAutumnPrototypeWorld,
  ember: createEmberPrototypeWorld,
};

interface SceneRequest {
  requestId: number;
  environment: WorkerEnvironmentKey;
  reducedMotion: boolean;
  acceptedAt: number;
  rendererReadyAt: number;
}

interface SceneRuntime {
  environment: WorkerEnvironmentKey;
  reducedMotion: boolean;
  estimatedBytes: number;
  world: WorkerEnvironmentWorld;
  performerStage: WorkerPerformerStage;
  postProcessing: ScenePostProcessingPipeline | null;
  sceneEffectsManager: SceneEffectsManager3D;
  sceneEffectsRegistration: { dispose(): void };
  imperativeEffects: WorkerImperativeEffects3D;
  sceneEffectsFrame: SceneEffectRigFrame3D;
  cacheSkipReason: string | null;
  rendererState: {
    outputColorSpace: WebGLRenderer["outputColorSpace"];
    toneMapping: WebGLRenderer["toneMapping"];
    toneMappingExposure: number;
    shadowsEnabled: boolean;
  };
  dispose(): void;
}

const retainedScenes = new WorkerRetainedSceneCache<SceneRuntime>(
  retainedSceneBudgetBytes(
    (scope.navigator as WorkerNavigator & { deviceMemory?: number })
      .deviceMemory
  )
);

let requestId = 0;
let latestRequestedId = 0;
let environment: WorkerEnvironmentKey | null = null;
let renderer: WebGLRenderer | null = null;
let camera: PerspectiveCamera | null = null;
let world: WorkerEnvironmentWorld | null = null;
let performerStage: WorkerPerformerStage | null = null;
let postProcessing: ScenePostProcessingPipeline | null = null;
let sceneEffectsManager: SceneEffectsManager3D | null = null;
let sceneEffectsRegistration: { dispose(): void } | null = null;
let imperativeEffects: WorkerImperativeEffects3D | null = null;
let sceneEffectsFrame: SceneEffectRigFrame3D = {
  playing: false,
  sources: [],
};
let performerSnapshots: readonly WorkerPerformerSnapshot[] = [];
let externalEffects: WorkerSceneEffectsSnapshot = {
  playing: false,
  sources: [],
};
let animationFrame = 0;
let frameCount = 0;
let previousFrameAt = 0;
let visible = true;
let retainSceneCache = true;
let disposed = false;
let qualityTier: WorkerEffectQualityTier = "medium";
let preparingFirstFrame = true;
let requestedViewport: WorkerViewport = WORKER_PREPARATION_VIEWPORT;
let renderCanvas: OffscreenCanvas | null = null;
let desiredRequest: SceneRequest | null = null;
let transitionRunning = false;
let posterInstalled = false;
const posterReady = new Set<number>();
const posterWaiters = new Map<number, () => void>();

function post(
  message: WorkerRendererOutMessage,
  transfer: Transferable[] = []
): void {
  scope.postMessage(message, transfer);
}

let postProgress: WorkerProgressReporter = createWorkerProgressReporter(
  ({ phase, fraction }) => {
    post({ type: "progress", requestId, phase, fraction });
  }
);

function resetProgressReporter(progressRequestId: number): void {
  postProgress.cancel();
  postProgress = createWorkerProgressReporter(({ phase, fraction }) => {
    post({
      type: "progress",
      requestId: progressRequestId,
      phase,
      fraction,
    });
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function applyViewport(viewportInput: WorkerViewport): void {
  if (!renderer || !camera) return;
  const viewport = clampWorkerViewport(viewportInput);
  requestedViewport = viewport;
  const renderViewport = preparingFirstFrame
    ? WORKER_PREPARATION_VIEWPORT
    : viewport;
  renderer.setPixelRatio(renderViewport.dpr);
  renderer.setSize(renderViewport.width, renderViewport.height, false);
  // Framing belongs to the requested display, even while the hidden renderer
  // rasterizes its preparation passes into a single pixel.
  camera.aspect = viewport.width / viewport.height;
  camera.updateProjectionMatrix();
  postProcessing?.resize(renderViewport.width, renderViewport.height);
}

function createPostProcessingPipeline(
  activeEnvironment: WorkerEnvironmentKey
): ScenePostProcessingPipeline | null {
  if (!renderer || !camera || !world) return null;
  return new ScenePostProcessingPipeline({
    renderer,
    scene: world.scene,
    camera,
    config: createPostProcessingConfig(activeEnvironment, qualityTier),
  });
}

function createPostProcessingConfig(
  activeEnvironment: WorkerEnvironmentKey,
  activeQualityTier: WorkerEffectQualityTier
): ScenePostProcessingPipelineConfig {
  const isOcean = activeEnvironment === "ocean";
  const quality = resolveWorkerRenderQuality(activeQualityTier, isOcean);
  return {
    enabled: quality.composerEnabled,
    isOcean,
    tierBloom: quality.tierBloom,
    enableShadows: quality.enableShadows,
    bloomResolutionScale: 1,
    bloomLevels: 8,
    tierBloomResolutionScale: quality.bloomResolutionScale,
    tierBloomLevels: quality.bloomLevels,
    enableBloom: true,
    enableChromaticAberration: true,
    oceanBloom: true,
    oceanWaterTint: true,
    oceanWaterTintStrength: 0.8,
    oceanUnderwaterDistortion: false,
  };
}

function applyQualityTier(nextTier: WorkerEffectQualityTier): void {
  qualityTier = nextTier;
  if (!renderer) return;
  const quality = resolveWorkerRenderQuality(
    qualityTier,
    environment === "ocean"
  );
  if (postProcessing && world && camera && environment) {
    postProcessing.updateConfig(
      createPostProcessingConfig(environment, qualityTier),
      world.scene,
      camera
    );
  }
  // Disabling Ocean's composer restores the renderer state captured when it
  // was built, so shadows must be assigned after that lifecycle completes.
  renderer.shadowMap.enabled = quality.enableShadows;
}

function renderCurrentFrame(deltaSeconds: number): void {
  if (!renderer || !camera || !world) return;
  imperativeEffects?.update(deltaSeconds, camera);
  sceneEffectsManager?.update(deltaSeconds);
  if (postProcessing)
    postProcessing.render(deltaSeconds, { forceBaseRender: true });
  else renderer.render(world.scene, camera);
}

function applyEffects(snapshot: WorkerSceneEffectsSnapshot): void {
  sceneEffectsFrame.playing = snapshot.playing;
  sceneEffectsFrame.sources = Array.from(
    snapshot.sources
  ) as SceneEffectTipSource3D[];
  if (sceneEffectsFrame.sources.length === 0) sceneEffectsManager?.clear();
  if (camera) imperativeEffects?.apply(snapshot.imperative ?? [], camera);
}

function applyCurrentEffects(): void {
  const performerEffects = performerStage?.getEffects();
  applyEffects(
    mergeWorkerSceneEffects(externalEffects, performerEffects ?? null)
  );
}

function applyCamera(snapshot: WorkerCameraSnapshot): void {
  if (!camera) return;
  camera.position.fromArray(snapshot.position);
  camera.fov = snapshot.fov;
  if (snapshot.up) camera.up.fromArray(snapshot.up);
  else camera.up.set(0, 1, 0);
  if (snapshot.quaternion) camera.quaternion.fromArray(snapshot.quaternion);
  else camera.lookAt(...snapshot.target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

function rendererMemory(): Pick<
  WorkerRendererBootMetrics,
  "geometries" | "textures" | "programs"
> {
  const info = renderer?.info;
  const programs = (info as typeof info & { programs?: unknown[] })?.programs;
  return {
    geometries: info?.memory.geometries ?? 0,
    textures: info?.memory.textures ?? 0,
    programs: programs?.length ?? 0,
  };
}

function captureRendererState(): SceneRuntime["rendererState"] | null {
  if (!renderer) return null;
  return {
    outputColorSpace: renderer.outputColorSpace,
    toneMapping: renderer.toneMapping,
    toneMappingExposure: renderer.toneMappingExposure,
    shadowsEnabled: renderer.shadowMap.enabled,
  };
}

function restoreRendererState(state: SceneRuntime["rendererState"]): void {
  if (!renderer) return;
  renderer.outputColorSpace = state.outputColorSpace;
  renderer.toneMapping = state.toneMapping;
  renderer.toneMappingExposure = state.toneMappingExposure;
  renderer.shadowMap.enabled = state.shadowsEnabled;
}

function restoreDefaultRendererState(): void {
  restoreRendererState({
    outputColorSpace: SRGBColorSpace,
    toneMapping: ACESFilmicToneMapping,
    toneMappingExposure: 1,
    shadowsEnabled: false,
  });
}

function detachSceneRuntime(): SceneRuntime | null {
  if (
    !world ||
    !performerStage ||
    !sceneEffectsManager ||
    !sceneEffectsRegistration ||
    !imperativeEffects
  ) {
    return null;
  }
  if (animationFrame) scope.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  previousFrameAt = 0;
  const rendererState = captureRendererState();
  if (!rendererState) return null;
  const memoryEstimate = estimateWorkerRuntimeBytes(
    world.scene,
    requestedViewport
  );
  const runtime: SceneRuntime = {
    environment: world.environment,
    reducedMotion: activeRuntimeReducedMotion,
    estimatedBytes: memoryEstimate.bytes,
    cacheSkipReason: memoryEstimate.skipReason,
    world,
    performerStage,
    postProcessing,
    sceneEffectsManager,
    sceneEffectsRegistration,
    imperativeEffects,
    sceneEffectsFrame,
    rendererState,
    dispose() {
      this.postProcessing?.dispose();
      this.performerStage.dispose();
      this.imperativeEffects.dispose();
      this.sceneEffectsRegistration.dispose();
      this.sceneEffectsManager.dispose();
      this.sceneEffectsFrame.playing = false;
      this.sceneEffectsFrame.sources = [];
      this.world.dispose();
      renderer?.renderLists.dispose();
    },
  };
  world = null;
  performerStage = null;
  postProcessing = null;
  sceneEffectsManager = null;
  sceneEffectsRegistration = null;
  imperativeEffects = null;
  sceneEffectsFrame = { playing: false, sources: [] };
  activeRuntimeReducedMotion = false;
  return runtime;
}

function attachSceneRuntime(runtime: SceneRuntime): void {
  world = runtime.world;
  performerStage = runtime.performerStage;
  postProcessing = runtime.postProcessing;
  sceneEffectsManager = runtime.sceneEffectsManager;
  sceneEffectsRegistration = runtime.sceneEffectsRegistration;
  imperativeEffects = runtime.imperativeEffects;
  sceneEffectsFrame = runtime.sceneEffectsFrame;
  environment = runtime.environment;
  activeRuntimeReducedMotion = runtime.reducedMotion;
  restoreRendererState(runtime.rendererState);
  applyQualityTier(qualityTier);
  world.setPerformers?.(performerSnapshots);
  applyCurrentEffects();
}

function renderFrame(now: number): void {
  if (disposed || !renderer || !camera || !world) return;
  const deltaMs = previousFrameAt === 0 ? 0 : now - previousFrameAt;
  previousFrameAt = now;
  if (visible) {
    world.update(Math.min(deltaMs / 1000, 0.1), now / 1000);
    performerStage?.update(Math.min(deltaMs / 1000, 0.1));
    applyCurrentEffects();
    renderCurrentFrame(deltaMs / 1000);
    frameCount += 1;
    post({
      type: "frame",
      requestId,
      environment: world.environment,
      frame: frameCount,
      renderedAt: now,
      deltaMs,
    });
  }
  if (visible) animationFrame = scope.requestAnimationFrame(renderFrame);
}

async function nextWorkerFrame(): Promise<number> {
  return new Promise((resolve) => {
    animationFrame = scope.requestAnimationFrame(resolve);
  });
}

function queueScene(request: SceneRequest): void {
  latestRequestedId = request.requestId;
  desiredRequest = request;
  post({
    type: "booting",
    requestId: request.requestId,
    environment: request.environment,
    acceptedAt: request.acceptedAt,
  });
  if (!transitionRunning) void runTransition();
}

function isSuperseded(sceneRequest: SceneRequest): boolean {
  return disposed || latestRequestedId !== sceneRequest.requestId;
}

async function waitForPoster(requestId: number): Promise<void> {
  if (posterReady.delete(requestId)) return;
  await new Promise<void>((resolve) => {
    posterWaiters.set(requestId, resolve);
  });
}

async function capturePoster(captureRequestId: number): Promise<void> {
  if (!renderer || !world || !renderCanvas) return;
  if (animationFrame) scope.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  const capturedEnvironment = world.environment;
  renderCurrentFrame(0);
  const bitmap = renderCanvas.transferToImageBitmap();
  // Transferring replaces the source image. Re-render synchronously so the
  // live canvas remains complete until the application installs its poster.
  renderCurrentFrame(0);
  post(
    {
      type: "poster",
      requestId: captureRequestId,
      environment: capturedEnvironment,
      bitmap,
    },
    [bitmap]
  );
  await waitForPoster(captureRequestId);
  if (disposed) return;
  posterInstalled = true;
  preparingFirstFrame = true;
  applyViewport(requestedViewport);
}

function disposeSceneRuntime(): void {
  const runtime = detachSceneRuntime();
  if (runtime) {
    runtime.dispose();
  } else {
    if (animationFrame) scope.cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    previousFrameAt = 0;
    postProcessing?.dispose();
    postProcessing = null;
    performerStage?.dispose();
    performerStage = null;
    imperativeEffects?.dispose();
    imperativeEffects = null;
    sceneEffectsRegistration?.dispose();
    sceneEffectsRegistration = null;
    sceneEffectsManager?.dispose();
    sceneEffectsManager = null;
    sceneEffectsFrame.playing = false;
    sceneEffectsFrame.sources = [];
    world?.dispose();
    world = null;
    activeRuntimeReducedMotion = false;
  }
  renderer?.renderLists.dispose();
}

let reducedMotion = false;
let activeRuntimeReducedMotion = false;

async function prepareScene(sceneRequest: SceneRequest): Promise<boolean> {
  if (!renderer || !camera) return false;
  const activeRenderer = renderer;
  requestId = sceneRequest.requestId;
  environment = sceneRequest.environment;
  // Ember's simple valley extends beyond the close performer environment.
  // Reset on every transition so other scenes keep their existing depth range.
  camera.far = environment === "ember" ? 2000 : 500;
  camera.updateProjectionMatrix();
  resetProgressReporter(sceneRequest.requestId);
  restoreDefaultRendererState();
  applyQualityTier(qualityTier);

  const factory = WORLD_FACTORIES[sceneRequest.environment];
  const builtWorld = await factory({
    renderer,
    camera,
    performers: performerSnapshots,
    requestId: sceneRequest.requestId,
    reducedMotion: sceneRequest.reducedMotion,
    reportProgress(phase, fraction) {
      postProgress(phase, fraction);
    },
  });
  if (isSuperseded(sceneRequest)) {
    builtWorld.dispose();
    return false;
  }
  world = builtWorld;
  activeRuntimeReducedMotion = sceneRequest.reducedMotion;
  if (world.useViewerBaseLighting !== false) {
    world.scene.add(
      createViewerBaseLightingGroup(
        resolveViewerBaseLighting(true, sceneRequest.environment === "ocean")
      )
    );
  }
  sceneEffectsManager = new SceneEffectsManager3D();
  sceneEffectsManager.initialize(world.scene, renderer);
  sceneEffectsRegistration = sceneEffectsManager.registerRig(sceneEffectsFrame);
  imperativeEffects = new WorkerImperativeEffects3D(
    world.scene,
    sceneEffectsManager.getDynamicLightManager()
  );
  const environmentReadyAt = performance.now();
  postProgress("performer", 0);
  performerStage = new WorkerPerformerStage(world.scene);
  await performerStage.setSnapshots(performerSnapshots);
  if (isSuperseded(sceneRequest)) return false;
  const performerReadyAt = performance.now();
  const worldReadyAt = performerReadyAt;
  postProgress("performer", 1);
  applyCurrentEffects();
  postProcessing = createPostProcessingPipeline(sceneRequest.environment);
  const previousRenderTarget = activeRenderer.getRenderTarget();
  const sceneRenderTarget = postProcessing?.sceneRenderTarget ?? null;
  activeRenderer.setRenderTarget(sceneRenderTarget);

  // A later scene can supersede this one at any await below. Always put the
  // renderer back on its canvas before the superseded world's render targets
  // are disposed, otherwise the next scene can draw into a released target.
  try {
    postProgress("compile", 0);
    const compileTargets = await warmWorkerRenderer(
      { renderer, scene: world.scene, camera },
      {
        onProgress(fraction) {
          postProgress("compile", fraction);
        },
        async yieldBetween() {
          await nextWorkerFrame();
        },
        shouldStop: () => isSuperseded(sceneRequest),
      }
    );
    if (isSuperseded(sceneRequest)) return false;
    const compiledAt = performance.now();
    const memoryAfterCompile = rendererMemory();

    postProgress("prime", 0);
    const primeTargets = await primeWorkerRenderer(
      { renderer, scene: world.scene, camera },
      {
        onProgress(fraction) {
          postProgress("prime", fraction);
        },
        async yieldBetween() {
          await nextWorkerFrame();
        },
        shouldStop: () => isSuperseded(sceneRequest),
      }
    );
    if (isSuperseded(sceneRequest)) return false;
    const primedAt = performance.now();
    const memoryAfterPrime = rendererMemory();

    postProgress("finalize", 0);
    await renderer.compileAsync(world.scene, camera);
    if (isSuperseded(sceneRequest)) return false;
    const finalizedAt = performance.now();
    const memoryAfterFinalize = rendererMemory();
    postProgress("finalize", 1);
    activeRenderer.setRenderTarget(previousRenderTarget);

    postProgress("preflight", 0);
    const previousViewport = renderer.getViewport(new Vector4());
    renderer.setViewport(0, 0, 1, 1);
    try {
      world.update(0, finalizedAt / 1000);
      performerStage.update(0);
      applyCurrentEffects();
      renderCurrentFrame(0);
    } finally {
      renderer.setViewport(previousViewport);
    }
    const preflightedAt = performance.now();
    const memoryAfterPreflight = rendererMemory();
    postProgress("preflight", 1);

    postProgress("first-frame", 0);
    preparingFirstFrame = false;
    applyViewport(requestedViewport);
    const firstRenderStartedAt = performance.now();
    world.update(0, compiledAt / 1000);
    performerStage.update(0);
    applyCurrentEffects();
    renderCurrentFrame(0);
    const firstRenderCompletedAt = performance.now();
    const memoryAfterFirstRender = rendererMemory();
    await nextWorkerFrame();
    const presentedAt = performance.now();
    if (
      isSuperseded(sceneRequest) ||
      !renderer ||
      !camera ||
      !world ||
      !performerStage
    ) {
      return false;
    }
    world.update(
      Math.min((presentedAt - compiledAt) / 1000, 0.1),
      presentedAt / 1000
    );
    performerStage.update(Math.min((presentedAt - compiledAt) / 1000, 0.1));
    applyCurrentEffects();
    renderCurrentFrame(Math.min((presentedAt - compiledAt) / 1000, 0.1));
    const firstFrameAt = performance.now();
    frameCount = 1;
    previousFrameAt = firstFrameAt;
    const performerDiagnostics = performerStage.getDiagnostics();
    const projectedCenter = performerDiagnostics.boundsCenter
      ? new Vector3(...performerDiagnostics.boundsCenter)
          .project(camera)
          .toArray()
      : null;

    postProgress("first-frame", 1);
    post({
      type: "first-frame",
      requestId: sceneRequest.requestId,
      environment: world.environment,
      metrics: {
        acceptedAt: sceneRequest.acceptedAt,
        rendererReadyAt: sceneRequest.rendererReadyAt,
        environmentReadyAt,
        performerReadyAt,
        worldReadyAt,
        compiledAt,
        primedAt,
        finalizedAt,
        preflightedAt,
        firstFrameAt,
        rendererMs: sceneRequest.rendererReadyAt - sceneRequest.acceptedAt,
        environmentMs: environmentReadyAt - sceneRequest.rendererReadyAt,
        performerMs: performerReadyAt - environmentReadyAt,
        worldMs: worldReadyAt - sceneRequest.acceptedAt,
        compileMs: compiledAt - worldReadyAt,
        primeMs: primedAt - compiledAt,
        primeTargets,
        finalizeCompileMs: finalizedAt - primedAt,
        preflightMs: preflightedAt - finalizedAt,
        firstRenderMs: firstRenderCompletedAt - firstRenderStartedAt,
        presentationWaitMs: presentedAt - firstRenderCompletedAt,
        confirmationRenderMs: firstFrameAt - presentedAt,
        firstFrameWaitMs: firstFrameAt - preflightedAt,
        firstFrameMs: firstFrameAt - sceneRequest.acceptedAt,
        compileTargets,
        memoryAfterCompile,
        memoryAfterPrime,
        memoryAfterFinalize,
        memoryAfterPreflight,
        memoryAfterFirstRender,
        performers: {
          ...performerDiagnostics,
          projectedCenter,
        },
        warmReuse: false,
        retainedRuntimeBytes: retainedScenes.retainedBytes,
        retainedRuntimeCount: retainedScenes.count,
        cacheCandidateBytes: retainedScenes.lastCandidateBytes,
        cacheSkipReason: retainedScenes.lastSkipReason ?? undefined,
        ...rendererMemory(),
      },
    });
    if (visible) animationFrame = scope.requestAnimationFrame(renderFrame);
    return true;
  } finally {
    if (renderer === activeRenderer) {
      activeRenderer.setRenderTarget(previousRenderTarget);
    }
  }
}

async function presentRetainedScene(
  sceneRequest: SceneRequest
): Promise<boolean> {
  if (!renderer || !camera || !world || !performerStage) return false;
  const activeRenderer = renderer;
  requestId = sceneRequest.requestId;
  environment = sceneRequest.environment;
  camera.far = environment === "ember" ? 2000 : 500;
  camera.updateProjectionMatrix();
  resetProgressReporter(sceneRequest.requestId);
  applyQualityTier(qualityTier);
  await performerStage.setSnapshots(performerSnapshots);
  if (isSuperseded(sceneRequest)) return false;
  applyCurrentEffects();
  const startedAt = performance.now();
  postProgress("assets", 1);
  postProgress("construct", 1);
  postProgress("performer", 1);
  postProgress("compile", 1);
  postProgress("prime", 1);
  postProgress("finalize", 1);
  postProgress("preflight", 0);
  const previousRenderTarget = activeRenderer.getRenderTarget();
  try {
    const previousViewport = renderer.getViewport(new Vector4());
    renderer.setViewport(0, 0, 1, 1);
    try {
      world.update(0, startedAt / 1000);
      performerStage.update(0);
      applyCurrentEffects();
      renderCurrentFrame(0);
    } finally {
      renderer.setViewport(previousViewport);
    }
    const preflightedAt = performance.now();
    postProgress("preflight", 1);
    postProgress("first-frame", 0);
    preparingFirstFrame = false;
    applyViewport(requestedViewport);
    const firstRenderStartedAt = performance.now();
    world.update(0, startedAt / 1000);
    performerStage.update(0);
    applyCurrentEffects();
    renderCurrentFrame(0);
    const firstRenderCompletedAt = performance.now();
    await nextWorkerFrame();
    const presentedAt = performance.now();
    if (isSuperseded(sceneRequest) || !world || !performerStage) return false;
    const deltaSeconds = Math.min((presentedAt - startedAt) / 1000, 0.1);
    world.update(deltaSeconds, presentedAt / 1000);
    performerStage.update(deltaSeconds);
    applyCurrentEffects();
    renderCurrentFrame(deltaSeconds);
    const firstFrameAt = performance.now();
    frameCount = 1;
    previousFrameAt = firstFrameAt;
    const performerDiagnostics = performerStage.getDiagnostics();
    const projectedCenter = performerDiagnostics.boundsCenter
      ? new Vector3(...performerDiagnostics.boundsCenter)
          .project(camera)
          .toArray()
      : null;
    const memory = rendererMemory();
    postProgress("first-frame", 1);
    post({
      type: "first-frame",
      requestId: sceneRequest.requestId,
      environment: world.environment,
      metrics: {
        acceptedAt: sceneRequest.acceptedAt,
        rendererReadyAt: sceneRequest.rendererReadyAt,
        environmentReadyAt: startedAt,
        performerReadyAt: startedAt,
        worldReadyAt: startedAt,
        compiledAt: startedAt,
        primedAt: startedAt,
        finalizedAt: startedAt,
        preflightedAt,
        firstFrameAt,
        rendererMs: sceneRequest.rendererReadyAt - sceneRequest.acceptedAt,
        environmentMs: 0,
        performerMs: 0,
        worldMs: startedAt - sceneRequest.acceptedAt,
        compileMs: 0,
        primeMs: 0,
        primeTargets: 0,
        finalizeCompileMs: 0,
        preflightMs: preflightedAt - startedAt,
        firstRenderMs: firstRenderCompletedAt - firstRenderStartedAt,
        presentationWaitMs: presentedAt - firstRenderCompletedAt,
        confirmationRenderMs: firstFrameAt - presentedAt,
        firstFrameWaitMs: firstFrameAt - preflightedAt,
        firstFrameMs: firstFrameAt - sceneRequest.acceptedAt,
        compileTargets: [],
        memoryAfterCompile: memory,
        memoryAfterPrime: memory,
        memoryAfterFinalize: memory,
        memoryAfterPreflight: memory,
        memoryAfterFirstRender: memory,
        performers: { ...performerDiagnostics, projectedCenter },
        ...memory,
        warmReuse: true,
        retainedRuntimeBytes: retainedScenes.retainedBytes,
        retainedRuntimeCount: retainedScenes.count,
        cacheCandidateBytes: retainedScenes.lastCandidateBytes,
        cacheSkipReason: retainedScenes.lastSkipReason ?? undefined,
      },
    });
    if (visible) animationFrame = scope.requestAnimationFrame(renderFrame);
    return true;
  } finally {
    if (renderer === activeRenderer)
      activeRenderer.setRenderTarget(previousRenderTarget);
  }
}

async function runTransition(): Promise<void> {
  if (transitionRunning || disposed) return;
  transitionRunning = true;
  try {
    while (desiredRequest && !disposed) {
      const sceneRequest = desiredRequest;
      desiredRequest = null;
      if (isSuperseded(sceneRequest)) continue;
      const retainedRuntime = retainedScenes.take(
        sceneRequest.environment,
        sceneRequest.reducedMotion
      );
      if (!retainedRuntime) {
        // Downloads happen while the current scene remains live. The loader
        // cache only stores encoded bytes; construction still belongs to the
        // selected request below.
        await selectWorkerSceneAssets(sceneRequest.environment);
        if (isSuperseded(sceneRequest)) continue;
      }
      if (world && !posterInstalled) {
        await capturePoster(sceneRequest.requestId);
        if (isSuperseded(sceneRequest)) {
          retainedRuntime?.dispose();
          continue;
        }
      }
      const outgoingRuntime = detachSceneRuntime();
      if (retainedRuntime) attachSceneRuntime(retainedRuntime);
      if (outgoingRuntime) {
        if (retainSceneCache) retainedScenes.retain(outgoingRuntime);
        else outgoingRuntime.dispose();
      }
      let prepared = false;
      try {
        prepared = retainedRuntime
          ? await presentRetainedScene(sceneRequest)
          : await prepareScene(sceneRequest);
      } catch (error) {
        post({
          type: "error",
          requestId: sceneRequest.requestId,
          environment: sceneRequest.environment,
          message: errorMessage(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return;
      }
      if (!prepared) {
        disposeSceneRuntime();
        continue;
      }
    }
  } catch (error) {
    const failed = desiredRequest ?? {
      requestId: latestRequestedId,
      environment,
    };
    post({
      type: "error",
      requestId: failed.requestId,
      environment: failed.environment,
      message: errorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    transitionRunning = false;
    if (desiredRequest && !disposed) void runTransition();
  }
}

async function initialize(
  message: Extract<WorkerRendererInMessage, { type: "initialize" }>
): Promise<void> {
  requestId = message.requestId;
  latestRequestedId = message.requestId;
  environment = message.environment;
  qualityTier = message.qualityTier;
  retainSceneCache = message.retainSceneCache ?? true;
  if (!retainSceneCache) retainedScenes.clear();
  performerSnapshots = message.performers;
  externalEffects = message.effects ?? { playing: false, sources: [] };
  disposed = false;
  preparingFirstFrame = true;
  requestedViewport = clampWorkerViewport(message.viewport);
  renderCanvas = message.canvas;
  const acceptedAt = performance.now();
  resetProgressReporter(message.requestId);
  post({
    type: "booting",
    requestId,
    environment,
    acceptedAt,
  });
  postProgress("renderer", 0);

  renderCanvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    retainedScenes.clear();
    disposeSceneRuntime();
    clearWorkerSceneAssets();
    post({ type: "context-lost", requestId, environment });
  });
  renderer = new WebGLRenderer({
    canvas: renderCanvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = resolveWorkerRenderQuality(
    qualityTier,
    environment === "ocean"
  ).enableShadows;
  camera = new PerspectiveCamera(message.camera.fov, 1, 0.05, 500);
  applyViewport(message.viewport);
  applyCamera(message.camera);
  const rendererReadyAt = performance.now();
  postProgress("renderer", 1);

  desiredRequest = {
    requestId: message.requestId,
    environment: message.environment,
    reducedMotion,
    acceptedAt,
    rendererReadyAt,
  };
  await runTransition();
}

function dispose(): void {
  if (disposed) return;
  disposed = true;
  postProgress.cancel();
  for (const resolve of posterWaiters.values()) resolve();
  posterWaiters.clear();
  posterReady.clear();
  desiredRequest = null;
  if (animationFrame) scope.cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  disposeSceneRuntime();
  retainedScenes.clear();
  clearWorkerSceneAssets();
  externalEffects = { playing: false, sources: [] };
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer = null;
  camera = null;
  renderCanvas = null;
  post({ type: "disposed", requestId });
  scope.close();
}

scope.onmessage = (event: MessageEvent<WorkerRendererInMessage>) => {
  const message = event.data;

  switch (message.type) {
    case "initialize":
      reducedMotion = message.reducedMotion ?? false;
      void initialize(message).catch((error) => {
        post({
          type: "error",
          requestId: message.requestId,
          environment: message.environment,
          message: errorMessage(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      });
      break;
    case "switch-environment": {
      reducedMotion = message.reducedMotion ?? false;
      if (!renderer || disposed) break;
      void selectWorkerSceneAssets(message.environment);
      const acceptedAt = performance.now();
      queueScene({
        requestId: message.requestId,
        environment: message.environment,
        reducedMotion,
        acceptedAt,
        rendererReadyAt: acceptedAt,
      });
      break;
    }
    case "prefetch-environment":
      if (!disposed) prefetchWorkerSceneAssets(message.environment);
      break;
    case "poster-ready": {
      const resolve = posterWaiters.get(message.requestId);
      if (resolve) {
        posterWaiters.delete(message.requestId);
        resolve();
      } else {
        posterReady.add(message.requestId);
      }
      break;
    }
    case "live-presented":
      if (message.requestId === requestId) posterInstalled = false;
      break;
    case "resize":
      applyViewport(message.viewport);
      break;
    case "camera":
      applyCamera(message.camera);
      break;
    case "performers":
      performerSnapshots = message.performers;
      world?.setPerformers?.(performerSnapshots);
      void performerStage?.setSnapshots(performerSnapshots).catch((error) => {
        post({
          type: "error",
          requestId,
          environment,
          message: errorMessage(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      });
      break;
    case "effects":
      externalEffects = message.effects;
      applyCurrentEffects();
      break;
    case "quality":
      applyQualityTier(message.qualityTier);
      break;
    case "pointer": {
      if (!world || !environment || message.requestId !== requestId) break;
      if (message.action === "leave") {
        world.pointerLeave?.();
        post({
          type: "interaction",
          requestId,
          environment,
          hover: false,
          chime: null,
        });
        break;
      }
      const hover = world.pointerMove?.(message.ndcX, message.ndcY) ?? false;
      const chime =
        message.action === "down"
          ? (world.pointerDown?.(message.ndcX, message.ndcY) ?? null)
          : null;
      post({
        type: "interaction",
        requestId,
        environment,
        hover,
        chime,
      });
      break;
    }
    case "visibility":
      if (message.visible) requestId = message.requestId;
      visible = message.visible;
      previousFrameAt = performance.now();
      if (!visible && animationFrame) {
        scope.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      } else if (visible && !animationFrame && world && !preparingFirstFrame) {
        animationFrame = scope.requestAnimationFrame(renderFrame);
      }
      break;
    case "dispose":
      dispose();
      break;
  }
};
