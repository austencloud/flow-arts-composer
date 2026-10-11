<script lang="ts">
  import { getEffectConfigMapper } from "#lib/features/video/video-trails/get-effect-config-mapper.js";
  import { getVideoTipAdapter } from "#lib/features/video/video-trails/get-video-tip-adapter.js";
  import { getVideoTrailsExporter } from "#lib/features/video/video-trails/get-video-trails-exporter.js";
  import { getLedThresholdDetector } from "#lib/features/video/video-trails/get-led-threshold-detector.js";
  import { getColorEndpointDetector } from "#lib/features/video/video-trails/get-color-endpoint-detector.js";
  import { getDetectionCorrector } from "#lib/features/video/video-trails/get-detection-corrector.js";
  import { onMount, onDestroy } from "svelte";
  import { getVideoTrailsContext } from "../context/video-trails-context";
  import { DETECTOR_REGISTRY } from "../domain/types";
  import type { ExportConfig, ExportState } from "../domain/types";
  import type { IEndpointDetector } from "../services/IEndpointDetector";
  import type * as EffectConfigMapperModule from "../services/effect-config-mapper";
  import type { VideoTipAdapter } from "../services/video-tip-adapter";
  import type { TrailPoint } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import type { FireFrameInput } from "#lib/shared/animation-engine/domain/types/fire-types.js";
  import type { LedFrameInput } from "#lib/shared/animation-engine/domain/types/led-types.js";
  import { WebGLFireRenderer } from "#lib/shared/animation-engine/services/fire/web-gl-fire-renderer.js";
  import { WebGLLedRenderer } from "#lib/shared/animation-engine/services/led/web-gl-led-renderer.js";
  import { CharcoalSparkRenderer } from "#lib/shared/animation-engine/services/charcoal/charcoal-spark-renderer.js";
  import { Canvas2DTrailRenderer } from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-trail-renderer.js";
  import VideoSourcePanel from "../components/VideoSourcePanel.svelte";
  import EffectCanvasStack from "../components/EffectCanvasStack.svelte";
  import PlaybackControls from "../components/PlaybackControls.svelte";
  import EffectsControlPanel from "../components/EffectsControlPanel.svelte";
  import ExportPanel from "../components/ExportPanel.svelte";

  const { state: trailsState } = getVideoTrailsContext();

  const configMapper = getEffectConfigMapper() as typeof EffectConfigMapperModule;
  const tipAdapter = getVideoTipAdapter() as VideoTipAdapter;
  const corrector = getDetectionCorrector();

  let canvasStack: EffectCanvasStack | undefined = $state(undefined);

  let videoEl: HTMLVideoElement | undefined = $state(undefined);
  let offscreenCanvas: HTMLCanvasElement | null = null;
  let offscreenCtx: CanvasRenderingContext2D | null = null;
  let animFrameId: number | null = null;
  let canvasWidth = $state(640);
  let canvasHeight = $state(360);

  let detectionFrameCounter = 0;
  let lastProcessedFrame = -1;
  const DETECTION_EVERY_N_FRAMES = 3;

  let fireRenderer: WebGLFireRenderer | null = null;
  let ledRenderer: WebGLLedRenderer | null = null;
  let charcoalRenderer: CharcoalSparkRenderer | null = null;
  const trailRenderer = new Canvas2DTrailRenderer();

  let leftTrailPoints: TrailPoint[] = [];
  let rightTrailPoints: TrailPoint[] = [];

  const VIDEO_PERSIST_KEY = "video-trails-last-video";

  async function persistVideoBlob(file: File): Promise<void> {
    try {
      const db = await openPersistDb();
      const tx = db.transaction("blobs", "readwrite");
      tx.objectStore("blobs").put({ key: VIDEO_PERSIST_KEY, blob: file, name: file.name });
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch { }
  }

  async function loadPersistedVideo(): Promise<{ blob: Blob; name: string } | null> {
    try {
      const db = await openPersistDb();
      const tx = db.transaction("blobs", "readonly");
      const request = tx.objectStore("blobs").get(VIDEO_PERSIST_KEY);
      return new Promise((resolve) => {
        request.onsuccess = () => {
          const result = request.result;
          if (result?.blob) resolve({ blob: result.blob, name: result.name ?? "video" });
          else resolve(null);
        };
        request.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  function openPersistDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("tka-video-trails-persist", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("blobs")) {
          db.createObjectStore("blobs", { keyPath: "key" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  onMount(async () => {
    const persisted = await loadPersistedVideo();
    if (persisted && !trailsState.source) {
      const file = new File([persisted.blob], persisted.name, { type: persisted.blob.type });
      trailsState.loadVideo(file);
    }
  });

  $effect(() => {
    const url = trailsState.source?.url;
    if (!url || !videoEl) return;
    if (videoEl.src === url) return;
    videoEl.src = url;
    videoEl.load();
  });

  function handleVideoMetadata() {
    if (!videoEl) return;
    resetTracking();
    canvasWidth = videoEl.videoWidth;
    canvasHeight = videoEl.videoHeight;
    trailsState.updateSourceMetadata({
      duration: videoEl.duration,
      width: videoEl.videoWidth,
      height: videoEl.videoHeight,
    });

    offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = canvasWidth;
    offscreenCanvas.height = canvasHeight;
    offscreenCtx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
  }

  function handleVideoCanPlay() {
    canvasStack?.drawVideoFrame(videoEl!);
    if (trailsState.isPlaying && videoEl?.paused) {
      videoEl.play().catch(() => {});
    }
  }

  const originalLoadVideo = trailsState.loadVideo.bind(trailsState);
  trailsState.loadVideo = (file: File) => {
    originalLoadVideo(file);
    persistVideoBlob(file);
  };

  $effect(() => {
    if (!videoEl) return;
    if (trailsState.isPlaying) {
      videoEl.playbackRate = trailsState.playbackSpeed;
      if (videoEl.readyState >= 3) {
        videoEl.play().catch(() => {});
      }
      startDetectionLoop();
    } else {
      videoEl.pause();
      stopDetectionLoop();
    }
  });

  $effect(() => {
    if (!trailsState.isPlaying && videoEl && trailsState.source && videoEl.readyState >= 2) {
      const time = trailsState.currentFrame / trailsState.source.fps;
      if (Math.abs(videoEl.currentTime - time) > 0.01) {
        videoEl.currentTime = time;
      }
    }
  });

  $effect(() => {
    const enabled = trailsState.effectConfig.fire.enabled;
    if (enabled && !fireRenderer && canvasStack) {
      const rc = canvasStack.getRendererContainer();
      if (rc) {
        const r = new WebGLFireRenderer();
        if (r.initialize(rc, canvasWidth, canvasHeight)) fireRenderer = r;
      }
    } else if (!enabled && fireRenderer) {
      fireRenderer.dispose();
      fireRenderer = null;
    }
  });

  $effect(() => {
    const enabled = trailsState.effectConfig.charcoal.enabled;
    if (enabled && !charcoalRenderer && canvasStack) {
      const rc = canvasStack.getRendererContainer();
      if (rc) {
        const r = new CharcoalSparkRenderer();
        if (r.initialize(rc, canvasWidth, canvasHeight)) charcoalRenderer = r;
      }
    } else if (!enabled && charcoalRenderer) {
      charcoalRenderer.dispose();
      charcoalRenderer = null;
    }
  });

  $effect(() => {
    const enabled = trailsState.effectConfig.led.enabled;
    if (enabled && !ledRenderer && canvasStack) {
      const rc = canvasStack.getRendererContainer();
      if (rc) {
        requestAnimationFrame(() => {
          if (!enabled || ledRenderer) return;
          const r = new WebGLLedRenderer();
          if (r.initialize(rc, canvasWidth, canvasHeight)) ledRenderer = r;
        });
      }
    } else if (!enabled && ledRenderer) {
      ledRenderer.dispose();
      ledRenderer = null;
    }
  });

  function getDetector(): IEndpointDetector {
    const reg = DETECTOR_REGISTRY.find((r) => r.id === trailsState.activeDetectorId);
    const key = reg?.containerKey ?? "ledThresholdDetector";
    const detectorMap: Record<string, () => IEndpointDetector> = {
      ledThresholdDetector: getLedThresholdDetector,
      colorEndpointDetector: getColorEndpointDetector,
    };
    return (detectorMap[key] ?? getLedThresholdDetector)();
  }

  function resetTracking(): void {
    tipAdapter.reset();
    lastProcessedFrame = -1;
    leftTrailPoints = [];
    rightTrailPoints = [];
    const canvas = canvasStack?.getTrailCanvas();
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function processCurrentFrame(): void {
    if (!videoEl || videoEl.readyState < 2) return;

    canvasStack?.drawVideoFrame(videoEl);

    const frameIndex = Math.round(videoEl.currentTime * (trailsState.source?.fps ?? 30));
    if (frameIndex !== trailsState.currentFrame) {
      trailsState.setCurrentFrame(frameIndex);
    }

    detectionFrameCounter++;
    if (detectionFrameCounter % DETECTION_EVERY_N_FRAMES !== 0) return;

    if (frameIndex === lastProcessedFrame) return;
    if (lastProcessedFrame >= 0 &&
      (frameIndex < lastProcessedFrame || frameIndex - lastProcessedFrame > 15)) {
      resetTracking();
    }
    lastProcessedFrame = frameIndex;

    if (!offscreenCtx || !offscreenCanvas) return;

    offscreenCtx.drawImage(videoEl, 0, 0, canvasWidth, canvasHeight);
    const frameData = offscreenCtx.getImageData(0, 0, canvasWidth, canvasHeight);
    const detector = getDetector();
    const tracked = tipAdapter.stabilizeEndpoints(
      detector.detect(frameData, trailsState.detectionConfig),
      frameIndex,
      Math.max(canvasWidth, canvasHeight),
    );
    trailsState.storeFrameDetection(frameIndex, tracked.endpoints);
    const endpoints = corrector.applyCorrections(
      frameIndex, tracked.endpoints, trailsState.corrections,
    );
    if (trailsState.corrections[frameIndex]?.length) {
      tipAdapter.reconcileCorrections(endpoints, frameIndex);
    }

    const currentTime = performance.now();
    const effects = trailsState.effectConfig;

    const fireTips = tipAdapter.mapToFireTips(endpoints, Math.max(canvasWidth, canvasHeight), currentTime);
    const trailPoints = tipAdapter.mapToTrailPoints(endpoints, currentTime);

    if (effects.trails.enabled) {
      const trailSettings = configMapper.toTrailSettings(effects.trails);
      const maxPoints = trailSettings.maxPoints;

      for (const key of tracked.breaks) {
        const [propIndex, tipIndex] = key.split("-").map(Number);
        if (propIndex === 0) {
          leftTrailPoints = leftTrailPoints.filter((point) => point.tipIndex !== tipIndex);
        } else {
          rightTrailPoints = rightTrailPoints.filter((point) => point.tipIndex !== tipIndex);
        }
      }

      for (const pt of trailPoints) {
        if (pt.propIndex === 0) {
          leftTrailPoints.push(pt);
          if (leftTrailPoints.length > maxPoints) leftTrailPoints = leftTrailPoints.slice(-maxPoints);
        } else {
          rightTrailPoints.push(pt);
          if (rightTrailPoints.length > maxPoints) rightTrailPoints = rightTrailPoints.slice(-maxPoints);
        }
      }

      const trailCanvas = canvasStack?.getTrailCanvas();
      if (trailCanvas) {
        const ctx = trailCanvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvasWidth, canvasHeight);
          trailRenderer.renderTrails(
            ctx, leftTrailPoints, rightTrailPoints, trailSettings,
            currentTime, leftTrailPoints.length > 0, rightTrailPoints.length > 0,
            Math.max(canvasWidth, canvasHeight),
          );
        }
      }
    }

    if (effects.fire.enabled && fireRenderer?.isInitialized()) {
      fireRenderer.renderFire(
        { tips: fireTips, currentTime, canvasWidth, canvasHeight, darkMode: true } as FireFrameInput,
        configMapper.toFireConfig(effects.fire),
      );
    }

    if (effects.charcoal.enabled && charcoalRenderer?.isInitialized()) {
      charcoalRenderer.renderCharcoal(
        { tips: fireTips, currentTime, canvasWidth, canvasHeight, darkMode: true } as FireFrameInput,
        { intensity: 0.8, flameHeight: 0.5, velocityReactive: true, quality: 3, colorBlend: 0 },
      );
    }

    if (effects.led.enabled && ledRenderer?.isInitialized()) {
      const ledConfig = configMapper.toLedConfig(effects.led);
      const leds = tipAdapter.mapToLedSamples(endpoints, currentTime, ledConfig);
      ledRenderer.renderLeds(
        { leds, currentTime, canvasWidth, canvasHeight } as LedFrameInput,
        ledConfig,
      );
    }
  }

  function startDetectionLoop(): void {
    if (animFrameId !== null) return;
    function loop() {
      processCurrentFrame();
      animFrameId = requestAnimationFrame(loop);
    }
    animFrameId = requestAnimationFrame(loop);
  }

  function stopDetectionLoop(): void {
    if (animFrameId !== null) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  async function handleExport(config: ExportConfig): Promise<void> {
    if (!videoEl || !canvasStack) return;
    const exporter = getVideoTrailsExporter();
    trailsState.setExportState({ phase: "preparing" });
    try {
      const canvases = canvasStack.getAllCanvases();
      const blob = await exporter.export(videoEl, canvases, config, (s: ExportState) => trailsState.setExportState(s));
      trailsState.setExportState({ phase: "complete", blob });
    } catch (err) {
      trailsState.setExportState({ phase: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  onDestroy(() => {
    stopDetectionLoop();
    tipAdapter.reset();
    fireRenderer?.dispose();
    ledRenderer?.dispose();
    charcoalRenderer?.dispose();
    fireRenderer = null;
    ledRenderer = null;
    charcoalRenderer = null;
  });
</script>

<video
  bind:this={videoEl}
  class="hidden-video"
  muted
  playsinline
  crossorigin="anonymous"
  preload="auto"
  onloadedmetadata={handleVideoMetadata}
  oncanplay={handleVideoCanPlay}
></video>

<div class="workspace">
  <div class="main-area">
    {#if !trailsState.source}
      <VideoSourcePanel />
    {:else}
      <div class="canvas-area">
        <EffectCanvasStack
          bind:this={canvasStack}
          videoElement={videoEl ?? null}
          width={canvasWidth}
          height={canvasHeight}
        />
      </div>
      <PlaybackControls />
    {/if}
  </div>

  <aside class="sidebar">
    {#if trailsState.source}
      <VideoSourcePanel />
    {/if}
    <EffectsControlPanel />
    <ExportPanel onExport={handleExport} />
  </aside>
</div>

<style>
  .hidden-video {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
    z-index: -1;
  }

  .workspace {
    display: flex;
    gap: 16px;
    padding: 16px;
    height: 100%;
    min-height: 0;
    container-type: inline-size;
  }

  .main-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .canvas-area {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
  }

  .sidebar {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
  }

  @container (max-width: 768px) {
    .workspace {
      flex-direction: column;
    }
    .sidebar {
      width: 100%;
    }
  }
</style>
