import type { VideoTrailsRepository } from "../services/video-trails-repository";
import type * as DetectionCorrectorModule from "../services/detection-corrector";
import type { VideoTipAdapter } from "../services/video-tip-adapter";
import type {
  VideoTrailsView,
  VideoSource,
  DetectedEndpoint,
  DetectionConfig,
  EndpointCorrection,
  EffectConfig,
  ExportState,
  VideoTrailsProject,
} from "../domain/types";
import { DEFAULT_DETECTION_CONFIG, DEFAULT_EFFECT_CONFIG } from "../domain/types";

export function createVideoTrailsState(
  repository: VideoTrailsRepository,
  corrector: typeof DetectionCorrectorModule,
  tipAdapter: VideoTipAdapter,
) {
  const ACTIVE_VIEW_KEY = "video-trails-active-view";
  const storedView = (typeof sessionStorage !== "undefined"
    ? sessionStorage.getItem(ACTIVE_VIEW_KEY) as VideoTrailsView | null
    : null) ?? "workspace";
  let activeView = $state<VideoTrailsView>(storedView);

  const SESSION_PREFIX = "video-trails-";

  function sessionSave(key: string, value: unknown): void {
    try { sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(value)); } catch { /* ignore */ }
  }

  function sessionLoad<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(SESSION_PREFIX + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  }

  let source = $state<VideoSource | null>(null);
  let sourceMode = $state<"file" | "camera" | "sequence">("file");

  let isPlaying = $state(false);
  let currentFrame = $state(sessionLoad<number>("currentFrame") ?? 0);
  let playbackSpeed = $state(1);
  let totalFrames = $state(0);

  let activeDetectorId = $state("led-threshold-v1");
  let detectionConfig = $state<DetectionConfig>({ ...DEFAULT_DETECTION_CONFIG });
  let frameDetections = $state<Record<number, DetectedEndpoint[]>>(
    sessionLoad<Record<number, DetectedEndpoint[]>>("frameDetections") ?? {},
  );
  let isDetecting = $state(false);

  let corrections = $state<Record<number, EndpointCorrection[]>>(
    sessionLoad<Record<number, EndpointCorrection[]>>("corrections") ?? {},
  );
  const correctionCount = $derived(Object.keys(corrections).length);

  let effectConfig = $state<EffectConfig>({ ...DEFAULT_EFFECT_CONFIG });

  let currentProject = $state<VideoTrailsProject | null>(null);
  let projects = $state<VideoTrailsProject[]>([]);
  let isDirty = $state(false);

  let exportState = $state<ExportState>({ phase: "idle" });

  const currentEndpoints = $derived.by(() => {
    const detected = frameDetections[currentFrame] ?? [];
    return corrector.applyCorrections(currentFrame, detected, corrections);
  });

  const lowConfidenceFrames = $derived.by(() => {
    const frames: number[] = [];
    for (const [frame, endpoints] of Object.entries(frameDetections)) {
      if (endpoints.some((ep) => ep.confidence < 0.6)) frames.push(Number(frame));
    }
    return frames;
  });

  function loadVideo(file: File): void {
    const url = URL.createObjectURL(file);
    source = {
      type: "file",
      url,
      originalFileName: file.name,
      duration: 0,
      resolution: { width: 0, height: 0 },
      frameCount: 0,
      fps: 30,
    };
    sourceMode = "file";
    frameDetections = {};
    corrections = {};
    tipAdapter.reset();
    isDirty = true;
  }

  function updateSourceMetadata(metadata: { duration: number; width: number; height: number; fps?: number }): void {
    if (!source) return;
    source = {
      ...source,
      duration: metadata.duration,
      resolution: { width: metadata.width, height: metadata.height },
      fps: metadata.fps ?? 30,
      frameCount: Math.ceil(metadata.duration * (metadata.fps ?? 30)),
    };
    totalFrames = source.frameCount;
  }

  function storeFrameDetection(frame: number, endpoints: DetectedEndpoint[]): void {
    frameDetections = { ...frameDetections, [frame]: endpoints };
    isDirty = true;
    sessionSave("frameDetections", frameDetections);
  }

  function correctEndpoint(frame: number, correction: EndpointCorrection): void {
    const existing = corrections[frame] ?? [];
    const idx = existing.findIndex(
      (c) => c.propIndex === correction.propIndex && c.tipIndex === correction.tipIndex,
    );
    const updated = [...existing];
    if (idx >= 0) updated[idx] = correction;
    else updated.push(correction);
    corrections = { ...corrections, [frame]: updated };
    isDirty = true;
    sessionSave("corrections", corrections);
  }

  function removeCorrection(frame: number, propIndex: 0 | 1, tipIndex: number): void {
    const existing = corrections[frame] ?? [];
    const remaining = existing.filter(
      (c) => c.propIndex !== propIndex || c.tipIndex !== tipIndex,
    );
    if (remaining.length === existing.length) return;
    const updated = { ...corrections };
    if (remaining.length > 0) updated[frame] = remaining;
    else delete updated[frame];
    corrections = updated;
    isDirty = true;
    sessionSave("corrections", corrections);
  }

  function markOccluded(frame: number, propIndex: 0 | 1, tipIndex: number): void {
    correctEndpoint(frame, {
      propIndex,
      tipIndex,
      detected: null,
      corrected: null,
      status: "occluded",
    });
  }

  function interpolateGap(startFrame: number, endFrame: number, propIndex: 0 | 1, tipIndex: number): void {
    const startEndpoints = frameDetections[startFrame - 1];
    const endEndpoints = frameDetections[endFrame + 1];
    const startEp = startEndpoints?.find((e) => e.propIndex === propIndex && e.tipIndex === tipIndex);
    const endEp = endEndpoints?.find((e) => e.propIndex === propIndex && e.tipIndex === tipIndex);
    if (!startEp || !endEp) return;

    const span = endFrame - startFrame + 1;
    for (let f = startFrame; f <= endFrame; f++) {
      const t = span === 1 ? 0.5 : (f - startFrame) / (span - 1);
      correctEndpoint(f, {
        propIndex,
        tipIndex,
        detected: null,
        corrected: {
          x: startEp.x + (endEp.x - startEp.x) * t,
          y: startEp.y + (endEp.y - startEp.y) * t,
        },
        status: "interpolated",
      });
    }
  }

  async function saveProject(): Promise<void> {
    if (!currentProject) return;
    currentProject = {
      ...currentProject,
      updatedAt: new Date().toISOString(),
      detection: {
        ...currentProject.detection,
        results: frameDetections,
        corrections,
      },
      effects: effectConfig,
    };
    await repository.save(currentProject);
    isDirty = false;
  }

  async function loadProject(id: string): Promise<void> {
    const project = await repository.load(id);
    if (!project) return;
    currentProject = project;
    frameDetections = project.detection.results;
    corrections = project.detection.corrections;
    effectConfig = project.effects;
    activeDetectorId = project.detection.detectorId;
    detectionConfig = project.detection.config;
    isDirty = false;
  }

  async function loadProjectList(): Promise<void> {
    projects = await repository.list();
  }

  async function deleteProject(id: string): Promise<void> {
    await repository.delete(id);
    if (currentProject?.id === id) currentProject = null;
    await loadProjectList();
  }

  function destroy(): void {
    if (source?.url) URL.revokeObjectURL(source.url);
    tipAdapter.reset();
  }

  return {
    get activeView() { return activeView; },
    set activeView(v: VideoTrailsView) { activeView = v; sessionStorage.setItem(ACTIVE_VIEW_KEY, v); },

    get source() { return source; },
    get sourceMode() { return sourceMode; },

    get isPlaying() { return isPlaying; },
    get currentFrame() { return currentFrame; },
    get totalFrames() { return totalFrames; },
    get playbackSpeed() { return playbackSpeed; },

    get activeDetectorId() { return activeDetectorId; },
    get detectionConfig() { return detectionConfig; },
    get frameDetections() { return frameDetections; },
    get isDetecting() { return isDetecting; },
    get currentEndpoints() { return currentEndpoints; },

    get corrections() { return corrections; },
    get correctionCount() { return correctionCount; },
    get lowConfidenceFrames() { return lowConfidenceFrames; },

    get effectConfig() { return effectConfig; },

    get currentProject() { return currentProject; },
    set currentProject(p: VideoTrailsProject | null) { currentProject = p; },
    get projects() { return projects; },
    get isDirty() { return isDirty; },

    get exportState() { return exportState; },

    loadVideo,
    updateSourceMetadata,
    storeFrameDetection,
    correctEndpoint,
    removeCorrection,
    markOccluded,
    interpolateGap,
    saveProject,
    loadProject,
    loadProjectList,
    deleteProject,
    destroy,

    setDetectionConfig: (config: Partial<DetectionConfig>) => {
      detectionConfig = { ...detectionConfig, ...config };
      isDirty = true;
    },
    setEffectConfig: (config: Partial<EffectConfig>) => {
      effectConfig = { ...effectConfig, ...config };
      isDirty = true;
    },
    setActiveDetector: (id: string) => { activeDetectorId = id; },
    setCurrentFrame: (frame: number) => { currentFrame = frame; sessionSave("currentFrame", frame); },
    setPlaybackSpeed: (speed: number) => { playbackSpeed = speed; },
    togglePlayback: () => { isPlaying = !isPlaying; },
    setIsDetecting: (v: boolean) => { isDetecting = v; },
    setExportState: (state: ExportState) => { exportState = state; },
  };
}

export type VideoTrailsState = ReturnType<typeof createVideoTrailsState>;
